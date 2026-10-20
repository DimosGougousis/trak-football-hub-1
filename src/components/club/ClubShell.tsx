import type { ReactNode } from 'react'
import { ClubNavBar } from './ClubNavBar'

export function ClubShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'rgb(var(--t-ground))', fontFamily: 'var(--t-font)' }}>
      <div className="mx-auto max-w-[430px] px-5 pb-28 pt-6">{children}</div>
      <ClubNavBar />
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--t-font-mono)',
        fontSize: 9,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'rgb(var(--t-ink-3))',
      }}
    >
      {children}
    </div>
  )
}

export function ClubCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        background: 'rgb(var(--t-surface))',
        border: '1px solid rgb(var(--t-line))',
        borderRadius: 18,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function ClubHeader({ club = 'Academy', coaches = 0 }: { club?: string; coaches?: number }) {
  return (
    <div className="mb-6">
      <h1 style={{ fontFamily: 'var(--t-font)', fontWeight: 300, fontSize: 28, color: 'rgb(var(--t-ink))' }}>
        {club}
      </h1>
      <div className="mt-3 flex gap-2">
        <Pill label="Pilot Active" accent />
        <Pill label={`${coaches} Coaches`} />
      </div>
    </div>
  )
}

export function Pill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs"
      style={
        accent
          ? { color: 'rgb(var(--t-brand))', background: 'rgb(var(--t-brand) / 0.12)', border: '1px solid rgb(var(--t-brand) / 0.25)' }
          : { color: 'rgb(var(--t-ink-3))', background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))' }
      }
    >
      {label}
    </span>
  )
}
