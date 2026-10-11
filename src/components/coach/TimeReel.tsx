import { useEffect, useMemo, useRef } from 'react'
import { clockLabel, compose, dayOptions, longDay, pad, parse, shortDay } from '@/lib/time-reel'

/**
 * TRAK-157 (J8.4): the coach's date and time wheel. In the 11 Oct live run a
 * half-entered <input type="time"> (hour and minutes, no AM/PM) stayed empty,
 * and 8 published trainings said "Time to be confirmed". Here every column
 * always holds a whole value: the time is picked whole or not at all.
 *
 * Columns roll and snap like a phone's clock (CSS scroll snap, no library);
 * the row in the middle band is the choice. Tapping a row picks it too, for
 * keyboards and screen readers. Times are 12-hour with AM/PM, minutes in 5s;
 * the value stays "HH:MM" (24-hour), as the form and database store it.
 */
interface TimeReelProps {
  /** "Start", "Kickoff" or "Meet time": names the columns ("Start hour"). */
  label: string
  /** "HH:MM", or '' when none is picked yet. */
  time: string
  onTimeChange: (time: string) => void
  /** With a date, a day column comes first. */
  date?: string
  onDateChange?: (date: string) => void
  /** "This and following weeks": each week keeps its own date. */
  dateLocked?: boolean
  /** "Time not set yet": the time columns rest and change nothing. */
  disabled?: boolean
  /** The heading while no time is picked. */
  emptyText?: string
}

import type { ReelOption as Option } from '@/lib/time-reel'

const ROW = 40
const VISIBLE = 5
const font = { fontFamily: "'DM Sans', sans-serif" }

function ReelColumn({ name, options, selected, rest = selected, onSelect, disabled = false, align = 'center', grow = false }: {
  name: string, options: Option[], selected: string, onSelect: (value: string) => void,
  /** The row to rest on while nothing is picked; it isn't chosen until the coach moves. */
  rest?: string,
  disabled?: boolean, align?: 'left' | 'center' | 'right', grow?: boolean,
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<number>()
  // Where we last put the column ourselves: a scroll ending there is ours, not the coach's.
  const placed = useRef(-1)
  const index = options.findIndex(o => o.value === selected)

  const restIndex = index >= 0 ? index : Math.max(0, options.findIndex(o => o.value === rest))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    placed.current = restIndex * ROW
    el.scrollTop = placed.current
  }, [restIndex])

  const onScroll = () => {
    if (disabled) return
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = ref.current
      if (!el || Math.abs(el.scrollTop - placed.current) < ROW / 2) return
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)))
      placed.current = i * ROW
      if (options[i].value !== selected) onSelect(options[i].value)
    }, 120)
  }
  useEffect(() => () => window.clearTimeout(settle.current), [])

  return (
    <div ref={ref} role="listbox" aria-label={name} aria-disabled={disabled || undefined} onScroll={onScroll}
      className={`relative overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${grow ? 'flex-1' : 'w-[52px]'}`}
      style={{
        height: ROW * VISIBLE, paddingBlock: ROW * 2, overflowY: disabled ? 'hidden' : 'auto',
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        opacity: disabled ? 0.3 : 1,
      }}>
      {options.map(option => {
        const on = option.value === selected
        return (
          <button key={option.value} type="button" role="option" aria-selected={on} disabled={disabled}
            onClick={() => onSelect(option.value)}
            className="block w-full snap-center whitespace-nowrap tabular-nums"
            style={{
              ...font, height: ROW, textAlign: align, paddingInline: 4,
              fontSize: on ? 19 : 16, fontWeight: on ? 600 : 400,
              color: on ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
            }}>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function TimeReel({ label, time, onTimeChange, date, onDateChange, dateLocked = false, disabled = false, emptyText = 'Pick a time' }: TimeReelProps) {
  const { hour, minute, half } = parse(time)
  const days = useMemo(() => (date === undefined ? [] : dayOptions(date)), [date])
  const minutes = useMemo(() => {
    const list = Array.from({ length: 12 }, (_, i) => pad(i * 5))
    if (time && !list.includes(minute)) list.push(minute)
    return list.sort().map(m => ({ value: m, label: m }))
  }, [time, minute])
  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), [])
  const halves = useMemo(() => [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }], [])

  // Switched off, the rows are disabled buttons and a roll is ignored (onScroll).
  const set = (next: Partial<{ hour: string, minute: string, half: string }>) => {
    onTimeChange(compose(next.hour ?? hour, next.minute ?? minute, next.half ?? half))
  }
  const shown = time && !disabled
  const heading = shown ? (date ? `${shortDay(date)} at ${clockLabel(time)}` : clockLabel(time)) : emptyText

  return (
    <div className="rounded-[16px] px-3 pt-3 pb-2 space-y-1" style={{ background: '#0A0A0B', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="block text-[9px] tracking-[0.1em] uppercase text-white/40" style={{ fontFamily: "'DM Mono', monospace" }}>{label}</span>
      <p className="text-[18px] font-medium" style={{ ...font, color: shown ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)' }}>{heading}</p>
      {date && <p className="text-[12px] text-white/45" style={font}>{longDay(date)}</p>}
      <div className="relative flex items-stretch gap-1 pt-1">
        {/* The middle band: whatever rests here is the choice. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-[10px]"
          style={{ top: 4 + ROW * 2, height: ROW, background: 'rgba(255,255,255,0.07)' }} />
        {date !== undefined && onDateChange && (
          <ReelColumn name={`${label} day`} options={days} selected={date} grow align="right"
            disabled={dateLocked} onSelect={d => { if (!dateLocked) onDateChange(d) }} />
        )}
        {/* Nothing picked yet: the columns rest on 6:00 PM without choosing it. */}
        <ReelColumn name={`${label} hour`} options={hours} selected={time ? hour : ''} rest={hour} disabled={disabled} onSelect={h => set({ hour: h })} align="right" />
        <ReelColumn name={`${label} minute`} options={minutes} selected={time ? minute : ''} rest={minute} disabled={disabled} onSelect={m => set({ minute: m })} />
        <ReelColumn name={`${label} AM or PM`} options={halves} selected={time ? half : ''} rest={half} disabled={disabled} onSelect={p => set({ half: p })} align="left" />
      </div>
    </div>
  )
}
