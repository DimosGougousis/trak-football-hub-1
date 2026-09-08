import type { ReactNode } from 'react'

export function TrakCard({ children, elevated = false, className = '' }: { children: ReactNode; elevated?: boolean; className?: string }) {
  return (
    <div
      className={`${elevated ? 'bg-[#17171A]' : 'bg-[#101012]'} rounded-[14px] p-4 border border-white/[0.07] transition-colors ${className}`}
    >
      {children}
    </div>
  )
}
