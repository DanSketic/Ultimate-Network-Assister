/*
 * Addresses and the ranges that contain them.
 *
 * Split out because two different guards depend on getting this exactly right,
 * and both were previously comparing the first three octets — which is correct
 * for a /24 and quietly wrong for everything else. A guard that decides whether
 * a change can cut your own connection must not be approximating.
 */

/**
 * The network address a subnet string describes, as a comparable key.
 *
 * The controller stores a network by its gateway — `192.168.40.1/24` — while
 * other things that create networks write the network address. Both name the
 * same range, and comparing the strings would call them different.
 */
export function rangeOf(subnet: string): string | null {
  const [address, prefixText] = subnet.trim().split('/');
  const value = addressValue(address ?? '');
  if (value === null) return null;
  const prefix = Number(prefixText);
  const bits = Number.isInteger(prefix) && prefix >= 0 && prefix <= 32 ? prefix : 32;
  return `${(value & maskOf(bits)) >>> 0}/${bits}`;
}

/** True when both strings name the same range, whichever way each is spelled. */
export function sameRange(a: string | undefined, b: unknown): boolean {
  if (!a || typeof b !== 'string') return false;
  const left = rangeOf(a);
  return left !== null && left === rangeOf(b);
}

/**
 * True when `address` falls inside `subnet`.
 *
 * Masked properly rather than compared octet by octet: a /22 holds four /24s,
 * and a guard that missed three of them would be a guard that lets the change
 * carrying your session through.
 */
export function containsAddress(subnet: string, address: string): boolean {
  const [network, prefixText] = subnet.trim().split('/');
  const net = addressValue(network ?? '');
  const host = addressValue(address);
  if (net === null || host === null) return false;
  const prefix = Number(prefixText);
  const bits = Number.isInteger(prefix) && prefix >= 0 && prefix <= 32 ? prefix : 32;
  const mask = maskOf(bits);
  return ((net & mask) >>> 0) === ((host & mask) >>> 0);
}

function addressValue(address: string): number | null {
  const octets = address.trim().split('.').map(Number);
  if (octets.length !== 4) return null;
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

function maskOf(bits: number): number {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}
