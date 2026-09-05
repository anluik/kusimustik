# Decisions

Append-only. Newest at the bottom. If you deviate from one of these, add a new entry rather than editing the old one.

---

## 001 — Survey definitions stored as JSONB; responses stored relationally

**Status:** accepted

**Context.** A survey definition is a polymorphic ordered list — nine element variants, each with its own config (option lists, matrix rows and columns, scale bounds, selection limits). It can be stored as a document (one JSONB column) or normalised across `elements` / `element_options` / `matrix_rows` / `matrix_columns`.

**Decision.** The definition lives in a JSONB `elements` column on `surveys`, validated through `SurveySchema` on every read. Responses are relational: one `responses` row per submission, one `answers` row per question, with a JSONB `value` validated through `buildAnswerSchema`.

**Why.**

- _One source of truth._ With JSONB the read path is `SurveySchema.parse(row)`. Normalised, it needs a bidirectional mapper between rows and the Zod union — a second representation that nothing typechecks against the first. Adding a question type would then require changes the exhaustiveness check can't catch, because a mapper silently dropping one variant's config is not a type error. Given that most of this codebase is written by an agent, we want mistakes to surface as build failures.
- _Editing is whole-document._ Reordering via drag-and-drop is one `UPDATE` of one column instead of a renumbering RPC, and TanStack Query optimistic updates are trivial because the cache entry _is_ the document.
- _Smaller RLS surface._ One policy on one table instead of the same `exists (...)` subquery repeated across four child tables — including for anonymous access from the public runner.
- _Cheap versioning._ A published definition is one row of JSON, so `survey_versions` is trivial. This matters because owners edit published surveys: deleting or renaming an option must not rewrite the history of the 200 people who already answered. Responses record `survey_version`; aggregation groups by it.
- _Reversible._ Adding a derived projection table to a document model is an afternoon. Collapsing a shipped polymorphic relational schema into documents is a rewrite of every mapper, migration and policy. Asymmetric cost, so take the reversible option.

**Costs accepted.**

- No native FK on `answers.question_id` — mitigated by decision 002.
- Cross-survey queries over definitions need `jsonb_array_elements` or a GIN index — also mitigated by 002.
- Last-write-wins on concurrent saves. Acceptable: surveys have a single owner (confirmed with the product owner, Sept 2026). Guarded anyway by an optimistic-concurrency `version` column — `update ... where version = $n`, zero rows affected means refetch and warn.

**Revisit if** a shared question bank, cross-survey analytics as a primary surface, real-time multi-user editing, or per-question permissions become core.

---

## 002 — `survey_questions` projection table, built in Phase 2 rather than deferred

**Status:** accepted

**Context.** Decision 001 gives up the FK on `answers.question_id` and makes queries across definitions scan. Both are fixable with a derived table, and the question was whether to build it now or when needed.

**Decision.** Build it in Phase 2. A trigger on `surveys` rebuilds `survey_questions` (question_id, survey_id, key, type, title, position) whenever `elements` changes. Application code never writes to it; it is derived state and can be dropped and rebuilt at any time.

**Why now.** It resolves both costs of 001 immediately, it is the FK target for `answers.question_id`, it is what wave comparison (003) joins on, and it is exactly the table a question bank would need if that ships. Retrofitting it later means backfilling against responses that already exist.

**Note.** Never read the definition itself from this table — it is an index, not a source of truth. Definitions always come from `surveys.elements` via `SurveySchema`.

---

## 003 — Questions carry a stable `key` alongside their `id`; surveys carry a `wave_group_id`

**Status:** accepted

**Context.** The product needs year-over-year comparison — the same survey run annually, with results compared across waves. This is not generic cross-survey analytics; it is one survey duplicated over time. Identity has to survive duplication *and* editing, since owners reword questions between waves.

**Decision.**

- Every question has both `id` (branded UUID, unique per survey, regenerated on duplication) and `key` (slug, unique per survey, **preserved** on duplication). Keys are auto-derived from the title at creation, overridable, and renaming one on a published survey requires an explicit confirmation.
- Every survey has `wave_group_id`. Duplicating inherits the source's; creating from scratch generates a fresh one. `wave_label` ("2025", "Q1") is the series label in comparison charts.
- Comparison joins waves in a group on question `key`, never on `id` or on title text.

**Why.** Without stable keys the comparison silently breaks the first time someone fixes a typo — the two waves look like unrelated questions and the trend line is lost with no error anywhere. Titles are too unstable to key on, ids are too unstable across copies. The cost is one schema field, one trigger and a duplication function that preserves keys; the cost of retrofitting after two years of collected responses is a data-archaeology exercise.

---

## 004 — Interaction analytics in a separate append-only `survey_events` table

**Status:** accepted

**Context.** Owners need to see how respondents interacted with a survey: drop-off, time per question, abandonment, device mix.

**Decision.** A separate `survey_events` table (survey_id, session_id, question_id, type, at, meta), written from the public runner and instrumented in Phase 6 alongside the runner itself. `session_id` is anonymous, per-visit, and **not** stored on `responses`.

**Why separate.** It is high-volume, disposable and prunable, with a very different write pattern from answer data. Keeping it out of `answers` also keeps it structurally impossible to join behaviour back to a named individual's answers, which matters for the anonymity promise the product makes to respondents — and for GDPR.

**Why in Phase 6.** Instrumenting a runner as you build it is nearly free; adding it afterwards means touching every interaction path again, and every week of delay is a week of funnel data you don't have.

**Constraint.** Analytics writes are best-effort, batched, and fired via `sendBeacon`. They must never block, delay, or fail a survey submission.

---

## 005 — No `src/` directory; `app/` is the router and everything else is a root sibling

**Status:** accepted

**Context.** The layout block in `CLAUDE.md` described a tree with `domain/`, `lib/` and `components/` under a source root, but nested `app/(app)/` inside that same root — i.e. `app/app/(app)/`. It was a `src/` tree whose root had been renamed. Meanwhile the repo scaffolded with `app/` at the root and `"@/*": ["./*"]`. The two had to be reconciled before any code was written against either.

**Decision.** No `src/`. `app/` is the App Router directory and contains routes only. `domain/`, `lib/`, `components/`, `e2e/`, `messages/` and `supabase/` are siblings of it at the repo root. `"@/*"` continues to resolve from the repo root, so `domain/question.ts` is `@/domain/question`. `CLAUDE.md`'s layout block was rewritten to the real tree.

**Why.**

- `docs/DESIGN.md` §1 states "`app/globals.css` is canonical" and §5 references `components/ui/`. Adopting `src/` would have falsified both, and DESIGN.md is marked complete.
- shadcn's non-`src` default (`components/ui`, `lib/utils`) matches directly, so `components.json` needs no alias rewriting and future `shadcn add` runs land in the right place without configuration.
- `domain/` as a root sibling of `app/`, rather than a folder inside the router directory, makes the "`domain/` imports nothing" non-negotiable expressible as a flat ESLint boundary rule with no route-vs-module ambiguity.
- Zero file moves against the existing scaffold.

**Cost accepted.** A slightly busier repo root. Acceptable at this size.

---

## 006 — Next.js 16 conventions that contradict the plan as originally written

**Status:** accepted

**Context.** `docs/PLAN.md` and `CLAUDE.md` were written against pre-16 Next.js conventions. Next.js 16.3.4 removes or changes several of them, and three would have failed silently rather than loudly.

**Decision.** `CLAUDE.md` gains a "Next.js 16" section recording the differences. The load-bearing ones:

- **The Server Action wrapper must `unstable_rethrow(err)` first in its `catch`.** `redirect()`, `permanentRedirect()` and `notFound()` are implemented as throws. The `{ ok } | { error }` wrapper in `CLAUDE.md`'s conventions would otherwise catch and discard them, and a redirect that simply does not happen is not visible in review.
- **`middleware.ts` is now `proxy.ts`** at the repo root, exporting `proxy()`, Node runtime only. Phase 3's "middleware-protected `(app)` routes" means `proxy.ts`. next-intl's documentation still says middleware.
- **Server Actions dispatch sequentially per client.** Phase 5's debounced autosave must batch into a single action rather than firing several; `Promise.all` over actions serialises. Phase 6's `survey_events` beacons go to a Route Handler in `app/api/` for the same reason, which also satisfies decision 004's "must never block a submission".
- `revalidateTag` now requires a `cacheLife` argument; `updateTag` is the read-your-writes alternative and is what owner-facing mutations should use.
- `params`/`searchParams`/`cookies()`/`headers()` are Promise-only.

**Not adopted.** `cacheComponents` (the replacement for experimental PPR / `dynamicIO` / `useCache`) stays off. It is not a rename: enabling it surfaces build errors for uncached data outside `<Suspense>` and requires adopting the Cache Components model wholesale. Revisit when there is a page whose performance actually demands it.
