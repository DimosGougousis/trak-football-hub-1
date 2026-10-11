import { useState, type DragEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { FileUp, Pencil, Trash2 } from 'lucide-react'
import {
  FIXTURE_TEMPLATE_CSV,
  checkRows,
  fixtureKey,
  readFixturesCsv,
  type Fixture,
  type FixtureField,
  type FixtureRow,
  type FixtureValues,
} from '@/lib/fixtures-csv'

/**
 * League fixtures from a CSV file (J8.6, TRAK-129): the coach drops the file,
 * checks every row, fixes or removes what can't be read, then confirms.
 *
 * Nothing is written before Confirm, and nothing is written here at all: the
 * schedule screen passes `onConfirm`, which saves. Rows whose fixture is
 * already on the schedule (`existingKeys`, from fixtureKey) are shown and
 * skipped, so importing the same file twice adds nothing.
 */
interface FixtureImportProps {
  onConfirm: (fixtures: Fixture[]) => Promise<void>
  existingKeys?: ReadonlySet<string>
}

const MAX_FILE_BYTES = 512 * 1024
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(FIXTURE_TEMPLATE_CSV)}`
const EDIT_FIELDS: { field: FixtureField; label: string; placeholder: string }[] = [
  { field: 'date', label: 'Date', placeholder: 'YYYY-MM-DD' },
  { field: 'kickoff', label: 'Kick-off', placeholder: '18:30' },
  { field: 'meetTime', label: 'Meet time', placeholder: '17:45' },
  { field: 'opponent', label: 'Opponent', placeholder: 'Empty for a training' },
  { field: 'homeAway', label: 'Home or away', placeholder: 'Home or Away' },
  { field: 'venue', label: 'Venue', placeholder: '' },
  { field: 'kit', label: 'Kit', placeholder: '' },
]

type Loaded = { rows: { line: number; values: FixtureValues }[]; monthFirstFile: boolean; warnings: string[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function looksLikeCsv(file: File): boolean {
  // Windows reports a CSV as application/vnd.ms-excel; the name decides.
  return /\.csv$/i.test(file.name) || file.type === 'text/csv'
}

function summary(f: Fixture): string {
  const day = format(parseISO(f.date), 'EEE d MMM')
  const what = f.kind === 'match'
    ? `Match vs ${f.opponent}${f.homeAway ? ` (${f.homeAway})` : ''}`
    : 'Training'
  return [day, f.kickoff ?? 'time to be confirmed', what].join(' · ')
}

export function FixtureImport({ onConfirm, existingKeys }: FixtureImportProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [fileProblem, setFileProblem] = useState<string[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [added, setAdded] = useState<number | null>(null)

  async function takeFile(file: File | undefined) {
    setAdded(null)
    setSaveFailed(false)
    setEditing(null)
    if (!file) return
    if (!looksLikeCsv(file)) {
      setLoaded(null)
      setFileProblem(["That's not a CSV file. Save the fixtures as CSV, or copy them into the template."])
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setLoaded(null)
      setFileProblem(['That file is too big for a fixture list. Split it into smaller files.'])
      return
    }
    let text: string
    try {
      text = await readText(file)
    } catch {
      setLoaded(null)
      setFileProblem(["Couldn't read that file. Try choosing it again."])
      return
    }
    const read = readFixturesCsv(text)
    if (read.fileErrors.length > 0) {
      setLoaded(null)
      setFileProblem(read.fileErrors)
      return
    }
    setFileProblem(null)
    setLoaded({ rows: read.rows.map(r => ({ line: r.line, values: r.values })), monthFirstFile: read.monthFirstFile, warnings: read.warnings })
  }

  const checked: FixtureRow[] = loaded ? checkRows(loaded.rows, loaded.monthFirstFile) : []
  const isKnown = (row: FixtureRow) => !!row.fixture && !!existingKeys?.has(fixtureKey(row.fixture))
  const toAdd = checked.filter(r => r.fixture && !isKnown(r)).map(r => r.fixture!)
  const needFixing = checked.filter(r => !r.fixture).length
  const known = checked.filter(isKnown).length

  function update(line: number, field: FixtureField, value: string) {
    setLoaded(l => l && { ...l, rows: l.rows.map(r => r.line === line ? { ...r, values: { ...r.values, [field]: value } } : r) })
  }
  function remove(line: number) {
    setLoaded(l => l && { ...l, rows: l.rows.filter(r => r.line !== line) })
    if (editing === line) setEditing(null)
  }

  async function confirm() {
    setSaving(true)
    setSaveFailed(false)
    try {
      await onConfirm(toAdd)
      setAdded(toAdd.length)
      setLoaded(null)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    void takeFile(e.dataTransfer?.files?.[0])
  }

  return (
    <section className="space-y-4">
      <div
        data-testid="fixture-drop-zone"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-[18px] border border-dashed border-white/[0.15] px-4 py-6 text-center"
      >
        <FileUp size={22} className="mx-auto text-white/40" />
        <label className="mt-3 inline-block cursor-pointer rounded-[12px] bg-[#C8F25A] px-4 py-2 text-[13px] font-semibold text-black">
          Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={e => { void takeFile(e.target.files?.[0]); e.target.value = '' }}
          />
        </label>
        <p className="mt-2 text-[12px] text-white/45">or drop it here</p>
        <p className="mt-3 text-[12px] text-white/45">
          CSV only. If your league sends a PDF, copy the fixtures into the template.{' '}
          <a href={TEMPLATE_HREF} download="trak-fixtures-template.csv" className="text-[#C8F25A] underline">
            Download the template
          </a>
        </p>
      </div>

      {fileProblem && (
        <div role="alert" className="rounded-[14px] border border-destructive/40 px-4 py-3 text-[13px] text-destructive">
          {fileProblem.map(p => <p key={p}>{p}</p>)}
        </div>
      )}

      {added !== null && <p className="text-[13px] text-[#C8F25A]">Added {plural(added, 'fixture', 'fixtures')}.</p>}

      {loaded && (
        <>
          {loaded.warnings.map(w => <p key={w} className="text-[12px] text-white/45">{w}</p>)}
          <p className="text-[12px] text-white/60">
            {[
              `${toAdd.length} to add`,
              needFixing > 0 ? `${needFixing} ${needFixing === 1 ? 'needs' : 'need'} fixing` : null,
              known > 0 ? `${known} already on your schedule` : null,
            ].filter(Boolean).join(' · ')}
          </p>

          <ul className="space-y-2">
            {checked.map(row => {
              const knownRow = isKnown(row)
              return (
                <li
                  key={row.line}
                  aria-label={`Line ${row.line}`}
                  className={`rounded-[14px] border px-4 py-3 ${row.fixture ? 'border-white/[0.07]' : 'border-destructive/60'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/40">Line {row.line}</p>
                      <p className="text-[13px] text-white/85">
                        {row.fixture ? summary(row.fixture) : (row.values.date || 'No date')}
                      </p>
                      {row.fixture?.venue && <p className="text-[12px] text-white/45">{row.fixture.venue}</p>}
                      {knownRow && <p className="text-[12px] text-white/45">Already on your schedule: not added again.</p>}
                      {row.problems.map(p => <p key={p} className="text-[12px] text-destructive">{p}</p>)}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Edit line ${row.line}`}
                        onClick={() => setEditing(editing === row.line ? null : row.line)}
                        className="rounded-full p-2 text-white/50"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove line ${row.line}`}
                        onClick={() => remove(row.line)}
                        className="rounded-full p-2 text-white/50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {editing === row.line && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {EDIT_FIELDS.map(({ field, label, placeholder }) => (
                        <label key={field} className="text-[11px] text-white/45">
                          {label}
                          <input
                            value={row.values[field]}
                            placeholder={placeholder}
                            onChange={e => update(row.line, field, e.target.value)}
                            className="mt-1 w-full rounded-[10px] bg-white/[0.05] px-2 py-1.5 text-[13px] text-white outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {saveFailed && (
            <p role="alert" className="text-[13px] text-destructive">
              Couldn't save the fixtures. Your rows are still here; try again.
            </p>
          )}

          {toAdd.length === 0 && needFixing === 0 ? (
            <p className="text-[13px] text-white/60">Nothing new to add: every fixture is already on your schedule.</p>
          ) : (
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={saving || needFixing > 0 || toAdd.length === 0}
              className="w-full rounded-[14px] bg-[#C8F25A] py-3 text-[14px] font-semibold text-black disabled:opacity-40"
            >
              {`Add ${plural(toAdd.length, 'fixture', 'fixtures')}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
