import type { Dict } from './hu';

/**
 * English interface strings.
 *
 * Typed against the Hungarian dictionary, so a key that is added there and
 * forgotten here is a compile error.
 */
export const en: Dict = {
  labels: {
    severity: {
      bad: 'Critical',
      warn: 'Attention',
      info: 'Note',
    },
    status: {
      ok: 'Online',
      warn: 'Warning',
      bad: 'Error',
      idle: 'Unknown',
    },
    provenance: {
      'Felmért': 'Measured',
      'Becsült': 'Inferred',
      'Nem ellenőrzött': 'Unverified',
      'Nem ellenőrizhető': 'Unverifiable',
    },
    linkKind: {
      physical: 'Physical link',
      wireless: 'Wireless association',
      logical: 'Logical link (management)',
      broken: 'Broken link',
    },
    nodeKind: {
      cloud: 'Uplink',
      gateway: 'Gateway',
      switch: 'Switch',
      ap: 'Access point',
      clients: 'Client group',
      host: 'Proxmox host',
      storage: 'Storage',
      ct: 'LXC container',
      vm: 'Virtual machine',
      svc: 'Service',
    },
    evidence: {
      'Igazolt': 'Proven',
      'Részleges': 'Partial',
      'Hiányzik': 'Missing',
      'Elavult': 'Stale',
    },
    stepState: {
      'kész': 'done',
      'folyamatban': 'in progress',
      'vár': 'waiting',
    },
    riskLevel: {
      'Alacsony': 'Low',
      'Közepes': 'Medium',
      'Magas': 'High',
    },
  },

  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    add: 'Add',
    open: 'Open',
    copy: 'Copy',
    copied: 'Copied',
    yes: 'yes',
    no: 'no',
    none: '—',
    minutes: 'min',
    minutesShort: 'm',
    of: '/',
    required: 'required',
    unknown: 'unknown',
    loading: 'Loading…',
  },

  app: {
    readOnlySurvey: 'Survey: read-only',
    readOnlyHint:
      'The survey issues read calls only. Writing happens solely through the Apply steps, behind an explicit confirmation.',
    runSurvey: 'Run survey',
    minimize: 'Minimise',
    maximize: 'Maximise',
    quit: 'Close',
  },

  theme: {
    group: 'Colour scheme',
    autoShort: 'AUTO',
    auto: 'Follow the system',
    autoNow: (mode: string) => `Follow the system (currently: ${mode})`,
    light: 'Light mode',
    dark: 'Dark mode',
    lightWord: 'light',
    darkWord: 'dark',
  },

  source: {
    heading: 'Data source',
    demo: 'Demo',
    demoDetail: 'bundled sample estate',
    demoTitle: 'Demo estate',
    demoHint: 'The sample the design was built against',
    live: 'Live',
    liveTitle: 'Live survey',
    liveDetail: 'surveyed state',
    lastRun: (when: string) => `Last run: ${when}`,
    neverRan: 'No survey has run yet',
    profiles: 'Connection profiles',
    noProfiles: 'No profile added yet.',
    desktopOnly: 'Managing profiles needs the desktop application.',
    manage: 'Profiles and survey…',
  },

  nav: {
    overview: ['Overview'],
    topology: ['Topology', '& policy'],
    survey: ['Survey'],
    advice: ['Advice'],
    backup: ['Backup &', 'recovery'],
    planner: ['Deployment', 'planner'],
    ssh: ['SSH', 'operations'],
    kb: ['Knowledge'],
    settings: ['Settings'],
    label: 'Main navigation',
  },

  status: {
    readOnlySession: 'Read-only session',
    liveSurvey: 'Live survey',
    demoData: 'Demo data',
    demoNote: 'The state shown does not come from a live measurement',
    lastSurvey: (when: string, risks: number) => `Last survey: ${when} · ${risks} open risks`,
    unverifiedRules: (n: number) => `${n} unverified rules`,
    secrets: 'Secrets: Windows Credential Manager',
  },

  topology: {
    ports: 'Ports',
    portUp: 'Up',
    portDown: 'No link',
    portUplink: 'Uplink',
    portUnnamed: 'Unnamed port',
    portNoLldp: 'the far end does not announce itself (no LLDP)',
    portVlanUnknown: 'VLAN pass-through not surveyed',
    portSpeed: 'Port speed',
    speeds: {
      speed10g: '10 G',
      speed2g5: '2.5–5 G',
      speed1g: '1 G',
      speed100m: '100 M',
      speed10m: '10 M',
    },
    tabMap: 'Topology',
    tabPolicy: 'Policy & firewall',
    search: 'Device, IP or service…',
    legend: 'Legend',
    surveyed: 'Measured',
    estimated: 'Inferred',
    logical: 'Logical',
    broken: 'Broken',
    bidirectional: 'Two-way traffic',
    unidirectional: 'One-way traffic',
    blocked: 'No path',
    state: 'State',
    online: 'online',
    warnings: 'warnings',
    errors: 'errors',
    unknown: 'unknown',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit',
  },

  inspector: {
    tabs: {
      overview: 'Overview',
      services: 'Services',
      conns: 'Connections',
      fw: 'Firewall & policy',
      kb: 'Knowledge',
      cfg: 'Configure',
    },
    facts: 'Device details',
    load: 'Load',
    warnings: 'Warnings',
    noServices:
      'No service was measured on this device. The survey uses read-only calls, so local processes are not visible.',
    connectionsNote:
      'Inferred connections are conclusions drawn from other data. Before any change, the application asks for a measurement first.',
    range: 'Range',
    isolation: 'Isolation',
    affectedRules: 'Affected rules',
    kbNote: 'Guides tied to the measured state of the selected device.',
    safeOrder: 'Safe order',
    referenceCommands: 'Reference commands',
    wanZone: 'WAN zone',
    publicUplink: 'public uplink',
    outbound: 'Outbound',
    bothWays: 'Both ways',
    closed: 'Closed',
    outboundOnly: 'Outbound only',
    inboundOnly: 'Inbound only',
  },

  policy: {
    heading: 'VLAN zones and isolation',
    summary: (zones: number, rules: number, unverified: number) =>
      `${zones} zones · ${rules} rules · ${unverified} claims cannot be verified with the current access`,
    matrix: 'Zone matrix',
    matrixNoteDemo:
      'Row: source · column: destination. A dashed cell (unverified) cannot be confirmed by a survey.',
    matrixNoteLive:
      'The survey reads configuration, not traffic. Reachability between zones therefore stays “unverified” until a measurement proves it.',
    rules: 'Firewall rules',
    rulesNote: '“Measured” means a measurement confirms the rule actually takes effect.',
    signals: 'Security signals',
    colSource: 'Source',
    colTarget: 'Destination',
    colPort: 'Port',
    colAction: 'Action',
    colEvidence: 'Evidence',
    colChecked: 'Checked',
    allow: 'Allow',
    block: 'Block',
    limited: 'Limited',
    unverified: 'Unverified',
    ssid: 'SSID',
    devices: 'Devices',
    notMeasured: 'Not measured',
  },

  overview: {
    title: 'Infrastructure overview',
    subtitleLive: (when: string) =>
      `Combined picture of the surveyed Proxmox VE and UniFi Network state · last run ${when}`,
    subtitleDemo: 'Demo data: the state shown does not come from a live measurement',
    profileCount: (n: number) => `read-only · ${n} profiles`,
    risks: 'Deviations and risks',
    openAdvice: 'Open advice',
    noRisks:
      'The survey found no deviation. That does not mean the segmentation is proven — only traffic measurement can confirm that rules take effect.',
    capacity: 'Capacity',
    noCapacity:
      'This panel needs a Proxmox survey: capacity comes from the nodes’ stores and memory.',
    sources: 'Survey sources',
  },

  survey: {
    title: 'Survey',
    subtitle:
      'Through saved connection profiles, using read-only calls exclusively. The application changes nothing during a survey.',
    desktopOnlyTitle:
      'A live survey needs the desktop application: certificate verification and authentication run on the native side.',
    desktopOnlyBody:
      'The browser build shows demo data. Start the application with npm run tauri:dev to add a connection profile and run a survey.',
    liveData: 'Live data',
    demoData: 'Demo data',
    switchToDemo: 'Switch to demo',
    switchToLive: 'Switch to live',
    profiles: 'Connection profiles',
    noProfiles:
      'No profile yet. Add one below, accept its certificate, then provide the secret.',
    newProfile: 'New profile',
    system: 'System',
    name: 'Name',
    address: 'Address',
    addressHint: (example: string) => `The server root only, for example ${example}`,
    tokenId: 'Token id',
    username: 'Username',
    site: 'Site',
    siteHint: 'Left empty, the “default” site is used.',
    addProfile: 'Add profile',
    fetchCert: 'Fetch certificate',
    recheckCert: 'Re-check certificate',
    checking: 'Checking…',
    setSecret: 'Provide secret',
    certPinned: (fp: string) => `pinned: ${fp}`,
    certNotAccepted: 'certificate not accepted',
    certAccept: 'It matches, accept',
    secretProxmox: 'API token secret',
    secretUnifi: 'Password or API key',
    secretHintProxmox: 'The token secret. A read-only role (PVEAuditor) is enough.',
    secretHintUnifi: 'The account password, or the API key when the username is empty.',
    userHintProxmox: 'API token id, for example root@pam!survey',
    userHintUnifi: 'Local username. Leave empty to use an API key.',
    saveSecret: 'Save to Credential Manager',
    start: 'Start survey',
    startWith: (n: number) => `Start survey (${n} profiles)`,
    running: 'Survey running…',
    startHint:
      'The run uses GET calls only. Every request expects the pinned certificate; if it changed, the connection fails rather than asking.',
    discard: 'Discard results',
    log: 'Log',
    lastLog: 'Last run log',
    neverRan: 'No survey has run yet.',
    successful: 'Successful',
    partial: 'Partial',
    result: 'Result',
    provenanceNote:
      'The survey reads configuration, not traffic. Firewall rules therefore appear as “unverified” and must not be used as the basis of an automatic decision.',
    profileAdded: (label: string) =>
      `“${label}” added. Check the certificate, then provide the secret.`,
    certAccepted: (label: string) =>
      `The certificate for “${label}” is pinned. If it changes, the connection fails.`,
    secretStored: (label: string) =>
      `The secret for “${label}” went into the Windows Credential Manager.`,
    partialRun: (errors: string) => `The survey ran only partially: ${errors}`,

    addSsh: 'Add SSH access',
    editSsh: 'Edit SSH access',
    removeSsh: 'Remove SSH access',
    sshSaved: (label: string) => `${label}: SSH access saved`,
    sshRemoved: (label: string) => `${label}: SSH access removed, along with its secret`,
    sshHostChanged:
      'The address changed, so the pinned host key is dropped. After saving you have to fetch and accept it again — a different host is a different trust decision.',
    sshSection: 'SSH access to this system',
    sshSectionHint:
      'The same machine, a different route. Switch it on and it appears under SSH operations too, with no separate profile.',
    fetchHostKey: 'Fetch the host key',
    recheckHostKey: 'Re-check the host key',
    hostKeyAccept: 'Accept the host key',
    hostKeyPinned: 'Host key pinned',
    hostKeyNotAccepted: 'Host key not accepted',
    setSshSecret: 'Set the SSH secret',
    sshHost: 'Host name or IP',
    sshHostHint: 'No scheme and no port, for example 10.0.1.10.',
    sshPort: 'Port',
    sshAuth: 'Authentication',
    sshAuthHint:
      'The password or key goes into the Windows Credential Manager, not into the app’s database.',
    sshAuthPassword: 'Password',
    sshAuthKey: 'Private key',
    sshFlavour: 'What is on the other end',
    sshFlavourHint: 'This decides which commands the catalogue offers.',
    sshFlavourOther: 'Other Linux',
    userHintSsh: 'The one you would log in with by hand, for example root.',
    secretSshPassword: 'SSH password',
    secretHintSshPassword:
      'Goes into the Credential Manager; the application never reads one back into the interface.',
    secretSshKey: 'Private key (PEM)',
    secretHintSshKey:
      'Paste the whole key, BEGIN and END lines included. It goes into the Credential Manager.',
    counts: {
      devices: 'Devices',
      networks: 'Networks',
      ssids: 'SSIDs',
      rules: 'Rules',
      clients: 'Clients',
      guests: 'VM / LXC',
      storages: 'Storage',
    },
  },

  advice: {
    title: 'Advice',
    subtitle: (open: number) => `${open} open · ranked by the survey`,
    impact: 'Expected effect',
    risk: 'Risk',
    duration: 'Time needed',
    why: 'Why this is advised',
    plan: 'Change plan',
    noAuto: 'No step runs automatically',
    prepare: 'Prepare the plan',
    exportChecklist: 'Export checklist',
    preparedHint: 'Plan copied',
    exportName: 'change-plan',
    exportHeading: 'Change plan',
    exportGenerated: (when: string) => `Generated: ${when}`,
    exportSource: (when: string) => `Source: measurements from the survey of ${when}`,
    exportDemoSource: 'Source: sample data set — not a real survey',
    empty: 'No change is advised',
    emptyBody:
      'The survey found nothing that a change plan could be attached to. Existing risks are listed in the overview.',
    demoNotice:
      'Sample data set: these are not about your systems. Run a survey for real advice.',
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
  diff: {
    title: 'Changes',
    subtitle: (when: string) => `Against the survey of ${when}`,
    pick: 'Compare with:',
    none: 'Nothing differs between the two surveys.',
    noneBody:
      'That does not mean nothing happened — only that whatever both surveys measured came back the same.',
    onlyOne: 'Only one survey so far',
    onlyOneBody:
      'Comparing needs two runs. After the next survey this panel will show what moved.',
    countLabel: (n: number) => (n === 1 ? '1 change' : `${n} changes`),
    capped: (n: number) => `${n} further changes are not listed.`,
    port: 'port',
    free: 'free',

    unifiOneSided: 'The UniFi side appears in only one of the surveys, so it was not compared.',
    proxmoxOneSided: 'The Proxmox side appears in only one of the surveys, so it was not compared.',

    deviceAppeared: 'New device appeared',
    deviceGone: 'Gone from the controller',
    deviceLost: 'Became unreachable',
    deviceBack: 'Reachable again',
    firmwareChanged: 'Firmware changed',
    addressChanged: 'Address changed',

    portDown: 'Port went down',
    portUp: 'Port came up',
    portSlower: 'Port negotiated slower',
    portFaster: 'Port negotiated faster',
    neighbourChanged: 'A different device is at the far end',

    networkAdded: 'New network',
    networkRemoved: 'Network removed',
    vlanChanged: 'VLAN id changed',
    ssidAdded: 'New SSID',
    ssidRemoved: 'SSID removed',
    ssidOn: 'SSID switched on',
    ssidOff: 'SSID switched off',
    securityChanged: 'Security mode changed',
    ruleAdded: 'New firewall rule',
    ruleRemoved: 'Firewall rule deleted',
    ruleOn: 'Firewall rule switched on',
    ruleOff: 'Firewall rule switched off',
    ruleActionChanged: 'The rule’s action changed',

    guestAdded: 'New guest',
    guestGone: 'Guest gone',
    guestStarted: 'Started',
    guestStopped: 'Stopped',
    storageGrew: 'Store filled up further',
    storageShrank: 'Space freed on the store',
    diskHealthChanged: 'Disk health changed',
    backupLost: 'Backup coverage lost',
    backupGained: 'Backup coverage established',
    bridgeVlanOn: 'Bridge became VLAN-aware',
    bridgeVlanOff: 'Bridge is no longer VLAN-aware',
  },

  adviceRules: {
    stepSurvey: 'Survey',
    stepPrecheck: 'Pre-check',
    stepCheckpoint: 'Backup / checkpoint',
    stepExecute: 'Execution',
    stepVerify: 'Verification',
    stepRollback: 'Rollback',
    surveyText: 'The finding comes from measurements taken by the survey, not from an estimate.',
    checkpointHave: (days: number) =>
      `A backup no older than ${days} days exists for this system and can serve as the restore point.`,
    checkpointNone: 'Take a restorable backup of the affected system before starting.',
    minutes: (n: number) => `~${n} min`,
    window: (n: number) => `Window: ${n} min`,

    unprotectedTitle: (n: number) => `Bring ${n} guests under backup`,
    unprotectedWhere: (node: string) => `${node} · vzdump`,
    unprotectedImpact: 'Every guest becomes provably restorable',
    unprotectedWhy: (names: string, total: number, covered: number) =>
      `Of ${total} guests, ${covered} have a backup file behind them; these do not: ${names}. Where there is no file, a restore cannot be proven, even if a scheduled job exists.`,
    unprotectedPrecheckOk: (store: string, free: string) =>
      `Store ${store} accepts backups and has ${free} free.`,
    unprotectedPrecheckNone:
      'No surveyed store reports the "backup" content type. One has to exist first.',
    unprotectedExecute:
      'Add the missing guests to the existing vzdump job, or create a new job covering them.',
    unprotectedVerify: 'After the next run, check that a backup file appeared for each guest.',
    unprotectedRollback:
      'Disable the job. No data is lost: a backup only adds, it never modifies.',

    unverifiedTitle: 'Turn on backup verification',
    unverifiedWhere: (store: string) => `${store} · vzdump`,
    unverifiedImpact: 'Backups become provably usable rather than merely present',
    unverifiedWhy: (files: number, days: number) =>
      `There are ${files} backup files and the newest is ${days} days old, but none carries a verification result. A plain vzdump target does not verify, so the integrity of the files is not proven.`,
    unverifiedPrecheck: 'Confirm a Proxmox Backup Server is reachable, or schedule a manual restore test.',
    unverifiedExecute:
      'Attach a PBS store with a verify job, or run a periodic restore test into an isolated guest.',
    unverifiedVerify: 'The verification result appears in the store content listing.',
    unverifiedRollback: 'The existing backup job is untouched, so there is nothing to roll back.',

    storageTitle: (name: string, pct: number) => `Free up ${name} (${pct}%)`,
    storageImpact: 'Stable write performance and working snapshots',
    storageWhy: (name: string, pct: number, free: string) =>
      `Store ${name} is at ${pct}% with ${free} free. Above 80% write performance degrades measurably, and above 90% snapshots can stall.`,
    storagePrecheck:
      'List the snapshots and old backups on the store, and exclude any still referenced.',
    storageExecute: 'Remove snapshots that are no longer referenced and backups past retention.',
    storageVerify: 'Measure free capacity again with a survey.',
    storageRollback:
      'A deleted snapshot cannot be brought back, so only demonstrably unneeded items may go.',

    offlineTitle: (name: string) => `Bring ${name} back into service`,
    offlineImpact: 'Its clients come back under supervision',
    offlineWhy: (name: string, ip: string) =>
      `${name} (${ip}) is not checking in with the controller. While that holds, neither its state nor the traffic through it can be verified, and the clients behind it are unsupervised.`,
    offlinePrecheck: 'Check power, and the state of the PoE port on the parent device.',
    offlineExecute:
      'Power-cycle the PoE port; if that does not help, inspect on site: cable, power supply, device.',
    offlineVerify: 'The device reappears in the controller; then run a survey.',
    offlineRollback: 'Not applicable: the step is the restoration of the original state.',

    weakWifiTitle: (name: string) => `Strengthen encryption on ${name}`,
    weakWifiImpact: 'Traffic on the network becomes protected',
    weakWifiWhy: (name: string, mode: string) =>
      `SSID ${name} uses security mode "${mode}". Traffic on it can be read, and joining the network is not restricted.`,
    weakWifiPrecheck: 'List the clients using the network: older ones may not support WPA2.',
    weakWifiExecute: 'Switch to WPA2 or WPA3 with a strong passphrase.',
    weakWifiVerify: 'Check that clients reconnect, then run a survey.',
    weakWifiRollback: 'Restore the previous security mode if a critical device drops off.',

    diskTitle: (model: string) => `Prepare to replace ${model}`,
    diskImpact: 'Data loss avoided before the disk fails',
    diskWhy: (model: string, health: string, usedBy: string) =>
      `${model} reports health "${health}" and is currently used by ${usedBy}. A SMART warning precedes failure, but says nothing about how long is left.`,
    diskPrecheck: 'Identify the stores and guests using the disk and check their backups.',
    diskExecute: 'Obtain a replacement, then migrate the data or rebuild the array.',
    diskVerify: 'Measure the array state and SMART values again.',
    diskRollback: 'Keep the original disk until the replacement is proven working.',

    bridgeTitle: (name: string) => `Make ${name} VLAN-aware`,
    bridgeImpact: 'Per-guest VLAN tagging on the host',
    bridgeWhy: (name: string, vlans: number) =>
      `Bridge ${name} is not VLAN-aware while ${vlans} VLANs are configured on the network. Tagging can therefore only happen on the switch side, and per-guest placement is impossible.`,
    bridgePrecheck:
      'Confirm local console or IPMI access, and save the current /etc/network/interfaces.',
    bridgeExecute: 'Switch the bridge to VLAN-aware in one step, then restart networking.',
    bridgeVerify: 'Reach the host and every guest on its own VLAN.',
    bridgeRollback: 'Copy the original interfaces file back from the local console.',

    slowPortTitle: (device: string, port: number) => `Investigate the speed of ${device} port ${port}`,
    slowPortImpact: 'The link settles at the speed the cabling allows',
    slowPortWhy: (device: string, port: number, speed: number, neighbour: string) =>
      `Port ${port} on ${device} is at ${speed} Mb/s, with ${neighbour} at the far end. That usually points to a damaged pair, a bad connector or an old cable rather than a limit of the device.`,
    slowPortPrecheck: 'Identify the device at the far end and the path the cable takes.',
    slowPortExecute: 'Replace or re-terminate the cable, then power-cycle the port.',
    slowPortVerify: 'Measure the negotiated speed again with a survey.',
    slowPortRollback: 'Not needed: the work is physical only, no configuration changes.',
  },

  backup: {
    title: 'Backup and recovery',
    subtitle: 'Coverage counts as proven only when the last restore test is on record.',
    colJob: 'Backup job',
    colTarget: 'Target',
    colSchedule: 'Schedule',
    colLastRun: 'Last run',
    colRetention: 'Retention',
    colEvidence: 'Evidence',
    restoreTest: 'Restore test',
    noJobs: 'No backup job at all',
    noJobsBody:
      'The cluster has no backup configured. That is not missing evidence, it is a missing backup: after a disk failure or a bad upgrade there is nothing to go back to.',
    coverage: 'Coverage',
    coverageAll: 'Every guest has at least one backup.',
    coverageMissing: (n: number) => `${n} guests have no backup at all.`,
    andMore: (n: number) => `…and ${n} more`,
    liveOnly: 'Coverage can only be computed from a live survey.',
    restoreNotProvable:
      'Proxmox does not record whether a restore was ever tested, so the application cannot vouch for one. A restore that has never been tried is the most common reason a backup turns out to be worthless.',
    stores: 'Backup stores',
    noStores: 'No store is used for backups.',
    noBackupsAtAll: 'No backup exists on any store',
    newestBackup: (n: number) =>
      n === 0 ? 'The newest backup is from today' : `The newest backup is ${n} days old`,
    storeVerifies: 'the store verifies backups',
    storeCannotVerify: 'the store does not verify',
    daysAgo: 'days ago',
    checkpoints: 'Checkpoints',
    conditions: 'Recovery conditions',
    localConsole: 'Local console access proven',
    offsiteFreshness: 'Offsite copy freshness',
    configBackup: 'Configuration backup',
    upToDate: 'up to date',
    days: 'days',
  },

  ssh: {
    title: 'SSH operations',
    subtitle:
      'Authenticated commands bound to a saved profile. Secrets stay in the Windows Credential Manager.',
    hostKeyVerified: 'Host key verified',
    viewFingerprint: 'View fingerprint',
    readOnlyCommands: 'Read-only commands',
    copyCommand: 'Copy command',
    safetyRules: 'Safety rules',

    noProfiles: 'No SSH connection saved',
    noProfilesBody:
      'Add the machine as an SSH profile in the Survey view, accept its host key, and you can run commands on it here.',
    hostKeyPending: 'The host key has not been accepted',
    hostKeyPendingBody:
      'Nothing runs without a pinned key: accept the fingerprint in the Survey view first.',
    catalogue: 'Command catalogue',
    commandLabel: 'Command to run',
    commandHint: 'Pick one from the catalogue, or type your own.',
    runButton: 'Run',
    runningNow: 'Running…',
    clearance: {
      readOnly: 'Reads only',
      mutating: 'Changes something',
      forbidden: 'Will not run',
    },
    clearanceReadOnlyNote: 'The command only reads; it can run.',
    clearanceMutatingNote:
      'This command changes something. Read it, and tick the box to say this is what you want to run.',
    clearanceForbiddenNote:
      'Destructive command: the application never runs it. Copy it and run it at a console, where you can see what you are doing.',
    confirmLabel: 'I have read it and want to run this command',
    output: 'Output',
    stderr: 'Error output',
    exitStatus: 'Exit code',
    duration: 'Duration',
    truncatedNote: 'Output truncated: it hit the size or time limit.',
    noOutput: 'The command printed nothing.',
    history: 'Runs',
    clearHistory: 'Clear the list',
    emptyHistory: 'No command has run in this session yet.',
    groups: {
      inventory: 'Inventory',
      network: 'Network',
      storage: 'Storage',
      services: 'Services',
      maintenance: 'Maintenance',
    },
  },

  kb: {
    title: 'Knowledge base',
    subtitle: 'Guides tied to the surveyed state',
    referenceCommands: 'Reference commands',
  },

  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    colorScheme: 'Colour scheme',
    colorSchemeHint: 'Follow the system, or pin light and dark',
    language: 'Language',
    languageHint: 'Language of the interface and the knowledge base',
    languageAuto: 'Follow the system',
    security: 'Security',
    forceReadOnly: 'Enforce read-only mode',
    forceReadOnlyHint: 'A changing call needs an explicit approval',
    hostKeyRequired: 'Host key verification required',
    hostKeyRequiredHint: 'On a mismatch the SSH connection is dropped',
    secretStorage: 'Secret storage',
    secretStorageHint: 'The application stores no password in its own database',
    dataHandling: 'Data handling',
    telemetry: 'Telemetry',
    telemetryHint: 'No outbound data',
    surveyStorage: 'Survey data storage',
    surveyStorageHint: 'Local database with encrypted profile references',
    on: 'On',
    off: 'Off',
  },

  blueprint: {
    title: 'Blueprints',
    subtitle: 'Parameterised target states that produce a plan and a handbook',
    starterName: 'Home estate',
    starterDescription:
      'Three households fully shut off from each other, with a shared printer and shared services, on one Proxmox host. It starts from the target state of the existing handbook.',
    copyOf: (name: string) => `${name} – copy`,
    unknownPreset: (id: string) => `Unknown preset in the file: ${id}`,
    newFromPreset: 'New blueprint from a preset…',
    loadFromFile: 'Load blueprint from file',
    exportGuide: 'Export handbook',
    saveBlueprint: 'Save blueprint',
    duplicate: 'Duplicate',
    tabs: {
      modules: 'Modules',
      params: 'Parameters',
      ports: 'Ports',
      target: 'Target state',
      plan: 'Plan',
      apply: 'Apply',
    },
    modulesNote:
      'Turning a module off removes its networks, rules and machines from the target state, and its steps disappear from the plan too. Required modules form the backbone of the system and cannot be turned off.',
    prerequisite: 'Prerequisite',
    dropsWhenOff: 'Turning this off also drops',
    groups: {
      overview: 'Overview',
      network: 'Network & UniFi',
      server: 'Server & infrastructure',
      services: 'Services',
      ops: 'Operations',
    },
    risk: {
      low: 'low',
      medium: 'medium',
      high: 'high',
    },
    targets: {
      unifi: 'UniFi Network',
      proxmox: 'Proxmox VE',
      docker: 'Docker',
      kubernetes: 'Kubernetes',
      host: 'Operating system',
    },
    capability: {
      destructiveStorage:
        'Destructive storage operation: the application prepares the command but never runs it. Check the model, the serial and the /dev/disk/by-id/ path.',
      noApi: 'No API for this: the application prepares the exact values and you type them in.',
      commandOnly:
        'No API call in this step, only a command — the application prepares it and running it needs your approval.',
    },
    issue: {
      moduleMissingDeps: (title: string, missing: string) =>
        `“${title}” was left out because it is missing: ${missing}.`,
      moduleClash: (title: string, clash: string) =>
        `“${title}” cannot be enabled together with: ${clash}.`,
      vlanTwice: (vlan: number, previous: string, name: string) =>
        `VLAN ${vlan} appears twice: “${previous}” and “${name}”.`,
      vlanOutOfRange: (vlan: number, name: string) =>
        `VLAN ${vlan} (“${name}”) cannot map to a /24 network, because the third octet is the VLAN id. Pick a value between 1 and 254.`,
      vlanClash: (vlan: number, previous: string, household: string, role: string) =>
        `VLAN ${vlan} clashes: ${previous} and ${household} ${role}.`,
      roleClient: 'client',
      roleIot: 'IoT',
      roleGuest: 'guest',
      noHouseholds:
        'There are no households, so no client, IoT or guest networks will be created.',
      badIp: (label: string, ip: string) => `“${label}” does not have a valid IPv4 address: ${ip}`,
      ipTwice: (ip: string, previous: string, label: string) =>
        `${ip} is assigned twice: “${previous}” and “${label}”.`,
      ipOutOfSubnet: (label: string, ip: string, vlan: number, expected: string) =>
        `“${label}” (${ip}) is not in its own network; VLAN ${vlan} covers ${expected}0/24.`,
      badGatewayByte: (byte: number) =>
        `The gateway host octet is ${byte}, which is not a usable address in a /24.`,
      ipIsGateway: (label: string, ip: string) =>
        `“${label}” (${ip}) falls on the gateway’s own address.`,
      badPrefix: (prefix: string) =>
        `The IP prefix is “${prefix}”, but two octets are expected, for example 192.168.`,
      allowBelowDeny:
        'There is an allow rule below the default deny, so it would never take effect.',
    },
    importError: {
      notObject: 'The file does not contain a blueprint.',
      missingFields: (fields: string) => `Missing field in the file: ${fields}.`,
      missingLists: 'The file has no module or household list.',
      missingParams: 'The file has no parameters.',
    },
    automation: {
      auto: 'Automatic',
      assisted: 'Assisted',
      manual: 'Manual',
    },
    empty: 'Pick a blueprint, or create one.',
    handbookSaved: (path: string) => `Handbook saved: ${path}`,
    handbookSuffix: 'handbook',
    blueprintSaved: (path: string) => `Blueprint saved: ${path}`,
    householdCount: (n: number) => `${n} households`,
    moduleCount: (n: number) => `${n} modules`,
    issuesShort: (n: number) => `${n} contradictions`,
    households: 'Households',
    householdsNote:
      'Every household gets a client, an IoT and a guest network, and the plan automatically carries the rule that shuts it off from the other households — in both directions.',
    resetParams: 'Reset parameters to their defaults',
    handbookFile: 'Handbook',
    householdName: 'Name',
    householdSlug: 'Short name',
    householdGuestVlan: 'Guest VLAN',
    newHousehold: 'Name of the new household',
  },

  target: {
    networks: 'Networks',
    networksHint:
      'The third octet is the VLAN id, so VLANs should stay between 1 and 254.',
    wifi: 'Wi-Fi and key assignment',
    wifiHint:
      'Under one SSID the key decides which network a client joins. The application neither stores nor generates the keys.',
    zones: 'Firewall zones',
    rules: 'Rules',
    rulesHint:
      'Order matters: specific allows sit above broad blocks, otherwise the block would swallow them.',
    objects: 'Address and port objects',
    guests: 'Guests',
    storage: 'Storage',
    services: 'Services',
    colName: 'Name',
    colRange: 'Range',
    colGateway: 'Gateway',
    colKey: 'Key',
    colNote: 'Note',
    colZone: 'Zone',
    colNetworks: 'Networks',
    colRole: 'Role',
    colSource: 'Source',
    colTarget: 'Destination',
    colAction: 'Action',
    colLog: 'Log',
    colValue: 'Value',
    colKind: 'Type',
    colAddress: 'Address',
    colDevices: 'Devices',
    colExposure: 'Exposure',
    colReason: 'Reason',
    colWhere: 'Where',
    colPorts: 'Ports',
    colDisk: 'Disk',
    contradictions: (n: number) => `${n} contradictions in the target state`,
    notes: (n: number) => `${n} notes`,
    noNetworks: 'No networks: the network module is turned off.',
    wipesOnCreate: 'wipes on creation',
  },

  plan: {
    modeManual:
      'You carry out every step; the application prepares the commands and the checks.',
    modeAssisted:
      'The application prepares the exact values and commands; approval and execution stay with you.',
    modeAuto:
      'Where there is an API and a verified backup, the application may apply the change. Destructive storage work stays manual even then.',
    step: 'Step',
    estimatedTime: 'Estimated time',
    hours: ' h',
    automatable: 'Automatable',
    automatableHint: 'over an API, with a backup',
    assisted: 'Assisted',
    assistedHint: 'prepared value, typed by hand',
    manualOnly: 'Manual only',
    precheck: 'Pre-check',
    verification: 'Verification',
    actionApi: 'API',
    actionCommand: 'command',
    actionUi: 'screen',
    executionMode: 'Execution mode',
    modules: (n: number) => `${n} modules`,
    minutesTotal: (n: number) => `${n} min`,
    ofWhichDestructive: (n: number) => `${n} of them destructive`,
    todo: 'To do',
    backupRequired: 'backup required',
    localConsole: 'local console',
    cappedBelow: (level: string) => `Runs narrower than the mode you picked: ${level}.`,
  },

  guide: {
    titleSuffix: (name: string) => `${name} – installation handbook`,
    generated: (stamp: string) => `Generated handbook · ${stamp}`,
    cardModules: 'Modules',
    cardModulesHint: (n: number) => `${n} steps`,
    cardNetworks: 'Networks',
    cardNetworksHint: (n: number) => `${n} households`,
    cardRules: 'Rules',
    cardRulesHint: (n: number) => `${n} zones`,
    cardGuests: 'Guests',
    cardGuestsHint: (n: number) => `${n} storage entries`,
    cardTime: 'Estimated time',
    cardTimeValue: (hours: number) => `${hours} hours`,
    cardTimeHint: (auto: number, assisted: number, manual: number) =>
      `${auto} automatic · ${assisted} assisted · ${manual} manual`,
    issues: 'Open contradictions',
    targetState: 'Target state',
    networks: 'Networks',
    networkCols: ['VLAN', 'Name', 'Range', 'Gateway', 'Role'],
    wifi: 'Wi-Fi',
    ppskCols: ['Key', 'VLAN', 'Note'],
    zones: 'Firewall zones',
    zoneCols: ['Zone', 'Networks', 'Role'],
    addressObjects: 'Address objects',
    addressCols: ['Name', 'Address', 'Role'],
    portObjects: 'Port objects',
    portCols: ['Name', 'Protocol', 'Ports', 'Role'],
    rules: 'Rules',
    rulesNote: 'Order matters: the specific allows sit above the broad blocks.',
    ruleCols: ['#', 'Source', 'Target', 'Port', 'Action', 'Log', 'Reason'],
    allow: 'Allow',
    block: 'Block',
    yes: 'yes',
    guests: 'Guests',
    guestCols: ['ID', 'Name', 'Kind', 'VLAN', 'Address', 'vCPU', 'RAM', 'Disk', 'OS'],
    storage: 'Storage',
    storageCols: ['Name', 'Kind', 'Devices', 'Role'],
    storageDestructive: '— erased on creation',
    services: 'Services',
    serviceCols: ['Name', 'Where', 'Ports', 'Exposure', 'Role'],
    toc: 'Contents',
    executionPlan: 'Execution plan',
    executionNote:
      '“Automatic” steps can be applied by the application over the API, with a dry run and a verified backup. For “Assisted” steps it prepares the exact values and you type them in. “Manual” steps are never run by the application — every destructive storage operation belongs here.',
    minutes: (n: number) => `${n} min`,
    riskBadge: (label: string) => `${label} risk`,
    backupRequired: 'backup required',
    localConsole: 'local console needed',
    prechecks: 'Pre-checks',
    todo: 'To do',
    verification: 'Verification',
    footer: (stamp: string) => `Generated by Ultimate Network Assister · ${stamp}`,
    footerNote:
      'This document describes the planned target state. It is not a survey: it contains no live measurements.',
  },

  planText: {
    networksTitle: (n: number) => `Create ${n} networks`,
    networksDetail:
      'Every VLAN becomes its own network, with its own /24 range and gateway. Household networks carry the household’s name so the rules stay readable.',
    networkBody: (name: string, vlan: number, cidr: string, gw: string) =>
      `Create network: name=${name}, VLAN=${vlan}, range=${cidr}, gateway=${gw}, DHCP=enabled`,
    networksVerify: [
      'Every network appears in the list with the expected VLAN id.',
      'A test device gets an address from the right range.',
    ],
    ssidTitle: (name: string, keys: number) => `${name} – ${keys} PPSK keys`,
    ssidDetail: (purpose: string) =>
      `${purpose}. The per-key VLAN assignment is entered in the interface; the application neither stores nor generates the passwords.`,
    ssidActionLabel: 'SSID and PPSK',
    ssidLine: (name: string, security: string, band: string) =>
      `SSID: ${name} · security: ${security} · band: ${band}`,
    ssidVerify: [
      'Every key maps to its own household’s VLAN.',
      'A client using its key gets an address from the expected range.',
    ],

    portProfilesTitle: (n: number) => `Add ${n} port profiles`,
    portProfilesDetail:
      'A profile on its own changes nothing: it is inert until a port is pointed at it. That is why the application can write this one.',
    portProfileBody: (name: string, native: string | number, tagged: string) =>
      `Port profile: ${name} · native VLAN: ${native} · tagged VLANs: ${tagged}`,
    portProfilesVerify: ['Every profile appears in the list with the expected VLANs.'],
    portAssignTitle: (n: number) => `Assign ${n} ports`,
    portAssignDetail:
      'The application does not write this. An override on the wrong port can cut you off from the controller itself, with no way back from inside — so you get the values and the setting stays in your hands.',
    portAssignPrechecks: [
      'The uplink port towards the controller is identified, and you know which one it is.',
      'You have local access in case the switch becomes unreachable anyway.',
    ],
    portAssignLine: (idx: number, label: string, profile: string, poe: boolean) =>
      `  port ${idx} · ${label} → ${profile}${poe ? ' · PoE on' : ''}`,
    portAssignVerify: [
      'Every port carries the planned profile.',
      'A test device on the port gets an address from the expected VLAN.',
      'The controller and the switches stayed reachable.',
    ],
    zonesTitle: (n: number) => `Add ${n} firewall zones`,
    zonesDetail:
      'Zones give the rules their vocabulary: from here on you refer to roles, not IP ranges.',
    zoneBody: (name: string, vlans: string, purpose: string) =>
      `Zone: ${name} · networks: ${vlans} · role: ${purpose}`,
    zonesVerify: ['Every network belongs to exactly one zone.'],
    objectsTitle: (addresses: number, ports: number) =>
      `${addresses} address and ${ports} port objects`,
    objectsDetail:
      'TCP and UDP ports go into separate objects, so no allow is wider than it needs to be.',
    addressBody: (name: string, address: string, purpose: string) =>
      `Address object: ${name} = ${address} (${purpose})`,
    portBody: (name: string, protocol: string, ports: string, purpose: string) =>
      `Port object: ${name} = ${protocol} ${ports} (${purpose})`,
    objectsVerify: ['The SNMP UDP port did not end up among the TCP printer ports.'],
    allowsTitle: (n: number) => `${n} allow rules`,
    allowsDetail:
      'The specific allows go to the front of the chain. Add these first, or the block will lock you out of your own system.',
    allowsPrecheck: ['A backup of the current rule set has been downloaded.'],
    allowBody: (from: string, to: string, ports: string, order: number, purpose: string) =>
      `Allow · source: ${from} · target: ${to}${ports ? ` · port: ${ports}` : ''} · order: ${order} · reason: ${purpose}`,
    allowsVerify: ['The hypervisor interface is still reachable from the administration client.'],
    blocksTitle: (n: number) => `${n} block rules`,
    blocksDetail:
      'The broad blocks go below the allows, with logging. The last rule is the default deny.',
    blockBody: (from: string, to: string, ports: string, log: boolean, order: number) =>
      `Block · source: ${from} · target: ${to}${ports ? ` · port: ${ports}` : ''} · log: ${log ? 'yes' : 'no'} · order: ${order}`,
    blocksVerify: [
      'No household’s clients reach another household’s clients or IoT devices.',
      'No internal address answers from the guest network.',
      'Blocked attempts show up in the log.',
    ],

    trunkTitle: (bridge: string) => `VLAN-aware trunk bridge (${bridge})`,
    trunkDetailSeparate:
      'Management stays on its own physical interface and the guests’ trunk moves to a separate bridge. Converting the trunk then cannot cut the interface.',
    trunkDetailShared:
      'Careful: management and guest traffic share one interface, so converting the bridge will break remote access.',
    trunkPrechecks: [
      'A local monitor and keyboard, or remote console access, confirmed available.',
      '/etc/network/interfaces has been backed up.',
    ],
    trunkActions: {
      discover: 'Discover interfaces',
      backup: 'Back up the configuration',
      bridge: 'Trunk bridge',
      check: 'Check before applying',
      restore: 'Restore from the console',
    },
    trunkVerify: [
      'The hypervisor interface still answers on the management address.',
      'A test guest gets an address in its assigned VLAN.',
    ],

    identifyTitle: 'Identify the disks by a stable path',
    identifyDetail:
      'The /dev/sda name can change when a disk is added. Every step from here uses the /dev/disk/by-id/ path.',
    identifyActions: { inventory: 'Disk inventory', stablePaths: 'Stable paths', smart: 'SMART status' },
    identifyVerify: [
      'The model, serial and capacity of every disk you intend to use match the plan.',
    ],
    storageTitle: (name: string, kind: string) => `Create ${name} (${kind})`,
    storageDestructiveNote: ' The operation erases all data on the listed disks.',
    storagePrechecks: [
      'Disk model verified.',
      'Disk serial verified.',
      'Disk capacity verified.',
      '/dev/disk/by-id/ path verified.',
      'The disk holds nothing worth keeping.',
    ],
    storageVerifyZfs: ['The pool is ONLINE and both devices appear in it.'],
    storageVerifyFs: ['The filesystem mounts and is writable.'],
    storageActions: {
      poolCreate: 'Create the pool',
      poolStatus: 'Status',
      wipeTable: 'Wipe the partition table',
      mkfs: 'Filesystem',
      mergeMount: 'Merged mount',
      hardlink: 'Hardlink test',
      prepare: 'Preparation',
    },

    resourcesTitle: (n: number) => `Resource plan for ${n} guests`,
    resourcesDetail:
      'The allocation follows the chosen memory profile. This step only records the plan; the machines are created in their own modules.',
    resourcesVerify: [
      'The planned RAM total fits in physical memory, including the reserve left for the hypervisor.',
    ],

    printerTitle: 'Printer on its own network',
    printerDetail:
      'The printer moves to a separate VLAN with a fixed address, reachable only on the printing ports. The printer itself may not initiate traffic.',
    printerSwitchport: 'Switch port',
    printerSwitchportBody: (address: string) =>
      `The printer’s port goes into the printer VLAN in access mode; fixed address: ${address}`,
    printerSide: 'Printer-side settings',
    printerSideBody: 'A static address on the printer, or a DHCP reservation on the gateway.',
    printerVerify: [
      'A test print succeeds from every household.',
      'The printer’s web interface is reachable only from the administration zone.',
    ],

    idsTitle: (mode: string) => `Intrusion prevention: ${mode}`,
    idsDetailOff: 'Intrusion prevention stays off. We record that as a deliberate decision.',
    idsDetailOn:
      'Turning it on adds load to the gateway, so a maintenance window is the right time.',
    idsBody: (mode: string) => `Intrusion prevention mode: ${mode}`,
    idsVerify: ['Gateway load stays within an acceptable range after enabling it.'],
    upnpTitle: 'Disable automatic port opening',
    upnpDetail:
      'UPnP would let any internal device open a port outward. That overrides the firewall plan.',
    upnpBody: 'UPnP / automatic port forwarding: disabled',
    upnpVerify: ['The port-forwarding list contains only the documented entries.'],

    publishTitle: (n: number) => `Publish ${n} services`,
    publishDetail:
      'Every public service requires a long unique password, two-factor authentication, current updates and a targeted firewall rule.',
    publishPrechecks: [
      'The service being published is up to date.',
      'Two-factor authentication is enabled.',
    ],
    publishBody: (ports: string, host: string, name: string) =>
      `Port forward: ${ports} → ${host} · name: ${name}`,
    publishVerify: [
      'Only the listed ports answer from outside.',
      'Dynamic DNS points at the current public address.',
    ],

    bootTitle: 'Set the start-up order',
    bootDetail:
      'Name resolution and storage start first, then the services built on them. Without an order, dependent machines start with errors.',
    bootBody: (kind: string, vmid: number, order: number, delay: number) =>
      `${kind} ${vmid} · start order: ${order} · delay: ${delay} s`,
    bootVerify: ['After a full restart every service becomes reachable on its own.'],

    k8sNetTitle: 'Create the cluster VLAN',
    k8sNetDetail:
      'The nodes go into their own network, so traffic inside the cluster does not mix with the household networks.',
    k8sNetBody: (name: string, vlan: number, cidr: string, gw: string) =>
      `Create network: name=${name}, VLAN=${vlan}, range=${cidr}, gateway=${gw}`,
    k8sNetVerify: ['The nodes get addresses from the cluster range.'],
    k8sNodesTitle: (n: number) => `Create ${n} nodes`,
    k8sNodesDetail:
      'Every node is the same size, so load spreads predictably. The addresses are fixed because the control plane refers to them.',
    k8sNodeComment: (ip: string) => `# fixed address: ${ip}`,
    k8sNodesVerify: ['Every node is reachable on its fixed address and sees the others.'],
    k8sControlTitle: 'Bring up the control plane',
    k8sControlDetail: (distro: string) =>
      `The ${distro} control plane starts on the first node; the join token comes from there.`,
    k8sControlPrecheck: ['The pod and service ranges do not clash with the home networks.'],
    k8sInstallLabel: 'Install',
    k8sInstallOther: (distro: string) =>
      `# bring up the ${distro} control plane per the distribution's documentation`,
    k8sTokenLabel: 'Read the token',
    k8sControlFallback: 'control-plane',
    k8sControlVerify: (name: string) => `The ${name} node is Ready.`,
    k8sJoinTitle: (n: number) => `Join ${n} nodes`,
    k8sJoinDetail: 'The worker nodes join using the control plane’s address and the token.',
    k8sJoinVerify: ['Every node is Ready and workloads spread across them.'],

    handoverTitle: 'Closing check',
    handoverDetail:
      'The system counts as finished only once all of the checks below have run.',
    handoverCross: (a: string, b: string) => `${a} clients do not reach ${b} clients.`,
    handoverVerify: [
      'No internal address is reachable from the guest network.',
      'Every backup job has run, and there is a proven restore test.',
      'Remote administration works only over the tunnel.',
    ],

    reviewVerify: ['The module’s content has been reviewed and accepted.'],
  },

  ports: {
    tab: 'Ports',
    title: 'Port layout',
    subtitle: 'What is on which port — the VLAN pass-through follows from it',
    empty: 'No port entered yet.',
    emptyBody:
      'Add them by hand, or — if a survey has run — load the ports that are actually plugged in and change what needs to be different.',
    importFromSurvey: 'Load from the survey',
    importedCount: (n: number) => `${n} ports loaded from the survey`,
    importNothing: 'The survey found no ports.',
    addPort: 'Add a port',
    colDevice: 'Device',
    colPort: 'Port',
    colLabel: 'What is on it',
    colRole: 'Role',
    colNative: 'Native network',
    colTagged: 'Tagged VLANs',
    colProfile: 'Port profile',
    poe: 'PoE',
    roles: {
      access: 'Access – one network',
      ap: 'Access point',
      server: 'Server trunk',
      trunk: 'Switch trunk',
      uplink: 'Uplink',
      off: 'Disabled',
    },
    profiles: {
      accessPrefix: 'ACCESS',
      accessUnassigned: 'ACCESS-NO-NETWORK',
      ap: 'AP-TRUNK',
      server: 'SERVER-TRUNK',
      trunk: 'SWITCH-TRUNK',
      uplink: 'UPLINK',
      disabled: 'DISABLED',
      purpose: {
        access: 'A single network, untagged',
        ap: 'Every VLAN Wi-Fi can carry, tagged',
        server: 'Every VLAN a guest machine can sit in',
        trunk: 'Every VLAN, switch to switch',
        uplink: 'Every VLAN, towards the gateway',
        off: 'The port is not in use',
      },
    },
    issue: {
      duplicate: (device: string, idx: number) =>
        `Port ${idx} on ${device} appears twice in the layout.`,
      noNetwork: (device: string, idx: number) =>
        `Port ${idx} on ${device} is an access port with no network chosen.`,
      unknownVlan: (device: string, idx: number, vlan: number) =>
        `Port ${idx} on ${device} carries VLAN ${vlan}, but no such network is in the target state.`,
      noUplink: (device: string) =>
        `No port on ${device} is marked as an uplink or a trunk — the switch would not reach the rest of the network.`,
    },
    writeNote:
      'The application writes the port profiles. It does not write which physical port gets which one: a wrong port override can cut you off from the controller itself, and there is no way back from inside the application. The plan tells you the exact values to set on the port.',
    profilesTitle: 'Port profiles',
    portsTitle: 'Ports',
    usedBy: (n: number) => `on ${n} ports`,
  },

  backupFindings: {
    jobName: (id: string) => `Backup job ${id}`,
    noSchedule: 'no schedule',
    today: 'today',
    daysAgo: (n: number) => `${n} days ago`,
    jobDisabled: 'The job is disabled, so it does not run.',
    noFiles: 'The job has left no backup at all on the store it names.',
    verificationFailed: 'The store reports that at least one backup failed verification.',
    staleFiles: (n: number) =>
      `The newest backup is ${n} days old, which is too old for the schedule.`,
    verifiedOk: (n: number) => `${n} backups on the store, and verification passed.`,
    notVerified: 'Backups exist, but no verification has vouched for them.',
    cannotVerify:
      'Backups exist. This store does not verify, so readability cannot be established from here.',
  },

  findings: {
    factVersion: 'Version',
    factCpu: 'CPU',
    factUptime: 'Uptime',
    factBridges: 'Bridges',
    factModel: 'Model',
    factFirmware: 'Firmware',
    factMac: 'MAC',
    factId: 'Id',
    factState: 'State',
    factHost: 'Host',
    factTags: 'Tags',
    factKind: 'Type',
    factCapacity: 'Capacity',
    factFree: 'Free',
    factEnabled: 'Enabled',
    factTotal: 'Total',
    factWireless: 'Wireless',
    factWired: 'Wired',
    factUnidentified: 'Unidentified',
    metricCpu: 'CPU',
    metricMemory: 'Memory',
    metricDisk: 'Disk',
    metricUsage: 'Usage',
    metricClients: 'Clients',
    metricAvailability: 'Availability',
    metricVcpu: 'vCPU',
    threads: (n: number) => `${n} threads`,
    days: (n: number) => `${n} days`,
    hours: (n: number) => `${n} hours`,
    offline: 'offline',
    vlanAware: 'VLAN-aware',
    clientsNode: (n: number) => `Clients · ${n}`,
    clientsSubtitle: (wireless: number, wired: number) => `${wireless} wireless · ${wired} wired`,
    guestNotRunning: (state: string) => `The guest is not running (${state}).`,
    deviceOffline:
      'The device is not checking in with the controller, so its clients are unsupervised.',
    unknownVendor: (n: number) =>
      `The vendor of ${n} devices cannot be identified, so their classification is an inference.`,
    storageHigh: (name: string, pct: number) =>
      `${name} is at ${pct}%. Above 80%, usage measurably degrades write performance.`,
    notMeasured: 'Not measured',
    capacityActiveNoFigures:
      'The stores are mounted and answering, but appear in the list without a size. That means the token can see the store but may not read its usage: grant it Datastore.Audit on the /storage path under Datacenter → Permissions → API Tokens.',
    capacityNoStores:
      'The Proxmox nodes answered, but listed no stores at all. Proxmox filters /nodes/{node}/storage per store by the caller’s rights, so the usual cause is an API token without Datastore.Audit on the /storage path — granted under Datacenter → Permissions → API Tokens.',
    capacityNoFigures:
      'The stores were listed, but without sizes. That happens when a store is not mounted, or when the token can see the store but may not read its usage.',
    anyPort: 'any',
    anyTarget: 'any',
    signalOffline: (name: string) => `${name} is unreachable`,
    signalOfflineText:
      'The device is not checking in with the controller, so neither its state nor the traffic through it can be verified.',
    signalNoGuestSsid: 'No SSID is marked as guest',
    signalNoGuestSsidText:
      'Not one enabled SSID is marked as a guest network, so guest isolation does not apply automatically.',
    signalWeakWifi: (name: string) => `${name}: weak or missing encryption`,
    signalWeakWifiText: (mode: string) =>
      `The SSID security mode is “${mode}”. Traffic on it is not protected.`,
    signalRulesRead: (n: number) => `${n} firewall rules read, none of them proven`,
    signalRulesReadText:
      'The rules come from configuration. Only traffic measurement can prove they take effect, so the segmentation stays “unverified”.',
    signalStorage: (name: string, pct: number) => `${name} at ${pct}%`,
    signalStorageText: 'Above 90% write performance degrades sharply and snapshots can stall.',
    signalNonVlanBridge: 'A bridge on the host is not VLAN-aware',
    signalNonVlanBridgeText: (names: string) =>
      `${names} — VLAN tagging happens on the switch side. Converting it cuts the host network, so a local console is required.`,
    riskStorageFree: (free: string) => `${free} of free space left.`,
    riskGuestStopped: (name: string) => `${name} is not running`,
    riskGuestStoppedText: (state: string) =>
      `The guest state is “${state}”. If that is deliberate, consider taking it out of the boot order.`,
    riskDisk: (model: string) => `Disk fault: ${model}`,
    riskDiskText: (health: string) =>
      `The SMART state is “${health}”. Replace the disk before putting data on it.`,
    riskDeviceOffline: (name: string) => `${name} offline`,
    riskDeviceOfflineText:
      'The controller cannot see the device. This may need someone on site.',
    riskUnknownClients: (n: number) => `${n} unidentified clients`,
    riskUnknownClientsText:
      'The vendor cannot be determined, so their network classification is an inference.',
    profileReadOnly: 'Read-only · pinned certificate',
    profileNoCert: 'Certificate not accepted',
    statDevices: 'Network devices',
    statDevicesHint: (online: number, offline: number) => `${online} online · ${offline} offline`,
    statGuests: 'VMs and LXC',
    statGuestsHint: (vms: number, cts: number) => `${vms} VMs · ${cts} containers`,
    statNetworks: 'Networks',
    statNetworksHint: (n: number) => `with ${n} VLANs`,
    statRisks: 'Open risks',
    statRisksHint: (critical: number, other: number) =>
      `${critical} critical · ${other} attention`,
    statVerifiedRules: 'Proven rules',
    statVerifiedRulesHint: 'the survey does not measure traffic',
    memoryOf: (node: string) => `${node} memory`,
  },

  sshRules: [
    'Host key verification is mandatory; on a mismatch the connection is dropped.',
    'Passwords and keys stay in the Windows Credential Manager; the application does not store them.',
    'A changing command runs only after a backup or checkpoint, with an explicit approval.',
    'Before a network configuration change, the application asks for proven local console access.',
  ],

  apply: {
    desktopOnly:
      'Only the desktop application writes to a live system. In the browser the target state and the plan are visible, but Apply cannot start.',
    noTarget:
      'No UniFi profile has an accepted certificate. Add one in the Survey view, accept its fingerprint and run a survey — Apply compares the target state against the live one.',
    target: 'Target controller',
    operationCount: (n: number) => `${n} operations from the target state`,
    scopeNote:
      'Apply currently writes networks (VLANs) only. SSIDs and firewall rules stay prepared: a wrong rule order can lock you out of the controller itself, and that could no longer be fixed from here.',
    operationKind: {
      'unifi.network': 'Network',
      'unifi.portconf': 'Port profile',
    },
    blocker: {
      noBackup: 'No recent site backup. It is required before writing.',
      noDryRun: 'No dry run for the current state.',
      notConfirmed: 'The dry run has not been confirmed.',
      staleConfirmation: 'The confirmation belongs to an earlier dry run. Run it again.',
      noSurvey: 'No UniFi survey. The live state has to be surveyed before writing.',
      duplicateKey: (field: string, value: string, previous: string, label: string) =>
        `Two operations refer to the same key (${field} ${value}): “${previous}” and “${label}”.`,
      conflicts: (n: number) =>
        `${n} operations clash with the live state. Those have to be settled by hand first.`,
      managementNetwork:
        'This network carries the current connection to the controller. The application will not change it: do it by hand, from a local console.',
      nameClash: (name: string, vlan: string) =>
        `A network called “${name}” already exists on another VLAN (${vlan}). Rename one of them.`,
      subnetClash: (subnet: string, name: string) =>
        `The ${subnet} range is already used by the “${name}” network.`,
    },
    busyBackup: 'Taking a backup…',
    busyApply: 'Applying…',
    busyRollback: 'Rolling back…',
    gates: 'Gates',
    backup: 'Site backup',
    backupSaved: (path: string) => `Saved: ${path}`,
    backupHint: 'Required before writing. The application asks the controller for it and writes it to disk.',
    takeBackup: 'Take a backup',
    newBackup: 'New backup',
    takingBackup: 'Taking a backup…',
    dryRun: 'Dry run',
    dryRunHint: 'Compares the target state with the latest survey. Writes nothing.',
    dryRunSummary: (c: number, u: number, n: number, x: number) =>
      `${c} to create · ${u} to update · ${n} already correct · ${x} conflicts`,
    runDryRun: 'Run a dry run',
    rerun: 'Run again',
    confirmation: 'Confirmation',
    confirmationHint: 'Available once the dry run has been reviewed.',
    confirmed: 'This confirmation is valid for a single run.',
    confirm: 'Reviewed, I confirm',
    revoke: 'Revoke',
    applyWith: (n: number) => `Apply (${n} operations)`,
    applying: 'Applying…',
    whatChanges: 'What would change',
    fields: 'Fields',
    journal: 'Run journal',
    journalCounts: (applied: number, failed: number, rolledBack: number) =>
      `${applied} applied · ${failed} failed · ${rolledBack} rolled back`,
    rollback: 'Roll back',
    rollingBack: 'Rolling back…',
    backupPath: 'Backup',
    verdicts: {
      create: 'Create',
      update: 'Update',
      noop: 'Already correct',
      conflict: 'Conflict',
    },
    outcomes: {
      applied: 'applied',
      failed: 'failed',
      'rolled-back': 'rolled back',
      skipped: 'skipped',
    },
    aborted: (reason: string) => `The run stopped: ${reason}`,
  },
};
