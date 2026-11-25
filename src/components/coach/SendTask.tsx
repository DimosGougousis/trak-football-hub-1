import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/arc/button/button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Select } from '@/components/arc/select/select'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { useSquadRoster } from '@/components/coach/squad/useSquadRoster'
import { useCoachSquad } from '@/lib/coach-squad'
import { localTodayISO } from '@/lib/event-time'
import { dateAsDay, dayAsDate } from '@/lib/coach-events'
import { currentLanguage, useTranslation } from '@/lib/i18n'

/* Coach–player P18 (Makis's PR list of 23 Nov): from "+", the coach sends a task by hand to the whole squad or one
   player on it, asking for Got it, Done or Ready for review by a day. create_task (TRAK-578) checks the rest and turns
   the day into the academy's midnight; the player sees it in My tasks (TRAK-579). A player waiting for consent isn't
   offered, since the database would refuse them. Nothing here or anywhere counts who answered. */

const SQUAD = 'squad'
const field = 'w-full rounded-xl border border-line bg-ground px-3 py-2.5 text-[16px] text-ink placeholder-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function SendTask({ className, onSent }: { className?: string; onSent: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const roster = useSquadRoster({ everySquad: true })
  const picked = useCoachSquad(user?.id).squad
  const [squadPick, setSquadPick] = useState<string>()
  const squad = squadPick ?? picked ?? roster.squads[0] ?? ''
  const [to, setTo] = useState(SQUAD)
  const [kind, setKind] = useState('got_it')
  const [what, setWhat] = useState('')
  const [day, setDay] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const players = roster.players.filter(p => p.status === 'active' && p.age_group?.trim() === squad && !roster.consentPending.has(p.id))
  const change = <T,>(set: (value: T) => void) => (value: T) => { set(value); setError(null) }

  const send = async () => {
    if (!what.trim()) { setError(t('coachTasks:needWhat')); return }
    if (!day) { setError(t('coachTasks:needDay')); return }
    setSending(true)
    const { error: failed } = await supabase.rpc('create_task', {
      p_squad: squad, p_squad_player_id: to === SQUAD ? null : to, p_answer_kind: kind, p_title: what.trim(), p_due_on: day,
    })
    setSending(false)
    if (failed) { setError(t('coachTasks:couldntSend')); return }
    toast.success(t('coachTasks:sentTo', { who: to === SQUAD ? squad : players.find(p => p.id === to)?.player_name ?? '' }))
    onSent()
  }

  return (
    <div className={className}>
      {roster.squads.length >= 2 && <div className="arc-trak-field grid gap-1.5">
        <span aria-hidden="true">{t('nav:squad')}</span>
        <SegmentedControl label={t('nav:squad')} value={squad} onValueChange={change(v => { setSquadPick(v); setTo(SQUAD) })}
          options={roster.squads.map(s => ({ value: s, label: s }))} />
      </div>}
      {/* The small field label as the other fields have it; Select's own label stays for screen readers. */}
      <div className="arc-trak-field grid gap-1.5 [&>div>label]:sr-only">
        <span aria-hidden="true">{t('coachTasks:to')}</span>
        <Select label={t('coachTasks:to')} value={to} onValueChange={change(setTo)}
          options={[{ value: SQUAD, label: t('coachTasks:wholeSquad') }, ...players.map(p => ({ value: p.id, label: p.player_name }))]} />
      </div>
      <div className="arc-trak-field grid gap-1.5">
        <span aria-hidden="true">{t('coachTasks:answer')}</span>
        <SegmentedControl label={t('coachTasks:answer')} value={kind} onValueChange={change(setKind)} options={[
          { value: 'got_it', label: t('coachTasks:gotIt') }, { value: 'done', label: t('coachTasks:done') },
          { value: 'ready_for_review', label: t('coachTasks:readyForReview') }]} />
      </div>
      <input aria-label={t('coachTasks:what')} value={what} maxLength={80} onChange={e => change(setWhat)(e.target.value)}
        placeholder={t('coachTasks:whatExample')} className={field} />
      <DatePicker label={t('coachTasks:due')} className="arc-trak-field" value={(day && dayAsDate(day)) || undefined} minDate={dayAsDate(localTodayISO())}
        onChange={d => change(setDay)(d ? dateAsDay(d) : '')} placeholder={t('coachSchedule:pickDate')}
        format={{ weekday: 'short', day: 'numeric', month: 'short' }} locale={currentLanguage() === 'en' ? 'en-GB' : currentLanguage()} />
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      <Button size="md" className="w-full" loading={sending} onClick={() => void send()}>{t('coachTasks:send')}</Button>
    </div>
  )
}
