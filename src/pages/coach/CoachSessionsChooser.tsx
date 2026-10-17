import { useNavigate, useLocation } from 'react-router-dom'
import { MobileShell, NavBar } from '@/components/trak'
import { ChevronLeft } from 'lucide-react'
import { IconMatch, IconSessions } from '@/components/icons/TrakIcons'

export default function CoachSessionsChooser() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <MobileShell>
      {/* Topbar — mirrors PlayerLogChoose */}
      <div className="flex items-center justify-between pt-3 pb-2 border-b border-line">
        <button
          onClick={() => navigate('/coach/home')}
          className="w-[34px] h-[34px] bg-raised border border-line rounded-[10px] flex items-center justify-center"
          aria-label="Back"
        >
          <ChevronLeft size={14} className="text-ink" />
        </button>
        <span
          className="text-[16px] font-medium text-ink tracking-tight"
          style={{ fontFamily: 'var(--t-font)' }}
        >
          What are you logging?
        </span>
        <button
          onClick={() => navigate('/coach/sessions/list')}
          className="text-[10px] font-medium tracking-[0.14em] uppercase text-ink-3 px-2"
          style={{ fontFamily: 'var(--t-font-mono)' }}
          aria-label="History"
        >
          HISTORY
        </button>
      </div>

      {/* Centered choices */}
      <div className="flex-1 flex flex-col justify-center py-6 gap-4">
        {/* Quick Match Log */}
        <button
          onClick={() => navigate('/coach/sessions/quick')}
          className="w-full bg-surface border border-brand/[0.18] rounded-[24px] p-7 text-left active:scale-[0.98] transition-transform"
        >
          <div className="mb-3"><IconMatch size={32} color="rgb(var(--t-brand))" /></div>
          <span
            className="text-[9px] font-medium tracking-[0.14em] uppercase text-brand block mb-3"
            style={{ fontFamily: 'var(--t-font-mono)' }}
          >
            QUICK · 1 MIN
          </span>
          <span
            className="text-[42px] font-light text-ink leading-none tracking-tight block mb-3"
            style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.03em' }}
          >
            Quick<br/>match log.
          </span>
          <span className="text-xs text-ink-3 leading-relaxed block">
            Opponent, score and who played. Capture the result at full-time.
          </span>
        </button>

        {/* Full Session */}
        <button
          onClick={() => navigate('/coach/sessions/add')}
          className="w-full bg-surface border border-line rounded-[24px] p-7 text-left active:scale-[0.98] transition-transform"
        >
          <div className="mb-3"><IconSessions size={32} color="rgb(var(--t-ink-2))" /></div>
          <span
            className="text-[9px] font-medium tracking-[0.14em] uppercase text-ink-3 block mb-3"
            style={{ fontFamily: 'var(--t-font-mono)' }}
          >
            FULL SESSION
          </span>
          <span
            className="text-[42px] font-light text-ink leading-none tracking-tight block mb-3"
            style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.03em' }}
          >
            Full<br/>session.
          </span>
          <span className="text-xs text-ink-3 leading-relaxed block">
            Match or training with per-player minutes, goals, assists, cards and match notes.
          </span>
        </button>
      </div>

      <NavBar role="coach" activeTab="/coach/sessions" onNavigate={navigate} />
    </MobileShell>
  )
}