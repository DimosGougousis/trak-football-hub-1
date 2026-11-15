interface PillSelectorProps {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
  label?: string
}

export function PillSelector({ options, value, onChange, label }: PillSelectorProps) {
  return (
    <div className="space-y-2">
      {label && (
        <span
          className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-3"
          style={{ fontFamily: 'var(--t-font-mono)' }}
        >
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-[10px] text-sm transition-colors ${
              value === opt.value
                ? 'border-brand bg-brand/[0.08] text-ink'
                : 'border-line bg-raised text-ink-3'
            } border`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
