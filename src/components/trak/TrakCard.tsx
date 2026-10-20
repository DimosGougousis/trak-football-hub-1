import type { ReactNode } from 'react'

export function TrakCard({ children, elevated = false, className = '' }: { children: ReactNode; elevated?: boolean; className?: string }) {
  return (
    <div
      className={`${elevated ? 'bg-raised' : 'bg-surface'} rounded-[14px] p-4 border border-line transition-colors ${className}`}
    >
      {children}
    </div>
  )
}
