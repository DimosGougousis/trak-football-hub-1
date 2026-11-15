# Testing strategy (draft)

Status: working draft for [TRAK-471](https://linear.app/trak-football/issue/TRAK-471). Makis writes the strategy here; Tarek and Imad review.

## Where we are

- The merge gate runs its checks side by side (TRAK-469, #640): database 463 s, browser shards 401 s and 413 s.
- Unit tests carry a story tag on line 1, for example `// @story J5` (TRAK-467, #636). `npm run test:story -- J5` runs one story.
- Cutting browser specs was tried and dropped (TRAK-468, #637): it would not shorten the gate and it lost the consent, guardian invitation, child login and G7 checks.

## Open questions for Makis

1. What counts as a story: the J and G codes only, or J and G plus named streams?
2. Where does a PR declare its story: the description, a label, or a field the merge gate checks?
3. How is a story's test found: one spec file per story, or a tag on tests that stay where they are?

## The strategy

To be written by Makis.
