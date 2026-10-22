/** TRAK-262 (Imad, 22 Oct): each squad, then All; the one picked is green. All is Home's only (Imad, 22 Oct). */
export function SquadPills({ squads, value, onChange }: { squads: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Squad">
    {[...squads, 'All'].map(name => <button key={name} type="button" aria-pressed={value === name} onClick={() => onChange(name)}
      className={`h-10 flex-none rounded-full px-4 text-[15px] transition-colors active:scale-[.97] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === name ? 'bg-brand text-on-brand' : 'bg-raised text-ink'}`}>
      {name}
    </button>)}
  </div>
}
