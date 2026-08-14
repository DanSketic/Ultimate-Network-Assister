import type { BackupJob, ConnectionProfile, ScanLogEntry, SshCommand } from './model';

/** English demo operations data — same estate as operations.ts. */

export const PROFILES_EN: ConnectionProfile[] = [
  {
    name: 'Proxmox VE · pve01',
    url: 'https://10.0.1.10:8006 · API token',
    mode: 'Read-only',
    status: 'ok',
    lastRun: 'today 08:14',
  },
  {
    name: 'UniFi Network · Home',
    url: 'https://10.0.1.12 · site "home"',
    mode: 'Read-only',
    status: 'ok',
    lastRun: 'today 08:14',
  },
  {
    name: 'SSH · pve01',
    url: 'root@10.0.1.10 · key based',
    mode: 'Host key verified',
    status: 'ok',
    lastRun: 'today 07:52',
  },
  {
    name: 'SSH · gateway',
    url: 'admin@10.0.1.1 · key based',
    mode: 'Host key not verified',
    status: 'warn',
    lastRun: '—',
  },
];

export const SCAN_LOG_EN: ScanLogEntry[] = [
  { time: '08:14:02', source: 'proxmox', message: 'GET /nodes → 1 node (pve01)' },
  { time: '08:14:03', source: 'proxmox', message: 'GET /nodes/pve01/storage → 3 stores (local, local-lvm, tank)' },
  { time: '08:14:05', source: 'proxmox', message: 'GET /cluster/resources → 4 VMs, 7 LXC' },
  { time: '08:14:09', source: 'unifi', message: 'GET /stat/device → 5 devices (1 offline)' },
  { time: '08:14:11', source: 'unifi', message: 'GET /rest/networkconf → 5 networks, 6 VLANs' },
  { time: '08:14:13', source: 'unifi', message: 'GET /rest/firewallrule → 9 rules' },
  { time: '08:14:16', source: 'unifi', message: 'GET /stat/sta → 38 clients (3 unidentified)' },
  { time: '08:14:19', source: 'analysis', message: '6 deviations and risks identified, 4 links remain inferred' },
];

export const BACKUPS_EN: BackupJob[] = [
  {
    name: 'UniFi site backup',
    target: 'LXC 101 → tank + local',
    schedule: 'daily 03:00',
    lastRun: 'today 03:00',
    retention: '7 days',
    evidence: 'Igazolt',
  },
  {
    name: 'pve01 configuration',
    target: 'SSH backup → local',
    schedule: 'daily 04:00',
    lastRun: 'today 04:00',
    retention: '14 days',
    evidence: 'Igazolt',
  },
  {
    name: 'VM 201 · Home Assistant',
    target: 'vzdump → tank',
    schedule: 'weekly, Sunday',
    lastRun: '4 days ago',
    retention: '4 copies',
    evidence: 'Igazolt',
  },
  {
    name: 'VM 202 · Docker host',
    target: 'vzdump → tank',
    schedule: 'weekly, Sunday',
    lastRun: '4 days ago',
    retention: '2 copies',
    evidence: 'Részleges',
  },
  {
    name: 'GitLab volumes',
    target: '—',
    schedule: 'Not scheduled',
    lastRun: '—',
    retention: '—',
    evidence: 'Hiányzik',
  },
  {
    name: 'tank → offsite',
    target: 'ZFS send/recv',
    schedule: 'daily 02:00',
    lastRun: '5 days ago',
    retention: '30 days',
    evidence: 'Elavult',
  },
];

export const SSH_COMMANDS_EN: SshCommand[] = [
  { label: 'Proxmox version and packages', command: 'pveversion -v', host: 'pve01' },
  { label: 'Storage status', command: 'pvesm status', host: 'pve01' },
  { label: 'VM and LXC list', command: 'qm list; pct list', host: 'pve01' },
  { label: 'Network interfaces', command: 'ip -br a; cat /etc/network/interfaces', host: 'pve01' },
  {
    label: 'ZFS pool health',
    command: 'zpool status tank; zfs list -t snapshot | tail -20',
    host: 'pve01',
  },
  {
    label: 'Firewall status on the host',
    command: 'pve-firewall status; iptables -S | head -40',
    host: 'pve01',
  },
];

export const SSH_OUTPUT_NOTE_EN = '— output saved to: reports/pve01-2026-08-06.txt';

export const SSH_FINGERPRINT_EN = 'SHA256:9c2f…a41d · first seen 2026-04-12 · unchanged';

export const CHECKPOINTS_EN = [
  { label: 'VM 202 · pre-change', when: 'today 08:20' },
  { label: 'LXC 101 · pre-upgrade', when: '3 days ago' },
  { label: 'Site backup · manual', when: '3 days ago' },
];

export const RESTORE_TEST_NOTE_EN =
  'The last verified restore was on the Home Assistant VM. The GitLab volumes have never been tested.';

export const CAPACITY_EN = [
  { label: 'tank (ZFS)', value: '6.9 / 8 TB', percent: 87, tone: 'bad' as const },
  { label: 'local-lvm (pve01)', value: '78%', percent: 78, tone: 'warn' as const },
  { label: 'pve01 memory', value: '41 / 64 GB', percent: 64, tone: 'accent' as const },
  { label: 'WAN utilisation', value: '412 / 1000 Mb/s', percent: 41, tone: 'accent' as const },
];

export const STATS_EN = [
  { label: 'Network devices', value: '24', hint: '21 online · 2 errors · 1 unknown' },
  { label: 'VMs and LXC', value: '11', hint: '4 VMs · 7 containers' },
  { label: 'Services', value: '14', hint: '11 measured · 3 inferred' },
  {
    label: 'Open risks',
    value: '6',
    hint: '2 critical · 3 attention · 1 note',
    tone: 'warn' as const,
  },
  { label: 'Backup coverage', value: '72', suffix: '%', hint: 'with verified evidence' },
];
