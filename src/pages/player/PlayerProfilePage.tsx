import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, MetadataLabel } from '@/components/trak'
import { IconPassport, IconHowItWorks } from '@/components/icons/TrakIcons'
import { ChevronRight, Settings as SettingsIcon } from 'lucide-react'
import { bandForScore } from '@/lib/rating-engine'
import { ParentInviteCard } from '@/components/player/ParentInviteCard'
import { PlayerConnections } from '@/components/player/PlayerConnections'
import { useMySeason } from '@/lib/my-season'
import { loadConnections } from '@/components/player/PlayerConnections'
import { BandBars } from '@/components/player/LatestEvaluation'
import { useCalendarLinkStatus } from '@/components/trak/AddToCalendar'
import { useFamilyAcademy, useFamilyLook } from '@/components/trak/FamilyFrame'
import { FamilyRows, FamilyTabTitle, familyCard, familyColumns, familyH2, familyStack } from '@/components/trak/FamilyPage'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { evalDay } from '@/lib/evaluation'
import { languageOf, useLanguage } from '@/lib/i18n'

export default function PlayerProfilePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [details, setDetails] = useState<any>(null)
  // TRAK-437: the position is the one the coach set, nothing if none; never the sign-up value in player_details.
  const position = useMySeason().data?.position
  const [assessments, setAssessments] = useState<any[]>([])
  const assessment = assessments[0] ?? null

  useEffect(() => {
    if (!user) return
    supabase.from('player_details').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => setDetails(data))
    // Coach assessments, newest first — via squad_players, since
    // coach_assessments.squad_player_id is a row ID, not a user ID.
    supabase.from('squad_players').select('id').eq('linked_player_id', user.id)
      .then(async ({ data: squadRows }) => {
        if (!squadRows?.length) return
        const ids = squadRows.map((r: any) => r.id)
        const { data } = await supabase.from('coach_assessments')
          .select('id, created_at, work_rate, tactical, attitude, technical, physical, coachability')
          .in('squad_player_id', ids)
          .order('created_at', { ascending: false })
          .limit(10)
        setAssessments(data ?? [])
      })
  }, [user])

  // TRAK-441 slice 6, behind family_look: the coach's look. The old blocks' functions are kept (see ProfileLook).
  const look = useFamilyLook()
  if (look) return <ProfileLook position={position} ageGroup={details?.age_group} assessments={assessments} />

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const assessmentCategories = assessment ? [
    { name: 'Work Rate', score: assessment.work_rate },
    { name: 'Tactical', score: assessment.tactical },
    { name: 'Attitude', score: assessment.attitude },
    { name: 'Technical', score: assessment.technical },
    { name: 'Physical', score: assessment.physical },
    { name: 'Coachability', score: assessment.coachability },
  ] : []

  return (
    <MobileShell>
      <div className="flex items-center justify-between pt-3 pb-2 border-b border-line">
        <span className="text-[16px] font-medium text-ink" style={{ fontFamily: 'var(--t-font)' }}>Profile</span>
      </div>

      <div className="pt-3.5 pb-4 space-y-4">
        {/* Avatar + Identity */}
        <div className="text-center mb-6">
          <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden bg-raised border border-brand/[0.18] mx-auto mb-3 flex items-center justify-center">
            <span className="text-2xl font-semibold text-primary" aria-hidden="true">
              {(profile?.full_name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-[20px] font-semibold text-ink tracking-tight" style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.02em' }}>
            {profile?.full_name}
          </p>
          <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
            {position && (
              <span className="h-5 px-2.5 rounded-full bg-raised border border-line text-[8px] font-medium tracking-[0.06em] uppercase text-ink-3 inline-flex items-center"
                style={{ fontFamily: 'var(--t-font-mono)' }}>{position}</span>
            )}
            {details?.current_club && (
              <span className="h-5 px-2.5 rounded-full bg-raised border border-line text-[8px] font-medium tracking-[0.06em] uppercase text-ink-3 inline-flex items-center"
                style={{ fontFamily: 'var(--t-font-mono)' }}>{details.current_club} {details.age_group}</span>
            )}
            {details?.shirt_number && (
              <span className="h-5 px-2.5 rounded-full bg-raised border border-line text-[8px] font-medium tracking-[0.06em] uppercase text-ink-3 inline-flex items-center"
                style={{ fontFamily: 'var(--t-font-mono)' }}>#{details.shirt_number}</span>
            )}
          </div>
        </div>

        {/* TRAK-435 (Imad, 12 Nov): no rating trend; a match gets the coach's words, not a rating. */}
        {/* Coach Assessments: the six metrics in their band colours, on a light card (TRAK-229). */}
        {assessmentCategories.length > 0 && (
          <div className="rounded-2xl p-5 laptop:p-6 border border-line bg-surface">
            <MetadataLabel text="COACH ASSESSMENTS" />
            <div className="mt-3 space-y-2">
              {assessmentCategories.map(cat => {
                const bandInfo = bandForScore(cat.score)
                const pct = (cat.score / 10) * 100
                return (
                  <div key={cat.name} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-ink w-[110px] flex-shrink-0">{cat.name}</span>
                    <div className="flex-1 h-[5px] rounded-full bg-raised overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bandInfo.color }} />
                    </div>
                    <span className="text-[11px] font-semibold w-[68px] text-right flex-shrink-0" style={{ color: bandInfo.text }}>
                      {bandInfo.word}
                    </span>
                  </div>
                )
              })}
            </div>
              {assessments.length > 0 && (
                <ul className="mt-3 pt-3 border-t border-line space-y-1" aria-label="Assessment history">
                  {assessments.map(a => {
                    const band = bandForScore((a.work_rate + a.tactical + a.attitude + a.technical + a.physical + a.coachability) / 6)
                    return (
                      <li key={a.id}>
                        <button onClick={() => navigate(`/player/feedback/${a.id}`)}
                          className="w-full flex items-center justify-between py-2 text-left">
                          <span className="text-[12px] text-ink-2">
                            {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: band.text }}>
                            {band.word}<ChevronRight size={14} className="text-ink-3" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
          </div>
        )}

        {/* My Passport */}
        <button
          onClick={() => navigate('/player/passport')}
          className="w-full flex items-center justify-between rounded-2xl p-5 laptop:p-6 border border-line bg-surface text-left hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgb(var(--t-brand) / 0.08)', border: '1px solid rgb(var(--t-brand) / 0.2)' }}>
              <IconPassport size={16} color="rgb(var(--t-brand))" />
            </div>
            <div>
              <MetadataLabel text="MY PASSPORT" />
              <p className="text-[12px] text-ink-2 mt-1" style={{ fontFamily: 'var(--t-font)' }}>
                Coming soon
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-3" />
        </button>

        {/* Connections, moved here from Settings (TRAK-71) */}
        <PlayerConnections />

        {/* Parent access */}
        <ParentInviteCard />

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
                Account, notifications, privacy
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-3" />
        </button>


      </div>
      <NavBar role="player" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}

type Assessment = { id: string; created_at: string; work_rate: number; tactical: number; attitude: number; technical: number; physical: number; coachability: number }

/**
 * TRAK-441 slice 6 (mockup, 12 Nov): who he is, My card (the latest evaluation's bars, its date, and the earlier ones
 * to open) and Account. Kept from today's page: every assessment opens (My card), Connections (the coach beside the
 * academy, the parent as a row), How Trak works and Settings. Left out: the parked Passport ("Coming soon"), and the
 * parent invitations card, which Home shows whenever there is one to share or resend.
 */
function ProfileLook({ position, ageGroup, assessments }: { position?: string | null; ageGroup?: string | null; assessments: Assessment[] }) {
  const { t, language } = useLanguage()
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const academy = useFamilyAcademy('player')
  const calendar = useCalendarLinkStatus()
  const links = useQuery({
    queryKey: ['player-connections', user?.id],
    queryFn: ({ signal }) => loadConnections(user!.id, signal),
    enabled: !!user,
  })
  const name = profile?.full_name || ''
  const coaches = links.data?.coaches.filter(Boolean) ?? []
  const parents = links.data?.parents ?? []
  const who = [position, ageGroup].filter(Boolean).join(' · ')
  const where = [academy?.name, coaches.length ? t('common:coachNamed', { name: coaches.join(', ') }) : null].filter(Boolean).join(' · ')
  const [latest, ...earlier] = assessments
  const open = (id: string) => `/player/feedback/${encodeURIComponent(id)}`
  return (
    <MobileShell width="wide">
      <div className="pt-3 pb-28 laptop:pt-6">
        <FamilyTabTitle title={t('nav:profile')} name={name} />
        <div className={`arc ${familyColumns}`}>
          <div className={familyStack}>
            <section className={`${familyCard} flex items-center gap-4`}>
              <Avatar name={name || '?'} size="xl" />
              <div className="grid min-w-0 gap-0.5">
                <p className="truncate text-[20px] font-medium tracking-[-0.01em] text-ink">{name}</p>
                {who && <p className="text-[15px] text-ink-2">{who}</p>}
                {where && <p className="text-sm text-ink-3">{where}</p>}
              </div>
            </section>
            {latest && <section aria-label={t('common:myCard')} className={familyCard}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className={familyH2}>{t('common:myCard')}</h2><span className="text-sm text-ink-3">{evalDay(latest.created_at)}</span>
              </div>
              <BandBars assessment={latest} />
              <Link to={open(latest.id)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
                {t('common:openEvaluation')} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              {earlier.length > 0 && <div className="mt-2 grid gap-1 border-t border-line pt-3">
                <h3 className="text-sm text-ink-3">{t('common:earlier')}</h3>
                <ul className="divide-y divide-line">{earlier.map(a => <li key={a.id}>
                  <Link to={open(a.id)} className="flex min-h-11 items-center justify-between gap-3 text-[15px] text-ink">
                    {evalDay(a.created_at)}<ChevronRight size={16} aria-hidden="true" className="text-ink-3" />
                  </Link>
                </li>)}</ul>
              </div>}
            </section>}
          </div>
          <section aria-label={t('settings:account')} className="grid gap-2">
            <h2 className={familyH2}>{t('settings:account')}</h2>
            <FamilyRows rows={[
              { label: t('common:calendar'), to: '/settings#calendar',
                value: calendar.data ? <Badge tone="success" size="sm" icon={<Check />}>{t('common:inYourCalendar')}</Badge> : undefined },
              { label: t('settings:language'), to: '/settings#language', value: languageOf(language).name },
              // A parent whose name RLS hides is still linked: no name then, never "Not connected".
              ...(links.isSuccess ? [{ label: t('common:yourParent'), value: parents.length ? parents.filter(Boolean).join(', ') || undefined : t('common:notConnected') }] : []),
              { label: t('nav:howTrakWorks'), to: '/how-it-works' },
              { label: t('nav:settings'), to: '/settings' },
              { label: t('settings:signOut'), onClick: () => {
                if (user) void signOut(user.id).then(({ error }) => { if (error) toast.error(t('settings:signOutError')) })
              } },
            ]} />
          </section>
        </div>
      </div>
      <NavBar role="player" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
