import type { ReactNode } from 'react'
import { ClubNavBar } from './ClubNavBar'

export function ClubShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0A0A0B', fontFamily: "'DM Sans', sans-serif" }}>
      <div className="mx-auto max-w-[430px] px-5 pb-28 pt-6">{children}</div>
      <ClubNavBar />
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.22)',
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
        background: '#101012',
        border: '1px solid rgba(255,255,255,0.07)',
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
      <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 28, color: 'rgba(255,255,255,0.88)' }}>
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
          ? { color: '#C8F25A', background: 'rgba(200,242,90,0.12)', border: '1px solid rgba(200,242,90,0.25)' }
          : { color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }
      }
    >
      {label}
    </span>
  )
}
