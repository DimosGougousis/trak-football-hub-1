import { useId, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronRight, Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { ParentFamilyContent } from '@/components/parent/ParentFamily'
import { ParentConsentWithdrawal } from '@/components/parent/ParentConsentWithdrawal'
import { RosterConsentWithdrawals } from '@/components/parent/ApprovedAwaitingSignup'
import { ParentConnections } from '@/components/parent/ParentConnections'
import { ParentChildCredentials } from '@/components/parent/ParentChildCredentials'
import { MobileShell, NavBar, MetadataLabel } from '@/components/trak'
import { IconHowItWorks } from '@/components/icons/TrakIcons'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { supabase } from '@/integrations/supabase/client'
import { useCalendarLinkStatus } from '@/components/trak/AddToCalendar'
import { useFamilyAcademy, useFamilyLook } from '@/components/trak/FamilyFrame'
import { FamilyPageTitle } from '@/components/trak/FamilyPageTitle'
import { FamilyRows, familyCard, familyColumns, familyH2, familyStack } from '@/components/trak/FamilyPage'
import { hasOwnConsent } from '@/lib/parent-consent-withdrawal'
import { useMySeason } from '@/lib/my-season'
import { languageOf, useLanguage, useTranslation } from '@/lib/i18n'
import { firstName, type ParentChild } from '@/lib/parent-data'
import { ReportsList } from '@/components/player/LatestEvaluation'

export default function ParentProfilePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { children, loading } = useParentChildren()
  // TRAK-441 slice 6, behind family_look: the coach's look, keeping every function (see ProfileLook).
  const look = useFamilyLook()
  if (look) return <ProfileLook />

  return (
    <MobileShell>
      <div className="flex items-center justify-between pt-3 pb-2 border-b border-line">
        <span className="text-[16px] font-medium text-ink" style={{ fontFamily: 'var(--t-font)' }}>Profile</span>
      </div>

      <div className="pt-3.5 pb-4 space-y-4">
        {/* Avatar + Identity */}
        <div className="text-center mb-6">
          {/* TRAK-182 (live run 3): Arc's round avatar, as on the coach's screens. */}
          <div className="flex justify-center mb-3">
            <Avatar name={profile?.full_name || 'Parent'} size="xl" className="arc" aria-hidden />
          </div>
          <p className="text-[20px] font-semibold text-ink tracking-tight" style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.02em' }}>
            {profile?.full_name || 'Parent'}
          </p>
          {/* TRAK-73: the account, and how many children it follows. */}
          <p className="text-sm text-muted-foreground mt-1">
            {loading || children.length === 0 ? 'Parent account'
              : `Parent account · ${children.length} ${children.length === 1 ? 'child' : 'children'} linked`}
          </p>
        </div>

        {/* TRAK-181: no "Following" picker here; each child has its own consent line,
            and Connections lists them. Home's header still switches the child. */}
        <ParentFamilyContent>
          <ParentConsentWithdrawal />
          <ParentConnections />
        </ParentFamilyContent>

        {/* TRAK-98: withdrawal for an approved child who has no account yet, outside
            the family list, which only holds signed-up children. */}
        <RosterConsentWithdrawals />

        {/* Also available for a created login whose first run is unfinished. */}
        <ParentChildCredentials key={user?.id ?? 'signed-out'} />

        {/* TRAK-194 (Kostas, 16 Oct): no Account block here; Settings shows the name and email, editable. */}

        {/* How TRAK works link */}
        <button
          onClick={() => navigate('/how-it-works')}
          className="w-full flex items-center justify-between rounded-2xl p-5 laptop:p-6 border border-line bg-surface text-left hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgb(var(--t-brand) / 0.08)', border: '1px solid rgb(var(--t-brand) / 0.18)' }}>
              <IconHowItWorks size={16} color="rgb(var(--t-brand))" />
            </div>
            <div>
              <MetadataLabel text="HOW TRAK WORKS" />
              <p className="text-[12px] text-ink-2 mt-1" style={{ fontFamily: 'var(--t-font)' }}>
                Performance bands & rating engine
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-3" />
        </button>

        {/* Settings entry */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center justify-between rounded-2xl p-5 laptop:p-6 border border-line bg-surface text-left hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center">
              <SettingsIcon size={16} className="text-ink-2" />
            </div>
            <div>
              <MetadataLabel text="SETTINGS" />
              <p className="text-[12px] text-ink-2 mt-1" style={{ fontFamily: 'var(--t-font)' }}>
                Account settings
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-3" />
        </button>
      </div>
      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}

/** One child: the squad and the position the coach set (the season plan's read), and "Consent given" while this
 *  guardian's own approval is active. */
function ChildRow({ parentId, child }: { parentId: string; child: ParentChild }) {
  const { t } = useTranslation()
  const plan = useMySeason(child.id).data
  const consent = useQuery({
    queryKey: ['own-consent', parentId, child.id],
    queryFn: ({ signal }) => hasOwnConsent(parentId, child.id, signal),
  })
  const line = [plan?.squad, plan?.position].filter(Boolean).join(' · ')
  return <li className="flex items-center gap-3 px-5 py-3">
    <Avatar name={child.name} size="md" />
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="truncate text-[15px] font-medium text-ink">{child.name}</span>
      {line && <span className="text-sm text-ink-3">{line}</span>}
    </span>
    {consent.data && <Badge tone="success" size="sm" icon={<Check />}>{t('common:consentGiven')}</Badge>}
  </li>
}

/**
 * TRAK-441 slice 6 (mockup, 12 Nov): who they are, Your children with consent, and Account. Consent opens this
 * guardian's withdrawals (each child's, and an approved child's who hasn't signed up) under the list. The children's
 * logins and Connections are in Settings (Family); Settings has the rest.
 */
function ProfileLook() {
  const { t, language } = useLanguage()
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { children, parentId, selectedChild } = useParentChildren()
  const academy = useFamilyAcademy('parent')
  const calendar = useCalendarLinkStatus()
  const emails = useQuery({
    queryKey: ['notification-settings', user?.id, 'event_reminders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_settings').select('event_reminders').eq('user_id', user!.id).maybeSingle()
      if (error) throw error
      return data?.event_reminders ?? true
    },
    enabled: !!user,
  })
  const [consentOpen, setConsentOpen] = useState(false)
  const consentId = useId()
  const name = profile?.full_name || t('nav:parent')
  return (
    <MobileShell width="wide">
      <div className="pt-3 pb-28 laptop:pt-6">
        <FamilyPageTitle title={t('nav:profile')} />
        <div className={`arc ${familyColumns}`}>
          <div className={familyStack}>
            <section className={`${familyCard} flex items-center gap-4`}>
              <Avatar name={name} size="xl" />
              <div className="grid min-w-0 gap-0.5">
                <p className="truncate text-[20px] font-medium tracking-[-0.01em] text-ink">{name}</p>
                <p className="text-[15px] text-ink-2">{t('nav:parent')}</p>
                {academy?.name && <p className="text-sm text-ink-3">{academy.name}</p>}
              </div>
            </section>
            <section aria-label={t('common:yourChildren')} className="grid gap-2">
              <h2 className={familyH2}>{t('common:yourChildren')}</h2>
              <ParentFamilyContent>
                {parentId && <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {children.map(child => <ChildRow key={child.id} parentId={parentId} child={child} />)}
                </ul>}
              </ParentFamilyContent>
            </section>
            {/* TRAK-530: the chosen child's reports, each opening its report. */}
            {selectedChild && <ReportsList key={selectedChild.id} childId={selectedChild.id} as="parent"
              title={t('coachSquad:sentReportsWhat', { name: firstName(selectedChild) })} />}
          </div>
          <div className={familyStack}>
            <section aria-label={t('settings:account')} className="grid gap-2">
              <h2 className={familyH2}>{t('settings:account')}</h2>
              <FamilyRows rows={[
                { label: t('common:calendar'), to: '/settings#calendar',
                  value: calendar.data ? <Badge tone="success" size="sm" icon={<Check />}>{t('common:inYourCalendar')}</Badge> : undefined },
                { label: t('common:emails'), to: '/settings#notifications', value: emails.isSuccess ? t(emails.data ? 'common:on' : 'common:off') : undefined },
                { label: t('settings:language'), to: '/settings#language', value: languageOf(language).name },
                { label: t('common:consent'), onClick: () => setConsentOpen(open => !open), expanded: consentOpen, controls: consentId },
                { label: t('nav:howTrakWorks'), to: '/how-it-works' },
                { label: t('nav:settings'), to: '/settings' },
                { label: t('settings:signOut'), onClick: () => {
                  if (user) void signOut(user.id).then(({ error }) => { if (error) toast.error(t('settings:signOutError')) })
                } },
              ]} />
            </section>
            {/* TRAK-181, TRAK-98: each child's withdrawal, and an approved child's who has no account yet. */}
            {consentOpen && <div id={consentId} className="grid gap-4">
              <ParentConsentWithdrawal look />
              <RosterConsentWithdrawals look />
            </div>}
          </div>
        </div>
      </div>
      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
