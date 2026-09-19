# Keeping credentials out of a public repository

Investigation prompted by the `TrakDev123` leak. The brief was *"separate
credentials from merging forked work"* — and the first finding is that the
premise points at the wrong mechanism, in a way that matters for the fix.

Everything below is verified against this repository, not recalled.

---

## 1. It did not arrive through forked work

```
$ git log -1 --format='%H parents:[%P] %an %ad %s' 866949a
866949ac… parents:[] Kostas Anastasiou Fri Jul 31 2026
          fix: passport no longer scrolls sideways on narrow phones
```

**No parents — this is the repository's root commit**, and the credential is in
it. It has been present since the first line of history, in four files, under a
commit message about horizontal scrolling on phones.

It did not come through a fork, a pull request, or an agent. No review gate
existed to catch it because there was nothing to review: it arrived with the
initial import.

**So "stop credentials entering via forked work" would not have prevented this
leak, and building only that control would leave the actual hole open.**

## 2. What forks actually change

Not the chance of injection — the possibility of remediation.

```
visibility: public     forks: 2
```

Once a commit is public and forked, it is in every fork and every clone
permanently. **`git filter-repo`, force-pushes and history rewrites do not reach
them.** GitHub does not garbage-collect fork network objects on demand, and a
commit SHA remains fetchable from the network even after the branch that pointed
at it is gone.

**The only remediation for a leaked credential in a public repo is to rotate the
credential.** Removing it from `HEAD` — which is what #59 does — stops *future*
exposure and does nothing about the past. That is why #59 merging is not the fix
and why the console action outranks it.

This is the genuine fork-specific lesson, and it is about response, not
prevention.

## 3. Two corrections to the incident report

Both verified by building this branch, which does not contain #59.

**a) `LandingPage.tsx` is not in the production bundle.**

The report says it was *"in the entry bundle, no guard at all… shipped to every
visitor of trakfootball.com unconditionally."* It is in the **source** — line 18
declares it, line 420 uses it in live code — but:

```
$ grep -rl TrakDev123 dist/
dist/assets/DevSetupPage-Cbkrdgsv.js        ← the only file
```

`LandingPage.tsx:9` is `const IS_DEV = import.meta.env.DEV`. Vite replaces that
with `false` in a production build and Rollup eliminates the branch, taking the
constant with it. The source exposure is real — the repo is public — but nothing
was served to visitors from this file.

**b) The bundle contains it once, not twelve times.** Twelve is the count in
`DevSetupPage.tsx` source; minification collapses a repeated literal to one.

**What holds, and is the actual served leak:** `DevSetupPage.tsx` has no
`import.meta.env` guard of its own. The guard is in `App.tsx:96`, on the route —
but `App.tsx:24` is `lazy(() => import("./pages/DevSetupPage"))`, a static import
expression, so Rollup emits the chunk anyway and the entry bundle references it.
A 12 KB chunk with a discoverable URL, containing the password, served from
production. The mechanism in the report is exactly right for this file.

The distinction changes the blast radius, not the required action.

## 4. Why every layer missed it

| layer | state | why it missed |
|---|---|---|
| `.gitignore` | `.env*` ignored | correct, and irrelevant — this was in `.tsx`, not `.env` |
| `.env.example` | placeholders only | correct |
| CI workflow | `pull_request`, not `pull_request_target`; deploys gated to `head.repo.full_name == github.repository` | **sound** — fork PRs never receive secrets |
| `.husky/pre-commit` | runs `npm run uc:check` | nothing scans for secrets |
| test suite | 429 tests | none looked at credentials until #59 |
| GitHub secret scanning | **Advanced Security not enabled** | — |
| code review | many PRs touched these files over seven weeks | nobody greps for a password they don't know exists |

**The secret *plumbing* is good.** Environment variables, fork isolation and
deploy gating were all done correctly. The gap is narrower than "we have no
secret hygiene": nothing ever looked at **source literals**, and nothing ever
looked at **the build output**.

⚠️ **A generic password is not a scanner's natural prey.** GitHub's free secret
scanning for public repos matches *partner patterns* — structured tokens with
recognisable prefixes and checksums (`ghp_`, `AKIA`, `sk_live_`). `TrakDev123`
has no structure; it is an ordinary string. **Enabling scanning would not have
caught this**, and a plan that stops at "turn on secret scanning" recreates the
gap. Generic values need an explicit denylist, which is what #59's
`no-committed-credentials.test.ts` provides.

## 5. The design

Five layers, cheapest first. Each catches something the one before it cannot.

**Layer 0 — architectural: no credential literal in application source, ever.**

The strongest control, because it removes the class rather than detecting it. A
dev-login affordance reads its password from `import.meta.env.VITE_DEV_PASSWORD`
and, when absent, **refuses and says so** rather than falling back to a default.
A missing dev convenience is a non-event; a default is a committed credential
with extra steps. #59 does this.

**Layer 1 — pre-commit: scan the staged diff.** `.husky/pre-commit` already
exists and runs `uc:check`. Adding a staged-diff scan costs one line and gives
the author feedback before anything leaves the machine — the only layer that
prevents the value entering history at all.

**Layer 2 — CI: scan the repository on every PR, including forks.** Needs no
secrets, so it runs identically on fork PRs. Catches anything Layer 1 missed
(hooks are local, optional, and skippable with `--no-verify`).

**Layer 3 — assert on the built bundle.** ⭐ **The one that would have caught
this.**

Layers 1 and 2 examine source. This examines **what actually ships**, which is a
different question — the `DevSetupPage` chunk is emitted despite the route being
dev-gated, and only an assertion on `dist/` can see that. It also catches the
inverse case and is the honest test of *"is a secret being served"*:

```
npm run build && ! grep -rqE "<denylist>" dist/
```

Worth running in CI after the existing build step. It is the layer that maps to
the actual harm — a string reachable over HTTP — rather than to a proxy for it.

**Layer 4 — GitHub push protection**, for the structured tokens the denylist
will never anticipate. Complements Layers 1–3; does not replace them, per the
warning above.

**Layer 5 — branch protection makes Layers 2 and 3 required.** Without this the
checks are advisory. See the CODEOWNERS deadlock on #46 first — activating
protection as currently specified makes six paths unmergeable.

## 6. Fork rules worth writing down

Three are already right and should be protected rather than invented:

1. **Never `pull_request_target`** on a workflow that checks out PR head code. It
   runs with repository secrets against untrusted code. `ci.yml` correctly uses
   `pull_request`.
2. **Deploy and migration jobs stay gated** to
   `head.repo.full_name == github.repository`. Already true at `ci.yml:217`.
3. **Fork PRs get no secrets, and the checks that matter must not need any.**
   Layers 2 and 3 are pure `npm` steps — deliberately, so a fork PR is checked as
   thoroughly as a branch PR.

And one to add:

4. **A credential that reaches a public commit is burned.** Not "remove it and
   move on" — rotate, then remove. The removal is hygiene; the rotation is the
   fix. Write it in the runbook so the next person does not have to reason it out
   under pressure.

## 7. What this costs

Layer 0 is done in #59. Layers 1–3 are three small additions: a `pre-commit`
line, a CI step, and a build-output grep. Layer 4 is a settings toggle. Layer 5
is blocked behind #46 and the CODEOWNERS fix.

**None of it helps with the present incident.** The accounts are live, the value
is public, and rotation in the Supabase console is the only thing that closes it.
That remains first.
