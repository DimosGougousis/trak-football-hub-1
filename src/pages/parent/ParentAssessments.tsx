import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MobileShell, NavBar } from '@/components/trak'
import { ParentChildSelector, ParentFamilyContent, ParentLoadError, ParentLoading, ParentRating } from '@/components/parent/ParentFamily'
import { useParentAssessments } from '@/hooks/useParentAssessments'
import { formatParentDate } from '@/lib/parent-data'

export default function ParentAssessments() {
  const navigate = useNavigate()
  const location = useLocation()
  const query = useParentAssessments()
  const [paging, setPaging] = useState(false)
  const loadMore = async () => {
    setPaging(true)
    try {
      // Recheck displayed pages first: permissions may have changed since the
      // last page. A withdrawn child's old cached bands must not stay visible.
      const current = await query.refetch()
      if (!current.isError && current.data?.pages.at(-1)?.hasMore) await query.fetchNextPage()
    } finally { setPaging(false) }
  }
  const pages = query.data?.pages ?? []
  const coachNames = Object.assign({}, ...pages.map(page => page.coachNames)) as Record<string, string>
  const assessments = [...new Map(pages.flatMap(page => page.assessments).map(row => [row.id, row])).values()]
  return <MobileShell>
    <div className="pt-3 pb-4">
      <Link to="/parent/home" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">Back to home</Link>
      <h1 className="text-xl text-foreground mb-5">Assessments</h1>
      <ParentChildSelector />
      <ParentFamilyContent>
        {query.isError && !query.isFetchNextPageError ? <ParentLoadError message="Couldn't load assessments." onRetry={() => { void query.refetch() }} />
          : query.isPending ? <ParentLoading />
            : assessments.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No assessments are available for this child.</p>
              : <ul aria-label="Assessment history" className="divide-y divide-border">
                {assessments.map(row => <li key={row.id}>
                  <Link to={`/parent/assessment/${encodeURIComponent(row.id)}`} className="flex items-center justify-between gap-3 min-h-11 py-4 focus-visible:ring-2 focus-visible:ring-primary">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground break-words">{row.coach_user_id ? coachNames[row.coach_user_id] || 'Coach' : 'Coach'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatParentDate(row.created_at)}</p>
                    </div>
                    <ParentRating rating={row.coach_rating} missing="Not assessed" />
                  </Link>
                </li>)}
              </ul>}
        {query.isFetchNextPageError ? <ParentLoadError message="Couldn't load older assessments." onRetry={() => { void loadMore() }} />
          : !query.isError && query.hasNextPage && <button type="button" disabled={paging || query.isFetchingNextPage} onClick={() => { void loadMore() }}
            className="w-full min-h-11 rounded-xl border border-border px-4 mt-4 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary">
            {paging || query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>}
      </ParentFamilyContent>
    </div>
    <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
  </MobileShell>
}
