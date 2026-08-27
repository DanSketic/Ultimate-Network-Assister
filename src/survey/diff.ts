/*
 * What changed between two surveys.
 *
 * The application already kept a history and never looked at it, which left
 * the most natural question about a measured estate unanswerable: not "what is
 * there" but "what moved since last time". That is the question a person
 * cannot answer by looking, and a machine can — a port that quietly dropped to
 * a tenth of its speed, a guest that stopped being backed up, a rule that
 * changed while nobody was watching.
 *
 * The same rule applies here as everywhere else: a difference is only reported
 * when both surveys measured the thing. Something absent from the older survey
 * is not "new" if that survey never looked — so a source missing from either
 * side is stated as unknown rather than counted as a change.
 */

import type { Dict } from '@/i18n';
import type { ProxmoxSnapshot, SurveySnapshot, UnifiSnapshot, UnifiWan } from './model';

/** How much attention a change deserves. */
export type ChangeTone = 'bad' | 'warn' | 'good' | 'info';

export interface Change {
  tone: ChangeTone;
  /** What it happened to, e.g. a device or a store. */
  where: string;
  what: string;
  /** The measurement behind it, when there are two values to show. */
  detail?: string;
}

export interface SurveyDiff {
  /** Null when there is nothing to compare against. */
  from?: { id: string; at: string };
  to: { id: string; at: string };
  changes: Change[];
  /** Sources one survey has and the other does not, so gaps are not read as changes. */
  notCompared: string[];
}

const RANK: Record<ChangeTone, number> = { bad: 0, warn: 1, good: 2, info: 3 };

const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);

const bytes = (n: number) => {
  const tb = n / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  return `${Math.round(n / 1024 ** 3)} GB`;
};

/** Indexes a list by a key, keeping the first of any duplicates. */
function by<T>(list: T[], key: (item: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of list) if (!out.has(key(item))) out.set(key(item), item);
  return out;
}

/* -------------------------------------------------------------------- UniFi */

function unifiChanges(before: UnifiSnapshot, after: UnifiSnapshot, t: Dict): Change[] {
  const d = t.diff;
  const out: Change[] = [];

  const was = by(before.devices, (x) => x.mac);
  const now = by(after.devices, (x) => x.mac);

  for (const [mac, device] of now) {
    const old = was.get(mac);
    const name = device.name || device.model || mac;

    if (!old) {
      out.push({ tone: 'info', where: name, what: d.deviceAppeared, detail: device.ip });
      continue;
    }

    if (old.state === 1 && device.state !== 1) {
      out.push({ tone: 'bad', where: name, what: d.deviceLost, detail: device.ip || mac });
    } else if (old.state !== 1 && device.state === 1) {
      out.push({ tone: 'good', where: name, what: d.deviceBack, detail: device.ip || mac });
    }

    if (old.version && device.version && old.version !== device.version) {
      out.push({
        tone: 'info',
        where: name,
        what: d.firmwareChanged,
        detail: `${old.version} → ${device.version}`,
      });
    }

    if (old.ip && device.ip && old.ip !== device.ip) {
      out.push({ tone: 'warn', where: name, what: d.addressChanged, detail: `${old.ip} → ${device.ip}` });
    }

    // Ports are the part nobody watches, and the part that degrades quietly.
    const oldPorts = by(old.ports, (p) => String(p.idx));
    for (const port of device.ports) {
      const previous = oldPorts.get(String(port.idx));
      if (!previous) continue;
      const at = `${name} · ${d.port} ${port.idx}`;

      if (previous.up && !port.up) {
        out.push({ tone: 'warn', where: at, what: d.portDown, detail: previous.neighbourName || undefined });
      } else if (!previous.up && port.up) {
        out.push({ tone: 'good', where: at, what: d.portUp, detail: port.neighbourName || undefined });
      } else if (port.up && previous.speed > 0 && port.speed > 0 && previous.speed !== port.speed) {
        out.push({
          tone: port.speed < previous.speed ? 'bad' : 'good',
          where: at,
          what: port.speed < previous.speed ? d.portSlower : d.portFaster,
          detail: `${previous.speed} → ${port.speed} Mb/s`,
        });
      }

      const wasNeighbour = previous.neighbourName || previous.neighbourMac;
      const isNeighbour = port.neighbourName || port.neighbourMac;
      if (wasNeighbour && isNeighbour && wasNeighbour !== isNeighbour) {
        out.push({
          tone: 'warn',
          where: at,
          what: d.neighbourChanged,
          detail: `${wasNeighbour} → ${isNeighbour}`,
        });
      }
    }
  }

  for (const [mac, device] of was) {
    if (!now.has(mac)) {
      out.push({ tone: 'warn', where: device.name || device.model || mac, what: d.deviceGone });
    }
  }

  /* Configuration that changed while nobody was watching. */

  const wasNet = by(before.networks, (n) => n.id);
  for (const net of after.networks) {
    const old = wasNet.get(net.id);
    if (!old) {
      out.push({ tone: 'info', where: net.name, what: d.networkAdded, detail: net.subnet || undefined });
    } else if (old.vlan !== net.vlan) {
      out.push({
        tone: 'warn',
        where: net.name,
        what: d.vlanChanged,
        detail: `${old.vlan ?? '—'} → ${net.vlan ?? '—'}`,
      });
    }
  }
  const nowNet = by(after.networks, (n) => n.id);
  for (const net of before.networks) {
    if (!nowNet.has(net.id)) out.push({ tone: 'warn', where: net.name, what: d.networkRemoved });
  }

  const wasWlan = by(before.wlans, (w) => w.id);
  for (const wlan of after.wlans) {
    const old = wasWlan.get(wlan.id);
    if (!old) {
      out.push({ tone: 'info', where: wlan.name, what: d.ssidAdded });
      continue;
    }
    if (old.security !== wlan.security) {
      out.push({
        tone: 'warn',
        where: wlan.name,
        what: d.securityChanged,
        detail: `${old.security} → ${wlan.security}`,
      });
    }
    if (old.enabled !== wlan.enabled) {
      out.push({ tone: wlan.enabled ? 'info' : 'warn', where: wlan.name, what: wlan.enabled ? d.ssidOn : d.ssidOff });
    }
  }
  const nowWlan = by(after.wlans, (w) => w.id);
  for (const wlan of before.wlans) {
    if (!nowWlan.has(wlan.id)) out.push({ tone: 'warn', where: wlan.name, what: d.ssidRemoved });
  }

  const wasRule = by(before.firewallRules, (r) => r.id);
  for (const rule of after.firewallRules) {
    const old = wasRule.get(rule.id);
    if (!old) {
      out.push({ tone: 'warn', where: rule.name || rule.id, what: d.ruleAdded, detail: rule.action });
    } else if (old.enabled !== rule.enabled) {
      out.push({
        tone: 'warn',
        where: rule.name || rule.id,
        what: rule.enabled ? d.ruleOn : d.ruleOff,
      });
    } else if (old.action !== rule.action) {
      out.push({
        tone: 'warn',
        where: rule.name || rule.id,
        what: d.ruleActionChanged,
        detail: `${old.action} → ${rule.action}`,
      });
    }
  }
  const nowRule = by(after.firewallRules, (r) => r.id);
  for (const rule of before.firewallRules) {
    if (!nowRule.has(rule.id)) {
      out.push({ tone: 'warn', where: rule.name || rule.id, what: d.ruleRemoved });
    }
  }

  return out;
}

/* ---------------------------------------------------------------------- WAN */

/**
 * How far a speedtest has to move before it means anything.
 *
 * Two runs of the same test on the same line differ by a good deal on their
 * own — the far end is shared, and the test competes with whatever else the
 * household is doing. A threshold this wide reports the line that halved and
 * stays quiet about the ordinary scatter, which is the only way the figure is
 * worth showing at all.
 */
const SPEEDTEST_STEP = 25;

/** Percent difference between two throughput figures. */
const drift = (from: number, to: number) => (from > 0 ? Math.round(((to - from) / from) * 100) : 0);

/**
 * The link a change on which nobody gets told about.
 *
 * A public address changes on its own, at the provider's convenience: a lease
 * expires, a session reconnects, a CGNAT pool moves. Nothing inside the estate
 * causes it and nothing inside the estate announces it — the first sign is
 * usually that something which pointed at the old address stopped working. It
 * is exactly the kind of fact a survey history exists to catch.
 *
 * Identity is the interface, not the address: the address changing is the
 * change being looked for, so keying on it would report every move as one link
 * disappearing and another appearing.
 */
function wanChanges(before: UnifiWan[], after: UnifiWan[], t: Dict): Change[] {
  const d = t.diff;
  const out: Change[] = [];
  const key = (w: UnifiWan) => w.ifname || w.name || 'wan';

  const was = by(before, key);
  const now = by(after, key);

  for (const [id, wan] of now) {
    const old = was.get(id);
    const where = wan.name || wan.ifname || id;

    if (!old) {
      out.push({ tone: 'info', where, what: d.wanAppeared, detail: wan.ip || undefined });
      continue;
    }

    if (old.up && !wan.up) {
      out.push({ tone: 'bad', where, what: d.wanLost, detail: old.ip || undefined });
    } else if (!old.up && wan.up) {
      out.push({ tone: 'good', where, what: d.wanBack, detail: wan.ip || undefined });
    }

    if (old.ip && wan.ip && old.ip !== wan.ip) {
      out.push({ tone: 'warn', where, what: d.wanAddressChanged, detail: `${old.ip} → ${wan.ip}` });
    }

    if (old.isp && wan.isp && old.isp !== wan.isp) {
      out.push({ tone: 'warn', where, what: d.wanIspChanged, detail: `${old.isp} → ${wan.isp}` });
    }

    // How the address is obtained. A link that was static and is now DHCP is a
    // different arrangement with the provider, not a reading that drifted.
    if (old.kind && wan.kind && old.kind !== wan.kind) {
      out.push({
        tone: 'warn',
        where,
        what: d.wanKindChanged,
        detail: `${old.kind.toUpperCase()} → ${wan.kind.toUpperCase()}`,
      });
    }

    if (old.gatewayIp && wan.gatewayIp && old.gatewayIp !== wan.gatewayIp) {
      out.push({
        tone: 'info',
        where,
        what: d.wanGatewayChanged,
        detail: `${old.gatewayIp} → ${wan.gatewayIp}`,
      });
    }

    /*
     * The resolvers the estate was handed.
     *
     * Worth a line because everything resolves through them and nothing in the
     * interface shows them changing: a provider swapping its resolvers, or a
     * reconnect that lost a hand-set pair, both look like nothing at all until
     * a name stops resolving.
     */
    const wasDns = old.nameservers.join(', ');
    const nowDns = wan.nameservers.join(', ');
    if (wasDns && nowDns && wasDns !== nowDns) {
      out.push({ tone: 'info', where, what: d.wanDnsChanged, detail: `${wasDns} → ${nowDns}` });
    }

    if (old.speed > 0 && wan.speed > 0 && old.speed !== wan.speed) {
      out.push({
        tone: wan.speed < old.speed ? 'bad' : 'good',
        where,
        what: wan.speed < old.speed ? d.wanSlower : d.wanFaster,
        detail: `${old.speed} → ${wan.speed} Mb/s`,
      });
    }

    // Only where both surveys have a figure: -1 is "never tested", and
    // comparing against it would invent a collapse out of a first measurement.
    if (old.xputDown > 0 && wan.xputDown > 0) {
      const moved = drift(old.xputDown, wan.xputDown);
      if (Math.abs(moved) >= SPEEDTEST_STEP) {
        out.push({
          tone: moved < 0 ? 'warn' : 'good',
          where,
          what: moved < 0 ? d.wanThroughputDown : d.wanThroughputUp,
          detail: `${Math.round(old.xputDown)} → ${Math.round(wan.xputDown)} Mb/s`,
        });
      }
    }
  }

  for (const [id, wan] of was) {
    if (!now.has(id)) {
      out.push({ tone: 'warn', where: wan.name || wan.ifname || id, what: d.wanGone });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ Proxmox */

/** A store has to move by this much before it is worth mentioning. */
const STORAGE_STEP = 5;

function proxmoxChanges(before: ProxmoxSnapshot, after: ProxmoxSnapshot, t: Dict): Change[] {
  const d = t.diff;
  const out: Change[] = [];

  const wasGuest = by(before.guests, (g) => String(g.vmid));
  for (const guest of after.guests) {
    const old = wasGuest.get(String(guest.vmid));
    const name = guest.name || String(guest.vmid);
    if (!old) {
      out.push({ tone: 'info', where: name, what: d.guestAdded, detail: `${guest.kind} ${guest.vmid}` });
    } else if (old.status !== guest.status) {
      out.push({
        tone: guest.status === 'running' ? 'good' : 'warn',
        where: name,
        what: guest.status === 'running' ? d.guestStarted : d.guestStopped,
        detail: `${old.status} → ${guest.status}`,
      });
    }
  }
  /*
   * Where a guest is plugged in.
   *
   * A guest that moved bridge or changed VLAN keeps running, keeps answering
   * its console and shows nothing wrong anywhere — it is simply on a different
   * network than it was, which is the whole point of the change and also the
   * whole danger of it. Nothing else in the survey would report it.
   *
   * Only compared where both surveys read the guest's config: an empty list is
   * "not measured" — a token without VM.Audit produces one, and so does every
   * survey taken before the configs were read at all.
   */
  for (const guest of after.guests) {
    const old = wasGuest.get(String(guest.vmid));
    if (!old?.nics?.length || !guest.nics?.length) continue;
    const name = guest.name || String(guest.vmid);

    const wasNic = by(old.nics, (n) => n.name);
    for (const nic of guest.nics) {
      const previous = wasNic.get(nic.name);
      const at = guest.nics.length > 1 ? `${name} · ${nic.name}` : name;

      if (!previous) {
        out.push({
          tone: 'info',
          where: at,
          what: d.guestNicAdded,
          detail: `${nic.bridge}${nic.vlan == null ? '' : ` · VLAN ${nic.vlan}`}`,
        });
        continue;
      }

      if (previous.bridge !== nic.bridge) {
        out.push({
          tone: 'warn',
          where: at,
          what: d.guestBridgeChanged,
          detail: `${previous.bridge} → ${nic.bridge}`,
        });
      }
      if (previous.vlan !== nic.vlan) {
        out.push({
          tone: 'warn',
          where: at,
          what: d.guestVlanChanged,
          detail: `${previous.vlan ?? d.untagged} → ${nic.vlan ?? d.untagged}`,
        });
      }
      if (previous.firewall !== nic.firewall) {
        out.push({
          tone: nic.firewall ? 'good' : 'warn',
          where: at,
          what: nic.firewall ? d.guestFirewallOn : d.guestFirewallOff,
        });
      }
    }

    const nowNic = by(guest.nics, (n) => n.name);
    for (const nic of old.nics) {
      if (!nowNic.has(nic.name)) {
        out.push({ tone: 'warn', where: `${name} · ${nic.name}`, what: d.guestNicRemoved });
      }
    }
  }

  const nowGuest = by(after.guests, (g) => String(g.vmid));
  for (const guest of before.guests) {
    if (!nowGuest.has(String(guest.vmid))) {
      out.push({ tone: 'warn', where: guest.name || String(guest.vmid), what: d.guestGone });
    }
  }

  const wasStore = by(before.storages, (s) => `${s.node}/${s.name}`);
  for (const store of after.storages) {
    const old = wasStore.get(`${store.node}/${store.name}`);
    if (!old || old.total === 0 || store.total === 0) continue;
    const from = pct(old.used, old.total);
    const to = pct(store.used, store.total);
    if (Math.abs(to - from) < STORAGE_STEP) continue;
    out.push({
      tone: to >= 90 ? 'bad' : to >= 80 ? 'warn' : to < from ? 'good' : 'info',
      where: `${store.name} (${store.node})`,
      what: to > from ? d.storageGrew : d.storageShrank,
      detail: `${from}% → ${to}%  ·  ${bytes(store.available)} ${d.free}`,
    });
  }

  const wasDisk = by(before.disks, (x) => `${x.node}/${x.devpath}`);
  for (const disk of after.disks) {
    const old = wasDisk.get(`${disk.node}/${disk.devpath}`);
    if (!old || !old.health || !disk.health || old.health === disk.health) continue;
    const good = ['PASSED', 'OK'].includes(disk.health);
    out.push({
      tone: good ? 'good' : 'bad',
      where: `${disk.model || disk.devpath} (${disk.node})`,
      what: d.diskHealthChanged,
      detail: `${old.health} → ${disk.health}`,
    });
  }

  // Backup coverage, by the files that exist rather than the jobs configured.
  const covered = (snap: ProxmoxSnapshot) => new Set(snap.backupFiles.map((f) => f.vmid));
  const wasCovered = covered(before);
  const nowCovered = covered(after);
  for (const guest of after.guests) {
    const name = guest.name || String(guest.vmid);
    if (wasCovered.has(guest.vmid) && !nowCovered.has(guest.vmid)) {
      out.push({ tone: 'bad', where: name, what: d.backupLost });
    } else if (!wasCovered.has(guest.vmid) && nowCovered.has(guest.vmid)) {
      out.push({ tone: 'good', where: name, what: d.backupGained });
    }
  }

  const bridges = (snap: ProxmoxSnapshot) =>
    by(snap.interfaces.filter((i) => i.kind.includes('bridge')), (i) => `${i.node}/${i.name}`);
  const wasBridge = bridges(before);
  const nowBridge = bridges(after);
  for (const [key, iface] of nowBridge) {
    const where = `${iface.name} (${iface.node})`;
    const old = wasBridge.get(key);

    if (!old) {
      out.push({ tone: 'info', where, what: d.bridgeAdded, detail: iface.bridgePorts || undefined });
      continue;
    }
    if (old.vlanAware !== iface.vlanAware) {
      out.push({ tone: 'info', where, what: iface.vlanAware ? d.bridgeVlanOn : d.bridgeVlanOff });
    }
    // The physical ports under a bridge: what changes when a NIC is swapped
    // for another, or a bond loses a leg. Nothing else reports it.
    if (old.bridgePorts && iface.bridgePorts && old.bridgePorts !== iface.bridgePorts) {
      out.push({
        tone: 'warn',
        where,
        what: d.bridgePortsChanged,
        detail: `${old.bridgePorts} → ${iface.bridgePorts}`,
      });
    }
    if (old.active && !iface.active) {
      out.push({ tone: 'bad', where, what: d.bridgeDown });
    } else if (!old.active && iface.active) {
      out.push({ tone: 'good', where, what: d.bridgeUp });
    }
  }
  for (const [key, iface] of wasBridge) {
    if (!nowBridge.has(key)) {
      out.push({ tone: 'warn', where: `${iface.name} (${iface.node})`, what: d.bridgeRemoved });
    }
  }

  return out;
}

/* ------------------------------------------------------------------- public */

/**
 * Compares two surveys, newest against older.
 *
 * A source present in one survey and absent from the other is not compared at
 * all, and says so: "the Proxmox host was not surveyed last time" is a fact
 * about the survey, whereas treating its guests as newly appeared would be a
 * claim about the estate that nothing measured supports.
 */
export function diffSurveys(before: SurveySnapshot, after: SurveySnapshot, t: Dict): SurveyDiff {
  const changes: Change[] = [];
  const notCompared: string[] = [];

  if (before.unifi && after.unifi) changes.push(...unifiChanges(before.unifi, after.unifi, t));
  else if (before.unifi || after.unifi) notCompared.push(t.diff.unifiOneSided);

  /*
   * The way out, where both surveys looked for one.
   *
   * `wans` is absent from every survey taken before it was collected, and an
   * absent field is not an estate with no internet — so one-sided is stated
   * rather than reported as a link that appeared. Present and empty is a real
   * comparison: it says the controller had nothing to say about a WAN.
   */
  if (before.unifi?.wans && after.unifi?.wans) {
    changes.push(...wanChanges(before.unifi.wans, after.unifi.wans, t));
  } else if (before.unifi && after.unifi && (before.unifi.wans || after.unifi.wans)) {
    notCompared.push(t.diff.wanOneSided);
  }

  if (before.proxmox && after.proxmox) {
    changes.push(...proxmoxChanges(before.proxmox, after.proxmox, t));
  } else if (before.proxmox || after.proxmox) {
    notCompared.push(t.diff.proxmoxOneSided);
  }

  changes.sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.where.localeCompare(b.where));

  return {
    from: { id: before.id, at: before.finishedAt },
    to: { id: after.id, at: after.finishedAt },
    changes,
    notCompared,
  };
}
