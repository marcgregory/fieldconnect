/**
 * Tiny class-name joiner. Filters out falsy values and joins the rest with a
 * single space. Avoids pulling in a runtime dependency on clsx/tailwind-merge.
 *
 *   cn('px-2', isActive && 'bg-brand-600', className)
 */
export type ClassValue = string | number | null | boolean | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter((v) => typeof v === 'string' && v.length > 0).join(' ');
}
