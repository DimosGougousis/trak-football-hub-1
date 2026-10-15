import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/* TRAK-182 (Imad's 6a): the consent request as a bar that grows into its
   details and back, in the manner of Arc's cookie bar. Our own surface: Arc's
   cookie-consent component treats Approve as "accept all", which would switch
   on optional purposes that must start off for children. One surface springs
   between faces without overshoot; reduced motion swaps them. */
export function ConsentSurface({ face, labelledBy, aboveNav = false, children }: {
  face: string; labelledBy: string
  /** On a screen with the fixed NavBar (about 66px), sit above it. */
  aboveNav?: boolean
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pointer-events-none ${aboveNav ? 'pb-[82px]' : 'pb-[max(16px,env(safe-area-inset-bottom))]'}`}>
      <motion.section layout={!reduced} role="region" aria-labelledby={labelledBy}
        transition={{ type: 'spring', bounce: 0, visualDuration: 0.35 }}
        className="arc pointer-events-auto w-full max-w-[398px] max-h-[85dvh] overflow-y-auto rounded-[22px] border border-white/10 bg-[#141416]/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <motion.div key={face} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}>
          {children}
        </motion.div>
      </motion.section>
    </div>
  )
}
