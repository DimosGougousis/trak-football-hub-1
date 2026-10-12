// TRAK-94: never email a reserved test address (no mailbox exists) or a
// placeholder copied from a doc (a stranger's mailbox). A copy of
// scripts/synthetic-domain.mjs's isUnmailableAddress (TRAK-93), since Edge
// Functions can't import scripts/; src/__tests__/unmailable-parity.test.ts
// keeps the two answering the same. Change both together.

function isSyntheticDomain(domain: string): boolean {
  const d = String(domain).trim().toLowerCase();
  return ['example.com', 'example.org', 'example.net'].includes(d)
    || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(example|test|invalid|localhost)$/.test(d);
}

const isSyntheticAddress = (email: string | null | undefined) => isSyntheticDomain(String(email ?? '').split('@').pop() ?? '');

export const PLACEHOLDER_LOCAL = new Set([
  'yourname', 'your.name', 'your_name', 'your-name', 'youremail', 'your.email', 'your_email',
  'yourinbox', 'your.inbox', 'you', 'name', 'email', 'inbox', 'user', 'username',
  'firstname', 'lastname', 'firstname.lastname', 'first.last', 'someone',
]);

function isPlaceholderAddress(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase();
  if (/[<>{}[\]]/.test(e)) return true;
  return PLACEHOLDER_LOCAL.has(e.split('@')[0].split('+')[0]);
}

/** Never email this: a reserved test address or a placeholder. */
export const isUnmailableAddress = (email: string | null | undefined) => isSyntheticAddress(email) || isPlaceholderAddress(email);
