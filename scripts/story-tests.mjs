// Runs the unit tests tagged for one user story: node scripts/story-tests.mjs J5
// A test file declares its story on its first line: `// @story J5` (several: `// @story J5 G1`).
// With no argument, prints each story and how many files carry it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.test\.tsx?$/.test(name)) yield path
  }
}

const byStory = new Map()
for (const root of ['src', 'tests']) {
  for (const file of walk(root)) {
    const tag = /^\/\/ @story ([A-Z0-9 ]+)$/.exec(readFileSync(file, 'utf8').split('\n', 1)[0])
    for (const story of tag?.[1].split(' ') ?? []) byStory.set(story, [...(byStory.get(story) ?? []), file])
  }
}

const story = process.argv[2]
if (!story) {
  for (const [name, files] of [...byStory].sort()) console.log(`${name}\t${files.length} files`)
} else if (!byStory.has(story)) {
  console.error(`No test file is tagged "${story}". Known stories: ${[...byStory.keys()].sort().join(', ')}`)
  process.exit(1)
} else {
  execFileSync('npx', ['vitest', 'run', ...byStory.get(story)], { stdio: 'inherit' })
}
