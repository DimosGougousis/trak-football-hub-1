import PlayerMatchDetail from '@/pages/player/PlayerMatchDetail'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { ParentFamilyContent } from '@/components/parent/ParentFamily'
import { MobileShell } from '@/components/trak'
import { useChildrenAwaitingConsent } from '@/hooks/useParentData'

/* TRAK-73: the player's match detail inside the parent app. A child still
   awaiting this parent's approval shows only what the parent already saw on
   their list; while the approval list loads, or if it can't be read, the view
   stays limited (fails closed). */
export default function ParentMatchDetail() {
  const { selectedChild } = useParentChildren()
  const awaiting = useChildrenAwaitingConsent()
  const waiting = new Set(awaiting.data?.map(child => child.player_user_id))
  if (!selectedChild) return <MobileShell><ParentFamilyContent>{null}</ParentFamilyContent></MobileShell>
  return <ParentFamilyContent><PlayerMatchDetail key={selectedChild.id} role="parent" playerUserId={selectedChild.id}
    limitedFor={childId => !awaiting.isSuccess || waiting.has(childId.toLowerCase())} /></ParentFamilyContent>
}
