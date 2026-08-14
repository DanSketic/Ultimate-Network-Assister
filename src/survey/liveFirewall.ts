/*
 * The firewall as the gateway actually holds it.
 *
 * Everything else in the policy view is read from a controller's configuration,
 * which says what someone intended. This reads `iptables-save` from the gateway
 * itself, which says what is loaded. The whole point of the distinction is that
 * the two can differ, so nothing here is allowed to soften into a guess: a fact
 * this parser cannot establish stays unestablished, and the interface goes on
 * saying "not verified" for it.
 *
 * On UniFi OS the ruleset is held in nftables while the only tool installed to
 * print it speaks iptables syntax (`iptables-nft`). That is the same ruleset in
 * different words, not an older parallel one.
 *
 * The shape being read, from a measured UDM sample:
 *
 *   -A UBIOS_FORWARD_IN_USER -i br30 -m comment --comment 000…494 -j UBIOS_DMZ_IN_USER
 *   -A UBIOS_GUEST_LAN_USER -m conntrack --ctstate RELATED,ESTABLISHED … -j ACCEPT
 *   -A UBIOS_GUEST_LAN_USER -m comment --comment 00000001097364144127 -j DROP
 *
 * So: one chain per ordered zone pair, its last rule unconditional and thus the
 * default for that pair, and a dispatch chain mapping interfaces to zones.
 */

/** allow · block · limited — the three a pair chain can actually establish. */
export type LiveVerdict = 'allow' | 'block' | 'limited';

export interface LivePair {
  from: string;
  to: string;
  /** The chain's final rule, which carries no match and is therefore the default. */
  fallback: 'accept' | 'drop';
  /** Earlier rules deciding the other way, so the default is not the whole story. */
  exceptions: number;
  /**
   * Replies are let back through, but nothing may be started from this side.
   *
   * Kept apart from a plain exception because it is what makes "blocked" mean
   * what a reader expects. A chain that accepts RELATED,ESTABLISHED and then
   * drops is closed to anything originating here — reporting that as "limited"
   * would understate it.
   */
  repliesOnly: boolean;
  verdict: LiveVerdict;
}

export interface LiveFirewall {
  /** `br30` → `DMZ`. Empty when the ruleset did not say. */
  interfaceZones: Map<string, string>;
  /** Keyed `FROM>TO`. */
  pairs: Map<string, LivePair>;
  /**
   * Every controller object id the ruleset logs under.
   *
   * A rule found here is loaded on the gateway. A rule *not* found here is not
   * thereby absent: logging is per-rule and can be off, and a rule with logging
   * off leaves no id behind. Absence is treated as ignorance, never as a denial.
   */
  ruleIds: Set<string>;
  /** Zone names the ruleset carries, in the order first seen. */
  zones: string[];
  /** True once a `UBIOS` zone chain was found, i.e. this really is a UniFi ruleset. */
  recognised: boolean;
  /**
   * The filter table's FORWARD policy — what happens to traffic no rule claims.
   *
   * Only interesting when there are no zone chains: a table with none of them
   * and a policy of ACCEPT forwards everything between networks, which is the
   * difference between "this family is not filtered" and "this family is not
   * carried". Null when the dump did not state one.
   */
  forwardPolicy: 'accept' | 'drop' | null;
  /** False when there was no dump to read, as against a dump that said nothing. */
  read: boolean;
}

export const EMPTY_LIVE: LiveFirewall = {
  interfaceZones: new Map(),
  pairs: new Map(),
  ruleIds: new Set(),
  zones: [],
  recognised: false,
  forwardPolicy: null,
  read: false,
};

/**
 * Tokens that appear where a zone name would, and are not zones.
 *
 * `UBIOS_LAN_IN_USER` is a dispatcher that jumps on to the real pair chains,
 * and reading it as the pair LAN→IN would invent a zone called IN — which is
 * how a list of nine zones became twenty-one.
 */
const NOT_A_ZONE = new Set(['IN', 'OUT', 'FORWARD', 'INPUT', 'OUTPUT', 'USER', 'JUMP', 'HOOK']);

const PAIR_CHAIN = /^UBIOS_([A-Z0-9]+)_([A-Z0-9]+)_USER$/;
const DISPATCH_TARGET = /^UBIOS_([A-Z0-9]+)_IN_USER$/;
const NFLOG_PREFIX = /--nflog-prefix\s+"([^"]*)"/;
const OBJECT_ID = /^[0-9a-f]{24}$/;

interface ParsedRule {
  chain: string;
  /** Everything before `-j`, with the bookkeeping comment removed. */
  match: string;
  target: string;
  /** No match left once the comment is stripped: this rule catches everything. */
  unconditional: boolean;
}

function parseRule(line: string): ParsedRule | null {
  const head = /^-A\s+(\S+)\s+([\s\S]*)$/.exec(line);
  if (!head) return null;
  const [, chain, rest] = head;

  const jump = /(?:^|\s)-j\s+(\S+)/.exec(rest);
  if (!jump) return null;

  const match = rest
    .slice(0, jump.index)
    // The 20-digit comment is an ordering key, not a condition on traffic.
    .replace(/-m\s+comment\s+--comment\s+\S+/g, '')
    .trim();

  return { chain, match, target: jump[1], unconditional: match === '' };
}

/** The verdict a pair chain supports, or null when it supports none. */
function verdictOf(rules: ParsedRule[]): Omit<LivePair, 'from' | 'to'> | null {
  // NFLOG rules log and fall through; they decide nothing.
  const deciding = rules.filter((r) => r.target !== 'NFLOG' && r.target !== 'RETURN');
  const last = deciding[deciding.length - 1];

  /*
   * Without an unconditional last rule there is no default to report. That is
   * not a defect to work around: a chain whose end can be reached without
   * matching anything falls through to the caller, and what happens then is a
   * question about a different chain.
   */
  if (!last || !last.unconditional) return null;

  const fallback = last.target === 'ACCEPT' ? 'accept' : last.target === 'DROP' || last.target === 'REJECT' ? 'drop' : null;
  if (!fallback) return null;

  const decisive = new Set(['ACCEPT', 'DROP', 'REJECT']);
  const differing = deciding
    .slice(0, -1)
    .filter((r) => decisive.has(r.target) && (r.target === 'ACCEPT') !== (fallback === 'accept'));

  const stateful = (r: ParsedRule) => /--(?:ct)?state\s+RELATED,ESTABLISHED/.test(r.match);
  const repliesOnly = fallback === 'drop' && differing.length > 0 && differing.every(stateful);
  const exceptions = repliesOnly ? 0 : differing.length;

  return {
    fallback,
    exceptions,
    repliesOnly,
    verdict: exceptions > 0 ? 'limited' : fallback === 'accept' ? 'allow' : 'block',
  };
}

/**
 * Reads an `iptables-save` dump.
 *
 * Tolerant of anything it does not recognise — a dump from a machine that is
 * not a UniFi gateway simply yields nothing, rather than half-parsed claims.
 */
export function parseLiveFirewall(text: string): LiveFirewall {
  /*
   * Only genuinely empty text counts as unread.
   *
   * This once returned early on a dump with no `-A` lines, which is wrong in
   * the one place it matters most: an IPv6 table holding nothing but its chain
   * policies is a real, readable answer — the zone system is not present and
   * the family's default decides. Treating it as "not read" made every such
   * gateway look like one whose IPv6 could not be examined.
   */
  if (!text.trim()) return EMPTY_LIVE;

  const byChain = new Map<string, ParsedRule[]>();
  const ruleIds = new Set<string>();
  const interfaceZones = new Map<string, string>();
  let forwardPolicy: 'accept' | 'drop' | null = null;
  let table = '';

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.startsWith('*')) {
      table = line.slice(1).trim();
      continue;
    }

    /*
     * `:FORWARD DROP [0:0]`. Only from the filter table — mangle declares a
     * FORWARD chain too, and its policy says nothing about what is permitted.
     */
    if (line.startsWith(':') && table === 'filter') {
      const policy = /^:FORWARD\s+(ACCEPT|DROP)\b/.exec(line);
      if (policy) forwardPolicy = policy[1] === 'ACCEPT' ? 'accept' : 'drop';
      continue;
    }

    if (!line.startsWith('-A ')) continue;

    /*
     * Ids come off the log rules, which is the only place the ruleset names the
     * controller object a rule came from. Read before the NFLOG rules are
     * dropped from the decision, because they are worthless for deciding and
     * the only source for this.
     */
    const logged = NFLOG_PREFIX.exec(line);
    if (logged) {
      const id = logged[1].split(';')[0].trim();
      if (OBJECT_ID.test(id)) ruleIds.add(id);
    }

    const rule = parseRule(line);
    if (!rule) continue;

    if (rule.chain === 'UBIOS_FORWARD_IN_USER') {
      const zone = DISPATCH_TARGET.exec(rule.target);
      const iface = /(?:^|\s)-i\s+(\S+)/.exec(rule.match);
      if (zone && iface && !NOT_A_ZONE.has(zone[1])) interfaceZones.set(iface[1], zone[1]);
    }

    const list = byChain.get(rule.chain);
    if (list) list.push(rule);
    else byChain.set(rule.chain, [rule]);
  }

  const pairs = new Map<string, LivePair>();
  const zones: string[] = [];
  const seen = new Set<string>();

  for (const [chain, rules] of byChain) {
    const named = PAIR_CHAIN.exec(chain);
    if (!named) continue;
    const [, from, to] = named;
    if (NOT_A_ZONE.has(from) || NOT_A_ZONE.has(to)) continue;

    for (const z of [from, to]) {
      if (!seen.has(z)) {
        seen.add(z);
        zones.push(z);
      }
    }

    const verdict = verdictOf(rules);
    if (verdict) pairs.set(`${from}>${to}`, { from, to, ...verdict });
  }

  return {
    interfaceZones,
    pairs,
    ruleIds,
    zones,
    recognised: zones.length > 0,
    forwardPolicy,
    read: true,
  };
}

/* ------------------------------------------------------------------ IPv6 */

/**
 * Which interfaces carry a routable IPv6 address, read from `ip -br addr`.
 *
 * This is the fact that makes an IPv6 comparison mean anything. An IPv6 table
 * with no zone chains is either a family that is not filtered or a family that
 * is not carried, and those are opposite conclusions: the first means a network
 * blocked over IPv4 is reachable anyway, the second means the IPv4 verdict is
 * the whole truth. Nothing in a firewall dump distinguishes them, so the
 * addresses are measured rather than assumed.
 *
 * Link-local addresses do not count. `fe80::/10` is confined to one segment and
 * is never routed between networks, so its presence is not IPv6 reachability —
 * treating it as such would report a leak on every estate that has none.
 */
export function parseRoutableV6(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;

  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 2) continue;
    // `br0@if3` on some kernels; the alias is not part of the name.
    const iface = parts[0].split('@')[0];
    if (!iface || iface === 'lo') continue;

    for (const token of parts.slice(1)) {
      const addr = token.split('/')[0].toLowerCase();
      if (!addr.includes(':')) continue;
      if (addr === '::1' || addr.startsWith('fe80:')) continue;
      out.add(iface);
      break;
    }
  }
  return out;
}

/** Both halves of the firewall, plus what is needed to compare them. */
export interface LiveEstate {
  v4: LiveFirewall;
  v6: LiveFirewall;
  /** Interfaces with a routable IPv6 address. */
  v6Interfaces: Set<string>;
}

export const EMPTY_ESTATE: LiveEstate = {
  v4: EMPTY_LIVE,
  v6: EMPTY_LIVE,
  v6Interfaces: new Set(),
};

export function readLiveEstate(v4: string, v6: string, addresses: string): LiveEstate {
  return {
    v4: parseLiveFirewall(v4),
    v6: parseLiveFirewall(v6),
    v6Interfaces: parseRoutableV6(addresses),
  };
}

/**
 * What both families together do with traffic from one network to another.
 *
 * `scope` records which of them the answer rests on, because "blocked over
 * IPv4, and IPv6 does not reach here" and "blocked over IPv4, and IPv6 was
 * never read" are different statements and only the first is a full answer.
 */
export interface CombinedVerdict {
  verdict: LiveVerdict;
  v4: LiveVerdict;
  v6: LiveVerdict | null;
  scope: 'both' | 'v4only' | 'v4NoV6Here';
  /**
   * IPv4 separates these networks and IPv6 does not, so they are not separated.
   *
   * The one conclusion neither family reaches on its own, and the reason for
   * reading both.
   */
  leak: boolean;
}

/**
 * Combines the two families for a pair of networks.
 *
 * Null when IPv4 — the family the network map is built on — decided nothing,
 * since an IPv6-only verdict about a pair whose IPv4 behaviour is unknown
 * cannot be reported as that pair's behaviour.
 */
export function combinedReachability(
  live: LiveEstate,
  fromVlan: number | null,
  toVlan: number | null,
): CombinedVerdict | null {
  const four = reachability(live.v4, fromVlan, toVlan);
  if (!four) return null;

  const plain = { verdict: four.verdict, v4: four.verdict };

  // Nothing to compare against: report IPv4 and say that is what it is.
  if (!live.v6.read) return { ...plain, v6: null, scope: 'v4only', leak: false };

  const carriesV6 =
    live.v6Interfaces.has(bridgeFor(fromVlan)) && live.v6Interfaces.has(bridgeFor(toVlan));
  if (!carriesV6) return { ...plain, v6: null, scope: 'v4NoV6Here', leak: false };

  /*
   * IPv6 reaches both ends, so the ruleset has to say something about it. With
   * no zone chain for this pair the whole zone system is absent from the IPv6
   * table, and the family's default decides — which on a policy of ACCEPT means
   * the traffic simply passes.
   */
  const sixPair = reachability(live.v6, fromVlan, toVlan);
  const six: LiveVerdict | null = sixPair
    ? sixPair.verdict
    : live.v6.forwardPolicy === 'drop'
      ? 'block'
      : live.v6.forwardPolicy === 'accept'
        ? 'allow'
        : null;

  // Read, but silent on both counts: no policy line and no chain.
  if (!six) return { ...plain, v6: null, scope: 'v4only', leak: false };

  /*
   * Disagreement is reported as limited rather than as either half. Some
   * traffic passes and some does not, which is what limited means — and where
   * the disagreement is IPv4 closing a door IPv6 leaves open, `leak` carries
   * that separately, because a cell colour is too small a place to say it.
   */
  const leak = four.verdict === 'block' && six !== 'block';
  const verdict: LiveVerdict = four.verdict === six ? four.verdict : 'limited';

  return { verdict, v4: four.verdict, v6: six, scope: 'both', leak };
}

/**
 * The bridge a network's traffic arrives on.
 *
 * UniFi OS names it after the VLAN — `br30` for VLAN 30 — and the untagged
 * network sits on `br0`. Returned as a guess to be confirmed against the
 * interface map rather than trusted: a bridge the ruleset never mentioned means
 * this network's zone is unknown, and unknown is a reportable answer.
 */
export function bridgeFor(vlan: number | null): string {
  return `br${vlan ?? 0}`;
}

/** Which firewall zone a network sits in, or null when the ruleset did not say. */
export function zoneOfVlan(live: LiveFirewall, vlan: number | null): string | null {
  return live.interfaceZones.get(bridgeFor(vlan)) ?? null;
}

/** What the loaded ruleset does with traffic from one network to another. */
export function reachability(
  live: LiveFirewall,
  fromVlan: number | null,
  toVlan: number | null,
): LivePair | null {
  const from = zoneOfVlan(live, fromVlan);
  const to = zoneOfVlan(live, toVlan);
  if (!from || !to) return null;
  return live.pairs.get(`${from}>${to}`) ?? null;
}
