import type {
  BackupEvidence,
  BackupJob,
  BackupSummary,
  ConnectionProfile,
  FirewallRule,
  MatrixCell,
  NetLink,
  NetNode,
  NodeKind,
  Recommendation,
  Risk,
  ScanLogEntry,
  SecuritySignal,
  Zone,
  ZoneKey,
} from '@/data/model';
import type { Dict } from '@/i18n';
import { recommendationsFromSnapshot } from './advice';
import {
  combinedReachability,
  readLiveEstate,
  type LiveEstate,
  type LiveFirewall,
  type LiveVerdict,
} from './liveFirewall';
import { CANVAS_W, NODE_W } from '@/lib/geometry';
import type { Tone } from '@/lib/palette';
import {
  takesBackups,
  type Profile,
  type ProxmoxSnapshot,
  type SurveySnapshot,
  type UnifiDevice,
  type UnifiSnapshot,
} from './model';

/*
 * Raw measurements → estate.
 *
 * The rule this file follows: anything read directly from an API is
 * "Felmért"; anything the application concluded is "Becsült"; anything the
 * application cannot prove with read-only access is "Nem ellenőrzött". A
 * firewall rule read from configuration is *not* evidence that the rule takes
 * effect, so rules land in the third category even though they were read
 * cleanly.
 */

export interface Estate {
  source: 'demo' | 'survey';
  surveyedAt?: string;
  nodes: NetNode[];
  links: NetLink[];
  zones: Zone[];
  matrix: MatrixCell[][];
  /** Explains why the matrix looks the way it does. */
  matrixNote: string;
  /**
   * Whether the gateway's loaded ruleset was read at all.
   *
   * Distinguishes the two ways nothing gets verified, which look identical in a
   * count and call for opposite actions: no ruleset was read, or one was read
   * and matched nothing. The first is a matter of access, the second of what
   * the gateway logs.
   */
  liveRead: boolean;
  rules: FirewallRule[];
  signals: SecuritySignal[];
  risks: Risk[];
  /** What to do about the risks, worst first. */
  recommendations: Recommendation[];
  scanLog: ScanLogEntry[];
  profiles: ConnectionProfile[];
  counts: Record<Tone, number>;
  /** Headline counters for the overview. */
  stats: EstateStat[];
  /** Capacity bars for the overview. */
  capacity: EstateBar[];
  /** Set when capacity figures are missing, saying what was and was not read. */
  capacityNote?: string;
  /** What could be established about backups. */
  backups: BackupSummary;
}

export interface EstateStat {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  tone?: Tone;
}

export interface EstateBar {
  label: string;
  value: string;
  percent: number;
  /** `accent` means "nothing wrong", and follows the theme colour. */
  tone: Tone | 'accent';
}

/* ------------------------------------------------------------------ layout */

const COL_GAP = 80;
const ROW_H = 186;
const MAX_PER_ROW = 6;

interface Draft extends Omit<NetNode, 'x' | 'y'> {
  x?: number;
  y?: number;
}

/** Marks a placeholder standing in for a cable passing through a tier. */
const VIRTUAL = '~lane:';

/**
 * A position in a tier: either a device, or a channel held clear for a cable
 * on its way past.
 */
type Slot = { node: Draft; lane?: undefined } | { lane: string; node?: undefined };

/** How much room a pass-through channel takes. Narrower than a card. */
const LANE_W = 48;

/**
 * Counts how many cables cross between two neighbouring tiers.
 *
 * Two edges cross exactly when their endpoints are in opposite order on the
 * two tiers, which is all this has to check — the drawn curve bends, but it
 * cannot undo an inversion.
 */
function crossingsBetween(upper: string[], lower: string[], edges: [string, string][]): number {
  const up = new Map(upper.map((id, i) => [id, i]));
  const down = new Map(lower.map((id, i) => [id, i]));

  const drawn = edges
    .map(([a, b]) => [up.get(a), down.get(b)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined);

  let count = 0;
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const [a1, b1] = drawn[i]!;
      const [a2, b2] = drawn[j]!;
      if ((a1 - a2) * (b1 - b2) < 0) count += 1;
    }
  }
  return count;
}

/**
 * Orders each tier so cables run down the map without crossing each other.
 *
 * Left alone, the tiers keep the order they were collected in — every switch,
 * then every access point — so an AP uplinked to the rightmost switch can be
 * drawn on the far left and its cable crosses the whole map.
 *
 * Three things do the work, and they are the standard layered-drawing
 * treatment:
 *
 *   Cables that skip a tier get a placeholder in each tier they pass through.
 *   Without one such a cable takes no part in the ordering at all — nothing
 *   holds a lane open for it — and it ends up crossing everything between its
 *   two ends. This is what a gateway wired straight to an access point does.
 *
 *   Each tier then moves to the average, and separately to the median, of what
 *   it connects to. Neither wins everywhere, so both are tried and whichever
 *   arrangement actually measures fewer crossings is the one kept.
 *
 *   Finally neighbouring pairs are swapped wherever swapping helps, which
 *   clears up what the averaging leaves behind.
 */
function orderTiers(tiers: Draft[][], links: NetLink[]): Slot[][] {
  const layerOf = new Map<string, number>();
  tiers.forEach((tier, i) => tier.forEach((n) => layerOf.set(n.id, i)));

  // Ids per layer, placeholders included.
  const order: string[][] = tiers.map((tier) => tier.map((n) => n.id));
  // Edges between each layer and the one below it.
  const between: [string, string][][] = tiers.map(() => []);

  links.forEach((link, index) => {
    const from = layerOf.get(link.from);
    const to = layerOf.get(link.to);
    if (from === undefined || to === undefined || from === to) return;

    const [top, bottom] = from < to ? [from, to] : [to, from];
    const [head, tail] = from < to ? [link.from, link.to] : [link.to, link.from];

    let previous = head;
    for (let layer = top + 1; layer < bottom; layer++) {
      const stand = `${VIRTUAL}${index}:${layer}`;
      order[layer]!.push(stand);
      between[layer - 1]!.push([previous, stand]);
      previous = stand;
    }
    between[bottom - 1]!.push([previous, tail]);
  });

  const neighbours = new Map<string, { up: string[]; down: string[] }>();
  const slot = (id: string) => {
    let entry = neighbours.get(id);
    if (!entry) neighbours.set(id, (entry = { up: [], down: [] }));
    return entry;
  };
  between.forEach((edges) => {
    for (const [a, b] of edges) {
      slot(a).down.push(b);
      slot(b).up.push(a);
    }
  });

  /*
   * How far apart two devices on the same tier are left.
   *
   * A cable that runs along a tier — a switch to the switch beside it, or a
   * hypervisor to the switch it is plugged into — has to cross everything
   * standing between its two ends. The sweeps above cannot see such a cable at
   * all, because they order each tier against the tiers above and below, and
   * both ends of this one are in the same row.
   *
   * So it is counted here instead: every position between the two ends costs,
   * and the swapping pass has a reason to bring them together. Adjacent costs
   * nothing, which is the whole aim.
   */
  const alongTier: [string, string][][] = tiers.map(() => []);
  for (const link of links) {
    const layer = layerOf.get(link.from);
    if (layer === undefined || layer !== layerOf.get(link.to) || link.from === link.to) continue;
    alongTier[layer]!.push([link.from, link.to]);
  }

  const spread = (index: number) => {
    const layer = order[index];
    if (!layer) return 0;
    const at = new Map(layer.map((id, i) => [id, i]));
    let sum = 0;
    for (const [a, b] of alongTier[index] ?? []) {
      const x = at.get(a);
      const y = at.get(b);
      if (x === undefined || y === undefined) continue;
      sum += Math.max(0, Math.abs(x - y) - 1);
    }
    return sum;
  };

  /*
   * A cable stretched along a tier is not one problem but several.
   *
   * It passes over every card between its two ends, and over whatever those
   * cards are wired to — so each position it spans is worth about as much as a
   * crossing on its own. Weighting it below a single crossing, as this first
   * did, left a hypervisor at one end of a row and the switch it is plugged
   * into at the other, with everything else arching over the gap.
   */
  const CROSSING_WEIGHT = 10;
  const SPREAD_WEIGHT = 9;

  const total = () =>
    between.reduce(
      (sum, edges, i) => sum + crossingsBetween(order[i]!, order[i + 1] ?? [], edges) * CROSSING_WEIGHT,
      0,
    ) + order.reduce((sum, _, i) => sum + spread(i) * SPREAD_WEIGHT, 0);

  const snapshot = () => order.map((layer) => [...layer]);
  let best = snapshot();
  let bestCount = total();

  /** Moves one layer onto the average or median of what it is wired to. */
  const sweep = (index: number, from: 'up' | 'down', how: 'mean' | 'median') => {
    const layer = order[index];
    const reference = order[from === 'up' ? index - 1 : index + 1];
    if (!layer || !reference || reference.length === 0) return;

    const position = new Map(reference.map((id, i) => [id, i]));
    const scale = layer.length > 1 ? (reference.length - 1) / (layer.length - 1) : 1;

    const keyed = layer.map((id, i) => {
      const seen = (neighbours.get(id)?.[from] ?? [])
        .map((other) => position.get(other))
        .filter((p): p is number => p !== undefined)
        .sort((a, b) => a - b);

      // Nothing to follow: hold this place, mapped onto the reference tier's
      // scale so unconnected nodes interleave rather than clump at one end.
      if (seen.length === 0) return { id, key: i * scale, i };
      const key =
        how === 'mean'
          ? seen.reduce((a, b) => a + b, 0) / seen.length
          : seen.length % 2 === 1
            ? seen[(seen.length - 1) / 2]!
            : (seen[seen.length / 2 - 1]! + seen[seen.length / 2]!) / 2;
      return { id, key, i };
    });

    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    order[index] = keyed.map((k) => k.id);
  };

  for (let pass = 0; pass < 8; pass++) {
    const how = pass % 2 === 0 ? 'mean' : 'median';
    for (let i = 1; i < order.length; i++) sweep(i, 'up', how);
    for (let i = order.length - 2; i >= 0; i--) sweep(i, 'down', how);

    // Swapping neighbours clears up what averaging cannot. The objective
    // includes cables running along the tier, which the sweeps cannot see.
    const localCost = (i: number) =>
      (i > 0 ? crossingsBetween(order[i - 1]!, order[i]!, between[i - 1]!) : 0) * CROSSING_WEIGHT +
      (i + 1 < order.length
        ? crossingsBetween(order[i]!, order[i + 1]!, between[i]!) * CROSSING_WEIGHT
        : 0) +
      spread(i) * SPREAD_WEIGHT;

    for (let round = 0; round < 6; round++) {
      let improved = false;
      for (let i = 0; i < order.length; i++) {
        const layer = order[i]!;
        for (let j = 0; j + 1 < layer.length; j++) {
          const before = localCost(i);
          [layer[j], layer[j + 1]] = [layer[j + 1]!, layer[j]!];
          if (localCost(i) < before) improved = true;
          else [layer[j], layer[j + 1]] = [layer[j + 1]!, layer[j]!];
        }
      }
      if (!improved) break;
    }

    /*
     * Bring the two ends of a tier cable together.
     *
     * Swapping neighbours cannot do this. With a hypervisor at one end of a row
     * and its switch at the other, every single swap leaves the total exactly
     * where it was — the pair gets one position closer and some other pair one
     * further — so a search that only accepts strict improvements sits on that
     * plateau forever, while the arrangement two moves away is plainly better.
     *
     * Lifting one end out and setting it down beside the other crosses the
     * plateau in one step. Every placement is scored on the whole objective, so
     * this cannot trade a tidy row for a tangle above it.
     */
    for (const [layerIndex, edges] of alongTier.entries()) {
      const layer = order[layerIndex];
      if (!layer) continue;

      for (const [a, b] of edges) {
        if (Math.abs(layer.indexOf(a) - layer.indexOf(b)) <= 1) continue;

        let bestArrangement = [...layer];
        let bestScore = total();

        for (const [moving, anchor] of [
          [a, b],
          [b, a],
        ]) {
          const without = layer.filter((id) => id !== moving);
          const at = without.indexOf(anchor);
          if (at < 0) continue;
          for (const where of [at, at + 1]) {
            order[layerIndex] = [...without.slice(0, where), moving, ...without.slice(where)];
            const score = total();
            if (score < bestScore) {
              bestScore = score;
              bestArrangement = [...order[layerIndex]!];
            }
          }
        }
        order[layerIndex] = bestArrangement;
      }
    }

    const count = total();
    if (count < bestCount) {
      bestCount = count;
      best = snapshot();
    }
    if (bestCount === 0) break;
  }

  /*
   * A channel may not open up inside a cable that runs along the tier.
   *
   * Two switches wired to each other sit side by side, and the cable between
   * them is drawn straight across. Parking a pass-through channel in that gap
   * trades one crossing for another, so any channel that lands between such a
   * pair is moved out to the near side of it.
   */
  const sameTier = links
    .map((l) => [layerOf.get(l.from), l.from, l.to] as const)
    .filter(([layer, from, to]) => layer !== undefined && layer === layerOf.get(to) && from !== to);

  for (const [layer, from, to] of sameTier) {
    const row = best[layer!];
    if (!row) continue;
    const a = row.indexOf(from);
    const b = row.indexOf(to);
    if (a < 0 || b < 0) continue;
    const [low, high] = a < b ? [a, b] : [b, a];
    const trapped = row.slice(low + 1, high).filter((id) => id.startsWith(VIRTUAL));
    if (trapped.length === 0) continue;
    best[layer!] = [
      ...row.slice(0, low + 1).filter((id) => !trapped.includes(id)),
      ...row.slice(low + 1, high).filter((id) => !trapped.includes(id)),
      ...row.slice(high).filter((id) => !trapped.includes(id)).slice(0, 1),
      ...trapped,
      ...row.slice(high + 1).filter((id) => !trapped.includes(id)),
    ];
  }

  /*
   * The placeholders are kept.
   *
   * They are not drawn, but they have to keep their place: their whole purpose
   * is to hold a channel open between two cards for the cable passing through,
   * and dropping them here would close the channel again and put the cable
   * straight back across its neighbours.
   */
  const byId = new Map(tiers.flat().map((n) => [n.id, n]));
  return best.map((layer) =>
    layer.map<Slot>((id) => {
      const node = byId.get(id);
      return node ? { node } : { lane: id };
    }),
  );
}

/**
 * Places tiers top to bottom, centred, wrapping wide tiers onto extra lines.
 *
 * Channels take their share of the width without producing a card. That gap is
 * the point: it is where a cable crossing this tier runs, and closing it up
 * would put that cable back over its neighbours.
 */
function placeTiers(tiers: Slot[][]): NetNode[] {
  const widthOf = (slot: Slot) => (slot.lane === undefined ? NODE_W : LANE_W);
  let y = 24;
  const out: NetNode[] = [];

  for (const tier of tiers) {
    if (tier.length === 0) continue;
    // Wrapping counts cards, since that is what makes a row look crowded.
    const cards = tier.filter((s) => s.lane === undefined).length;
    const perRow = cards > MAX_PER_ROW ? MAX_PER_ROW : tier.length;

    for (let i = 0; i < tier.length; i += perRow) {
      const line = tier.slice(i, i + perRow);
      const width =
        line.reduce((sum, s) => sum + widthOf(s), 0) + (line.length - 1) * COL_GAP;
      let x = Math.round((CANVAS_W - width) / 2);
      for (const slot of line) {
        if (slot.node) out.push({ ...slot.node, x, y });
        x += widthOf(slot) + COL_GAP;
      }
      y += ROW_H;
    }
  }

  return out;
}

/* ----------------------------------------------------------------- helpers */

const gib = (bytes: number) => bytes / 1024 ** 3;

function bytesLabel(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${gib(bytes).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} B`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}

const DAY_MS = 86_400_000;

function ageDays(unixSeconds: number): number {
  return Math.floor((Date.now() - unixSeconds * 1000) / DAY_MS);
}

/**
 * Turns backup jobs and the files they left behind into evidence.
 *
 * The verdict is only ever what the data supports:
 *
 *   Igazolt      a file exists and the store verified it as readable
 *   Részleges    a file exists, but nothing has verified it
 *   Elavult      files exist, but the newest is older than the schedule implies
 *   Hiányzik     the job has produced nothing at all
 *
 * A restore test is deliberately absent from this list. Proxmox does not record
 * one, so the application cannot claim it happened; the view says so rather
 * than showing a number that would look like proof.
 */
function buildBackups(pve: ProxmoxSnapshot | null, t: Dict): BackupSummary {
  const b = t.backupFindings;
  const empty: BackupSummary = {
    jobs: [],
    unprotected: [],
    guestCount: 0,
    protectedCount: 0,
    newestAgeDays: null,
    verifiable: false,
    stores: [],
  };
  if (!pve) return empty;

  const files = pve.backupFiles;
  const verifiable = files.some((f) => f.verification !== '');
  const newest = files.reduce((max, f) => Math.max(max, f.ctime), 0);

  const backedUpVmids = new Set(files.map((f) => f.vmid));
  const unprotected = pve.guests
    .filter((g) => !backedUpVmids.has(g.vmid))
    .map((g) => ({ vmid: g.vmid, name: g.name || String(g.vmid) }));

  /** How stale a backup may be before the schedule is clearly not holding. */
  const toleranceDays = (schedule: string): number => {
    const s = schedule.toLowerCase();
    if (s.includes('mon') || s.includes('week') || s.includes('*-*-01')) return 9;
    if (s.includes('hour') || s.includes(':00/')) return 1;
    return 2; // a daily schedule, missing one run
  };

  const jobs: BackupJob[] = pve.backupJobs.map((job) => {
    // Which guests this job covers, so its files can be found.
    const wanted =
      job.selection === 'all'
        ? pve.guests.map((g) => g.vmid)
        : job.selection
            .split(',')
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v) && v > 0);
    const excluded = new Set(
      job.exclude
        .split(',')
        .map((v) => Number(v.trim()))
        .filter(Number.isFinite),
    );
    const covered = wanted.filter((v) => !excluded.has(v));

    const mine = files.filter((f) => f.storage === job.storage && covered.includes(f.vmid));
    const newestMine = mine.reduce((max, f) => Math.max(max, f.ctime), 0);
    const failed = mine.some((f) => f.verification === 'failed');
    const verified = mine.some((f) => f.verification === 'ok');
    const age = newestMine > 0 ? ageDays(newestMine) : null;
    const stale = age !== null && age > toleranceDays(job.schedule);

    let evidence: BackupEvidence;
    let reason: string;
    if (!job.enabled) {
      evidence = 'Hiányzik';
      reason = b.jobDisabled;
    } else if (mine.length === 0) {
      evidence = 'Hiányzik';
      reason = b.noFiles;
    } else if (failed) {
      evidence = 'Hiányzik';
      reason = b.verificationFailed;
    } else if (stale) {
      evidence = 'Elavult';
      reason = b.staleFiles(age ?? 0);
    } else if (verified) {
      evidence = 'Igazolt';
      reason = b.verifiedOk(mine.length);
    } else {
      evidence = 'Részleges';
      reason = verifiable ? b.notVerified : b.cannotVerify;
    }

    return {
      name: job.comment || b.jobName(job.id.slice(0, 8)),
      target: job.storage,
      schedule: job.schedule || b.noSchedule,
      lastRun: age === null ? '—' : age === 0 ? b.today : b.daysAgo(age),
      retention: job.retention || '—',
      evidence,
      reason,
    };
  });

  const stores = pve.storages
    .filter(takesBackups)
    .filter((s, i, all) => all.findIndex((o) => o.name === s.name) === i)
    .map((s) => ({
      name: s.name,
      usedPercent: pct(s.used, s.total),
      freeLabel: bytesLabel(s.available),
    }));

  return {
    jobs,
    unprotected,
    guestCount: pve.guests.length,
    protectedCount: pve.guests.length - unprotected.length,
    newestAgeDays: newest > 0 ? ageDays(newest) : null,
    verifiable,
    stores,
  };
}

function uptimeLabel(secs: number, t: Dict): string {
  const days = Math.floor(secs / 86400);
  if (days >= 1) return t.findings.days(days);
  return t.findings.hours(Math.floor(secs / 3600));
}

/** UniFi's device `type` maps onto the estate's node kinds. */
function deviceKind(type: string): NodeKind {
  if (['ugw', 'udm', 'uxg', 'ucg'].includes(type)) return 'gateway';
  if (type === 'usw') return 'switch';
  if (type === 'uap') return 'ap';
  return 'switch';
}

function deviceStatus(device: UnifiDevice): Tone {
  if (device.state === 1) return 'ok';
  if (device.state === 0) return 'bad';
  return 'warn';
}

/** Which zone key a fixed address falls into, for the inspector's policy tab. */
function zoneOf(kind: NodeKind): ZoneKey {
  switch (kind) {
    case 'gateway':
    case 'switch':
    case 'ap':
    case 'host':
      return 'Mgmt';
    case 'clients':
      return 'IoT';
    default:
      return 'Servers';
  }
}

/* ------------------------------------------------------------------- nodes */

function proxmoxNodes(
  pve: ProxmoxSnapshot,
  t: Dict,
): { host: Draft[]; guests: Draft[]; storage: Draft[] } {
  const f = t.findings;
  const host: Draft[] = pve.nodes.map((n) => {
    const storages = pve.storages.filter((s) => s.node === n.name);
    const worst = Math.max(0, ...storages.map((s) => pct(s.used, s.total)));
    const memPct = pct(n.memUsed, n.memTotal);

    return {
      id: `pve:${n.name}`,
      kind: 'host' as NodeKind,
      name: n.name,
      subtitle: pve.version || 'Proxmox VE',
      status: n.status !== 'online' ? 'bad' : worst >= 85 || memPct >= 90 ? 'warn' : 'ok',
      zone: 'Mgmt' as ZoneKey,
      facts: [
        { key: f.factVersion, value: pve.version || '—' },
        { key: f.factCpu, value: f.threads(n.cpuCount) },
        { key: f.factUptime, value: uptimeLabel(n.uptimeSecs, t) },
        {
          key: f.factBridges,
          value:
            pve.interfaces
              .filter((i) => i.node === n.name && i.kind === 'bridge')
              .map((i) => `${i.name}${i.vlanAware ? ` (${f.vlanAware})` : ''}`)
              .join(', ') || '—',
        },
      ],
      metrics: [
        { label: f.metricCpu, value: `${Math.round(n.cpuRatio * 100)}%`, percent: Math.round(n.cpuRatio * 100) },
        {
          label: f.metricMemory,
          value: `${bytesLabel(n.memUsed)} / ${bytesLabel(n.memTotal)}`,
          percent: memPct,
        },
        ...storages
          .filter((s) => s.total > 0)
          .map((s) => ({
            label: s.name,
            value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
            percent: pct(s.used, s.total),
          })),
      ],
      services: pve.guests
        .filter((g) => g.node === n.name)
        .map((g) => ({
          name: g.name || `${g.kind} ${g.vmid}`,
          detail: `${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid} · ${g.status}`,
          status: (g.status === 'running' ? 'ok' : 'warn') as Tone,
          provenance: 'Felmért' as const,
        })),
      warnings: storages
        .filter((s) => s.total > 0 && pct(s.used, s.total) >= 80)
        .map((s) => ({
          severity: (pct(s.used, s.total) >= 90 ? 'bad' : 'warn') as 'bad' | 'warn',
          text: f.storageHigh(s.name, pct(s.used, s.total)),
        })),
    };
  });

  const guests: Draft[] = pve.guests.map((g) => ({
    id: `guest:${g.vmid}`,
    kind: (g.kind === 'lxc' ? 'ct' : 'vm') as NodeKind,
    name: g.name || `${g.kind} ${g.vmid}`,
    subtitle: `${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid} · ${g.node}`,
    status: (g.status === 'running' ? 'ok' : 'warn') as Tone,
    zone: 'Servers' as ZoneKey,
    facts: [
      { key: f.factId, value: String(g.vmid) },
      { key: f.factState, value: g.status },
      { key: f.factHost, value: g.node },
      { key: f.factTags, value: g.tags || '—' },
    ],
    metrics: [
      { label: f.metricVcpu, value: String(g.cpuCount), percent: Math.min(100, g.cpuCount * 10) },
      { label: f.metricMemory, value: bytesLabel(g.memTotal), percent: Math.min(100, gib(g.memTotal) * 5) },
      { label: f.metricDisk, value: bytesLabel(g.diskTotal), percent: Math.min(100, gib(g.diskTotal) / 5) },
    ],
    services: [],
    warnings:
      g.status === 'running'
        ? []
        : [{ severity: 'warn' as const, text: f.guestNotRunning(g.status) }],
  }));

  const storage: Draft[] = pve.storages
    .filter((s) => s.total > 0)
    .map((s) => ({
      id: `store:${s.node}:${s.name}`,
      kind: 'storage' as NodeKind,
      name: s.name,
      subtitle: `${s.kind} · ${s.node}`,
      status: (pct(s.used, s.total) >= 90 ? 'bad' : pct(s.used, s.total) >= 80 ? 'warn' : 'ok') as Tone,
      zone: 'Servers' as ZoneKey,
      facts: [
        { key: f.factKind, value: s.kind },
        { key: f.factCapacity, value: bytesLabel(s.total) },
        { key: f.factFree, value: bytesLabel(s.available) },
        { key: f.factEnabled, value: s.enabled ? t.common.yes : t.common.no },
      ],
      metrics: [
        {
          label: f.metricUsage,
          value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
          percent: pct(s.used, s.total),
        },
      ],
      services: [],
      warnings: [],
    }));

  return { host, guests, storage };
}

/**
 * Which machines the controller learned on which port, by name.
 *
 * The controller reports every wired client with the switch and port it was
 * learned on. That is the third measured source for what is on a port, and the
 * only one that reaches equipment the controller does not manage: a Proxmox
 * host is not a UniFi device, so it has no uplink report, and a stock install
 * does not run `lldpd`, so the port shows up at a speed with nobody's name on
 * it. The controller knew all along.
 *
 * Where a client's address matches a surveyed Proxmox node, the estate's own
 * name for that node is used rather than the DHCP hostname — the two are often
 * different, and the map should say what the rest of the interface says.
 *
 * Keyed `switchMac#portIndex`.
 */
function fromWiredClients(unifi: UnifiSnapshot, pve: ProxmoxSnapshot | null): Map<string, string> {
  const byAddress = new Map<string, string>();
  for (const node of pve?.nodes ?? []) {
    for (const iface of pve?.interfaces ?? []) {
      if (iface.node !== node.name) continue;
      const address = iface.address ?? iface.cidr?.split('/')[0];
      if (address) byAddress.set(address, node.name);
    }
  }

  const out = new Map<string, string>();
  for (const c of unifi.clients) {
    if (!c.wired || !c.switchMac || c.switchPort <= 0) continue;
    const name = byAddress.get(c.ip) || c.hostname || c.ip;
    if (!name) continue;
    out.set(`${c.switchMac.toLowerCase()}#${c.switchPort}`, name);
  }
  return out;
}

function unifiNodes(
  unifi: UnifiSnapshot,
  pve: ProxmoxSnapshot | null,
  t: Dict,
): {
  gateways: Draft[];
  switches: Draft[];
  aps: Draft[];
  clients: Draft[];
} {
  const f = t.findings;
  // The controller reports a neighbour's MAC; the estate knows it by name.
  const nameByMac = new Map(unifi.devices.map((d) => [d.mac.toLowerCase(), d.name || d.model]));

  /*
   * Ports whose far end is known from an uplink report rather than from LLDP.
   *
   * A device states which port of its parent it hangs off, and which of its
   * own carries the link. That is measured, not inferred — and it is often the
   * only source, because a lot of hardware never announces itself. Without it
   * a real cable shows up as a line with no port number on either end, which
   * is the one thing the port view exists to answer.
   *
   * Keyed `deviceMac#portIndex`.
   */
  const onPort = fromWiredClients(unifi, pve);

  const fromUplink = new Map<string, string>();
  for (const d of unifi.devices) {
    if (!d.uplinkMac) continue;
    const parent = nameByMac.get(d.uplinkMac.toLowerCase());
    const child = d.name || d.model || d.mac;
    if (d.uplinkLocalPort > 0 && parent) {
      fromUplink.set(`${d.mac.toLowerCase()}#${d.uplinkLocalPort}`, parent);
    }
    if (d.uplinkRemotePort > 0) {
      fromUplink.set(`${d.uplinkMac.toLowerCase()}#${d.uplinkRemotePort}`, child);
    }
  }

  const drafts = unifi.devices.map<Draft>((d) => {
    const kind = deviceKind(d.kind);
    return {
      id: `unifi:${d.mac}`,
      kind,
      name: d.name || d.model || d.mac,
      subtitle: `${d.ip || '—'} · ${d.model}`,
      status: deviceStatus(d),
      zone: zoneOf(kind),
      ports: d.ports.map((p) => ({
        idx: p.idx,
        name: p.name,
        up: p.up,
        enabled: p.enabled,
        speed: p.speed,
        poe: p.poeEnabled,
        poePower: p.poePower,
        vlanMode: p.taggedVlanMgmt,
        // Prefer the estate's own name for a known device over the neighbour's
        // self-reported one, then what LLDP said, then the uplink report.
        // Three measured sources, strongest first: what the far end announced
        // over LLDP, what a UniFi device said about its own uplink, and what
        // the controller learned on the port. The last is the only one that
        // reaches a machine the controller does not manage.
        neighbour:
          nameByMac.get(p.neighbourMac.toLowerCase()) ??
          (p.neighbourName ||
            fromUplink.get(`${d.mac.toLowerCase()}#${p.idx}`) ||
            onPort.get(`${d.mac.toLowerCase()}#${p.idx}`) ||
            ''),
        neighbourPort: p.neighbourPort,
        uplink: p.isUplink,
      })),
      facts: [
        { key: f.factModel, value: d.model || '—' },
        { key: f.factFirmware, value: d.version || '—' },
        { key: f.factUptime, value: d.state === 1 ? uptimeLabel(d.uptimeSecs, t) : f.offline },
        { key: f.factMac, value: d.mac },
      ],
      metrics:
        d.state === 1
          ? [{ label: f.metricClients, value: String(d.clients), percent: Math.min(100, d.clients * 2) }]
          : [{ label: f.metricAvailability, value: 'Offline', percent: 0 }],
      services: [],
      warnings:
        d.state === 1
          ? []
          : [
              {
                severity: 'bad' as const,
                text: f.deviceOffline,
              },
            ],
    };
  });

  const gateways = drafts.filter((d) => d.kind === 'gateway');
  const switches = drafts.filter((d) => d.kind === 'switch');
  const aps = drafts.filter((d) => d.kind === 'ap');

  const clients: Draft[] = [];
  if (unifi.clients.length > 0) {
    const wireless = unifi.clients.filter((c) => !c.wired).length;
    const unknown = unifi.clients.filter((c) => !c.oui).length;
    clients.push({
      id: 'clients',
      kind: 'clients',
      name: f.clientsNode(unifi.clients.length),
      subtitle: f.clientsSubtitle(wireless, unifi.clients.length - wireless),
      status: unknown > 0 ? 'idle' : 'ok',
      zone: 'IoT',
      facts: [
        { key: f.factTotal, value: String(unifi.clients.length) },
        { key: f.factWireless, value: String(wireless) },
        { key: f.factWired, value: String(unifi.clients.length - wireless) },
        { key: f.factUnidentified, value: String(unknown) },
      ],
      metrics: [
        { label: f.factWireless, value: String(wireless), percent: pct(wireless, unifi.clients.length) },
      ],
      services: [],
      warnings:
        unknown > 0
          ? [{ severity: 'warn' as const, text: f.unknownVendor(unknown) }]
          : [],
    });
  }

  return { gateways, switches, aps, clients };
}

/* ------------------------------------------------------------------- links */

function buildLinks(
  unifi: UnifiSnapshot | null,
  pve: ProxmoxSnapshot | null,
  // Positions are deliberately absent: the links are worked out before
  // anything is placed, so the layout can use them to decide where each node
  // goes. Everything else about a node is still available.
  nodes: Draft[],
): NetLink[] {
  const links: NetLink[] = [];
  const present = new Set(nodes.map((n) => n.id));
  const add = (link: NetLink) => {
    if (present.has(link.from) && present.has(link.to)) links.push(link);
  };

  if (unifi) {
    // Uplink chains are reported by the devices themselves: measured.
    for (const d of unifi.devices) {
      if (!d.uplinkMac) continue;
      add({
        from: `unifi:${d.uplinkMac}`,
        to: `unifi:${d.mac}`,
        kind: d.state === 1 ? 'physical' : 'broken',
        direction: d.state === 1 ? 'both' : 'none',
      });
    }

    // Client associations are measured per client, but shown aggregated, so
    // the edge itself is an inference about the group.
    const apsWithClients = new Set(unifi.clients.filter((c) => c.apMac).map((c) => c.apMac));
    for (const apMac of apsWithClients) {
      add({ from: `unifi:${apMac}`, to: 'clients', kind: 'wireless', direction: 'both' });
    }
  }

  if (pve) {
    for (const node of pve.nodes) {
      for (const g of pve.guests.filter((x) => x.node === node.name)) {
        add({
          from: `pve:${node.name}`,
          to: `guest:${g.vmid}`,
          kind: g.status === 'running' ? 'physical' : 'broken',
          direction: g.status === 'running' ? 'both' : 'none',
        });
      }
      for (const s of pve.storages.filter((x) => x.node === node.name && x.total > 0)) {
        add({
          from: `pve:${node.name}`,
          to: `store:${node.name}:${s.name}`,
          kind: 'physical',
          direction: 'both',
        });
      }
    }
  }

  /*
   * The hypervisor's path into the network.
   *
   * Where the controller learned the host's address on a port, that is a
   * measured cable to a named switch on a numbered port, and it is drawn as
   * one. Where it did not — the host is on a plain switch, or the controller
   * has not seen its traffic — nothing read-only can prove which box it hangs
   * off, so the old behaviour stands: a logical line to the gateway, labelled
   * as inferred. The difference between the two is the difference between
   * knowing and assuming, and the map now shows which it has.
   */
  if (unifi && pve) {
    const host = nodes.find((n) => n.kind === 'host');
    const addresses = new Set(
      pve.interfaces
        .map((i) => i.address ?? i.cidr?.split('/')[0])
        .filter((a): a is string => Boolean(a)),
    );
    const learned = unifi.clients.find(
      (c) => c.wired && c.switchMac && c.switchPort > 0 && addresses.has(c.ip),
    );
    const switchOf = learned
      ? nodes.find((n) => n.id.toLowerCase() === `unifi:${learned.switchMac}`.toLowerCase())
      : undefined;

    if (host && learned && switchOf) {
      add({ from: switchOf.id, to: host.id, kind: 'physical', direction: 'both' });
    } else if (host) {
      const gateway = nodes.find((n) => n.kind === 'gateway');
      if (gateway) {
        add({
          from: gateway.id,
          to: host.id,
          kind: 'logical',
          direction: 'both',
          provenance: 'Becsült',
        });
      }
    }
  }

  return links;
}

/* ------------------------------------------------------------------ policy */

function buildZones(unifi: UnifiSnapshot, live: LiveEstate, t: Dict): Zone[] {
  const nets = unifi.networks.filter((n) => n.enabled);

  return nets.map((n) => {
    const ssids = unifi.wlans.filter((w) => w.networkId === n.id).map((w) => w.name);
    const clients = unifi.clients.filter((c) =>
      n.vlan != null ? c.vlan === n.vlan : c.network === n.name,
    ).length;

    /*
     * Isolation is a claim about traffic, so it is only made where traffic was
     * decided by a ruleset we read. Where the gateway's own bridge for this
     * network never appeared, the zone stays unmeasured — a network the loaded
     * ruleset never mentions is not thereby open, and not thereby closed.
     */
    const verdicts = nets
      .filter((other) => other !== n)
      .map((other) => combinedReachability(live, n.vlan, other.vlan)?.verdict)
      .filter((v): v is LiveVerdict => v !== undefined);

    if (verdicts.length === 0) {
      return {
        vlan: n.vlan != null ? String(n.vlan) : '—',
        name: n.name,
        net: n.subnet || '—',
        ssid: ssids.length > 0 ? ssids.join(', ') : '—',
        devices: clients,
        isolation: t.findings.notMeasured,
        state: 'Nem ellenőrzött' as const,
      };
    }

    const open = verdicts.filter((v) => v === 'allow').length;
    const shut = verdicts.filter((v) => v === 'block').length;

    return {
      vlan: n.vlan != null ? String(n.vlan) : '—',
      name: n.name,
      net: n.subnet || '—',
      ssid: ssids.length > 0 ? ssids.join(', ') : '—',
      devices: clients,
      isolation:
        shut === verdicts.length
          ? t.policy.isolatedFully
          : open === verdicts.length
            ? t.policy.isolatedNone
            : t.policy.isolatedPartly,
      state: 'Felmért' as const,
    };
  });
}

function buildRules(
  unifi: UnifiSnapshot,
  live: LiveFirewall,
  checkedAt: string,
  t: Dict,
): FirewallRule[] {
  const nameById = new Map(unifi.networks.map((n) => [n.id, n.name]));
  const resolve = (id: string) => (id ? (nameById.get(id) ?? id) : t.findings.anyTarget);

  return unifi.firewallRules
    .filter((r) => r.enabled)
    .sort((a, b) => a.index - b.index)
    .map((r) => {
      /*
       * Found in the loaded ruleset, so this rule is not merely configured.
       *
       * Not finding it proves nothing and is treated that way: the gateway
       * names a rule's id only on the log line that accompanies it, logging is
       * per-rule, and a rule with logging switched off leaves no id behind.
       * Absence here is ignorance, so the state stays what it was.
       */
      const loaded = r.id !== '' && live.ruleIds.has(r.id);

      return {
        src: resolve(r.src),
        dst: resolve(r.dst),
        port: r.dstPort ? `${r.protocol || 'any'} ${r.dstPort}` : r.protocol || t.findings.anyPort,
        action: (r.action === 'drop' || r.action === 'reject' ? 'Tilt' : 'Engedélyez') as
          | 'Tilt'
          | 'Engedélyez',
        state: loaded ? ('Felmért' as const) : ('Nem ellenőrzött' as const),
        checkedAt: loaded ? checkedAt : '—',
      };
    });
}

/* ---------------------------------------------------------------- findings */

function buildSignals(
  unifi: UnifiSnapshot | null,
  pve: ProxmoxSnapshot | null,
  leaks: { from: string; to: string }[],
  t: Dict,
): SecuritySignal[] {
  const f = t.findings;
  const out: SecuritySignal[] = [];

  /*
   * Listed first, and as a fault rather than a note, because it is a separation
   * the estate believes it has. Both rulesets were read and both were measured,
   * so this is not a suspicion — the traffic IPv4 stops has a way through.
   */
  for (const { from, to } of leaks.slice(0, 6)) {
    out.push({
      severity: 'bad',
      title: f.signalV6Leak(from, to),
      text: f.signalV6LeakText,
      zone: from,
    });
  }

  if (unifi) {
    for (const d of unifi.devices.filter((x) => x.state !== 1)) {
      out.push({
        severity: 'bad',
        title: f.signalOffline(d.name || d.mac),
        text: f.signalOfflineText,
        zone: d.ip || t.common.unknown,
      });
    }

    const guestWlans = unifi.wlans.filter((w) => w.isGuest && w.enabled);
    if (guestWlans.length === 0 && unifi.wlans.length > 0) {
      out.push({
        severity: 'warn',
        title: f.signalNoGuestSsid,
        text: f.signalNoGuestSsidText,
        zone: 'Wi-Fi',
      });
    }

    for (const w of unifi.wlans.filter((x) => x.enabled && /^(open|wep)$/i.test(x.security))) {
      out.push({
        severity: 'bad',
        title: f.signalWeakWifi(w.name),
        text: f.signalWeakWifiText(w.security),
        zone: 'Wi-Fi',
      });
    }

    if (unifi.firewallRules.length > 0) {
      out.push({
        severity: 'info',
        title: f.signalRulesRead(unifi.firewallRules.length),
        text: f.signalRulesReadText,
        zone: 'Policy',
      });
    }
  }

  if (pve) {
    for (const s of pve.storages.filter((x) => x.total > 0 && pct(x.used, x.total) >= 85)) {
      out.push({
        severity: pct(s.used, s.total) >= 90 ? 'bad' : 'warn',
        title: f.signalStorage(s.name, pct(s.used, s.total)),
        text: f.signalStorageText,
        zone: s.node,
      });
    }

    const nonVlanBridges = pve.interfaces.filter((i) => i.kind === 'bridge' && !i.vlanAware);
    if (nonVlanBridges.length > 0) {
      out.push({
        severity: 'info',
        title: f.signalNonVlanBridge,
        text: f.signalNonVlanBridgeText(nonVlanBridges.map((i) => i.name).join(', ')),
        zone: 'Proxmox',
      });
    }
  }

  return out;
}

function buildRisks(
  unifi: UnifiSnapshot | null,
  pve: ProxmoxSnapshot | null,
  t: Dict,
): Risk[] {
  const f = t.findings;
  const out: Risk[] = [];

  if (pve) {
    for (const s of pve.storages.filter((x) => x.total > 0 && pct(x.used, x.total) >= 80)) {
      out.push({
        severity: pct(s.used, s.total) >= 90 ? 'bad' : 'warn',
        title: f.signalStorage(s.name, pct(s.used, s.total)),
        where: `${s.node} · ${s.kind}`,
        text: f.riskStorageFree(bytesLabel(s.available)),
      });
    }
    for (const g of pve.guests.filter((x) => x.status !== 'running')) {
      out.push({
        severity: 'warn',
        title: f.riskGuestStopped(g.name || String(g.vmid)),
        where: `${g.node} · ${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid}`,
        text: f.riskGuestStoppedText(g.status),
      });
    }
    for (const d of pve.disks.filter((x) => x.health && x.health !== 'PASSED' && x.health !== 'OK')) {
      out.push({
        severity: 'bad',
        title: f.riskDisk(d.model || d.devpath),
        where: `${d.node} · ${d.serial || d.devpath}`,
        text: f.riskDiskText(d.health),
      });
    }
  }

  if (unifi) {
    for (const d of unifi.devices.filter((x) => x.state !== 1)) {
      out.push({
        severity: 'bad',
        title: f.riskDeviceOffline(d.name || d.mac),
        where: d.ip || d.mac,
        text: f.riskDeviceOfflineText,
      });
    }
    const unknown = unifi.clients.filter((c) => !c.oui).length;
    if (unknown > 0) {
      out.push({
        severity: 'warn',
        title: f.riskUnknownClients(unknown),
        where: `site: ${unifi.site}`,
        text: f.riskUnknownClientsText,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ public */

export function estateFromSnapshot(
  snapshot: SurveySnapshot,
  profiles: Profile[],
  t: Dict,
): Estate {
  const f = t.findings;
  const { proxmox: pve, unifi } = snapshot;

  const uni = unifi
    ? unifiNodes(unifi, pve, t)
    : { gateways: [], switches: [], aps: [], clients: [] };
  const prox = pve ? proxmoxNodes(pve, t) : { host: [], guests: [], storage: [] };

  const tiers = [
    uni.gateways,
    [...uni.switches, ...prox.host],
    [...uni.aps, ...prox.guests],
    [...uni.clients, ...prox.storage],
  ];

  // Links first: they depend only on ids, and the layout needs them to put
  // each device under whatever it hangs off.
  const links = buildLinks(unifi, pve, tiers.flat());
  const nodes = placeTiers(orderTiers(tiers, links));
  /*
   * The ruleset the gateway actually holds, where a survey could read it.
   *
   * Parsed once and threaded through, because the zone table, the matrix and
   * the rule list all answer the same question — is this in force? — and they
   * must not be able to disagree.
   */
  const live = readLiveEstate(
    unifi?.liveFirewall ?? '',
    unifi?.liveFirewallV6 ?? '',
    unifi?.liveAddresses ?? '',
  );
  const nets = unifi ? unifi.networks.filter((n) => n.enabled) : [];
  const zones = unifi ? buildZones(unifi, live, t) : [];

  const counts: Record<Tone, number> = { ok: 0, warn: 0, bad: 0, idle: 0 };
  for (const n of nodes) counts[n.status] += 1;

  /*
   * Zone-to-zone reachability, decided by the loaded ruleset where one was
   * read and left unverified where none was.
   *
   * Reading configuration can never establish these — that was the whole of
   * this table until the gateway itself could be asked — so a cell only stops
   * being unverified when a chain in the loaded ruleset decides it. The
   * diagonal is a network to itself, which never crosses the firewall.
   */
  const combined = nets.map((from, i) =>
    nets.map((to, j) => (i === j ? null : combinedReachability(live, from.vlan, to.vlan))),
  );

  const matrix: MatrixCell[][] = combined.map((row, i) =>
    row.map((pair, j) => {
      if (i === j) return 'a';
      if (!pair) return 'u';
      return pair.verdict === 'allow' ? 'a' : pair.verdict === 'block' ? 'b' : 'l';
    }),
  );

  const unverifiedCells = matrix.flat().filter((c) => c === 'u').length;

  /*
   * Pairs IPv4 separates and IPv6 does not.
   *
   * Worth naming rather than leaving as a colour, because it is the one thing
   * here that contradicts what the controller's own interface will tell you:
   * the rule is configured, it is loaded, it works — and the traffic gets
   * through anyway over the family the rule does not cover.
   */
  const leaks = combined.flatMap((row, i) =>
    row.flatMap((pair, j) => (pair?.leak ? [{ from: nets[i].name, to: nets[j].name }] : [])),
  );
  const rules = unifi ? buildRules(unifi, live.v4, snapshot.finishedAt, t) : [];
  const verifiedRules = rules.filter((r) => r.state === 'Felmért').length;

  const risks = buildRisks(unifi, pve, t);

  /*
   * Stores the survey was told about, whether or not it was told their size.
   *
   * A store that reports no figures used to be dropped here, which turned the
   * one case worth explaining — the API answered, but said nothing useful —
   * into an empty panel indistinguishable from having no Proxmox at all. It is
   * listed instead, marked as not measured, and `capacityNote` says why.
   */
  const stores = (pve?.storages ?? []).filter((s) => s.enabled || s.total > 0);
  const measured = stores.filter((s) => s.total > 0);

  const capacity: EstateBar[] = measured
    .sort((a, b) => pct(b.used, b.total) - pct(a.used, a.total))
    .slice(0, 6)
    .map<EstateBar>((s) => {
      const percent = pct(s.used, s.total);
      return {
        label: `${s.name} (${s.node})`,
        value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
        percent,
        tone: percent >= 90 ? 'bad' : percent >= 80 ? 'warn' : 'accent',
      };
    });

  const sizeless = stores.filter((x) => x.total === 0);
  for (const s of sizeless.slice(0, 4)) {
    capacity.push({ label: `${s.name} (${s.node})`, value: f.notMeasured, percent: 0, tone: 'idle' });
  }

  /*
   * Why the panel looks the way it does.
   *
   * Proxmox filters `/nodes/{node}/storage` by the caller's rights on each
   * store, so a token without Datastore.Audit is answered with an empty list
   * rather than an error — everything else in the survey succeeds and only the
   * capacity figures are missing. That is worth naming, because from the
   * outside it looks like the application failed to read them.
   *
   * A store that answered `active` is the one case that rules out "not
   * mounted", and only a positive reading proves it: an older snapshot taken
   * before the field existed reads false, which is absence of evidence rather
   * than evidence of absence.
   */
  const capacityNote = !pve
    ? undefined
    : stores.length === 0
      ? f.capacityNoStores
      : measured.length === 0
        ? sizeless.some((s) => s.active)
          ? f.capacityActiveNoFigures
          : f.capacityNoFigures
        : undefined;

  for (const n of pve?.nodes ?? []) {
    capacity.push({
      label: f.memoryOf(n.name),
      value: `${bytesLabel(n.memUsed)} / ${bytesLabel(n.memTotal)}`,
      percent: pct(n.memUsed, n.memTotal),
      tone: pct(n.memUsed, n.memTotal) >= 90 ? 'bad' : 'accent',
    });
  }

  const vms = pve?.guests.filter((g) => g.kind === 'qemu').length ?? 0;
  const cts = (pve?.guests.length ?? 0) - vms;
  const offline = unifi?.devices.filter((d) => d.state !== 1).length ?? 0;
  const critical = risks.filter((r) => r.severity === 'bad').length;

  const stats: EstateStat[] = [
    {
      label: f.statDevices,
      value: String(unifi?.devices.length ?? 0),
      hint: f.statDevicesHint((unifi?.devices.length ?? 0) - offline, offline),
      ...(offline > 0 ? { tone: 'bad' as Tone } : {}),
    },
    { label: f.statGuests, value: String(vms + cts), hint: f.statGuestsHint(vms, cts) },
    {
      label: f.statNetworks,
      value: String(zones.length),
      hint: f.statNetworksHint(zones.filter((z) => z.vlan !== '—').length),
    },
    {
      label: f.statRisks,
      value: String(risks.length),
      hint: f.statRisksHint(critical, risks.length - critical),
      ...(risks.length > 0 ? { tone: (critical > 0 ? 'bad' : 'warn') as Tone } : {}),
    },
    {
      label: f.statVerifiedRules,
      value: String(verifiedRules),
      suffix: ` / ${unifi?.firewallRules.length ?? 0}`,
      hint: live.v4.recognised ? f.statVerifiedRulesLive : f.statVerifiedRulesHint,
      tone: verifiedRules > 0 ? 'ok' : 'idle',
    },
  ];

  const backups = buildBackups(snapshot.proxmox, t);

  return {
    stats,
    capacity,
    ...(capacityNote ? { capacityNote } : {}),
    backups,
    // Derived from the same measurements as the risks, and from what the
    // backup summary established — a plan may not assume a restore point the
    // survey did not find.
    recommendations: recommendationsFromSnapshot(snapshot, backups, t),
    source: 'survey',
    surveyedAt: snapshot.finishedAt,
    nodes,
    links,
    zones,
    matrix,
    /*
     * Says which of the two the reader is looking at. The distinction is the
     * point of the panel, so leaving one note for both states would undo it.
     */
    matrixNote: live.v4.recognised
      ? t.policy.matrixNoteMeasured(
          matrix.length * matrix.length - unverifiedCells,
          live.v6.read,
        )
      : t.policy.matrixNoteLive,
    liveRead: live.v4.read,
    rules,
    signals: buildSignals(unifi, pve, leaks, t),
    risks,
    scanLog: snapshot.log.map<ScanLogEntry>((l) => ({
      time: l.time,
      source: l.source,
      message: l.message,
    })),
    profiles: profiles.map<ConnectionProfile>((p) => ({
      name: p.label,
      url: `${p.baseUrl}${p.site ? ` · site "${p.site}"` : ''}`,
      mode: p.fingerprint ? f.profileReadOnly : f.profileNoCert,
      status: p.fingerprint ? 'ok' : 'warn',
      lastRun: p.lastRun ?? '—',
    })),
    counts,
  };
}
