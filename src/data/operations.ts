import type { Lang } from '@/i18n';
import type { BackupJob, ConnectionProfile, ScanLogEntry, SshCommand } from './model';
import {
  BACKUPS_EN,
  CAPACITY_EN,
  CHECKPOINTS_EN,
  PROFILES_EN,
  STATS_EN,
  RESTORE_TEST_NOTE_EN,
  SCAN_LOG_EN,
  SSH_COMMANDS_EN,
  SSH_FINGERPRINT_EN,
  SSH_OUTPUT_NOTE_EN,
} from './operations.en';

export const PROFILES: ConnectionProfile[] = [
  {
    name: 'Proxmox VE · pve01',
    url: 'https://10.0.1.10:8006 · API token',
    mode: 'Csak olvasás',
    status: 'ok',
    lastRun: 'ma 08:14',
  },
  {
    name: 'UniFi Network · Otthon',
    url: 'https://10.0.1.12 · site "otthon"',
    mode: 'Csak olvasás',
    status: 'ok',
    lastRun: 'ma 08:14',
  },
  {
    name: 'SSH · pve01',
    url: 'root@10.0.1.10 · kulcs alapú',
    mode: 'Host-kulcs ellenőrizve',
    status: 'ok',
    lastRun: 'ma 07:52',
  },
  {
    name: 'SSH · gateway',
    url: 'admin@10.0.1.1 · kulcs alapú',
    mode: 'Host-kulcs nem ellenőrzött',
    status: 'warn',
    lastRun: '—',
  },
];

export const SCAN_LOG: ScanLogEntry[] = [
  { time: '08:14:02', source: 'proxmox', message: 'GET /nodes → 1 csomópont (pve01)' },
  { time: '08:14:03', source: 'proxmox', message: 'GET /nodes/pve01/storage → 3 tároló (local, local-lvm, tank)' },
  { time: '08:14:05', source: 'proxmox', message: 'GET /cluster/resources → 4 VM, 7 LXC' },
  { time: '08:14:09', source: 'unifi', message: 'GET /stat/device → 5 eszköz (1 offline)' },
  { time: '08:14:11', source: 'unifi', message: 'GET /rest/networkconf → 5 hálózat, 6 VLAN' },
  { time: '08:14:13', source: 'unifi', message: 'GET /rest/firewallrule → 9 szabály' },
  { time: '08:14:16', source: 'unifi', message: 'GET /stat/sta → 38 kliens (3 nem azonosított)' },
  { time: '08:14:19', source: 'elemzés', message: '6 eltérés és kockázat azonosítva, 4 kapcsolat becsült marad' },
];

export const BACKUPS: BackupJob[] = [
  {
    name: 'UniFi site backup',
    target: 'LXC 101 → tank + helyi',
    schedule: 'naponta 03:00',
    lastRun: 'ma 03:00',
    retention: '7 nap',
    evidence: 'Igazolt',
  },
  {
    name: 'pve01 konfiguráció',
    target: 'SSH mentés → helyi',
    schedule: 'naponta 04:00',
    lastRun: 'ma 04:00',
    retention: '14 nap',
    evidence: 'Igazolt',
  },
  {
    name: 'VM 201 · Home Assistant',
    target: 'vzdump → tank',
    schedule: 'heti vasárnap',
    lastRun: '4 napja',
    retention: '4 példány',
    evidence: 'Igazolt',
  },
  {
    name: 'VM 202 · Docker host',
    target: 'vzdump → tank',
    schedule: 'heti vasárnap',
    lastRun: '4 napja',
    retention: '2 példány',
    evidence: 'Részleges',
  },
  {
    name: 'GitLab kötetek',
    target: '—',
    schedule: 'Nincs ütemezve',
    lastRun: '—',
    retention: '—',
    evidence: 'Hiányzik',
  },
  {
    name: 'tank → offsite',
    target: 'ZFS send/recv',
    schedule: 'naponta 02:00',
    lastRun: '5 napja',
    retention: '30 nap',
    evidence: 'Elavult',
  },
];

/** Read-only by construction: nothing here changes state on the target host. */
export const SSH_COMMANDS: SshCommand[] = [
  { label: 'Proxmox verzió és csomagok', command: 'pveversion -v', host: 'pve01' },
  { label: 'Tárolók állapota', command: 'pvesm status', host: 'pve01' },
  { label: 'VM és LXC lista', command: 'qm list; pct list', host: 'pve01' },
  { label: 'Hálózati interfészek', command: 'ip -br a; cat /etc/network/interfaces', host: 'pve01' },
  {
    label: 'ZFS pool egészség',
    command: 'zpool status tank; zfs list -t snapshot | tail -20',
    host: 'pve01',
  },
  {
    label: 'Tűzfal állapot a hoston',
    command: 'pve-firewall status; iptables -S | head -40',
    host: 'pve01',
  },
];

/** Canned output for the selected command, as captured by the last run. */
export const SSH_SAMPLE_OUTPUT = [
  'proxmox-ve: 8.2.0 (running kernel: 6.8.12-2-pve)',
  'pve-manager: 8.2.4 (running version: 8.2.4/faa83925c9641325)',
  'ceph-fuse: residual config',
  'zfsutils-linux: 2.2.4-pve1',
];

export const SSH_OUTPUT_NOTE = '— a kimenet mentve: reports/pve01-2026-08-06.txt';

export const SSH_FINGERPRINT = 'SHA256:9c2f…a41d · először látva 2026-04-12 · változatlan';

export const CHECKPOINTS = [
  { label: 'VM 202 · pre-change', when: 'ma 08:20' },
  { label: 'LXC 101 · pre-upgrade', when: '3 napja' },
  { label: 'Site backup · manuális', when: '3 napja' },
];

export const RESTORE_TEST_NOTE =
  'Az utolsó igazolt visszatöltés a Home Assistant VM-en történt. A GitLab kötetekre nincs próba.';

export const CAPACITY = [
  { label: 'tank (ZFS)', value: '6,9 / 8 TB', percent: 87, tone: 'bad' as const },
  { label: 'local-lvm (pve01)', value: '78%', percent: 78, tone: 'warn' as const },
  { label: 'pve01 memória', value: '41 / 64 GB', percent: 64, tone: 'accent' as const },
  { label: 'WAN kihasználtság', value: '412 / 1000 Mb/s', percent: 41, tone: 'accent' as const },
];

export const STATS = [
  { label: 'Hálózati eszköz', value: '24', hint: '21 online · 2 hiba · 1 ismeretlen' },
  { label: 'VM és LXC', value: '11', hint: '4 VM · 7 konténer' },
  { label: 'Szolgáltatás', value: '14', hint: '11 felmért · 3 becsült' },
  {
    label: 'Nyitott kockázat',
    value: '6',
    hint: '2 kritikus · 3 figyelem · 1 megjegyzés',
    tone: 'warn' as const,
  },
  { label: 'Mentési lefedettség', value: '72', suffix: '%', hint: 'igazolt bizonyítékkal' },
];

/* ------------------------------------------------------- language selection */

export function demoCapacity(lang: Lang): typeof CAPACITY {
  return lang === 'en' ? CAPACITY_EN : CAPACITY;
}

export function demoStats(lang: Lang): typeof STATS {
  return lang === 'en' ? STATS_EN : STATS;
}

export function demoProfiles(lang: Lang): ConnectionProfile[] {
  return lang === 'en' ? PROFILES_EN : PROFILES;
}

export function demoScanLog(lang: Lang): ScanLogEntry[] {
  return lang === 'en' ? SCAN_LOG_EN : SCAN_LOG;
}

export function demoBackups(lang: Lang): BackupJob[] {
  return lang === 'en' ? BACKUPS_EN : BACKUPS;
}

export function demoSshCommands(lang: Lang): SshCommand[] {
  return lang === 'en' ? SSH_COMMANDS_EN : SSH_COMMANDS;
}

export function demoSshOutputNote(lang: Lang): string {
  return lang === 'en' ? SSH_OUTPUT_NOTE_EN : SSH_OUTPUT_NOTE;
}

export function demoSshFingerprint(lang: Lang): string {
  return lang === 'en' ? SSH_FINGERPRINT_EN : SSH_FINGERPRINT;
}

export function demoCheckpoints(lang: Lang): Array<{ label: string; when: string }> {
  return lang === 'en' ? CHECKPOINTS_EN : CHECKPOINTS;
}

export function demoRestoreTestNote(lang: Lang): string {
  return lang === 'en' ? RESTORE_TEST_NOTE_EN : RESTORE_TEST_NOTE;
}
