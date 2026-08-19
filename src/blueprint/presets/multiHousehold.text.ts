import type { Lang } from '@/i18n';

/*
 * Every piece of prose the multi-household preset produces, in one place per
 * language.
 *
 * The preset is built per language rather than translating afterwards: the
 * strings come out of `build()`, which composes them with household names and
 * VLAN numbers, so there is nothing left to translate once it has run.
 */

export interface ModuleText {
  title: string;
  summary: string;
}

export interface ParamText {
  label: string;
  help?: string;
  options?: Record<string, string>;
  /**
   * Overrides the shape's starting value where the wording belongs to a
   * language. Most defaults do not — `vmbr1` and `fastpool` are the same
   * everywhere — but anything that ends up as a name someone reads does.
   */
  default?: string;
}

export interface MhText {
  presetName: string;
  presetDescription: string;
  households: Array<{ name: string; slug: string }>;

  modules: Record<string, ModuleText>;
  params: Record<string, ParamText>;
  /** Headings the parameter editor groups fields under. */
  paramGroups: {
    addressing: string;
    vlans: string;
    wifi: string;
    fixedIps: string;
    server: string;
    storage: string;
    publishing: string;
    cameras: string;
  };

  /** Network purposes, keyed by the network's role in the estate. */
  net: {
    mgmt: string;
    owner: string;
    infra: string;
    vpn: string;
    prod: string;
    printers: string;
    dmz: string;
    rdp: string;
    media: string;
    test: string;
    household: (name: string) => string;
    iot: (name: string) => string;
    guest: (name: string) => string;
    sharedGuest: string;
    /** Network name of the optional shared guest VLAN. */
    sharedGuestName: string;
    /** Single-household layout: one set of networks for the whole building. */
    buildingName: string;
    buildingClients: string;
    buildingIot: string;
    buildingGuests: string;
    cameras: string;
  };

  ssid: {
    mainPurpose: string;
    castShared: string;
    castSeparate: string;
    castNote: string;
    iotPurpose: string;
    /** Wording for the same SSID when one IoT network serves the building. */
    iotPurposeShared: string;
    guestPurpose: string;
    clientsKey: (name: string) => string;
    castKey: (name: string) => string;
    iotKey: (name: string) => string;
    guestKey: (name: string) => string;
    sharedGuestKey: string;
    band24: string;
    band245: string;
  };

  zone: {
    mgmt: string;
    owner: string;
    infra: string;
    prod: string;
    vpn: string;
    external: string;
    house: (name: string) => string;
    iot: (name: string) => string;
    guest: string;
    printers: string;
    test: string;
    media: string;
    rdp: string;
    dmz: string;
    cameras: string;
  };

  object: {
    nvr: string;
    cameraStream: string;
    cameraAdmin: string;
    pveMgmt: string;
    adguard: string;
    homeAssistant: string;
    printer: string;
    windows: string;
    media: string;
    prodDocker: string;
    gitlab: string;
    nextcloud: string;
    runner: string;
    tunnel: string;
    dns: string;
    ntp: string;
    proxmoxAdmin: string;
    webHttps: string;
    rdp: string;
    mediaStream: string;
    mediaAdmin: string;
    homeAssistantPort: string;
    gitlabWeb: string;
    gitlabSsh: string;
    printerTcp: string;
    printerSnmp: string;
    printerAdmin: string;
  };

  policy: {
    internet: string;
    dns: string;
    mediaStream: string;
    nextcloud: string;
    homeAssistant: string;
    printing: string;
    ntp: string;
    automationToIot: string;
    iotBlock: string;
    crossHousehold: string;
    crossIot: string;
    guestInternet: string;
    guestBlock: string;
    ownerAdmin: string;
    vpnAdmin: string;
    mediaBlock: string;
    testBlock: string;
    dmzBlock: string;
    printerBlock: string;
    catchAll: string;
    /** Floors that share a building but keep their own subnets. */
    crossFloorAllow: string;
    crossFloorIotBlock: string;
    cameraBlock: string;
    nvrToCameras: string;
    ownerToNvr: string;
    nvrInternet: string;
    /** Rule targets that are prose rather than a zone name. */
    targetEveryZone: string;
    targetInternalZones: string;
    targetPublishedOrigin: string;
    targetAllHouseAndIot: string;
  };

  guest: Record<string, string>;

  storage: {
    fastPool: string;
    mediaDisk: string;
    mediaMount: string;
    scratch: string;
    mediaDevice: (index: number) => string;
    scratchDevice: string;
  };

  service: Record<string, string>;
}

const HOUSEHOLDS_HU = [
  { name: 'Pince', slug: 'PINCE' },
  { name: 'Földszint', slug: 'FOLDSZINT' },
  { name: 'Emelet', slug: 'EMELET' },
];

const HOUSEHOLDS_EN = [
  { name: 'Basement', slug: 'BASEMENT' },
  { name: 'Ground floor', slug: 'GROUND' },
  { name: 'Upstairs', slug: 'UPSTAIRS' },
];

const HU: MhText = {
  presetName: 'Több háztartásos Proxmox + UniFi',
  presetDescription:
    'Egy gateway, egy hypervisor és több, egymástól teljesen elzárt háztartás. Minden háztartás kap kliens-, IoT- és vendéghálózatot; a közös szolgáltatások külön zónában futnak, és csak névre szóló engedéssel érhetők el.',
  households: HOUSEHOLDS_HU,

  modules: {
    scope: {
      title: 'Hatókör és végleges döntések',
      summary: 'A rögzített döntések listája, amit a többi modul adottnak vesz.',
    },
    'hardware-state': {
      title: 'Aktuális hardverállapot',
      summary: 'Hardverleltár, ismert lemezek és a kizárt eszközök rögzítése.',
    },
    architecture: {
      title: 'Végleges célarchitektúra',
      summary: 'A gateway, a switchek, a szerver és a vendéggépek célképe.',
    },
    'safety-rules': {
      title: 'Biztonsági és végrehajtási szabályok',
      summary: 'Destruktív parancsok kezelése, modulzárás, publikus szolgáltatások követelményei.',
    },
    'vlan-wifi': {
      title: 'VLAN- és Wi-Fi-rendszer',
      summary:
        'Háztartásonkénti kliens-, IoT- és vendég-VLAN, PPSK-kiosztás a meglévő SSID-k alatt.',
    },
    firewall: {
      title: 'Tűzfal- és izolációs szabályok',
      summary: 'Zone-Based Firewall zónák, cím- és portobjektumok, háztartások közötti tiltás.',
    },
    'shared-printer': {
      title: 'Közös vezetékes nyomtató',
      summary: 'Külön nyomtató-VLAN fix címmel, célzott engedésekkel minden háztartásból.',
    },
    'gateway-hardening': {
      title: 'Gateway hardening, IDS/IPS',
      summary: 'IPS bekapcsolása, UPnP kikapcsolása, WAN-minimum és többrétegű tűzfal.',
    },
    'pve-bridges': {
      title: 'Proxmox hálózati bridge-ek',
      summary: 'Külön management interfész és VLAN-tudatos trunk bridge a vendéggépeknek.',
    },
    'public-access': {
      title: 'Publikus elérés és DDNS',
      summary: 'Porttovábbítás, DDNS és a publikusan elérhető szolgáltatások szabályai.',
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
    'disk-validation': {
      title: 'Hardvervalidáció és lemezkizárás',
      summary: 'HBA-ellenőrzés, lemezleltár, SMART és a hibás lemezek kizárása.',
    },
    storage: {
      title: 'Végleges tárhelyarchitektúra',
      summary: 'ZFS mirror a vendéggépeknek, külön médialemezek mergerfs mögött.',
    },
    resources: {
      title: 'Erőforrás-terv',
      summary: 'Vendéggépenkénti vCPU, RAM és lemezméret a választott memóriaprofil szerint.',
    },
    'vm-template': {
      title: 'Linux VM-alapsablon',
      summary: 'Közös alapsablon a Linux vendéggépekhez, Docker-repositoryval.',
    },
    adguard: {
      title: 'AdGuard Home LXC',
      summary: 'Hálózati DNS-szűrő konténerben, a DHCP DNS-e ide mutat.',
    },
    'home-assistant': {
      title: 'Home Assistant OS VM',
      summary: 'Automatizálás saját VM-ben, USB-átadással a rádiós koordinátornak.',
    },
    'windows-rdp': {
      title: 'Windows távoli asztal VM',
      summary: 'Külön VLAN-ban futó Windows munkaállomás, csak VPN felől elérhetően.',
    },
    gitlab: { title: 'GitLab VM', summary: 'Önhosztolt GitLab az éles szerverzónában.' },
    'gitlab-runner': {
      title: 'GitLab Runner és Playwright',
      summary: 'CI futtató és böngészőteszt-környezet a tesztzónában.',
    },
    'prod-docker': {
      title: 'Éles Docker VM',
      summary: 'Compose-alapú éles konténerek külön VM-ben.',
    },
    'media-docker': {
      title: 'Média VM, Quick Sync és mergerfs',
      summary: 'Médiastack VM iGPU-átadással és egyesített médiakönyvtárral.',
    },
    'media-stack': {
      title: 'Médiaszerver és stack',
      summary: 'Médiaszerver és a hozzá tartozó automatizáló konténerek.',
    },
    nextcloud: {
      title: 'Nextcloud AIO',
      summary: 'Fájlszinkron saját VM-ben, közvetlen HTTPS eléréssel.',
    },
    'cloudflare-tunnel': {
      title: 'Cloudflare Tunnel',
      summary: 'Kis webes eszközök publikálása portnyitás nélkül, DMZ-ből.',
    },
    cameras: {
      title: 'Kamerarendszer',
      summary:
        'Külön kamera-VLAN és rögzítő. A kamerák nem mennek ki az internetre, és belső hálózatot sem érnek el.',
    },
    'boot-order': {
      title: 'Indítási és leállítási sorrend',
      summary: 'Vendéggépek indulási sorrendje és késleltetése.',
    },
    monitoring: {
      title: 'Monitoring, SMART és ZFS-karbantartás',
      summary: 'Scrub, SMART teszt, elérhetőségfigyelés és kapacitásriasztás.',
    },
    updates: {
      title: 'Frissítési folyamat',
      summary: 'Havi karbantartási sorrend és szolgáltatásonkénti frissítés.',
    },
    troubleshooting: {
      title: 'Hibakeresési forgatókönyvek',
      summary: 'A leggyakoribb hibák és a hozzájuk tartozó ellenőrzési sorrend.',
    },
    handover: {
      title: 'Végső átadási ellenőrzőlista',
      summary: 'A teljes rendszer záróellenőrzése üzembe adás előtt.',
    },
  },

  params: {
    ipPrefix: {
      label: 'IP-előtag',
      help: 'A /24 hálózatok közös első két oktettje. Minden VLAN ezt kapja meg.',
    },
    gatewayHostByte: { label: 'Átjáró utolsó oktettje' },
    vlanMgmt: { label: 'MGMT VLAN' },
    vlanOwner: { label: 'OWNER-TRUSTED VLAN' },
    vlanInfra: { label: 'INFRA VLAN' },
    vlanPrinters: { label: 'SHARED-PRINTERS VLAN' },
    vlanDmz: { label: 'DMZ VLAN' },
    vlanVpn: { label: 'VPN VLAN' },
    vlanRdp: { label: 'RDP VLAN' },
    vlanMedia: { label: 'MEDIA VLAN' },
    vlanTest: { label: 'SERVER-TEST VLAN' },
    vlanProd: { label: 'SERVER-PROD VLAN' },
    sharedGuestVlan: {
      label: 'Közös vendég VLAN',
      help: '0 esetén nem jön létre külön közös vendéghálózat.',
    },
    ssidMain: { label: 'Fő SSID' },
    ssidCast: { label: 'Cast SSID' },
    ssidIot: { label: 'IoT SSID' },
    ssidGuest: { label: 'Vendég SSID', default: 'Vendeg' },
    castSharesClientVlan: {
      label: 'A Cast SSID a kliens-VLAN-ba tesz',
      help: 'Bekapcsolva nincs külön Cast VLAN: a médialejátszók ugyanoda kerülnek, mint a háztartás többi kliense, így a felderítés VLAN-átjárás nélkül működik.',
    },
    guestIsolation: { label: 'Vendéghálózaton kliensizoláció' },
    ipPve: { label: 'Proxmox management' },
    ipAdguard: { label: 'AdGuard Home' },
    ipHomeAssistant: { label: 'Home Assistant' },
    ipPrinter: { label: 'Közös nyomtató' },
    ipWindows: { label: 'Windows VM' },
    ipMedia: { label: 'Médiaszerver' },
    ipProdDocker: { label: 'Éles Docker' },
    ipGitlab: { label: 'GitLab' },
    ipNextcloud: { label: 'Nextcloud' },
    ipRunner: { label: 'Teszt runner' },
    ipTunnel: { label: 'Tunnel konténer' },
    ramProfile: {
      label: 'Memóriaprofil',
      help: 'A vendéggépek RAM-kiosztását ez a választás szabja meg.',
      options: { '64': '64 GB – célszerű végállapot', '48': '48 GB – szűkített kiosztás' },
    },
    mgmtSeparateNic: {
      label: 'Külön management interfész',
      help: 'A Proxmox felület és a vendéggépek VLAN-trunkja külön fizikai porton fut, így a trunk átalakítása nem vágja el a felületet.',
    },
    trunkBridge: { label: 'Trunk bridge neve' },
    fastPoolName: { label: 'Gyors pool neve' },
    fastPoolDevices: {
      label: 'Gyors pool lemezei',
      help: 'Stabil /dev/disk/by-id/ útvonalak, vesszővel elválasztva. Ezek a lemezek a pool létrehozásakor törlődnek.',
    },
    mediaDiskCount: {
      label: 'Médialemezek száma',
      help: 'Külön fájlrendszerek, egyesítve egy könyvtár alá. Nem RAID.',
    },
    mediaMount: { label: 'Egyesített médiakönyvtár' },
    scratchDisk: { label: 'Külön scratch/cache lemez' },
    publicDomain: { label: 'Publikus domain' },
    mediaPublicPort: { label: 'Médiaszerver publikus port' },
    idsMode: {
      label: 'IDS/IPS mód',
      options: { ips: 'IPS – blokkol', ids: 'IDS – csak jelez', off: 'Kikapcsolva' },
    },
    layout: {
      label: 'Elrendezés',
      help: 'Ez dönti el, hány kliens-, IoT- és vendéghálózat jön létre, és hogy a szintek látják-e egymást.',
      options: {
        single: 'Egy háztartás – az egész épület egyben',
        floorsOpen: 'Szintenként külön alhálózat – a szintek átjárhatók',
        floorsIsolated: 'Szintenként külön háztartás – teljes elzárás',
      },
    },
    iotScope: {
      label: 'IoT-hálózatok',
      help: 'Ha a szintek amúgy is átjárhatók, a szintenkénti szenzor-alhálózat nem választ el semmit — ezért alapból csak teljes elzárásnál válik szét. Itt akkor is kérheted a szétvágást.',
      options: {
        auto: 'Az elrendezést követi – csak teljes elzárásnál külön',
        perFloor: 'Szintenként külön alhálózat',
        shared: 'Egy IoT-hálózat az egész épületnek',
      },
    },
    guestScope: {
      label: 'Vendéghálózatok',
      help: 'Ugyanez a választás a vendégeknek. Épületenként egy vendéghálózat rendszerint elég; a vendégek minden belső hálózattól így is el vannak zárva.',
      options: {
        auto: 'Az elrendezést követi – csak teljes elzárásnál külön',
        perFloor: 'Szintenként külön alhálózat',
        shared: 'Egy vendéghálózat az egész épületnek',
      },
    },
    vlanCameras: { label: 'CAMERA VLAN' },
    ipNvr: { label: 'Kamerarögzítő' },
    cameraCount: {
      label: 'Kamerák száma',
      help: 'Csak a terv méretezéséhez: ennyi fix címet és PoE-portot tartunk fenn.',
    },
    cameraRetentionDays: {
      label: 'Megőrzés (nap)',
      help: 'Ebből jön a rögzítőnek szánt tárhely nagyságrendje.',
    },
    cameraInternet: {
      label: 'A rögzítő kimehet az internetre',
      help: 'Kikapcsolva a rögzítő sem frissül és nem küld értesítést — a kamerák soha nem mennek ki.',
    },
  },

  paramGroups: {
    addressing: 'Címzés',
    vlans: 'Közös VLAN-ok',
    wifi: 'Wi-Fi',
    fixedIps: 'Fix címek',
    server: 'Szerver',
    storage: 'Tárhely',
    publishing: 'Publikálás',
    cameras: 'Kamerák',
  },

  net: {
    mgmt: 'Gateway, switchek, AP-k, hypervisor felülete',
    owner: 'Saját adminisztrációs kliensek',
    infra: 'Házon belüli infrastruktúra-szolgáltatások',
    vpn: 'Távoli adminisztráció alagúton keresztül',
    prod: 'Éles szolgáltatások',
    printers: 'Közösen használt vezetékes nyomtatók',
    dmz: 'Kifelé publikáló, befelé korlátozott konténerek',
    rdp: 'Távoli asztali munkaállomás',
    media: 'Médiaszerver és letöltőrendszer',
    test: 'Runner és tesztrendszerek',
    household: (name) => `${name} kliensei`,
    iot: (name) => `${name} okoseszközei`,
    guest: (name) => `${name} vendégei`,
    sharedGuest: 'Közös vagy kültéri vendéghálózat',
    sharedGuestName: 'GUEST-KOZOS',
    buildingName: 'HOME',
    buildingClients: 'Az épület kliensei',
    buildingIot: 'Az épület okoseszközei',
    buildingGuests: 'Vendégek az egész épületben',
    cameras: 'Kamerák; kifelé nem beszélnek, csak a rögzítő éri el őket',
  },

  ssid: {
    mainPurpose: 'Háztartások fő kliensei; a jelszó dönti el a VLAN-t',
    castShared:
      'Médialejátszók a háztartás kliens-VLAN-jában, hogy a felderítés VLAN-átjárás nélkül működjön',
    castSeparate: 'Médialejátszók külön kulccsal',
    castNote: 'Azonos VLAN a kliensekkel',
    iotPurpose: 'Okoseszközök, háztartásonként elkülönítve',
    iotPurposeShared: 'Okoseszközök, a lakók hálózataitól elkülönítve',
    guestPurpose: 'Vendégek, csak internet',
    clientsKey: (name) => `${name} – kliensek`,
    castKey: (name) => `${name} – lejátszók`,
    iotKey: (name) => `${name} – IoT`,
    guestKey: (name) => `${name} – vendégek`,
    sharedGuestKey: 'Közös vendég',
    band24: '2,4 GHz',
    band245: '2,4 + 5 GHz',
  },

  zone: {
    mgmt: 'Hálózati eszközök és a hypervisor felülete',
    owner: 'Saját adminisztrációs kliensek',
    infra: 'DNS és automatizálás',
    prod: 'Éles szolgáltatások',
    vpn: 'Távoli adminisztráció',
    external: 'Internet',
    house: (name) => `${name} kliensei`,
    iot: (name) => `${name} okoseszközei`,
    guest: 'Minden vendéghálózat',
    printers: 'Közös nyomtatók',
    cameras: 'Kamerák és a rögzítő',
    test: 'Teszt- és CI-rendszerek',
    media: 'Médiaszolgáltatások',
    rdp: 'Távoli asztal',
    dmz: 'Publikáló konténerek',
  },

  object: {
    pveMgmt: 'Hypervisor felülete',
    adguard: 'Hálózati DNS',
    homeAssistant: 'Automatizálás',
    printer: 'Közös nyomtató',
    windows: 'Windows VM',
    media: 'Médiaszerver',
    prodDocker: 'Éles konténerek',
    gitlab: 'Verziókezelés',
    nextcloud: 'Fájlszinkron',
    runner: 'CI futtató',
    tunnel: 'Kimenő alagút',
    dns: 'Névfeloldás',
    ntp: 'Időszinkron',
    proxmoxAdmin: 'Hypervisor felület és SSH',
    webHttps: 'Általános HTTPS',
    rdp: 'Távoli asztal',
    mediaStream: 'Médialejátszás',
    mediaAdmin: 'Médiastack admin',
    homeAssistantPort: 'Automatizálás felülete',
    gitlabWeb: 'GitLab felület',
    gitlabSsh: 'Git over SSH',
    printerTcp: 'Nyomtatási protokollok',
    printerSnmp: 'Állapotlekérdezés',
    printerAdmin: 'Nyomtató webes felülete',
    nvr: 'Kamerarögzítő',
    cameraStream: 'Kamerakép és felvétel',
    cameraAdmin: 'Rögzítő webes felülete',
  },

  policy: {
    internet: 'Internet',
    dns: 'Névfeloldás a hálózati szűrőn',
    mediaStream: 'Médialejátszás',
    nextcloud: 'Fájlszinkron',
    homeAssistant: 'Automatizálás felülete',
    printing: 'Nyomtatás',
    ntp: 'Időszinkron',
    automationToIot: 'Automatizálás eléri a háztartás eszközeit',
    iotBlock: 'Az okoseszközök nem érhetik el a menedzsmentet és a szervereket',
    crossHousehold: 'Háztartások közötti teljes elzárás (mindkét irány)',
    crossIot: 'IoT-zónák közötti teljes elzárás (mindkét irány)',
    guestInternet: 'Vendégek internetelérése',
    guestBlock: 'Vendégek nem érhetnek el belső erőforrást',
    ownerAdmin: 'Adminisztráció a megbízható kliensekről',
    vpnAdmin: 'Távoli adminisztráció alagúton keresztül',
    mediaBlock: 'A médiazóna nem kezdeményezhet befelé',
    testBlock: 'A tesztzóna nem érheti el az élest',
    dmzBlock: 'A publikáló konténer csak a kijelölt originhez férhet',
    printerBlock: 'A nyomtató nem kezdeményezhet forgalmat',
    catchAll: 'Alapértelmezett tiltás; e fölé kerül minden engedés',
    targetEveryZone: 'minden zóna',
    targetInternalZones: 'minden belső zóna',
    targetPublishedOrigin: 'minden belső zóna a publikált originen kívül',
    targetAllHouseAndIot: 'minden HOUSE és IOT zóna',
    crossFloorAllow: 'A szintek látják egymást: közös háztartás, külön alhálózatokkal',
    crossFloorIotBlock: 'Az okoseszközök a másik szint eszközeit így sem érhetik el',
    cameraBlock: 'A kamerák nem beszélnek kifelé és nem érnek el belső hálózatot',
    nvrToCameras: 'A rögzítő eléri a kamerákat',
    ownerToNvr: 'A rögzítő felülete a megbízható kliensekről érhető el',
    nvrInternet: 'A rögzítő frissítéshez és értesítéshez kimehet',
  },

  guest: {
    'windows-rdp': 'Távoli asztali munkaállomás',
    gitlab: 'Verziókezelés és CI vezérlés',
    'media-docker': 'Médiastack, hardveres transzkódolással',
    'prod-docker': 'Éles konténerek',
    'gitlab-runner': 'CI futtató és böngészőtesztek',
    'home-assistant': 'Otthoni automatizálás',
    nextcloud: 'Fájlszinkron és megosztás',
    adguard: 'Hálózati DNS-szűrés',
    'cloudflare-tunnel': 'Kimenő alagút a publikált eszközökhöz',
    /** RAM note on the tightened profile, where the runner is not kept up. */
    runOnDemand: '4 GB · csak használatkor fusson',
  },

  storage: {
    fastPool: 'Vendéggépek és konténerek elsődleges tárhelye',
    mediaDisk: 'Médiaadatok, önálló fájlrendszer',
    mediaMount: 'A médialemezek egyesített nézete; nem RAID, nem ad redundanciát',
    scratch: 'Átmeneti transzkód- és gyorsítótár',
    mediaDevice: (i) => `/dev/disk/by-id/… (média ${i}.)`,
    scratchDevice: '/dev/disk/by-id/… (scratch SSD)',
  },

  service: {
    adguard: 'Hálózati DNS-szűrés',
    'home-assistant': 'Otthoni automatizálás',
    gitlab: 'Verziókezelés és CI',
    'prod-docker': 'Éles konténerek',
    'media-stack': 'Médialejátszás',
    nextcloud: 'Fájlszinkron és megosztás',
    'cloudflare-tunnel': 'Publikálás portnyitás nélkül',
    cameras: 'Kamerakép rögzítése és visszanézése',
    camerasName: 'Kamerarögzítő',
    'windows-rdp': 'Távoli asztal, csak alagúton át',
    adguardName: 'AdGuard Home',
    homeAssistantName: 'Home Assistant',
    gitlabName: 'GitLab',
    prodDockerName: 'Éles Docker',
    mediaName: 'Médiaszerver',
    nextcloudName: 'Nextcloud',
    tunnelName: 'Tunnel',
    windowsName: 'Windows RDP',
    perStack: 'stackenként',
    outbound: 'kimenő',
  },
};

const EN: MhText = {
  presetName: 'Multi-household Proxmox + UniFi',
  presetDescription:
    'One gateway, one hypervisor and several households that are fully shut off from each other. Every household gets a client, IoT and guest network; shared services live in their own zones and are reachable only through named allows.',
  households: HOUSEHOLDS_EN,

  modules: {
    scope: {
      title: 'Scope and settled decisions',
      summary: 'The decisions every other module takes as given.',
    },
    'hardware-state': {
      title: 'Current hardware state',
      summary: 'Hardware inventory, known disks and the devices ruled out.',
    },
    architecture: {
      title: 'Target architecture',
      summary: 'The end state for the gateway, switches, server and guests.',
    },
    'safety-rules': {
      title: 'Safety and execution rules',
      summary: 'Handling destructive commands, closing a module, requirements for public services.',
    },
    'vlan-wifi': {
      title: 'VLAN and Wi-Fi layout',
      summary: 'Client, IoT and guest VLAN per household, with PPSK under the existing SSIDs.',
    },
    firewall: {
      title: 'Firewall and isolation rules',
      summary: 'Zone-based firewall zones, address and port objects, blocking between households.',
    },
    'shared-printer': {
      title: 'Shared wired printer',
      summary: 'A separate printer VLAN with a fixed address and named allows from each household.',
    },
    'gateway-hardening': {
      title: 'Gateway hardening, IDS/IPS',
      summary: 'Enable IPS, disable UPnP, keep WAN to a minimum and layer the firewall.',
    },
    'pve-bridges': {
      title: 'Proxmox network bridges',
      summary: 'A separate management interface and a VLAN-aware trunk bridge for the guests.',
    },
    'public-access': {
      title: 'Public access and DDNS',
      summary: 'Port forwarding, DDNS and the rules for publicly reachable services.',
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
      summary: 'Version check, repository, update and the base tools.',
    },
    'disk-validation': {
      title: 'Hardware validation and disk exclusion',
      summary: 'HBA check, disk inventory, SMART and ruling out failing disks.',
    },
    storage: {
      title: 'Final storage architecture',
      summary: 'A ZFS mirror for the guests, separate media disks behind mergerfs.',
    },
    resources: {
      title: 'Resource plan',
      summary: 'Per-guest vCPU, RAM and disk size for the chosen memory profile.',
    },
    'vm-template': {
      title: 'Linux VM base template',
      summary: 'A shared base template for the Linux guests, with the Docker repository.',
    },
    adguard: {
      title: 'AdGuard Home LXC',
      summary: 'Network DNS filtering in a container; DHCP points its DNS here.',
    },
    'home-assistant': {
      title: 'Home Assistant OS VM',
      summary: 'Automation in its own VM, with USB passthrough for the radio coordinator.',
    },
    'windows-rdp': {
      title: 'Windows remote desktop VM',
      summary: 'A Windows workstation in its own VLAN, reachable over VPN only.',
    },
    gitlab: { title: 'GitLab VM', summary: 'Self-hosted GitLab in the production server zone.' },
    'gitlab-runner': {
      title: 'GitLab Runner and Playwright',
      summary: 'CI runner and browser-test environment in the test zone.',
    },
    'prod-docker': {
      title: 'Production Docker VM',
      summary: 'Compose-based production containers in their own VM.',
    },
    'media-docker': {
      title: 'Media VM, Quick Sync and mergerfs',
      summary: 'Media stack VM with iGPU passthrough and a unified media library.',
    },
    'media-stack': {
      title: 'Media server and stack',
      summary: 'The media server and the automation containers around it.',
    },
    nextcloud: {
      title: 'Nextcloud AIO',
      summary: 'File sync in its own VM, with direct HTTPS access.',
    },
    'cloudflare-tunnel': {
      title: 'Cloudflare Tunnel',
      summary: 'Publishing small web tools without opening a port, from the DMZ.',
    },
    cameras: {
      title: 'Camera system',
      summary:
        'A separate camera VLAN and a recorder. The cameras never reach the internet, and no internal network either.',
    },
    'boot-order': {
      title: 'Start-up and shutdown order',
      summary: 'The boot order of the guests and the delays between them.',
    },
    monitoring: {
      title: 'Monitoring, SMART and ZFS maintenance',
      summary: 'Scrub, SMART tests, uptime monitoring and capacity alerts.',
    },
    updates: {
      title: 'Update process',
      summary: 'The monthly maintenance order and per-service updates.',
    },
    troubleshooting: {
      title: 'Troubleshooting scenarios',
      summary: 'The most common failures and the order in which to check them.',
    },
    handover: {
      title: 'Final handover checklist',
      summary: 'The closing check of the whole system before it goes live.',
    },
  },

  params: {
    ipPrefix: {
      label: 'IP prefix',
      help: 'The first two octets shared by every /24. Every VLAN inherits it.',
    },
    gatewayHostByte: { label: 'Gateway host octet' },
    vlanMgmt: { label: 'MGMT VLAN' },
    vlanOwner: { label: 'OWNER-TRUSTED VLAN' },
    vlanInfra: { label: 'INFRA VLAN' },
    vlanPrinters: { label: 'SHARED-PRINTERS VLAN' },
    vlanDmz: { label: 'DMZ VLAN' },
    vlanVpn: { label: 'VPN VLAN' },
    vlanRdp: { label: 'RDP VLAN' },
    vlanMedia: { label: 'MEDIA VLAN' },
    vlanTest: { label: 'SERVER-TEST VLAN' },
    vlanProd: { label: 'SERVER-PROD VLAN' },
    sharedGuestVlan: {
      label: 'Shared guest VLAN',
      help: 'Set to 0 to skip a separate shared guest network.',
    },
    ssidMain: { label: 'Main SSID' },
    ssidCast: { label: 'Cast SSID' },
    ssidIot: { label: 'IoT SSID' },
    ssidGuest: { label: 'Guest SSID', default: 'Guest' },
    castSharesClientVlan: {
      label: 'The Cast SSID joins the client VLAN',
      help: 'On, there is no separate Cast VLAN: media players land where the rest of the household’s clients are, so discovery works without crossing a VLAN.',
    },
    guestIsolation: { label: 'Client isolation on the guest network' },
    ipPve: { label: 'Proxmox management' },
    ipAdguard: { label: 'AdGuard Home' },
    ipHomeAssistant: { label: 'Home Assistant' },
    ipPrinter: { label: 'Shared printer' },
    ipWindows: { label: 'Windows VM' },
    ipMedia: { label: 'Media server' },
    ipProdDocker: { label: 'Production Docker' },
    ipGitlab: { label: 'GitLab' },
    ipNextcloud: { label: 'Nextcloud' },
    ipRunner: { label: 'Test runner' },
    ipTunnel: { label: 'Tunnel container' },
    ramProfile: {
      label: 'Memory profile',
      help: 'This choice sets how much RAM each guest gets.',
      options: { '64': '64 GB – the sensible end state', '48': '48 GB – tightened allocation' },
    },
    mgmtSeparateNic: {
      label: 'Separate management interface',
      help: 'The Proxmox interface and the guests’ VLAN trunk run on different physical ports, so converting the trunk does not cut the interface.',
    },
    trunkBridge: { label: 'Trunk bridge name' },
    fastPoolName: { label: 'Fast pool name' },
    fastPoolDevices: {
      label: 'Fast pool disks',
      help: 'Stable /dev/disk/by-id/ paths, comma separated. These disks are wiped when the pool is created.',
    },
    mediaDiskCount: {
      label: 'Number of media disks',
      help: 'Separate filesystems, merged under one directory. Not RAID.',
    },
    mediaMount: { label: 'Unified media directory' },
    scratchDisk: { label: 'Separate scratch/cache disk' },
    publicDomain: { label: 'Public domain' },
    mediaPublicPort: { label: 'Media server public port' },
    idsMode: {
      label: 'IDS/IPS mode',
      options: { ips: 'IPS – blocks', ids: 'IDS – alerts only', off: 'Disabled' },
    },
    layout: {
      label: 'Layout',
      help: 'This decides how many client, IoT and guest networks are created, and whether the floors can see each other.',
      options: {
        single: 'One household – the whole building together',
        floorsOpen: 'A subnet per floor – floors can reach each other',
        floorsIsolated: 'A household per floor – fully shut off',
      },
    },
    iotScope: {
      label: 'IoT networks',
      help: 'Where the floors can reach each other anyway, a sensor subnet per floor separates nothing — so by default IoT is only split under full isolation. Set it here if you want the split regardless.',
      options: {
        auto: 'Follow the layout – split only under full isolation',
        perFloor: 'A subnet per floor',
        shared: 'One IoT network for the whole building',
      },
    },
    guestScope: {
      label: 'Guest networks',
      help: 'Same choice for guests. One guest network per building is usually enough; guests are shut off from everything internal either way.',
      options: {
        auto: 'Follow the layout – split only under full isolation',
        perFloor: 'A subnet per floor',
        shared: 'One guest network for the whole building',
      },
    },
    vlanCameras: { label: 'CAMERA VLAN' },
    ipNvr: { label: 'Camera recorder' },
    cameraCount: {
      label: 'Number of cameras',
      help: 'For sizing only: this many fixed addresses and PoE ports are held.',
    },
    cameraRetentionDays: {
      label: 'Retention (days)',
      help: 'Sets the order of magnitude for the recorder’s storage.',
    },
    cameraInternet: {
      label: 'The recorder may reach the internet',
      help: 'Turned off, the recorder neither updates nor sends notifications — the cameras never go out either way.',
    },
  },

  paramGroups: {
    addressing: 'Addressing',
    vlans: 'Shared VLANs',
    wifi: 'Wi-Fi',
    fixedIps: 'Fixed addresses',
    server: 'Server',
    storage: 'Storage',
    publishing: 'Publishing',
    cameras: 'Cameras',
  },

  net: {
    mgmt: 'Gateway, switches, APs, hypervisor interface',
    owner: 'Your own administration clients',
    infra: 'In-house infrastructure services',
    vpn: 'Remote administration over a tunnel',
    prod: 'Production services',
    printers: 'Shared wired printers',
    dmz: 'Containers that publish outward and are restricted inward',
    rdp: 'Remote desktop workstation',
    media: 'Media server and downloader',
    test: 'Runner and test systems',
    household: (name) => `${name} clients`,
    iot: (name) => `${name} smart devices`,
    guest: (name) => `${name} guests`,
    sharedGuest: 'Shared or outdoor guest network',
    sharedGuestName: 'GUEST-SHARED',
    buildingName: 'HOME',
    buildingClients: 'The building’s clients',
    buildingIot: 'The building’s smart devices',
    buildingGuests: 'Guests across the whole building',
    cameras: 'Cameras; they never talk outward, only the recorder reaches them',
  },

  ssid: {
    mainPurpose: 'Main household clients; the password decides the VLAN',
    castShared:
      'Media players in the household’s client VLAN, so discovery works without crossing a VLAN',
    castSeparate: 'Media players on a separate key',
    castNote: 'Same VLAN as the clients',
    iotPurpose: 'Smart devices, separated per household',
    iotPurposeShared: 'Smart devices, kept apart from the residents’ networks',
    guestPurpose: 'Guests, internet only',
    clientsKey: (name) => `${name} – clients`,
    castKey: (name) => `${name} – players`,
    iotKey: (name) => `${name} – IoT`,
    guestKey: (name) => `${name} – guests`,
    sharedGuestKey: 'Shared guest',
    band24: '2.4 GHz',
    band245: '2.4 + 5 GHz',
  },

  zone: {
    mgmt: 'Network devices and the hypervisor interface',
    owner: 'Your own administration clients',
    infra: 'DNS and automation',
    prod: 'Production services',
    vpn: 'Remote administration',
    external: 'Internet',
    house: (name) => `${name} clients`,
    iot: (name) => `${name} smart devices`,
    guest: 'Every guest network',
    printers: 'Shared printers',
    cameras: 'Cameras and the recorder',
    test: 'Test and CI systems',
    media: 'Media services',
    rdp: 'Remote desktop',
    dmz: 'Publishing containers',
  },

  object: {
    pveMgmt: 'Hypervisor interface',
    adguard: 'Network DNS',
    homeAssistant: 'Automation',
    printer: 'Shared printer',
    windows: 'Windows VM',
    media: 'Media server',
    prodDocker: 'Production containers',
    gitlab: 'Version control',
    nextcloud: 'File sync',
    runner: 'CI runner',
    tunnel: 'Outbound tunnel',
    dns: 'Name resolution',
    ntp: 'Time sync',
    proxmoxAdmin: 'Hypervisor interface and SSH',
    webHttps: 'General HTTPS',
    rdp: 'Remote desktop',
    mediaStream: 'Media playback',
    mediaAdmin: 'Media stack admin',
    homeAssistantPort: 'Automation interface',
    gitlabWeb: 'GitLab interface',
    gitlabSsh: 'Git over SSH',
    printerTcp: 'Printing protocols',
    printerSnmp: 'Status queries',
    printerAdmin: 'Printer web interface',
    nvr: 'Camera recorder',
    cameraStream: 'Camera stream and recording',
    cameraAdmin: 'Recorder web interface',
  },

  policy: {
    internet: 'Internet',
    dns: 'Name resolution through the network filter',
    mediaStream: 'Media playback',
    nextcloud: 'File sync',
    homeAssistant: 'Automation interface',
    printing: 'Printing',
    ntp: 'Time sync',
    automationToIot: 'Automation reaches the household’s devices',
    iotBlock: 'Smart devices must not reach management or the servers',
    crossHousehold: 'Full block between households (both directions)',
    crossIot: 'Full block between IoT zones (both directions)',
    guestInternet: 'Guest internet access',
    guestBlock: 'Guests must not reach any internal resource',
    ownerAdmin: 'Administration from the trusted clients',
    vpnAdmin: 'Remote administration over a tunnel',
    mediaBlock: 'The media zone must not initiate inward',
    testBlock: 'The test zone must not reach production',
    dmzBlock: 'The publishing container may reach only the designated origin',
    printerBlock: 'The printer must not initiate traffic',
    catchAll: 'Default deny; every allow sits above this',
    targetEveryZone: 'every zone',
    targetInternalZones: 'every internal zone',
    targetPublishedOrigin: 'every internal zone other than the published origin',
    targetAllHouseAndIot: 'every HOUSE and IOT zone',
    crossFloorAllow: 'Floors can see each other: one household, separate subnets',
    crossFloorIotBlock: 'Smart devices still cannot reach the other floor’s devices',
    cameraBlock: 'Cameras do not talk outward and reach no internal network',
    nvrToCameras: 'The recorder reaches the cameras',
    ownerToNvr: 'The recorder’s interface is reachable from the trusted clients',
    nvrInternet: 'The recorder may go out for updates and notifications',
  },

  guest: {
    'windows-rdp': 'Remote desktop workstation',
    gitlab: 'Version control and CI orchestration',
    'media-docker': 'Media stack with hardware transcoding',
    'prod-docker': 'Production containers',
    'gitlab-runner': 'CI runner and browser tests',
    'home-assistant': 'Home automation',
    nextcloud: 'File sync and sharing',
    adguard: 'Network DNS filtering',
    'cloudflare-tunnel': 'Outbound tunnel for the published tools',
    runOnDemand: '4 GB · run only when needed',
  },

  storage: {
    fastPool: 'Primary storage for guests and containers',
    mediaDisk: 'Media data on its own filesystem',
    mediaMount: 'A merged view of the media disks; not RAID, and it adds no redundancy',
    scratch: 'Temporary transcode and cache space',
    mediaDevice: (i) => `/dev/disk/by-id/… (media ${i})`,
    scratchDevice: '/dev/disk/by-id/… (scratch SSD)',
  },

  service: {
    adguard: 'Network DNS filtering',
    'home-assistant': 'Home automation',
    gitlab: 'Version control and CI',
    'prod-docker': 'Production containers',
    'media-stack': 'Media playback',
    nextcloud: 'File sync and sharing',
    'cloudflare-tunnel': 'Publishing without opening a port',
    cameras: 'Recording and reviewing camera footage',
    camerasName: 'Camera recorder',
    'windows-rdp': 'Remote desktop, over the tunnel only',
    adguardName: 'AdGuard Home',
    homeAssistantName: 'Home Assistant',
    gitlabName: 'GitLab',
    prodDockerName: 'Production Docker',
    mediaName: 'Media server',
    nextcloudName: 'Nextcloud',
    tunnelName: 'Tunnel',
    windowsName: 'Windows RDP',
    perStack: 'per stack',
    outbound: 'outbound',
  },
};

export function mhText(lang: Lang): MhText {
  return lang === 'en' ? EN : HU;
}
