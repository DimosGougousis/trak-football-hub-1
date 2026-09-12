import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  CONSENT_PURPOSES,
  CONSENT_STATEMENT,
  CONSENT_NOTICE_VERSION,
  CONSENT_THRESHOLD_AGE,
  type ConsentPurposeKey,
} from '@/lib/consent'

type Child = { player_user_id: string; full_name: string; age_years: number }

/**
 * The authorisation screen for a parent of a player below the digital-consent
 * age. Nothing can be recorded about the child until this is completed, so
 * this is the gate, not a formality.
 *
 * Three things it has to get right, all of which the plain version gets wrong:
 *   - separate choices, never one bundled yes
 *   - optional choices default to off, and are not pre-ticked
 *   - the exact wording shown is what gets stored, so a past consent can be
 *     reconstructed against the text the parent actually read
 */
const ParentConsent = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [relationship, setRelationship] = useState<'parent' | 'legal_guardian'>('parent')
  const [optional, setOptional] = useState<Record<string, boolean>>({})
  const [confirmed, setConfirmed] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    // `as any`: the generated types predate this migration, same as
    // delete_my_account in Settings.tsx. Regenerate them and the cast can go.
    const { data, error } = await (supabase.rpc as any)('get_children_awaiting_consent')
    if (error) {
      setLoadError(error.message)
    } else {
      setChildren((data as Child[] | null) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const child = children[0] ?? null

  const handleSubmit = async () => {
    if (!child) return
    if (!confirmed) {
      toast.error('Please confirm the statement before continuing')
      return
    }

    setSubmitting(true)
    try {
      const purposes = CONSENT_PURPOSES.reduce<Record<ConsentPurposeKey, boolean>>((acc, p) => {
        acc[p.key] = p.required ? true : Boolean(optional[p.key])
        return acc
      }, {} as Record<ConsentPurposeKey, boolean>)

      const { error } = await (supabase.rpc as any)('record_parental_consent', {
        p_player_user_id: child.player_user_id,
        p_relationship: relationship,
        p_purposes: purposes,
        p_notice_version: CONSENT_NOTICE_VERSION,
        p_consent_text: CONSENT_STATEMENT,
      })
      if (error) throw error

      toast.success(`${child.full_name.split(' ')[0]} can now use Trak`)
      setConfirmed(false)
      setOptional({})
      await load()
      if (children.length <= 1) navigate('/parent/home', { replace: true })
    } catch (err: any) {
      toast.error(err.message || 'Could not record your approval')
    } finally {
      setSubmitting(false)
    }
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
          <p className="text-sm text-foreground mb-2">Couldn't load.</p>
          <p className="text-xs text-muted-foreground mb-4">
            Check your connection and try again.
          </p>
          <Button onClick={load} variant="outline">Retry</Button>
        </div>
      </MobileShell>
    )
  }

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
        <div>
          <h1 className="text-2xl text-foreground mb-1">Approve {firstName}'s account</h1>
          <p className="text-sm text-muted-foreground">
            {firstName} is {child.age_years}. Under {CONSENT_THRESHOLD_AGE}, a parent or guardian
            has to approve before their coach can record anything about them.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your relationship</p>
          <div className="flex gap-2">
            {([['parent', 'Parent'], ['legal_guardian', 'Legal guardian']] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={relationship === value ? 'default' : 'outline'}
                onClick={() => setRelationship(value)}
                className="flex-1"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">What you're approving</p>
          {CONSENT_PURPOSES.map(purpose => (
            <div key={purpose.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={purpose.key}
                  checked={purpose.required ? true : Boolean(optional[purpose.key])}
                  disabled={purpose.required}
                  onCheckedChange={checked =>
                    setOptional(prev => ({ ...prev, [purpose.key]: checked === true }))
                  }
                  className="mt-0.5"
                />
                <label htmlFor={purpose.key} className="flex-1 cursor-pointer">
                  <span className="block text-sm text-foreground">{purpose.label}</span>
                  <span className="block text-xs text-muted-foreground mt-1">{purpose.detail}</span>
                  {purpose.required && (
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                      Required — this is what the app does
                    </span>
                  )}
                </label>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Saying no to the optional ones does not affect {firstName}'s place at the academy or
            how their coach treats them.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={checked => setConfirmed(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="confirm" className="text-xs text-muted-foreground cursor-pointer">
              {CONSENT_STATEMENT}
            </label>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={submitting || !confirmed} className="w-full">
          {submitting ? 'Saving…' : `Approve ${firstName}'s account`}
        </Button>
      </div>
    </MobileShell>
  )
}

export default ParentConsent
