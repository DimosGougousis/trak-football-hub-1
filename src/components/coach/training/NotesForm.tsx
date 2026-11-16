import { useTranslation } from '@/lib/i18n'
import { useState } from 'react'
import { TRAINING_WORD } from '@/lib/training/words'
import { shown as shownWord } from '@/lib/squad/trait-words'
import { AGAIN, NOTE_MAX, type Again } from '@/lib/training/next'
import { useSaveNotes, type Notes, type Training } from './useTraining'
import { Button } from '@/components/arc/button/button'
import { Textarea } from '@/components/arc/textarea/textarea'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'

/** Notes, after the training (Kostas, 2 Nov): one question for the whole session and a note for next time. Optional:
 *  Skip and close closes it all the same. TRAK-456: on Training's card and the training's After training tab. */
export function NotesForm({ training, planned, onReview, onClosed }: { training: Training; planned: boolean; onReview: () => void; onClosed: () => void }) {
  const save = useSaveNotes()
  const { t } = useTranslation()
  const [again, setAgain] = useState<Again | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const close = (notes: Notes) => {
    setProblem(null)
    save.mutate({ eventId: training.id, ...notes }, {
      onSuccess: onClosed,
      onError: () => setProblem(t('coachTraining:couldntSaveNotes')),
    })
  }
  return <div className="grid gap-4">
    {/* As the mockup: the question and the note in one soft panel. */}
    <div className="grid gap-3 rounded-xl bg-ground p-4">
    <div className="grid justify-items-start gap-2">
      {/* The loop above already says Notes are optional. */}
      <p aria-hidden="true" className="text-[15px] font-medium text-ink">{t('coachTraining:runAgain')}</p>
      <SegmentedControl label={t('coachTraining:runAgain')} value={again ?? ''}
        options={AGAIN.map(a => ({ value: a.value, label: shownWord(TRAINING_WORD, a.label) }))} onValueChange={value => setAgain(value as Again)} />
    </div>
    <Textarea label={t('coachTraining:noteNextTime')} rows={2} maxLength={NOTE_MAX} value={note} onChange={e => setNote(e.target.value)}
      placeholder={t('coachTraining:noteExample')} />
    </div>
    {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" loading={save.isPending} onClick={() => close({ again, note })}>{t('coachTraining:saveClose')}</Button>
      {planned && <Button size="lg" variant="secondary" onClick={onReview}>{t('coachTraining:reviewToday')}</Button>}
      <Button variant="ghost" disabled={save.isPending} onClick={() => close({ again: null, note: '' })}>{t('coachTraining:skipClose')}</Button>
    </div>
  </div>
}
