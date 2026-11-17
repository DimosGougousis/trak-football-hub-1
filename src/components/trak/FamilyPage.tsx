import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/arc/blocks/page-header/page-header'
import { ArcProvider } from '@/components/arc/lib/arc-provider'
import { Breadcrumb } from '@/components/arc/breadcrumb/breadcrumb'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { useFrameTrail } from './FamilyFrame'

/* TRAK-441 slices 5 and 6 (mockup, 12 Nov): the family pages' shared parts, the coach's. */

export const familyCard = 'rounded-2xl border border-line bg-surface p-5 laptop:p-6'
export const familyH2 = 'text-lg font-medium text-ink'
/** One column on a phone, two on a laptop; the page's sections are 24 px apart, 32 px on a laptop. */
export const familyColumns = 'grid grid-cols-[minmax(0,1fr)] gap-6 laptop:grid-cols-2 laptop:items-start laptop:gap-8'
export const familyStack = 'grid grid-cols-[minmax(0,1fr)] content-start gap-6 laptop:gap-8'

const RouterLink = ({ href, ...props }: { href: string; children?: ReactNode }) => <Link to={href} {...props} />

/** A page one step in (My season, an evaluation): the coach's page header. On a phone the trail is in the page; on a
 *  laptop it is the top bar's and the header's empty top row folds away, as on the family match page. */
export function FamilyPage({ title, status, details, from, children }: {
  title: string
  status?: ReactNode
  details?: ReactNode
  /** The trail's first crumb: the tab this page sits under. */
  from: { label: string; href: string }
  children: ReactNode
}) {
  const wide = useSideMenuScreen()
  const inTopBar = useFrameTrail(title)
  return <ArcProvider link={RouterLink}>
    <PageHeader className="[--ph-bleed:1.25rem] tablet:[--ph-bleed:2rem] laptop:![--ph-bar:0px]" top={wide ? '60px' : '0px'}
      title={title} status={status} details={details}
      crumbs={inTopBar ? undefined : <Breadcrumb items={[from, { label: title }]} />}>
      <div className="pt-4">{children}</div>
    </PageHeader>
  </ArcProvider>
}

export type FamilyRow = { label: string; value?: ReactNode; to?: string; onClick?: () => void; expanded?: boolean; controls?: string }

/** Profile's lists: a row that opens a page, does something, or only says something. */
export function FamilyRows({ rows }: { rows: FamilyRow[] }) {
  const body = (row: FamilyRow, open: boolean) => <>
    <span className="flex-1 text-ink">{row.label}</span>
    {row.value != null && <span className="text-ink-3">{row.value}</span>}
    {open && <ChevronRight size={16} aria-hidden="true" className={`flex-none text-ink-3 transition-transform ${row.expanded ? 'rotate-90' : ''}`} />}
  </>
  const line = 'flex min-h-[52px] w-full items-center gap-3 px-5 py-3 text-left text-[15px]'
  const press = `${line} hover:bg-raised focus-visible:bg-raised`
  return <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
    {rows.map(row => <li key={row.label}>
      {row.to ? <Link to={row.to} className={press}>{body(row, true)}</Link>
        : row.onClick ? <button type="button" onClick={row.onClick} aria-expanded={row.expanded} aria-controls={row.controls} className={press}>{body(row, true)}</button>
        // No chevron: its value lines up with the others' (20 px side, 16 px chevron, 12 px gap).
        : <div className={`${line} pr-12`}>{body(row, false)}</div>}
    </li>)}
  </ul>
}
