import type { ComponentProps } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from '@/lib/i18n'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { CoachTrail } from '@/components/coach/CoachTrail'

/** TRAK-433 (Imad, 16 Nov): on a phone every coach page has the avatar that opens the side menu. An inner page with a
 *  trail and no title row of its own (PageTop's) puts it beside the trail, as Sessions and a Library page do (TRAK-379).
 *  On a laptop both are null (the sidebar and the top bar), so `empty:hidden` leaves no gap in a grid header. */
export function MenuTrail(props: ComponentProps<typeof CoachTrail>) {
  const { profile } = useAuth()
  const { t } = useTranslation()
  return <div className="flex min-w-0 items-center gap-3 empty:hidden">
    <CoachMenuButton name={profile?.full_name || t('nav:coach')} />
    <CoachTrail {...props} />
  </div>
}
