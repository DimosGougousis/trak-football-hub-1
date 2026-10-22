// Arc Pro (uiarc.dev): adapted from the Team directory block; licensed source, not covered by this repository's licence. See src/components/arc/PRO.md.
"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { Avatar } from "../../avatar/avatar";
import { motionTokens } from "../../lib/motion-tokens";
import { BANDS } from "@/lib/types";
import styles from "./squad-directory.module.css";

export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

export interface SquadPlayer {
  id: string;
  name: string;
  /** "Midfielder", or empty. */
  position: string;
  /** null: no position the filters know; the player shows under All only. */
  group: PositionGroup | null;
  shirt: number | null;
  /** Latest band word, or null before a first assessment. */
  band: string | null;
  /** Against the player's own previous assessment. */
  move: -1 | 0 | 1;
  /** Trak: waiting for consent, so nothing can be recorded about them yet. */
  waiting?: boolean;
}

const FILTERS = ["All", "GK", "DEF", "MID", "ATT"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_NAME: Record<Filter, string> = { All: "All", GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", ATT: "Attackers" };

export function BandChip({ band, move = 0, waiting = false }: { band: string | null; move?: -1 | 0 | 1; waiting?: boolean }) {
  const config = BANDS.find(entry => entry.word === band);
  if (waiting) return <span className={styles.chip} data-empty="">Waiting for consent</span>;
  if (!config) return <span className={styles.chip} data-empty="">Not assessed</span>;
  return <span className={styles.chip} style={{ background: config.bg, borderColor: config.border, color: config.text }}>
    {config.word}
    {move === 1 && <ArrowUp size={12} strokeWidth={2.2} aria-label="up" />}
    {move === -1 && <ArrowDown size={12} strokeWidth={2.2} aria-label="down" />}
  </span>;
}

/**
 * The squad overview (Imad, 22 Oct: Arc's team directory). Filter by position, search by name or shirt number, and
 * pick a player to open their profile beside the list; on a phone the profile sits under it. Nobody is picked until
 * the coach taps a row.
 */
export function SquadDirectory({ title, players, summary, renderProfile, defaultSelected }: {
  title: string;
  players: SquadPlayer[];
  /** Above the list, such as the band spread. */
  summary?: ReactNode;
  renderProfile: (player: SquadPlayer) => ReactNode;
  defaultSelected?: string;
}) {
  const uid = useId();
  const reduce = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState(defaultSelected);

  const needle = query.trim().toLowerCase();
  const visible = players.filter(player => (filter === "All" || player.group === filter) && `${player.name} ${player.position} ${player.shirt ?? ""}`.toLowerCase().includes(needle));
  const selected = visible.find(player => player.id === selectedId);

  // Trak: stacked on a phone, the profile is below the list, so picking a player brings it into view.
  function choose(id: string) {
    setSelectedId(id);
    const body = bodyRef.current;
    if (body && getComputedStyle(body).gridTemplateColumns.split(" ").length === 1)
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  }

  function reset() {
    setQuery("");
    setFilter("All");
    searchRef.current?.focus();
  }

  const listTransition = reduce ? { duration: 0 } : motionTokens.spring.smooth;

  return <section className={`arc ${styles.directory}`} aria-labelledby={`${uid}-title`}>
    <header className={styles.header}>
      <h2 id={`${uid}-title`}>{title} <span className={styles.count}>{players.length}</span></h2>
      <label className={styles.search}>
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.srOnly}>Search players</span>
        <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} placeholder="Search name or number" />
        <span className={styles.clearSlot}>{query && <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search"><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>}</span>
      </label>
    </header>

    <div className={styles.filters} role="group" aria-label="Filter by position">
      {FILTERS.map(item => {
        const count = item === "All" ? players.length : players.filter(player => player.group === item).length;
        return <button key={item} type="button" aria-pressed={filter === item} aria-label={`${FILTER_NAME[item]}, ${count}`} onClick={() => setFilter(item)}>
          {filter === item && <motion.span layoutId={`${uid}-filter`} className={styles.filterHighlight} transition={reduce ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
          <span className={styles.filterLabel} aria-hidden="true">{item}<span className={styles.filterCount}>{count}</span></span>
        </button>;
      })}
    </div>
    {summary && <div className={styles.summary}>{summary}</div>}

    <div ref={bodyRef} className={styles.body}>
      <div className={styles.listPane}>
        <ul className={styles.peopleList} aria-label="Players">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map(player => {
              const isSelected = selected?.id === player.id;
              return <motion.li key={player.id} layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: reduce ? 0 : motionTokens.duration.exit } }}
                transition={{ layout: listTransition, opacity: { duration: reduce ? 0 : motionTokens.duration.fast } }}>
                <button type="button" className={styles.personRow} aria-pressed={isSelected} onClick={() => choose(player.id)}>
                  {isSelected && <RowHighlight layoutId={`${uid}-row-${filter}-${needle}`} reduce={Boolean(reduce)} />}
                  <Avatar name={player.name} />
                  <span className={styles.personText}><span className={styles.personName}>{player.name}</span><span className={styles.personRole}>{player.position}{player.shirt != null ? ` · #${player.shirt}` : ""}</span></span>
                  <BandChip band={player.band} move={player.move} waiting={player.waiting} />
                </button>
              </motion.li>;
            })}
          </AnimatePresence>
        </ul>
        {visible.length === 0 && <div className={styles.empty}>
          <p>No one matches{needle ? ` “${query.trim()}”` : ""}</p>
          <button type="button" onClick={reset}>Clear filters</button>
        </div>}
      </div>

      {/* Stacked on a phone, the profile rides up with the list as rows leave instead of jumping ahead of it. */}
      <motion.div ref={detailRef} className={styles.detailPane} layout={reduce ? false : "position"} transition={{ layout: listTransition }} aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {selected ? <motion.article key={selected.id} className={styles.profile} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : motionTokens.duration.exit, ease: [...motionTokens.ease.standard] } }}
            transition={{ duration: reduce ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }} aria-label={`${selected.name}, ${selected.position}`}>
            {renderProfile(selected)}
          </motion.article> : <motion.div key="none" className={styles.noProfile} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}><p>Nobody selected</p><span>{visible.length ? "Pick a player to see their profile." : "Clear your search to see the squad."}</span></motion.div>}
        </AnimatePresence>
      </motion.div>
    </div>
  </section>;
}

/** The shared selection highlight. Its layout id carries the filter and query, so it morphs between rows on a click but rides along
 *  with its row when a filter moves the selection. A row that is leaving drops it at once, so the highlight never holds the exit open or splits in two. */
function RowHighlight({ layoutId, reduce }: { layoutId: string; reduce: boolean }) {
  const present = useIsPresent();
  if (!present) return null;
  return <motion.span layoutId={layoutId} className={styles.rowHighlight} transition={reduce ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />;
}

export default SquadDirectory;
