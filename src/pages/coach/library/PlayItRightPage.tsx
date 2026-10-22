import { LIBRARY_PATH } from '@/lib/library/library'
import { ChevronLeft, RoundLink } from './parts'

/* TRAK-264: Play It Right keeps its own page for now (TRAK-264's first version
   is the Library's look), opened from the Library with a way back. The page is
   static HTML in public/trainings; vercel.json lets only /trainings/* run inline
   scripts and be framed, and only by this site. */

export default function PlayItRightPage() {
  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className="trak-wide mx-auto flex items-center gap-3 px-5 pt-3.5 pb-3">
        <RoundLink to={LIBRARY_PATH} label="Back to Library"><ChevronLeft /></RoundLink>
        <h1 className="text-[22px] font-bold text-ink">Play It Right</h1>
      </div>
      <iframe
        title="Play It Right"
        src="/trainings/play-it-right.html"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        // TRAK-199: beside a coach's laptop side menu there is no bottom bar, so the frame runs to the bottom (index.css).
        className="trak-trainings-frame block h-[calc(100dvh-170px)] w-full border-0 bg-surface"
      />
    </div>
  )
}
