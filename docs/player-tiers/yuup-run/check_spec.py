#!/usr/bin/env python3
"""Deterministic checks for the player-tiers spec (run yuup-2026-11-18-player-tiers).

Usage: python check_spec.py --trace | --tiers | --connections
Exit 0 = pass, 1 = fail (reasons on stderr).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SPEC = Path(__file__).with_name("player-tiers-spec.md")

# Every feature the deck names (slide ref -> keyword that must appear in a matrix row).
DECK_FEATURES = {
    "S3": ["Player Card", "Skill Tree", "Leaderboard", "Streak Freeze"],
    "S4": ["Coach Coins", "Cosmetic", "Kudos"],
    "S1": ["Parent Dashboard", "Coaching Plan", "Challenge", "AI Analytics"],
    "S6": ["Ads", "Manual"],
    "S7": ["Video", "Ad-Free", "Wearable"],
    "S9": ["Streak Discount"],
    "S10": ["Academy Bundl", "Perks"],
    "S12": ["Upgrade Prompt"],
    "S13": ["Rest Cap", "Financial Silo", "Closed"],
}

MATRIX_HEADER = ["feature", "deck ref", "basic", "standard", "premium"]
CONN_HEADER = ["id", "connection", "direction", "data", "trigger", "tiers", "safeguard"]
MIN_CONNECTIONS = 6


def tables(text: str) -> list[list[list[str]]]:
    out, cur = [], []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("|") and s.endswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                continue
            cur.append(cells)
        elif cur:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def find_table(text: str, header: list[str]) -> list[list[str]] | None:
    for t in tables(text):
        if [c.lower() for c in t[0][: len(header)]] == header:
            return t
    return None


def fail(msgs: list[str]) -> int:
    for m in msgs:
        print(f"FAIL: {m}", file=sys.stderr)
    return 1 if msgs else 0


def check_trace(text: str) -> int:
    t = find_table(text, MATRIX_HEADER)
    if not t:
        return fail([f"no matrix table with header {MATRIX_HEADER}"])
    rows = t[1:]
    errs = []
    for slide, kws in DECK_FEATURES.items():
        for kw in kws:
            hit = [r for r in rows if kw.lower() in r[0].lower()]
            if not hit:
                errs.append(f"deck feature '{kw}' ({slide}) has no matrix row")
            elif not any(slide in r[1] for r in hit):
                errs.append(f"matrix row for '{kw}' does not cite {slide}")
    return fail(errs)


def check_tiers(text: str) -> int:
    t = find_table(text, MATRIX_HEADER)
    if not t:
        return fail([f"no matrix table with header {MATRIX_HEADER}"])
    errs = []
    for r in t[1:]:
        if len(r) < 5 or any(not c for c in r[2:5]):
            errs.append(f"row '{r[0]}' has an empty tier cell")
    for tier in ("Basic", "Standard", "Premium"):
        if not re.search(rf"^###\s+{tier}\b", text, re.M):
            errs.append(f"missing '### {tier}' section")
    if len(t) - 1 < 15:
        errs.append(f"matrix has {len(t) - 1} rows, need >= 15")
    return fail(errs)


def check_connections(text: str) -> int:
    t = find_table(text, CONN_HEADER)
    if not t:
        return fail([f"no connections table with header {CONN_HEADER}"])
    rows = t[1:]
    errs = []
    if len(rows) < MIN_CONNECTIONS:
        errs.append(f"{len(rows)} connections, need >= {MIN_CONNECTIONS}")
    for r in rows:
        if not re.fullmatch(r"CP-\d{2}", r[0]):
            errs.append(f"bad connection id '{r[0]}'")
        if len(r) < 7 or any(not c for c in r[:7]):
            errs.append(f"{r[0]} has an empty cell")
    return fail(errs)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in ("--trace", "--tiers", "--connections"):
        print(__doc__, file=sys.stderr)
        return 2
    if not SPEC.exists():
        return fail([f"{SPEC} not found"])
    text = SPEC.read_text(encoding="utf-8")
    return {"--trace": check_trace, "--tiers": check_tiers, "--connections": check_connections}[sys.argv[1]](text)


if __name__ == "__main__":
    sys.exit(main())
