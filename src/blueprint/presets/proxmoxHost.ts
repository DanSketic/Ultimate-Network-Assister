import type { Lang } from '@/i18n';
import type {
  BlueprintModule,
  BlueprintPreset,
  BuildContext,
  BuildResult,
  ParamDef,
  PlannedGuest,
  PlannedService,
  PlannedStorage,
} from '../model';

/*
 * One Proxmox host, on a network that already exists.
 *
 * The other presets start from the network and put the hypervisor inside it.
 * This one starts from the machine: somebody has a box, a router that already
 * hands out addresses, and no intention of touching VLANs. Everything about
 * segmentation is therefore absent rather than switched off — a plan that
 * lists VLANs you are not going to build is a plan you stop reading.
 *
 * What that leaves is the part that is genuinely about the host: firmware,
 * disks, pools, sizing, a template, the guests, backups, boot order, handover.
 * The trunk-bridge module is here but off by default, for the case where the
 * network does have VLANs and only the planning of them happens elsewhere.
 *
 * Addresses are flat: `ipPrefix` plus one third octet, because with no VLANs
 * there is exactly one subnet and pretending otherwise would be theatre.
 */

interface HostText {
  name: string;
  description: string;
  modules: Record<string, { title: string; summary: string }>;
  params: Record<string, { label: string; help?: string; options?: Record<string, string> }>;
  groups: { host: string; storage: string; guests: string; backups: string; network: string };
  guests: Record<string, string>;
  services: Record<string, string>;
  storage: { fast: string; data: string; fastDevices: string; dataDevices: string };
}

const HU: HostText = {
  name: 'Egyetlen Proxmox gép',
  description:
    'Egy hypervisor egy meglévő, lapos hálózaton: firmware, lemezek, poolok, sablon, vendéggépek, mentés és üzemátadás. VLAN és Wi-Fi nincs benne — a hálózatot úgy hagyja, ahogy találta.',
  modules: {
    scope: {
      title: 'Hatókör és döntések',
      summary: 'Mit szolgál ki a gép, mi marad rajta kívül, és mihez nem nyúlunk.',
    },
    'hardware-state': {
      title: 'Aktuális hardverállapot',
      summary: 'Hardverleltár, ismert lemezek és a kizárt eszközök rögzítése.',
    },
    'safety-rules': {
      title: 'Biztonsági és végrehajtási szabályok',
      summary: 'Destruktív parancsok kezelése, helyi konzol, visszaút minden lépéshez.',
    },
    physical: {
      title: 'Fizikai hardver és kábelezés',
      summary: 'PCIe-kiosztás, HBA, lemezek, hálózati kártya és hűtés.',
    },
    bios: {
      title: 'BIOS/UEFI-beállítások',
      summary: 'Virtualizáció, IOMMU és integrált GPU beállításai.',
    },
    'pve-base': {
      title: 'Proxmox alaprendszer',
      summary: 'Verzióellenőrzés, repository, frissítés és alapeszközök.',
    },
    'pve-bridges': {
      title: 'VLAN-trunk a hoston',
      summary:
        'Csak akkor kell, ha a switch VLAN-okat is hoz a gépnek. Lapos hálózaton a telepítő vmbr0-ja marad.',
    },
    'disk-validation': {
      title: 'Lemezek azonosítása és ellenőrzése',
      summary: 'Stabil by-id útvonalak, SMART-állapot, a pool alá szánt lemezek kizárása.',
    },
    storage: {
      title: 'Tárhely és poolok',
      summary: 'Gyors pool a rendszereknek, külön adatterület a nagy fájloknak.',
    },
    resources: {
      title: 'Erőforrás-kiosztás',
      summary: 'Mennyi CPU és memória jut a vendéggépeknek, és mi marad a hostnak.',
    },
    'vm-template': {
      title: 'VM-sablon',
      summary: 'Egy cloud-init sablon, amiből minden vendéggép készül.',
    },
    adguard: {
      title: 'AdGuard Home',
      summary: 'Hálózati DNS-szűrő saját konténerben.',
    },
    'home-assistant': {
      title: 'Home Assistant',
      summary: 'Otthoni automatizálás saját virtuális gépen.',
    },
    'docker-host': {
      title: 'Docker gazdagép',
      summary: 'Egy Debian VM a konténeres szolgáltatásoknak.',
    },
    nextcloud: {
      title: 'Nextcloud',
      summary: 'Fájlmegosztás és naptár, külön adatlemezzel.',
    },
    backups: {
      title: 'Mentési feladat',
      summary: 'Ütemezett vzdump a vendéggépekről, megőrzéssel és igazolható fájlokkal.',
    },
    'boot-order': {
      title: 'Indulási sorrend',
      summary: 'Áramszünet után magától, jó sorrendben álljon vissza minden.',
    },
    updates: {
      title: 'Frissítési rend',
      summary: 'Mikor és mit frissítünk, és mi az, amit csak kézzel.',
    },
    monitoring: {
      title: 'Monitorozás',
      summary: 'Mit figyelünk, és mi az, amiről értesítést kérünk.',
    },
    handover: {
      title: 'Átadás és dokumentáció',
      summary: 'Amit a következő embernek — vagy a fél év múlvai magadnak — tudnia kell.',
    },
  },
  params: {
    hostName: { label: 'Gép neve' },
    ipPrefix: {
      label: 'IP-előtag',
      help: 'A hálózat közös első két oktettje.',
    },
    lanThird: {
      label: 'A hálózat harmadik oktettje',
      help: 'Lapos hálózaton egyetlen alhálózat van; ez annak a harmadik oktettje.',
    },
    gatewayHostByte: { label: 'Az útválasztó utolsó oktettje' },
    hostByte: { label: 'A Proxmox utolsó oktettje' },
    trunkBridge: { label: 'Trunk bridge neve' },
    mgmtSeparateNic: {
      label: 'Külön management interfész',
      help: 'A Proxmox felület és a vendéggépek trunkja külön fizikai porton fut, így a trunk átalakítása nem vágja el a felületet.',
    },
    fastPoolName: { label: 'Gyors pool neve' },
    fastPoolDevices: {
      label: 'Gyors pool lemezei',
      help: 'Stabil /dev/disk/by-id/ útvonalak, vesszővel elválasztva. Ezek a lemezek a pool létrehozásakor törlődnek.',
    },
    dataPool: { label: 'Külön adatterület' },
    dataPoolName: { label: 'Adatpool neve' },
    dataPoolDevices: { label: 'Adatpool lemezei' },
    ipAdguard: { label: 'AdGuard Home' },
    ipHomeAssistant: { label: 'Home Assistant' },
    ipDocker: { label: 'Docker gazdagép' },
    ipNextcloud: { label: 'Nextcloud' },
    backupStorage: {
      label: 'Mentés tárolója',
      help: 'Annak a Proxmox tárolónak a neve, amelynek a tartalmai közt szerepel a „backup”.',
    },
    backupSchedule: {
      label: 'Mentés időpontja',
      help: 'systemd-időformátum, ahogy a Proxmox várja — például 02:30 vagy mon..fri 03:00.',
    },
    backupKeepDaily: { label: 'Megőrzés: napi' },
    backupKeepWeekly: { label: 'Megőrzés: heti' },
    backupMode: {
      label: 'Mentési mód',
      options: {
        snapshot: 'snapshot – futás közben',
        suspend: 'suspend – rövid felfüggesztéssel',
        stop: 'stop – leállítva, a legbiztosabb',
      },
    },
  },
  groups: {
    host: 'A gép',
    storage: 'Tárhely',
    guests: 'Vendéggépek',
    backups: 'Mentés',
    network: 'Hálózat',
  },
  guests: {
    adguard: 'DNS-szűrés az egész hálózatnak',
    'home-assistant': 'Otthoni automatizálás',
    'docker-host': 'Konténeres szolgáltatások',
    nextcloud: 'Fájlok, naptár, névjegyek',
  },
  services: {
    adguard: 'Feloldó és szűrőlisták',
    'home-assistant': 'Automatizálás és eszközintegráció',
    'docker-host': 'Amit a compose-fájlok kiszolgálnak',
    nextcloud: 'Fájlmegosztás böngészőből és kliensből',
  },
  storage: {
    fast: 'Rendszerlemezek és konténerek: itt fut minden vendéggép',
    data: 'Nagy fájlok, mentések és minden, ami nem fér el a gyors poolon',
    fastDevices: 'két azonos SSD, tükörben',
    dataDevices: 'két azonos HDD, tükörben',
  },
};

const EN: HostText = {
  name: 'A single Proxmox host',
  description:
    'One hypervisor on a network that already exists: firmware, disks, pools, a template, guests, backups and handover. No VLANs and no Wi-Fi — it leaves the network as it found it.',
  modules: {
    scope: {
      title: 'Scope and settled decisions',
      summary: 'What the machine is for, what stays outside it, and what is not to be touched.',
    },
    'hardware-state': {
      title: 'Current hardware state',
      summary: 'Hardware inventory, known disks and the devices ruled out.',
    },
    'safety-rules': {
      title: 'Safety and execution rules',
      summary: 'Handling destructive commands, local console, a way back from every step.',
    },
    physical: {
      title: 'Physical hardware and cabling',
      summary: 'PCIe layout, HBA, disks, network card and cooling.',
    },
    bios: {
      title: 'BIOS/UEFI settings',
      summary: 'Virtualisation, IOMMU and integrated GPU settings.',
    },
    'pve-base': {
      title: 'Proxmox base system',
      summary: 'Version check, repositories, updates and the basic tools.',
    },
    'pve-bridges': {
      title: 'VLAN trunk on the host',
      summary:
        'Only needed where the switch brings VLANs to the machine. On a flat network the installer’s vmbr0 stays as it is.',
    },
    'disk-validation': {
      title: 'Identifying and checking the disks',
      summary: 'Stable by-id paths, SMART health, and ruling out the disks meant for a pool.',
    },
    storage: {
      title: 'Storage and pools',
      summary: 'A fast pool for the systems, a separate data area for the large files.',
    },
    resources: {
      title: 'Resource allocation',
      summary: 'How much CPU and memory the guests get, and what is left for the host.',
    },
    'vm-template': {
      title: 'VM template',
      summary: 'One cloud-init template every guest is made from.',
    },
    adguard: { title: 'AdGuard Home', summary: 'Network-wide DNS filtering in its own container.' },
    'home-assistant': {
      title: 'Home Assistant',
      summary: 'Home automation on its own virtual machine.',
    },
    'docker-host': {
      title: 'Docker host',
      summary: 'One Debian VM for the containerised services.',
    },
    nextcloud: { title: 'Nextcloud', summary: 'Files and calendars, with a separate data disk.' },
    backups: {
      title: 'Backup job',
      summary: 'A scheduled vzdump over the guests, with retention and files you can point at.',
    },
    'boot-order': {
      title: 'Boot order',
      summary: 'After a power cut everything comes back on its own, in the right order.',
    },
    updates: {
      title: 'Update routine',
      summary: 'When and what gets updated, and what is only ever done by hand.',
    },
    monitoring: {
      title: 'Monitoring',
      summary: 'What is watched, and what is worth being told about.',
    },
    handover: {
      title: 'Handover and documentation',
      summary: 'What the next person — or you in six months — needs to know.',
    },
  },
  params: {
    hostName: { label: 'Host name' },
    ipPrefix: { label: 'IP prefix', help: 'The first two octets the network shares.' },
    lanThird: {
      label: 'Third octet of the network',
      help: 'A flat network has exactly one subnet; this is its third octet.',
    },
    gatewayHostByte: { label: 'Router host octet' },
    hostByte: { label: 'Proxmox host octet' },
    trunkBridge: { label: 'Trunk bridge name' },
    mgmtSeparateNic: {
      label: 'Separate management interface',
      help: 'The Proxmox interface and the guests’ trunk run on separate physical ports, so reworking the trunk does not cut the interface.',
    },
    fastPoolName: { label: 'Fast pool name' },
    fastPoolDevices: {
      label: 'Fast pool disks',
      help: 'Stable /dev/disk/by-id/ paths, comma separated. These disks are erased when the pool is created.',
    },
    dataPool: { label: 'Separate data area' },
    dataPoolName: { label: 'Data pool name' },
    dataPoolDevices: { label: 'Data pool disks' },
    ipAdguard: { label: 'AdGuard Home' },
    ipHomeAssistant: { label: 'Home Assistant' },
    ipDocker: { label: 'Docker host' },
    ipNextcloud: { label: 'Nextcloud' },
    backupStorage: {
      label: 'Backup store',
      help: 'The name of the Proxmox store whose content types include “backup”.',
    },
    backupSchedule: {
      label: 'Backup time',
      help: 'systemd time format, the way Proxmox expects it — 02:30, or mon..fri 03:00.',
    },
    backupKeepDaily: { label: 'Retention: daily' },
    backupKeepWeekly: { label: 'Retention: weekly' },
    backupMode: {
      label: 'Backup mode',
      options: {
        snapshot: 'snapshot – while running',
        suspend: 'suspend – with a brief pause',
        stop: 'stop – shut down, the safest',
      },
    },
  },
  groups: {
    host: 'The machine',
    storage: 'Storage',
    guests: 'Guests',
    backups: 'Backup',
    network: 'Network',
  },
  guests: {
    adguard: 'DNS filtering for the whole network',
    'home-assistant': 'Home automation',
    'docker-host': 'Containerised services',
    nextcloud: 'Files, calendars, contacts',
  },
  services: {
    adguard: 'Resolver and filter lists',
    'home-assistant': 'Automation and device integrations',
    'docker-host': 'Whatever the compose files serve',
    nextcloud: 'File sharing from a browser and a client',
  },
  storage: {
    fast: 'System disks and containers: every guest runs from here',
    data: 'Large files, backups, and anything that will not fit on the fast pool',
    fastDevices: 'two matching SSDs, mirrored',
    dataDevices: 'two matching HDDs, mirrored',
  },
};

type ModuleShape = Omit<BlueprintModule, 'title' | 'summary'>;

const MODULE_SHAPES: ModuleShape[] = [
  { id: 'scope', code: '1', group: 'overview', targets: ['host'], risk: 'low', minutes: 10, optional: false },
  { id: 'hardware-state', code: '2', group: 'overview', targets: ['host'], risk: 'medium', minutes: 15, optional: true },
  { id: 'safety-rules', code: '3', group: 'overview', targets: ['host'], risk: 'high', minutes: 15, optional: false },

  { id: 'physical', code: '4', group: 'server', targets: ['host'], risk: 'medium', minutes: 60, optional: true },
  { id: 'bios', code: '5', group: 'server', targets: ['host'], risk: 'medium', minutes: 20, optional: true },
  { id: 'pve-base', code: '6', group: 'server', targets: ['proxmox'], risk: 'low', minutes: 25, optional: false },
  { id: 'disk-validation', code: '7', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 40, optional: false, requires: ['pve-base'] },
  { id: 'storage', code: '8', group: 'server', targets: ['proxmox'], risk: 'high', minutes: 60, optional: false, requires: ['disk-validation'] },
  { id: 'resources', code: '9', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 20, optional: false },
  { id: 'vm-template', code: '10', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 35, optional: false, requires: ['storage'] },

  // Off unless the network does have VLANs. The rest of the preset never
  // assumes one, so switching it on adds a chapter rather than changing any.
  { id: 'pve-bridges', code: '11', group: 'network', targets: ['proxmox'], risk: 'high', minutes: 30, optional: true, defaultOff: true },

  // The host is the deliverable; the guests are what someone may want on it.
  // Starting with none of them means the plan opens as the machine alone.
  { id: 'adguard', code: '12', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 30, optional: true, defaultOff: true, requires: ['vm-template'] },
  { id: 'home-assistant', code: '13', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 40, optional: true, defaultOff: true, requires: ['vm-template'] },
  { id: 'docker-host', code: '14', group: 'services', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 45, optional: true, defaultOff: true, requires: ['vm-template'] },
  { id: 'nextcloud', code: '15', group: 'services', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 60, optional: true, defaultOff: true, requires: ['docker-host'] },

  { id: 'backups', code: '16', group: 'ops', targets: ['proxmox'], risk: 'medium', minutes: 30, optional: false, requires: ['storage'] },
  { id: 'boot-order', code: '17', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 20, optional: false },
  { id: 'updates', code: '18', group: 'ops', targets: ['proxmox'], risk: 'medium', minutes: 30, optional: true },
  { id: 'monitoring', code: '19', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 40, optional: true },
  { id: 'handover', code: '20', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 45, optional: false },
];

type ParamShape = Omit<ParamDef, 'label' | 'help' | 'group' | 'options'> & {
  group: keyof HostText['groups'];
  optionValues?: string[];
};

const PARAM_SHAPES: ParamShape[] = [
  { id: 'hostName', type: 'text', default: 'pve01', group: 'host' },
  { id: 'ipPrefix', type: 'text', default: '192.168', group: 'host' },
  { id: 'lanThird', type: 'number', default: 1, min: 0, max: 255, group: 'host' },
  { id: 'gatewayHostByte', type: 'number', default: 1, min: 1, max: 254, group: 'host' },
  { id: 'hostByte', type: 'number', default: 10, min: 2, max: 254, group: 'host' },

  { id: 'trunkBridge', type: 'text', default: 'vmbr1', group: 'network', moduleId: 'pve-bridges' },
  { id: 'mgmtSeparateNic', type: 'boolean', default: true, group: 'network', moduleId: 'pve-bridges' },

  { id: 'fastPoolName', type: 'text', default: 'fastpool', group: 'storage', moduleId: 'storage' },
  {
    id: 'fastPoolDevices',
    type: 'text',
    default: '/dev/disk/by-id/ata-SSD1, /dev/disk/by-id/ata-SSD2',
    group: 'storage',
    moduleId: 'storage',
  },
  { id: 'dataPool', type: 'boolean', default: true, group: 'storage', moduleId: 'storage' },
  { id: 'dataPoolName', type: 'text', default: 'datapool', group: 'storage', moduleId: 'storage' },
  {
    id: 'dataPoolDevices',
    type: 'text',
    default: '/dev/disk/by-id/ata-HDD1, /dev/disk/by-id/ata-HDD2',
    group: 'storage',
    moduleId: 'storage',
  },

  { id: 'ipAdguard', type: 'ipv4', default: '192.168.1.53', group: 'guests', moduleId: 'adguard' },
  { id: 'ipHomeAssistant', type: 'ipv4', default: '192.168.1.20', group: 'guests', moduleId: 'home-assistant' },
  { id: 'ipDocker', type: 'ipv4', default: '192.168.1.30', group: 'guests', moduleId: 'docker-host' },
  { id: 'ipNextcloud', type: 'ipv4', default: '192.168.1.31', group: 'guests', moduleId: 'nextcloud' },

  { id: 'backupStorage', type: 'text', default: 'local', group: 'backups', moduleId: 'backups' },
  { id: 'backupSchedule', type: 'text', default: '02:30', group: 'backups', moduleId: 'backups' },
  { id: 'backupKeepDaily', type: 'number', default: 7, min: 0, max: 90, group: 'backups', moduleId: 'backups' },
  { id: 'backupKeepWeekly', type: 'number', default: 4, min: 0, max: 52, group: 'backups', moduleId: 'backups' },
  {
    id: 'backupMode',
    type: 'enum',
    default: 'snapshot',
    optionValues: ['snapshot', 'suspend', 'stop'],
    group: 'backups',
    moduleId: 'backups',
  },
];

interface GuestShape {
  vmid: number;
  name: string;
  moduleId: string;
  kind: 'vm' | 'lxc';
  vcpu: string;
  ram: string;
  disk: string;
  os: string;
  ipParam: string;
  ports: string;
}

const GUEST_SHAPES: GuestShape[] = [
  {
    vmid: 110, name: 'AdGuard Home', moduleId: 'adguard', kind: 'lxc',
    vcpu: '1', ram: '512 MB–1 GB', disk: '8 GB', os: 'Debian LXC',
    ipParam: 'ipAdguard', ports: '53/udp, 3000/tcp',
  },
  {
    vmid: 120, name: 'Home Assistant', moduleId: 'home-assistant', kind: 'vm',
    vcpu: '2', ram: '4 GB', disk: '32–64 GB', os: 'Home Assistant OS',
    ipParam: 'ipHomeAssistant', ports: '8123/tcp',
  },
  {
    vmid: 130, name: 'Docker', moduleId: 'docker-host', kind: 'vm',
    vcpu: '4', ram: '8 GB', disk: '80–120 GB', os: 'Debian',
    ipParam: 'ipDocker', ports: '—',
  },
  {
    vmid: 140, name: 'Nextcloud', moduleId: 'nextcloud', kind: 'vm',
    vcpu: '4', ram: '6 GB', disk: '60 GB + adatlemez', os: 'Debian',
    ipParam: 'ipNextcloud', ports: '443/tcp',
  },
];

function makeBuild(x: HostText) {
  return function build(ctx: BuildContext): BuildResult {
    const { enabled } = ctx;

    const guests: PlannedGuest[] = [];
    const services: PlannedService[] = [];

    for (const shape of GUEST_SHAPES) {
      if (!enabled.has(shape.moduleId)) continue;
      const ip = ctx.str(shape.ipParam);
      guests.push({
        vmid: shape.vmid,
        name: shape.name,
        kind: shape.kind,
        // No VLANs here: every guest sits untagged on the one network there is.
        vlan: 0,
        vcpu: shape.vcpu,
        ram: shape.ram,
        disk: shape.disk,
        os: shape.os,
        ip,
        purpose: x.guests[shape.moduleId] ?? '',
        moduleId: shape.moduleId,
      });
      services.push({
        name: shape.name,
        host: ip,
        ports: shape.ports,
        exposure: 'internal',
        purpose: x.services[shape.moduleId] ?? '',
        moduleId: shape.moduleId,
      });
    }

    const storage: PlannedStorage[] = [];
    if (enabled.has('storage')) {
      storage.push({
        name: ctx.str('fastPoolName'),
        kind: 'zfs-mirror',
        devices: ctx.str('fastPoolDevices'),
        purpose: x.storage.fast,
        destructive: true,
        moduleId: 'storage',
      });
      if (ctx.bool('dataPool')) {
        storage.push({
          name: ctx.str('dataPoolName'),
          kind: 'zfs-mirror',
          devices: ctx.str('dataPoolDevices'),
          purpose: x.storage.data,
          destructive: true,
          moduleId: 'storage',
        });
      }
    }

    // Everything below stays empty on purpose: this preset does not describe a
    // network, so it has no VLANs, no SSIDs, no zones and no rules to write.
    return {
      networks: [],
      ssids: [],
      zones: [],
      addressObjects: [],
      portObjects: [],
      policies: [],
      guests,
      storage,
      services,
    };
  };
}

export function createProxmoxHostPreset(lang: Lang): BlueprintPreset {
  const x = lang === 'en' ? EN : HU;
  return {
    id: 'proxmox-host',
    name: x.name,
    description: x.description,
    targets: ['proxmox', 'docker', 'host'],
    modules: MODULE_SHAPES.map<BlueprintModule>((shape) => ({
      ...shape,
      title: x.modules[shape.id]?.title ?? shape.id,
      summary: x.modules[shape.id]?.summary ?? '',
    })),
    params: PARAM_SHAPES.map<ParamDef>((shape) => {
      const { optionValues, group, ...rest } = shape;
      const text = x.params[shape.id];
      return {
        ...rest,
        label: text?.label ?? shape.id,
        ...(text?.help ? { help: text.help } : {}),
        group: x.groups[group],
        ...(optionValues
          ? { options: optionValues.map((value) => ({ value, label: text?.options?.[value] ?? value })) }
          : {}),
      };
    }),
    households: [],
    householdsEditable: false,
    build: makeBuild(x),
  };
}
