/**
 * One way to write an email address.
 *
 * This exists because it didn't: `register` stored whatever the user typed
 * while `googleSignIn` lowercased. Signing up as "Bob@x.com" and later using
 * "Sign in with Google" produced two rows for one person — and made an admin
 * grant land on the account you weren't logged into.
 *
 * Every path that looks a user up by email must go through this.
 */
export function normalizeEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

/** true when two addresses are the same account */
export function sameEmail(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}
