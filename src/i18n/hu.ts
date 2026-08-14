/**
 * Hungarian interface strings — the reference dictionary.
 *
 * Every other language is typed against this shape, so a missing or renamed
 * key is a compile error rather than a blank label at runtime.
 *
 * Domain content (knowledge-base articles, blueprint modules, plan steps,
 * the demo estate) is not here: those are documents, not labels, and live in
 * per-language modules next to the data they belong to.
 */
export const hu = {
  /**
   * Enum labels.
   *
   * The values themselves stay in the data as canonical strings and are only
   * translated on the way to the screen — comparisons in the code must not
   * depend on the interface language.
   */
  labels: {
    severity: {
      bad: 'Kritikus',
      warn: 'Figyelem',
      info: 'Megjegyzés',
    },
    status: {
      ok: 'Online',
      warn: 'Figyelmeztetés',
      bad: 'Hiba',
      idle: 'Ismeretlen',
    },
    provenance: {
      'Felmért': 'Felmért',
      'Becsült': 'Becsült',
      'Nem ellenőrzött': 'Nem ellenőrzött',
      'Nem ellenőrizhető': 'Nem ellenőrizhető',
    },
    linkKind: {
      physical: 'Fizikai kapcsolat',
      wireless: 'Vezeték nélküli asszociáció',
      logical: 'Logikai kapcsolat (kezelés)',
      broken: 'Megszakadt kapcsolat',
    },
    nodeKind: {
      cloud: 'Uplink',
      gateway: 'Átjáró',
      switch: 'Switch',
      ap: 'Access Point',
      clients: 'Kliens csoport',
      host: 'Proxmox host',
      storage: 'Tároló',
      ct: 'LXC konténer',
      vm: 'Virtuális gép',
      svc: 'Szolgáltatás',
    },
    evidence: {
      'Igazolt': 'Igazolt',
      'Részleges': 'Részleges',
      'Hiányzik': 'Hiányzik',
      'Elavult': 'Elavult',
    },
    stepState: {
      'kész': 'kész',
      'folyamatban': 'folyamatban',
      'vár': 'vár',
    },
    riskLevel: {
      'Alacsony': 'Alacsony',
      'Közepes': 'Közepes',
      'Magas': 'Magas',
    },
  },

  common: {
    close: 'Bezárás',
    cancel: 'Mégsem',
    save: 'Mentés',
    delete: 'Törlés',
    add: 'Hozzáadás',
    open: 'Megnyitás',
    copy: 'Másolás',
    copied: 'Másolva',
    yes: 'igen',
    no: 'nem',
    none: '—',
    minutes: 'perc',
    minutesShort: 'p',
    of: '/',
    required: 'kötelező',
    unknown: 'ismeretlen',
    loading: 'Betöltés…',
  },

  app: {
    readOnlySurvey: 'Felmérés: csak olvasás',
    readOnlyHint:
      'A felmérés kizárólag olvasási hívásokat használ. Írás csak az Alkalmazás lépésein át, külön megerősítéssel.',
    runSurvey: 'Felmérés futtatása',
    minimize: 'Kis méret',
    maximize: 'Teljes méret',
    quit: 'Bezárás',
  },

  theme: {
    group: 'Színséma',
    autoShort: 'AUTO',
    auto: 'Rendszer szerint',
    autoNow: (mode: string) => `Rendszer szerint (most: ${mode})`,
    light: 'Világos mód',
    dark: 'Sötét mód',
    lightWord: 'világos',
    darkWord: 'sötét',
  },

  source: {
    heading: 'Adatforrás',
    demo: 'Demó',
    demoDetail: 'beépített mintaállomány',
    demoTitle: 'Demó összeállítás',
    demoHint: 'A designhoz készült mintaállomány',
    live: 'Élő',
    liveTitle: 'Élő felmérés',
    liveDetail: 'felmért állapot',
    lastRun: (when: string) => `Utolsó futás: ${when}`,
    neverRan: 'Még nem futott felmérés',
    profiles: 'Kapcsolati profilok',
    noProfiles: 'Még nincs profil felvéve.',
    desktopOnly: 'Profilok kezeléséhez az asztali alkalmazás kell.',
    manage: 'Profilok és felmérés…',
  },

  nav: {
    overview: ['Áttekintés'],
    topology: ['Topológia', '& policy'],
    survey: ['Felmérés'],
    advice: ['Javaslatok'],
    backup: ['Mentés &', 'recovery'],
    planner: ['Telepítési', 'tervező'],
    ssh: ['SSH', 'műveletek'],
    kb: ['Tudástár'],
    settings: ['Beállítások'],
    label: 'Fő navigáció',
  },

  status: {
    readOnlySession: 'Read-only munkamenet',
    liveSurvey: 'Élő felmérés',
    demoData: 'Demó adat',
    demoNote: 'A bemutatott állapot nem élő mérésből származik',
    lastSurvey: (when: string, risks: number) =>
      `Utolsó felmérés: ${when} · ${risks} nyitott kockázat`,
    unverifiedRules: (n: number) => `${n} nem igazolt szabály`,
    secrets: 'Titkok: Windows Credential Manager',
  },

  topology: {
    ports: 'Portok',
    portUp: 'Aktív',
    portDown: 'Nincs kapcsolat',
    portUplink: 'Uplink',
    portUnnamed: 'Névtelen port',
    portNoLldp: 'a túloldal nem jelentkezik be (nincs LLDP)',
    portVlanUnknown: 'VLAN-átengedés nem felmért',
    portSpeed: 'Portsebesség',
    speeds: {
      speed10g: '10 G',
      speed2g5: '2,5–5 G',
      speed1g: '1 G',
      speed100m: '100 M',
      speed10m: '10 M',
    },
    tabMap: 'Topológia',
    tabPolicy: 'Policy & tűzfal',
    search: 'Eszköz, IP vagy szolgáltatás…',
    legend: 'Jelmagyarázat',
    surveyed: 'Felmért',
    estimated: 'Becsült',
    logical: 'Logikai',
    broken: 'Megszakadt',
    bidirectional: 'Kétirányú forgalom',
    unidirectional: 'Egyirányú forgalom',
    blocked: 'Nincs átjárás',
    state: 'Állapot',
    online: 'online',
    warnings: 'figyelmeztetés',
    errors: 'hiba',
    unknown: 'ismeretlen',
    zoomIn: 'Nagyítás',
    zoomOut: 'Kicsinyítés',
    fit: 'Illesztés',
    resetLayout: 'Automatikus',
    arrangedBy: (n: number) =>
      `${n} eszközt helyeztél át kézzel — visszaállítás az automatikus elrendezésre`,
  },

  inspector: {
    tabs: {
      overview: 'Áttekintés',
      services: 'Szolgáltatások',
      conns: 'Kapcsolatok',
      fw: 'Tűzfal & policy',
      kb: 'Tudás',
      cfg: 'Konfigurálás',
    },
    facts: 'Eszköz adatai',
    load: 'Terhelés',
    warnings: 'Figyelmeztetések',
    noServices:
      'Ehhez az eszközhöz nincs felmért szolgáltatás. A felmérés csak olvasási hívásokat használ, ezért a helyi folyamatok nem láthatók.',
    connectionsNote:
      'A becsült kapcsolatok más adatokból következtetett összefüggések. Végrehajtás előtt az alkalmazás mérési lépést javasol.',
    range: 'Tartomány',
    isolation: 'Izoláció',
    affectedRules: 'Érintett szabályok',
    kbNote: 'A kiválasztott eszköz felmért állapotához kapcsolódó útmutatók.',
    safeOrder: 'Biztonságos sorrend',
    referenceCommands: 'Referencia-parancsok',
    wanZone: 'WAN zóna',
    publicUplink: 'publikus uplink',
    outbound: 'Kifelé irányuló',
    bothWays: 'Oda-vissza',
    closed: 'Zárt',
    outboundOnly: 'Csak kimenő',
    inboundOnly: 'Csak bejövő',
  },

  policy: {
    heading: 'VLAN zónák és izoláció',
    /*
     * Counts what was confirmed, not what was not.
     *
     * The earlier wording said the remainder was "not verifiable with the
     * current access", which stopped being true the moment any of it became
     * verifiable: what limits the rest is now per-rule logging on the gateway,
     * not the access. Naming the confirmed count is true in both states.
     */
    summary: (zones: number, rules: number, verified: number) =>
      `${zones} zóna · ${rules} szabály · ${verified} igazolva a betöltött szabálykészletben`,
    /*
     * A count of zero has two causes with opposite remedies — nothing was read,
     * or something was read and matched nothing — and "0 igazolva" says neither.
     * The first is a matter of access, and the panel says so rather than
     * leaving the reader to work out which they are looking at.
     */
    summaryNoLive: (zones: number, rules: number) =>
      `${zones} zóna · ${rules} szabály · az átjáró betöltött szabálykészlete nem volt olvasható, így egyik sincs igazolva`,
    tabZones: 'Zónák',
    tabMatrix: 'Mátrix',
    filter: 'Szűrés zónára, portra…',
    noMatch: 'Nincs a szűrésre illeszkedő szabály.',
    noSignals: 'A felmérés nem talált biztonsági jelzést.',
    matrix: 'Zóna-mátrix',
    matrixNoteDemo:
      'Sor: forrás · oszlop: cél. A szaggatott cella (nem ellenőrzött) nem ellenőrizhető felméréssel.',
    matrixNoteLive:
      'A felmérés a konfigurációt olvassa, nem a forgalmat. A zónák közötti átjárás ezért mindaddig „nem ellenőrzött”, amíg egy mérés nem igazolja.',
    matrixNoteMeasured: (decided: number, bothFamilies: boolean) =>
      `${decided} cellát az átjárón ténylegesen betöltött szabálykészlet dönt el, nem a vezérlő beállítása. ${
        bothFamilies
          ? 'Az IPv4 és az IPv6 tábla is beolvasva és összevetve: ahol a kettő eltér, a cella korlátozott.'
          : 'Csak az IPv4 tábla — az IPv6-ot nem sikerült beolvasni, így az azon átmenő forgalom itt nem látszik.'
      } A szaggatott cellákhoz a szabálykészlet nem rendelt hálózatot.`,
    isolatedFully: 'Teljes izoláció',
    isolatedPartly: 'Részleges',
    isolatedNone: 'Nincs korlátozás',
    rules: 'Tűzfalszabályok',
    rulesNote:
      'Forrászóna szerint csoportosítva — az átjáró is így osztja szét őket, forrásonként egy lánc. A „Felmért” állapot azt jelenti, hogy a szabályt megtaláltuk a betöltött szabálykészletben.',
    groupSummary: (rules: number, targets: number, blocked: number) =>
      `${rules} szabály · ${targets} cél · ${blocked} tilt`,
    groupVerified: (n: number) => `${n} igazolva`,
    expandAll: 'Mind kinyit',
    collapseAll: 'Mind becsuk',
    signals: 'Biztonsági jelzések',
    colSource: 'Forrás',
    colTarget: 'Cél',
    colPort: 'Port',
    colAction: 'Művelet',
    colEvidence: 'Bizonyíték',
    colChecked: 'Ellenőrizve',
    allow: 'Engedélyez',
    block: 'Tilt',
    limited: 'Korlátozott',
    unverified: 'Nem ellenőrzött',
    ssid: 'SSID',
    devices: 'Eszközök',
    notMeasured: 'Nem mérve',
  },

  overview: {
    title: 'Infrastruktúra áttekintés',
    subtitleLive: (when: string) =>
      `Egyesített kép a felmért Proxmox VE és UniFi Network állapotból · utolsó futás ${when}`,
    subtitleDemo: 'Demó adat: a bemutatott állapot nem élő mérésből származik',
    profileCount: (n: number) => `read-only · ${n} profil`,
    risks: 'Eltérések és kockázatok',
    openAdvice: 'Javaslatok megnyitása',
    noRisks:
      'A felmérés nem talált eltérést. Ez nem jelenti azt, hogy a szegmentáció bizonyított — a szabályok érvényesülését csak forgalmi mérés igazolhatja.',
    capacity: 'Kapacitás',
    noCapacity:
      'Ehhez a nézethez Proxmox felmérés kell: a kapacitásadatok a csomópontok tárolóiból és memóriájából származnak.',
    sources: 'Felmérési források',
  },

  survey: {
    title: 'Felmérés',
    subtitle:
      'Mentett kapcsolati profilokon keresztül, kizárólag olvasási hívásokkal. Az alkalmazás nem módosít semmit a felmérés során.',
    desktopOnlyTitle:
      'Élő felméréshez az asztali alkalmazás kell: a tanúsítvány-ellenőrzés és a hitelesítés a natív oldalon fut.',
    desktopOnlyBody:
      'A böngészőben futó változat a demó adatot mutatja. Indítsd az alkalmazást npm run tauri:dev paranccsal, hogy kapcsolati profilt vehess fel és felmérést futtathass.',
    liveData: 'Élő adat',
    demoData: 'Demó adat',
    switchToDemo: 'Demóra váltás',
    switchToLive: 'Élőre váltás',
    profiles: 'Kapcsolati profilok',
    noProfiles:
      'Még nincs profil. Vegyél fel egyet lent, fogadd el a tanúsítványát, majd add meg a titkot.',
    newProfile: 'Új profil',
    system: 'Rendszer',
    name: 'Megnevezés',
    address: 'Cím',
    addressHint: (example: string) => `Csak a kiszolgáló gyökere, például ${example}`,
    tokenId: 'Token azonosító',
    username: 'Felhasználónév',
    site: 'Site',
    siteHint: 'Üresen hagyva a „default” site-ot használjuk.',
    addProfile: 'Profil hozzáadása',
    fetchCert: 'Tanúsítvány lekérése',
    recheckCert: 'Tanúsítvány újraellenőrzése',
    checking: 'Ellenőrzés…',
    setSecret: 'Titok megadása',
    certPinned: (fp: string) => `rögzítve: ${fp}`,
    certNotAccepted: 'tanúsítvány nincs elfogadva',
    certAccept: 'Egyezik, elfogadom',
    secretProxmox: 'API token titka',
    secretUnifi: 'Jelszó vagy API kulcs',
    secretHintProxmox: 'A token titka. Csak olvasási szerep (PVEAuditor) elegendő.',
    secretHintUnifi: 'A felhasználó jelszava, vagy üres felhasználónév esetén az API kulcs.',
    userHintProxmox: 'API token azonosító, például root@pam!felmeres',
    userHintUnifi: 'Helyi felhasználónév. API kulcs használatához hagyd üresen.',
    saveSecret: 'Mentés a Credential Managerbe',
    start: 'Felmérés indítása',
    startWith: (n: number) => `Felmérés indítása (${n} profil)`,
    running: 'Felmérés fut…',
    startHint:
      'A futás csak GET hívásokat használ. Minden kérés a rögzített tanúsítványt várja; ha az megváltozott, a kapcsolat megszakad, nem kérdez.',
    discard: 'Eredmények eldobása',
    exportName: 'felmeres',
    exportSnapshot: 'Mentés fájlba',
    importSnapshot: 'Betöltés fájlból',
    portableNote:
      'A fájl csak méréseket tartalmaz — hitelesítő adat sosem kerül felmérésbe. Így elvihető másik gépre, vagy elküldhető annak, akinek rá kell néznie.',
    reportName: 'felmeresi-jelentes',
    exportReport: 'Jelentés exportálása',
    log: 'Napló',
    lastLog: 'Utolsó futás naplója',
    neverRan: 'Még nem futott felmérés.',
    successful: 'Sikeres',
    partial: 'Részleges',
    result: 'Eredmény',
    provenanceNote:
      'A felmérés a konfigurációt olvassa, nem a forgalmat. A tűzfalszabályok ezért „nem ellenőrzött” állapotban jelennek meg, és nem használhatók automatikus döntés alapjául.',
    profileAdded: (label: string) =>
      `„${label}” felvéve. Ellenőrizd a tanúsítványt, majd add meg a titkot.`,
    certAccepted: (label: string) =>
      `„${label}” tanúsítványa rögzítve. Változás esetén a kapcsolat megszakad.`,
    secretStored: (label: string) => `„${label}” titka a Windows Credential Managerbe került.`,
    partialRun: (errors: string) => `A felmérés részben futott le: ${errors}`,

    addSsh: 'SSH elérés hozzáadása',
    editSsh: 'SSH elérés szerkesztése',
    removeSsh: 'SSH elérés törlése',
    sshSaved: (label: string) => `${label}: SSH elérés mentve`,
    sshRemoved: (label: string) => `${label}: SSH elérés törölve, a titkával együtt`,
    sshHostChanged:
      'A cím megváltozott, ezért a rögzített host-kulcs törlődik. Mentés után újra le kell kérni és elfogadni — más gép, más bizalmi döntés.',
    sshSection: 'SSH elérés ehhez a rendszerhez',
    sshSectionHint:
      'Ugyanaz a gép, másik út. Ha bekapcsolod, az SSH műveleteknél is megjelenik, külön profil nélkül.',
    fetchHostKey: 'Host-kulcs lekérése',
    recheckHostKey: 'Host-kulcs újraellenőrzése',
    hostKeyAccept: 'Host-kulcs elfogadása',
    hostKeyPinned: 'Host-kulcs rögzítve',
    hostKeyNotAccepted: 'Host-kulcs nincs elfogadva',
    setSshSecret: 'SSH titok megadása',
    sshHost: 'Gazdanév vagy IP',
    sshHostHint: 'Séma és port nélkül, például 10.0.1.10.',
    sshPort: 'Port',
    sshAuth: 'Hitelesítés',
    sshAuthHint: 'A jelszó vagy a kulcs a Windows Credential Managerbe kerül, nem az app adatbázisába.',
    sshAuthPassword: 'Jelszó',
    sshAuthKey: 'Privát kulcs',
    sshFlavour: 'Mi van a túloldalon',
    sshFlavourHint: 'Ez dönti el, milyen parancsokat kínál a parancstár.',
    sshFlavourOther: 'Egyéb Linux',
    userHintSsh: 'Amivel belépnél kézzel is, például root.',
    secretSshPassword: 'SSH jelszó',
    secretHintSshPassword: 'A Credential Managerbe kerül; az alkalmazás sosem olvassa vissza a felületre.',
    secretSshKey: 'Privát kulcs (PEM)',
    secretHintSshKey:
      'Illeszd be a teljes kulcsot a BEGIN és END sorral együtt. A Credential Managerbe kerül.',
    counts: {
      devices: 'Eszköz',
      networks: 'Hálózat',
      ssids: 'SSID',
      rules: 'Szabály',
      clients: 'Kliens',
      guests: 'VM / LXC',
      storages: 'Tároló',
    },
  },

  advice: {
    title: 'Javaslatok',
    subtitle: (open: number) => `${open} nyitott · felmérés alapján rangsorolva`,
    impact: 'Várható hatás',
    risk: 'Kockázat',
    duration: 'Időigény',
    why: 'Miért javasolt',
    plan: 'Változtatási terv',
    noAuto: 'Egyik lépés sem fut le automatikusan',
    prepare: 'Terv előkészítése',
    exportChecklist: 'Ellenőrzőlista exportálása',
    preparedHint: 'A terv a vágólapon',
    exportName: 'valtoztatasi-terv',
    exportHeading: 'Változtatási terv',
    exportGenerated: (when: string) => `Készült: ${when}`,
    exportSource: (when: string) => `Forrás: a ${when}-i felmérés mért adatai`,
    exportDemoSource: 'Forrás: bemutató adatkészlet — nem valós felmérés',
    empty: 'Nincs javasolt változtatás',
    emptyBody:
      'A felmérés nem talált olyan megállapítást, amihez változtatási tervet lehetne rendelni. A meglévő kockázatokat az Áttekintés mutatja.',
    demoNotice:
      'Bemutató adatkészlet: ezek nem a te rendszeredről szólnak. Futtass felmérést valós javaslatokért.',
  },

  /*
   * Copy for the derived recommendations.
   *
   * Every rule here is triggered by something the survey measured, and the
   * wording says what was measured rather than what is assumed. Where a number
   * appears it comes from the snapshot — that is why these are functions.
   */
  /*
   * Wording for the comparison of two surveys.
   *
   * Each line says what moved, and the measurement behind it is shown beside
   * it rather than described — "1000 → 100 Mb/s" carries more than any
   * sentence about a port having slowed down.
   */
  /** The document language attribute of the exported report. */
  reportLang: 'hu',

  /*
   * The survey as a handed-over document.
   *
   * Written to be read by someone who has never seen this application — a
   * colleague, a client, or the same person in a year — so nothing here relies
   * on the interface being open beside it.
   */
  report: {
    title: 'Felmérési jelentés',
    subtitle: (when: string) => `Mért állapot · ${when}`,
    subtitleDemo: 'Bemutató adatkészlet — nem valós felmérés',
    demoWarning:
      'Ez a jelentés a bemutató adatkészletből készült, nem valós rendszerekről. Semmilyen megállapítása nem vonatkozik létező hálózatra.',
    findings: 'Megállapítások',
    noFindings:
      'A felmérés nem talált eltérést. Ez nem jelenti azt, hogy a szegmentáció bizonyított — a szabályok érvényesülését csak forgalmi mérés igazolhatja.',
    capacity: 'Kapacitás',
    backups: 'Mentések',
    noBackups: 'A felmérés nem talált mentési feladatot.',
    backupSummary: (covered: number, total: number, missing: number) =>
      `${total} vendéggépből ${covered} mögött van mentési fájl, ${missing} mögött nincs. A lefedettség a megtalált fájlokból következik, nem az ütemezett feladatokból.`,
    backupsUnverifiable:
      'Egyetlen tároló sem jelez ellenőrzési eredményt, ezért a mentések használhatósága nem igazolt.',
    devices: 'Eszközök',
    rules: 'Tűzfalszabályok',
    noRules: 'A felmérés nem olvasott ki tűzfalszabályt.',
    sources: 'A felmérés naplója',
    problems: 'Amit nem sikerült kiolvasni',
    colSeverity: 'Súly',
    colWhat: 'Mi',
    colWhere: 'Hol',
    colDetail: 'Részlet',
    colValue: 'Érték',
    colUsed: 'Foglalt',
    colJob: 'Feladat',
    colTarget: 'Cél',
    colEvidence: 'Bizonyíték',
    colName: 'Név',
    colState: 'Állapot',
    colAction: 'Művelet',
    colSource: 'Forrás',
    colVerified: 'Igazolt',
    colPort: 'Port',
    colTime: 'Idő',
    footer: (when: string) =>
      `Készítette az Ultimate Network Assister · ${when} · A jelentés csak azt állítja, amit a felmérés mért.`,
  },

  diff: {
    title: 'Változások',
    subtitle: (when: string) => `A ${when}-i felméréshez képest`,
    pick: 'Összehasonlítás ezzel:',
    none: 'Nincs eltérés a két felmérés között.',
    noneBody:
      'Ez nem jelenti azt, hogy semmi nem történt — csak azt, hogy amit mindkét felmérés megmért, az ugyanaz maradt.',
    onlyOne: 'Még csak egy felmérés van',
    onlyOneBody:
      'Az összehasonlításhoz két lefutás kell. A következő felmérés után ez a panel megmutatja, mi változott.',
    countLabel: (n: number) => `${n} változás`,
    capped: (n: number) => `További ${n} változás nincs kilistázva.`,
    port: 'port',
    free: 'szabad',

    unifiOneSided: 'A UniFi oldal csak az egyik felmérésben szerepel, ezért nincs összehasonlítva.',
    proxmoxOneSided: 'A Proxmox oldal csak az egyik felmérésben szerepel, ezért nincs összehasonlítva.',

    deviceAppeared: 'Új eszköz jelent meg',
    deviceGone: 'Eltűnt a vezérlőből',
    deviceLost: 'Elérhetetlenné vált',
    deviceBack: 'Újra elérhető',
    firmwareChanged: 'Firmware változott',
    addressChanged: 'IP-cím változott',

    portDown: 'A port lekapcsolódott',
    portUp: 'A port bekapcsolódott',
    portSlower: 'A port lassabban tárgyalt',
    portFaster: 'A port gyorsabban tárgyalt',
    neighbourChanged: 'Más eszköz van a port túloldalán',

    networkAdded: 'Új hálózat',
    networkRemoved: 'Hálózat megszűnt',
    vlanChanged: 'VLAN-azonosító változott',
    ssidAdded: 'Új SSID',
    ssidRemoved: 'SSID megszűnt',
    ssidOn: 'SSID bekapcsolva',
    ssidOff: 'SSID kikapcsolva',
    securityChanged: 'Titkosítási mód változott',
    ruleAdded: 'Új tűzfalszabály',
    ruleRemoved: 'Tűzfalszabály törölve',
    ruleOn: 'Tűzfalszabály bekapcsolva',
    ruleOff: 'Tűzfalszabály kikapcsolva',
    ruleActionChanged: 'A szabály művelete változott',

    guestAdded: 'Új vendéggép',
    guestGone: 'Vendéggép eltűnt',
    guestStarted: 'Elindult',
    guestStopped: 'Leállt',
    storageGrew: 'A tároló telítettebb lett',
    storageShrank: 'A tárolón felszabadult hely',
    diskHealthChanged: 'A lemez egészségi állapota változott',
    backupLost: 'Megszűnt a mentési lefedettség',
    backupGained: 'Mentési lefedettség jött létre',
    bridgeVlanOn: 'A bridge VLAN-tudatos lett',
    bridgeVlanOff: 'A bridge már nem VLAN-tudatos',
  },

  adviceRules: {
    stepSurvey: 'Felmérés',
    stepPrecheck: 'Előellenőrzés',
    stepCheckpoint: 'Mentés / checkpoint',
    stepExecute: 'Végrehajtás',
    stepVerify: 'Ellenőrzés',
    stepRollback: 'Visszaállítás',
    surveyText: 'A megállapítás a felmérés mért adataiból származik, nem becslésből.',
    checkpointHave: (days: number) =>
      `Van ${days} napnál nem régebbi mentés a rendszerről, ez szolgálhat visszaállítási pontként.`,
    checkpointNone: 'A művelet előtt készüljön visszaállítható mentés az érintett rendszerről.',
    minutes: (n: number) => `~${n} perc`,
    window: (n: number) => `Ablak: ${n} perc`,

    unprotectedTitle: (n: number) => `Mentés bevezetése ${n} vendéggépre`,
    unprotectedWhere: (node: string) => `${node} · vzdump`,
    unprotectedImpact: 'Minden vendéggép bizonyíthatóan visszaállítható lesz',
    unprotectedWhy: (names: string, total: number, covered: number) =>
      `A ${total} vendéggépből ${covered} mögött van mentési fájl, ezek mögött nincs: ${names}. Amiről nincs fájl, arról a visszaállítás nem bizonyítható, akkor sem, ha ütemezett feladat létezik.`,
    unprotectedPrecheckOk: (store: string, free: string) =>
      `A(z) ${store} tároló fogad mentést, ${free} szabad kapacitással.`,
    unprotectedPrecheckNone:
      'Egyetlen felmért tároló sem jelez „backup” tartalomtípust. Előbb ilyen tároló kell.',
    unprotectedExecute:
      'A hiányzó vendéggépek felvétele a meglévő vzdump feladatba, vagy új feladat létrehozása rájuk.',
    unprotectedVerify:
      'A következő futás után a mentési fájl megjelenésének ellenőrzése vendéggépenként.',
    unprotectedRollback:
      'A feladat kikapcsolása. Adat nem vész el: a mentés csak hozzáad, nem módosít.',

    unverifiedTitle: 'Mentések ellenőrzésének bekapcsolása',
    unverifiedWhere: (store: string) => `${store} · vzdump`,
    unverifiedImpact: 'A mentések megléte helyett a használhatóságuk lesz igazolt',
    unverifiedWhy: (files: number, days: number) =>
      `${files} mentési fájl található, a legfrissebb ${days} napos, de egyik mögött sincs ellenőrzési eredmény. A sima vzdump cél nem ellenőriz, így a fájl sértetlensége nem bizonyított.`,
    unverifiedPrecheck: 'Proxmox Backup Server elérhetősége vagy kézi visszaállítási próba ütemezése.',
    unverifiedExecute:
      'PBS tároló bekötése ellenőrzési feladattal, vagy időszakos visszaállítási próba izolált vendéggépbe.',
    unverifiedVerify: 'Az ellenőrzés eredményének megjelenése a tároló tartalmi listájában.',
    unverifiedRollback: 'A meglévő mentési feladat érintetlen marad, így nincs mit visszaállítani.',

    storageTitle: (name: string, pct: number) => `${name} felszabadítása (${pct}%)`,
    storageImpact: 'Stabil írási teljesítmény és működő pillanatképek',
    storageWhy: (name: string, pct: number, free: string) =>
      `A(z) ${name} tároló ${pct}%-on áll, ${free} szabad kapacitással. 80% fölött az írási teljesítmény mérhetően romlik, 90% fölött a pillanatképek elakadhatnak.`,
    storagePrecheck:
      'A tárolón lévő pillanatképek és régi mentések listázása, a még hivatkozottak kizárása.',
    storageExecute: 'A már nem hivatkozott pillanatképek és lejárt mentések eltávolítása.',
    storageVerify: 'A szabad kapacitás újramérése felméréssel.',
    storageRollback:
      'Törölt pillanatkép nem állítható vissza, ezért csak igazoltan felesleges elem törölhető.',

    offlineTitle: (name: string) => `${name} visszaállítása üzembe`,
    offlineImpact: 'A hozzá tartozó kliensek újra felügyelet alá kerülnek',
    offlineWhy: (name: string, ip: string) =>
      `A(z) ${name} (${ip}) nem jelentkezik be a vezérlőbe. Amíg így van, sem az állapota, sem a rajta áthaladó forgalom nem ellenőrizhető, és a hozzá kötött kliensek felügyelet nélkül maradnak.`,
    offlinePrecheck: 'A tápellátás és a PoE port állapotának ellenőrzése a szülő eszközön.',
    offlineExecute:
      'A PoE port ki- és bekapcsolása, ha ez sem segít, helyszíni vizsgálat: kábel, tápegység, eszköz.',
    offlineVerify: 'Az eszköz megjelenése a vezérlőben, majd új felmérés.',
    offlineRollback: 'Nem értelmezhető: a lépés az eredeti állapot helyreállítása.',

    weakWifiTitle: (name: string) => `${name} titkosításának megerősítése`,
    weakWifiImpact: 'A hálózaton áthaladó forgalom védetté válik',
    weakWifiWhy: (name: string, mode: string) =>
      `A(z) ${name} SSID biztonsági módja „${mode}”. A rajta áthaladó forgalom lehallgatható, és a hálózathoz csatlakozás nem korlátozott.`,
    weakWifiPrecheck: 'A hálózatot használó kliensek listázása: a régebbiek nem tudnak WPA2-t.',
    weakWifiExecute: 'Váltás WPA2 vagy WPA3 módra, erős jelszóval.',
    weakWifiVerify: 'A kliensek visszacsatlakozásának ellenőrzése, majd új felmérés.',
    weakWifiRollback: 'A korábbi biztonsági mód visszaállítása, ha kritikus eszköz esik ki.',

    diskTitle: (model: string) => `${model} cseréjének előkészítése`,
    diskImpact: 'Adatvesztés megelőzése a lemez meghibásodása előtt',
    diskWhy: (model: string, health: string, usedBy: string) =>
      `A(z) ${model} egészségi állapota „${health}”, jelenleg ${usedBy} használja. A SMART jelzés a meghibásodást megelőzi, de nem mondja meg, mennyi idő van hátra.`,
    diskPrecheck: 'A lemezt használó tárolók és vendéggépek azonosítása, mentésük ellenőrzése.',
    diskExecute: 'Csere lemez beszerzése, majd adatmozgatás vagy tömb-újraépítés.',
    diskVerify: 'A tömb állapotának és a SMART értékeknek az újramérése.',
    diskRollback: 'Az eredeti lemez megőrzése az új lemez igazolt működéséig.',

    bridgeTitle: (name: string) => `${name} átalakítása VLAN-tudatosra`,
    bridgeImpact: 'VLAN tagelés vendéggépenként, a hoston',
    bridgeWhy: (name: string, vlans: number) =>
      `A(z) ${name} bridge nem VLAN-tudatos, miközben a hálózaton ${vlans} VLAN van felvéve. A tagelés így csak a switch oldalán történhet, vendéggépenkénti besorolás nem lehetséges.`,
    bridgePrecheck:
      'Helyi konzol vagy IPMI elérés igazolása, és a jelenlegi /etc/network/interfaces mentése.',
    bridgeExecute: 'A bridge VLAN-tudatosra kapcsolása, egy lépésben, majd a hálózat újraindítása.',
    bridgeVerify: 'A host és minden vendéggép elérése a saját VLAN-jában.',
    bridgeRollback: 'Az eredeti interfaces fájl visszamásolása helyi konzolról.',

    channelLabel: 'csatorna',

    airtimeTitle: (device: string, band: string) => `${device} ${band}-es rádiója zsúfolt csatornán`,
    airtimeImpact: 'Kevesebb várakozás adás előtt, gyorsabbnak érzett Wi-Fi',
    airtimeWhy: (band: string, total: number, own: number, clients: number) =>
      `A(z) ${band}-es rádió a levegőt ${total}%-ban foglaltnak méri, ebből ${own}% a saját forgalma; ${clients} kliens használja. A különbözet idegen forgalom — ez az egyetlen dolog a Wi-Fi-ben, ami a saját eszköz statisztikáiból nem látszik, mégis ez lassítja. A rádió minden adás előtt megvárja, amíg a csatorna felszabadul.`,
    airtimePrecheck:
      'A szomszédos hálózatok csatornafoglaltságának megnézése ugyanabban a sávban, több napszakban.',
    airtimeExecute: 'Kevésbé foglalt fix csatorna beállítása, szükség esetén szűkebb csatornaszélességgel.',
    airtimeVerify: 'A foglaltság újramérése felméréssel, azonos napszakban.',
    airtimeRollback: 'Az automatikus csatornaválasztás visszakapcsolása.',

    sameChannelTitle: (band: string, channel: string) =>
      `Több hozzáférési pont ugyanazon a ${band}-es csatornán (${channel})`,
    sameChannelImpact: 'A hozzáférési pontok nem veszik el egymás elől a levegőt',
    sameChannelWhy: (n: number, band: string, channel: string) =>
      `${n} hozzáférési pont van a ${band} sáv ${channel}-es csatornájára állítva. Hogy a valóságban hallják-e egymást, azt az alkalmazás nem tudja megmondani — ahhoz helyszíni mérés kell. Ha viszont hallják, ugyanazon a levegőn osztoznak, és mindkettő lassul.`,
    sameChannelPrecheck:
      'A hozzáférési pontok fizikai távolságának és jelerősségének ellenőrzése egymás felől.',
    sameChannelExecute:
      'Eltérő csatornák kiosztása; 2,4 GHz-en csak az 1-es, 6-os és 11-es nem fed át egymással.',
    sameChannelVerify: 'A foglaltság és a kliensek elégedettségi értékének újramérése.',
    sameChannelRollback: 'Az eredeti csatornabeállítások visszaállítása.',

    certTitle: (node: string, days: number) => `${node} tanúsítványa ${days} nap múlva lejár`,
    certExpiredTitle: (node: string) => `${node} tanúsítványa lejárt`,
    certImpact: 'A felület és az API megszakítás nélkül elérhető marad',
    certWhy: (subject: string, issuer: string, days: number) =>
      days <= 0
        ? `A(z) „${subject}” tanúsítvány (kiállító: ${issuer}) már lejárt. A böngésző és minden API-kliens hibát jelez, és a saját felmérés is elakadhat rajta.`
        : `A(z) „${subject}” tanúsítvány (kiállító: ${issuer}) ${days} nap múlva lejár. Ez az a hiba, amit senki nem vesz észre időben: egyik reggel egyszerűen nem tölt be a felület.`,
    certPrecheck: 'A megújítás módjának tisztázása: ACME, saját CA vagy kézi feltöltés.',
    certExecute: 'A tanúsítvány megújítása és telepítése a csomóponton.',
    certVerify: 'Az új lejárati dátum ellenőrzése, majd új felmérés.',
    certRollback: 'A korábbi tanúsítvány visszaállítása, ha az új nem fogadható el.',

    updatesTitle: (n: number) => `${n} függőben lévő csomagfrissítés`,
    updatesImpact: 'Ismert hibák és sérülékenységek megszűnnek',
    updatesWhy: (total: number, important: number, sample: string) =>
      `${total} csomaghoz van újabb verzió, ebből ${important} fontosnak jelölt. Például: ${sample}. A frissítés kernelcserét is jelenthet, ezért újraindítási ablakot igényel.`,
    updatesPrecheck: 'A vendéggépek leállítási sorrendjének és a mentések meglétének ellenőrzése.',
    updatesExecute: 'Frissítés karbantartási ablakban, csomópontonként, a vendéggépek leállítása után.',
    updatesVerify: 'A csomópont és minden vendéggép visszatérése, majd új felmérés.',
    updatesRollback:
      'Csomagfrissítés nem vonható vissza megbízhatóan — a visszaút a művelet előtti mentés.',

    slowPortTitle: (device: string, port: number) => `${device} ${port}. port sebességének kivizsgálása`,
    slowPortImpact: 'A kapcsolat a kábelezés által megengedett sebességre áll',
    slowPortWhy: (device: string, port: number, speed: number, neighbour: string) =>
      `A(z) ${device} ${port}. portja ${speed} Mb/s-on áll, a túloldalon: ${neighbour}. Ez jellemzően sérült érpárra, rossz csatlakozóra vagy elavult kábelre utal, nem az eszköz korlátjára.`,
    slowPortPrecheck: 'A port túloldalán lévő eszköz és a kábel útvonalának azonosítása.',
    slowPortExecute: 'A kábel cseréje vagy újrakötése, majd a port ki- és bekapcsolása.',
    slowPortVerify: 'A tárgyalt sebesség újramérése felméréssel.',
    slowPortRollback: 'Nem szükséges: a beavatkozás csak fizikai, a konfiguráció nem változik.',
  },

  backup: {
    title: 'Mentés és recovery',
    subtitle:
      'A lefedettség csak akkor számít igazoltnak, ha az utolsó visszaállítási próba naplózva van.',
    colJob: 'Mentési feladat',
    colTarget: 'Cél',
    colSchedule: 'Ütemezés',
    colLastRun: 'Utolsó futás',
    colRetention: 'Megőrzés',
    colEvidence: 'Bizonyíték',
    restoreTest: 'Visszaállítási próba',
    noJobs: 'Nincs egyetlen mentési feladat sem',
    noJobsBody:
      'A fürtön nincs beállítva mentés. Ez nem hiányzó bizonyíték, hanem hiányzó mentés: egy lemezhiba vagy egy elrontott frissítés után nincs mihez visszanyúlni.',
    coverage: 'Lefedettség',
    coverageAll: 'Minden vendéggéphez tartozik legalább egy mentés.',
    coverageMissing: (n: number) => `${n} vendéggéphez egyetlen mentés sem tartozik.`,
    andMore: (n: number) => `…és további ${n}`,
    liveOnly: 'A lefedettség csak élő felmérésből számolható.',
    restoreNotProvable:
      'A Proxmox nem tartja nyilván, hogy volt-e visszaállítási próba, így az alkalmazás nem tudja igazolni. Egy soha ki nem próbált visszaállítás a leggyakoribb oka annak, hogy egy mentés használhatatlannak bizonyul.',
    stores: 'Mentési tárolók',
    noStores: 'Nincs mentésre használt tároló.',
    noBackupsAtAll: 'Egyetlen mentés sincs a tárolókon',
    newestBackup: (n: number) =>
      n === 0 ? 'A legfrissebb mentés mai' : `A legfrissebb mentés ${n} napos`,
    storeVerifies: 'a tároló ellenőrzi a mentéseket',
    storeCannotVerify: 'a tároló nem végez ellenőrzést',
    daysAgo: 'napja',
    checkpoints: 'Checkpointok',
    conditions: 'Recovery feltételek',
    localConsole: 'Helyi konzol elérés igazolva',
    offsiteFreshness: 'Offsite másolat frissessége',
    configBackup: 'Konfigurációs mentés',
    upToDate: 'naprakész',
    days: 'nap',
  },

  ssh: {
    title: 'SSH műveletek',
    subtitle:
      'Mentett profilhoz kötött, hitelesített parancsok. A titkok a Windows Credential Managerben maradnak.',
    hostKeyVerified: 'Host-kulcs ellenőrizve',
    viewFingerprint: 'Ujjlenyomat megtekintése',
    readOnlyCommands: 'Csak olvasási parancsok',
    copyCommand: 'Parancs másolása',
    safetyRules: 'Biztonsági szabályok',

    noProfiles: 'Nincs felvett SSH kapcsolat',
    noProfilesBody:
      'Vedd fel a gépet a Felmérés nézetben SSH profilként, fogadd el a gazdagép kulcsát, és itt futtathatod rajta a parancsokat.',
    hostKeyPending: 'A gazdagép kulcsa nincs elfogadva',
    hostKeyPendingBody:
      'Amíg nincs rögzített kulcs, semmi nem fut: a Felmérés nézetben fogadd el az ujjlenyomatot.',
    catalogue: 'Parancstár',
    commandLabel: 'Futtatandó parancs',
    commandHint: 'Válassz a parancstárból, vagy írd be a sajátodat.',
    runButton: 'Futtatás',
    runningNow: 'Fut…',
    clearance: {
      readOnly: 'Csak olvas',
      mutating: 'Módosít',
      forbidden: 'Nem futtatható',
    },
    clearanceReadOnlyNote: 'A parancs csak olvas; futtatható.',
    clearanceMutatingNote:
      'A parancs módosít valamit. Olvasd el, és pipáld ki, hogy pontosan ezt akarod futtatni.',
    clearanceForbiddenNote:
      'Destruktív parancs: az alkalmazás sosem futtatja. Másold ki, és futtasd konzolról, ahol látod, mit csinálsz.',
    confirmLabel: 'Elolvastam, ezt a parancsot akarom futtatni',
    output: 'Kimenet',
    stderr: 'Hibakimenet',
    exitStatus: 'Kilépési kód',
    executed: 'Ténylegesen futtatva',
    duration: 'Futásidő',
    truncatedNote: 'A kimenet levágva: elérte a méret- vagy időkorlátot.',
    noOutput: 'A parancs nem írt semmit.',
    history: 'Futások',
    clearHistory: 'Lista ürítése',
    emptyHistory: 'Még nem futott parancs ebben a munkamenetben.',
    groups: {
      inventory: 'Leltár',
      network: 'Hálózat',
      storage: 'Tárhely',
      services: 'Szolgáltatások',
      maintenance: 'Karbantartás',
    },
  },

  kb: {
    title: 'Tudástár',
    subtitle: 'A felmért állapothoz kapcsolt útmutatók',
    referenceCommands: 'Referencia-parancsok',
  },

  settings: {
    title: 'Beállítások',
    appearance: 'Megjelenés',
    colorScheme: 'Színséma',
    colorSchemeHint: 'Rendszer szerint, vagy rögzített világos és sötét mód',
    language: 'Nyelv',
    languageHint: 'A felület és a tudástár nyelve',
    languageAuto: 'Rendszer szerint',
    security: 'Biztonság',
    forceReadOnly: 'Csak olvasási mód kényszerítése',
    forceReadOnlyHint: 'Módosító hívás csak kifejezett jóváhagyással',
    hostKeyRequired: 'Host-kulcs ellenőrzés kötelező',
    hostKeyRequiredHint: 'Eltérés esetén az SSH kapcsolat megszakad',
    secretStorage: 'Titkok tárolása',
    secretStorageHint: 'Az alkalmazás nem tárol jelszót a saját adatbázisában',
    dataHandling: 'Adatkezelés',
    telemetry: 'Telemetria',
    telemetryHint: 'Nincs kimenő adatküldés',
    surveyStorage: 'Felmérési adatok tárolása',
    surveyStorageHint: 'Helyi adatbázis, titkosított profilhivatkozásokkal',
    on: 'Bekapcsolva',
    off: 'Kikapcsolva',
  },

  blueprint: {
    title: 'Összeállítások',
    subtitle: 'Paraméterezhető célállapotok, amikből terv és kézikönyv készül',
    starterName: 'Otthoni összeállítás',
    starterDescription:
      'Három háztartás teljes elzárással, közös nyomtatóval és szolgáltatásokkal, egy Proxmox hoston. A kiindulás a meglévő kézikönyv célállapota.',
    copyOf: (name: string) => `${name} – másolat`,
    unknownPreset: (id: string) => `Ismeretlen preset a fájlban: ${id}`,
    newFromPreset: 'Új összeállítás sablonból…',
    loadFromFile: 'Blueprint betöltése fájlból',
    exportGuide: 'Kézikönyv exportálása',
    saveBlueprint: 'Blueprint mentése',
    duplicate: 'Duplikálás',
    tabs: {
      modules: 'Modulok',
      params: 'Paraméterek',
      ports: 'Portok',
      target: 'Célállapot',
      plan: 'Terv',
      apply: 'Alkalmazás',
    },
    modulesNote:
      'Egy modul kikapcsolása kiveszi a hozzá tartozó hálózatokat, szabályokat és gépeket a célállapotból, és eltűnnek a hozzá tartozó lépések a tervből is. A kötelező modulok a rendszer vázát adják, ezért nem kapcsolhatók ki.',
    prerequisite: 'Előfeltétel',
    dropsWhenOff: 'Kikapcsolásakor kimarad',
    groups: {
      overview: 'Áttekintés',
      network: 'Hálózat & UniFi',
      server: 'Szerver & infrastruktúra',
      services: 'Szolgáltatások',
      ops: 'Üzemeltetés',
    },
    risk: {
      low: 'alacsony',
      medium: 'közepes',
      high: 'magas',
    },
    automation: {
      auto: 'Automata',
      assisted: 'Félautomata',
      manual: 'Manuális',
    },
    targets: {
      unifi: 'UniFi Network',
      proxmox: 'Proxmox VE',
      docker: 'Docker',
      kubernetes: 'Kubernetes',
      host: 'Operációs rendszer',
    },
    /** Why a step cannot run at the level the plan asked for. */
    capability: {
      destructiveStorage:
        'Destruktív tárhelyművelet: az alkalmazás előkészíti a parancsot, de sosem futtatja. Ellenőrizd a modellt, a sorozatszámot és a /dev/disk/by-id/ útvonalat.',
      noApi: 'Nincs hozzá API: az alkalmazás előkészíti a pontos értékeket, a beírás kézzel történik.',
      commandOnly:
        'Nincs API-hívás a lépésben, csak parancs — az alkalmazás előkészíti, a futtatás jóváhagyással megy.',
    },
    /** Contradictions the resolver finds between modules and parameters. */
    issue: {
      moduleMissingDeps: (title: string, missing: string) =>
        `„${title}” kimaradt, mert hiányzik: ${missing}.`,
      moduleClash: (title: string, clash: string) =>
        `„${title}” nem lehet bekapcsolva ezzel együtt: ${clash}.`,
      vlanTwice: (vlan: number, previous: string, name: string) =>
        `VLAN ${vlan} kétszer szerepel: „${previous}” és „${name}”.`,
      vlanOutOfRange: (vlan: number, name: string) =>
        `VLAN ${vlan} („${name}”) nem képezhető le /24 hálózatra, mert a harmadik oktett a VLAN azonosítója. Válassz 1 és 254 közötti értéket.`,
      vlanClash: (vlan: number, previous: string, household: string, role: string) =>
        `VLAN ${vlan} ütközik: ${previous} és ${household} ${role}.`,
      roleClient: 'kliens',
      roleIot: 'IoT',
      roleGuest: 'vendég',
      noHouseholds:
        'Nincs egyetlen háztartás sem, így kliens-, IoT- és vendéghálózat nem jön létre.',
      badIp: (label: string, ip: string) => `„${label}” címe nem érvényes IPv4: ${ip}`,
      ipTwice: (ip: string, previous: string, label: string) =>
        `${ip} két helyre van kiosztva: „${previous}” és „${label}”.`,
      ipOutOfSubnet: (label: string, ip: string, vlan: number, expected: string) =>
        `„${label}” címe (${ip}) nem a saját hálózatában van; VLAN ${vlan} tartománya ${expected}0/24.`,
      badGatewayByte: (byte: number) =>
        `Az átjáró utolsó oktettje ${byte}, ami /24 hálózatban nem használható cím.`,
      ipIsGateway: (label: string, ip: string) => `„${label}” címe (${ip}) az átjáró címére esik.`,
      badPrefix: (prefix: string) =>
        `Az IP-előtag „${prefix}”, de két oktettet vár, például 192.168.`,
      allowBelowDeny:
        'Van engedélyező szabály az alapértelmezett tiltás alatt, így nem érvényesülne.',
    },
    /** Blueprint import failures. */
    importError: {
      notObject: 'A fájl nem blueprintet tartalmaz.',
      missingFields: (fields: string) => `Hiányzó mező a fájlban: ${fields}.`,
      missingLists: 'A fájlból hiányzik a modul- vagy háztartáslista.',
      missingParams: 'A fájlból hiányoznak a paraméterek.',
    },
    empty: 'Válassz vagy hozz létre egy összeállítást.',
    handbookSaved: (path: string) => `Kézikönyv mentve: ${path}`,
    handbookSuffix: 'kezikonyv',
    blueprintSaved: (path: string) => `Blueprint mentve: ${path}`,
    householdCount: (n: number) => `${n} háztartás`,
    moduleCount: (n: number) => `${n} modul`,
    issuesShort: (n: number) => `${n} ellentmondás`,
    households: 'Háztartások',
    householdsNote:
      'Minden háztartás kap egy kliens-, egy IoT- és egy vendéghálózatot, és a tervben automatikusan megjelenik a többi háztartástól elzáró szabály — mindkét irányban.',
    resetParams: 'Paraméterek visszaállítása alapértelmezettre',
    handbookFile: 'Kézikönyv',
    householdName: 'Név',
    householdSlug: 'Rövid név',
    householdGuestVlan: 'Vendég VLAN',
    newHousehold: 'Új háztartás neve',
  },

  target: {
    networks: 'Hálózatok',
    networksHint:
      'A harmadik oktett a VLAN azonosítója, ezért a VLAN-ok 1 és 254 közé essenek.',
    wifi: 'Wi-Fi és kulcskiosztás',
    wifiHint:
      'Ugyanazon SSID alatt a kulcs dönti el, melyik hálózatba kerül a kliens. Az alkalmazás a kulcsokat nem tárolja és nem generálja.',
    zones: 'Tűzfalzónák',
    rules: 'Szabályok',
    rulesHint:
      'A sorrend számít: a konkrét engedések a széles tiltások fölött állnak, különben a tiltás elnyelné őket.',
    objects: 'Cím- és portobjektumok',
    guests: 'Vendéggépek',
    storage: 'Tárhely',
    services: 'Szolgáltatások',
    colName: 'Név',
    colRange: 'Tartomány',
    colGateway: 'Átjáró',
    colKey: 'Kulcs',
    colNote: 'Megjegyzés',
    colZone: 'Zóna',
    colNetworks: 'Hálózatok',
    colRole: 'Szerep',
    colSource: 'Forrás',
    colTarget: 'Cél',
    colAction: 'Művelet',
    colLog: 'Napló',
    colValue: 'Érték',
    colKind: 'Típus',
    colAddress: 'Cím',
    colDevices: 'Eszközök',
    colExposure: 'Kitettség',
    colReason: 'Indok',
    colWhere: 'Hol',
    colPorts: 'Portok',
    colDisk: 'Lemez',
    contradictions: (n: number) => `${n} ellentmondás a célállapotban`,
    notes: (n: number) => `${n} megjegyzés`,
    noNetworks: 'Nincs hálózat: a hálózati modul ki van kapcsolva.',
    wipesOnCreate: 'létrehozáskor töröl',
  },

  plan: {
    modeManual:
      'Minden lépést te hajtasz végre; az alkalmazás előkészíti a parancsokat és az ellenőrzéseket.',
    modeAssisted:
      'Az alkalmazás előkészíti a pontos értékeket és parancsokat, a jóváhagyás és a végrehajtás nálad marad.',
    modeAuto:
      'Ahol van API és igazolt mentés, az alkalmazás alkalmazhatja a változtatást. A destruktív tárhelyműveletek ekkor is manuálisak maradnak.',
    step: 'Lépés',
    estimatedTime: 'Becsült idő',
    hours: ' óra',
    automatable: 'Automatizálható',
    automatableHint: 'API-n át, mentés mellett',
    assisted: 'Félautomata',
    assistedHint: 'előkészített érték, kézi beírás',
    manualOnly: 'Csak manuális',
    precheck: 'Előellenőrzés',
    verification: 'Ellenőrzés',
    actionApi: 'API',
    actionCommand: 'parancs',
    actionUi: 'felület',
    executionMode: 'Végrehajtási mód',
    modules: (n: number) => `${n} modul`,
    minutesTotal: (n: number) => `${n} perc`,
    ofWhichDestructive: (n: number) => `ebből ${n} destruktív`,
    todo: 'Elvégzendő',
    backupRequired: 'mentés kötelező',
    localConsole: 'helyi konzol',
    cappedBelow: (level: string) => `A választott módnál szűkebben fut: ${level}.`,
  },

  /**
   * Text the application writes about a live survey.
   *
   * These are generated sentences, not documents, so they belong with the
   * interface strings rather than with the knowledge base.
   */
  /** The exported handbook: a standalone document, in the interface language. */
  guide: {
    titleSuffix: (name: string) => `${name} – telepítési kézikönyv`,
    generated: (stamp: string) => `Generált kézikönyv · ${stamp}`,
    cardModules: 'Modulok',
    cardModulesHint: (n: number) => `${n} lépés`,
    cardNetworks: 'Hálózatok',
    cardNetworksHint: (n: number) => `${n} háztartás`,
    cardRules: 'Szabályok',
    cardRulesHint: (n: number) => `${n} zóna`,
    cardGuests: 'Vendéggépek',
    cardGuestsHint: (n: number) => `${n} tárhely`,
    cardTime: 'Becsült idő',
    cardTimeValue: (hours: number) => `${hours} óra`,
    cardTimeHint: (auto: number, assisted: number, manual: number) =>
      `${auto} automata · ${assisted} félautomata · ${manual} manuális`,
    issues: 'Nyitott ellentmondások',
    targetState: 'Célállapot',
    networks: 'Hálózatok',
    networkCols: ['VLAN', 'Név', 'Tartomány', 'Átjáró', 'Szerep'],
    wifi: 'Wi-Fi',
    ppskCols: ['Kulcs', 'VLAN', 'Megjegyzés'],
    zones: 'Tűzfalzónák',
    zoneCols: ['Zóna', 'Hálózatok', 'Szerep'],
    addressObjects: 'Címobjektumok',
    addressCols: ['Név', 'Cím', 'Szerep'],
    portObjects: 'Portobjektumok',
    portCols: ['Név', 'Protokoll', 'Portok', 'Szerep'],
    rules: 'Szabályok',
    rulesNote: 'A sorrend számít: a konkrét engedések a széles tiltások fölött állnak.',
    ruleCols: ['#', 'Forrás', 'Cél', 'Port', 'Művelet', 'Napló', 'Indok'],
    allow: 'Engedélyez',
    block: 'Tilt',
    yes: 'igen',
    guests: 'Vendéggépek',
    guestCols: ['ID', 'Név', 'Típus', 'VLAN', 'Cím', 'vCPU', 'RAM', 'Lemez', 'OS'],
    storage: 'Tárhely',
    storageCols: ['Név', 'Típus', 'Eszközök', 'Szerep'],
    storageDestructive: '— létrehozáskor töröl',
    services: 'Szolgáltatások',
    serviceCols: ['Név', 'Hol', 'Portok', 'Kitettség', 'Szerep'],
    toc: 'Tartalom',
    executionPlan: 'Végrehajtási terv',
    executionNote:
      'Az „Automata” lépéseket az alkalmazás API-n keresztül alkalmazhatja, dry-run és igazolt mentés mellett. A „Félautomata” lépésekhez előkészíti a pontos értékeket, a beírás kézzel történik. A „Manuális” lépéseket az alkalmazás sosem futtatja — minden destruktív tárhelyművelet ide tartozik.',
    minutes: (n: number) => `${n} perc`,
    riskBadge: (label: string) => `${label} kockázat`,
    backupRequired: 'mentés kötelező',
    localConsole: 'helyi konzol kell',
    prechecks: 'Előellenőrzés',
    todo: 'Elvégzendő',
    verification: 'Ellenőrzés',
    footer: (stamp: string) => `Generálta: Ultimate Network Assister · ${stamp}`,
    footerNote:
      'Ez a dokumentum a tervezett célállapotot írja le. Nem felmérés: nem tartalmaz élő mérési adatot.',
  },

  /*
   * Generated plan text.
   *
   * These are application sentences, not documents: `buildPlan` composes them
   * with counts, VLAN ids and host names. Shell commands are deliberately the
   * same in both languages — a translated command is a second thing to keep
   * correct, and the wrong variant would eventually get run.
   */
  planText: {
    networksTitle: (n: number) => `${n} hálózat létrehozása`,
    networksDetail:
      'Minden VLAN külön hálózatként jön létre, saját /24 tartománnyal és átjáróval. A háztartási hálózatok neve a háztartás nevét viseli, hogy a szabályok olvashatók maradjanak.',
    networkBody: (name: string, vlan: number, cidr: string, gw: string) =>
      `Network létrehozása: név=${name}, VLAN=${vlan}, tartomány=${cidr}, átjáró=${gw}, DHCP=bekapcsolva`,
    networksVerify: [
      'Minden hálózat megjelenik a listában a várt VLAN-azonosítóval.',
      'Egy teszteszköz a megfelelő tartományból kap címet.',
    ],
    ssidTitle: (name: string, keys: number) => `${name} – ${keys} PPSK kulcs`,
    ssidDetail: (purpose: string) =>
      `${purpose}. A kulcsonkénti VLAN-hozzárendelés a felületen adható meg; a jelszavakat az alkalmazás nem tárolja és nem generálja.`,
    ssidActionLabel: 'SSID és PPSK',
    ssidLine: (name: string, security: string, band: string) =>
      `SSID: ${name} · biztonság: ${security} · sáv: ${band}`,
    ssidVerify: [
      'Minden kulcshoz a saját háztartás VLAN-ja tartozik.',
      'Egy kliens a kulcsával a várt tartományból kap címet.',
    ],

    portProfilesTitle: (n: number) => `${n} port profil felvétele`,
    portProfilesDetail:
      'A profil önmagában semmit nem változtat: addig hatástalan, amíg egy portot rá nem állítasz. Ezért ezt az alkalmazás meg tudja írni.',
    portProfileBody: (name: string, native: string | number, tagged: string) =>
      `Port profil: ${name} · natív VLAN: ${native} · tagelt VLAN-ok: ${tagged}`,
    portProfilesVerify: ['Minden profil megjelenik a listában a várt VLAN-okkal.'],
    portAssignTitle: (n: number) => `${n} port hozzárendelése`,
    portAssignDetail:
      'Ezt az alkalmazás nem írja meg. Egy rossz portra tett felülírás elvághat magától a vezérlőtől, és onnan innen már nincs visszaút — ezért az értékeket megkapod, a beállítás a te kezedben marad.',
    portAssignPrechecks: [
      'A vezérlőhöz vezető uplink port azonosítva, és tudod, melyik az.',
      'Helyi hozzáférés van arra az esetre, ha a switch mégis elérhetetlenné válna.',
    ],
    portAssignLine: (idx: number, label: string, profile: string, poe: boolean) =>
      `  ${idx}. port · ${label} → ${profile}${poe ? ' · PoE be' : ''}`,
    portAssignVerify: [
      'Minden porton a tervezett profil van.',
      'Egy teszteszköz a portra kötve a várt VLAN-ból kap címet.',
      'A vezérlő és a switchek elérhetők maradtak.',
    ],
    zonesTitle: (n: number) => `${n} tűzfalzóna felvétele`,
    zonesDetail:
      'A zónák a szabályok nyelvét adják: ezután nem IP-tartományokra, hanem szerepekre hivatkozol.',
    zoneBody: (name: string, vlans: string, purpose: string) =>
      `Zóna: ${name} · hálózatok: ${vlans} · szerep: ${purpose}`,
    zonesVerify: ['Minden hálózat pontosan egy zónába tartozik.'],
    objectsTitle: (addresses: number, ports: number) =>
      `${addresses} cím- és ${ports} portobjektum`,
    objectsDetail:
      'A TCP- és UDP-portokat külön objektumba tesszük, hogy egy engedés se legyen szélesebb a szükségesnél.',
    addressBody: (name: string, address: string, purpose: string) =>
      `Címobjektum: ${name} = ${address} (${purpose})`,
    portBody: (name: string, protocol: string, ports: string, purpose: string) =>
      `Portobjektum: ${name} = ${protocol} ${ports} (${purpose})`,
    objectsVerify: ['Az SNMP UDP-port nem került a TCP nyomtatóportok közé.'],
    allowsTitle: (n: number) => `${n} engedélyező szabály`,
    allowsDetail:
      'A konkrét engedések a lánc elejére kerülnek. Ezeket kell először felvenni, különben a tiltás kizár a saját rendszeredből.',
    allowsPrecheck: ['A jelenlegi szabálykészletről készült mentés letöltve.'],
    allowBody: (from: string, to: string, ports: string, order: number, purpose: string) =>
      `Engedélyez · forrás: ${from} · cél: ${to}${ports ? ` · port: ${ports}` : ''} · sorrend: ${order} · indok: ${purpose}`,
    allowsVerify: ['Az adminisztrációs kliensről a hypervisor felülete továbbra is elérhető.'],
    blocksTitle: (n: number) => `${n} tiltó szabály`,
    blocksDetail:
      'A széles tiltások az engedések alá kerülnek, naplózással. Az utolsó szabály az alapértelmezett tiltás.',
    blockBody: (from: string, to: string, ports: string, log: boolean, order: number) =>
      `Tilt · forrás: ${from} · cél: ${to}${ports ? ` · port: ${ports}` : ''} · napló: ${log ? 'igen' : 'nem'} · sorrend: ${order}`,
    blocksVerify: [
      'Egyik háztartás kliense sem éri el a másik háztartás klienseit vagy IoT-eszközeit.',
      'A vendéghálózatról egyetlen belső cím sem válaszol.',
      'A naplóban megjelennek a blokkolt próbálkozások.',
    ],

    trunkTitle: (bridge: string) => `VLAN-tudatos trunk bridge (${bridge})`,
    trunkDetailSeparate:
      'A management külön fizikai interfészen marad, a vendéggépek trunkja külön bridge-re kerül. Így a trunk átalakítása nem vágja el a felületet.',
    trunkDetailShared:
      'Figyelem: a management és a vendégforgalom ugyanazon az interfészen fut, ezért a bridge átalakítása megszakítja a távoli elérést.',
    trunkPrechecks: [
      'Helyi monitor és billentyűzet, vagy távoli konzol elérhetősége igazolva.',
      'Az /etc/network/interfaces mentése megtörtént.',
    ],
    trunkActions: {
      discover: 'Interfészek felderítése',
      backup: 'Konfiguráció mentése',
      bridge: 'Trunk bridge',
      check: 'Ellenőrzés alkalmazás előtt',
      restore: 'Visszaállítás konzolról',
    },
    trunkVerify: [
      'A hypervisor felülete a management címen továbbra is válaszol.',
      'Egy teszt vendéggép a kiosztott VLAN-ban kap címet.',
    ],

    identifyTitle: 'Lemezek azonosítása stabil útvonalon',
    identifyDetail:
      'A /dev/sda jelölés új lemez behelyezésekor megváltozhat. Minden további lépés a /dev/disk/by-id/ útvonalat használja.',
    identifyActions: { inventory: 'Lemezleltár', stablePaths: 'Stabil útvonalak', smart: 'SMART állapot' },
    identifyVerify: [
      'Minden felhasználni kívánt lemez modellje, sorozatszáma és kapacitása egyezik a tervvel.',
    ],
    storageTitle: (name: string, kind: string) => `${name} létrehozása (${kind})`,
    storageDestructiveNote: ' A művelet a felsorolt lemezeken minden adatot töröl.',
    storagePrechecks: [
      'A lemez modellje ellenőrizve.',
      'A lemez sorozatszáma ellenőrizve.',
      'A lemez kapacitása ellenőrizve.',
      'A /dev/disk/by-id/ útvonal ellenőrizve.',
      'A lemezen nincs megőrzendő adat.',
    ],
    storageVerifyZfs: ['A pool ONLINE állapotban van és mindkét eszköz látszik benne.'],
    storageVerifyFs: ['A fájlrendszer csatolható és írható.'],
    storageActions: {
      poolCreate: 'Pool létrehozása',
      poolStatus: 'Állapot',
      wipeTable: 'Partíciótábla törlése',
      mkfs: 'Fájlrendszer',
      mergeMount: 'Egyesített csatolás',
      hardlink: 'Hardlink teszt',
      prepare: 'Előkészítés',
    },

    resourcesTitle: (n: number) => `${n} vendéggép erőforrásterve`,
    resourcesDetail:
      'A kiosztás a választott memóriaprofilhoz igazodik. Ez a lépés csak rögzíti a tervet; a gépek a saját moduljukban jönnek létre.',
    resourcesVerify: [
      'A tervezett RAM összege elfér a fizikai memóriában, a hypervisornak hagyott tartalékkal együtt.',
    ],

    printerTitle: 'Nyomtató saját hálózatba',
    printerDetail:
      'A nyomtató külön VLAN-ba kerül fix címmel, és csak a nyomtatási portokon érhető el. Maga a nyomtató nem kezdeményezhet forgalmat.',
    printerSwitchport: 'Switchport',
    printerSwitchportBody: (address: string) =>
      `A nyomtató portja access módban a nyomtató-VLAN-ba kerül; fix cím: ${address}`,
    printerSide: 'Nyomtató oldali beállítás',
    printerSideBody: 'A nyomtatón statikus cím, vagy DHCP-foglalás a gatewayen.',
    printerVerify: [
      'Minden háztartásból sikeres a próbanyomtatás.',
      'A nyomtató webes felülete csak az adminisztrációs zónából érhető el.',
    ],

    idsTitle: (mode: string) => `Behatolásvédelem: ${mode}`,
    idsDetailOff: 'A behatolásvédelem kikapcsolva marad. Ezt tudatos döntésként rögzítjük.',
    idsDetailOn:
      'A bekapcsolás növeli a gateway terhelését, ezért karbantartási ablakban érdemes.',
    idsBody: (mode: string) => `Behatolásvédelem módja: ${mode}`,
    idsVerify: ['A gateway terhelése a bekapcsolás után is elfogadott tartományban marad.'],
    upnpTitle: 'Automatikus portnyitás kikapcsolása',
    upnpDetail:
      'Az UPnP tetszőleges belső eszköznek engedné, hogy portot nyisson kifelé. Ez felülírja a tűzfaltervet.',
    upnpBody: 'UPnP / automatikus porttovábbítás: kikapcsolva',
    upnpVerify: ['A porttovábbítási listán csak a dokumentált bejegyzések szerepelnek.'],

    publishTitle: (n: number) => `${n} szolgáltatás publikálása`,
    publishDetail:
      'Minden publikus szolgáltatáson kötelező a hosszú egyedi jelszó, a kétlépcsős azonosítás, a naprakész frissítés és a célzott tűzfalszabály.',
    publishPrechecks: [
      'A publikálandó szolgáltatás frissítve van.',
      'A kétlépcsős azonosítás bekapcsolva.',
    ],
    publishBody: (ports: string, host: string, name: string) =>
      `Porttovábbítás: ${ports} → ${host} · név: ${name}`,
    publishVerify: [
      'Kívülről csak a felsorolt portok válaszolnak.',
      'A dinamikus névfrissítés a jelenlegi publikus címre mutat.',
    ],

    bootTitle: 'Indulási sorrend beállítása',
    bootDetail:
      'A névfeloldás és a tárhely indul először, utána az azokra épülő szolgáltatások. A sorrend nélkül a függő gépek hibával indulnak.',
    bootBody: (kind: string, vmid: number, order: number, delay: number) =>
      `${kind} ${vmid} · indulási sorrend: ${order} · késleltetés: ${delay} mp`,
    bootVerify: ['Teljes újraindítás után minden szolgáltatás magától elérhetővé válik.'],

    k8sNetTitle: 'Fürt VLAN létrehozása',
    k8sNetDetail:
      'A csomópontok külön hálózatba kerülnek, hogy a fürtön belüli forgalom ne keveredjen a háztartási hálózatokkal.',
    k8sNetBody: (name: string, vlan: number, cidr: string, gw: string) =>
      `Network létrehozása: név=${name}, VLAN=${vlan}, tartomány=${cidr}, átjáró=${gw}`,
    k8sNetVerify: ['A csomópontok a fürt tartományából kapnak címet.'],
    k8sNodesTitle: (n: number) => `${n} csomópont létrehozása`,
    k8sNodesDetail:
      'Minden csomópont azonos méretű, hogy a terhelés kiszámíthatóan oszoljon el. A címek fixek, mert a vezérlősík azokra hivatkozik.',
    k8sNodeComment: (ip: string) => `# fix cím: ${ip}`,
    k8sNodesVerify: ['Minden csomópont elérhető a fix címén, és látja a többit.'],
    k8sControlTitle: 'Vezérlősík indítása',
    k8sControlDetail: (distro: string) =>
      `A ${distro} vezérlősík az első csomóponton indul; a csatlakozási token innen származik.`,
    k8sControlPrecheck: ['A pod- és service-tartomány nem ütközik a házi hálózatokkal.'],
    k8sInstallLabel: 'Telepítés',
    k8sInstallOther: (distro: string) =>
      `# ${distro} vezérlősík indítása a disztribúció dokumentációja szerint`,
    k8sTokenLabel: 'Token kiolvasása',
    k8sControlFallback: 'vezérlő',
    k8sControlVerify: (name: string) => `A ${name} csomópont Ready állapotban van.`,
    k8sJoinTitle: (n: number) => `${n} csomópont csatlakoztatása`,
    k8sJoinDetail: 'A futtató csomópontok a vezérlősík címére és a tokenre csatlakoznak.',
    k8sJoinVerify: ['Minden csomópont Ready, és a munkaterhelés eloszlik közöttük.'],

    handoverTitle: 'Záróellenőrzés',
    handoverDetail:
      'A rendszer csak akkor tekinthető késznek, ha az alábbi ellenőrzések mind lefutottak.',
    handoverCross: (a: string, b: string) => `${a} kliense nem éri el ${b} klienseit.`,
    handoverVerify: [
      'A vendéghálózatról egyetlen belső cím sem érhető el.',
      'Minden mentési feladat lefutott, és van igazolt visszaállítási próba.',
      'A távoli adminisztráció csak alagúton keresztül működik.',
    ],

    reviewVerify: ['A modul tartalma átnézve és elfogadva.'],
  },

  /*
   * What a survey could establish about backups.
   *
   * The wording matters here more than usual: the difference between "nothing
   * verified this" and "this failed verification" is the difference between a
   * gap in evidence and a broken backup, and the view must not blur them.
   */
  /*
   * Port configuration.
   *
   * The wording carries the design decision: the application writes port
   * *profiles*, and hands the per-port assignment over as an exact instruction.
   * A wrong port override can cut the controller's own uplink, and there is no
   * way back from inside the application once that happens.
   */
  ports: {
    tab: 'Portok',
    title: 'Portkiosztás',
    subtitle: 'Melyik porton mi van — ebből jön a szükséges VLAN-átengedés',
    empty: 'Még nincs felvéve port.',
    emptyBody:
      'Vedd fel kézzel, vagy — ha futott felmérés — töltsd be a ténylegesen bedugott portokat, és onnan írd át, aminek másnak kell lennie.',
    importFromSurvey: 'Betöltés a felmérésből',
    importedCount: (n: number) => `${n} port betöltve a felmérésből`,
    importNothing: 'A felmérés nem talált portokat.',
    addPort: 'Port hozzáadása',
    colDevice: 'Eszköz',
    colPort: 'Port',
    colLabel: 'Mi van rajta',
    colRole: 'Szerep',
    colNative: 'Natív hálózat',
    colTagged: 'Tagelt VLAN-ok',
    colProfile: 'Port profil',
    poe: 'PoE',
    roles: {
      access: 'Access – egy hálózat',
      ap: 'Access Point',
      server: 'Szerver trunk',
      trunk: 'Switch trunk',
      uplink: 'Uplink',
      off: 'Kikapcsolva',
    },
    profiles: {
      accessPrefix: 'ACCESS',
      accessUnassigned: 'ACCESS-NINCS-HALOZAT',
      ap: 'AP-TRUNK',
      server: 'SERVER-TRUNK',
      trunk: 'SWITCH-TRUNK',
      uplink: 'UPLINK',
      disabled: 'DISABLED',
      purpose: {
        access: 'Egyetlen hálózat, tageletlenül',
        ap: 'Minden Wi-Fi-t hordozó VLAN tagelve',
        server: 'Minden VLAN, amiben vendéggép ülhet',
        trunk: 'Minden VLAN switchek között',
        uplink: 'Minden VLAN az átjáró felé',
        off: 'A port nincs használatban',
      },
    },
    issue: {
      duplicate: (device: string, idx: number) =>
        `${device} ${idx}. portja kétszer szerepel a kiosztásban.`,
      noNetwork: (device: string, idx: number) =>
        `${device} ${idx}. portja access, de nincs hozzá hálózat választva.`,
      unknownVlan: (device: string, idx: number, vlan: number) =>
        `${device} ${idx}. portján VLAN ${vlan} van, de ilyen hálózat nincs a célállapotban.`,
      noUplink: (device: string) =>
        `${device} egyetlen portja sincs uplinknek vagy trunknek jelölve — így a switch nem érné el a hálózat többi részét.`,
    },
    writeNote:
      'Az alkalmazás a port profilokat írja meg. Azt, hogy melyik fizikai portra kerüljön, nem írja: egy rossz port-felülírás magától a vezérlőtől is elvághat, és onnan innen már nem lehet visszahozni. A terv pontos értékekkel megmondja, mit kell a portra tenni.',
    profilesTitle: 'Port profilok',
    portsTitle: 'Portok',
    usedBy: (n: number) => `${n} porton`,
  },

  backupFindings: {
    jobName: (id: string) => `Mentési feladat ${id}`,
    noSchedule: 'nincs ütemezés',
    today: 'ma',
    daysAgo: (n: number) => `${n} napja`,
    jobDisabled: 'A feladat ki van kapcsolva, így nem fut.',
    noFiles: 'A feladat egyetlen mentést sem hagyott hátra a megadott tárolón.',
    verificationFailed: 'A tároló szerint legalább egy mentés ellenőrzése megbukott.',
    staleFiles: (n: number) =>
      `A legfrissebb mentés ${n} napos, ami az ütemezéshez képest túl régi.`,
    verifiedOk: (n: number) => `${n} mentés a tárolón, és az ellenőrzés rendben lefutott.`,
    notVerified: 'Van mentés, de ezt egyik ellenőrzés sem igazolta.',
    cannotVerify:
      'Van mentés. Ez a tároló nem végez ellenőrzést, így az olvashatóság innen nem igazolható.',
  },

  findings: {
    factVersion: 'Verzió',
    factCpu: 'CPU',
    factUptime: 'Uptime',
    factBridges: 'Bridge-ek',
    factModel: 'Modell',
    factFirmware: 'Firmware',
    factMac: 'MAC',
    factId: 'Azonosító',
    factState: 'Állapot',
    factHost: 'Gazdagép',
    factTags: 'Címkék',
    factKind: 'Típus',
    factCapacity: 'Kapacitás',
    factFree: 'Szabad',
    factEnabled: 'Engedélyezve',
    factTotal: 'Összes',
    factWireless: 'Vezeték nélküli',
    factWired: 'Vezetékes',
    factUnidentified: 'Nem azonosított',
    metricCpu: 'CPU',
    metricMemory: 'Memória',
    metricDisk: 'Lemez',
    metricUsage: 'Foglaltság',
    metricClients: 'Kliensek',
    metricAvailability: 'Elérhetőség',
    metricVcpu: 'vCPU',
    threads: (n: number) => `${n} szál`,
    days: (n: number) => `${n} nap`,
    hours: (n: number) => `${n} óra`,
    offline: 'offline',
    vlanAware: 'VLAN-aware',
    clientsNode: (n: number) => `Kliensek · ${n}`,
    clientsSubtitle: (wireless: number, wired: number) =>
      `${wireless} vezeték nélküli · ${wired} vezetékes`,
    guestNotRunning: (state: string) => `A vendéggép nem fut (${state}).`,
    deviceOffline:
      'Az eszköz nem jelentkezik be a vezérlőbe. A hozzá tartozó kliensek felügyelet nélkül vannak.',
    unknownVendor: (n: number) =>
      `${n} eszköz gyártója nem azonosítható, ezért a besorolásuk becsült érték.`,
    storageHigh: (name: string, pct: number) =>
      `${name} ${pct}%-on áll. 80% fölött a foglaltság már mérhetően rontja az írási teljesítményt.`,
    notMeasured: 'Nem mérve',
    capacityActiveNoFigures:
      'A tárolók csatolva vannak és válaszolnak, de méret nélkül szerepelnek a listában. Ilyenkor a token látja a tárolót, a foglaltságát viszont nem olvashatja: adj neki Datastore.Audit jogot a /storage útvonalra a Datacenter → Permissions → API Tokens alatt.',
    capacityNoStores:
      'A Proxmox csomópontok válaszoltak, de egyetlen tárolót sem soroltak fel. A /nodes/{node}/storage találatait a Proxmox tárolónként szűri a hívó jogosultsága szerint, ezért a leggyakoribb ok, hogy az API token nem kapott Datastore.Audit jogot a /storage útvonalra — ezt a Datacenter → Permissions → API Tokens alatt lehet megadni.',
    capacityNoFigures:
      'A tárolók felsorolása megérkezett, de méret nélkül. Ez akkor fordul elő, ha a tároló nincs csatolva, vagy ha a token látja a tárolót, de a foglaltságát nem olvashatja.',
    anyPort: 'minden',
    anyTarget: 'bármely',
    signalV6Leak: (from: string, to: string) => `${from} → ${to}: IPv6-on átjár`,
    signalV6LeakText:
      'Az IPv4 szabálykészlet elválasztja ezt a két hálózatot, az IPv6 viszont nem, és mindkét végponton van útvonalképes IPv6 cím. A tiltás így csak az egyik címcsaládra érvényes. Mindkét szabálykészletet és a címeket is az átjáróról olvastuk ki.',
    signalOffline: (name: string) => `${name} nem elérhető`,
    signalOfflineText:
      'Az eszköz nem jelentkezik be a vezérlőbe, így sem az állapota, sem a rajta áthaladó forgalom nem ellenőrizhető.',
    signalNoGuestSsid: 'Nincs vendégként jelölt SSID',
    signalNoGuestSsidText:
      'Egyetlen bekapcsolt SSID sincs vendégként megjelölve, így a vendégizoláció nem érvényesül automatikusan.',
    signalWeakWifi: (name: string) => `${name}: gyenge vagy hiányzó titkosítás`,
    signalWeakWifiText: (mode: string) =>
      `Az SSID biztonsági módja „${mode}”. A rajta áthaladó forgalom nem védett.`,
    signalRulesRead: (n: number) => `${n} tűzfalszabály kiolvasva, egyik sem igazolva`,
    signalRulesReadText:
      'A szabályok a konfigurációból származnak. Az érvényesülésüket csak forgalmi mérés igazolhatja, ezért a szegmentáció „nem ellenőrzött” marad.',
    signalStorage: (name: string, pct: number) => `${name} ${pct}%-on`,
    signalStorageText:
      '90% fölött az írási teljesítmény jelentősen romlik, és a pillanatképek elakadhatnak.',
    signalNonVlanBridge: 'Nem VLAN-tudatos bridge a hoston',
    signalNonVlanBridgeText: (names: string) =>
      `${names} — a VLAN tagelés a switch oldalán történik. Az átalakítás megszakítja a host hálózatát, ezért helyi konzol kell hozzá.`,
    riskStorageFree: (free: string) => `${free} szabad hely maradt.`,
    riskGuestStopped: (name: string) => `${name} nem fut`,
    riskGuestStoppedText: (state: string) =>
      `A vendéggép állapota „${state}”. Ha ez szándékos, érdemes kivenni az indulási sorrendből.`,
    riskDisk: (model: string) => `Lemezhiba: ${model}`,
    riskDiskText: (health: string) =>
      `A SMART állapot „${health}”. A lemez cseréje javasolt, mielőtt adat kerül rá.`,
    riskDeviceOffline: (name: string) => `${name} offline`,
    riskDeviceOfflineText: 'A vezérlő nem látja az eszközt. Helyszíni vizsgálat lehet szükséges.',
    riskUnknownClients: (n: number) => `${n} nem azonosított kliens`,
    riskUnknownClientsText:
      'A gyártó nem állapítható meg, ezért a hálózati besorolásuk becsült érték.',
    profileReadOnly: 'Csak olvasás · rögzített tanúsítvány',
    profileNoCert: 'Tanúsítvány nincs elfogadva',
    statDevices: 'Hálózati eszköz',
    statDevicesHint: (online: number, offline: number) => `${online} online · ${offline} offline`,
    statGuests: 'VM és LXC',
    statGuestsHint: (vms: number, cts: number) => `${vms} VM · ${cts} konténer`,
    statNetworks: 'Hálózat',
    statNetworksHint: (n: number) => `${n} VLAN-nal`,
    statRisks: 'Nyitott kockázat',
    statRisksHint: (critical: number, other: number) => `${critical} kritikus · ${other} figyelem`,
    statVerifiedRules: 'Igazolt szabály',
    statVerifiedRulesHint: 'a felmérés nem mér forgalmat',
    statVerifiedRulesLive: 'az átjáró betöltött szabálykészletében megtalálva',
    memoryOf: (node: string) => `${node} memória`,
  },

  sshRules: [
    'A host-kulcs ellenőrzése kötelező; eltérés esetén a kapcsolat megszakad.',
    'A jelszavak és kulcsok a Windows Credential Managerben maradnak, az app nem tárolja őket.',
    'Módosító parancs csak mentés vagy checkpoint után, kifejezett jóváhagyással futtatható.',
    'Hálózati konfiguráció módosítása előtt az app helyi konzol elérést kér igazolni.',
  ],

  apply: {
    desktopOnly:
      'Élő rendszerre csak az asztali alkalmazás ír. A böngészőben a célállapot és a terv megtekinthető, de az alkalmazás nem indítható.',
    noTarget:
      'Nincs olyan UniFi profil, amelynek a tanúsítványa el van fogadva. Vedd fel a Felmérés nézetben, fogadd el az ujjlenyomatát, és futtass egy felmérést — az alkalmazás az élő állapothoz hasonlítja a célállapotot.',
    target: 'Cél vezérlő',
    operationCount: (n: number) => `${n} művelet a célállapotból`,
    scopeNote:
      'Az alkalmazás jelenleg csak hálózatokat (VLAN-okat) ír. Az SSID-k és a tűzfalszabályok előkészítve maradnak: egy rossz szabálysorrend a vezérlőtől is elzárhat, és azt már nem lehetne innen javítani.',
    operationKind: {
      'unifi.network': 'Hálózat',
      'unifi.portconf': 'Port profil',
    },
    /** Why the apply button is not available yet. */
    blocker: {
      noBackup: 'Nincs friss site backup. Írás előtt kötelező.',
      noDryRun: 'Nincs dry-run az aktuális állapotra.',
      notConfirmed: 'A dry-run nincs megerősítve.',
      staleConfirmation: 'A megerősítés egy korábbi dry-runra vonatkozik. Futtasd újra.',
      noSurvey: 'Nincs UniFi felmérés. Írás előtt fel kell mérni az élő állapotot.',
      duplicateKey: (field: string, value: string, previous: string, label: string) =>
        `Két művelet ugyanarra a kulcsra hivatkozik (${field} ${value}): „${previous}” és „${label}”.`,
      conflicts: (n: number) =>
        `${n} művelet ütközik az élő állapottal. Ezeket előbb kézzel kell rendezni.`,
      managementNetwork:
        'Ez a hálózat viszi a jelenlegi kapcsolatot a vezérlőhöz. Az alkalmazás nem módosítja: helyi konzolról, kézzel végezd el.',
      nameClash: (name: string, vlan: string) =>
        `Már van „${name}” nevű hálózat más VLAN-on (${vlan}). Nevezd át valamelyiket.`,
      subnetClash: (subnet: string, name: string) =>
        `A ${subnet} tartományt már használja a(z) „${name}” hálózat.`,
    },
    busyBackup: 'Mentés készítése…',
    busyApply: 'Alkalmazás fut…',
    busyRollback: 'Visszaállítás fut…',
    gates: 'Kapuk',
    backup: 'Site backup',
    backupSaved: (path: string) => `Mentve: ${path}`,
    backupHint: 'Írás előtt kötelező. Az alkalmazás kéri a vezérlőtől és lemezre írja.',
    takeBackup: 'Mentés készítése',
    newBackup: 'Új mentés',
    takingBackup: 'Mentés készítése…',
    dryRun: 'Dry-run',
    dryRunHint: 'Összeveti a célállapotot a legutóbbi felméréssel. Semmit nem ír.',
    dryRunSummary: (c: number, u: number, n: number, x: number) =>
      `${c} létrehozás · ${u} módosítás · ${n} már helyes · ${x} ütközés`,
    runDryRun: 'Dry-run futtatása',
    rerun: 'Újrafuttatás',
    confirmation: 'Megerősítés',
    confirmationHint: 'A dry-run átnézése után adható meg.',
    confirmed: 'Ez a megerősítés egyetlen futásra érvényes.',
    confirm: 'Átnéztem, megerősítem',
    revoke: 'Visszavonás',
    applyWith: (n: number) => `Alkalmazás (${n} művelet)`,
    applying: 'Alkalmazás fut…',
    whatChanges: 'Mi változna',
    fields: 'Mezők',
    journal: 'Futás naplója',
    journalCounts: (applied: number, failed: number, rolledBack: number) =>
      `${applied} alkalmazva · ${failed} hiba · ${rolledBack} visszaállítva`,
    rollback: 'Visszaállítás',
    rollingBack: 'Visszaállítás fut…',
    backupPath: 'Mentés',
    verdicts: {
      create: 'Létrehozás',
      update: 'Módosítás',
      noop: 'Már helyes',
      conflict: 'Ütközés',
    },
    outcomes: {
      applied: 'alkalmazva',
      failed: 'hiba',
      'rolled-back': 'visszaállítva',
      skipped: 'kihagyva',
    },
    aborted: (reason: string) => `A futás megszakadt: ${reason}`,
  },
};

/**
 * The shape every language must provide. Deliberately derived from the
 * Hungarian dictionary rather than declared separately: one source, and a
 * translation that falls behind fails to compile.
 */
export type Dict = typeof hu;
