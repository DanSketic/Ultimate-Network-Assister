import type { Lang } from '@/i18n';
import { AUTHOR_SCALE } from '@/lib/geometry';
import type { NetLink, NetNode, NodePort, ZoneKey } from './model';
import { NODES_EN } from './topology.en';

/*
 * Surveyed estate.
 *
 * This is the fixture the design was built against — a single-node Proxmox VE
 * host with a UniFi site. It stands in for the read-only collectors until they
 * are wired up; the shape is what a collector run is expected to produce.
 */

export const NODES: NetNode[] = [
  {
    id: 'wan',
    kind: 'cloud',
    name: 'Internet',
    subtitle: 'Fiber · 1000/300',
    status: 'ok',
    x: 520,
    y: 24,
    zone: 'WAN',
    facts: [
      { key: 'Szolgáltató', value: 'Fiber uplink · SFP+' },
      { key: 'Publikus IP', value: '92.249.14.86' },
      { key: 'Elérhetőség (30 nap)', value: '99,97%' },
      { key: 'Failover', value: 'Nincs konfigurálva' },
    ],
    metrics: [
      { label: 'Letöltés', value: '412 / 1000 Mb/s', percent: 41 },
      { label: 'Feltöltés', value: '88 / 300 Mb/s', percent: 29 },
    ],
    services: [],
    warnings: [
      { severity: 'info', text: 'Egyetlen uplink: a vonal kiesése teljes szolgáltatáskiesést okoz.' },
    ],
  },
  {
    id: 'gw',
    kind: 'gateway',
    name: 'Gateway',
    subtitle: '10.0.1.1 · trunk',
    status: 'ok',
    x: 520,
    y: 138,
    zone: 'Mgmt',
    facts: [
      { key: 'Firmware', value: '4.0.21 · elérhető 4.1.13' },
      { key: 'Hálózatok', value: '5 (VLAN 1/10/20/30/40)' },
      { key: 'Aktív kliensek', value: '38' },
      { key: 'Uptime', value: '61 nap' },
    ],
    metrics: [
      { label: 'CPU', value: '18%', percent: 18 },
      { label: 'Memória', value: '2,1 / 4 GB', percent: 52 },
      { label: 'Áteresztés', value: '486 Mb/s', percent: 48 },
    ],
    services: [
      { name: 'DHCP szerver', detail: '5 hálózaton · statikus foglalás 12', status: 'ok', provenance: 'Felmért' },
      { name: 'DNS forward', detail: '10.0.40.12 (AdGuard)', status: 'ok', provenance: 'Felmért' },
      { name: 'IDS / IPS', detail: 'Kikapcsolva', status: 'idle', provenance: 'Felmért' },
      { name: 'WireGuard VPN', detail: '2 aktív peer · 10.0.99.0/24', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [
      { severity: 'warn', text: 'Firmware frissítés elérhető – karbantartási ablak és mentés szükséges.' },
      { severity: 'info', text: 'A WAN failover hiánya egyszeres hibaponttá teszi az átjárót.' },
    ],
  },
  {
    id: 'sw',
    kind: 'switch',
    name: 'Core switch',
    subtitle: '10.0.1.2 · 24 PoE',
    status: 'ok',
    x: 250,
    y: 262,
    zone: 'Mgmt',
    facts: [
      { key: 'Portok', value: '24 × 1 Gb + 2 SFP' },
      { key: 'Uplink', value: 'LAG 2 × 1 Gb → gateway' },
      { key: 'PoE terhelés', value: '42 / 95 W' },
      { key: 'STP', value: 'RSTP · root: gateway' },
    ],
    metrics: [
      { label: 'Backplane', value: '12%', percent: 12 },
      { label: 'PoE terhelés', value: '44%', percent: 44 },
      { label: 'Aktív portok', value: '14 / 24', percent: 58 },
    ],
    services: [
      { name: 'Port profilok', detail: '4 profil · 14 hozzárendelés', status: 'ok', provenance: 'Felmért' },
      { name: 'LLDP felderítés', detail: '9 szomszéd', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [
      { severity: 'info', text: '3 aktív port címkézetlen – a felmérés nem tudja azonosítani a végpontot.' },
    ],
  },
  {
    id: 'ap1',
    kind: 'ap',
    name: 'AP – Nappali',
    subtitle: '10.0.1.21 · U6 Pro',
    status: 'ok',
    x: 60,
    y: 388,
    zone: 'Mgmt',
    facts: [
      { key: 'Csatorna', value: '36 (5 GHz) / 6 (2,4 GHz)' },
      { key: 'Adóteljesítmény', value: 'Közepes' },
      { key: 'Kliensek', value: '16' },
      { key: 'Uptime', value: '41 nap' },
    ],
    metrics: [
      { label: 'Csatorna kihasználtság', value: '24%', percent: 24 },
      { label: 'Kliensek', value: '16 / 60', percent: 27 },
      { label: 'Újraküldés', value: '3,1%', percent: 12 },
    ],
    services: [
      { name: 'Otthon', detail: 'VLAN 10 · WPA3', status: 'ok', provenance: 'Felmért' },
      { name: 'Otthon-IoT', detail: 'VLAN 20 · WPA2', status: 'ok', provenance: 'Felmért' },
      { name: 'Vendég', detail: 'VLAN 30 · portál', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [],
  },
  {
    id: 'ap2',
    kind: 'ap',
    name: 'AP – Emelet',
    subtitle: '10.0.1.22 · U6 Lite',
    status: 'warn',
    x: 210,
    y: 388,
    zone: 'Mgmt',
    facts: [
      { key: 'Csatorna', value: '149 (5 GHz) / 11 (2,4 GHz)' },
      { key: 'Adóteljesítmény', value: 'Magas' },
      { key: 'Kliensek', value: '9' },
      { key: 'Uptime', value: '6 nap' },
    ],
    metrics: [
      { label: 'Csatorna kihasználtság', value: '68%', percent: 68 },
      { label: 'Kliensek', value: '9 / 60', percent: 15 },
      { label: 'Újraküldés', value: '11,4%', percent: 46 },
    ],
    services: [
      { name: 'Otthon', detail: 'VLAN 10 · WPA3', status: 'ok', provenance: 'Felmért' },
      { name: 'Otthon-IoT', detail: 'VLAN 20 · WPA2', status: 'ok', provenance: 'Felmért' },
      { name: 'Vendég', detail: 'VLAN 30 · portál', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [
      { severity: 'warn', text: 'Magas csatorna-interferencia (68%) – fix csatorna beállítása javasolt.' },
      { severity: 'warn', text: '6 napja újraindult: PoE vagy tápellátási hiba gyanúja.' },
    ],
  },
  {
    id: 'ap3',
    kind: 'ap',
    name: 'AP – Garázs',
    subtitle: '10.0.1.23 · offline',
    status: 'bad',
    x: 360,
    y: 388,
    zone: 'Mgmt',
    facts: [
      { key: 'Utoljára látott', value: '2 napja, 21:47' },
      { key: 'PoE port', value: 'SW1 / 12' },
      { key: 'Modell', value: 'U6 Mesh' },
      { key: 'Érintett kliensek', value: '4 (becsült)' },
    ],
    metrics: [{ label: 'Elérhetőség', value: 'Offline · 2 nap', percent: 0 }],
    services: [],
    warnings: [
      { severity: 'bad', text: '2 napja offline – a garázs IoT eszközei felügyelet nélkül vannak.' },
      { severity: 'info', text: 'A PoE port állapota nem ellenőrizhető távolról, helyszíni vizsgálat szükséges.' },
    ],
  },
  {
    id: 'clients',
    kind: 'clients',
    name: 'Kliensek · 38',
    subtitle: 'becsült besorolás',
    status: 'idle',
    x: 210,
    y: 512,
    zone: 'IoT',
    facts: [
      { key: 'Trusted (VLAN 10)', value: '14' },
      { key: 'IoT (VLAN 20)', value: '24' },
      { key: 'Vendég (VLAN 30)', value: '6 · időszakos' },
      { key: 'Nem azonosított', value: '3' },
    ],
    metrics: [
      { label: 'Wi-Fi kliens', value: '31', percent: 52 },
      { label: 'Vezetékes', value: '7', percent: 12 },
    ],
    services: [],
    warnings: [
      { severity: 'warn', text: '3 eszköz gyártója nem azonosítható – a VLAN besorolás becsült érték.' },
    ],
  },
  {
    id: 'pve',
    kind: 'host',
    name: 'pve01',
    subtitle: '10.0.1.10 · PVE 8.2',
    status: 'warn',
    x: 760,
    y: 262,
    zone: 'Mgmt',
    facts: [
      { key: 'Verzió', value: 'Proxmox VE 8.2.4' },
      { key: 'CPU', value: '8 mag / 16 szál' },
      { key: 'Fürt', value: 'Egycsomópontos' },
      { key: 'Bridge', value: 'vmbr0 · trunk 1,10,20,40' },
    ],
    metrics: [
      { label: 'CPU', value: '34%', percent: 34 },
      { label: 'Memória', value: '41 / 64 GB', percent: 64 },
      { label: 'local-lvm', value: '78%', percent: 78 },
      { label: 'Swap', value: '0,4 / 8 GB', percent: 5 },
    ],
    services: [
      { name: 'UniFi Network Controller', detail: 'LXC 101', status: 'ok', provenance: 'Felmért' },
      { name: 'Home Assistant OS', detail: 'VM 201', status: 'ok', provenance: 'Felmért' },
      { name: 'Docker host', detail: 'VM 202', status: 'warn', provenance: 'Felmért' },
      { name: 'ZFS replikáció', detail: 'tank → offsite', status: 'warn', provenance: 'Becsült' },
    ],
    warnings: [
      { severity: 'warn', text: 'A vmbr0 módosítása helyi recovery-konzolt igényel: a távoli SSH megszakadhat.' },
      { severity: 'warn', text: 'local-lvm 78% – snapshot előtt kapacitásellenőrzés kell.' },
      { severity: 'info', text: 'Egycsomópontos fürt: nincs élő migráció, karbantartás csak leállással.' },
    ],
  },
  {
    id: 'nas',
    kind: 'storage',
    name: 'ZFS tank',
    subtitle: 'RAIDZ1 · 4 × 4 TB',
    status: 'warn',
    x: 1030,
    y: 262,
    zone: 'Servers',
    facts: [
      { key: 'Pool', value: 'tank · RAIDZ1' },
      { key: 'Utolsó scrub', value: '19 napja · hibátlan' },
      { key: 'Snapshotok', value: '142' },
      { key: 'Offsite replikáció', value: '5 napja' },
    ],
    metrics: [
      { label: 'Kapacitás', value: '6,9 / 8 TB', percent: 87 },
      { label: 'Fragmentáció', value: '18%', percent: 18 },
      { label: 'Írási átvitel', value: '62 MB/s', percent: 22 },
    ],
    services: [
      { name: 'NFS export', detail: 'pve01 · /tank/vmdata', status: 'ok', provenance: 'Felmért' },
      { name: 'SMB megosztás', detail: '3 megosztás', status: 'ok', provenance: 'Becsült' },
    ],
    warnings: [
      { severity: 'warn', text: '87%-os telítettség – 90% felett a ZFS írási teljesítménye jelentősen romlik.' },
      { severity: 'bad', text: 'Az offsite replikáció 5 napja nem futott le sikeresen.' },
    ],
  },
  {
    id: 'lxc-unifi',
    kind: 'ct',
    name: 'UniFi Controller',
    subtitle: 'LXC 101 · 10.0.1.12',
    status: 'ok',
    x: 600,
    y: 388,
    zone: 'Mgmt',
    facts: [
      { key: 'Verzió', value: 'Network 9.0.108' },
      { key: 'Site', value: 'Otthon' },
      { key: 'Kezelt eszköz', value: '5' },
      { key: 'Site backup', value: 'naponta 03:00 · 7 nap' },
    ],
    metrics: [
      { label: 'CPU', value: '6%', percent: 6 },
      { label: 'Memória', value: '1,4 / 2 GB', percent: 70 },
      { label: 'Lemez', value: '8,2 / 16 GB', percent: 51 },
    ],
    services: [
      { name: 'Web felület', detail: '443/tcp · VLAN 1', status: 'ok', provenance: 'Felmért' },
      { name: 'Device inform', detail: '8080/tcp', status: 'ok', provenance: 'Felmért' },
      { name: 'Site backup', detail: 'naponta · helyi + tank', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [
      {
        severity: 'info',
        text: 'A controller a felügyelt hálózaton belül fut: kiesésekor a Wi-Fi működik, a kezelés nem.',
      },
    ],
  },
  {
    id: 'vm-ha',
    kind: 'vm',
    name: 'Home Assistant',
    subtitle: 'VM 201 · 10.0.20.10',
    status: 'ok',
    x: 748,
    y: 388,
    zone: 'IoT',
    facts: [
      { key: 'Verzió', value: '2026.7.3' },
      { key: 'Integrációk', value: '34' },
      { key: 'Entitások', value: '412' },
      { key: 'Mentés', value: 'heti · 4 megőrzés' },
    ],
    metrics: [
      { label: 'CPU', value: '12%', percent: 12 },
      { label: 'Memória', value: '2,8 / 4 GB', percent: 70 },
      { label: 'Lemez', value: '24 / 64 GB', percent: 38 },
    ],
    services: [
      { name: 'Web felület', detail: '8123/tcp · VLAN 20', status: 'ok', provenance: 'Felmért' },
      { name: 'MQTT bróker', detail: '1883/tcp', status: 'ok', provenance: 'Becsült' },
      { name: 'Zigbee koordinátor', detail: 'USB passthrough', status: 'ok', provenance: 'Felmért' },
    ],
    warnings: [
      {
        severity: 'warn',
        text: 'VLAN 20-ban fut, de a Trusted zónából is elérhető – a szabály nem ellenőrzött.',
      },
    ],
  },
  {
    id: 'vm-docker',
    kind: 'vm',
    name: 'Docker host',
    subtitle: 'VM 202 · 10.0.40.12',
    status: 'warn',
    x: 896,
    y: 388,
    zone: 'Servers',
    facts: [
      { key: 'OS', value: 'Debian 12' },
      { key: 'Konténerek', value: '9 futó / 11' },
      { key: 'Compose stackek', value: '4' },
      { key: 'Mentés', value: 'vzdump heti · 2 megőrzés' },
    ],
    metrics: [
      { label: 'CPU', value: '46%', percent: 46 },
      { label: 'Memória', value: '9,2 / 12 GB', percent: 77 },
      { label: 'Lemez', value: '88 / 200 GB', percent: 44 },
    ],
    services: [
      { name: 'AdGuard Home', detail: '53/udp · DNS', status: 'ok', provenance: 'Felmért' },
      { name: 'Nextcloud', detail: '443/tcp · publikus', status: 'warn', provenance: 'Felmért' },
      { name: 'GitLab CE', detail: '8443/tcp', status: 'warn', provenance: 'Felmért' },
      { name: 'GitLab runner', detail: 'ciklikus újraindulás', status: 'bad', provenance: 'Felmért' },
    ],
    warnings: [
      { severity: 'warn', text: '2 konténer ciklikusan újraindul (gitlab-runner).' },
      { severity: 'bad', text: 'A GitLab köteteihez nincs mentési bizonyíték.' },
    ],
  },
  {
    id: 'svc-adguard',
    kind: 'svc',
    name: 'AdGuard Home',
    subtitle: 'DNS · :53',
    status: 'ok',
    x: 760,
    y: 512,
    zone: 'Servers',
    facts: [
      { key: 'Upstream', value: 'DoT · 1.1.1.1' },
      { key: 'Szűrőlisták', value: '6' },
      { key: 'Kliens azonosítás', value: 'VLAN alapú' },
      { key: 'Konfiguráció mentése', value: 'heti' },
    ],
    metrics: [
      { label: 'Kérés / perc', value: '412', percent: 41 },
      { label: 'Blokkolt arány', value: '18,4%', percent: 18 },
      { label: 'Átlagos válasz', value: '12 ms', percent: 12 },
    ],
    services: [
      { name: 'DNS feloldás', detail: '53/udp · minden VLAN', status: 'ok', provenance: 'Felmért' },
      { name: 'Admin felület', detail: '3000/tcp', status: 'ok', provenance: 'Becsült' },
    ],
    warnings: [
      {
        severity: 'info',
        text: 'A gateway DNS-e ide mutat: kiesése az egész hálózat névfeloldását érinti.',
      },
    ],
  },
  {
    id: 'svc-nextcloud',
    kind: 'svc',
    name: 'Nextcloud',
    subtitle: 'Fájl · :443',
    status: 'warn',
    x: 898,
    y: 512,
    zone: 'Servers',
    facts: [
      { key: 'Verzió', value: '30.0.2' },
      { key: 'Felhasználók', value: '6' },
      { key: 'Adatmennyiség', value: '1,2 TB (tank)' },
      { key: 'Külső elérés', value: 'Reverse proxy · WAF nincs' },
    ],
    metrics: [
      { label: 'CPU', value: '9%', percent: 9 },
      { label: 'Adat', value: '1,2 / 2 TB', percent: 60 },
      { label: 'Napi feltöltés', value: '24 GB', percent: 35 },
    ],
    services: [
      { name: 'HTTPS', detail: '443/tcp · publikus', status: 'warn', provenance: 'Felmért' },
      { name: 'WebDAV', detail: '443/tcp', status: 'ok', provenance: 'Becsült' },
    ],
    warnings: [
      { severity: 'warn', text: 'Publikusan elérhető alkalmazásréteg-védelem nélkül.' },
    ],
  },
  {
    id: 'svc-gitlab',
    kind: 'svc',
    name: 'GitLab',
    subtitle: 'DevOps · :8443',
    status: 'bad',
    x: 1036,
    y: 512,
    zone: 'Servers',
    facts: [
      { key: 'Verzió', value: '17.4 CE' },
      { key: 'Projektek', value: '23' },
      { key: 'Runnerek', value: '2 (1 hibás)' },
      { key: 'Mentés', value: 'Nincs bizonyíték' },
    ],
    metrics: [
      { label: 'CPU', value: '22%', percent: 22 },
      { label: 'Memória', value: '4,1 / 6 GB', percent: 68 },
      { label: 'Repo tárhely', value: '96 GB', percent: 48 },
    ],
    services: [
      { name: 'HTTPS', detail: '8443/tcp · belső', status: 'ok', provenance: 'Felmért' },
      { name: 'Registry', detail: '5050/tcp', status: 'warn', provenance: 'Becsült' },
      { name: 'CI runner', detail: 'shell executor', status: 'bad', provenance: 'Felmért' },
    ],
    warnings: [
      { severity: 'bad', text: 'Nincs ellenőrzött mentés a repókról – közvetlen adatvesztési kockázat.' },
      { severity: 'warn', text: 'A runner 14× indult újra 24 óra alatt.' },
    ],
  },
];

/** Keeps the port table below readable; everything unset is a sensible idle. */
function port(
  idx: number,
  name: string,
  neighbour: string,
  neighbourPort: string,
  extra: Partial<NodePort> = {},
): NodePort {
  return {
    idx,
    name,
    up: true,
    enabled: true,
    speed: 1000,
    poe: false,
    poePower: '',
    vlanMode: 'all',
    neighbour,
    neighbourPort,
    uplink: false,
    ...extra,
  };
}

/**
 * Ports for the demo's wired devices, keyed by node id.
 *
 * Sample data like the rest of the fixture — the estate is labelled "demo"
 * throughout. It is here so the port layout on the map is visible before a
 * survey has ever run; a live survey replaces it wholesale with the switch's
 * own port table.
 *
 * `neighbour` has to match the other node's *name*, which is what the mapping
 * layer produces from a real LLDP table, so both sources render identically.
 */
export const DEMO_PORTS: Record<string, NodePort[]> = {
  gw: [
    port(1, 'WAN', 'Internet', 'eth0', { uplink: true, speed: 1000 }),
    port(2, 'LAN', 'Core switch', '1', { speed: 1000 }),
    port(3, 'Hypervisor', 'pve01', 'enp2s0', { speed: 2500 }),
  ],
  // A 24-port switch reports all 24, so the strip matches the case in front of
  // you and a port number on screen is the socket you reach for.
  sw: [
    port(1, 'Uplink', 'Gateway', '2', { uplink: true, speed: 1000 }),
    port(5, 'AP nappali', 'AP – Nappali', 'eth0', { poe: true, poePower: '6.4' }),
    // Negotiated down to 100 Mbit — a tired cable or a bent pin. It works, so
    // nothing reports it as broken; the port colour is where it shows up.
    port(6, 'AP emelet', 'AP – Emelet', 'eth0', { poe: true, poePower: '5.9', speed: 100 }),
    port(7, 'AP garázs', 'AP – Garázs', '', { up: false, poe: true }),
    port(9, 'Nyomtató', '', '', { speed: 100 }),
    port(10, 'Munkaállomás', '', ''),
    port(11, 'NAS', '', '', { speed: 2500 }),
    port(23, 'Tartalék', '', '', { up: false }),
    port(24, 'Tartalék', '', '', { up: false, enabled: false }),
    // Everything else is patched but idle: present, enabled, nothing plugged.
    ...[2, 3, 4, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((idx) =>
      port(idx, '', '', '', { up: false }),
    ),
  ],
  pve: [port(1, 'Trunk', 'Gateway', '3', { uplink: true, speed: 2500 })],
  ap1: [port(1, 'PoE in', 'Core switch', '5', { uplink: true })],
  ap2: [port(1, 'PoE in', 'Core switch', '6', { uplink: true, speed: 100 })],
  ap3: [port(1, 'PoE in', 'Core switch', '7', { uplink: true, up: false })],
};

export const LINKS: NetLink[] = [
  { from: 'wan', to: 'gw', kind: 'physical', direction: 'ba' },
  { from: 'gw', to: 'sw', kind: 'physical', direction: 'both' },
  { from: 'gw', to: 'pve', kind: 'physical', direction: 'both' },
  { from: 'sw', to: 'ap1', kind: 'physical', direction: 'both' },
  { from: 'sw', to: 'ap2', kind: 'physical', direction: 'both' },
  { from: 'sw', to: 'ap3', kind: 'broken', direction: 'none' },
  { from: 'ap1', to: 'clients', kind: 'wireless', direction: 'both' },
  { from: 'ap2', to: 'clients', kind: 'wireless', direction: 'both' },
  { from: 'pve', to: 'nas', kind: 'physical', direction: 'both' },
  { from: 'pve', to: 'lxc-unifi', kind: 'physical', direction: 'both' },
  { from: 'pve', to: 'vm-ha', kind: 'physical', direction: 'both' },
  { from: 'pve', to: 'vm-docker', kind: 'physical', direction: 'both' },
  { from: 'vm-docker', to: 'svc-adguard', kind: 'physical', direction: 'both' },
  { from: 'vm-docker', to: 'svc-nextcloud', kind: 'physical', direction: 'both' },
  { from: 'vm-docker', to: 'svc-gitlab', kind: 'physical', direction: 'ab' },
  { from: 'lxc-unifi', to: 'gw', kind: 'logical', direction: 'ab' },
  { from: 'lxc-unifi', to: 'sw', kind: 'logical', direction: 'ab' },
  { from: 'lxc-unifi', to: 'ap2', kind: 'logical', direction: 'ab' },
  { from: 'svc-adguard', to: 'gw', kind: 'logical', direction: 'ba' },
];

/**
 * The demo nodes in the interface language, with their ports attached.
 *
 * Coordinates are scaled from the grid they were authored on, so the canvas
 * can grow without the hand-placed cards huddling in one corner.
 */
export function demoNodes(lang: Lang): NetNode[] {
  const nodes = lang === 'en' ? NODES_EN : NODES;
  return nodes.map((node) => {
    const ports = DEMO_PORTS[node.id];
    return {
      ...node,
      x: Math.round(node.x * AUTHOR_SCALE),
      y: Math.round(node.y * AUTHOR_SCALE),
      ...(ports ? { ports: localisePorts(ports, nodes) } : {}),
    };
  });
}

/**
 * Points the demo ports at the node names of the active language.
 *
 * The table above names neighbours in Hungarian; in English the same devices
 * are called something else, and a neighbour that does not match a node name
 * would silently drop the chip off the map.
 */
function localisePorts(ports: NodePort[], nodes: NetNode[]): NodePort[] {
  const byIndex = new Map(NODES.map((n, i) => [n.name, nodes[i]?.name ?? n.name]));
  return ports.map((p) => ({ ...p, neighbour: byIndex.get(p.neighbour) ?? p.neighbour }));
}

/**
 * Which VLAN zone a node's `zone` key refers to. `WAN` sits outside every
 * VLAN, so it has no entry.
 */
export const ZONE_NAME_BY_KEY: Record<ZoneKey, string | null> = {
  WAN: null,
  Mgmt: 'Management',
  IoT: 'IoT',
  Servers: 'Servers',
};
