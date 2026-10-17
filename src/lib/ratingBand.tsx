import { withAlpha } from '@/lib/with-alpha'
import { BAND_COLOR } from '@/lib/types'
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
  return { label: 'Difficult', color: 'rgb(var(--t-ink-3))' };
}

export const RatingBandPill = ({ rating }: { rating: number }) => {
  const band = getRatingBand(rating);
  return (
    <span
      className="trak-dark inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
      style={{
        color: band.color,
        background: `linear-gradient(${withAlpha(band.color, 0.12)}, ${withAlpha(band.color, 0.12)}), rgb(var(--t-surface))`, // a dark pill
        border: `1px solid ${withAlpha(band.color, 0.25)}`, // ~25% opacity
      }}
    >
      {band.label}
    </span>
  );
};
