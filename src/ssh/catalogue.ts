import type { Lang } from '@/i18n';
import type { SshFlavour } from '@/survey/model';

/*
 * The command catalogue.
 *
 * Shapes and command text are language-neutral — a translated shell command is
 * a second thing to keep correct, and the wrong variant would eventually get
 * run. Only the labels move.
 *
 * Nothing destructive appears here. That is not the catalogue being polite: the
 * native policy refuses those outright, so listing one would only produce a
 * button that always fails.
 */

export interface SshCommand {
  id: string;
  label: string;
  detail: string;
  command: string;
  /** Systems this makes sense on. */
  flavours: SshFlavour[];
  /** Grouping in the list. */
  group: 'inventory' | 'network' | 'storage' | 'services' | 'maintenance';
}

type Shape = Omit<SshCommand, 'label' | 'detail'>;

const SHAPES: Shape[] = [
  // ------------------------------------------------------------- inventory
  { id: 'uname', command: 'uname -a', flavours: ['proxmox', 'unifi', 'other'], group: 'inventory' },
  { id: 'uptime', command: 'uptime', flavours: ['proxmox', 'unifi', 'other'], group: 'inventory' },
  { id: 'memory', command: 'free -h', flavours: ['proxmox', 'unifi', 'other'], group: 'inventory' },
  { id: 'cpu', command: 'lscpu', flavours: ['proxmox', 'other'], group: 'inventory' },
  { id: 'pveversion', command: 'pveversion -v', flavours: ['proxmox'], group: 'inventory' },
  { id: 'unifiInfo', command: 'info', flavours: ['unifi'], group: 'inventory' },
  {
    id: 'guests',
    command: 'qm list; pct list',
    flavours: ['proxmox'],
    group: 'inventory',
  },

  // --------------------------------------------------------------- network
  { id: 'addr', command: 'ip -br addr', flavours: ['proxmox', 'unifi', 'other'], group: 'network' },
  { id: 'links', command: 'ip -br link', flavours: ['proxmox', 'unifi', 'other'], group: 'network' },
  {
    id: 'bridgeVlan',
    command: 'bridge vlan show',
    flavours: ['proxmox', 'unifi', 'other'],
    group: 'network',
  },
  {
    id: 'interfaces',
    command: 'cat /etc/network/interfaces',
    flavours: ['proxmox'],
    group: 'network',
  },
  { id: 'listen', command: 'ss -tulnp', flavours: ['proxmox', 'unifi', 'other'], group: 'network' },
  { id: 'routes', command: 'ip -br route', flavours: ['proxmox', 'unifi', 'other'], group: 'network' },

  // --------------------------------------------------------------- storage
  {
    id: 'disks',
    command: 'lsblk -o NAME,SIZE,MODEL,SERIAL,MOUNTPOINT',
    flavours: ['proxmox', 'other'],
    group: 'storage',
  },
  { id: 'diskFree', command: 'df -h', flavours: ['proxmox', 'unifi', 'other'], group: 'storage' },
  { id: 'byId', command: 'ls -l /dev/disk/by-id/', flavours: ['proxmox', 'other'], group: 'storage' },
  { id: 'zpool', command: 'zpool status -v', flavours: ['proxmox', 'other'], group: 'storage' },
  {
    id: 'zpoolList',
    command: 'zpool list -o name,size,alloc,free,frag,cap,health',
    flavours: ['proxmox', 'other'],
    group: 'storage',
  },
  { id: 'zfsList', command: 'zfs list -o name,used,avail,refer,mountpoint', flavours: ['proxmox', 'other'], group: 'storage' },
  { id: 'smartScan', command: 'smartctl --scan', flavours: ['proxmox', 'other'], group: 'storage' },
  { id: 'pvesm', command: 'pvesm status', flavours: ['proxmox'], group: 'storage' },

  // -------------------------------------------------------------- services
  {
    id: 'failed',
    command: 'systemctl list-units --state=failed',
    flavours: ['proxmox', 'other'],
    group: 'services',
  },
  {
    id: 'errors',
    command: 'journalctl -p err -n 80 --no-pager',
    flavours: ['proxmox', 'other'],
    group: 'services',
  },
  {
    id: 'pveServices',
    command: 'systemctl status pve-cluster pvedaemon pveproxy --no-pager',
    flavours: ['proxmox'],
    group: 'services',
  },
  { id: 'processes', command: 'ps aux --sort=-%mem', flavours: ['proxmox', 'unifi', 'other'], group: 'services' },

  // ----------------------------------------------------------- maintenance
  // These change something. They run only when the user confirms the exact
  // command text, which is why they carry their consequence in the label.
  {
    id: 'aptUpdate',
    command: 'apt-get update',
    flavours: ['proxmox', 'other'],
    group: 'maintenance',
  },
  {
    id: 'scrub',
    command: 'zpool scrub rpool',
    flavours: ['proxmox', 'other'],
    group: 'maintenance',
  },
  {
    id: 'restartProxy',
    command: 'systemctl restart pveproxy',
    flavours: ['proxmox'],
    group: 'maintenance',
  },
];

type Text = Record<string, { label: string; detail: string }>;

const HU: Text = {
  uname: { label: 'Kernel és architektúra', detail: 'Melyik kernel fut, milyen gépen.' },
  uptime: { label: 'Üzemidő és terhelés', detail: 'Mióta megy, és mekkora a pillanatnyi terhelés.' },
  memory: { label: 'Memóriahasználat', detail: 'Szabad és foglalt memória, cache-sel együtt.' },
  cpu: { label: 'Processzor', detail: 'Magok, szálak, virtualizációs kiterjesztések.' },
  pveversion: { label: 'Proxmox verziók', detail: 'A csomagverziók, amikkel a hiba reprodukálható.' },
  unifiInfo: { label: 'Eszközinformáció', detail: 'A UniFi eszköz saját összefoglalója.' },
  guests: { label: 'Vendéggépek listája', detail: 'Futó és leállított VM-ek és konténerek.' },

  addr: { label: 'IP-címek', detail: 'Interfészenként, röviden.' },
  links: { label: 'Interfészek állapota', detail: 'Melyik van fent, melyik nincs.' },
  bridgeVlan: { label: 'Bridge VLAN-táblázat', detail: 'Melyik porton melyik VLAN megy át — trunk hibakereséshez.' },
  interfaces: { label: 'Hálózati konfiguráció', detail: 'Az /etc/network/interfaces tartalma.' },
  listen: { label: 'Nyitott portok', detail: 'Mi figyel, és melyik folyamat.' },
  routes: { label: 'Útválasztási tábla', detail: 'Merre megy a forgalom.' },

  disks: { label: 'Lemezleltár', detail: 'Modell, sorozatszám, méret, csatolási pont.' },
  diskFree: { label: 'Szabad hely', detail: 'Fájlrendszerenként.' },
  byId: { label: 'Stabil lemezútvonalak', detail: 'A /dev/disk/by-id/ tartalma — ezt kell használni tervezéskor.' },
  zpool: { label: 'ZFS pool állapot', detail: 'Eszközönkénti állapot és hibaszámlálók.' },
  zpoolList: { label: 'ZFS pool kapacitás', detail: 'Méret, foglaltság, töredezettség, egészség.' },
  zfsList: { label: 'ZFS adathalmazok', detail: 'Használat és csatolási pontok.' },
  smartScan: { label: 'SMART eszközlista', detail: 'Mely lemezek támogatják a SMART lekérdezést.' },
  pvesm: { label: 'Proxmox tárhelyek', detail: 'Tárhelyenkénti állapot és kihasználtság.' },

  failed: { label: 'Hibás szolgáltatások', detail: 'Ami nem indult el vagy elszállt.' },
  errors: { label: 'Hibaszintű naplóbejegyzések', detail: 'Az utolsó 80 error szintű sor.' },
  pveServices: { label: 'Proxmox szolgáltatások', detail: 'A cluster, a daemon és a webes felület állapota.' },
  processes: { label: 'Folyamatok memória szerint', detail: 'Ki eszi a memóriát.' },

  aptUpdate: {
    label: 'Csomaglisták frissítése',
    detail: 'Módosít: átírja a helyi csomagindexet. Telepítést nem végez.',
  },
  scrub: {
    label: 'ZFS scrub indítása',
    detail: 'Módosít: elindít egy teljes ellenőrzést. Terheli a lemezeket, de adatot nem töröl.',
  },
  restartProxy: {
    label: 'Webes felület újraindítása',
    detail: 'Módosít: a Proxmox felület pár másodpercre elérhetetlen lesz. A vendéggépek futnak tovább.',
  },
};

const EN: Text = {
  uname: { label: 'Kernel and architecture', detail: 'Which kernel is running, on what.' },
  uptime: { label: 'Uptime and load', detail: 'How long it has been up, and the load right now.' },
  memory: { label: 'Memory use', detail: 'Free and used memory, cache included.' },
  cpu: { label: 'Processor', detail: 'Cores, threads, virtualisation extensions.' },
  pveversion: { label: 'Proxmox versions', detail: 'The package versions a bug report needs.' },
  unifiInfo: { label: 'Device information', detail: 'The UniFi device’s own summary.' },
  guests: { label: 'Guest list', detail: 'Running and stopped VMs and containers.' },

  addr: { label: 'IP addresses', detail: 'Per interface, in brief.' },
  links: { label: 'Interface state', detail: 'Which ones are up and which are not.' },
  bridgeVlan: { label: 'Bridge VLAN table', detail: 'Which VLAN passes on which port — for trunk troubleshooting.' },
  interfaces: { label: 'Network configuration', detail: 'The contents of /etc/network/interfaces.' },
  listen: { label: 'Listening ports', detail: 'What is listening, and which process.' },
  routes: { label: 'Routing table', detail: 'Where traffic goes.' },

  disks: { label: 'Disk inventory', detail: 'Model, serial, size, mount point.' },
  diskFree: { label: 'Free space', detail: 'Per filesystem.' },
  byId: { label: 'Stable disk paths', detail: 'The contents of /dev/disk/by-id/ — the ones to plan with.' },
  zpool: { label: 'ZFS pool status', detail: 'Per-device state and error counters.' },
  zpoolList: { label: 'ZFS pool capacity', detail: 'Size, allocation, fragmentation, health.' },
  zfsList: { label: 'ZFS datasets', detail: 'Usage and mount points.' },
  smartScan: { label: 'SMART device list', detail: 'Which disks answer SMART queries.' },
  pvesm: { label: 'Proxmox storage', detail: 'Per-store state and usage.' },

  failed: { label: 'Failed services', detail: 'What did not start, or died.' },
  errors: { label: 'Error-level log entries', detail: 'The last 80 error lines.' },
  pveServices: { label: 'Proxmox services', detail: 'The cluster, the daemon and the web interface.' },
  processes: { label: 'Processes by memory', detail: 'What is eating the memory.' },

  aptUpdate: {
    label: 'Refresh package lists',
    detail: 'Changes something: rewrites the local package index. Installs nothing.',
  },
  scrub: {
    label: 'Start a ZFS scrub',
    detail: 'Changes something: starts a full verification. Loads the disks, deletes nothing.',
  },
  restartProxy: {
    label: 'Restart the web interface',
    detail: 'Changes something: the Proxmox interface drops for a few seconds. Guests keep running.',
  },
};

export function sshCatalogue(lang: Lang, flavour: SshFlavour | ''): SshCommand[] {
  const text = lang === 'en' ? EN : HU;
  const want = flavour === '' ? 'other' : flavour;
  return SHAPES.filter((s) => s.flavours.includes(want)).map((s) => ({
    ...s,
    label: text[s.id]?.label ?? s.id,
    detail: text[s.id]?.detail ?? '',
  }));
}
