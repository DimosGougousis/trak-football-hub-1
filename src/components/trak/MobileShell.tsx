import { forwardRef, type ReactNode } from 'react'

export const MobileShell = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function MobileShell({ children }, ref) {
    return (
      <div ref={ref} className="mx-auto max-w-[430px] min-h-screen bg-[#0A0A0B] px-5 pb-24">
        {children}
      </div>
    )
  },
)
