#!/usr/bin/env node
// TRAK-264: the coach's Library reads the Coaching Session Catalogue's own data.
// public/trainings/coaching-session-catalogue.html keeps it as two lines,
// `const DATA = [...]` and `const TOPIC_ORDER = {...}`; this copies both to
// src/lib/library/catalogue.json. Run it after the catalogue page changes:
// library-data.test.ts fails until the two match again.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE = resolve('public/trainings/coaching-session-catalogue.html')
const OUT = resolve('src/lib/library/catalogue.json')

const html = readFileSync(PAGE, 'utf8')
const grab = name => {
  const line = html.split('\n').find(l => l.startsWith(`const ${name} = `))
  if (!line) throw new Error(`${name} is not in ${PAGE}`)
  return JSON.parse(line.slice(`const ${name} = `.length).replace(/;\s*$/, ''))
}

writeFileSync(OUT, `${JSON.stringify({ topics: grab('TOPIC_ORDER'), sessions: grab('DATA') })}\n`)
console.log(`Wrote ${OUT}`)
