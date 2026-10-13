import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_LOCAL as functionWords, isUnmailableAddress as functionRule } from '../../supabase/functions/_shared/unmailable';
// @ts-expect-error plain .mjs, no types
import { PLACEHOLDER_LOCAL as loaderWords, isUnmailableAddress as loaderRule } from '../../scripts/synthetic-domain.mjs';

// TRAK-94: send-roster-invites (Deno) carries its own copy of the loader's
// rule (TRAK-93), since Edge Functions can't import scripts/. The two must
// answer the same for every case, or an address the loader refuses could still
// be emailed by the function, or the reverse.
const CASES = [
  // Reserved test domains (RFC 2606/6761): no mailbox exists.
  'parent.sami@rehearsal.trak.test', 'a@example.com', 'b@EXAMPLE.org', 'c@example.net', 'd@sub.example',
  'e@x.invalid', 'f@box.localhost', 'g@trak.test',
  // Placeholders copied from a doc: a stranger's real mailbox.
  'YOURNAME+ana@gmail.com', 'yourname@gmail.com', 'your.name@outlook.com', 'you@gmail.com', 'name@gmail.com',
  'email@hotmail.com', 'user@icloud.com', 'firstname.lastname@gmail.com', '<inbox>@gmail.com', '{parent}@gmail.com',
  ' YourName+x@Gmail.com ',
  // Real-looking addresses that must still go.
  'youssef@gmail.com', 'yourname-fc@gmail.com', 'ana.k@family.trakfootball.com', 'traktesting@outlook.com',
  'parent@trak.dev', 'coach@example.co', 'kid@child.trakfootball.com',
  // Odd input.
  '', 'no-at-sign', 'a@', '@example.com',
];

describe('the function and the loader refuse exactly the same addresses (TRAK-94)', () => {
  it.each(CASES)('%j', email => {
    expect(functionRule(email)).toBe(loaderRule(email));
  });

  it('the same placeholder words, all of them (a word added on one side only fails here)', () => {
    expect([...functionWords].sort()).toEqual([...(loaderWords as Set<string>)].sort());
    for (const word of loaderWords as Set<string>) expect(functionRule(`${word}+x@gmail.com`)).toBe(true);
  });

  it('CONTROL: the cases include both answers', () => {
    const answers = new Set(CASES.map(email => loaderRule(email)));
    expect(answers).toEqual(new Set([true, false]));
  });
});
