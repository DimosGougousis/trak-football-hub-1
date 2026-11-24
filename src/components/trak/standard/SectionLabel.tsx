import type { ReactNode } from 'react'

/** Design standard (docs/design-system/components.md): the small uppercase label above each section of a page. */
export const SECTION_LABEL = 'text-xs font-bold uppercase tracking-[0.12em] text-ink-3'

export function SectionLabel({ as: Heading = 'h2', id, action, children }: {
  as?: 'h2' | 'h3'
  id?: string
  /** A button on the right, such as "Edit objectives". */
  action?: ReactNode
  children: ReactNode
}) {
  const label = <Heading id={id} className={SECTION_LABEL}>{children}</Heading>
  if (!action) return label
  return <div className="flex items-center justify-between gap-4">{label}{action}</div>
}
