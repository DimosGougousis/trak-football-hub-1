import { useId, type ReactNode } from 'react'

/** Design standard: a card. Optional header (title, pill, action) and a footer strip under a soft hairline. A titled
 *  card is a region named by its title. */
export function SectionCard({ title, titleAs: Title = 'h3', pill, action, footer, as: Tag = 'section', children }: {
  title?: ReactNode
  /** The title's heading level: h3 under a section label (default), h2 where nothing labels the card from above. */
  titleAs?: 'h2' | 'h3'
  pill?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  as?: 'section' | 'div' | 'article'
  children?: ReactNode
}) {
  const titleId = useId()
  return <Tag aria-labelledby={title ? titleId : undefined} className="grid gap-6 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
    {(title || pill || action) && <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {title && <Title id={titleId} className="text-xl font-bold tracking-[-0.01em] text-ink">{title}</Title>}
        {pill}
      </div>
      {action}
    </div>}
    {children}
    {footer && <div className="border-t border-line-soft pt-5">{footer}</div>}
  </Tag>
}
