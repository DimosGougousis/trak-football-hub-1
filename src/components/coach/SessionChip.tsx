import type { ReactNode } from 'react'

/** A pill choice on the session screens (add and edit). */
export function SessionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors"
      style={{
        background: active ? 'rgb(var(--t-brand) / 0.12)' : 'rgb(var(--t-raised))',
        color: active ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))',
        border: `1px solid ${active ? 'rgb(var(--t-brand) / 0.3)' : 'rgb(var(--t-line))'}`,
        fontFamily: 'var(--t-font)',
      }}>
      {children}
    </button>
  )
}
