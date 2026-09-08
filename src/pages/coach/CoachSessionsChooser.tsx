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
      <div className="flex items-center justify-between pt-3 pb-2 border-b border-white/[0.07]">
        <button
          onClick={() => navigate('/coach/home')}
          className="w-[34px] h-[34px] bg-[#17171A] border border-white/[0.11] rounded-[10px] flex items-center justify-center"
          aria-label="Back"
        >
          <ChevronLeft size={14} className="text-white/88" />
        </button>
        <span
          className="text-[16px] font-medium text-white/88 tracking-tight"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          What are you logging?
        </span>
        <button
          onClick={() => navigate('/coach/sessions/list')}
          className="text-[10px] font-medium tracking-[0.14em] uppercase text-white/45 px-2"
          style={{ fontFamily: "'DM Mono', monospace" }}
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
          className="w-full bg-[#101012] border border-[rgba(200,242,90,0.18)] rounded-[24px] p-7 text-left active:scale-[0.98] transition-transform"
        >
          <div className="mb-3"><IconMatch size={32} color="#C8F25A" /></div>
          <span
            className="text-[9px] font-medium tracking-[0.14em] uppercase text-[#C8F25A] block mb-3"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            QUICK · 1 MIN
          </span>
          <span
            className="text-[42px] font-light text-white/88 leading-none tracking-tight block mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.03em' }}
          >
            Quick<br/>match log.
          </span>
          <span className="text-xs text-white/22 leading-relaxed block">
            Opponent, score and who played. Capture the result at full-time.
          </span>
        </button>

        {/* Full Session */}
        <button
          onClick={() => navigate('/coach/sessions/add')}
          className="w-full bg-[#101012] border border-white/[0.07] rounded-[24px] p-7 text-left active:scale-[0.98] transition-transform"
        >
          <div className="mb-3"><IconSessions size={32} color="rgba(255,255,255,0.65)" /></div>
          <span
            className="text-[9px] font-medium tracking-[0.14em] uppercase text-white/45 block mb-3"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            FULL SESSION
          </span>
          <span
            className="text-[42px] font-light text-white/88 leading-none tracking-tight block mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.03em' }}
          >
            Full<br/>session.
          </span>
          <span className="text-xs text-white/22 leading-relaxed block">
            Match or training with per-player minutes, goals, assists, cards and match notes.
          </span>
        </button>
      </div>

      <NavBar role="coach" activeTab="/coach/sessions" onNavigate={navigate} />
    </MobileShell>
  )
}