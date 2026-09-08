import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, MatchCard } from '@/components/trak'
import { scoreToBand } from '@/lib/rating-engine'

const FILTERS = ['All', 'League', 'Cup', 'Friendly']
const PAGE_SIZE = 20

export default function PlayerMatches() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [matches, setMatches] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = async (pageIndex: number, append: boolean) => {
    if (!user) return
    if (pageIndex > 0) setLoadingMore(true)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data } = await supabase.from('matches').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (pageIndex > 0) setLoadingMore(false)
    const rows = data || []
    setHasMore(rows.length === PAGE_SIZE)
    if (append) {
      setMatches(prev => [...prev, ...rows])
    } else {
      setMatches(rows)
    }
  }

  useEffect(() => {
    if (!user) return
    setPage(0)
    fetchPage(0, false)
  }, [user])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPage(next, true)
  }

  const [filter, setFilter] = useState('All')
  const filtered = filter === 'All' ? matches : matches.filter(m => m.competition === filter)

  return (
    <MobileShell>
      <div className="pt-3 pb-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[9px] tracking-[0.12em] uppercase text-white/35 mb-0.5"
              style={{ fontFamily: "'DM Mono', monospace" }}>Player</p>
            <h1 className="text-[22px] font-light text-white/88 leading-tight"
              style={{ fontFamily: "'DM Sans', sans-serif" }}>Matches</h1>
          </div>
          <span className="text-[10px] text-white/30" style={{ fontFamily: "'DM Mono', monospace" }}>
            {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                background: filter === f ? 'rgba(200,242,90,0.12)' : 'rgba(255,255,255,0.04)',
                border: filter === f ? '1px solid rgba(200,242,90,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: filter === f ? '#C8F25A' : 'rgba(255,255,255,0.45)',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Match list */}
        {filtered.length === 0 ? (
          <p className="text-white/35 text-sm mt-4">No matches found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <MatchCard
                key={m.id}
                opponent={m.opponent ? `vs ${m.opponent}` : m.competition || 'Match'}
                date={m.created_at}
                scoreUs={m.team_score}
                scoreThem={m.opponent_score}
                competition={m.competition}
                band={scoreToBand(m.computed_rating || 6.5)}
                onClick={() => navigate(`/player/match/${m.id}`)}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && filter === 'All' && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full mt-4 py-3 rounded-[12px] text-[11px] tracking-[0.08em] uppercase text-white/45 border border-white/[0.07] bg-transparent active:bg-white/[0.04] transition-colors"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
      <NavBar role="player" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
