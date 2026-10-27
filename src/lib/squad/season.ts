/* TRAK-250: the season a squad's figures cover. TRAK-283 removed the season's match statistics with
   Squad › Games; the Players view still counts its averages over this window. */

/** The season runs 1 July to 30 June; the label names both years, e.g. "Season 2026–27". */
export function seasonWindow(todayISO: string): { from: string; to: string; label: string } {
  const year = Number(todayISO.slice(0, 4))
  const month = Number(todayISO.slice(5, 7))
  const start = month >= 7 ? year : year - 1
  return {
    from: `${start}-07-01`,
    to: `${start + 1}-06-30`,
    label: `Season ${start}–${String(start + 1).slice(2)}`,
  }
}
