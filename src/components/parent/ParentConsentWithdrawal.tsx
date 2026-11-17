import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { Button } from '@/components/ui/button'
import { Button as ArcButton } from '@/components/arc/button/button'
import { consentRequest, guardianConsentApplies, hasOwnConsent, withdrawOwnConsent } from '@/lib/parent-consent-withdrawal'

type State = 'hidden' | 'loading' | 'active' | 'confirm' | 'writing' | 'none' | 'done' | 'read-error' | 'write-error'

/** TRAK-441 slice 6: a consent card's classes, today's or, with the family_look switch, the coach's (Arc tokens). The
 *  words stay as they are: consent wording waits on counsel (TRAK-22). */
export const consentSkin = (look: boolean) => look
  ? { box: 'grid gap-3 rounded-2xl border border-line bg-surface p-5 laptop:p-6', title: 'text-lg font-medium text-ink', quiet: 'text-[15px] text-ink-2', text: 'text-[15px] text-ink', actions: 'flex flex-wrap gap-2',
      /** A lone button keeps its own width in the card's grid. */
      one: (button: ReactNode) => <div className="flex">{button}</div> }
  : { box: 'rounded-xl border border-border bg-card p-4 space-y-3', title: 'text-base font-medium text-foreground', quiet: 'text-sm text-muted-foreground', text: 'text-sm text-foreground', actions: 'flex flex-col gap-2',
      one: (button: ReactNode) => button }

/** Today's outline button, or Arc's (danger: red words on a white button). */
export function ConsentButton({ look, className, danger = false, disabled, onClick, children }: {
  look: boolean; className: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return look ? <ArcButton variant={danger ? 'danger' : 'secondary'} disabled={disabled} onClick={onClick}>{children}</ArcButton>
    : <Button variant="outline" className={className} disabled={disabled} onClick={onClick}>{children}</Button>
}

function ChildConsent({ parentId, childId, childName, look }: { parentId: string; childId: string; childName: string; look: boolean }) {
  const cache = useQueryClient()
  const c = consentSkin(look)
  const [state, setState] = useState<State>('loading')
  const current = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const writing = useRef(false)
  const read = useCallback(async () => {
    current.current?.abort()
    const request = new AbortController()
    current.current = request
    setState('loading')
    try {
      const active = await consentRequest(request, () => hasOwnConsent(parentId, childId, request.signal))
      // TRAK-177: no line for a child who gives their own consent (at or over the academy's age).
      const applies = active || await guardianConsentApplies(parentId, childId, request.signal).catch(() => true)
      if (mounted.current && current.current === request) setState(active ? 'active' : applies ? 'none' : 'hidden')
    } catch {
      if (mounted.current && current.current === request) setState('read-error')
    }
  }, [parentId, childId])

  useEffect(() => {
    mounted.current = true
    void read()
    return () => { mounted.current = false; current.current?.abort() }
  }, [read])

  const withdraw = async () => {
    if (writing.current || state !== 'confirm') return
    writing.current = true
    current.current?.abort()
    const request = new AbortController()
    current.current = request
    setState('writing')
    try {
      await consentRequest(request, () => withdrawOwnConsent(parentId, childId, request.signal))
      if (mounted.current && current.current === request) setState('done')
    } catch {
      if (mounted.current && current.current === request) setState('write-error')
    } finally {
      // A lost response can still have committed. Drop the captured child's
      // data on either outcome; late reads must not repopulate its old cache.
      await cache.cancelQueries({ queryKey: ['parent', parentId, childId] })
      cache.removeQueries({ queryKey: ['parent', parentId, childId] })
      void cache.invalidateQueries({ queryKey: ['parent', parentId, 'awaiting-consent'] })
      // TRAK-441 slice 6: Profile's "Consent given" badge reads again.
      void cache.invalidateQueries({ queryKey: ['own-consent', parentId, childId] })
      writing.current = false
    }
  }

  if (state === 'hidden') return null
  return <section aria-label={`Consent for ${childName}`} className={c.box}>
    <h2 className={c.title}>Consent for {childName}</h2>
    {state === 'loading' && <p role="status" className={c.quiet}>Checking consent…</p>}
    {state === 'active' && <>
      <p className={c.quiet}>You have an active approval for this child.</p>
      {c.one(<ConsentButton look={look} className="min-h-11 h-auto whitespace-normal" onClick={() => setState('confirm')}>Withdraw consent for {childName}</ConsentButton>)}
    </>}
    {(state === 'confirm' || state === 'writing') && <>
      <p className={c.text}>Withdraw your approval for {childName}? This does not delete their account or past records. It does not withdraw another guardian’s approval.</p>
      <div className={c.actions}>
        <ConsentButton look={look} danger className="min-h-11 h-auto whitespace-normal border-destructive hover:bg-destructive/10" disabled={state === 'writing'} onClick={() => { void withdraw() }}>
          {state === 'writing' ? 'Withdrawing…' : `Confirm withdrawal for ${childName}`}
        </ConsentButton>
        <ConsentButton look={look} className="min-h-11" disabled={state === 'writing'} onClick={() => setState('active')}>Keep consent</ConsentButton>
      </div>
    </>}
    {state === 'none' && <p role="status" className={c.quiet}>You have no active consent recorded for {childName}.</p>}
    {state === 'done' && <p role="status" className={c.text}>Your consent for {childName} has been withdrawn.</p>}
    {(state === 'read-error' || state === 'write-error') && <>
      <p role="alert" className={c.text}>{state === 'write-error'
        ? "Couldn't confirm whether your consent was withdrawn. Check its status before trying again."
        : "Couldn't check your consent. Check your connection and try again."}</p>
      {c.one(<ConsentButton look={look} className="min-h-11" onClick={() => { void read() }}>Check consent status</ConsentButton>)}
    </>}
  </section>
}

/** TRAK-181 (16 Oct): one line per child, each with its own Withdraw, so Profile
 *  needs no "Following" picker. Hiding a child who consents for themselves is TRAK-177. */
export function ParentConsentWithdrawal({ look = false }: { look?: boolean }) {
  const { parentId, children } = useParentChildren()
  if (!parentId || !children.length) return null
  return <>{children.map(child =>
    <ChildConsent key={`${parentId}:${child.id}`} parentId={parentId} childId={child.id} childName={child.name} look={look} />)}</>
}
