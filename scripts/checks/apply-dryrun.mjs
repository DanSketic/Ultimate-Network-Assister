/*
 * The dry run's verdicts.
 *
 * What is measured here is the difference between "this clashes with something"
 * and "something else already provides this". The case that forced the
 * distinction: a gateway's VPN server creates its own network for WireGuard, so
 * a blueprint asking for a VPN range finds that range occupied — by exactly the
 * thing it wanted. Reporting that as a clash sends the user hunting for a
 * conflict that is not there, and writing to it would take over a network the
 * VPN server owns.
 *
 * The subnet comparison is checked alongside it, because the two spellings of
 * one range — the controller's gateway form and the network address — have to
 * count as the same range or none of the above ever triggers.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'dryrun-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { dryRun, writableDiffs } from '${ROOT}/src/apply/dryRun';
               export { compileFirewallOperations } from '${ROOT}/src/apply/firewall';
               export { parseLiveFirewall } from '${ROOT}/src/survey/liveFirewall';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { dryRun, writableDiffs, compileFirewallOperations, parseLiveFirewall, dict } =
  await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const x = dict('en').apply.blocker;

/** A network operation the way compile.ts builds one. */
const netOp = (vlan, name, gateway, role) => ({
  id: `net-${vlan}`,
  kind: 'unifi.network',
  label: `VLAN ${vlan} · ${name}`,
  moduleId: 'vlan-wifi',
  ...(role ? { role } : {}),
  matchField: 'vlan',
  matchValue: vlan,
  desired: {
    name,
    purpose: 'corporate',
    vlan_enabled: true,
    vlan,
    ip_subnet: `${gateway}/24`,
    enabled: true,
  },
  createOnly: {},
  managedFields: ['name', 'purpose', 'vlan_enabled', 'vlan', 'ip_subnet', 'enabled'],
});

const liveNet = (over) => ({
  id: 'x', name: 'net', vlan: null, subnet: '', purpose: 'corporate',
  enabled: true, dhcpEnabled: true, ...over,
});

const run = (operations, networks) =>
  dryRun(
    {
      operations,
      snapshot: {
        id: 's1',
        unifi: { networks, wlans: [], firewallRules: [], clients: [], portProfiles: [] },
      },
      controllerHost: '192.168.2.10',
    },
    x,
  );

/* ------------------------------------- the VPN server's own network */

const vpnServer = liveNet({
  id: 'vpn1',
  name: 'One-Click VPN',
  // What the controller writes for a VPN server's network: no VLAN id, the
  // gateway address rather than the network address, and a VPN purpose.
  subnet: '192.168.40.1/24',
  purpose: 'remote-user-vpn',
});

const vpn = run([netOp(40, 'VPN', '192.168.40.1', 'vpn')], [vpnServer]);
check('a VPN range the VPN server already serves is not a clash',
  vpn.diffs[0]?.verdict === 'external', String(vpn.diffs[0]?.verdict));
check('and it says which network provides it',
  (vpn.diffs[0]?.note ?? '').includes('One-Click VPN'), vpn.diffs[0]?.note ?? '—');
check('so nothing about it is written',
  writableDiffs(vpn).length === 0, `${writableDiffs(vpn).length} writable`);
check('and it does not hold the whole run back',
  vpn.blockers.length === 0, vpn.blockers.join(' ; '));

/* ---------------------------- the same network under the other spelling */

const asNetworkAddress = run(
  [netOp(40, 'VPN', '192.168.40.1', 'vpn')],
  [liveNet({ ...vpnServer, subnet: '192.168.40.0/24' })],
);
check('the network address and the gateway form name the same range',
  asNetworkAddress.diffs[0]?.verdict === 'external',
  String(asNetworkAddress.diffs[0]?.verdict));

/* ----------------------------------- what must still count as a clash */

const ordinaryClash = run(
  [netOp(41, 'HOME', '192.168.40.1')],
  [liveNet({ id: 'lan1', name: 'Old LAN', vlan: 12, subnet: '192.168.40.1/24' })],
);
check('two ordinary networks on one range still clash',
  ordinaryClash.diffs[0]?.verdict === 'conflict', String(ordinaryClash.diffs[0]?.verdict));
check('and that does hold the run back', ordinaryClash.blockers.length > 0);

const nonVpnOntoVpn = run(
  [netOp(41, 'HOME', '192.168.40.1')],
  [vpnServer],
);
check('a non-VPN network aimed at the VPN range is a clash',
  nonVpnOntoVpn.diffs[0]?.verdict === 'conflict', String(nonVpnOntoVpn.diffs[0]?.verdict));

const vpnRoleElsewhere = run(
  [netOp(40, 'VPN', '192.168.40.1', 'vpn')],
  [liveNet({ id: 'lan1', name: 'Old LAN', vlan: 12, subnet: '192.168.40.1/24' })],
);
check('a VPN network clashing with an ordinary one is still a clash',
  vpnRoleElsewhere.diffs[0]?.verdict === 'conflict', String(vpnRoleElsewhere.diffs[0]?.verdict));

/* --------------------------------------------- the ordinary verdicts hold */

const fresh = run([netOp(40, 'VPN', '192.168.40.1', 'vpn')], []);
check('with nothing there, the network is created',
  fresh.diffs[0]?.verdict === 'create', String(fresh.diffs[0]?.verdict));

const already = run(
  [netOp(40, 'VPN', '192.168.40.1', 'vpn')],
  [liveNet({ id: 'v40', name: 'VPN', vlan: 40, subnet: '192.168.40.1/24' })],
);
check('a matching network needs no change',
  already.diffs[0]?.verdict === 'noop', String(already.diffs[0]?.verdict));

const counted = run(
  [netOp(40, 'VPN', '192.168.40.1', 'vpn'), netOp(50, 'RDP', '192.168.50.1')],
  [vpnServer],
);
check('the counts add up to the operations',
  Object.values(counted.counts).reduce((a, b) => a + b, 0) === counted.diffs.length,
  JSON.stringify(counted.counts),
);

/* ============================ the firewall, end to end ==================== */

/*
 * From the target state to a verdict, through the guard.
 *
 * What is measured is not that rules can be written but that the ones which
 * could close the path this application is standing on are refused before
 * anything is sent — and that the refusal survives the whole pipeline rather
 * than living only in the module that computes it.
 */

const ZONE_TEMPLATE = JSON.stringify({
  _id: 'z-existing', site_id: 's', name: 'LAN', network_ids: ['n-lan'],
});
const POLICY_TEMPLATE = JSON.stringify({
  _id: 'p-existing', site_id: 's', name: 'Existing', action: 'ALLOW', enabled: true,
  index: 2000, protocol: 'all', logging: false,
  source: { zone_id: 'z-existing', matching_target: 'ANY' },
  destination: { zone_id: 'z-guest', matching_target: 'ANY' },
});

const fwUnifi = {
  networks: [
    { id: 'n-lan', name: 'MGMT', vlan: null, subnet: '192.168.2.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true },
    { id: 'n-guest', name: 'GUEST', vlan: 30, subnet: '192.168.30.1/24', purpose: 'guest', enabled: true, dhcpEnabled: true },
    { id: 'n-iot', name: 'IOT', vlan: 71, subnet: '192.168.71.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true },
  ],
  wlans: [], firewallRules: [], clients: [], portProfiles: [],
  zones: [
    { id: 'z-existing', name: 'LAN', networkIds: ['n-lan'] },
    { id: 'z-guest', name: 'GUEST', networkIds: ['n-guest'] },
    { id: 'z-iot', name: 'IOT', networkIds: ['n-iot'] },
  ],
  zoneEndpoint: 'firewall/zones',
  policyEndpoint: 'firewall-policies',
  zoneTemplate: ZONE_TEMPLATE,
  policyTemplate: POLICY_TEMPLATE,
};

const resolved = {
  zones: [
    { name: 'GUEST', purpose: '', vlans: [30], moduleId: 'firewall' },
    { name: 'IOT', purpose: '', vlans: [71], moduleId: 'firewall' },
  ],
  policies: [
    { order: 800, from: 'GUEST', to: 'IOT', action: 'block', log: true, purpose: '', moduleId: 'firewall' },
    { order: 300, from: 'IOT', to: 'GUEST', action: 'allow', log: false, purpose: '', moduleId: 'firewall' },
    { order: 810, from: 'GUEST', to: 'LAN', action: 'block', log: true, purpose: '', moduleId: 'firewall' },
    { order: 900, from: 'GUEST', to: 'every zone', action: 'block', log: true, purpose: '', moduleId: 'firewall' },
  ],
};

const built = compileFirewallOperations(resolved, fwUnifi);
const kinds = built.operations.map((o) => `${o.kind.split('.')[1]}:${o.label}`);
console.log(`   firewall operations: ${built.operations.length}`);
for (const k of kinds) console.log(`     ${k}`);

check('the zones come first', built.operations.slice(0, 2).every((o) => o.kind === 'unifi.firewallzone'));
check(
  'and the allow comes before both blocks',
  built.operations.findIndex((o) => o.label.includes('allow')) <
    built.operations.findIndex((o) => o.label.includes('block')),
);
check(
  'a rule target written as prose is not compiled',
  !built.operations.some((o) => o.label.includes('every zone')),
  kinds.join(', '),
);
check(
  'the created object carries the controller shape, not ours',
  built.operations.some((o) => o.kind === 'unifi.firewallpolicy' && 'protocol' in o.createOnly),
);
check(
  'and never the id of the object it was copied from',
  built.operations.every((o) => !('_id' in o.createOnly) && !('site_id' in o.createOnly)),
);

const noSurvey = compileFirewallOperations(resolved, null);
check('with no survey there is nothing to write', noSurvey.operations.length === 0);
const noEndpoint = compileFirewallOperations(resolved, { ...fwUnifi, policyEndpoint: '' });
check('and none where the controller never answered', noEndpoint.operations.length === 0);
const noTemplate = compileFirewallOperations(resolved, { ...fwUnifi, policyTemplate: '' });
check('nor where there is no object to copy', noTemplate.operations.length === 0);

/* ------------------------------------------------ and now through the guard */

const fwLive = parseLiveFirewall(`*filter
:FORWARD DROP [0:0]
-A UBIOS_FORWARD_IN_USER -i br0 -j UBIOS_LAN_IN_USER
-A UBIOS_FORWARD_IN_USER -i br30 -j UBIOS_GUEST_IN_USER
-A UBIOS_FORWARD_IN_USER -i br71 -j UBIOS_IOT_IN_USER
-A UBIOS_GUEST_LAN_USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A UBIOS_GUEST_LAN_USER -j DROP
-A UBIOS_GUEST_IOT_USER -j RETURN
-A UBIOS_IOT_GUEST_USER -j RETURN
COMMIT
`);

const fwReport = dryRun(
  {
    operations: built.operations,
    snapshot: { id: 's1', unifi: fwUnifi },
    controllerHost: '192.168.2.10',
    live: fwLive,
  },
  x,
);
const diffFor = (needle) => fwReport.diffs.find((d) => d.operation.label.includes(needle));

check('the block onto the admin zone is refused', diffFor('GUEST → LAN')?.verdict === 'conflict',
  String(diffFor('GUEST → LAN')?.verdict));
check('and says which zone it is about',
  (diffFor('GUEST → LAN')?.blockedReason ?? '').includes('LAN'));
check('the block between two other zones is written', diffFor('GUEST → IOT')?.verdict === 'create',
  String(diffFor('GUEST → IOT')?.verdict));
check('and so is the allow', diffFor('IOT → GUEST')?.verdict === 'create',
  String(diffFor('IOT → GUEST')?.verdict));
check('nothing refused reaches the writable set',
  writableDiffs(fwReport).every((d) => !d.operation.label.includes('GUEST → LAN')));

// Without the ruleset there is no instrument, so no block may be written at all.
const blindReport = dryRun(
  { operations: built.operations, snapshot: { id: 's1', unifi: fwUnifi }, controllerHost: '192.168.2.10' },
  x,
);
const blindBlocks = blindReport.diffs.filter((d) => d.operation.policy?.action === 'block');
check('with no ruleset read, every block is refused',
  blindBlocks.length > 0 && blindBlocks.every((d) => d.verdict === 'conflict'),
  `${blindBlocks.filter((d) => d.verdict === 'conflict').length}/${blindBlocks.length}`);
check('while the allows still go through',
  blindReport.diffs
    .filter((d) => d.operation.policy?.action === 'allow')
    .every((d) => d.verdict === 'create'));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
