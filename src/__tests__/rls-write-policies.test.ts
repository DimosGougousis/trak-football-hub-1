import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the fix from 20260614000001.
 *
 * Every write policy on coach- and club-owned tables used to read
 *   WITH CHECK (coach_user_id = auth.uid())
 * which asks "are you claiming to be yourself?" but never "are you a coach?".
 * Signed in as an ordinary player it was therefore possible to insert coach
 * assessments and recognition awards about oneself — data that feeds the band,
 * Evolution Card, passport, parent view and club dashboard.
 *
 * These are static checks over the migration files. They cannot prove the live
 * database is correct (that was verified by hand against Supabase), but they do
 * fail if someone reintroduces an ownership-only write policy on these tables.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

/** Tables where a write must require the caller to hold a role, not just claim ownership. */
const ROLE_GUARDED: Record<string, string> = {
  coach_assessments: 'is_coach',
  recognition_awards: 'is_coach',
  squad_players: 'is_coach',
  coach_sessions: 'is_coach',
  coach_calendar_events: 'is_coach',
  organizations: 'is_club_admin',
}

interface Policy { name: string; table: string; op: string; body: string; file: string }

function loadPolicies(): Policy[] {
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  const created: Policy[] = []
  const dropped: { name: string; table: string; file: string }[] = []

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    const dropRe = /DROP POLICY IF EXISTS\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/gi
    for (let m; (m = dropRe.exec(sql)); ) {
      dropped.push({ name: m[1], table: m[2], file })
    }
    const createRe =
      /CREATE POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)\s+(?:AS\s+\w+\s+)?FOR\s+(INSERT|UPDATE|ALL)([\s\S]*?);/gi
    for (let m; (m = createRe.exec(sql)); ) {
      created.push({ name: m[1], table: m[2], op: m[3].toUpperCase(), body: m[4], file })
    }
  }

  // A policy is live if its newest CREATE is not followed by a later DROP.
  // A DROP in the same file counts as superseded, because migrations drop and
  // recreate a policy together to redefine it.
  return created.filter(p => {
    const lastCreate = created
      .filter(c => c.name === p.name && c.table === p.table)
      .map(c => c.file)
      .sort()
      .at(-1)!
    const lastDrop = dropped
      .filter(d => d.name === p.name && d.table === p.table)
      .map(d => d.file)
      .sort()
      .at(-1)
    return p.file === lastCreate && (!lastDrop || lastDrop <= lastCreate)
  })
}

describe('RLS write policies require a role, not just claimed ownership', () => {
  const live = loadPolicies()

  it('finds write policies to check', () => {
    expect(live.length).toBeGreaterThan(0)
  })

  for (const [table, guard] of Object.entries(ROLE_GUARDED)) {
    it(`${table}: every live INSERT/UPDATE policy calls ${guard}()`, () => {
      const writes = live.filter(p => p.table === table && ['INSERT', 'UPDATE', 'ALL'].includes(p.op))
      expect(writes.length, `no write policy found for ${table} — did it get renamed?`).toBeGreaterThan(0)

      for (const p of writes) {
        expect(
          p.body.includes(`${guard}()`),
          `Policy "${p.name}" on ${table} (${p.file}) permits a write without checking ${guard}(). ` +
            `An ownership-only check lets any authenticated user set the owner column to their own id.`,
        ).toBe(true)
      }
    })
  }

  it('get_profile_role is restricted to the caller', () => {
    // Must not be dropped: the "users can update own profile" policy relies on it
    // to pin role to its current value, which is what stops self-promotion.
    const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    let latest = ''
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
      const i = sql.indexOf('FUNCTION public.get_profile_role')
      if (i >= 0) latest = sql.slice(i, i + 600)
    }
    expect(latest, 'get_profile_role has been removed — profile role-change protection depends on it').not.toBe('')
    expect(
      latest.includes('auth.uid()'),
      'get_profile_role no longer restricts to the caller — it would leak any user’s role',
    ).toBe(true)
  })
})
