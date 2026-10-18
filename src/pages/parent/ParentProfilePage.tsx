import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Settings as SettingsIcon } from 'lucide-react'
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

export default function ParentProfilePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { children, loading } = useParentChildren()

  return (
    <MobileShell>
      <div className="flex items-center justify-between pt-3 pb-2 border-b border-line">
        <span className="text-[16px] font-medium text-ink" style={{ fontFamily: 'var(--t-font)' }}>Profile</span>
      </div>

      <div className="pt-3.5 pb-4 space-y-2.5">
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
          className="w-full flex items-center justify-between rounded-[18px] p-4 border border-line bg-surface text-left hover:bg-surface transition-colors"
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
          className="w-full flex items-center justify-between rounded-[18px] p-4 border border-line bg-surface text-left hover:bg-surface transition-colors"
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
