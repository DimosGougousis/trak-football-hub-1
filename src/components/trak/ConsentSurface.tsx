import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/* TRAK-182 (Imad's 6a): the consent request as a bar that grows into its
   details and back, in the manner of Arc's cookie bar. Our own surface: Arc's
   cookie-consent component treats Approve as "accept all", which would switch
   on optional purposes that must start off for children. One surface springs
   between faces without overshoot; reduced motion swaps them. Imad, 16 Oct: as
   Arc's, a Reject folds it into a 44px reopen button at the bottom left
   (`chip`), which grows back into the bar. */
export function ConsentSurface({ face, labelledBy, aboveNav = false, chip = false, children }: {
  face: string; labelledBy?: string
  /** The folded 44px reopen button; the children are the button itself. */
  chip?: boolean
  /** On a screen with the fixed NavBar (about 66px), sit above it. */
  aboveNav?: boolean
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 flex ${chip ? 'justify-start' : 'justify-center'} px-4 pointer-events-none ${aboveNav ? 'pb-[82px]' : 'pb-[max(16px,env(safe-area-inset-bottom))]'}`}>
      <motion.section layout={!reduced} role={chip ? undefined : 'region'} aria-labelledby={chip ? undefined : labelledBy}
        transition={{ type: 'spring', bounce: 0, visualDuration: 0.35 }}
        className={`arc pointer-events-auto border border-white/10 bg-[#141416]/95 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl ${chip
          ? 'size-11 rounded-full overflow-hidden'
          : 'w-full max-w-[398px] max-h-[85dvh] overflow-y-auto rounded-[22px] p-5'}`}>
        <motion.div key={face} className={chip ? 'size-full' : undefined} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}>
          {children}
        </motion.div>
      </motion.section>
    </div>
  )
}
