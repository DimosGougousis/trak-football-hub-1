import { useEffect, useState } from 'react'
import { trainingEnd, type TrainingEvent } from './sessions'

/* TRAK-493 (Imad, 19 Nov): a training from Mon 17 Nov still said "Started" days later. Once a training is over it says
   "Finished", as its badge already does; during it, "Started" stays. */

/** setTimeout's longest wait; a training further off than this can't end while the page is open. */
const MAX_TIMEOUT = 2_147_483_647

/** Whether a training is over (`trainingEnd`, the same end Training's lists and badge use). */
export const trainingEnded = (training: TrainingEvent, now = Date.now()) => trainingEnd(training) <= now

/** The same, turning true at the training's end while the page stays open. */
export function useTrainingEnded(training: TrainingEvent): boolean {
  const end = trainingEnd(training)
  const [ended, setEnded] = useState(() => Date.now() >= end)
  useEffect(() => {
    const left = end - Date.now()
    setEnded(left <= 0)
    if (left <= 0 || left > MAX_TIMEOUT) return
    const timer = setTimeout(() => setEnded(true), left + 250)
    return () => clearTimeout(timer)
  }, [end])
  return ended
}
