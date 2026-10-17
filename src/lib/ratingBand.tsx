import { withAlpha } from '@/lib/with-alpha'
import { DEVELOPING_PURPLE } from '@/lib/fixed-colours'
export interface RatingBand {
  label: string;
  color: string;
}

export function getRatingBand(rating: number): RatingBand {
  if (rating >= 9.2) return { label: 'Exceptional', color: 'rgb(var(--t-brand))' };
  if (rating >= 8.2) return { label: 'Standout', color: 'rgb(var(--t-success))' };
  if (rating >= 7.2) return { label: 'Good', color: 'rgb(var(--t-success))' };
  if (rating >= 6.4) return { label: 'Steady', color: 'rgb(var(--t-info))' };
  if (rating >= 5.6) return { label: 'Mixed', color: 'rgb(var(--t-orange))' };
  if (rating >= 4.8) return { label: 'Developing', color: DEVELOPING_PURPLE };
  return { label: 'Difficult', color: 'rgb(var(--t-ink-3))' };
}

export const RatingBandPill = ({ rating }: { rating: number }) => {
  const band = getRatingBand(rating);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
      style={{
        color: band.color,
        background: `${withAlpha(band.color, 0.12)}`, // ~12% opacity
        border: `1px solid ${withAlpha(band.color, 0.25)}`, // ~25% opacity
      }}
    >
      {band.label}
    </span>
  );
};
