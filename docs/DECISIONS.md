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

---

## 007 — Phase 1 domain shapes: the answer envelope, `isAnswerable`, and NPS as its own summary kind

**Status:** accepted

**Context.** Phase 1 of `docs/PLAN.md` names the deliverables but leaves several shapes open. These are the calls made while implementing `domain/`, recorded because everything downstream inherits them.

**Decisions.**

- **Answers are a self-describing tagged envelope.** `AnswerValue` is a discriminated union on `type`, matching the question type it answers (`{ type: "nps", value: 9 }`, `{ type: "matrix_single", values: { speed: "high" } }`). It is what goes in `answers.value` as JSONB in Phase 2. The tag costs a few bytes per row and buys three things: the column is readable on its own without joining the definition, the aggregator and exporter narrow without consulting the question, and an answer stored against a question whose type was later changed fails to parse instead of being silently misread.
- **A skipped question is `null`.** Never `""`, `[]` or `{}`. `buildAnswerSchema` accepts `null` only when the question is optional, and never accepts a *partial* answer — a half-filled matrix or a below-minimum multi-choice is invalid whether or not the question is required. Skipping is allowed; half-answering is not.
- **`isAnswerable` is a defaulted literal field, not a derived predicate.** `z.literal(true).default(true)` on questions, `z.literal(false).default(false)` on statements. Stored JSON need not carry it, a document that contradicts its own type fails to parse, and TypeScript narrows the union on it, so `AnswerableQuestion` is `Extract<SurveyElement, { isAnswerable: true }>` rather than a hand-written type guard that could drift.
- **`NpsSummary` is a fifth summary kind, not a flag on `NumericSummary`.** The plan lists four shapes and says "NPS gets promoters/passives/detractors and the score". Folding those into `NumericSummary` as optional fields would make every numeric chart branch on whether they are present. NPS renders differently enough (the three-band split, a score, not a mean) to deserve its own variant, and Phase 7's exhaustive switch over `QuestionSummary` then forces a deliberate choice of chart for it.
- **`otherLabel` is required whenever `allowOther` is set.** The "Other" option's label is respondent-facing copy and a CSV header, so it cannot come from a literal in `domain/` — the non-negotiable in `CLAUDE.md` forbids it, and `domain/` has no access to the message files. Making the schema reject `allowOther: true` without a label pushes that string out to the builder, where the message catalogue is available. For the same reason `CategoricalSummary.other` is a separate bucket rather than a synthetic entry in `options`.
- **Percentages are taken against `answeredCount`, not `responseCount`**, rounded to one decimal, with `skippedCount` reported alongside. `multi_choice` percentages therefore exceed 100 by design; `CategoricalSummary.multiSelect` flags that for the chart.
- **CSV column identity is derived from `key`.** `key`, or `key__<option|row>` for a fanned-out column. Never from `id`, which changes on duplication — two waves of the same survey have to line up column for column. `multi_choice` fans out to one flag column per option (`"1"` / `""`) plus a free-text column when `allowOther`; `matrix_single` fans out to one column per row holding the chosen column's label. Cells carry labels rather than stored values, falling back to the raw value when an option has since been deleted so an old response never exports blank.
- **`duplicateSurvey` returns a draft with `slug: null`.** A copy must not be able to take over the source's live public link. It keeps the source's title by default (a new wave is the same survey, run again), takes an optional new `waveLabel`, and has a `newWaveGroup` escape hatch for when the copy is the start of an unrelated survey rather than the next wave.

**Not decided here.** Zod's validation messages are currently developer-facing English. Respondent-facing wording will be mapped from the issue `code` and `path` in Phase 6, where the message catalogue exists; `domain/` must not grow an i18n dependency to produce them.

---

## 008 — `survey_questions` excludes statements, and tombstones rather than deletes answered questions

**Status:** accepted

**Context.** Decision 002 specified the projection table but not what happens when the document changes underneath it. Two cases were undefined: whether a `statement` block gets a row, and what the rebuild trigger does with a question that has left `elements` but still has answers pointing at it. The second one is load-bearing — `answers.question_id` is a foreign key into this table (002), so the naive `delete` either cascades away collected responses or aborts the owner's edit.

**Decision.**

- **Statements get no row.** The table is the FK target for `answers`, so every row in it must be answerable; a statement row would make it structurally possible to record an answer against a block that has none. `position` remains the index of the element within `elements`, so the projection stays in document order and statements simply leave gaps.
- **Removal is conditional.** The trigger deletes a question that has left the document and has no answers, and sets `removed_at` on one that has answers. Tombstoned rows keep their last known key, title and position. Every consumer filters `removed_at is null` by default; `listSurveyQuestions(..., { includeRemoved: true })` opts in.
- **A `before insert` trigger on `answers` rejects writes to a tombstoned question**, so a stale runner cannot answer a question the owner has since removed.
- **The FK from `answers` is `deferrable initially deferred`.** Deleting a survey cascades down two paths (through `responses` and through `survey_questions`) whose order Postgres does not guarantee; a deferred check passes at commit because by then neither row exists. An immediate `restrict` would abort survey deletion depending on cascade order, and `cascade` would silently destroy answers.
- **The rebuild raises if an incoming question id already belongs to another survey.** Question ids are generated client-side, so without the check one owner's document could re-point another owner's answers.
- **Closed vocabularies are mirrored as CHECK constraints** — `surveys.status`, `surveys.locale`, `survey_questions.type`, `survey_events.type`. Adding a question type to the union in `domain/question.ts` therefore requires a migration. That is deliberate: without it, a type the database has never heard of lands silently in the column that wave comparison joins on.

**Why.** Owners edit published surveys, and 001 already committed to never rewriting the history of people who have answered. Deleting a question is the one edit that makes that promise hard to keep, so it is the one edit the schema treats specially. The cost is one nullable column and a filter every reader has to remember; the alternative is either data loss or an unexplainable foreign-key error surfacing from an ordinary autosave.

---

## 009 — The public runner reads through `get_published_survey(slug)`, not an anonymous SELECT policy

**Status:** accepted

**Context.** Phase 2 says anonymous users may insert into `responses`, `answers` and `survey_events` for a published survey and select nothing. It does not say how the runner reads the survey definition it is about to render. The obvious move — an RLS policy of `using (status = 'published')` on `surveys` for `anon` — has a property that is easy to miss: RLS filters rows, it cannot require a `where` clause. `select * from surveys` as `anon` would then return every published survey in the instance.

**Decision.** `surveys` has no anonymous SELECT policy at all. The runner calls the `security definer` function `get_published_survey(p_slug text)`, which returns the single published row matching the slug and does not project `owner_id`. Submission goes through `submit_response(...)`, which is `security invoker` so that the RLS policies on `responses` and `answers` remain the enforcement point, and which generates the response id itself rather than using `returning` — `returning` would require granting `anon` SELECT on `responses`.

**Why.** Survey links are unlisted, not secret, but "anyone can enumerate every survey anyone is running" is a different product than "anyone with the link can answer". Taking the slug as an argument makes knowing the link the capability, which is what the product already implies. Keeping submission on `security invoker` means the policies are real and testable rather than decorative.

**Cost accepted.** Two functions to keep in step with the tables, and a repository read path that is an RPC rather than a query.

---

## 010 — Database integration tests run separately from `pnpm check`

**Status:** accepted

**Context.** The Phase 2 tests — RLS, the projection trigger, versioning, the seed — only mean anything against a real Postgres with the migrations applied. `pnpm check` is the contract that must be green before any task is called done, and it has to stay runnable without Docker.

**Decision.** Integration tests are named `*.db.test.ts` and run under `vitest.config.db.mts` via `pnpm test:db`, against local Supabase. The default `vitest` project excludes them, so `pnpm check` stays hermetic. `pnpm test:db` is mandatory after any change under `supabase/` or `lib/db/`.

**Why.** The alternative is a `pnpm check` that fails for a reason unrelated to the change being made, which trains everyone to ignore it. Splitting them keeps one command fast and always-true and the other explicit about what it needs.

**Consequence.** Nothing enforces that `pnpm test:db` was run. It is in `CLAUDE.md`'s command list with that instruction attached; if it starts getting skipped, wire it into CI rather than into `check`.

---

## 011 — Locale is resolved per surface: a cookie for the owner app, `survey.locale` for the runner

**Status:** accepted

**Context.** `docs/PLAN.md` Phase 3 said "next-intl with `et` / `en` / `ru` and a locale segment". Two things downstream contradict a URL segment. The owner app is authenticated and dynamic, and language there is a property of the *person*: a results link forwarded to a colleague should render in their language, not the sender's, which a path segment cannot express. The runner's language is a property of the *survey* — a Russian-language questionnaire is Russian whoever opens it — and the share link in the design mockups is `register.ee/k/maine26`, with no locale in it.

**Decision.**

- **Owner app (`app/(app)`, `app/(auth)`).** next-intl without i18n routing. Locale comes from a `NEXT_LOCALE` cookie written by the sidebar switcher through a Server Action, resolved in `lib/i18n/request.ts`, and the action calls `refresh()` — there is no URL to navigate to. URLs stay `/surveys`, `/settings`, `/login`.
- **Runner (`app/(public)/k/[slug]`, Phase 6).** Locale is `survey.locale`, passed explicitly to `NextIntlClientProvider` and to `getRunnerTranslations(locale)`. Not the cookie, not the URL. Reading a cookie there would make every respondent request dynamic and give up the cacheable render; the share link stays `/k/<slug>`.
- **`getRunnerTranslations` takes the locale as a parameter**, so post-MVP multilingual surveys (PLAN, after-MVP item 3) can add an optional `/k/[slug]/[locale]` segment and pass that value instead, with no change below that function.
- **The catalogues are split by surface now, not later**: `messages/app/{et,en,ru}.json` and `messages/runner/{et,en,ru}.json`. The runner is loaded on a stranger's phone over whatever connection they have and must not ship builder, results or settings copy. Estonian is the source of truth in both; a key absent from `et.json` is not a key.
- **The runner path is `/k/[slug]`, not `/s/[slug]`.** `k` for *küsitlus*, matching the design mockups. PLAN Phase 6 and the `PageProps` example in `CLAUDE.md` said `/s/`; both were updated.

**Consequences.**

- **Several root layouts.** `<html lang>` differs by surface, and only a root layout can set it, so `app/layout.tsx` is gone: `app/(app)/layout.tsx` and `app/(auth)/layout.tsx` are root layouts today and the runner will be a third. That in turn requires `experimental.globalNotFound` and `app/global-not-found.tsx`, since there is no single layout to compose a 404 from. Navigating between the groups is a full page load, which is what happens at those boundaries anyway.
- **One global `Messages` type for two catalogues.** next-intl exposes exactly one, so `lib/i18n/next-intl.d.ts` declares it as `AppMessages & RunnerMessages`. Both trees then get typed keys with no cast at the provider boundary; the price is that the type system will not stop a runner component from naming an owner key. `lib/i18n/messages.test.ts` keeps the top-level namespaces disjoint, so such a mistake surfaces as a missing message rather than resolving silently. The bundle split, which is the point, is unaffected.
- **`lib/i18n/locales.ts` restates the locale list** instead of re-exporting `domain`'s, so a client component importing it does not drag the question union and zod into the browser. The same test asserts the two lists are equal.

**Why not a segment.** It buys SEO-able localised URLs for pages that are behind auth or whose language the visitor does not choose. Neither applies here.

---

## 012 — `components/ui/` is generated, but the strict tsconfig wins where they collide

**Status:** accepted

**Context.** `docs/DESIGN.md` §5 says `components/ui/` is generated and must never be hand-edited — re-run the CLI instead. Phase 0 committed to `exactOptionalPropertyTypes`. Adding the shadcn primitives the design calls for produced code that does not compile under it: `DropdownMenuCheckboxItem` forwards `checked={checked}` where `checked` is `CheckedState | undefined` and Radix's prop is `CheckedState`. `shadcn add` output also trips `react-hooks/set-state-in-effect` in `hooks/use-mobile.ts`.

**Decision.** The compiler settings win, with the smallest possible footprint and a record of every place they were applied.

- **`components/ui/dropdown-menu.tsx` is repaired by hand**, one line: `checked={checked}` became `{...(checked !== undefined && { checked })}`. Re-running `shadcn add dropdown-menu` reverts it, and `pnpm check` fails immediately when it does. That is an acceptable trip-wire; a build that does not typecheck is not.
- **`hooks/use-mobile.ts` is ignored by ESLint and Prettier**, alongside `lib/db/database.types.ts`, rather than repaired: it is regenerated by `shadcn add sidebar` and its lint failure is stylistic, not a correctness problem.
- **The two hardcoded English strings inside the generated mobile sidebar sheet** (`"Sidebar"`, `"Displays the mobile sidebar."`, both `sr-only`) are left alone for now. Everything reachable from our own code is translated: `SidebarTrigger` was not used, because it hardcodes its own screen-reader label — `components/shell/sidebar-toggle.tsx` is the same primitive with a translated one.

**Why not relax the compiler.** `exactOptionalPropertyTypes` is what makes the difference between an absent optional field and one explicitly set to `undefined` a type error, which the repository layer in `lib/db/` depends on throughout. Turning it off to accommodate a component we do not use would be the tail wagging the dog.

**Revisit** when the shadcn registry ships an `exactOptionalPropertyTypes`-clean build; the repair can then be dropped by re-running the CLI.
