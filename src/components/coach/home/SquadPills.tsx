/** TRAK-262/266 (Imad, 22 Oct): All, then each squad; the one picked is green. TRAK-305: one set, at the top of the
 *  coach's frame, sets what every coach page shows; a new event still starts on the last single squad picked. */
export function SquadPills({ squads, value, onChange, compact = false }: {
  squads: string[]; value: string; onChange: (value: string) => void
  /** The laptop's top bar: a little shorter than a page's. */
  compact?: boolean
}) {
  return <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Age group">
    {['All', ...squads].map(name => <button key={name} type="button" aria-pressed={value === name} onClick={() => onChange(name)}
      className={`${compact ? 'h-9 px-3.5 text-[14px]' : 'h-10 px-4 text-[15px]'} flex-none rounded-full transition-colors active:scale-[.97] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === name ? 'bg-brand text-on-brand' : 'bg-raised text-ink'}`}>
      {name}
    </button>)}
  </div>
}
