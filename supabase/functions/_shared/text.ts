// Text measures shared by the Edge Functions.

/**
 * Length in bytes when encoded as UTF-8, the way Supabase Auth stores a password: å, ä and ö count
 * as two. The same as utf8Length in src/lib/validation.ts, which the forms check first.
 */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}
