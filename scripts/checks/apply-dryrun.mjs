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
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { dryRun, writableDiffs, dict } = await import(`file://${OUT}`);

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

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
