import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { MetadataLabel, LoadError } from '@/components/trak'
import { matchRating } from '@/lib/match-rating'

/* TRAK-185 part 1 (J4, 16 Oct live run): correct a logged match. The score
   and each player's goals, assists and card, saved for every player at once by
   edit_logged_match, which applies the logging rules again (consent, the
   coach's own players, goals and assists add up). No notice to families: they
   see the current score next time (Imad, 18 Oct). Removing a player ("Didn't
   play") is part 2. */

type Card = 'None' | 'Yellow' | 'Red'
interface Logged {
  user_id: string
  player_name: string | null
  position: string | null
  competition: string
  venue: string
  opponent: string | null
  goals: number | null
  assists: number | null
  card_received: string | null
  team_score: number
  opponent_score: number
  locked: boolean
}
interface Entry { goals: number; assists: number; card: Card }

const mono = { fontFamily: 'var(--t-font-mono)' }
const score = (text: string) => (text === '' ? NaN : Number(text))

export function MatchEditor({ sessionId, title, date }: { sessionId: string; title: string; date: string | null }) {
  const [rows, setRows] = useState<Logged[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [us, setUs] = useState('')
  const [them, setThem] = useState('')
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    let superseded = false
    setFailed(false)
    void supabase.rpc('logged_match' as never, { p_session_id: sessionId } as never).then(({ data, error }) => {
      if (superseded) return
      if (error) { setFailed(true); return }
      const logged = (data ?? []) as Logged[]
      setRows(logged)
      if (logged[0]) { setUs(String(logged[0].team_score)); setThem(String(logged[0].opponent_score)) }
      setEntries(Object.fromEntries(logged.map(r => [r.user_id, {
        goals: r.goals ?? 0, assists: r.assists ?? 0, card: (r.card_received as Card | null) ?? 'None',
      }])))
    })
    return () => { superseded = true }
  }, [sessionId, attempt])

  if (failed) return <LoadError what="this match" onRetry={() => setAttempt(n => n + 1)} retrying={false} />
  if (!rows) return <p role="status" className="text-[13px] text-ink-3">Loading the match…</p>
  const heading = (
    <>
      <p className="text-[16px] text-ink">{title}</p>
      {date && <p className="text-[11px] text-ink-3 mt-1" style={mono}>{date}</p>}
    </>
  )
  if (rows.length === 0) {
    return <div className="space-y-5">
      <div className="rounded-[18px] p-4 border border-line bg-surface">{heading}</div>
      <p className="text-[12px] text-ink-3">This match was logged before matches could be edited, so it stays as it is.</p>
    </div>
  }

  const teamScore = score(us), opponentScore = score(them)
  const editable = rows.filter(r => !r.locked)
  const locked = rows.filter(r => r.locked)
  const goals = editable.reduce((n, r) => n + entries[r.user_id].goals, 0)
  const assists = editable.reduce((n, r) => n + entries[r.user_id].assists, 0)
  // The same rules the database applies, said before the coach taps Save.
  const problem = Number.isNaN(teamScore) || Number.isNaN(opponentScore) ? 'Add both scores.'
    : goals > teamScore ? `${goals} goals entered, but the team scored ${teamScore}.`
    : assists > teamScore ? `${assists} assist${assists === 1 ? '' : 's'} entered, but the team scored ${teamScore}.`
    : locked.length > 0 ? 'A player is waiting for a parent, so this match can\'t be changed yet.'
    : null

  const set = (id: string, patch: Partial<Entry>) => setEntries(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  async function save() {
    if (problem || saving) return
    setSaving(true)
    setRefusal(null)
    const players = rows!.map(r => {
      const e = entries[r.user_id]
      return {
        user_id: r.user_id, goals: e.goals, assists: e.assists, card: e.card,
        computed_rating: matchRating({ position: r.position, competition: r.competition, venue: r.venue,
          opponent: r.opponent ?? '', scoreUs: teamScore, scoreThem: opponentScore, card: e.card, goals: e.goals, assists: e.assists }),
      }
    })
    const { error } = await supabase.rpc('edit_logged_match' as never, {
      p_session_id: sessionId, p_team_score: teamScore, p_opponent_score: opponentScore, p_players: players,
    } as never)
    setSaving(false)
    if (error) { setRefusal(error.message); return }
    toast.success('Match updated. Families see the new score next time they open it.')
  }

  const stepper = (r: Logged, key: 'goals' | 'assists') => {
    const name = r.player_name ?? 'this player'
    const value = entries[r.user_id][key]
    const step = 'w-9 h-9 rounded-full border border-line text-ink disabled:opacity-40'
    return (
      <div role="group" aria-label={`${key === 'goals' ? 'Goals' : 'Assists'} for ${name}`} className="flex items-center gap-2">
        <span className="text-[8px] tracking-[0.1em] uppercase text-ink-3 w-[44px]" style={mono}>{key.toUpperCase()}</span>
        <button type="button" className={step} aria-label={`One fewer ${key} for ${name}`} disabled={value === 0}
          onClick={() => set(r.user_id, { [key]: value - 1 })}>−</button>
        <span className="w-6 text-center text-[16px] text-ink">{value}</span>
        <button type="button" className={step} aria-label={`One more ${key} for ${name}`} disabled={value >= 20}
          onClick={() => set(r.user_id, { [key]: value + 1 })}>+</button>
      </div>
    )
  }

  const scoreBox = 'w-full bg-ground border border-line rounded-[12px] py-3 text-center text-[28px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <div className="space-y-5">
      <div className="rounded-[18px] p-4 border border-line bg-surface">
        {heading}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <label className="text-center">
            <span className="block text-[9px] tracking-[0.14em] uppercase text-ink-3 mb-2" style={mono}>US</span>
            <input aria-label="Team score" inputMode="numeric" value={us} className={scoreBox}
              onChange={e => setUs(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="text-center">
            <span className="block text-[9px] tracking-[0.14em] uppercase text-ink-3 mb-2" style={mono}>THEM</span>
            <input aria-label="Opponent score" inputMode="numeric" value={them} className={scoreBox}
              onChange={e => setThem(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        </div>
      </div>

      <div className="rounded-[18px] p-4 border border-line bg-surface space-y-4">
        <MetadataLabel text={`PLAYED · ${rows.length}`} />
        {editable.map(r => (
          <div key={r.user_id} className="space-y-2 pb-3 border-b border-line last:border-0 last:pb-0">
            <p className="text-[14px] font-medium text-ink">{r.player_name}</p>
            {stepper(r, 'goals')}
            {stepper(r, 'assists')}
            <div role="group" aria-label={`Card for ${r.player_name}`} className="flex items-center gap-2">
              <span className="text-[8px] tracking-[0.1em] uppercase text-ink-3 w-[44px]" style={mono}>CARD</span>
              {(['None', 'Yellow', 'Red'] as const).map(c => (
                <button key={c} type="button" aria-pressed={entries[r.user_id].card === c}
                  onClick={() => set(r.user_id, { card: c })}
                  className="px-2.5 py-1 rounded-full text-[11px] border border-line aria-pressed:border-primary aria-pressed:text-primary">
                  {c}
                </button>
              ))}
            </div>
          </div>
        ))}
        {locked.map(r => (
          <p key={r.user_id} className="text-[13px] text-ink-2">{r.player_name}: waiting for a parent, so not editable.</p>
        ))}
      </div>

      {problem && <p role="status" className="text-[12px] text-danger">{problem}</p>}
      {refusal && <p role="alert" className="text-[12px] text-danger">Not saved: {refusal}</p>}
      <p className="text-[11px] text-ink-3">Families aren't notified; they see the corrected match next time they open it.</p>
      <button type="button" onClick={() => void save()} disabled={!!problem || saving}
        className="w-full min-h-12 rounded-full bg-brand text-on-brand text-[15px] font-medium disabled:opacity-50">
        {saving ? 'Saving…' : 'Save match'}
      </button>
    </div>
  )
}
