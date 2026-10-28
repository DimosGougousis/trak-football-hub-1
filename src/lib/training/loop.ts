/* TRAK-298 (Training 5/5, spec TRAK-293): every training's loop, Plan → Who's here → Run it → Close, and where one
   is. Each step comes from what already exists, so nothing new is stored: a saved plan, a register taken (the
   event's completed session, TRAK-138), and the clock. Kostas, 28 Oct: Close is automatic: a training is closed once
   it has ended and its register is taken. */

export const LOOP_STEPS = ['Plan', 'Who’s here', 'Run it', 'Close'] as const

export type LoopFacts = {
  planned: boolean
  /** The register is taken: the training has its completed session. */
  registered: boolean
  started: boolean
  /** Over: its end, or as trainingEnd() reads it. */
  over: boolean
}

export type LoopState = {
  /** Each step, done or not. Run it is done once the training is over. */
  done: [boolean, boolean, boolean, boolean]
  /** The first step not done; 4 when every step is. */
  at: number
  /** Ended with its register taken. */
  closed: boolean
}

export function loopState({ planned, registered, over }: LoopFacts): LoopState {
  const closed = over && registered
  const done: LoopState['done'] = [planned, registered, over, closed]
  const at = done.indexOf(false)
  return { done, at: at < 0 ? 4 : at, closed }
}

/** What the current step says beside its name: "now" once the training has started, else "next". The plan is
 *  written before, so it is always now. */
export function loopNote(state: LoopState, started: boolean): string {
  return state.at === 0 || started ? 'now' : 'next'
}

/** "18:00" plus minutes, on a 24-hour clock: when each practice starts in Run it. */
export function clockPlus(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** When each practice starts, from the training's start: [18:00, 18:15, 18:40…]. Null when it has no time. */
export function practiceStarts(start: string | null, practices: { minutes: number }[]): (string | null)[] {
  let offset = 0
  return practices.map(practice => {
    const at = start ? clockPlus(start, offset) : null
    offset += practice.minutes
    return at
  })
}
