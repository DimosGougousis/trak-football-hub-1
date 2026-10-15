import { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { OWN_CONSENT_NOTICE_VERSION, OWN_CONSENT_TEXT } from '@/lib/consent'
import { Button } from '@/components/arc/button/button'
import { ConsentSurface } from '@/components/trak/ConsentSurface'

/* TRAK-177 (Imad, 15 Oct): at an academy whose consent age is 15, a player
   aged 15–17 decides for themselves; no guardian is needed. "I don't agree"
   records the refusal, so Trak keeps nothing new about them (the database
   decides, through player_consent_required). */
export function OwnConsentCard({ turned, onChange }: { turned: boolean; onChange: () => void }) {
  const checkId = useId()
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'agreed' | 'declined' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // TRAK-182 (Imad's 6a): a bar first; Approve and Details open the panel with
  // the text that is stored and the "choosing for myself" box (#300's review).
  const [face, setFace] = useState<'bar' | 'details'>('bar')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (face === 'details') heading.current?.focus({ preventScroll: true }) }, [face])

  async function choose(agree: boolean) {
    setBusy(true); setError(null)
    const { error } = agree
      ? await supabase.rpc('give_my_consent', { p_notice_version: OWN_CONSENT_NOTICE_VERSION, p_consent_text: OWN_CONSENT_TEXT })
      : await supabase.rpc('withdraw_my_consent')
    setBusy(false)
    if (error) { setError(error.message); return }
    setDone(agree ? 'agreed' : 'declined')
    onChange()
  }

  const font = { fontFamily: "'DM Sans', sans-serif" }
  if (done) return (
    <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-4 my-4 text-[13px] text-white/88" style={font}>
      {done === 'agreed'
        ? 'Thanks, your coach can now record your progress. You can withdraw any time in Settings.'
        : "Understood. Your coach won't record your progress in Trak, and you still get the same coaching. You can change your mind in Settings."}
    </div>
  )
  const whose = turned ? "You're 15 or over now, so this is your choice, not your parent's." : "At your age, this is your choice, not your parent's."
  return (
    <ConsentSurface face={face} labelledBy={`${checkId}-h`} aboveNav>
      {face === 'bar' ? <>
        <p id={`${checkId}-h`} className="text-[16px] font-medium text-white/95" style={font}>Your coach would like to record your progress in Trak.</p>
        <p className="text-[13px] text-white/60 mt-1" style={font}>{whose}</p>
        <div className="flex gap-2 mt-4">
          <Button size="lg" className="flex-1" onClick={() => setFace('details')}>Approve</Button>
          <Button size="lg" variant="secondary" className="flex-1" loading={busy} onClick={() => { void choose(false) }}>Reject</Button>
          <Button size="lg" variant="ghost" onClick={() => setFace('details')}>Details</Button>
        </div>
      </> : <div style={font} onKeyDown={event => { if (event.key === 'Escape') setFace('bar') }}>
        <h2 id={`${checkId}-h`} ref={heading} tabIndex={-1} className="text-[17px] font-medium text-white/95 outline-none">Your consent</h2>
        <p className="text-[13px] text-white/60 mt-1">{whose}</p>
        <p className="text-[13px] text-white/80 mt-3 leading-relaxed">{OWN_CONSENT_TEXT}</p>
        <label htmlFor={checkId} className="flex items-start gap-2 mt-3 text-[13px] text-white/85">
          <input id={checkId} type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4" />
          I understand and I'm choosing for myself.
        </label>
        <div className="flex gap-2 mt-4">
          <Button size="lg" className="flex-1" disabled={!understood} loading={busy} onClick={() => { void choose(true) }}>Approve</Button>
          <Button size="lg" variant="secondary" className="flex-1" disabled={busy} onClick={() => { void choose(false) }}>Reject</Button>
        </div>
      </div>}
      {error && <p role="alert" className="text-[12px] text-destructive mt-2">{error}</p>}
    </ConsentSurface>
  )
}

/* Settings: a player who decides for themselves can withdraw (TRAK-177). The
   open-session watcher then drops coach content, as for a guardian withdrawal. */
export function OwnConsentSettings({ Section }: { Section: (props: { label: string; children: React.ReactNode }) => JSX.Element }) {
  const [status, setStatus] = useState<{ age?: number | null; consent_age?: number; threshold?: number; own_choice?: boolean | null } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void supabase.rpc('my_consent_status' as never).then(({ data }) => { if (!cancelled) setStatus(data as typeof status) })
    return () => { cancelled = true }
  }, [])
  const decides = status?.age != null && status.consent_age != null && status.age >= status.consent_age && status.age < (status.threshold ?? 18)
  if (!decides || (status?.own_choice !== true && !withdrawn)) return null

  async function withdraw() {
    setError(null)
    const { error } = await supabase.rpc('withdraw_my_consent')
    if (error) { setError(error.message); return }
    setWithdrawn(true)
  }
  const text = 'text-[12px] text-white/70 leading-relaxed'
  return (
    <Section label="Your consent">
      {withdrawn ? <p role="status" className={text}>You withdrew your consent. Your coach can't record your progress in Trak. You can agree again on Home.</p>
        : <>
          <p className={text}>You agreed for yourself that your coach can record your progress in Trak.</p>
          {confirming ? <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => { void withdraw() }} className="min-h-11 px-4 rounded-lg border border-destructive text-sm text-destructive">Yes, withdraw</button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-4 rounded-lg border border-border text-sm text-white/80">Cancel</button>
          </div> : <button type="button" onClick={() => setConfirming(true)} className="min-h-11 px-4 mt-3 rounded-lg border border-border text-sm text-white/80">Withdraw my consent</button>}
        </>}
      {error && <p role="alert" className="text-[12px] text-destructive mt-2">{error}</p>}
    </Section>
  )
}
