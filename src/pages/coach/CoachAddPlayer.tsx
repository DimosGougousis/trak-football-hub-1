import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, PillSelector, MetadataLabel } from '@/components/trak'
import { ChevronLeft } from 'lucide-react'
import { trackEvent, startTimer } from '@/lib/telemetry'
import { toast } from 'sonner'
import { AGE_GROUPS } from '@/lib/constants'

export default function CoachAddPlayer() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [shirtNumber, setShirtNumber] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [saving, setSaving] = useState(false)

  /* Building a roster is the coach's first real task and the scope calls it the
     single biggest adoption barrier. Returning to the squad list after every
     player made a 15-player roster fifteen round trips, and asked for the age
     group fifteen times for what is by definition one squad. `addedCount`
     tracks the run so the flow can stay put instead. */
  const [addedCount, setAddedCount] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const runTimer = useRef<(() => number) | null>(null)

  /* UC-02's stopwatch number must survive the coach leaving by any route.
     Reporting only on "Save & finish" lost the whole run whenever they used
     the back button instead — which is most of the time. Refs, because the
     unmount cleanup closes over stale state. */
  const addedRef = useRef(0)
  const reportedRef = useRef(false)

  const reportRoster = () => {
    if (reportedRef.current || addedRef.current === 0) return
    reportedRef.current = true
    trackEvent('roster_built', {
      players: addedRef.current,
      duration_ms: runTimer.current?.() ?? null,
    })
  }

  useEffect(() => reportRoster, [])

  const savePlayer = async () => {
    if (!user || !name || saving) return false
    if (!runTimer.current) runTimer.current = startTimer()
    setSaving(true)
    const { error } = await supabase.from('squad_players').insert({
      coach_user_id: user.id,
      player_name: name,
      position: position || null,
      shirt_number: shirtNumber ? Number(shirtNumber) : null,
      age_group: ageGroup || null,
      status: 'active',
    })
    setSaving(false)
    if (error) {
      toast.error(`Couldn't add player: ${error.message}`)
      return false
    }
    return true
  }

  /* Save and stay. Name, position and shirt clear; age group persists, because
     it is a property of the squad rather than of the player. */
  const handleSaveAndNext = async () => {
    if (!(await savePlayer())) return
    toast.success(`${name} added`)
    addedRef.current += 1
    setAddedCount(c => c + 1)
    setName('')
    setPosition('')
    setShirtNumber('')
    nameRef.current?.focus()
  }

  const handleSaveAndFinish = async () => {
    if (!(await savePlayer())) return
    addedRef.current += 1
    const total = addedRef.current
    toast.success(total > 1 ? `${total} players added to squad` : `${name} added to squad`)
    reportRoster()
    navigate('/coach/squad')
  }

  return (
    <MobileShell>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 py-3 -mx-5 px-5"
        style={{ background: 'rgba(10,10,11,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/coach/squad')}
          className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] bg-[#17171a] border border-white/[0.11]">
          <ChevronLeft size={16} className="text-white/70" />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-white/90 -ml-[34px] pointer-events-none">Add Player</h1>
      </div>

      <div className="pt-6 pb-4 space-y-6">

        <div className="space-y-2">
          <MetadataLabel text="PLAYER NAME" />
          <input type="text" ref={nameRef} value={name} onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') void handleSaveAndNext() }}
            className="w-full px-4 py-3 rounded-[10px] bg-[#202024] border border-white/[0.07] text-sm text-white/88 outline-none focus:border-[#C8F25A]/30" />
        </div>

        <PillSelector label="Position" options={[
          { label: 'GK', value: 'Goalkeeper' }, { label: 'DEF', value: 'Defender' },
          { label: 'MID', value: 'Midfielder' }, { label: 'ATT', value: 'Attacker' },
        ]} value={position} onChange={setPosition} />

        {/* Age groups come from the shared constant. This screen used to carry
            its own U7–U19+ list, so a coach could add a U11 player that signup
            never offers — which is how U11 data exists in an app that starts
            at U13. */}
        <PillSelector label="Age Group" options={AGE_GROUPS.map(g => ({ label: g, value: g }))} value={ageGroup} onChange={setAgeGroup} />

        <div className="space-y-2">
          <MetadataLabel text="SHIRT NUMBER" />
          <input type="number" min={1} max={99} value={shirtNumber} onChange={e => setShirtNumber(e.target.value)}
            className="w-full px-4 py-3 rounded-[10px] bg-[#202024] border border-white/[0.07] text-sm text-white/88 outline-none focus:border-[#C8F25A]/30" />
        </div>

        <div className="space-y-3">
          <button onClick={handleSaveAndNext} disabled={!name || saving}
            className="w-full py-4 rounded-[10px] bg-[#C8F25A] text-black font-bold text-sm disabled:opacity-50">
            {saving ? 'Adding...' : 'Save & add another'}
          </button>
          <button onClick={handleSaveAndFinish} disabled={!name || saving}
            className="w-full py-3.5 rounded-[10px] bg-[#17171a] border border-white/[0.11] text-white/80 font-medium text-sm disabled:opacity-40">
            Save & finish
          </button>
          {addedCount > 0 && (
            <p className="text-center text-[12px] text-white/40"
              style={{ fontFamily: "'DM Mono', monospace" }}>
              {addedCount} added this session
            </p>
          )}
        </div>
      </div>
    </MobileShell>
  )
}
