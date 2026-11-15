import { BANDS, BAND_COLOR } from '@/lib/types'
export interface RatingBand {
  label: string;
  color: string;
}

export function getRatingBand(rating: number): RatingBand {
  if (rating >= 9.2) return { label: 'Exceptional', color: BAND_COLOR.Exceptional };
  if (rating >= 8.2) return { label: 'Standout', color: BAND_COLOR.Standout };
  if (rating >= 7.2) return { label: 'Good', color: BAND_COLOR.Good };
  if (rating >= 6.4) return { label: 'Steady', color: BAND_COLOR.Steady };
  if (rating >= 5.6) return { label: 'Mixed', color: BAND_COLOR.Mixed };
  if (rating >= 4.8) return { label: 'Developing', color: BAND_COLOR.Developing };
  return { label: 'Difficult', color: BAND_COLOR.Difficult };
}

export const RatingBandPill = ({ rating }: { rating: number }) => {
  const band = getRatingBand(rating);
  const config = BANDS.find(b => b.word === band.label) ?? BANDS[BANDS.length - 1];
  return (
    // TRAK-229: as BandPill, the band's light tint with a dot in its colour; the word in Trak's ink.
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
      style={{ color: 'rgb(var(--t-ink))', background: config.bg, border: `1px solid ${config.border}` }}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: band.color }} />
      {band.label}
    </span>
  );
};
