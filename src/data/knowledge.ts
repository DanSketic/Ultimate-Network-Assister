import type { Lang } from '@/i18n';
import { ARTICLES_EN, CONFIG_BY_KIND_EN, KB_BY_KIND_EN } from './knowledge.en';
import type { ConfigGuide, KbArticle, KbTeaser, NodeKind } from './model';

export function kbByKind(lang: Lang): Record<NodeKind, KbTeaser[]> {
  return lang === 'en' ? KB_BY_KIND_EN : KB_BY_KIND;
}

export function configByKind(lang: Lang): Record<NodeKind, ConfigGuide> {
  return lang === 'en' ? CONFIG_BY_KIND_EN : CONFIG_BY_KIND;
}

export function articles(lang: Lang): KbArticle[] {
  return lang === 'en' ? ARTICLES_EN : ARTICLES;
}

/** Guides surfaced in the inspector, keyed by the selected node's kind. */
export const KB_BY_KIND: Record<NodeKind, KbTeaser[]> = {
  gateway: [
    {
      title: 'VLAN trunk ellenőrzése átjáró és switch között',
      subtitle: 'Tagged uplink, natív VLAN és a leggyakoribb konfigurációs hibák',
      tag: 'Hálózat',
    },
    {
      title: 'Tűzfalszabályok sorrendje és állapotkövetés',
      subtitle: 'Miért nem érvényesül a szabály a várt módon',
      tag: 'Biztonság',
    },
    {
      title: 'Firmware frissítés szolgáltatáskiesés nélkül',
      subtitle: 'Ablak, előellenőrzés és visszaállítási terv',
      tag: 'Üzemeltetés',
    },
  ],
  switch: [
    {
      title: 'PoE port diagnosztika',
      subtitle: 'Túlterhelés, ciklikus újraindulás és kábelhiba elkülönítése',
      tag: 'Hardver',
    },
    {
      title: 'Port profil és VLAN hozzárendelés',
      subtitle: 'Access és trunk port helyes beállítása',
      tag: 'Hálózat',
    },
  ],
  ap: [
    {
      title: 'Csatorna-interferencia csökkentése',
      subtitle: 'Mérés, fix csatorna és adóteljesítmény összefüggései',
      tag: 'Wi-Fi',
    },
    {
      title: 'SSID → VLAN leképezés igazolása',
      subtitle: 'Hogyan bizonyítod, hogy az IoT SSID valóban izolált',
      tag: 'Wi-Fi',
    },
  ],
  host: [
    {
      title: 'Proxmox bridge módosítása biztonságosan',
      subtitle: 'Miért kell helyi konzol és visszaállítási terv',
      tag: 'Proxmox',
    },
    {
      title: 'Snapshot és checkpoint stratégia',
      subtitle: 'Mikor elég a snapshot és mikor kell teljes mentés',
      tag: 'Mentés',
    },
    {
      title: 'Tárolókapacitás és thin provisioning',
      subtitle: 'A 80%-os küszöb és a következményei',
      tag: 'Tárolás',
    },
  ],
  vm: [
    {
      title: 'VM mentés és visszaállítási próba',
      subtitle: 'vzdump, megőrzés és az ellenőrzött visszatöltés',
      tag: 'Mentés',
    },
    {
      title: 'Vendéghálózat és VLAN tag a VM-en',
      subtitle: 'Bridge, tag és tűzfal a Proxmox oldalán',
      tag: 'Hálózat',
    },
  ],
  ct: [
    {
      title: 'LXC és VM közötti választás',
      subtitle: 'Erőforrás, izoláció és mentési különbségek',
      tag: 'Proxmox',
    },
    {
      title: 'Controller kiesés hatása',
      subtitle: 'Mi működik tovább és mi nem',
      tag: 'Üzemeltetés',
    },
  ],
  storage: [
    {
      title: 'ZFS pool egészség és scrub',
      subtitle: 'Mit jelent a degraded állapot és mi a teendő',
      tag: 'Tárolás',
    },
    {
      title: 'Offsite replikáció ellenőrzése',
      subtitle: 'A 3-2-1 szabály a gyakorlatban',
      tag: 'Mentés',
    },
  ],
  svc: [
    {
      title: 'Szolgáltatás kitettségének ellenőrzése',
      subtitle: 'Publikus elérés, reverse proxy és védelmi rétegek',
      tag: 'Biztonság',
    },
    {
      title: 'Kötet-szintű mentés konténereknél',
      subtitle: 'Miért nem elég a lemezkép mentése',
      tag: 'Mentés',
    },
  ],
  cloud: [
    {
      title: 'Uplink redundancia',
      subtitle: 'Failover, SLA és a valós kiesések kezelése',
      tag: 'Hálózat',
    },
  ],
  clients: [
    {
      title: 'Ismeretlen eszközök besorolása',
      subtitle: 'MAC, DHCP fingerprint és a becslés határai',
      tag: 'Hálózat',
    },
  ],
};

/**
 * The safe-order checklist shown on the inspector's "Konfigurálás" tab. None of
 * these steps run automatically — the application only prepares them.
 */
export const CONFIG_BY_KIND: Record<NodeKind, ConfigGuide> = {
  gateway: {
    note: 'Az átjáró módosítása megszakíthatja a távoli elérést. Az alkalmazás nem hajt végre automatikus változtatást.',
    steps: [
      'Felmérés: aktuális tűzfal- és hálózati konfiguráció exportálása',
      'Előellenőrzés: érintett VLAN-ok, kliensek és szolgáltatások listája',
      'Mentés: site backup letöltése helyi gépre',
      'Végrehajtás: egy változtatás egy ciklusban',
      'Ellenőrzés: kliensek elérése és naplók 10 percen át',
      'Visszaállítás: site backup visszatöltése',
    ],
    commands: [
      { label: 'Aktív szabályok listája', command: 'ssh admin@10.0.1.1 "show firewall statistics"' },
      {
        label: 'Konfiguráció mentése',
        command: 'ssh admin@10.0.1.1 "show configuration commands" > gw-backup.cfg',
      },
    ],
  },
  switch: {
    note: 'A port profil módosítása leválaszthatja az adott porton lévő eszközt.',
    steps: [
      'Felmérés: port–eszköz hozzárendelés kiolvasása LLDP alapján',
      'Előellenőrzés: uplink és PoE terhelés ellenőrzése',
      'Mentés: site backup',
      'Ellenőrzés: link állapot és VLAN tagság a módosítás után',
    ],
    commands: [
      { label: 'Port állapot', command: 'ssh admin@10.0.1.2 "swctrl port show"' },
      { label: 'PoE státusz', command: 'ssh admin@10.0.1.2 "swctrl poe show"' },
    ],
  },
  ap: {
    note: 'A rádióbeállítások módosítása rövid, néhány másodperces asszociációvesztést okoz.',
    steps: [
      'Felmérés: csatornafoglaltság mérése legalább 24 órán át',
      'Előellenőrzés: érintett kliensek és roaming beállítás',
      'Mentés: site backup',
      'Ellenőrzés: újraküldési arány és kliensszám 24 óra múlva',
    ],
    commands: [
      { label: 'Rádió állapot', command: 'ssh admin@10.0.1.22 "iwconfig"' },
      { label: 'Kliensek', command: 'ssh admin@10.0.1.22 "wstalist | head -40"' },
    ],
  },
  host: {
    note: 'Hálózati változtatás a Proxmox hoston helyi recovery-konzolt igényel. Az SSH megszakadhat.',
    steps: [
      'Felmérés: /etc/network/interfaces és tárolóállapot mentése',
      'Előellenőrzés: helyi konzol vagy IPMI elérés igazolása',
      'Mentés: konfigurációs mentés és VM snapshotok',
      'Végrehajtás: egy változtatás, majd azonnali ellenőrzés',
      'Ellenőrzés: host és VM elérés minden VLAN-ban',
      'Visszaállítás: az eredeti interfaces fájl visszamásolása konzolról',
    ],
    commands: [
      { label: 'Hálózati konfiguráció', command: 'cat /etc/network/interfaces' },
      { label: 'Tárolók állapota', command: 'pvesm status' },
      { label: 'VM és LXC lista', command: 'qm list; pct list' },
    ],
  },
  vm: {
    note: 'A vendéggép hálózati beállításának módosítása előtt készíts snapshotot.',
    steps: [
      'Felmérés: vendég hálózati interfész és VLAN tag kiolvasása',
      'Előellenőrzés: mentés érvényessége és szabad kapacitás',
      'Mentés: snapshot a művelet előtt',
      'Ellenőrzés: szolgáltatás elérés a módosítás után',
    ],
    commands: [
      { label: 'VM konfiguráció', command: 'qm config 202' },
      {
        label: 'Snapshot készítése',
        command: 'qm snapshot 202 pre-change --description "Network Assister"',
      },
    ],
  },
  ct: {
    note: 'A konténer újraindítása megszakítja a hozzá kötött szolgáltatásokat.',
    steps: [
      'Felmérés: konténer konfiguráció és erőforrások',
      'Előellenőrzés: függő szolgáltatások azonosítása',
      'Mentés: vzdump vagy snapshot',
      'Ellenőrzés: szolgáltatás elérése és naplók',
    ],
    commands: [
      { label: 'Konténer konfiguráció', command: 'pct config 101' },
      { label: 'Mentés', command: 'vzdump 101 --mode snapshot --storage tank' },
    ],
  },
  storage: {
    note: 'A pool műveletek hosszú ideig futhatnak és terhelik a lemezeket.',
    steps: [
      'Felmérés: pool állapot, snapshotok és foglaltság',
      'Előellenőrzés: replikációtól függő snapshotok kizárása',
      'Mentés: offsite replikáció sikeres lefutása',
      'Ellenőrzés: szabad kapacitás és pool egészség',
    ],
    commands: [
      { label: 'Pool állapot', command: 'zpool status tank' },
      { label: 'Foglaltság', command: 'zfs list -o name,used,avail,refer -t all' },
    ],
  },
  svc: {
    note: 'A szolgáltatás konfigurációjának módosítása előtt mentsd a konfigurációs köteteket.',
    steps: [
      'Felmérés: futó konténer, portok és kötetek listája',
      'Előellenőrzés: külső elérés és függőségek',
      'Mentés: kötet-szintű archiválás',
      'Ellenőrzés: szolgáltatás elérése és naplók',
    ],
    commands: [
      {
        label: 'Konténerek',
        command: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
      },
      { label: 'Kötetek', command: 'docker volume ls' },
    ],
  },
  cloud: {
    note: 'Az uplink paramétereit a szolgáltató oldalán kell módosítani.',
    steps: [
      'Felmérés: WAN sebesség és késleltetés mérése',
      'Előellenőrzés: szerződéses sávszélesség',
      'Ellenőrzés: mérés ismétlése terhelés alatt',
    ],
    commands: [{ label: 'Útvonal', command: 'mtr -r -c 20 1.1.1.1' }],
  },
  clients: {
    note: 'A kliens besorolás becsült adat, módosítás előtt igazold a tényleges eszközt.',
    steps: [
      'Felmérés: DHCP foglalások és fingerprint adatok',
      'Előellenőrzés: nem azonosított eszközök manuális azonosítása',
      'Ellenőrzés: VLAN besorolás igazolása forgalmi mintával',
    ],
    commands: [{ label: 'DHCP foglalások', command: 'ssh admin@10.0.1.1 "show dhcp leases"' }],
  },
};

export const ARTICLES: KbArticle[] = [
  {
    title: 'Proxmox bridge módosítása biztonságosan',
    tag: 'Proxmox',
    related: 'pve01 · vmbr0 · érintett: 4 VM',
    lead: 'A vmbr0 átalakítása VLAN-tudatos bridge-re megszakítja a host hálózati kapcsolatát. Ez a leggyakoribb oka annak, hogy egy távoli munkamenet után a Proxmox felület elérhetetlenné válik.',
    sections: [
      {
        heading: 'Mit jelent',
        body: 'A VLAN-aware bridge a tagelést a hostra hozza, így VM-enként adható meg a VLAN. Cserébe a bridge újraépül, és az aktív kapcsolatok megszakadnak.',
      },
      {
        heading: 'Miért kockázat',
        body: 'Ha a switch oldali port nem trunk, vagy a natív VLAN eltér, a host a módosítás után nem lesz elérhető. Távoli SSH-ból ez nem javítható.',
      },
      {
        heading: 'Ellenőrzési pontok',
        body: 'Helyi konzol vagy IPMI elérés igazolása · switch port trunk módban · /etc/network/interfaces mentése · VM-enkénti VLAN tag terve · visszaállítási parancs előkészítve',
      },
    ],
    commands: [
      {
        label: 'Konfiguráció mentése',
        command: 'cp /etc/network/interfaces /root/interfaces.bak.$(date +%F)',
      },
      { label: 'Változtatás ellenőrzése alkalmazás előtt', command: 'ifreload -a -s' },
      {
        label: 'Visszaállítás konzolról',
        command: 'cp /root/interfaces.bak.* /etc/network/interfaces && ifreload -a',
      },
    ],
  },
  {
    title: 'Az IoT izoláció igazolása',
    tag: 'Biztonság',
    related: 'VLAN 20 · 24 eszköz · szabály nem ellenőrzött',
    lead: 'A tűzfalszabály megléte nem bizonyíték. Az Ultimate Network Assister addig „nem ellenőrzött” állapotban tartja a szegmentációt, amíg a tényleges forgalom el nem akad egy mérésben.',
    sections: [
      {
        heading: 'Mit jelent',
        body: 'A felmérés a konfigurációt olvassa, nem a forgalmat. Egy korábbi engedélyező szabály felülírhatja a tiltást a lánc elején.',
      },
      {
        heading: 'Miért kockázat',
        body: 'Egy kompromittált IoT eszköz oldalirányban elérheti a munkaállomásokat, ha a szabály sorrendje hibás.',
      },
      {
        heading: 'Ellenőrzési pontok',
        body: 'Szabálysorrend kiolvasása · ellenőrző kliens a VLAN 20-ban · elérési teszt a Trusted zóna felé · naplóbejegyzés a tiltásról · ideiglenes eszköz eltávolítása',
      },
    ],
    commands: [
      {
        label: 'Szabálysorrend',
        command: 'ssh admin@10.0.1.1 "show firewall name LAN_IN statistics"',
      },
      { label: 'Elérési teszt', command: 'nc -zvw2 10.0.10.24 445' },
    ],
  },
  {
    title: 'Mentési bizonyíték kontra mentési job',
    tag: 'Mentés',
    related: 'GitLab kötetek · bizonyíték hiányzik',
    lead: 'Egy futó job önmagában nem bizonyíték. Bizonyíték az ellenőrzött visszaállítás, amelyről napló és időbélyeg készült.',
    sections: [
      {
        heading: 'Mit jelent',
        body: 'A vzdump a lemezképet menti. A konténerkötetek konzisztenciája ettől még nem garantált, ha az alkalmazás írás közben volt.',
      },
      {
        heading: 'Miért kockázat',
        body: 'A visszaállítás pillanatában derül ki, hogy az adat használhatatlan – ekkor már nincs alternatíva.',
      },
      {
        heading: 'Ellenőrzési pontok',
        body: 'Kötetek listája és mérete · alkalmazás-konzisztens mentési mód · visszaállítási próba izolált környezetben · a próba naplózása · megőrzési szabály rögzítése',
      },
    ],
    commands: [
      {
        label: 'Kötetek listája',
        command: 'docker volume ls -q | xargs docker volume inspect --format "{{.Name}} {{.Mountpoint}}"',
      },
      { label: 'Mentés', command: 'vzdump 202 --mode snapshot --storage tank --compress zstd' },
    ],
  },
  {
    title: 'ZFS kapacitás és a 80%-os küszöb',
    tag: 'Tárolás',
    related: 'tank · 87% használt',
    lead: 'A ZFS copy-on-write működése miatt a szabad hely fogyásával a fragmentáció és a késleltetés nő. 80% felett ez már mérhető, 90% felett kritikus.',
    sections: [
      {
        heading: 'Mit jelent',
        body: 'Az írás új blokkokat foglal, a régi adat csak akkor szabadul fel, ha nincs rá hivatkozó snapshot.',
      },
      {
        heading: 'Miért kockázat',
        body: 'A snapshotok és a replikáció elakadhatnak, a VM-ek írási hibát kaphatnak.',
      },
      {
        heading: 'Ellenőrzési pontok',
        body: 'Snapshotok által foglalt méret · replikációtól függő snapshotok · megőrzési szabály · scrub eredménye · szabad kapacitás a törlés után',
      },
    ],
    commands: [
      {
        label: 'Snapshot foglaltság',
        command: 'zfs list -o name,used,refer -t snapshot -s used | tail -20',
      },
      { label: 'Pool egészség', command: 'zpool status -v tank' },
    ],
  },
  {
    title: 'Wi-Fi csatorna-interferencia kezelése',
    tag: 'Wi-Fi',
    related: 'AP – Emelet · 68% kihasználtság',
    lead: 'A magas újraküldési arány szinte mindig csatornaütközésre vezethető vissza, nem a lefedettségre. A teljesítmény növelése ilyenkor ront a helyzeten.',
    sections: [
      {
        heading: 'Mit jelent',
        body: 'A kihasználtság a levegő foglaltságát méri, beleértve a szomszédos hálózatokat is.',
      },
      {
        heading: 'Miért kockázat',
        body: 'Az újraküldés csökkenti az effektív sávszélességet és megnöveli a késleltetést a teljes cellában.',
      },
      {
        heading: 'Ellenőrzési pontok',
        body: '24 órás csatornamérés · szomszédos hálózatok csatornái · fix csatorna kiosztás · adóteljesítmény közepesre · újraküldés újramérése',
      },
    ],
    commands: [
      { label: 'Csatornafoglaltság', command: 'ssh admin@10.0.1.22 "mca-dump | grep -A3 channel"' },
    ],
  },
  {
    title: 'Felmért, becsült és nem ellenőrizhető adatok',
    tag: 'Módszertan',
    related: 'A teljes felmérésre vonatkozik',
    lead: 'Az alkalmazás minden megjelenített összefüggéshez megőrzi a forrását. Ez határozza meg, hogy egy javaslat végrehajtható-e, vagy előbb mérés szükséges.',
    sections: [
      {
        heading: 'Felmért',
        body: 'Közvetlenül olvasott API- vagy SSH-adat, időbélyeggel. Ezek az adatok döntés alapját képezhetik.',
      },
      {
        heading: 'Becsült',
        body: 'Következtetés más adatokból: például kliens–AP asszociáció vagy port alapján azonosított szolgáltatás. Jelölése szaggatott vonal és sárga jelzés.',
      },
      {
        heading: 'Nem ellenőrizhető',
        body: 'A rendszer jelenlegi hozzáférésével nem igazolható állítás, például egy tűzfalszabály tényleges érvényesülése. Ezekre az alkalmazás mérési lépést javasol, nem módosítást.',
      },
    ],
    commands: [],
  },
];
