import type { Lang } from '@/i18n';
import type { Tone } from '@/lib/palette';
import type { FirewallRule, MatrixCell, SecuritySignal, Zone } from './model';
import { RULES_EN, SIGNALS_EN, ZONES_EN } from './policy.en';

export const ZONES: Zone[] = [
  { vlan: '1', name: 'Management', net: '10.0.1.0/24', ssid: '—', devices: 9, isolation: 'Teljes hozzáférés', state: 'Felmért' },
  { vlan: '10', name: 'Trusted LAN', net: '10.0.10.0/24', ssid: 'Otthon', devices: 14, isolation: 'Részleges', state: 'Felmért' },
  { vlan: '20', name: 'IoT', net: '10.0.20.0/24', ssid: 'Otthon-IoT', devices: 24, isolation: 'Izolált', state: 'Nem ellenőrzött' },
  { vlan: '30', name: 'Guest', net: '10.0.30.0/24', ssid: 'Vendég', devices: 6, isolation: 'Teljes izoláció', state: 'Felmért' },
  { vlan: '40', name: 'Servers', net: '10.0.40.0/24', ssid: '—', devices: 11, isolation: 'Szabályozott', state: 'Felmért' },
  { vlan: '50', name: 'Cameras', net: '10.0.50.0/24', ssid: '—', devices: 4, isolation: 'Izolált', state: 'Nem ellenőrzött' },
];

/**
 * Zone reachability. Row = source, column = destination, both indexed the same
 * way as ZONES.
 */
export const ZONE_MATRIX: MatrixCell[][] = [
  ['a', 'a', 'a', 'a', 'a', 'a'],
  ['b', 'a', 'l', 'b', 'l', 'u'],
  ['b', 'b', 'a', 'b', 'u', 'b'],
  ['b', 'b', 'b', 'a', 'b', 'b'],
  ['b', 'l', 'l', 'b', 'a', 'l'],
  ['b', 'b', 'b', 'b', 'u', 'a'],
];

export const MATRIX_TONE: Record<MatrixCell, Tone> = {
  a: 'ok',
  b: 'bad',
  l: 'warn',
  u: 'idle',
};

export const MATRIX_LABEL: Record<MatrixCell, string> = {
  a: 'Engedélyez',
  b: 'Tilt',
  l: 'Korlátozott',
  u: 'Nem ellenőrzött',
};

export const RULES: FirewallRule[] = [
  { src: 'Mgmt', dst: 'Minden zóna', port: 'minden', action: 'Engedélyez', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'Trusted', dst: 'Servers', port: '443, 8443, 8123', action: 'Engedélyez', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'Trusted', dst: 'IoT', port: 'minden', action: 'Engedélyez', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'IoT', dst: 'Trusted', port: 'minden', action: 'Tilt', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'IoT', dst: 'Servers', port: '8123, 1883', action: 'Engedélyez', state: 'Nem ellenőrzött', checkedAt: '—' },
  { src: 'IoT', dst: 'Internet', port: '443, 123', action: 'Engedélyez', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'Guest', dst: 'Minden belső', port: 'minden', action: 'Tilt', state: 'Felmért', checkedAt: 'ma 08:14' },
  { src: 'Servers', dst: 'IoT', port: '53', action: 'Engedélyez', state: 'Becsült', checkedAt: '—' },
  { src: 'Cameras', dst: 'Internet', port: 'minden', action: 'Tilt', state: 'Nem ellenőrzött', checkedAt: '—' },
];

export const SIGNALS: SecuritySignal[] = [
  {
    severity: 'bad',
    title: 'IoT → Servers szabály nem ellenőrzött',
    text: 'A Home Assistant elérhető a Trusted zónából is, de a szabály tényleges érvényesülése nem igazolt felméréssel.',
    zone: 'IoT',
  },
  {
    severity: 'warn',
    title: 'Kamera zóna kimenő forgalma nem igazolt',
    text: 'Nincs bizonyíték arra, hogy a kamerák valóban nem érik el az internetet.',
    zone: 'Cameras',
  },
  {
    severity: 'warn',
    title: 'Nextcloud publikus, WAF nélkül',
    text: 'A 443/tcp kívülről elérhető, alkalmazásréteg-védelem nincs a láncban.',
    zone: 'Servers',
  },
  {
    severity: 'info',
    title: 'IDS/IPS kikapcsolva az átjárón',
    text: 'Bekapcsolása CPU-terhelést növel; teszteld karbantartási ablakban.',
    zone: 'WAN',
  },
];

export function demoZones(lang: Lang): Zone[] {
  return lang === 'en' ? ZONES_EN : ZONES;
}

export function demoRules(lang: Lang): FirewallRule[] {
  return lang === 'en' ? RULES_EN : RULES;
}

export function demoSignals(lang: Lang): SecuritySignal[] {
  return lang === 'en' ? SIGNALS_EN : SIGNALS;
}

/** Colour for the evidence chip attached to a rule or zone. */
export function provenanceTone(state: string): Tone {
  if (state === 'Felmért') return 'ok';
  if (state === 'Becsült') return 'warn';
  return 'bad';
}
