"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import type { AnimationPlaybackControls, MotionValue, Variants } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import { useToday } from "../lib/use-today";
import styles from "./calendar.module.css";

export type CalendarDateMatcher = (date: Date) => boolean;

export type CalendarMark = string | { color: string; hollow?: boolean };

export interface CalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  month?: Date;
  onMonthChange?: (month: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: CalendarDateMatcher;
  locale?: string;
  className?: string;
  /** Adds a Today button that slides back to the current month and selects today when it is available. */
  showToday?: boolean;
  /** Trak: event dots under a day; hollow marks distinguish cancellations without colour alone. */
  marks?: (date: Date) => CalendarMark[];
  /** Trak (TRAK-255): a day with something waiting for the user gets an amber corner, read as "needs you". */
  attention?: (date: Date) => boolean;
  /** Trak (Dimos, 29 Oct): shows this many weeks instead of a month, opening on the current week. The arrows move all
   *  but one of them, so the last week shown becomes the top one. `month` and `onMonthChange` then carry the first day
   *  shown; a `month` set to any date shows the window it falls in. */
  weeks?: number;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const sameDay = (a?: Date, b?: Date) => Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
const sameMonth = (a?: Date, b?: Date) => Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth());
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
/** Moves by whole months and keeps the day, clamped to the shorter month: January 31 plus one month is February 28. */
const shiftMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + amount + 1, 0).getDate()));
const isBefore = (a: Date, b?: Date) => Boolean(b && startOfDay(a).getTime() < startOfDay(b).getTime());
const isAfter = (a: Date, b?: Date) => Boolean(b && startOfDay(a).getTime() > startOfDay(b).getTime());
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
/** Trak: weeks start on Monday, as Schedule and the Home week strip do (TRAK-163). */
const weekday = (date: Date) => (date.getDay() + 6) % 7;
/** Every month shows six weeks, so the grid keeps one height and never jumps while months change. */
const makeWeeks = (start: Date, rows = 6) =>
  Array.from({ length: rows }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
/** Trak: weeks counted from Monday 1 January 2024, in whole days, so a clock change never shifts one. */
const weekIndex = (date: Date) => Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2024, 0, 1)) / 6048e5);
const fromWeek = (index: number) => new Date(2024, 0, 1 + index * 7);

/**
 * Trak (Dimos, 29 Oct): what one pane of the strip shows. A month pane is the month's six weeks; a week pane is `rows`
 * weeks from a Monday, the windows counted from this week in steps of `step`. The strip measures its position in panes'
 * indexes (months, or weeks) and moves `step` at a time.
 */
interface Pager {
  rows: number;
  step: number;
  /** The pane a date is shown in. */
  indexOf: (date: Date) => number;
  /** The day `month` and `onMonthChange` carry for a pane. */
  dateOf: (index: number) => Date;
  gridStart: (index: number) => Date;
  /** A pane's own days: in a month pane the others belong to the months either side. */
  owns: (date: Date, index: number) => boolean;
  first: (index: number) => Date;
  last: (index: number) => Date;
  /** The month the title's month picker marks as shown. */
  monthOf: (index: number) => Date;
}

const monthPager: Pager = {
  rows: 6,
  step: 1,
  indexOf: (date) => monthIndex(date),
  dateOf: (index) => fromIndex(index),
  gridStart: (index) => addDays(fromIndex(index), -weekday(fromIndex(index))),
  owns: (date, index) => sameMonth(date, fromIndex(index)),
  first: (index) => fromIndex(index),
  last: (index) => addDays(fromIndex(index + 1), -1),
  monthOf: (index) => fromIndex(index),
};

const weekPager = (rows: number, anchor: number): Pager => {
  const step = Math.max(1, rows - 1);
  return {
    rows,
    step,
    indexOf: (date) => anchor + step * Math.floor((weekIndex(date) - anchor) / step),
    dateOf: fromWeek,
    gridStart: fromWeek,
    owns: (date, index) => weekIndex(date) >= index && weekIndex(date) < index + rows,
    first: fromWeek,
    last: (index) => addDays(fromWeek(index), rows * 7 - 1),
    monthOf: (index) => monthStart(addDays(fromWeek(index), Math.floor((rows * 7) / 2))),
  };
};

const subscribeNothing = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
/** The viewer's local date (lib/use-today.ts, shared with date-range-picker). Re-exported so existing imports from calendar keep working. */
export { useToday } from "../lib/use-today";

const { spring, duration, ease } = motionTokens;
/** Months sit side by side on one strip. Rapid clicks retarget the same spring, so the strip never queues or stacks panes. */
const stripSpring = { type: "spring", visualDuration: 0.36, bounce: 0, restDelta: 0.002 } as const;
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();
const fromIndex = (index: number) => new Date(Math.floor(index / 12), ((index % 12) + 12) % 12, 1);

/** The title crossfades in place: the old month leaves toward the side the strip travels to while the new one arrives from the other. */
const titleSlide: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 12 }),
  center: { opacity: 1, x: 0, transition: { duration: duration.standard, ease: ease.enter } },
  exit: (direction: number) => ({ opacity: 0, x: direction * -12, transition: { duration: 0.14, ease: ease.standard } }),
};
/** Reduced motion swaps the title in place, with no travel and no blank frame. */
const titleFade: Variants = { enter: { opacity: 1, x: 0 }, center: { opacity: 1, x: 0, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0 } } };

/**
 * The selected disc of one month. It is positioned by week and weekday rather than measured, so it glides on a straight
 * line between any two days, keeps gliding while the strip slides, and retargets mid-flight on a new pick.
 * It only grows in or fades out when the selection enters or leaves this month.
 */
function SelectionDisc({ cell, reduced }: { cell: number; reduced: boolean }) {
  const visible = cell >= 0;
  const col = useMotionValue(visible ? cell % 7 : 0);
  const row = useMotionValue(visible ? Math.floor(cell / 7) : 0);
  const opacity = useMotionValue(visible ? 1 : 0);
  const scale = useMotionValue(visible ? 1 : 0.6);
  // Each step is one cell plus the 4px gap; percentages resolve against the disc's own size, which matches a cell.
  const transform = useTransform(() => `translate(calc(${col.get()} * (100% + 4px)), calc(${row.get()} * (100% + 4px))) scale(${scale.get()})`);
  const hidden = useRef(!visible);
  useLayoutEffect(() => {
    if (!visible) {
      hidden.current = true;
      const fade = reduced ? { duration: 0 } : { duration: 0.14, ease: ease.standard };
      const controls = [animate(opacity, 0, fade), animate(scale, 0.6, fade)];
      return () => controls.forEach((control) => control.stop());
    }
    const nextCol = cell % 7, nextRow = Math.floor(cell / 7);
    const controls: AnimationPlaybackControls[] = [];
    if (hidden.current || reduced) { col.jump(nextCol); row.jump(nextRow); }
    else controls.push(animate(col, nextCol, spring.morph), animate(row, nextRow, spring.morph));
    hidden.current = false;
    controls.push(animate(opacity, 1, reduced ? { duration: 0 } : { duration: duration.fast, ease: ease.enter }), animate(scale, 1, reduced ? { duration: 0 } : spring.snappy));
    return () => controls.forEach((control) => control.stop());
  }, [cell, visible, reduced, col, row, opacity, scale]);
  return <motion.span className={styles.highlight} style={{ transform, opacity }} aria-hidden="true"><span className={styles.highlightFill} /></motion.span>;
}

/** Trak (TRAK-157): React 18 has no boolean `inert` prop; it renders the attribute from an empty string. */
const inertUnless = (present: boolean) => (present ? {} : ({ inert: "" } as Record<string, string>));

/** One month on the strip. Only the month being navigated to is focusable and exposed; the one sliding past is inert. */
function MonthPane({ index, step, position, present, children }: { index: number; step: number; position: MotionValue<number>; present: boolean; children: ReactNode }) {
  const x = useTransform(position, (value) => `calc(${((index - value) / step) * 100}% + ${((index - value) / step) * 16}px)`);
  const opacity = useTransform(position, (value) => 1 - Math.min(1, Math.abs(index - value) / step) * 0.6);
  return <motion.div className={styles.monthBody} style={{ x, opacity }} data-present={present || undefined} aria-hidden={present ? undefined : true} {...inertUnless(present)}>{children}</motion.div>;
}

export function Calendar({
  value,
  onChange,
  month: controlledMonth,
  onMonthChange,
  minDate,
  maxDate,
  disabledDates,
  locale = "en-US",
  className,
  showToday = false,
  marks,
  attention,
  weeks,
}: CalendarProps) {
  const titleId = useId();
  const today = useToday();
  // Motion preference only counts after hydration, so server and client markup agree.
  const hydrated = useSyncExternalStore(subscribeNothing, clientSnapshot, serverSnapshot);
  const reducedMotion = (useReducedMotion() ?? false) && hydrated;
  const [internalMonth, setInternalMonth] = useState(() => value);
  const [focusedDate, setFocusedDate] = useState(value);
  /** Trak (TRAK-157): the title opens twelve months at a time, so March next year is two taps, not five.
   *  TRAK-256: they start five months before the shown one, so recent months are there too. */
  const [picking, setPicking] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(null);
  // Without a value or month the calendar waits for the client's today, then settles on that month once.
  const fallback = value ?? today;
  // Trak: weeks are counted from this week, so the first window opens on it.
  const anchorWeek = weekIndex(today ?? fallback ?? new Date(2024, 0, 1));
  const pager = useMemo(() => (weeks ? weekPager(weeks, anchorWeek) : monthPager), [weeks, anchorWeek]);
  const month = controlledMonth ?? internalMonth ?? fallback;
  if (!controlledMonth && !internalMonth && month) setInternalMonth(month);
  // The strip position is measured in panes' indexes. The panes on either side of it render, plus the one being navigated to.
  const target = month ? pager.indexOf(month) : 0;
  const ready = month !== undefined;
  const monthKey = ready ? String(target) : "pending";
  // Direction is read from the pane itself, so arrows, keys, Today, and a controlled month all travel the same way.
  const [shownMonth, setShownMonth] = useState(ready ? target : undefined);
  const [direction, setDirection] = useState(0);
  if (ready && shownMonth !== target) {
    setShownMonth(target);
    setDirection(shownMonth === undefined ? 0 : target > shownMonth ? 1 : -1);
  }
  const grid = useMemo(() => (ready ? makeWeeks(pager.gridStart(target), pager.rows) : []), [ready, pager, target]);
  const { step } = pager;
  const position = useMotionValue(target);
  const [span, setSpan] = useState<[number, number]>([target, target]);
  useMotionValueEvent(position, "change", (value) => {
    // Panes sit `step` apart, counted from the one being navigated to.
    const away = (value - target) / step;
    const next: [number, number] = [target + step * Math.floor(away + 1e-3), target + step * Math.ceil(away - 1e-3)];
    setSpan((current) => (current[0] === next[0] && current[1] === next[1] ? current : next));
  });
  const placed = useRef(ready);
  const lastTarget = useRef(target);
  useLayoutEffect(() => {
    if (!ready) return;
    const from = position.get();
    const aligned = (target - lastTarget.current) % step === 0;
    lastTarget.current = target;
    if (from === target) return;
    // The first month and reduced motion land in place; everything else slides on the strip.
    if (!placed.current || reducedMotion) { placed.current = true; position.jump(target); return; }
    // Long jumps (Today, a year with Shift) start one pane away, so the strip never scrolls through the panes between.
    // So does a window that doesn't line up with the one shown, so no pane slides past with the wrong days.
    if (Math.abs(target - from) > 2 * step || !aligned) position.jump(target - Math.sign(target - from) * step);
    const controls = animate(position, target, stripSpring);
    return () => controls.stop();
  }, [ready, target, reducedMotion, position, step]);
  const paneIndexes = Array.from(new Set([span[0], span[1], target])).sort((a, b) => a - b);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  /** Trak: a window of weeks is named by its first and last day, "26 Oct – 29 Nov 2026", with both years when they differ. */
  const rangeLabel = (first: Date, last: Date) => first.getFullYear() === last.getFullYear()
    ? `${dayFormatter.format(first)} – ${dayFormatter.format(last)} ${last.getFullYear()}`
    : `${dayFormatter.format(first)} ${first.getFullYear()} – ${dayFormatter.format(last)} ${last.getFullYear()}`;
  const paneLabel = (index: number) => (weeks ? rangeLabel(pager.first(index), pager.last(index)) : formatter.format(fromIndex(index)));
  const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short" }), [locale]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(2024, 0, 8 + index))), [weekdayFormatter]);
  const monthLabel = ready ? paneLabel(target) : "";
  // The selected disc glides between days, so each number flips color as the disc actually passes it:
  // the day it leaves waits longer on short hops, the day it lands on waits longer on long ones.
  const valueKey = value ? dateKey(value) : "";
  const [last, setLast] = useState({ key: valueKey, date: value });
  const [handoff, setHandoff] = useState({ from: "", to: "", distance: 0 });
  if (last.key !== valueKey) {
    const days = last.date && value ? Math.round((startOfDay(value).getTime() - startOfDay(last.date).getTime()) / 864e5) : 0;
    const columns = last.date && value ? weekday(value) - weekday(last.date) : 0;
    setLast({ key: valueKey, date: value });
    setHandoff({ from: last.key, to: valueKey, distance: Math.hypot(columns, (days - columns) / 7) });
  }
  const numberDelay = (key: string): CSSProperties | undefined => {
    if (!handoff.distance || reducedMotion || (key !== handoff.to && key !== handoff.from)) return undefined;
    const delay = key === handoff.to ? Math.min(260, 95 + 85 * Math.log(handoff.distance)) : Math.max(20, 130 / handoff.distance);
    return { "--number-delay": `${Math.round(delay)}ms` } as CSSProperties;
  };

  const isDisabled = (date: Date) => isBefore(date, minDate) || isAfter(date, maxDate) || Boolean(disabledDates?.(date));
  // While the month is still unknown the controls keep their resting look, so hydration does not flash them dim.
  const previousDisabled = Boolean(ready && minDate && isBefore(pager.last(target - step), minDate));
  const nextDisabled = Boolean(ready && maxDate && isAfter(pager.first(target + step), maxDate));
  const todaySelectable = Boolean(today && !isDisabled(today) && onChange);
  // Today's own pane: its month, or the window that opens on this week.
  const atToday = Boolean(today && ready && pager.indexOf(today) === target);
  const todayIdle = atToday && (!todaySelectable || sameDay(value, today));
  // Roving tab stop: the day last focused, else the selection, else today, else the first open day of the month.
  const tabbableKey = (() => {
    const open = (date?: Date) => (date && pager.owns(date, target) && !isDisabled(date) ? dateKey(date) : "");
    return open(focusedDate) || open(value) || open(today) || dateKey(grid.flat().find((date) => pager.owns(date, target) && !isDisabled(date)) ?? new Date(0));
  })();

  const changeMonth = (index: number) => {
    const shown = pager.dateOf(index);
    if (!controlledMonth) setInternalMonth(shown);
    onMonthChange?.(shown);
  };

  /** Keyboard focus lands on the new day in the same frame the month starts to slide. */
  useLayoutEffect(() => {
    const key = focusRequest.current;
    if (!key) return;
    const button = viewportRef.current?.querySelector<HTMLButtonElement>(`[data-present] [data-date="${key}"]`);
    if (button) { focusRequest.current = null; button.focus({ preventScroll: true }); }
  });

  /** Clamps a keyboard move to the allowed range and steps past blocked days in the direction of travel. */
  const moveFocus = (from: Date, to: Date, travel: number) => {
    let next = isBefore(to, minDate) && minDate ? startOfDay(minDate) : isAfter(to, maxDate) && maxDate ? startOfDay(maxDate) : to;
    for (let tries = 0; tries < 42 && isDisabled(next); tries += 1) next = addDays(next, travel);
    if (isDisabled(next) || sameDay(next, from)) return;
    setFocusedDate(next);
    focusRequest.current = dateKey(next);
    if (!pager.owns(next, target)) changeMonth(pager.indexOf(next));
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isDisabled(date)) onChange?.(date);
      return;
    }
    const moves: Record<string, [Date, number]> = {
      ArrowLeft: [addDays(date, -1), -1],
      ArrowRight: [addDays(date, 1), 1],
      ArrowUp: [addDays(date, -7), -1],
      ArrowDown: [addDays(date, 7), 1],
      Home: [addDays(date, -weekday(date)), 1],
      End: [addDays(date, 6 - weekday(date)), -1],
      PageUp: [weeks && !event.shiftKey ? addDays(date, -7 * step) : shiftMonths(date, event.shiftKey ? -12 : -1), -1],
      PageDown: [weeks && !event.shiftKey ? addDays(date, 7 * step) : shiftMonths(date, event.shiftKey ? 12 : 1), 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(date, move[0], move[1]);
  };

  const goToToday = () => {
    if (!today || !ready || todayIdle) return;
    setFocusedDate(today);
    if (!atToday) changeMonth(pager.indexOf(today));
    if (todaySelectable && !sameDay(value, today)) onChange?.(today);
  };

  const shortMonth = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const monthOutOfRange = (candidate: Date) =>
    Boolean((minDate && candidate.getTime() < monthStart(minDate).getTime()) || (maxDate && candidate.getTime() > monthStart(maxDate).getTime()));
  const pickMonth = (candidate: Date) => {
    if (monthOutOfRange(candidate)) return;
    setPicking(null);
    // Trak: a window of weeks centres on the month's middle.
    const index = pager.indexOf(addDays(candidate, 14));
    if (index !== target) changeMonth(index);
  };
  const pickerMonth = ready ? pager.monthOf(target) : undefined;

  const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
  // Fixed weeks per pane, so a day's cell is its distance from the first day on the grid.
  const cellOf = (paneIndex: number) => {
    if (!value) return -1;
    const first = pager.gridStart(paneIndex);
    const index = Math.round((startOfDay(value).getTime() - first.getTime()) / 864e5);
    return index >= 0 && index < pager.rows * 7 ? index : -1;
  };

  const renderMonth = (paneIndex: number, present: boolean) => {
    const firstShown = pager.gridStart(paneIndex);
    return <>
    <SelectionDisc cell={cellOf(paneIndex)} reduced={reducedMotion} />
    <div className={styles.grid} role="grid" aria-label={paneLabel(paneIndex)}>
    {makeWeeks(firstShown, pager.rows).map((week) => <div key={dateKey(week[0]!)} className={styles.week} role="row">
      {week.map((date) => {
        const key = dateKey(date);
        // Trak (TRAK-256): another month's days are marked, and its first shown day names the month.
        // A window of weeks has no other month's days: it names the month of its first day, and each 1st.
        const outside = !pager.owns(date, paneIndex);
        const monthLabel = (outside || weeks) && (date.getDate() === 1 || sameDay(date, firstShown)) ? shortMonth.format(date) : null;
        const selected = sameDay(date, value);
        const isToday = sameDay(date, today);
        const dots = marks?.(date) ?? [];
        const needsYou = attention?.(date) ?? false;
        const label = date.toLocaleDateString(locale, { dateStyle: "full" });
        return <button
          key={key}
          type="button"
          role="gridcell"
          data-date={key}
          data-outside={outside || undefined}
          aria-label={(dots.length ? `${label}, ${dots.length} ${dots.length === 1 ? "event" : "events"}` : label) + (needsYou ? ", needs you" : "")}
          data-attention={needsYou || undefined}
          aria-selected={selected}
          aria-current={isToday ? "date" : undefined}
          tabIndex={present && key === tabbableKey ? 0 : -1}
          disabled={isDisabled(date)}
          style={present ? numberDelay(key) : undefined}
          className={cx(styles.day, outside && styles.outside, selected && styles.selected, isToday && styles.today)}
          onFocus={() => setFocusedDate(date)}
          onKeyDown={(event) => onDayKeyDown(event, date)}
          onClick={() => onChange?.(date)}
        >{monthLabel && <span className={styles.monthLabel} data-month-label aria-hidden="true">{monthLabel}</span>}
          {needsYou && <span className={styles.attention} aria-hidden="true" />}
          <span className={styles.dayNumber}>{date.getDate()}</span>
          {dots.length > 0 && <span className={styles.marks} aria-hidden="true">{dots.slice(0, 3).map((mark, i) => {
            const { color, hollow } = typeof mark === "string" ? { color: mark, hollow: false } : mark;
            return <span key={i} style={hollow
              ? { background: "transparent", border: `1.5px solid ${color}` }
              : { background: color }} />;
          })}</span>}
        </button>;
      })}
    </div>)}
    </div>
  </>;
  };

  return <section className={cx(styles.calendar, className)} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.heading}>
          <span className={styles.srOnly}>{monthLabel}</span>
          <button type="button" className={styles.titleButton} disabled={!ready} aria-expanded={picking !== null}
            aria-label={`${monthLabel}, choose month and year`} onClick={() => setPicking(picking === null && pickerMonth ? monthIndex(pickerMonth) - 5 : null)}>
            <span className={styles.title} aria-hidden="true">
              <AnimatePresence initial={false} custom={direction}>
                {ready && <motion.span key={monthKey} className={styles.titleRow} custom={direction} variants={reducedMotion || !direction ? titleFade : titleSlide} initial="enter" animate="center" exit="exit">{monthLabel}</motion.span>}
              </AnimatePresence>
            </span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className={cx(styles.titleChevron, picking !== null && styles.titleChevronOpen)} />
          </button>
        </h2>
        <span className={styles.srOnly} aria-live="polite">{direction ? monthLabel : ""}</span>
        <div className={styles.navigation}>
          {showToday && <button type="button" className={styles.todayButton} aria-disabled={todayIdle || undefined} aria-label={today ? `Today, ${today.toLocaleDateString(locale, { dateStyle: "full" })}` : "Today"} onClick={goToToday}>Today</button>}
          {picking !== null ? <>
            <button type="button" className={styles.navButton} aria-label="Earlier months" onClick={() => setPicking(picking - 12)}><ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /></button>
            <button type="button" className={styles.navButton} aria-label="Later months" onClick={() => setPicking(picking + 12)}><ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>
          </> : <>
          <button type="button" className={styles.navButton} aria-label={weeks ? "Previous weeks" : "Previous month"} aria-disabled={previousDisabled || undefined} onClick={() => { if (!previousDisabled && ready) changeMonth(target - step); }}><ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /></button>
          <button type="button" className={styles.navButton} aria-label={weeks ? "Next weeks" : "Next month"} aria-disabled={nextDisabled || undefined} onClick={() => { if (!nextDisabled && ready) changeMonth(target + step); }}><ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>
          </>}
        </div>
      </div>
      {picking !== null && <div className={styles.monthPicker} role="group" aria-label="Choose a month">
        {Array.from({ length: 12 }, (_, i) => fromIndex(picking + i)).map((candidate) => <button key={dateKey(candidate)} type="button"
          className={cx(styles.monthChoice, sameMonth(candidate, pickerMonth) && styles.monthChoiceCurrent)}
          aria-label={formatter.format(candidate)} aria-current={sameMonth(candidate, pickerMonth) ? "true" : undefined}
          disabled={monthOutOfRange(candidate)} onClick={() => pickMonth(candidate)}>
          <span>{shortMonth.format(candidate)}</span><span className={styles.monthChoiceYear}>{candidate.getFullYear()}</span>
        </button>)}
      </div>}
      <div className={styles.weekdays} aria-hidden="true" hidden={picking !== null}>{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day.slice(0, 2)}</span>)}</div>
      <div className={styles.monthViewport} ref={viewportRef} hidden={picking !== null}>
        {ready ? paneIndexes.map((index) => <MonthPane key={index} index={index} step={step} position={position} present={index === target}>{renderMonth(index, index === target)}</MonthPane>)
          : <div className={styles.monthBody} aria-hidden="true"><div className={styles.grid}>{Array.from({ length: pager.rows }, (_, week) => <div key={week} className={styles.week}>{Array.from({ length: 7 }, (_, day) => <span key={day} className={styles.placeholderDay} />)}</div>)}</div></div>}
      </div>
    </section>;
}

export { addDays, addMonths, sameDay, startOfDay };
