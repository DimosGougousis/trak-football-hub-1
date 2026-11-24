/* TRAK-497 (Imad, 19 and 20 Nov): every next step a coach is asked for (Take register, Evaluate, Publish, Share,
   View review, View log) is one button: Arc's green primary at the medium height (44 px), at least 128 px wide, with the
   control's 12 px corners. Evaluate keeps its arrow menu (a split button of the same size). */

/** Arc's Button size for a next step. */
export const NEXT_STEP_SIZE = 'md' as const
/** Its minimum width, so a short word ("Share") is as wide as a long one ("Take register"). */
export const NEXT_STEP_WIDTH = 'min-w-[128px]'
/** TRAK-561 (phone review, 23 Nov): beside Home's week Details and on an Events card, a next step is Details' size:
 *  Arc's small button (36 px), as wide as its words. */
export const NEXT_STEP_SMALL = 'sm' as const
