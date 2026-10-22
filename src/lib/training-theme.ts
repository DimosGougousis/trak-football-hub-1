// A training's theme: one of the Coaching Session Catalogue's seven libraries,
// picked on New event so the coach can find sessions for it in the catalogue.
//
// coach_calendar_events.training_theme stores the key, on trainings only. The
// database enforces the same keys (coach_calendar_events_training_theme_known);
// change both together. `library` is the catalogue's own name, which its
// ?lib= link selects; the counts are the catalogue's, and a test keeps them so.
export const TRAINING_THEMES = [
  { key: 'technical',     label: 'Technical',              library: 'Technical',                             sessions: 82, topics: 4 },
  { key: 'attacking',     label: 'Attacking',              library: 'Tactical – Attacking',                  sessions: 22, topics: 2 },
  { key: 'defending',     label: 'Defending',              library: 'Tactical – Defending',                  sessions: 53, topics: 3 },
  { key: 'transition',    label: 'Transition',             library: 'Tactical – Transition',                 sessions: 5,  topics: 1 },
  { key: 'goalkeeping',   label: 'Goalkeeping',            library: 'Goalkeeping',                           sessions: 16, topics: 1 },
  { key: 'physical',      label: 'Physical & movement',    library: 'Physical & movement (Play Phase 4–6)',  sessions: 15, topics: 1 },
  { key: 'psychological', label: 'Psychological & social', library: 'Psychological & social',                sessions: 3,  topics: 1 },
] as const

export type TrainingTheme = (typeof TRAINING_THEMES)[number]['key']

/** A stored value back as a theme key, or '' for none or anything unknown. */
export function trainingThemeFrom(value: string | null | undefined): TrainingTheme | '' {
  return TRAINING_THEMES.find(t => t.key === value)?.key ?? ''
}

/** The coach's Library, opened on a theme's library when there is one (TRAK-264: a theme's key is its library's address). */
export function catalogueLink(theme: TrainingTheme | '' | null | undefined): string {
  return TRAINING_THEMES.some(t => t.key === theme) ? `/coach/trainings/${theme}` : '/coach/trainings'
}
