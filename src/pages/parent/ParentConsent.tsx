import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { Button } from '@/components/ui/button'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Switch } from '@/components/arc/switch/switch'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { ConsentSurface } from '@/components/trak/ConsentSurface'
import {
  fetchAwaitingConsent,
  fetchRosterAwaitingConsent,
  recordParentApproval,
  recordRosterApproval,
  requestChildInvitation,
  fetchMyChildLogins,
} from '@/lib/parent-consent'
import { ChildLoginCard } from '@/components/parent/ChildLoginCard'
import { FamilySelect } from '@/components/parent/ParentFamily'
import type { ChildLoginState } from '@/lib/child-login'
import {
  CONSENT_PURPOSES,
  consentStatement,
  withChild,
  type ConsentPurposeKey,
} from '@/lib/consent'

/* One list for both kinds of waiting child. 'roster' is a child the academy
   rostered who has no account yet (TRAK-11 phase 1): the name is a first name,
   and approving also asks Trak to email them their invitation (phase 3). */
interface WaitingChild {
  key: string
  kind: 'account' | 'roster'
  id: string
  full_name: string
  age_years: number
}

interface ChildInvitation {
  rosterChildId: string
  name: string
  state: 'sending' | 'sent' | 'failed'
}

interface ApprovalDraft {
  childId: string
  relationship: 'parent' | 'legal_guardian'
  optional: Partial<Record<ConsentPurposeKey, boolean>>
}

/**
 * Existing parent approval journey. Server policy determines which records
 * require approval; this screen retains the current notice and purpose choices.
 *
 * Keep these properties when evolving the academy-specific consent flow:
 *   - separate choices, never one bundled yes
 *   - optional choices default to off, and are not pre-ticked
 *   - the exact wording shown is what gets stored, so a past consent can be
 *     reconstructed against the text the parent actually read
 */
function ParentConsentAccount({ parentId }: { parentId: string }) {
  const navigate = useNavigate()
  const [children, setChildren] = useState<WaitingChild[]>([])
  const [invitation, setInvitation] = useState<ChildInvitation | null>(null)
  const [logins, setLogins] = useState<ChildLoginState[]>([])
  const [loginChild, setLoginChild] = useState<ChildLoginState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedFor, setSavedFor] = useState<string | null>(null)
  const [draft, setDraft] = useState<ApprovalDraft | null>(null)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const mounted = useRef(false)
  const reading = useRef<AbortController | null>(null)
  const writing = useRef<AbortController | null>(null)
  const submittingNow = useRef(false)
  const finishAfterRefresh = useRef(false)

  const load = useCallback(async () => {
    reading.current?.abort()
    const request = new AbortController()
    reading.current = request
    setLoading(true)
    setLoadError(null)
    try {
      const [accounts, roster, childLogins] = await Promise.all([
        fetchAwaitingConsent(request.signal),
        fetchRosterAwaitingConsent(request.signal),
        fetchMyChildLogins(request.signal),
      ])
      if (!mounted.current || reading.current !== request) return
      const pending: WaitingChild[] = [
        ...accounts.map(c => ({ key: c.player_user_id, kind: 'account' as const, id: c.player_user_id, full_name: c.full_name, age_years: c.age_years })),
        ...roster.map(c => ({ key: c.roster_child_id, kind: 'roster' as const, id: c.roster_child_id, full_name: c.first_name, age_years: c.age_years })),
      ]
      setChildren(pending)
      setLogins(childLogins)
      setLoading(false)
      // A successful refresh, not a stale pre-save count, determines completion.
      if (finishAfterRefresh.current && pending.length === 0 && childLogins.length === 0) {
        finishAfterRefresh.current = false
        navigate('/parent/home', { replace: true })
      }
    } catch {
      if (!mounted.current || reading.current !== request || request.signal.aborted) return
      setLoadError("Couldn't load pending approvals. Check your connection and try again.")
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
      reading.current?.abort()
      writing.current?.abort()
    }
  }, [load])

  const child = children.find(item => item.key === selectedChildId) ?? children[0] ?? null
  const currentDraft: ApprovalDraft = draft?.childId === child?.key && draft
    ? draft
    : { childId: child?.key ?? '', relationship: 'parent', optional: {} }
  const { relationship, optional } = currentDraft
  // TRAK-182: the bar, its Details panel, or the note after Reject.
  const [face, setFace] = useState<'bar' | 'details' | 'rejected'>('bar')
  const panelHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (face === 'details') panelHeading.current?.focus({ preventScroll: true }) }, [face])
  // The next child starts at the bar; the same child keeps its panel across a retry.
  const faceFor = useRef(child?.key)
  if (faceFor.current !== child?.key) { faceFor.current = child?.key; if (face !== 'bar') setFace('bar') }
  const updateDraft = (change: Partial<Omit<ApprovalDraft, 'childId'>>) => {
    setDraft({ ...currentDraft, ...change })
  }

  const inviteChild = async (rosterChildId: string, name: string) => {
    setInvitation({ rosterChildId, name, state: 'sending' })
    const sent = await requestChildInvitation(parentId, rosterChildId, new AbortController().signal).catch(() => false)
    if (mounted.current) setInvitation({ rosterChildId, name, state: sent ? 'sent' : 'failed' })
  }

  const handleSubmit = async () => {
    if (!child || submittingNow.current) return
    submittingNow.current = true
    const request = new AbortController()
    writing.current = request
    setSubmitting(true)
    setSavedFor(null)
    try {
      // Exactly the sentence shown beside Approve (TRAK-182).
      const statement = consentStatement(child.full_name.split(' ')[0])
      const purposes = CONSENT_PURPOSES.reduce<Record<ConsentPurposeKey, boolean>>((acc, purpose) => {
        acc[purpose.key] = purpose.required || Boolean(optional[purpose.key])
        return acc
      }, {} as Record<ConsentPurposeKey, boolean>)
      if (child.kind === 'account') {
        await recordParentApproval(parentId, { playerUserId: child.id, relationship, purposes, statement }, request.signal)
      } else {
        await recordRosterApproval(parentId, { rosterChildId: child.id, relationship, purposes, statement }, request.signal)
      }
      if (!mounted.current || request.signal.aborted) return
      setSavedFor(child.full_name)
      setDraft(null)
      if (child.kind === 'roster') {
        // Re-read after approval. A failed check never falls through to mail.
        const childLogins = await fetchMyChildLogins(request.signal)
        if (!mounted.current || request.signal.aborted) return
        const login = childLogins.find(item => item.roster_child_id === child.id)
        if (login) setLoginChild(login)
        else void inviteChild(child.id, child.full_name)
      } else {
        finishAfterRefresh.current = true
      }
      await load()
    } catch {
      if (!mounted.current || request.signal.aborted) return
      // A lost/invalid response does not prove that the server rejected the
      // write. Recheck authoritative state before offering another submission.
      finishAfterRefresh.current = false
      setLoadError("Couldn't confirm whether your approval was saved. Check its status before trying again.")
      setLoading(false)
    } finally {
      submittingNow.current = false
      if (writing.current === request) writing.current = null
      if (mounted.current) setSubmitting(false)
    }
  }

  if (loginChild) return <MobileShell><ChildLoginCard key={loginChild.roster_child_id} parentId={parentId} child={loginChild}
    onContinue={() => { setLoginChild(null); navigate('/parent/home') }} /></MobileShell>

  if (invitation) {
    const { name, state } = invitation
    return (
      <MobileShell>
        <div className="p-6 flex flex-col gap-3">
          <p role="status" className="text-sm text-foreground">
            {state === 'sent' ? `We've emailed ${name} an invitation to join.`
              : state === 'sending' ? `Emailing ${name}…`
              : `We couldn't email ${name} yet.`}
          </p>
          <p className="text-xs text-muted-foreground">
            Your approval is saved. {name} creates their own account from that email; the link only works for the address the academy gave us.
          </p>
          <Button variant="outline" disabled={state === 'sending'}
            onClick={() => { void inviteChild(invitation.rosterChildId, name) }}>Send again</Button>
          <Button onClick={() => { if (children.length) setInvitation(null); else navigate('/parent/home') }}>
            {children.length ? 'Approve the next child' : 'Go to home'}
          </Button>
        </div>
      </MobileShell>
    )
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="p-6 text-muted-foreground text-sm">Loading…</div>
      </MobileShell>
    )
  }

  if (loadError) {
    return (
      <MobileShell>
        <div className="p-6">
          {savedFor && <p role="status" className="text-sm text-foreground mb-2">Approval saved for {savedFor}.</p>}
          <p role="alert" className="text-sm text-foreground mb-4">{loadError}</p>
          <Button onClick={() => { void load() }} variant="outline">Retry</Button>
        </div>
      </MobileShell>
    )
  }

  if (logins.length > 0 && !child) return <MobileShell><div className="p-6 flex flex-col gap-4">
    <h1 className="text-xl text-foreground">Your children's logins</h1>
    {logins.map(item => <Button key={item.roster_child_id} onClick={() => setLoginChild(item)}>
      {item.ready ? `View ${item.first_name}'s login` : `Create ${item.first_name}'s login`}
    </Button>)}
  </div></MobileShell>

  if (!child) {
    return (
      <MobileShell>
        <div className="p-6">
          <p className="text-sm text-foreground mb-2">Nothing to approve</p>
          <p className="text-xs text-muted-foreground mb-4">
            None of your children are waiting on your approval.
          </p>
          <Button onClick={() => navigate('/parent/home')} variant="outline">Go to home</Button>
        </div>
      </MobileShell>
    )
  }

  const firstName = child.full_name.split(' ')[0]

  return (
    <MobileShell>
      <div className="px-6 py-8 flex flex-col gap-5">
        {savedFor && <p role="status" className="text-sm text-muted-foreground">Approval saved for {savedFor}.</p>}
        {children.length > 1 && (
          <div>
            <label htmlFor="approval-child" className="block text-sm text-muted-foreground mb-2">Child to approve</label>
            <FamilySelect id="approval-child" value={child.key} disabled={submitting}
              onChange={event => {
                if (submittingNow.current) return
                setSelectedChildId(event.target.value)
                setDraft(null)
                setSavedFor(null)
                setFace('bar')
              }}>
              {children.map(item => (
                <option key={item.key} value={item.key}>{item.full_name} · Age {item.age_years}</option>
              ))}
            </FamilySelect>
          </div>
        )}
        <div>
          <h1 className="text-2xl text-foreground mb-1 break-words">{child.full_name} is waiting for your approval</h1>
          <p className="text-sm text-muted-foreground">Nothing about {firstName} is recorded until you approve.</p>
        </div>
      </div>

      {/* TRAK-182 (Imad's 6a wording, 15 Oct). Approve and Details both open the
          panel: the relationship is chosen and the statement read there, before
          the approval that stores them. Reject records nothing; the child stays
          waiting and the coach sees "waiting for a parent". */}
      <ConsentSurface face={face} labelledBy="consent-title">
        {face === 'bar' ? <>
          <p id="consent-title" className="text-[16px] font-medium text-white/95">Approve {firstName}'s Trak account?</p>
          <p className="text-[14px] text-white/65 mt-1">Their coach records how they train and play, and you see their progress.</p>
          <div className="flex gap-2 mt-4">
            <ArcButton size="lg" className="flex-1" onClick={() => setFace('details')}>Approve</ArcButton>
            <ArcButton size="lg" variant="secondary" className="flex-1" onClick={() => setFace('rejected')}>Reject</ArcButton>
            <ArcButton size="lg" variant="ghost" onClick={() => setFace('details')}>Details</ArcButton>
          </div>
        </> : face === 'details' ? <div onKeyDown={event => { if (event.key === 'Escape') setFace('bar') }}>
          {/* Focus moves into the panel as it opens, so keyboards and screen readers follow it, and Escape works. */}
          <h2 id="consent-title" tabIndex={-1} ref={panelHeading}
            className="text-[17px] font-medium text-white/95 outline-none">Approve {firstName}'s Trak account</h2>
          {/* Locked while the approval saves, so the stored choices are the ones on screen. */}
          <fieldset disabled={submitting} className="contents">
          <div className="mt-4">
            <p className="text-[13px] text-white/55 mb-2">You are {firstName}'s</p>
            <SegmentedControl label={`Your relationship to ${firstName}`} value={relationship}
              onValueChange={value => updateDraft({ relationship: value as ApprovalDraft['relationship'] })}
              options={[{ value: 'parent', label: 'Parent' }, { value: 'legal_guardian', label: 'Legal guardian' }]} />
          </div>
          <ul className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {CONSENT_PURPOSES.map(purpose => (
              <li key={purpose.key} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p id={`purpose-${purpose.key}`} className="text-[15px] text-white/90">{purpose.label}</p>
                  {purpose.required
                    ? <span className="text-[12px] text-white/50">Always on with approval</span>
                    : <Switch aria-labelledby={`purpose-${purpose.key}`} checked={Boolean(optional[purpose.key])} disabled={submitting}
                        onCheckedChange={checked => updateDraft({ optional: { ...optional, [purpose.key]: checked } })} />}
                </div>
                <p className="text-[13px] text-white/60 mt-1">{withChild(purpose.detail, firstName)}</p>
              </li>
            ))}
          </ul>
          </fieldset>
          <p className="text-[12px] text-white/55 mt-3 leading-relaxed">{consentStatement(firstName)}</p>
          <div className="flex gap-2 mt-4">
            <ArcButton size="lg" className="flex-1" loading={submitting} onClick={() => { void handleSubmit() }}>Approve</ArcButton>
            <ArcButton size="lg" variant="secondary" className="flex-1" disabled={submitting} onClick={() => setFace('rejected')}>Reject</ArcButton>
          </div>
        </div> : <>
          <p id="consent-title" role="status" className="text-[15px] text-white/90">
            Not approved. {firstName} stays waiting, and nothing about them is recorded. You can approve any time from Home.
          </p>
          <div className="flex gap-2 mt-4">
            <ArcButton size="lg" className="flex-1" onClick={() => navigate('/parent/home')}>Go to home</ArcButton>
            <ArcButton size="lg" variant="secondary" className="flex-1" onClick={() => setFace('bar')}>Review again</ArcButton>
          </div>
        </>}
      </ConsentSurface>
    </MobileShell>
  )
}

export default function ParentConsent() {
  const { user } = useAuth()
  // Account changes remount the state machine; token refreshes do not erase
  // the current parent's choices. Old promises retain an unmounted instance.
  return user
    ? <ParentConsentAccount key={user.id} parentId={user.id} />
    : <MobileShell><div className="p-6 text-muted-foreground text-sm">Loading…</div></MobileShell>
}
