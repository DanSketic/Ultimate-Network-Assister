import { fileURLToPath } from 'node:url';
/*
 * Walks the two dictionaries in step and reports any leaf where the English
 * string is byte-identical to the Hungarian one — the signature of a key that
 * was copied across and never translated. Proper nouns and symbols are allowed
 * to match, so they are listed explicitly rather than guessed at.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = new URL('./dict-bundle.mjs', import.meta.url).pathname.slice(1);

await build({
  entryPoints: [`${ROOT}/src/i18n/index.ts`],
  bundle: true,
  format: 'esm',
  outfile: OUT,
  platform: 'neutral',
  alias: { '@': `${ROOT}/src` },
  logLevel: 'error',
});

const { dict } = await import(`file://${OUT}`);
const hu = dict('hu');
const en = dict('en');

/*
 * Terms Hungarian uses in their English form, so an identical pair is the
 * correct translation rather than a missing one. Listed rather than guessed
 * at: a heuristic that let "anything short" through would hide real misses.
 */
const SHARED = new Set([
  'Proxmox', 'UniFi', 'VLAN', 'SSH', 'API', 'IP', 'MAC', 'DNS', 'DHCP', 'VPN',
  'LXC', 'VM', 'ZFS', 'PoE', 'LLDP', 'TLS', 'SHA-256', 'CPU', 'RAM', 'NVR',
  'ID', 'URL', 'PVE', 'WAN', 'LAN', 'IoT', 'NAT', 'QoS', 'MTU', 'CIDR', 'NAS',
  'OK', 'PDF', 'HTML', 'JSON', 'CSV', 'UPS', 'RDP', 'SMB', 'NFS', 'DMZ',
  // Network vocabulary that stays English in Hungarian usage.
  'Online', 'online', 'Uplink', 'Switch', 'Port', 'port', 'SSID', 'Site', 'Wi-Fi',
  'Proxmox host', 'Switch trunk', 'Trunk bridge', 'Uptime', 'Firmware',
  'vCPU', 'VM / LXC', 'OS', 'AUTO', '#', 'offline', 'VLAN-aware', 'Site backup',
  // Two-part navigation labels whose second half is shared.
  '& policy', 'recovery',
  // Link speeds and product names, written the same either way.
  '10 G', '1 G', '100 M', '10 M', 'UniFi Network', 'Proxmox VE', 'Docker',
  'Kubernetes',
  // Port-profile names the application writes to the controller verbatim.
  'ACCESS', 'AP-TRUNK', 'SERVER-TRUNK', 'SWITCH-TRUNK', 'UPLINK', 'DISABLED',
]);

const same = [];
let leaves = 0;

function walk(a, b, path) {
  for (const key of Object.keys(a)) {
    const va = a[key];
    const vb = b?.[key];
    const here = path ? `${path}.${key}` : key;
    if (typeof va === 'string') {
      leaves += 1;
      if (va === vb && !SHARED.has(va.trim()) && !/^[\d\s%×→·—–,.:/+-]*$/.test(va)) {
        same.push(`${here}  =  ${JSON.stringify(va)}`);
      }
    } else if (Array.isArray(va)) {
      va.forEach((item, i) => {
        if (typeof item === 'string') {
          leaves += 1;
          if (item === vb?.[i] && !SHARED.has(item.trim())) same.push(`${here}[${i}]  =  ${JSON.stringify(item)}`);
        } else if (item && typeof item === 'object') walk(item, vb?.[i], `${here}[${i}]`);
      });
    } else if (va && typeof va === 'object') {
      walk(va, vb, here);
    }
  }
}

walk(hu, en, '');
rmSync(OUT, { force: true });

console.log(`leaf strings   ${leaves}`);
console.log(`untranslated   ${same.length}`);
for (const line of same.slice(0, 40)) console.log('  ' + line);
console.log(same.length === 0 ? '\nOK' : '\nFAIL');
process.exit(same.length === 0 ? 0 : 1);
