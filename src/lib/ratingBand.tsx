import { bandForScore } from '@/lib/rating-engine'
export interface RatingBand {
  label: string;
  color: string;
}

// TRAK-556: this kept its own ladder (9.2, 8.2, …); it now reads the one ladder, as every other screen does.
export function getRatingBand(rating: number): RatingBand {
  const band = bandForScore(rating);
  return { label: band.word, color: band.color };
}

export const RatingBandPill = ({ rating }: { rating: number }) => {
  const config = bandForScore(rating);
  return (
    // TRAK-229: as BandPill, the band's light tint with a dot in its colour; the word in Trak's ink.
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
      style={{ color: 'rgb(var(--t-ink))', background: config.bg, border: `1px solid ${config.border}` }}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.color }} />
      {config.word}
    </span>
  );
};
