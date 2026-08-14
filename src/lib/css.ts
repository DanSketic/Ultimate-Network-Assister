import type { CSSProperties } from 'react';

/**
 * React's CSSProperties does not accept custom properties, so setting one
 * needs a cast. Doing it here keeps the cast out of the components.
 */
export function vars(
  custom: Record<`--${string}`, string | number | undefined>,
  rest?: CSSProperties,
): CSSProperties {
  return { ...rest, ...custom } as CSSProperties;
}

/** Joins class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
