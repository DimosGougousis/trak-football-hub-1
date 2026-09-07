/**
 * supabase-js derives its storage key from the project URL's first hostname
 * label. vitest.config.ts pins VITE_SUPABASE_URL to https://test.supabase.co,
 * so the key is always sb-test-auth-token. Seeding a non-expired session here
 * means getSession() resolves from localStorage with no network call.
 */
const STORAGE_KEY = 'sb-test-auth-token'

export function signInAs(user: { id: string; email?: string }): void {
  const now = Math.floor(Date.now() / 1000)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email ?? `${user.id}@example.test`,
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(now * 1000).toISOString(),
      },
    }),
  )
}
