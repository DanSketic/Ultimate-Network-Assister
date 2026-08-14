export const port = (idx, neighbourMac, neighbourName, speed = 1000) => ({
  idx, name: '', up: true, enabled: true, speed, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac, neighbourName,
  neighbourPort: '', isUplink: false,
});

const dev = (mac, name, kind, uplinkMac, model, ports = []) => ({
  mac, name, model, kind, state: 1, ip: `192.168.11.${mac.length + 60}`, version: '6.6',
  uptimeSecs: 90000, clients: 5, uplinkMac, uplinkRemotePort: 0, uplinkLocalPort: 0, ports, radios: [],
});

// Listed the way a controller returns them: gateway, switches, then every
// access point â€” nowhere near the switch each one hangs off.
const devices = [
  dev('gw', 'Cloud Gateway', 'udm', '', 'UDMA6AB', [
    port(5, 'mini', 'USW Flex Mini'), port(3, 'sw1', 'USW Flex 2.5G'),
    port(4, 'nano', 'Nano HD'),
  ]),
  dev('mini', 'USW Flex Mini', 'usw', 'gw', 'USMINI', [port(5, 'gw', 'Cloud Gateway')]),
  dev('sw1', 'USW Flex 2.5G A', 'usw', 'gw', 'USWED', [
    port(2, 'gw', 'Cloud Gateway'), port(1, 'sw2', 'USW Flex 2.5G B'),
    port(7, 'achd', 'AC HD'), port(3, 'mesh', 'AC Mesh'),
  ]),
  dev('sw2', 'USW Flex 2.5G B', 'usw', 'sw1', 'USWE', [port(4, 'sw1', 'USW Flex 2.5G A')]),
  // Uplinked straight to the gateway: the cable that skips the switch row.
  dev('nano', 'Nano HD', 'uap', 'gw', 'U7NHD'),
  dev('achd', 'AC HD', 'uap', 'sw1', 'U7HD'),
  dev('mesh', 'AC Mesh', 'uap', 'sw1', 'U7MSH'),
];

export const snapshot = {
  id: 's', startedAt: '', finishedAt: '2026-08-13T10:00:00Z', log: [], errors: [],
  proxmox: {
    version: '9.2',
    nodes: [{ name: 'pve', status: 'online', cpuRatio: 0.2, cpuCount: 8,
      memUsed: 8e9, memTotal: 32e9, uptimeSecs: 90000 }],
    // Two stores, two rows below their host.
    storages: [
      { node: 'pve', name: 'local-lvm', kind: 'lvmthin', total: 4e11, used: 1e11,
        available: 3e11, enabled: true, content: 'images,rootdir', active: true },
      { node: 'pve', name: 'local', kind: 'dir', total: 1e11, used: 2e10,
        available: 8e10, enabled: true, content: 'backup,iso', active: true },
    ],
    guests: [{ vmid: 100, name: 'CT100', kind: 'lxc', node: 'pve', status: 'stopped',
      cpuCount: 2, memTotal: 2e9, diskTotal: 8e9, tags: '' }],
    interfaces: [], disks: [], backupJobs: [], backupFiles: [], certificates: [], updates: [], updatesReadable: false,
  },
  unifi: {
    site: 'default', devices, networks: [], wlans: [], firewallRules: [],
    clients: [
      { mac: 'c1', hostname: 'phone', ip: '192.168.14.50', network: 'LAN', vlan: null,
        wired: false, apMac: 'achd', oui: 'Apple' },
      { mac: 'c2', hostname: 'tv', ip: '192.168.14.51', network: 'LAN', vlan: null,
        wired: false, apMac: 'mesh', oui: 'Samsung' },
      { mac: 'c3', hostname: 'laptop', ip: '192.168.14.52', network: 'LAN', vlan: null,
        wired: false, apMac: 'nano', oui: 'Dell' },
    ],
    portProfiles: [],
  },
};


