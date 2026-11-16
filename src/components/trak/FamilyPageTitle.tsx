import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/arc/avatar/avatar'
import { PageTitle } from '@/components/coach/PageTop'
import { useSideMenuScreen } from '@/lib/side-menu-screen'

/** TRAK-441 (spec "The frame"): a family tab's name on a phone, the coach's one page title beside the person's avatar.
 *  On a laptop the top bar has it, so the page draws none. */
export function FamilyPageTitle({ title }: { title: string }) {
  const { profile } = useAuth()
  if (useSideMenuScreen()) return null
  return <header className="arc flex items-center gap-3 pb-4">
    <Avatar name={profile?.full_name || title} size="md" /><PageTitle>{title}</PageTitle>
  </header>
}
