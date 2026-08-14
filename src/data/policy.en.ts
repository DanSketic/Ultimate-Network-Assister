import type { FirewallRule, SecuritySignal, Zone } from './model';

/** English demo policy — same zones and rules as policy.ts, in English. */

export const ZONES_EN: Zone[] = [
  { vlan: '1', name: 'Management', net: '10.0.1.0/24', ssid: '—', devices: 9, isolation: 'Full access', state: 'Felmért' },
  { vlan: '10', name: 'Trusted LAN', net: '10.0.10.0/24', ssid: 'Home', devices: 14, isolation: 'Partial', state: 'Felmért' },
  { vlan: '20', name: 'IoT', net: '10.0.20.0/24', ssid: 'Home-IoT', devices: 24, isolation: 'Isolated', state: 'Nem ellenőrzött' },
  { vlan: '30', name: 'Guest', net: '10.0.30.0/24', ssid: 'Guest', devices: 6, isolation: 'Fully isolated', state: 'Felmért' },
  { vlan: '40', name: 'Servers', net: '10.0.40.0/24', ssid: '—', devices: 11, isolation: 'Controlled', state: 'Felmért' },
  { vlan: '50', name: 'Cameras', net: '10.0.50.0/24', ssid: '—', devices: 4, isolation: 'Isolated', state: 'Nem ellenőrzött' },
];

export const RULES_EN: FirewallRule[] = [
  { src: 'Mgmt', dst: 'Every zone', port: 'any', action: 'Engedélyez', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'Trusted', dst: 'Servers', port: '443, 8443, 8123', action: 'Engedélyez', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'Trusted', dst: 'IoT', port: 'any', action: 'Engedélyez', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'IoT', dst: 'Trusted', port: 'any', action: 'Tilt', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'IoT', dst: 'Servers', port: '8123, 1883', action: 'Engedélyez', state: 'Nem ellenőrzött', checkedAt: '—' },
  { src: 'IoT', dst: 'Internet', port: '443, 123', action: 'Engedélyez', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'Guest', dst: 'Every internal zone', port: 'any', action: 'Tilt', state: 'Felmért', checkedAt: 'today 08:14' },
  { src: 'Servers', dst: 'IoT', port: '53', action: 'Engedélyez', state: 'Becsült', checkedAt: '—' },
  { src: 'Cameras', dst: 'Internet', port: 'any', action: 'Tilt', state: 'Nem ellenőrzött', checkedAt: '—' },
];

export const SIGNALS_EN: SecuritySignal[] = [
  {
    severity: 'bad',
    title: 'The IoT → Servers rule is unverified',
    text: 'Home Assistant answers from the Trusted zone as well, and no survey proves the rule actually takes effect.',
    zone: 'IoT',
  },
  {
    severity: 'warn',
    title: 'Outbound traffic from the camera zone is unproven',
    text: 'There is no evidence that the cameras genuinely cannot reach the internet.',
    zone: 'Cameras',
  },
  {
    severity: 'warn',
    title: 'Nextcloud is public without a WAF',
    text: '443/tcp is reachable from outside, with no application-layer protection in the chain.',
    zone: 'Servers',
  },
  {
    severity: 'info',
    title: 'IDS/IPS is disabled on the gateway',
    text: 'Turning it on raises CPU load; test it inside a maintenance window.',
    zone: 'WAN',
  },
];
