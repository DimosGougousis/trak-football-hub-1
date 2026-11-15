#!/usr/bin/env node
// TRAK-268: the coach's Play It Right reads the old page's own content.
// public/trainings/play-it-right.html keeps it as code (CODE, ACADEMY plus
// LIBRARY with each moment's week, and SENIOR); this runs exactly that code
// and writes the result to src/lib/library/play-it-right.json. Run it after
// the page changes: play-it-right-data.test.ts fails until the two match.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readPlayItRight } from './play-it-right-read.mjs'

const OUT = resolve('src/lib/library/play-it-right.json')
const data = readPlayItRight(readFileSync(resolve('public/trainings/play-it-right.html'), 'utf8'))
writeFileSync(OUT, `${JSON.stringify(data)}\n`)
console.log(`Wrote ${OUT}: ${data.moments.length} moments, ${Object.keys(data.senior.pillars).length} senior stories`)
