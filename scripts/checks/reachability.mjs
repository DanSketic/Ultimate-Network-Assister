/*
 * The guard that decides whether a change could cut the hand applying it.
 *
 * This is the check that has to be right for the firewall to be writable at
 * all. The argument it rests on is not "we are careful" but "the undo is not
 * symmetric with the do": a change that closes the path to the controller
 * cannot be rolled back through that path, and on UniFi the gateway does not
 * own its own ruleset — the controller re-provisions it — so a dead man's
 * switch armed on the gateway would be fighting the thing about to overwrite
 * it. That leaves refusing in advance as the only defence, and a refusal is
 * only as good as what it is computed from.
 *
 * So three properties are measured here: an allow can never be refused (it
 * cannot close anything), a block is refused wherever the answer rests on
 * something unread, and the subnet maths is exact rather than /24-shaped —
 * because the one case where being approximately right costs the session is a
 * controller on a wider prefix.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'reach-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export * from '${ROOT}/src/apply/reachability';
               export * from '${ROOT}/src/apply/subnet';
               export { parseLiveFirewall, EMPTY_LIVE } from '${ROOT}/src/survey/liveFirewall';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const {
  adminPathOf, guardNetwork, guardPolicy, adminPathHolds,
  containsAddress, rangeOf, sameRange, parseLiveFirewall, EMPTY_LIVE,
} = await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

/* ------------------------------------------------------- the subnet maths */

check('an address inside its /24 is found', containsAddress('192.168.2.0/24', '192.168.2.10'));
check('and one outside it is not', !containsAddress('192.168.2.0/24', '192.168.3.10'));
check(
  'a /22 holds all four of its /24s',
  ['10.0.0.5', '10.0.1.5', '10.0.2.5', '10.0.3.5'].every((a) => containsAddress('10.0.0.0/22', a)) &&
    !containsAddress('10.0.0.0/22', '10.0.4.5'),
);
check('the gateway form and the network address name one range',
  sameRange('192.168.40.1/24', '192.168.40.0/24'));
check('and two different ranges do not', !sameRange('192.168.40.1/24', '192.168.41.0/24'));
check('nonsense yields nothing rather than a false match',
  rangeOf('not an address') === null && !containsAddress('garbage', '1.2.3.4'));

/* ------------------------------------------------------------ the ruleset */

// A minimal UniFi-shaped dump: two zones on two bridges, LAN open, GUEST shut.
const DUMP = `*filter
:FORWARD DROP [0:0]
-A UBIOS_FORWARD_IN_USER -i br0 -j UBIOS_LAN_IN_USER
-A UBIOS_FORWARD_IN_USER -i br30 -j UBIOS_GUEST_IN_USER
-A UBIOS_LAN_LAN_USER -j RETURN
-A UBIOS_LAN_GUEST_USER -j RETURN
-A UBIOS_GUEST_LAN_USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A UBIOS_GUEST_LAN_USER -j DROP
-A UBIOS_GUEST_GUEST_USER -j RETURN
COMMIT
`;
const live = parseLiveFirewall(DUMP);
check('the sample ruleset parses as a UniFi one', live.read && live.recognised,
  `${live.zones.length} zones, ${live.pairs.size} pairs`);

const unifi = {
  networks: [
    { id: 'n1', name: 'MGMT', vlan: null, subnet: '192.168.2.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true },
    { id: 'n2', name: 'GUEST', vlan: 30, subnet: '192.168.30.1/24', purpose: 'guest', enabled: true, dhcpEnabled: true },
  ],
};

const path = adminPathOf(unifi, '192.168.2.10', live);
check('the controller is placed in its own network', path.network?.name === 'MGMT', path.network?.name ?? '—');
check('and in the zone the ruleset puts that bridge in', path.zone === 'LAN', String(path.zone));
check('the ruleset counts as measured', path.measured);

/* --------------------------------------------------- what may be written */

check('an allow is never refused, on any pair',
  guardPolicy({ from: 'GUEST', to: 'LAN', action: 'allow' }, path, live) === null);
check('a block between two other zones is allowed',
  guardPolicy({ from: 'GUEST', to: 'GUEST', action: 'block' }, path, live) === null);

const ontoAdmin = guardPolicy({ from: 'GUEST', to: 'LAN', action: 'block' }, path, live);
check('a block naming the zone the controller is reached through is refused',
  ontoAdmin?.code === 'adminZone', ontoAdmin?.code ?? 'allowed');
const fromAdmin = guardPolicy({ from: 'LAN', to: 'GUEST', action: 'block' }, path, live);
check('and so is one in the other direction', fromAdmin?.code === 'adminZone', fromAdmin?.code ?? 'allowed');

const strange = guardPolicy({ from: 'GUEST', to: 'CAMERA', action: 'block' }, path, live);
check('a block naming a zone the ruleset never mentioned is refused',
  strange?.code === 'unknownZone', strange?.code ?? 'allowed');

/* ------------------------------- with no ruleset read, nothing may deny */

const blind = adminPathOf(unifi, '192.168.2.10', EMPTY_LIVE);
check('an unread ruleset is not counted as measured', !blind.measured);
check('and every block is refused on that ground alone',
  guardPolicy({ from: 'GUEST', to: 'GUEST', action: 'block' }, blind, EMPTY_LIVE)?.code === 'unmeasured');
check('while an allow still passes',
  guardPolicy({ from: 'GUEST', to: 'GUEST', action: 'allow' }, blind, EMPTY_LIVE) === null);
check('a null ruleset behaves the same as an empty one',
  guardPolicy({ from: 'GUEST', to: 'GUEST', action: 'block' }, adminPathOf(unifi, '192.168.2.10', null), null)
    ?.code === 'unmeasured');

/* ------------------------------------------- the network carrying the session */

check('the admin network refuses a write', guardNetwork('192.168.2.1/24', path)?.code === 'adminNetwork');
check('another network does not', guardNetwork('192.168.30.1/24', path) === null);
const wide = adminPathOf(
  { networks: [{ id: 'w', name: 'FLAT', vlan: null, subnet: '10.0.0.1/22', purpose: 'corporate', enabled: true, dhcpEnabled: true }] },
  '10.0.3.10',
  live,
);
check('a controller on a /22 is inside its network, not outside it',
  wide.network?.name === 'FLAT', wide.network?.name ?? 'not found');
check('and that network is guarded', guardNetwork('10.0.0.1/22', wide)?.code === 'adminNetwork');

/* ---------------------------------------------------- confirming afterwards */

// The guest zone's chain to the LAN ends in a drop after letting replies back,
// so the ruleset does say this one: nothing may be started from there.
check('a closed path reads as closed', adminPathHolds(path, live, 30) === false);

/*
 * And where the chain ends in a RETURN, no answer is given at all — falling out
 * of a chain leaves the decision to another one, so the reading would be about
 * a chain nobody looked at. That refusal is the property worth holding on to:
 * a confirmation that guesses is worse than no confirmation, because the whole
 * point of it is to be the thing that catches a mistake.
 */
check('an inconclusive chain yields no answer rather than a reassuring one',
  adminPathHolds(path, live, null) === null);
check('and neither does a network the ruleset never mentioned',
  adminPathHolds(path, live, 999) === null);

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
