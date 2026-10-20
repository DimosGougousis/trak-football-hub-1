import { bandForScore } from '@/lib/rating-engine'

export type AssessmentScores = {
  work_rate: number; tactical: number; attitude: number; technical: number; physical: number; coachability: number
}

/** One assessment's six coach bands: on player Home, and on the assessment's own screen (TRAK-171). */
export function AssessmentBands({ scores }: { scores: AssessmentScores }) {
  return (
    <ul aria-label="Your bands" className="space-y-3 mt-4">
      {[
        { label: 'Work Rate',    score: scores.work_rate    },
        { label: 'Tactical',     score: scores.tactical     },
        { label: 'Attitude',     score: scores.attitude     },
        { label: 'Technical',    score: scores.technical    },
        { label: 'Physical',     score: scores.physical     },
        { label: 'Coachability', score: scores.coachability },
      ].map(cat => {
        // TRAK-110: the scores are NOT NULL, so 0 is a real score;
        // `|| 5` used to turn it into "Mixed".
        const band = bandForScore(cat.score)
        return (
        <li key={cat.label} className="flex items-center gap-2">
          <span className="w-[90px] flex-shrink-0 text-[9px] font-medium tracking-[0.12em] uppercase text-ink-3"
            style={{ fontFamily: 'var(--t-font-mono)' }}>{cat.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-raised overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(cat.score / 10) * 100}%`, backgroundColor: band.color }} />
          </div>
          <span className="text-[11px] flex-shrink-0 w-[72px] text-right" style={{ color: band.color }}>
            {band.word}
          </span>
        </li>
        )
      })}
    </ul>
  )
}
