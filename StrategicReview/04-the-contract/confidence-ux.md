# Confidence UX Designer, Module 4

*Session: 19 September 2026. Trak's run of the course's Confidence UX Designer, taken from the
tool's own "Copy as Text" output. The tool says its output mirrors the Confidence UX Design section
of [golden-dataset.md](golden-dataset.md); section 2 there has the fuller version, with the table
and the reasoning.*

---

## Tool output — Trak

## Confidence UX Design

**Approach:** Tiered confidence built from checks we can explain (rule checks R1–R5 pass, each drafted band cites the coach's own phrase, the player is on the roster, judge fidelity score) — not the model's opinion of itself. Only the coach sees confidence; no tier ever signs for the coach, and any safety flag routes to a human.

**Confident (>90%):** Draft pre-filled. Under each band, the coach's own phrase that produced it. One tap to sign — never auto-signed. Copy: "Built from what you said. Check and sign." The AI may only say what the coach said: band words only, no numbers, character described never banded.

**Uncertain (50-90%):** Bands it could ground are pre-filled; the rest show as an empty ? chip with two or three band options. Sign stays disabled until each ? is chosen. The source phrase sits next to each one. Copy: "You said 'lost his man at corners' — which band for Tactical?" The AI asks; it does not guess.

**Not confident (<50%):** No draft. Say why and what would help: "I couldn't build Nikos's record from this. What did he do well, and what should he work on?" Any safety flag (instruction in the note, demeaning language, grading character) blocks the draft whatever the score. A safeguarding disclosure goes to the academy's safeguarding route only and never reaches the record, the player or the parent.

**User control surface:** 

Every draft lets the coach cycle a band, edit the note, delete a line, say "Not this player", or report "This draft is wrong". Each edit saves source_text, drafted_band, signed_band and coach_id — the correction loop that feeds the weekly gold-set audit. Coaches cannot lower the thresholds: the safety floors protect children, so they are fixed. Children and parents never see confidence; they see "Signed by Coach Andreas · 14 Oct · built from the coach's notes."

- Users see AI reasoning / drivers
- Users correct & override outputs
- Corrections feed back into the model / dataset
- Users adjust the confidence threshold _(not yet)_

> **"Not yet" is the tool's fixed wording for an unticked control.** For Trak it means **never**:
> the thresholds are a child-safety floor, not a preference. The Specifics paragraph above says so.

---

## How the tool works

Worked out on 19 September by filling the course's tool, capturing its "Copy as Text" output and
changing one field at a time. The page's script could not be read directly. Described in our own
terms.

**Five fields:** approach, the three confidence tiers, and the user control surface.

| Field | Inputs | How it appears in the output |
|---|---|---|
| Approach | Three chips (*show uncertainty*, *tiered confidence*, *human-in-loop trigger*) plus a sentence | The sentence, if one is written. If not, the selected chips joined with " / ". |
| Confident · >90% | Free text: what the UI shows and what the AI may say | `**Confident (>90%):** …` |
| Uncertain · 50 to 90% | Free text | `**Uncertain (50-90%):** …` |
| Not confident · <50% | Free text | `**Not confident (<50%):** …` |
| User control surface | Four toggles plus an optional Specifics paragraph | Specifics first, then the toggled-on controls as a list, then toggled-off controls marked *(not yet)* |

An empty tier prints as *(not set)*. The tool autosaves in the browser. The tier cut-offs (90% and
50%) are fixed by the tool, and Trak uses the same ones.

**The four controls, and Trak's answer:**

| Control | Trak | Why |
|---|:-:|---|
| Users adjust the confidence threshold | **No** | Safety floors for a child's record are not a user setting. |
| Users see AI reasoning / drivers | Yes | Each drafted band shows the coach's phrase it came from. |
| Users correct & override outputs | Yes | The coach cycles bands, edits and deletes before signing. |
| Corrections feed back into the model / dataset | Yes | The four-column correction capture feeds the weekly gold-set audit. |
