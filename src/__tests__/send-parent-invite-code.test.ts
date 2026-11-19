// TRAK-482: "Send sign-in link" on a child's parent invitation names that child.
import { describe, expect, it, vi } from 'vitest';
import {
  handleInviteCodeRequest,
  type InviteCodeDependencies,
  type TokenInvite,
} from '../../supabase/functions/send-parent-invite-code/handler';

const token = '50000000-0000-4000-8000-000000000001';
const now = Date.parse('2026-11-19T00:00:00Z');
const pending: TokenInvite = {
  parent_email: 'Guardian@Example.test',
  status: 'pending',
  expires_at: '2026-11-25T00:00:00Z',
  player_user_id: '10000000-0000-0000-0000-000000000001',
};
const childLabel = {
  invited_as: 'parent', invited_by: 'player', player_first_name: 'Nikos',
  child_first_name: null, academy_name: null,
};

function dependencies(invite: TokenInvite | null = pending) {
  return {
    siteUrl: 'https://trakfootball.test/',
    now: () => now,
    findInvite: vi.fn<InviteCodeDependencies['findInvite']>().mockResolvedValue({ data: invite, error: null }),
    getPlayerName: vi.fn<InviteCodeDependencies['getPlayerName']>().mockResolvedValue('Nikos Synthetic'),
    sendInvite: vi.fn<InviteCodeDependencies['sendInvite']>().mockResolvedValue({ error: null }),
    labelAccount: vi.fn<InviteCodeDependencies['labelAccount']>().mockResolvedValue(undefined),
    sendMagicLink: vi.fn<InviteCodeDependencies['sendMagicLink']>().mockResolvedValue({ error: null }),
  };
}

const request = (body: unknown) => new Request('https://edge.example.test/send-parent-invite-code', {
  method: 'POST', body: JSON.stringify(body),
});
const nothingSent = (deps: ReturnType<typeof dependencies>) => {
  expect(deps.sendInvite).not.toHaveBeenCalled();
  expect(deps.labelAccount).not.toHaveBeenCalled();
  expect(deps.sendMagicLink).not.toHaveBeenCalled();
};

describe('TRAK-482: the code from a child\'s invitation names that child', () => {
  it('an existing account is labelled with the inviting child only, then gets the code', async () => {
    const deps = dependencies();
    deps.sendInvite.mockResolvedValue({ error: { message: 'A user with this email address has already been registered', code: 'email_exists' } });
    const response = await handleInviteCodeRequest(request({ token, email: ' guardian@example.TEST ' }), deps);
    expect(await response.json()).toEqual({ sent: true, via: 'magic_link' });
    expect(deps.labelAccount).toHaveBeenCalledWith('Guardian@Example.test', childLabel);
    expect(deps.sendMagicLink).toHaveBeenCalledWith('Guardian@Example.test', 'https://trakfootball.test/parent-invite');
    expect(deps.labelAccount.mock.invocationCallOrder[0]).toBeLessThan(deps.sendMagicLink.mock.invocationCallOrder[0]);
  });

  it('a parent with no account yet gets the invitation email naming the child, with its code', async () => {
    const deps = dependencies();
    const response = await handleInviteCodeRequest(request({ token, email: 'guardian@example.test' }), deps);
    expect(await response.json()).toEqual({ sent: true, via: 'invite' });
    expect(deps.sendInvite).toHaveBeenCalledWith('Guardian@Example.test', 'https://trakfootball.test/parent-invite', childLabel);
    expect(deps.sendMagicLink).not.toHaveBeenCalled();
  });

  it('a failed label still sends the code; an unread name says "Your child"', async () => {
    const deps = dependencies();
    deps.getPlayerName.mockRejectedValue(new Error('down'));
    deps.sendInvite.mockResolvedValue({ error: { message: 'User already registered' } });
    deps.labelAccount.mockRejectedValue(new Error('down'));
    const response = await handleInviteCodeRequest(request({ token, email: 'guardian@example.test' }), deps);
    expect(await response.json()).toEqual({ sent: true, via: 'magic_link' });
    expect(deps.labelAccount).toHaveBeenCalledWith('Guardian@Example.test', { ...childLabel, player_first_name: null });
  });

  it.each([
    ['another address', 'someone@example.test', pending],
    ['an unknown token', 'guardian@example.test', null],
    ['an expired invitation', 'guardian@example.test', { ...pending, expires_at: '2026-11-18T00:00:00Z' }],
    ['an accepted invitation', 'guardian@example.test', { ...pending, status: 'accepted' }],
  ])('%s: sends nothing and answers no_match, so the page sends a plain code', async (_label, email, invite) => {
    const deps = dependencies(invite as TokenInvite | null);
    const response = await handleInviteCodeRequest(request({ token, email }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: false, reason: 'no_match' });
    nothingSent(deps);
  });

  it.each([
    [{ token: 'not-a-token', email: 'guardian@example.test' }],
    [{ token, email: 'no-at-sign' }],
    [{ token, email: 'guardian@example.test', player_first_name: 'Someone' }],
  ])('refuses a malformed request without looking anything up', async body => {
    const deps = dependencies();
    const response = await handleInviteCodeRequest(request(body), deps);
    expect(response.status).toBe(400);
    expect(deps.findInvite).not.toHaveBeenCalled();
    nothingSent(deps);
  });

  it('a provider refusal is reported, with no address or provider message in the answer', async () => {
    const deps = dependencies();
    deps.sendInvite.mockResolvedValue({ error: { message: 'Rate limit for guardian@example.test' } });
    const response = await handleInviteCodeRequest(request({ token, email: 'guardian@example.test' }), deps);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/example\.test/i);
  });
});

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } }, SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_FUNCTIONS_URL: 'https://test.example',
}));

describe('TRAK-482: the page falls back to a plain code', () => {
  it.each([
    ['sent', { data: { sent: true, via: 'invite' }, error: null }, true],
    ['no match', { data: { sent: false, reason: 'no_match' }, error: null }, false],
    ['a function error', { data: null, error: new Error('500') }, false],
  ])('%s', async (_label, result, expected) => {
    const { sendInvitationCode } = await import('@/lib/parent-invites');
    invoke.mockResolvedValueOnce(result);
    expect(await sendInvitationCode(token, 'guardian@example.test')).toBe(expected);
    expect(invoke).toHaveBeenLastCalledWith('send-parent-invite-code', { body: { token, email: 'guardian@example.test' } });
  });

  it('a network failure', async () => {
    const { sendInvitationCode } = await import('@/lib/parent-invites');
    invoke.mockRejectedValueOnce(new Error('offline'));
    expect(await sendInvitationCode(token, 'guardian@example.test')).toBe(false);
  });
});
