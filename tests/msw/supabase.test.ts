import { describe, it, expect } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { server } from './server'
import { table, tableError } from './supabase'

describe('supabase MSW handlers', () => {
  it('returns rows for a list query', async () => {
    server.use(table('squad_players', [{ id: 's1', player_name: 'Ana' }]))
    const { data, error } = await supabase.from('squad_players').select('*')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: 's1', player_name: 'Ana' }])
  })

  it('returns a single object when the client asks for one', async () => {
    server.use(table('profiles', [{ id: 'p1', role: 'coach' }]))
    const { data } = await supabase.from('profiles').select('*').maybeSingle()
    expect(data).toEqual({ id: 'p1', role: 'coach' })
  })

  it('resolves maybeSingle to null when there are no rows', async () => {
    server.use(table('profiles', []))
    const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
    expect(data).toBeNull()
    expect(error).toBeNull()
  })

  it('surfaces a permission failure as an error, not an empty list', async () => {
    server.use(
      tableError('matches', 401, { code: '42501', message: 'permission denied' }),
    )
    const { data, error } = await supabase.from('matches').select('*')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})
