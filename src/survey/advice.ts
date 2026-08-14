/*
 * Survey → change plans.
 *
 * A risk says what is wrong; a recommendation says what to do about it. Both
 * are derived from the same measurements, and the rule this file follows is
 * the same one mapping.ts follows: a recommendation may only exist because
 * something was measured, and its wording may only repeat what was measured.
 *
 * Nothing here proposes a step the application performs. The steps are for a
 * person to carry out, which is why every plan ends with how to undo it and
 * why execution is never reported as done.
 */

import type { BackupSummary, ChangeStep, Recommendation, Severity } from '@/data/model';
import type { Dict } from '@/i18n';
import { takesBackups, type ProxmoxSnapshot, type SurveySnapshot, type UnifiSnapshot } from './model';

/** Slowest link that still counts as a working gigabit port. */
const SLOW_PORT_BELOW = 1000;

/** Security modes that leave traffic readable. */
const WEAK_WIFI = ['open', 'none', 'wep', 'wpa', 'wpapersonal', 'wpa1'];

/** A backup this recent is treated as an available restore point. */
const CHECKPOINT_MAX_AGE_DAYS = 7;

/**
 * Airtime busy above this is worth acting on.
 *
 * Below roughly this a channel absorbs bursts without anyone noticing; above
 * it, every transmission waits, and the symptom people report is "the Wi-Fi is
 * slow" on equipment whose own statistics look fine.
 */
const BUSY_AIRTIME = 65;

/** A certificate within this many days of expiring is worth raising. */
const CERT_WARNING_DAYS = 30;

const BAND_NAMES: Record<string, string> = { ng: '2.4 GHz', na: '5 GHz', '6e': '6 GHz' };

interface Draft {
  id: string;
  severity: Severity;
  title: string;
  where: string;
  impact: string;
  risk: Recommendation['risk'];
  minutes: number;
  /** A change that interrupts the network gets a maintenance window, not a duration. */
  needsWindow?: boolean;
  why: string;
  precheck: string;
  /** Set when the pre-check is something the survey itself already confirmed. */
  precheckDone?: boolean;
  execute: string;
  verify: string;
  rollback: string;
}

function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function bytesLabel(bytes: number): string {
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

/**
 * Turns a draft into the shape the view renders.
 *
 * The first step is always done — the finding exists because the survey ran.
 * Execution and everything after it is always waiting, because the application
 * does not carry any of it out; reporting otherwise would be a claim about the
 * estate that nothing measured supports.
 */
function toRecommendation(d: Draft, checkpointAgeDays: number | null, t: Dict): Recommendation {
  const r = t.adviceRules;
  const steps: ChangeStep[] = [
    { name: r.stepSurvey, text: r.surveyText, state: 'kész' },
    { name: r.stepPrecheck, text: d.precheck, state: d.precheckDone ? 'kész' : 'vár' },
    {
      name: r.stepCheckpoint,
      text:
        checkpointAgeDays !== null && checkpointAgeDays <= CHECKPOINT_MAX_AGE_DAYS
          ? r.checkpointHave(checkpointAgeDays)
          : r.checkpointNone,
      state:
        checkpointAgeDays !== null && checkpointAgeDays <= CHECKPOINT_MAX_AGE_DAYS ? 'kész' : 'vár',
    },
    { name: r.stepExecute, text: d.execute, state: 'vár' },
    { name: r.stepVerify, text: d.verify, state: 'vár' },
    { name: r.stepRollback, text: d.rollback, state: 'vár' },
  ];

  return {
    id: d.id,
    severity: d.severity,
    title: d.title,
    where: d.where,
    impact: d.impact,
    risk: d.risk,
    duration: d.needsWindow ? r.window(d.minutes) : r.minutes(d.minutes),
    why: d.why,
    steps,
  };
}

/* ------------------------------------------------------------------ Proxmox */

function proxmoxDrafts(pve: ProxmoxSnapshot, backups: BackupSummary, t: Dict): Draft[] {
  const r = t.adviceRules;
  const out: Draft[] = [];

  // Guests with nothing behind them. A scheduled job is not evidence — only a
  // file is — so this is driven by the files the survey actually found.
  if (backups.unprotected.length > 0) {
    const target = pve.storages.find(takesBackups);
    const names = backups.unprotected
      .slice(0, 6)
      .map((g) => g.name || String(g.vmid))
      .join(', ');

    out.push({
      id: 'adv:backup-missing',
      severity: 'bad',
      title: r.unprotectedTitle(backups.unprotected.length),
      where: r.unprotectedWhere(pve.nodes[0]?.name ?? 'Proxmox'),
      impact: r.unprotectedImpact,
      risk: 'Alacsony',
      minutes: 40,
      why: r.unprotectedWhy(names, backups.guestCount, backups.protectedCount),
      precheck: target
        ? r.unprotectedPrecheckOk(target.name, bytesLabel(target.available))
        : r.unprotectedPrecheckNone,
      precheckDone: Boolean(target),
      execute: r.unprotectedExecute,
      verify: r.unprotectedVerify,
      rollback: r.unprotectedRollback,
    });
  }

  // Files exist but nothing checks them. Worth separating from "no backup":
  // the fix is different and the estate looks covered until you ask.
  if (
    pve.backupFiles.length > 0 &&
    !backups.verifiable &&
    backups.newestAgeDays !== null &&
    backups.unprotected.length === 0
  ) {
    out.push({
      id: 'adv:backup-unverified',
      severity: 'warn',
      title: r.unverifiedTitle,
      where: r.unverifiedWhere(pve.backupFiles[0]!.storage),
      impact: r.unverifiedImpact,
      risk: 'Alacsony',
      minutes: 25,
      why: r.unverifiedWhy(pve.backupFiles.length, backups.newestAgeDays),
      precheck: r.unverifiedPrecheck,
      execute: r.unverifiedExecute,
      verify: r.unverifiedVerify,
      rollback: r.unverifiedRollback,
    });
  }

  for (const s of pve.storages.filter((x) => x.total > 0 && pct(x.used, x.total) >= 80)) {
    const used = pct(s.used, s.total);
    out.push({
      id: `adv:storage:${s.node}:${s.name}`,
      severity: used >= 90 ? 'bad' : 'warn',
      title: r.storageTitle(s.name, used),
      where: `${s.node} · ${s.kind}`,
      impact: r.storageImpact,
      risk: 'Közepes',
      minutes: 30,
      why: r.storageWhy(s.name, used, bytesLabel(s.available)),
      precheck: r.storagePrecheck,
      execute: r.storageExecute,
      verify: r.storageVerify,
      rollback: r.storageRollback,
    });
  }

  /*
   * A certificate about to expire.
   *
   * The expiry date is measured, so the days remaining are arithmetic rather
   * than a guess — and this is the classic failure nobody notices until the
   * morning the interface stops loading.
   */
  for (const c of pve.certificates ?? []) {
    if (c.notAfter <= 0) continue;
    const days = Math.floor((c.notAfter * 1000 - Date.now()) / 86_400_000);
    if (days > CERT_WARNING_DAYS) continue;
    out.push({
      id: `adv:cert:${c.node}:${c.filename}`,
      severity: days <= 0 ? 'bad' : days <= 7 ? 'bad' : 'warn',
      title: days <= 0 ? r.certExpiredTitle(c.node) : r.certTitle(c.node, days),
      where: `${c.node} · ${c.filename}`,
      impact: r.certImpact,
      risk: 'Alacsony',
      minutes: 20,
      why: r.certWhy(c.subject || c.filename, c.issuer || '—', days),
      precheck: r.certPrecheck,
      execute: r.certExecute,
      verify: r.certVerify,
      rollback: r.certRollback,
    });
  }

  // Pending updates, but only where the node actually let us look.
  const updates = pve.updates ?? [];
  const important = updates.filter((u) => u.priority.toLowerCase() === 'important');
  if (pve.updatesReadable && updates.length > 0) {
    out.push({
      id: 'adv:updates',
      severity: important.length > 0 ? 'warn' : 'info',
      title: r.updatesTitle(updates.length),
      where: [...new Set(updates.map((u) => u.node))].join(', '),
      impact: r.updatesImpact,
      risk: 'Közepes',
      minutes: 45,
      needsWindow: true,
      why: r.updatesWhy(
        updates.length,
        important.length,
        updates.slice(0, 5).map((u) => u.package).join(', '),
      ),
      precheck: r.updatesPrecheck,
      execute: r.updatesExecute,
      verify: r.updatesVerify,
      rollback: r.updatesRollback,
    });
  }

  for (const d of pve.disks.filter((x) => x.health && !['PASSED', 'OK'].includes(x.health))) {
    out.push({
      id: `adv:disk:${d.node}:${d.devpath}`,
      severity: 'bad',
      title: r.diskTitle(d.model || d.devpath),
      where: `${d.node} · ${d.serial || d.devpath}`,
      impact: r.diskImpact,
      risk: 'Magas',
      minutes: 90,
      needsWindow: true,
      why: r.diskWhy(d.model || d.devpath, d.health, d.usedBy || '—'),
      precheck: r.diskPrecheck,
      execute: r.diskExecute,
      verify: r.diskVerify,
      rollback: r.diskRollback,
    });
  }

  return out;
}

/* -------------------------------------------------------------------- UniFi */

function unifiDrafts(unifi: UnifiSnapshot, t: Dict): Draft[] {
  const r = t.adviceRules;
  const out: Draft[] = [];

  for (const d of unifi.devices.filter((x) => x.state !== 1)) {
    out.push({
      id: `adv:offline:${d.mac}`,
      severity: 'bad',
      title: r.offlineTitle(d.name || d.model || d.mac),
      where: d.ip || d.mac,
      impact: r.offlineImpact,
      risk: 'Alacsony',
      minutes: 20,
      why: r.offlineWhy(d.name || d.model || d.mac, d.ip || d.mac),
      precheck: r.offlinePrecheck,
      execute: r.offlineExecute,
      verify: r.offlineVerify,
      rollback: r.offlineRollback,
    });
  }

  for (const w of unifi.wlans.filter(
    (x) => x.enabled && WEAK_WIFI.includes(x.security.toLowerCase().replace(/[-_\s]/g, '')),
  )) {
    out.push({
      id: `adv:wifi:${w.id}`,
      severity: 'bad',
      title: r.weakWifiTitle(w.name),
      where: `SSID · ${w.name}`,
      impact: r.weakWifiImpact,
      risk: 'Közepes',
      minutes: 15,
      why: r.weakWifiWhy(w.name, w.security),
      precheck: r.weakWifiPrecheck,
      execute: r.weakWifiExecute,
      verify: r.weakWifiVerify,
      rollback: r.weakWifiRollback,
    });
  }

  /*
   * A radio working in a busy channel.
   *
   * This is the one thing about Wi-Fi that cannot be seen from the equipment's
   * own statistics: the airtime is shared with everybody else's network, and a
   * radio whose own counters look healthy can still be waiting most of the time
   * to transmit. The controller measures it; the application had been throwing
   * the number away.
   */
  for (const d of unifi.devices) {
    // Guarded because a snapshot can arrive from an older build or from a file
    // someone imported, where a list added later simply is not there.
    for (const radio of d.radios ?? []) {
      if (radio.utilisation < BUSY_AIRTIME) continue;
      const band = BAND_NAMES[radio.band] ?? radio.band;
      const name = d.name || d.model || d.mac;
      out.push({
        id: `adv:airtime:${d.mac}:${radio.name}`,
        severity: radio.utilisation >= 85 ? 'bad' : 'warn',
        title: r.airtimeTitle(name, band),
        where: `${name} · ${band} · ${r.channelLabel} ${radio.channel}`,
        impact: r.airtimeImpact,
        risk: 'Alacsony',
        minutes: 25,
        why: r.airtimeWhy(band, radio.utilisation, Math.max(radio.selfUtilisation, 0), radio.clients),
        precheck: r.airtimePrecheck,
        execute: r.airtimeExecute,
        verify: r.airtimeVerify,
        rollback: r.airtimeRollback,
      });
    }
  }

  /*
   * Two access points sharing a channel in the same band.
   *
   * Both channels are measured, so this states a fact rather than modelling
   * coverage: the application cannot know whether the two overlap on air, and
   * says so in the plan instead of pretending otherwise.
   */
  const onChannel = new Map<string, string[]>();
  for (const d of unifi.devices) {
    for (const radio of d.radios ?? []) {
      if (!radio.channel || radio.channel === 'auto') continue;
      const key = `${radio.band}:${radio.channel}`;
      onChannel.set(key, [...(onChannel.get(key) ?? []), d.name || d.model || d.mac]);
    }
  }
  for (const [key, names] of onChannel) {
    if (names.length < 2) continue;
    const [band, channel] = key.split(':');
    out.push({
      id: `adv:channel:${key}`,
      severity: 'info',
      title: r.sameChannelTitle(BAND_NAMES[band!] ?? band!, channel!),
      where: names.join(', '),
      impact: r.sameChannelImpact,
      risk: 'Alacsony',
      minutes: 20,
      why: r.sameChannelWhy(names.length, BAND_NAMES[band!] ?? band!, channel!),
      precheck: r.sameChannelPrecheck,
      execute: r.sameChannelExecute,
      verify: r.sameChannelVerify,
      rollback: r.sameChannelRollback,
    });
  }

  /*
   * A port that came up below a gigabit.
   *
   * Only counted where the far end is known: a link to something the survey
   * can name is one worth chasing, whereas an unidentified 100 Mb/s neighbour
   * is quite possibly a device that has no faster port to offer.
   */
  for (const d of unifi.devices) {
    for (const p of d.ports) {
      const neighbour = p.neighbourName || p.neighbourMac;
      if (!p.up || p.speed <= 0 || p.speed >= SLOW_PORT_BELOW || !neighbour) continue;
      out.push({
        id: `adv:port:${d.mac}:${p.idx}`,
        severity: 'warn',
        title: r.slowPortTitle(d.name || d.model || d.mac, p.idx),
        where: `${d.name || d.mac} · port ${p.idx}`,
        impact: r.slowPortImpact,
        risk: 'Alacsony',
        minutes: 20,
        why: r.slowPortWhy(d.name || d.model || d.mac, p.idx, p.speed, neighbour),
        precheck: r.slowPortPrecheck,
        execute: r.slowPortExecute,
        verify: r.slowPortVerify,
        rollback: r.slowPortRollback,
      });
    }
  }

  return out;
}

/* --------------------------------------------------------------- both sides */

/**
 * A host bridge that cannot tag, on a network that does.
 *
 * Needs both snapshots: a plain bridge is only a shortcoming when there are
 * VLANs to place guests into, and that is a fact about the UniFi side.
 */
function bridgeDrafts(pve: ProxmoxSnapshot, unifi: UnifiSnapshot | null, t: Dict): Draft[] {
  const r = t.adviceRules;
  const vlans = (unifi?.networks ?? []).filter((n) => n.enabled && n.vlan != null).length;
  if (vlans === 0) return [];

  return pve.interfaces
    .filter((i) => i.kind.includes('bridge') && i.active && !i.vlanAware)
    .map((i) => ({
      id: `adv:bridge:${i.node}:${i.name}`,
      severity: 'info' as Severity,
      title: r.bridgeTitle(i.name),
      where: `${i.node} · ${i.name}`,
      impact: r.bridgeImpact,
      risk: 'Magas' as const,
      minutes: 45,
      needsWindow: true,
      why: r.bridgeWhy(i.name, vlans),
      precheck: r.bridgePrecheck,
      execute: r.bridgeExecute,
      verify: r.bridgeVerify,
      rollback: r.bridgeRollback,
    }));
}

/* ------------------------------------------------------------------- public */

const RANK: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };

/**
 * Every change worth making that the survey can justify, worst first.
 *
 * Ranking is by severity and then by how long the work takes, so the cheapest
 * of the most serious items comes first — which is the order someone with an
 * hour to spend actually wants.
 */
export function recommendationsFromSnapshot(
  snapshot: SurveySnapshot,
  backups: BackupSummary,
  t: Dict,
): Recommendation[] {
  const { proxmox: pve, unifi } = snapshot;

  const drafts = [
    ...(pve ? proxmoxDrafts(pve, backups, t) : []),
    ...(unifi ? unifiDrafts(unifi, t) : []),
    ...(pve ? bridgeDrafts(pve, unifi, t) : []),
  ].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.minutes - b.minutes);

  return drafts.map((d) => toRecommendation(d, backups.newestAgeDays, t));
}
