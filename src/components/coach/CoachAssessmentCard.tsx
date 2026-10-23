import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/arc/card/card'
import { SplitButton } from '@/components/arc/split-button/split-button'
import { CategoryBar, MetadataLabel } from '@/components/trak'
import { scoreToBand } from '@/lib/rating-engine'
import { BANDS } from '@/lib/types'

export interface CoachAssessment {
  id: string
  created_at: string
  published_at: string | null
  work_rate: number; tactical: number; attitude: number; technical: number; physical: number; coachability: number
  coach_sessions?: { title: string | null; session_date: string | null } | null
}

const average = (a: CoachAssessment) =>
  (a.work_rate + a.tactical + a.attitude + a.technical + a.physical + a.coachability) / 6

/**
 * TRAK-200 (Imad, 18 Oct): one assessment as Arc's card. Top left says Draft
 * or Published; the bands; the overall band bottom left; Publish (a draft) or
 * Published bottom right, with Edit (and Unpublish) behind its chevron.
 * Tapping opens the quick look: opponent, date, the message, the private note.
 * A draft is the coach's alone, bands included (published_at NULL); Publish
 * shows the bands and the message to the family, Unpublish hides both.
 */
export function CoachAssessmentCard({ assessment, playerName, message, messageFailed = false, note, onChanged }: {
  assessment: CoachAssessment
  playerName?: string
  message?: string | null
  /** The message couldn't be read: say so, never "No message". Publishing doesn't depend on it. */
  messageFailed?: boolean
  note?: string | null
  onChanged?: (published: boolean) => void
}) {
  const navigate = useNavigate()
  const [published, setPublished] = useState(assessment.published_at != null)
  const [busy, setBusy] = useState(false)
  const band = scoreToBand(average(assessment))
  const bandWord = BANDS.find(b => b.word.toLowerCase() === band)?.word ?? band
  const date = new Date(assessment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const label = published ? 'Published' : 'Draft'

  const setPublishedTo = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      // One transaction (Tarek's review of #364): the bands and the message change together or not at
      // all, whatever this screen managed to read. Not this coach's, or gone: an error, never "done".
      const { error } = await supabase.rpc('set_assessment_published' as never,
        { p_assessment_id: assessment.id, p_published: next } as never)
      if (error) throw error
      setPublished(next)
      onChanged?.(next)
      toast.success(next ? 'Published. The player and their parents can see it.' : 'Unpublished. Only you can see it now.')
    } catch {
      toast.error(next ? 'Not published. Check your connection and try again.' : 'Not unpublished. The family may still see it. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const edit = { label: 'Edit', onSelect: () => navigate(`/coach/assess?assessment=${assessment.id}`) }
  return (
    // TRAK-229: a light Arc card like the rest; each bar carries its band's colour.
    <Card
      className="arc"
      aria-label={`${label} assessment${playerName ? `, ${playerName}` : ''}, ${date}`}
      title={label}
      description={playerName}
      meta={bandWord}
      action={<SplitButton
        label={published ? 'Published' : 'Publish'}
        variant={published ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={published ? undefined : () => void setPublishedTo(true)}
        actions={published ? [edit, { label: 'Unpublish', onSelect: () => void setPublishedTo(false) }] : [edit]}
      />}
      details={<div className="space-y-3 text-sm">
        <p className="text-foreground">{assessment.coach_sessions?.title ?? 'No session recorded'}</p>
        <p className="text-muted-foreground">{date}</p>
        <div>
          <MetadataLabel text="MESSAGE TO THE PLAYER" />
          <p className="mt-1 text-foreground">{messageFailed ? "Couldn't load the message. Publish still sends it." : message || 'No message'}</p>
        </div>
        {note ? <div>
          <MetadataLabel text="PRIVATE NOTE · ONLY YOU" />
          <p className="mt-1 italic text-muted-foreground">{note}</p>
        </div> : null}
      </div>}
    >
      <div className="space-y-2.5 mt-2">
        <CategoryBar label="Work Rate" score={assessment.work_rate} />
        <CategoryBar label="Technical" score={assessment.technical} />
        <CategoryBar label="Physical" score={assessment.physical} />
        <CategoryBar label="Coachability" score={assessment.coachability} />
        <CategoryBar label="Attitude" score={assessment.attitude} />
        <CategoryBar label="Tactical" score={assessment.tactical} />
      </div>
    </Card>
  )
}
