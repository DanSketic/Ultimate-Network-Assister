import type { ConfigGuide, KbArticle, KbTeaser, NodeKind } from './model';

/*
 * English knowledge base — the same guides as knowledge.ts.
 *
 * The shell commands are identical in both languages: only the labels and the
 * prose are translated. A command that differed between languages would be a
 * second thing to keep correct, and the wrong one would be run.
 */

export const KB_BY_KIND_EN: Record<NodeKind, KbTeaser[]> = {
  gateway: [
    {
      title: 'Checking the VLAN trunk between gateway and switch',
      subtitle: 'Tagged uplink, native VLAN and the mistakes that come up most',
      tag: 'Network',
    },
    {
      title: 'Firewall rule order and state tracking',
      subtitle: 'Why a rule does not take effect the way you expected',
      tag: 'Security',
    },
    {
      title: 'Firmware updates without an outage',
      subtitle: 'Window, pre-checks and a restore plan',
      tag: 'Operations',
    },
  ],
  switch: [
    {
      title: 'PoE port diagnostics',
      subtitle: 'Telling overload, restart loops and cable faults apart',
      tag: 'Hardware',
    },
    {
      title: 'Port profiles and VLAN assignment',
      subtitle: 'Setting access and trunk ports correctly',
      tag: 'Network',
    },
  ],
  ap: [
    {
      title: 'Reducing channel interference',
      subtitle: 'How measurement, a fixed channel and transmit power relate',
      tag: 'Wi-Fi',
    },
    {
      title: 'Proving the SSID → VLAN mapping',
      subtitle: 'How you show that the IoT SSID really is isolated',
      tag: 'Wi-Fi',
    },
  ],
  host: [
    {
      title: 'Changing the Proxmox bridge safely',
      subtitle: 'Why a local console and a restore plan are required',
      tag: 'Proxmox',
    },
    {
      title: 'Snapshot and checkpoint strategy',
      subtitle: 'When a snapshot is enough and when you need a full backup',
      tag: 'Backup',
    },
    {
      title: 'Storage capacity and thin provisioning',
      subtitle: 'The 80% threshold and what follows from it',
      tag: 'Storage',
    },
  ],
  vm: [
    {
      title: 'VM backup and restore testing',
      subtitle: 'vzdump, retention and the verified restore',
      tag: 'Backup',
    },
    {
      title: 'Guest networking and the VLAN tag',
      subtitle: 'Bridge, tag and firewall on the Proxmox side',
      tag: 'Network',
    },
  ],
  ct: [
    {
      title: 'Choosing between LXC and a VM',
      subtitle: 'Resources, isolation and how backups differ',
      tag: 'Proxmox',
    },
    {
      title: 'What a controller outage affects',
      subtitle: 'What keeps working and what does not',
      tag: 'Operations',
    },
  ],
  storage: [
    {
      title: 'ZFS pool health and scrub',
      subtitle: 'What a degraded state means and what to do about it',
      tag: 'Storage',
    },
    {
      title: 'Verifying offsite replication',
      subtitle: 'The 3-2-1 rule in practice',
      tag: 'Backup',
    },
  ],
  svc: [
    {
      title: 'Checking a service’s exposure',
      subtitle: 'Public access, reverse proxies and the layers of defence',
      tag: 'Security',
    },
    {
      title: 'Volume-level backup for containers',
      subtitle: 'Why a disk image is not enough',
      tag: 'Backup',
    },
  ],
  cloud: [
    {
      title: 'Uplink redundancy',
      subtitle: 'Failover, SLA and how real outages actually go',
      tag: 'Network',
    },
  ],
  clients: [
    {
      title: 'Classifying unknown devices',
      subtitle: 'MAC, DHCP fingerprinting and the limits of inference',
      tag: 'Network',
    },
  ],
};

export const CONFIG_BY_KIND_EN: Record<NodeKind, ConfigGuide> = {
  gateway: {
    note: 'Changing the gateway can cut remote access. The application makes no change on its own.',
    steps: [
      'Survey: export the current firewall and network configuration',
      'Pre-check: list the affected VLANs, clients and services',
      'Backup: download the site backup to a local machine',
      'Execute: one change per cycle',
      'Verify: client reachability and logs for 10 minutes',
      'Roll back: restore the site backup',
    ],
    commands: [
      { label: 'List active rules', command: 'ssh admin@10.0.1.1 "show firewall statistics"' },
      {
        label: 'Back up the configuration',
        command: 'ssh admin@10.0.1.1 "show configuration commands" > gw-backup.cfg',
      },
    ],
  },
  switch: {
    note: 'Changing a port profile can disconnect whatever is on that port.',
    steps: [
      'Survey: read the port-to-device mapping from LLDP',
      'Pre-check: verify the uplink and the PoE load',
      'Backup: site backup',
      'Verify: link state and VLAN membership after the change',
    ],
    commands: [
      { label: 'Port status', command: 'ssh admin@10.0.1.2 "swctrl port show"' },
      { label: 'PoE status', command: 'ssh admin@10.0.1.2 "swctrl poe show"' },
    ],
  },
  ap: {
    note: 'Changing the radio settings causes a brief loss of association, a few seconds long.',
    steps: [
      'Survey: measure channel occupancy for at least 24 hours',
      'Pre-check: affected clients and the roaming settings',
      'Backup: site backup',
      'Verify: retry rate and client count after 24 hours',
    ],
    commands: [
      { label: 'Radio status', command: 'ssh admin@10.0.1.22 "iwconfig"' },
      { label: 'Clients', command: 'ssh admin@10.0.1.22 "wstalist | head -40"' },
    ],
  },
  host: {
    note: 'A network change on the Proxmox host needs a local recovery console. SSH can drop.',
    steps: [
      'Survey: back up /etc/network/interfaces and the storage state',
      'Pre-check: prove local console or IPMI access',
      'Backup: configuration backup and VM snapshots',
      'Execute: one change, then verify immediately',
      'Verify: host and VM reachability in every VLAN',
      'Roll back: copy the original interfaces file back from the console',
    ],
    commands: [
      { label: 'Network configuration', command: 'cat /etc/network/interfaces' },
      { label: 'Storage status', command: 'pvesm status' },
      { label: 'VM and LXC list', command: 'qm list; pct list' },
    ],
  },
  vm: {
    note: 'Take a snapshot before changing a guest’s network settings.',
    steps: [
      'Survey: read the guest network interface and VLAN tag',
      'Pre-check: backup validity and free capacity',
      'Backup: snapshot before the change',
      'Verify: service reachability after the change',
    ],
    commands: [
      { label: 'VM configuration', command: 'qm config 202' },
      {
        label: 'Take a snapshot',
        command: 'qm snapshot 202 pre-change --description "Network Assister"',
      },
    ],
  },
  ct: {
    note: 'Restarting the container interrupts the services bound to it.',
    steps: [
      'Survey: container configuration and resources',
      'Pre-check: identify dependent services',
      'Backup: vzdump or a snapshot',
      'Verify: service reachability and logs',
    ],
    commands: [
      { label: 'Container configuration', command: 'pct config 101' },
      { label: 'Backup', command: 'vzdump 101 --mode snapshot --storage tank' },
    ],
  },
  storage: {
    note: 'Pool operations can run for a long time and put the disks under load.',
    steps: [
      'Survey: pool state, snapshots and usage',
      'Pre-check: exclude snapshots that replication depends on',
      'Backup: a successful offsite replication run',
      'Verify: free capacity and pool health',
    ],
    commands: [
      { label: 'Pool status', command: 'zpool status tank' },
      { label: 'Usage', command: 'zfs list -o name,used,avail,refer -t all' },
    ],
  },
  svc: {
    note: 'Back up the configuration volumes before changing the service configuration.',
    steps: [
      'Survey: running containers, ports and volumes',
      'Pre-check: external access and dependencies',
      'Backup: volume-level archive',
      'Verify: service reachability and logs',
    ],
    commands: [
      {
        label: 'Containers',
        command: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
      },
      { label: 'Volumes', command: 'docker volume ls' },
    ],
  },
  cloud: {
    note: 'Uplink parameters have to be changed on the provider’s side.',
    steps: [
      'Survey: measure WAN speed and latency',
      'Pre-check: the contracted bandwidth',
      'Verify: repeat the measurement under load',
    ],
    commands: [{ label: 'Route', command: 'mtr -r -c 20 1.1.1.1' }],
  },
  clients: {
    note: 'Client classification is inferred data; confirm the actual device before changing anything.',
    steps: [
      'Survey: DHCP leases and fingerprint data',
      'Pre-check: identify unrecognised devices by hand',
      'Verify: confirm the VLAN placement with a traffic sample',
    ],
    commands: [{ label: 'DHCP leases', command: 'ssh admin@10.0.1.1 "show dhcp leases"' }],
  },
};

export const ARTICLES_EN: KbArticle[] = [
  {
    title: 'Changing the Proxmox bridge safely',
    tag: 'Proxmox',
    related: 'pve01 · vmbr0 · affects 4 VMs',
    lead: 'Converting vmbr0 to a VLAN-aware bridge cuts the host’s network connection. This is the most common reason a Proxmox interface becomes unreachable after a remote session.',
    sections: [
      {
        heading: 'What it means',
        body: 'A VLAN-aware bridge moves tagging onto the host, so the VLAN can be set per VM. In exchange the bridge is rebuilt and active connections drop.',
      },
      {
        heading: 'Why it is a risk',
        body: 'If the switch-side port is not a trunk, or the native VLAN differs, the host will be unreachable after the change. That cannot be fixed over remote SSH.',
      },
      {
        heading: 'Checkpoints',
        body: 'Prove local console or IPMI access · switch port in trunk mode · /etc/network/interfaces backed up · a per-VM VLAN tag plan · the restore command prepared',
      },
    ],
    commands: [
      {
        label: 'Back up the configuration',
        command: 'cp /etc/network/interfaces /root/interfaces.bak.$(date +%F)',
      },
      { label: 'Check the change before applying it', command: 'ifreload -a -s' },
      {
        label: 'Restore from the console',
        command: 'cp /root/interfaces.bak.* /etc/network/interfaces && ifreload -a',
      },
    ],
  },
  {
    title: 'Proving IoT isolation',
    tag: 'Security',
    related: 'VLAN 20 · 24 devices · rule unverified',
    lead: 'The existence of a firewall rule is not evidence. Ultimate Network Assister keeps segmentation in an “unverified” state until traffic is actually stopped in a measurement.',
    sections: [
      {
        heading: 'What it means',
        body: 'The survey reads configuration, not traffic. An earlier allow rule can override the block at the head of the chain.',
      },
      {
        heading: 'Why it is a risk',
        body: 'A compromised IoT device can reach workstations sideways if the rule order is wrong.',
      },
      {
        heading: 'Checkpoints',
        body: 'Read the rule order · probe client in VLAN 20 · reachability test towards the Trusted zone · a log entry for the block · remove the temporary device',
      },
    ],
    commands: [
      {
        label: 'Rule order',
        command: 'ssh admin@10.0.1.1 "show firewall name LAN_IN statistics"',
      },
      { label: 'Reachability test', command: 'nc -zvw2 10.0.10.24 445' },
    ],
  },
  {
    title: 'Backup evidence versus a backup job',
    tag: 'Backup',
    related: 'GitLab volumes · evidence missing',
    lead: 'A running job is not evidence in itself. Evidence is a verified restore with a log and a timestamp.',
    sections: [
      {
        heading: 'What it means',
        body: 'vzdump captures the disk image. That does not guarantee the container volumes are consistent if the application was mid-write.',
      },
      {
        heading: 'Why it is a risk',
        body: 'You find out the data is unusable at the moment of the restore — when there is no alternative left.',
      },
      {
        heading: 'Checkpoints',
        body: 'List of volumes and their sizes · an application-consistent backup mode · restore test in an isolated environment · the test logged · a retention rule written down',
      },
    ],
    commands: [
      {
        label: 'List the volumes',
        command: 'docker volume ls -q | xargs docker volume inspect --format "{{.Name}} {{.Mountpoint}}"',
      },
      { label: 'Backup', command: 'vzdump 202 --mode snapshot --storage tank --compress zstd' },
    ],
  },
  {
    title: 'ZFS capacity and the 80% threshold',
    tag: 'Storage',
    related: 'tank · 87% used',
    lead: 'Because of how ZFS copy-on-write works, fragmentation and latency rise as free space runs out. Above 80% this is measurable; above 90% it is critical.',
    sections: [
      {
        heading: 'What it means',
        body: 'A write allocates new blocks, and the old data is only released when no snapshot still references it.',
      },
      {
        heading: 'Why it is a risk',
        body: 'Snapshots and replication can stall, and VMs can start getting write errors.',
      },
      {
        heading: 'Checkpoints',
        body: 'Space held by snapshots · snapshots replication depends on · a retention rule · the scrub result · free capacity after the deletion',
      },
    ],
    commands: [
      {
        label: 'Snapshot usage',
        command: 'zfs list -o name,used,refer -t snapshot -s used | tail -20',
      },
      { label: 'Pool health', command: 'zpool status -v tank' },
    ],
  },
  {
    title: 'Dealing with Wi-Fi channel interference',
    tag: 'Wi-Fi',
    related: 'AP – Upstairs · 68% utilisation',
    lead: 'A high retry rate almost always traces back to a channel collision, not to coverage. Raising transmit power makes it worse.',
    sections: [
      {
        heading: 'What it means',
        body: 'Utilisation measures how busy the air is, including neighbouring networks.',
      },
      {
        heading: 'Why it is a risk',
        body: 'Retries cut effective bandwidth and raise latency across the whole cell.',
      },
      {
        heading: 'Checkpoints',
        body: 'A 24-hour channel measurement · the channels neighbouring networks use · a fixed channel plan · transmit power to medium · re-measure the retry rate',
      },
    ],
    commands: [
      { label: 'Channel occupancy', command: 'ssh admin@10.0.1.22 "mca-dump | grep -A3 channel"' },
    ],
  },
  {
    title: 'Measured, inferred and unverifiable data',
    tag: 'Method',
    related: 'Applies to the whole survey',
    lead: 'The application keeps the source of every relationship it shows. That is what decides whether a recommendation can be carried out, or whether a measurement has to come first.',
    sections: [
      {
        heading: 'Measured',
        body: 'API or SSH data read directly, with a timestamp. This data can form the basis of a decision.',
      },
      {
        heading: 'Inferred',
        body: 'A conclusion drawn from other data: a client-to-AP association, or a service identified by its port. Shown as a dashed line with an amber marker.',
      },
      {
        heading: 'Unverifiable',
        body: 'A claim the system cannot prove with its current access, such as whether a firewall rule actually takes effect. For these the application proposes a measurement, not a change.',
      },
    ],
    commands: [],
  },
];
