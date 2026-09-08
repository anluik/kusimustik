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

---

## 013 — Wave grouping is part of the survey list, and the disclosure is not `Collapsible`

**Status:** accepted

**Context.** Phase 4 is "list, create, rename, duplicate, delete, publish/close", and duplication is what creates a wave group (003) — the copy keeps the source's `wave_group_id`. An ungrouped list therefore shows two identically titled rows the first time an owner presses duplicate, with nothing to say they are the same survey run twice. `docs/DESIGN.md` §5 shows the grouped list and maps expand/collapse to shadcn's `Collapsible`, which cannot be composed with the `Table` the same section asks for.

**Decision.**

- **Grouping ships with the list, not with wave comparison.** `lib/surveys/list.ts` is a pure module that folds the summaries into `StandaloneRow | WaveGroupRow`, orders by most recent activity, and filters. A group is titled for its newest wave, shows the newest wave's question count and the series' summed responses, and is never demoted to a standalone row by a filter — a wave belongs to a series whether or not its siblings are on screen. Comparison itself (PLAN, after-MVP item 2) is still deferred; there is no "compare waves" control.
- **The disclosure is a plain `button` with `aria-expanded`, and the wave rows are conditional `TableRow`s.** `CollapsibleContent` renders a `div`, and a `div` between `tbody` and `tr` is invalid HTML that the browser hoists out of the table — the waves would render above the list. Splitting each group into its own `Collapsible`-wrapped `tbody` does not help, since trigger and content must share one parent.
- **The group's actions menu acts on its newest wave**, per §5's "one actions menu component serves both row kinds". The delete dialog names the wave (`title · waveLabel`) rather than the series so that it cannot be read as deleting all of it.

**Why not a `div` grid.** §5 permits one "if virtualising", and `Collapsible` composes with it. But the list is a table of five columns with a header row, and dropping table semantics to gain an animation is the wrong trade; nothing here is virtualised yet.

**Consequence.** No expand/collapse animation. `components/ui/collapsible.tsx` was added by the CLI for this and then removed again, since nothing imports it; `pnpm dlx shadcn add collapsible` brings it back if the builder wants one.

---

## 014 — The builder's autosave, its staged editors, and how question keys follow titles

**Status:** accepted

**Context.** Phase 5 step 1 is the three-panel builder: the element list with dnd-kit reordering, add and delete, autosave, and the editor panel for `single_choice` only. Four things had to be settled to build it, and none of them is obvious from the plan.

**Decision.**

- **Autosave is a debounced mutation over local state, not TanStack Query.** PLAN says "autosave debounced through TanStack Query with optimistic updates", and `hooks/use-survey-builder.ts` does not use it. There is no server-state cache here to reconcile: the document arrives as props from the server render, the reducer in `lib/builder/document.ts` owns it from then on, and an edit is applied locally and never rolled back — the optimism is structural rather than something a mutation has to simulate. What the server owns is the *version*, the optimistic-concurrency token `updateSurveyDefinition` already takes: the builder keeps the version the last save returned and sends it with the next one, so a second tab gets `conflict` instead of silently overwriting. A `useMutation` would still have left the debounce, the version bookkeeping, the single-flight guard and the conflict path to write by hand. TanStack Query enters when Phase 7 has queries worth caching; `lib/query-keys.ts` does not exist yet and should not be invented before it has a key in it.

  Three consequences worth knowing: the save is **held** while any element fails `SurveyElementSchema`, so an emptied option label parks the document rather than round-tripping a rejection; a failed save **stops** the loop until the owner retries, so a persistent failure cannot become a request loop; and `saveSurveyElementsAction` deliberately does **not** revalidate — it fires while the owner is typing.

- **`components/ui/` is generated, but the element list is not a `Sidebar`.** DESIGN §5 maps the left panel to shadcn's `Sidebar` in its secondary variant. `Sidebar` reads `SidebarProvider` context, and `app/(app)/layout.tsx` already has one for the app's own navigation; a second `Sidebar` inside it shares that single open/collapsed state and collapses with the nav. The panel is therefore a plain `aside` carrying the sidebar tokens.

- **The drag has no row displacement, so dnd-kit's transforms are ignored.** DESIGN §5 asks for a 2px primary rule with a dot and says explicitly not to displace the rows. `useSortable`'s `transform` and `transition` are therefore not applied; a `DragOverlay` follows the pointer and the rule is drawn from `activeIndex` / `overIndex`. Two things this costs: the drop indicator is hidden behind the overlay during a keyboard drag, and the collision maths no longer has the list rearranging under the pointer to confirm it. Both were checked by hand, with a pointer drag and with the keyboard sensor.

  **`DndContext` needs an explicit `id`.** dnd-kit numbers its own ids from a module-level counter, so the `aria-describedby` it puts on every drag handle came out `DndDescribedBy-0` on the client and `-1` on the server and the tree failed to hydrate. Naming the context pins it. Any future `DndContext` needs the same.

- **A question's `key` follows its title only while nothing can be joined on it.** `key` is preserved across duplication and is what wave comparison and CSV columns join on (003), so it cannot track the title forever — rewording a question a year later would sever its own trend line. But a key derived from the placeholder title a new question is born with (`uus_kusimus`) is no use either, and there is no key editor yet. So `lib/builder/keys.ts` derives the key from the title while **both** hold: the survey has never been published (no answers exist), and it is the only wave in its group (no sibling survey's keys line up against it). Otherwise the key is frozen and the panel says so. Within `derive`, the key still only moves while it *is* the key its current title derives to, which is what will keep a hand-written key intact once a key editor exists.

- **Element types the builder cannot yet edit are named, not defaulted.** `CREATABLE_ELEMENT_TYPES` in `lib/builder/new-element.ts` is the set the add menu enables; the other eight are listed in the menu, disabled, with the "coming soon" badge (DESIGN §6). But a survey can still *contain* any of the nine — seeded, duplicated, or authored before a type's editor existed — so the preview and the editor both switch over all nine, list the eight unimplemented ones case by explicit case, and end in `assertNever`. That is not a fallback branch: a ninth type still fails the build, and the list is the checklist of what Phase 5 has left. Turning a type on means adding it to `CREATABLE_ELEMENT_TYPES` — which fails the build in `createElement` until it knows how to build one — and moving it out of the two placeholder branches.

**Consequence.** Deleting an element is immediate and has no undo; the trigger tombstones the projection row rather than dropping answers (008), so nothing is lost but the definition. A key editor, option reordering, duplicating an element, and the survey-level settings (title, locale, wave label) are all still missing from the builder and belong to the later steps of Phase 5.

---

## 015 — Finishing the builder: nine editors, a key editor, and where the survey's own settings live

**Status:** accepted

**Context.** 014 left Phase 5 at step 1: `single_choice` had an editor, the other eight types were named case by case and sent to a "not ready yet" panel, and four things were listed as belonging to the later steps — a key editor, option reordering, duplicating an element, and the survey-level settings. This entry is those steps.

**Decision.**

- **One editor component per type, no shared editor taking a flag.** `components/builder/editor-panel.tsx` switches over all nine and ends in `assertNever`; each branch renders its own component. `single_choice`, `multi_choice` and `dropdown` look similar and are still three files, because they differ in what they *offer* — a written answer, selection bounds, neither — and a single component branching on `type` internally would be exactly the fallback branch this codebase forbids, one level down. What they genuinely share is factored out instead: `element-fields.tsx` (title, help text, key, required, the "other" pair) and `option-list-editor.tsx` (a reorderable list of choices, used four ways — options, matrix rows, matrix columns). `short_text` and `long_text` do share one, since they differ only in a number.

- **`CREATABLE_ELEMENT_TYPES` is now the whole union but is still its own list.** It is deliberately not an alias of `ELEMENT_TYPES`: a tenth type has to be taught to `createElement` before the add menu offers it, and the `assertNever` there is what makes that a build error. The menu's disabled "coming soon" branch draws nothing today and stays — it is the state DESIGN §6 specifies for a type that will exist later, and a tenth type lands in it on its own.

- **The optional-field helpers are pure and live in `lib/builder/element-patch.ts`.** `exactOptionalPropertyTypes` makes "absent" and "present and undefined" different types, so every optional field needs `delete` on a copy rather than a spread. Putting those in one tested module also gave the two rules that are easy to get wrong somewhere to live: turning "other" on carries a label in because the schema demands one, and the selection bounds *clamp* — editing one bound pulls the other along, deleting an option pulls both down. Without the clamp the panel would routinely hold the autosave on a document the schema rejects, which reads to the owner as a save that stopped for no reason.

- **The key is editable, and a frozen key is warned about rather than refused.** PLAN Phase 1 asks for all three: derive from the title, let the owner override, warn loudly before a rename on a published survey. So the Mono chip DESIGN §5 specifies gained an edit button; under `freeze` it goes through an `AlertDialog` naming what breaks (the trend line, the CSV column header). It is a warning, not a block — an owner who has read it may still have a good reason, and 014's derive rule already stops following the title the moment a key is hand-written, since the key then no longer *is* what its title derives to.

- **Option rows displace as they drag; element rows still do not.** DESIGN §5's stationary-list-plus-drop-rule treatment (014) is for the element list, where rows are many and the panel is tall. An option list is a handful of short rows inside the editor panel, where the ordinary sortable transform is legible and an overlay would be more machinery than the problem needs. Both dnd contexts are named — `options-<id>`, `rows-<id>`, `columns-<id>` — for the hydration reason 014 records.

- **Duplicating an element takes a fresh key; duplicating a survey does not.** They look like the same operation and are opposites. `duplicateSurvey` preserves keys so waves stay comparable (003). `duplicateElement` puts the copy in the *same* survey, where a shared key fails `SurveySchema` and would mean two CSV columns claiming one header, so it derives a new one (`nps` → `nps_2`). The copy is inserted directly after its source and selected.

- **The survey's own settings are a dialog, and the save hands the version back.** Title, runner locale and wave label are read once and changed rarely, and two of the three change what a respondent sees at the public link — so they are a `Dialog` with an explicit submit, not the panel's keystroke autosave. The reason it could not simply call `renameSurveyAction` is the version: title and locale are part of the definition, so `surveys_before_write` bumps `version`, and the builder's next autosave would lose to a `conflict` it did not cause. `saveSurveySettingsAction` therefore takes `expectedVersion` and returns the new one, `useSurveyBuilder` exposes `version`/`syncVersion`, and the save is passed the version as an argument rather than closing over it. (`wave_label` is not part of the definition and does not bump anything — it names a wave for comparison rather than changing what is asked.)

- **`EditorPanel` insets its header inside the `Sheet`.** `SheetContent`'s own close button is `absolute top-3 right-3`, directly on top of the panel header's actions. With Delete alone that was a near miss; with Duplicate beside it, one mis-aimed click deletes an element that has no undo. `insetHeader` adds the padding rather than hand-editing `components/ui/sheet.tsx` (012).

**Consequence.** Phase 5 is complete: every type can be created, previewed, edited, reordered, duplicated and deleted, and the survey's own settings are reachable from the builder. Still absent, and correctly so — they are later phases or post-MVP: the type picker that converts one question into another (DESIGN §5 lists it, but the answer-migration question it raises is not a Phase 5 question), the builder's Build/Logic tabs and the ⌘K palette (skip logic is post-MVP item 1), and undo.

---

## 016 — The runner: one page, native controls, and a closed survey that says so

**Status:** accepted

**Context.** Phase 6 is the public runner at `/k/[slug]`. `docs/PLAN.md` settles the big shape — server-rendered, no auth, mobile-first, all-on-one-page, `survey_events` emitted from the start — and leaves the rest open. These are the calls made building it.

**Decisions.**

- **A closed survey is reachable, and `get_published_survey` is gone.** It is replaced by `get_runner_survey(slug)`, which returns a published *or* closed row. Without it a link to a survey that has stopped collecting renders the same 404 as a typo, and `RunnerClosed` — copy that has been in the catalogue since Phase 3 — is unreachable. Nothing about 009 changes: the slug is still the capability, `surveys` still has no anonymous SELECT policy, `owner_id` is still not projected, and the insert policy on `responses` still requires `status = 'published'`, so the database refuses an answer to a closed survey whatever the runner renders. The repository returns the survey *and* its `published_version`, which the draft's storage key needs.

- **The runner reads through its own cookie-less anonymous client.** `lib/supabase/public.ts`. `createServerDb()` calls `cookies()`, and DECISIONS 011 chose `survey.locale` over a locale cookie precisely so a respondent request need not be dynamic — reading the session cookie instead would have given that back. It also means a signed-in owner opening their own public link is treated as a stranger, so the policies the runner exercises are a respondent's rather than the owner's.

- **The root layout is `app/(public)/k/[slug]/layout.tsx`.** `<html lang>` must be `survey.locale` (011) and only a root layout can set it, so the root layout has to be the segment that knows the slug. `loadRunnerSurvey` is wrapped in React's `cache`, so the layout and the page share one query. A slug that matches nothing falls back to Estonian and renders `not-found.tsx` **inside that shell** rather than `app/global-not-found.tsx`, which is the owner's 404 — it speaks the owner's cookie locale and offers a link into the dashboard.

- **Respondent-facing validation is a code, not a Zod message.** 007 deferred this to Phase 6. `lib/runner/validation.ts` runs `buildAnswerSchema` for the verdict and then *names* the failure as an `AnswerProblem` — `required`, `selectAtLeast`, `matrixIncomplete`, … — which maps one-to-one onto `RunnerProblems.*`. It cannot disagree with the schema, because the schema is what decides; it only supplies wording. `domain/` keeps no i18n dependency.

- **Native radios, checkboxes and `<select>`, not Radix.** The builder uses shadcn primitives; the runner does not. DESIGN §10 says the respondent cannot be asked anything — not to use a modern browser, not to wait for hydration. Native controls have the right keyboard behaviour, the right screen-reader semantics and the right on-screen keyboard before any of our JavaScript arrives, and a native `<select>` opens the phone's own picker, which is what the long option lists `dropdown` exists for actually want. `accent-color` makes them the survey's colour without giving that up. No new `components/ui/` primitive was needed.

- **The matrix is stacked, not a grid.** One labelled radio group per row. DESIGN §4's "one column, no side-by-side controls" at a 380px baseline is the reason: a five-column grid on a phone truncates every column label and gives each cell a target no thumb can hit. The builder's canvas still previews the grid, which is the shape the *author* is editing; the two are deliberately different views of the same question.

- **Progress is answered-questions, not position.** All-on-one-page has no "current question", so `RunnerShell.progress` counts answerable questions holding an acceptable answer. A statement block is not progress, and an answer that is present but invalid does not count — the bar never fills while something is still blocking the submit.

- **A problem is shown once the respondent could have caused it**: after they have touched that question, or after they have pressed submit. A page of red on arrival is not feedback. Pressing submit with something outstanding focuses the first blocking card and *then* scrolls to it — `focus()` cancels a smooth scroll already in flight, even with `preventScroll`, and the respondent is otherwise told something is wrong without being shown where.

- **The draft is stored state plus an overlay, not state restored in an effect.** `localStorage` is read once `useMounted()` is true and the typed edits are laid over it; an edit of `null` is how a cleared answer beats a stored one. Setting state from an effect to catch up after hydration is the cascading render `react-hooks/set-state-in-effect` exists to stop, and the codebase already has `useMounted` for exactly this. The storage key carries the survey's `published_version`, and every restored entry is re-parsed and matched against the question it claims to answer, so a republished definition cannot leave a form that refuses to submit for an invisible reason.

- **Analytics timestamps are monotonic offsets, and the server anchors them.** The beacon sends `performance.now()` offsets rather than wall-clock times, and `stampEvents` reconstructs the spacing against the moment the batch arrived, clamped to six hours. A phone with a wrong clock would otherwise file its events in 2019, where the funnel's date filters silently lose them — and a client timestamp is attacker-controlled input on a public endpoint besides. Dwell time is measured client-side and travels in `meta`, so it is immune to both.

- **`view` is claimed in `sessionStorage`, not in a ref.** React's development-mode double mount would otherwise count every visit twice. `question_view` comes from an `IntersectionObserver` at 40%, `question_answer` fires once per question when it first holds an acceptable answer, and `abandon` fires at most once, on `visibilitychange`/`pagehide`, never after a submit. `/api/events` is exempted from the proxy's deny-by-default **by endpoint rather than by prefix**, because Phase 8's CSV download lands under `/api` and belongs to the owner.

- **The thank-you screen is a state, not a route.** Submitting swaps the form for the notice in place. A `/k/[slug]/thanks` route would need its own copy of the root layout's survey lookup to know its own language, and would be reachable — and refreshable — by anyone who never answered anything.

- **The runner is `noindex, nofollow`.** A survey link is unlisted rather than secret, and indexing it would make it neither: search traffic answering a questionnaire is noise in someone else's data.

- **`--survey-*` is declared once, in `:root`.** DESIGN §8's namespace is aliases of the app tokens, which `.dark` already redefines, so they are correct in both themes without being restated there; §1's "add it to both blocks" rule is about colour values, and the only real value here is the 6px radius, which does not vary. The runner still ships `ThemeProvider`: a respondent has no theme switch, so the runner follows the device, and DESIGN §1 expects both themes to be correct everywhere.

**Consequences.** Phase 6 is complete: a stranger can open the link on a phone, answer all nine element types, lose the tab and come back to their answers, and submit — and the owner gets the response, the answers and the interaction events Phase 7's funnel is built from. `e2e/runner.spec.ts` proves it end to end on a desktop and a phone viewport, and cleans the response it made back out of the seed so `pnpm test:db`'s distribution assertions keep holding.

**Not done here, deliberately.** Bot protection and rate limiting on the public endpoints (PLAN, after-MVP item 11) — the submit action and the beacon are both open, and that has to be closed before any real launch. There is also no resume-across-devices: the draft is one browser's `localStorage` and nothing else.

---

## 017 — DESIGN.md wins on presentation, PLAN.md wins on scope; the chart switcher is derived from the question type

**Status:** accepted

**Context.** Phase 7 asks for a per-question chart switcher and named its options as "bar / horizontal bar / pie / doughnut / line", calling it connect.ee's genuinely good idea. `docs/DESIGN.md` §7 says "Never a pie or donut, at any count", caps the categorical palette at five entries, and requires six or more categories to become horizontal bars in a single fill. Both documents claim authority and neither cites the other, so the conflict had to be settled as a class rather than one chart at a time — §11 records overrides of *earlier decisions* but never names PLAN.

**Decision.**

- **`docs/DESIGN.md` governs presentation; `docs/PLAN.md` governs scope.** What a phase must deliver is PLAN's call. What it looks like, what it is coloured, and which encodings are permissible is DESIGN's, and DESIGN wins wherever the two touch. PLAN Phase 7 was rewritten to match rather than left standing, because a stale list in the plan is how a future session reinstates a pie chart.

- **Pie and doughnut are gone entirely**, not merely defaulted away from. They predate the contrast audit and were copied from a competitor's feature list; §7's prohibition was derived from measured constraints — the categorical palette is deuteranopia-separable only to five entries, and angle is the least accurately read of the visual encodings besides.

- **The switcher's options are derived from the question, by `chartKindsFor` in `domain/charts.ts`, which ends in `assertNever`.** A fixed menu of five buttons filtered at the render site would let a tenth question type inherit every encoding by default and be wrong silently. Deriving them makes "how is this charted?" a question the compiler asks. The rules:

  | Question type | Kinds, default first |
  |---|---|
  | `single_choice`, `multi_choice`, `dropdown` | `bar_horizontal`, then `bar_vertical` **only** at ≤ 5 options with short labels |
  | `opinion_scale`, `nps`, `matrix_single` | `ramp_bar`, `ramp_stacked` |
  | `short_text`, `long_text` | none — a `TextSummary` is a list of responses, and there is nothing to chart |

  Vertical bars are conditional because §7 forbids rotated labels outright: a vertical bar chart whose category names do not fit horizontally has no legal way to label itself, so the encoding is offered only where it can be drawn correctly. `CHART_VERTICAL_MAX_OPTIONS` and `CHART_SHORT_LABEL_MAX` are the two thresholds, in `domain/charts.ts` and tested.

- **`line` exists in the union but is offered by nothing yet.** §7 permits vertical bars for time series, and a line is the encoding for a value tracked across waves — but that is a *series*, and nothing in MVP produces one. `chartKindsFor` therefore takes the data shape as its second argument (`"single_wave" | "series"`) and returns `line` only for `"series"`. Every Phase 7 call site passes `"single_wave"`. This is one parameter and two tests rather than a comment promising a future reader something, and it means wave comparison (PLAN, after-MVP item 2) adds a call site rather than a rule.

**Why not simply let the owner pick any chart for any question.** Because they would, and §7's rules are the ones that keep the result readable — a fourteen-option question rendered as five colours recycled three times is not a preference, it is a defect. The switcher exists to let an owner choose between encodings that are all correct for their data, which is the part of connect.ee's idea that is actually good.

**Consequence.** Adding a question type now fails the build in two more places: `chartKindsFor` joins `buildAnswerSchema`, `aggregate` and `toCsvColumns` in `domain/`, and `toAnswerDisplay` in `lib/results/` joins them from outside it. Verified by adding a tenth type and reading the errors — the failure in each is a prompt to decide how the type is drawn and how one answer to it reads in a table.

---

## 018 — Building the results surface: where aggregation happens, what is live, and what the funnel counts

**Status:** accepted

**Context.** Phase 7 is the results surface — stat cards, per-question charts, the individual-responses table, and the drop-off funnel. 017 settled the charts. These are the rest of the calls, recorded because most of them are not recoverable from the code.

**Decisions.**

- **Aggregation happens in TypeScript, not in SQL.** The page fetches every response and calls `aggregate()`. Doing it in Postgres would be faster and is the obvious thing to reach for, but it would be a *second* definition of what a summary means — a second answer to "what is the mean of this scale", "does a skipped question count in the denominator", "where does an `allowOther` answer go" — with nothing comparing the two. `domain/aggregate.ts` is the definition, it is tested against a hand-built fixture, and the runner, the CSV export and the charts all have to agree with it. Paging enters when a survey has enough responses for the fetch to hurt; nothing here is written in a way that makes that hard.

- **The funnel *is* SQL, because it is not a domain question.** `survey_funnel_totals` and `survey_question_funnel` group `survey_events`, which PostgREST cannot express and which would otherwise mean shipping a busy survey's whole interaction log to the browser to count it. Both are `security invoker`, so the RLS policy on `survey_events` stays the enforcement point — `lib/db/funnel.db.test.ts` proves a second owner gets an empty funnel rather than an error, which is the property that stops the endpoint being an oracle for which survey ids exist.

- **Neither funnel function returns a key, title or position.** Those are definition data and come from `surveys.elements` through `SurveySchema`; `survey_questions` is an index, not a source of truth (002). `buildFunnel` joins the counts onto the document, which is also what settles the two cases the counts alone cannot: a question added since the last visit is a genuine zero, and a question removed since must not appear at all.

- **Counts are of distinct sessions, not event rows.** The runner already emits each type at most once per visit, but the funnel's meaning *depends* on that, so the SQL enforces it rather than trusting the client that wrote the rows. A retried beacon is otherwise a second view.

- **A skip and a drop-out are reported separately.** `reached` and `answered` are different columns, and a question stage carries both. They look identical in a single count and are entirely different things to an owner: one says the question was hard to answer, the other says it was where people left. The drop itself is attributed to the stage people failed to *reach* — the standard funnel reading — so the cliff caused by a long free-text question is flagged on the question after it, and the free-text question shows the large skip.

- **Completion rate is submits over *starts*, not over views**, and is `null` rather than 0 when nobody started. Someone who opened the link and never touched a control did not enter the survey, and counting them makes the figure a measure of the link's audience. A card reading "0% completed" for a survey nobody has opened states a failure that has not happened.

- **Only the response count is live, and only `responses` is published to realtime.** `answers` and `survey_events` are not: an owner watching a number does not need every answer pushed to their browser, and `survey_events` is the highest-volume table in the schema. The subscription only ever moves the count forward — a submitted response is immutable and has no UPDATE policy — and a failed subscription leaves the server's number in place rather than breaking the page. The "live" badge appears only once a submission has actually arrived over the socket, because a badge claiming live on a page whose socket silently failed is a lie the owner cannot check.

- **TanStack Query is still not used, and `lib/query-keys.ts` still does not exist.** 014 deferred it to "when Phase 7 has queries worth caching". It does not: the page is one server render, the shaping is pure, and the one live thing owns a websocket rather than a cache. Inventing a key factory with nothing to put in it would be worse than not having one.

- **TanStack Table is v9**, which is a different library from the v8 every example describes: `useTable` rather than `useReactTable`, and row models registered as slots inside `tableFeatures` rather than passed as options. Only `rowSortingFeature` is registered — an unregistered feature has no state, which is the point of the v9 model. The search filters the rows *before* they reach the table, against a precomputed `searchText` built from the answers, so a search matches what people answered rather than what the owner's current UI language formatted it into.

- **The individual-responses table is not the CSV's shape.** `toCsvColumns` fans a multi-choice out to one flag column per option so a machine can read it; a person reading one respondent's answers wants "Email, Slack" in one cell. Both are driven from the same question, so they cannot disagree about *what* was answered — only about layout. `toAnswerDisplay` returns the answer structured rather than joined, so the separators stay in the JSX where they belong and no punctuation is hardcoded in a pure module.

- **No value label sits on a ramp fill except inside a stacked segment**, where there is nowhere else for it to go. DESIGN §7 requires such a label to flip at `--ramp-label-flip`, which is 5 in light and 4 in dark — a threshold that cannot be known at render time on the server. `rampLabelColor` does it in CSS instead, exploiting `color-mix`'s clamping of an out-of-range percentage to turn the comparison into arithmetic. Everywhere else the label sits beside the bar, which §7 also permits and which needs no flip.

- **`rampStep` bins with `ceil((index + 1) * 7 / count)`** because that reproduces §7's worked fifteen-stage example exactly, and it spreads a *short* sequence across the whole ramp rather than crowding it into the pale end where §7 notes steps 1-4 fall below 3:1 on `--card`.

- **The seed grows interaction events, for wave two only.** The funnel is otherwise unviewable and untestable against a survey that plainly has 30 responses, which is the one thing the empty state must not do. Wave one is deliberately left without them: a survey that collected responses before the instrumentation existed is a real state and its empty state has to be reachable. Dwell is held constant per question so `pnpm test:db` can assert the medians exactly.

**Not done here, deliberately.** DESIGN §5's **device-mix bar** is listed under the behaviour tab but is not in PLAN Phase 7's scope, and 017 settles that PLAN governs scope — the `meta.device` the runner already sends makes it a later afternoon's work. There is no response paging, no date filtering on the funnel, and no delta figures against a previous period (§5 specifies the delta's *styling*, but there is nothing to compare against until wave comparison ships, which is after-MVP item 2).

---

## 019 — The CSV export's file conventions, and where the close-out states live

**Status:** accepted

**Context.** Phase 8 wires `toCsvColumns` / `toCsvCells` to a download route and then closes the MVP out: empty states, loading skeletons, error boundaries, a pass over the et/ru catalogues, and mobile QA on the runner. The domain settled what a question contributes to a file in Phase 1; none of what follows was settled anywhere.

**Decisions.**

- **The file is semicolon-delimited, BOM-prefixed and CRLF-terminated.** RFC 4180 says comma; Excel splits on the *system list separator*, which is `;` on an Estonian Windows, and a comma-delimited file therefore opens as a single column of junk for the customer this product is for. The BOM is what makes the same Excel read `õ` as `õ`. Both are decisions about the file opening at all, so they are not negotiable on style grounds; `lib/results/csv.ts` is where they live and the only place they are written down in code.

- **A cell that a spreadsheet would execute is prefixed with an apostrophe.** Respondents type free text and owners open the result in Excel or Sheets, both of which run a cell beginning `=`, `+`, `-` or `@` on open. Numbers are exempt — a leading sign followed by nothing but digits and separators cannot be a formula — so `-5` from a scale and `+372 5555 5555` from a text answer survive intact and only the genuinely formula-shaped cells are mangled.

- **Timestamps are ISO 8601, not `12. jaan 2026`.** DESIGN §9's Estonian formatting is for *display*; a spreadsheet has to sort and parse this column, and a localised date string in a CSV is data that has been turned into presentation on the way out.

- **The metadata columns come first and are translated; the question columns are the author's own words.** `Vastuse ID`, `Esitatud`, `Keel`, `Versioon` are ours and go through the catalogue in the *owner's* UI locale, because they are chrome. A question header is what the author wrote in `surveys.elements` and is never translated — there is only one of it, and it is the same string the runner showed.

- **The download is a Route Handler at `/api/surveys/[surveyId]/export`, not a Server Action.** The browser has to navigate to it for `Content-Disposition` to mean anything, and actions queue one at a time per client besides. It is deliberately not under a public prefix: `PUBLIC_PREFIXES` lists `/api/events` as one endpoint rather than exempting `/api`, which is what keeps this one behind a session — `lib/routes.test.ts` asserts it. The handler re-checks the session itself and lets RLS scope the reads, so "not yours" and "deleted" are the same 404.

- **Error boundaries are per root layout, plus one global.** `(app)`, `(auth)` and the runner each get an `error.tsx` inside their own layout, so the chrome stays on screen and the wording comes from the provider that layout set up — DESIGN §6 forbids a full-page error for a partial failure. `global-error.tsx` catches what those cannot, a root layout's own failure, and **its copy is Estonian in every locale**: the locale is in a cookie a client component cannot read and the provider is part of what failed. The strings are still read from `messages/app/et.json` rather than written inline, so a copy edit reaches it.

- **The runner gets no `loading.tsx`.** Its root layout awaits the same cached read the page does, so a fallback under that layout could only appear after the data had already arrived. The three owner routes get one each, matching final geometry — 46px list rows, the builder's 268 / fluid / 340 panels, the four stat cards above the results tabs.

- **Mobile QA is a spec, not a checklist.** `e2e/runner-mobile.spec.ts` asserts what DESIGN §4 and §10 actually promise — no horizontal scroll at 380 *or* 320, every tap target ≥ 44px, the progress and the action still pinned half way down, and the same after a failed submit puts an alert above the action. It measures inside the page rather than through Playwright locators, because a CSS locator pierces shadow DOM and hands you Next.js's own dev-mode indicator to fail on.

**Consequence.** Adding a question type still fails the build in `toCsvColumns` and `toCsvCells`; nothing in this phase adds a new exhaustive switch, because the file format is a property of the file rather than of the question. What did change is that `lib/results/` now has two consumers of the same questions — the table and the export — which is the split DECISIONS 018 predicted and the reason neither is allowed to invent its own reading of an answer.

---

## 020 — Fixing the MVP review: charts that measure themselves, delete that asks, and abandonment resolved in SQL

**Status:** accepted

**Context.** The MVP review ran every suite green — 439 unit, 61 database, 12 e2e, a clean production build — and then found ten defects, every one of them in the rendered UI, which nothing exercised. Two were serious enough to be product failures rather than polish: the results charts intermittently rendered nothing at all, and the builder's delete button destroyed authored questions on a mis-click three times in one session. This entry is the fixes and the reasoning that is not obvious from the diff.

**Decisions.**

- **`ChartContainer` measures its own box and hands Recharts fixed numbers.** Recharts 3's `ResponsiveContainer` reads `getBoundingClientRect()` once in a mount effect and then waits for a `ResizeObserver`; a box that has not been laid out at that instant is stored as 0×0, and `ResponsiveContainerContextProvider` renders `null` rather than a chart — permanently, because a box that never changes size never fires the observer. A synthetic `resize` drew all 25 bars instantly, which is what identified it. `hooks/use-element-size.ts` reads the size through `useSyncExternalStore`, so the measurement is taken *during render, every render*, straight from the DOM, and the observer only says when to look again; passing the resulting numbers as `width`/`height` makes Recharts skip its size detector entirely. `initialDimension` stays as the pre-measurement fallback so the server render still draws something.

  This is the second hand-repair in `components/ui/` and it is recorded here for the reason 012 gives: re-running `pnpm dlx shadcn add chart` reverts it, and `components/results/category-chart.test.tsx` fails immediately when it does. That test stubs `ResizeObserver` deliberately — jsdom has none, and its *absence* is what made the old code pass, because Recharts then bailed out of measuring and kept its initial dimensions. A browser has one, observes a box of no size, and draws nothing.

- **Delete leaves the editor panel's header and goes through an `AlertDialog`.** DESIGN §5 puts duplicate and delete side by side in the panel header. Inside the `Sheet` that header lands on the same pixels as the app bar's "add question" button behind it — measured, the centre of Add falls inside Delete — so the most repeated action in the builder and the most destructive one were the same click, resolved only by whether the sheet had finished closing. 015 added `insetHeader` for the collision with the sheet's own ✕ and it was never enough (4px), and padding could not have fixed the app-bar collision at all. Delete now sits in a footer of its own, and confirms first — the same treatment §5 already gives deleting a survey, which is a strictly smaller loss than deleting a question with its options, matrix rows and scale labels. Duplicate stays in the header: a stray copy is undone by deleting it.

- **An abandonment is a property of a session, and sessions are resolved in SQL.** `visibilitychange` is the only signal a phone gives before a tab is discarded, so the runner files `abandon` there; the session id lives in `sessionStorage` and survives both a reload and an app switch, so the same person could be counted as abandoned *and* completed. The client guard could only ever block an abandon after a submit — by the time a submit follows an abandon, the row is written. `survey_funnel_totals` therefore groups per session and counts an abandon only where that session never submitted, which also covers what no client can see: a lost beacon, a second device, events arriving out of order. The client keeps a `sessionStorage` flag as well, so the *log* does not fill with abandons that the query then has to discard.

- **The builder preview borrows the runner's words, and a test says so.** The canvas promises "näed siin, kuidas vastaja seda näeb"; for NPS it showed different endpoint labels from the ones at the public link, because the two catalogues (011) are the one place respondent-facing copy can silently diverge. `messages.test.ts` now pins the pairs. Add to `SHARED_RESPONDENT_COPY` whenever the preview borrows respondent copy again.

- **Owner content stops at 1280px; the builder does not.** Nothing constrained line length, so on a 3440px monitor a survey row put its title at one edge and its status badge 2,700px away. `PAGE_WIDTH` is shared by the app bar's contents and the page below it so the two stay in one column, and the bar's own background still spans the window. The builder is exempt: it is a three-panel workspace sized by DESIGN §4, and its canvas already caps itself at the runner's 640px.

- **The survey list drops columns on a phone rather than scrolling.** Below `sm` the status and date columns give way and are restated inside the first cell; the response count keeps its column at every width, because "how many responses do I have" is the one thing an owner checks from a phone. Search and the status filter are rendered over the table at that width instead of in the 44px bar — hidden there, not dropped.

- **Written-answer questions start optional.** Every other type still starts required. A required open-ended question cannot be answered by tapping and is where a phone respondent leaves; the author can still require one, but the default is the one that does not cost them responses.

- **`safeReturnPath` refuses route handlers, and redirects the export to its results page.** Signing in from an expired session on the CSV download used to hand the owner a file instead of a screen. A route handler is not a destination; the export is sent to the page its download button is on, and every other `/api` path falls back to the survey list.

- **The display name and the survey description got the UI they never had.** `updateDisplayName` and its policy shipped in Phase 3 and `description` has been in `SurveySchema` from the start — both were reachable only from seed data, so a magic-link signup could not be called anything and the runner had a slot for context it was impossible to write. The description belongs to the survey settings dialog rather than the create dialog: it is part of the definition, so saving it bumps the version, which is exactly what that dialog already carries `expectedVersion` for.

- **Creating a survey opens it.** The dialog says questions come next; returning to a list where the only thing to do is find the row just created made a liar of it.

- **One `main` per document.** `SidebarInset` renders a `<main>`, so every owner page that rendered one of its own was nesting a landmark inside a landmark. The pages give theirs up — the shell's is the landmark, and `LoadingMain` is now `LoadingRegion` because it renders a `div` and `aria-busy` never needed a landmark to live on. The sign-in shell gained one, having had none at all. `components/shell/landmarks.test.ts` is a trip-wire over the source, because the offending pair is split across a layout and a page that only the router brings together: `<main>` may appear only in the six files that each own one document's landmark, and both directions are asserted, so a stale entry fails too.

**Component tests exist now, and this is what they are for.** `vitest.config.mts` was already jsdom with `@vitejs/plugin-react`, and no `.tsx` test had ever been written — which is precisely why every defect above survived a green suite. `components/test-support.tsx` renders with both catalogues under one `NextIntlClientProvider`, and `vitest.setup.ts` unmounts between tests (auto-cleanup does not register, because `globals` is deliberately off). The new tests are regression tests first: a chart that draws in a container of no measured size, a delete that does not fire until it is confirmed, an added option that has the caret in it.

**Still open.** The review also recorded a "Maximum update depth exceeded" seen once in the console during builder editing and never reproduced, by the reviewer or here. No render-time `setState`, no effect that writes the state it depends on, and no unstable `items` identity feeding a dnd-kit measurement loop was found in our own code; the nine editors are now mounted and edited in `editor-panel.test.tsx`, where React throws that error rather than logging it, so a reappearance fails a test instead of scrolling past.

---

## 021 — The second review: a live count that was never live, and edits that rewrote history

**Status:** accepted

**Context.** The second review ran every suite green again — 469 unit, 62 database, 12 e2e, a clean production build — and again found the defects in the running product. Two were serious enough to fix before anything else: the live response count had never once updated, and removing a choice from a published survey silently changed what its results said. Both had been shipped, reviewed and tested without anyone noticing, for the same underlying reason: nothing in the suite had ever opened the owner's app as the owner.

**Decisions.**

- **The realtime channel is authorised before it joins, not after.** `RealtimeChannel.subscribe()` reads `socket.accessTokenValue` *synchronously* and puts it in the join frame. `createBrowserClient` resolves its session from cookies asynchronously, so a channel opened in a mount effect always won that race and joined as `anon` — which holds `INSERT` on `responses` and nothing else, so Realtime could not even resolve the filter column and answered `"invalid column for filter survey_id"`. `await db.realtime.setAuth()` first is the fix, with no argument: supabase-js installs an `accessToken` callback on the realtime client, and passing a token explicitly would switch it to manual mode and stop it refreshing on heartbeat.

  The hook's third promise — *it never breaks the page* — was the reason this lasted. A subscription that never opens is indistinguishable from a survey nobody is answering. It still may not disturb the page, so a failed `subscribe()` now warns in development, where a developer sees it and a respondent cannot.

- **The owner app has end-to-end coverage, and it starts here.** `e2e/global-setup.ts` signs the seeded owner in once through the real magic link — Mailpit, PKCE verifier, callback route and all — and saves the session for every owner spec through `storageState`. Per-spec sign-in would be slow, and Supabase rate limits magic links per address. `e2e/results-live.spec.ts` is the first spec to use it, and it waits for Realtime's own *"Subscribed to PostgreSQL"* frame before inserting: a fixed delay races a cold compile, and the announcement is precisely the thing the broken version never received. Verified the honest way — with `setAuth` commented out, the spec fails.

- **A summary reports the answers it cannot draw.** An option, a matrix row or column, or the top of a scale can be taken out of a question that has already been answered. `toCsvCells` has always kept those answers, falling back to the stored value; every chart dropped them; the card went on counting them in "30 vastust". Three readings of the same data, none of which said so. `SummaryBase.unshownCount` is the fourth number that reconciles the other three, and it is a required argument to `summaryBase` so that a tenth question type has to decide what "a choice this question no longer offers" means for it. It counts *answers*, not choices — one respondent naming two removed options is one unshown answer — because that is the sentence the card renders.

  Turning `allowOther` off counts too: the written answers that used it are as orphaned as a deleted option's. The scale's mean and median deliberately still include scores above a lowered `max`: they are real answers on the same axis, and the card now says how many of them the distribution cannot show rather than quietly dropping them from both.

- **Removing a choice asks first — but only once answers exist.** This list is edited most while a draft is being written, where a dialog would be noise guarding nothing. On a survey that has collected responses it is destructive, silent and permanent, so it goes through an `AlertDialog` naming the choice, the same treatment DESIGN §5 gives deleting a survey and DECISIONS 020 gave deleting an element. The element-delete dialog now names the response count too, which `Surveys.delete.bodyWithResponses` had been doing for whole surveys since Phase 4.

- **`CollectedAnswersProvider` carries the count, rather than nine editors' props.** The place that most needs to know — `OptionListEditor` — is four editors below the panel, and threading it there would put the field on all nine editor prop types whether or not they have a list to guard. A context also means a tenth choice editor inherits the guard instead of having to remember to ask for it. The number is the server render's and does not follow submissions arriving mid-edit: it decides whether an edit needs a warning, and "none when the page loaded" is the only case where it does not.

**Consequence.** `pnpm test:e2e` now needs Mailpit as well as the database, which `supabase start` already provides. `e2e/.auth/` holds a real session and is git-ignored. The live count spec runs on chromium only: both projects share one seeded survey, and two workers inserting at once could take the figure from 30 to 32 without ever showing 31.

**Still open from the review.** The owner app's 404, publishing from the builder, and the empty published survey — all three are 022.

---

## 022 — The second review, part two: a 404 in the wrong language, a path that ran off the end, and a link with nothing behind it

**Status:** accepted

**Context.** The three remaining serious findings from the second review. None of them is a bug in a computation; each is a state the product can genuinely reach that nothing had ever been written for.

**Decisions.**

- **`app/(app)/not-found.tsx` exists, and `global-not-found.tsx` could not have covered it.** `notFound()` resolves to the *nearest* `not-found.tsx`; there was none between `app/(app)/**` and Next.js's built-in page, so a bookmark to a deleted survey answered a signed-in Estonian owner with "404 · This page could not be found" in English, inside a fully localized shell. `globalNotFound` serves whole documents for requests matching no route at all — `/surveys/[surveyId]` matches perfectly well, and the survey behind the id is what is missing. The new page keeps the sidebar, because DESIGN §6 wants the chrome to stay for a partial failure and because the way out is the list the sidebar already points at. The heading lives in the app bar and the card carries only the explanation and the way back, rather than saying the same sentence twice.

  Its HTTP status is still 200, as it was before: the `(app)` layout awaits a session and begins streaming before the page throws, and a status cannot be set once the response has started. That matters to monitoring, not to a person, and not at all to search engines — this is behind a session.

- **Publishing and the link live in the builder as well as the row menu.** Creating a survey opens the builder (020), so the path the product promises — write it, then send it — ran off the end of the builder and back into a list to hunt for a `…` menu. `PublishControl` changes shape with the survey rather than staying put and greying out: the publish button for a draft or a closed survey, the link for a published one. The row menu keeps the disabled-with-a-reason form, because a menu has room to explain itself and a 44px bar does not; here the empty canvas already says the first question comes next.

- **Publish is unavailable while the document is unsaved, and that is not a detail.** Publishing acts on the document *the server* holds. Offering it while the screen is ahead of the server publishes the wrong thing — and in the first draft of this control it did something worse: adding a question and immediately pressing Avalda refused with "a survey with no questions cannot be published", about a survey the owner was looking at a question in, because the 700ms autosave debounce had not fired. The button now follows `BuilderSaveStatus`, and the `SaveIndicator` in the same bar is already saying which of "salvestamata", "salvestan…" or "paranda vead" applies.

- **A published survey with nothing to answer says so, on all three surfaces.** `publishSurveyAction` has always refused an empty survey; what nothing covered is that the questions can leave *afterwards*. Deleting the last one from a live survey left the link serving a blank page with a working submit button, which filed empty responses and counted them. The runner now renders `RunnerNotice kind="empty"` instead of a form; `submitResponseAction` refuses the same case with `closed`, since a Server Action is reachable without the page and a stale tab is the realistic way in; the results tab says there is nothing to summarise instead of rendering a blank strip under a card claiming a response count; and the builder's bar replaces the copy-link control with "küsimusteta — link ei kogu vastuseid", because copying a link that collects nothing is the wrong offer.

  Deliberately *not* done: refusing the save that empties a published survey. It would trap an author who deletes one question intending to add another, and it would not cover a survey emptied any other way. Telling the truth on every surface covers all of them.

  Also deliberately not done: refusing to publish a question still called "Uus küsimus" with options "Valik 1" and "Valik 2". An empty title is already impossible — `QuestionSchema` requires one — and any check beyond that is a guess about the author's intent, which is not the app's to make.

**Consequence.** `e2e/owner-surfaces.spec.ts` covers all three, and builds the emptied-survey fixture through the service key rather than clicking it into existence: publishing refuses an empty survey, so the only route to that state is removing the last question afterwards, and what is under test is the state rather than the route. It deletes what it creates, the same contract `runner.spec.ts` and `results-live.spec.ts` keep with the seed.

---

## 023 — The second review, part three: a preview that told the truth, a bar that fitted, and work the runner stopped throwing away

**Status:** accepted

**Context.** The remaining findings from the second review. Individually small; together they are the difference between a product that is right and one that is nearly right in eleven places.

**Decisions.**

- **The builder canvas is the runner's numbering, the runner's markers and the runner's words.** It called itself "how the respondent sees it" and then numbered statement blocks, which the runner does not — so a survey opening with one had every question here one ahead of the link, which is worse than useless to an author writing "answer question 3 first" into their intro. It also drew `KOHUSTUSLIK` in mono caps where the runner shows a red `*` and the word only to a screen reader, said nothing at all where the runner says "Valikuline", and put "Vali üks 4 valikust" in a dropdown the respondent meets as "Vali…". All four now come from the runner, and the pairs are in `SHARED_RESPONDENT_COPY` (020) so they cannot drift apart again.

  The matrix still differs — a grid here, stacked there — and stays that way, because the grid is the shape the author is editing (016). What changed instead is the promise: the empty canvas now says the author will see *what the respondent reads*, which is true, rather than *how the respondent sees it*, which the matrix makes false.

- **What gives way in the app bar is the title, and on a phone the meta goes first.** `AppBarFrame`'s actions are `shrink-0` and its title truncates: the actions are the bar's reason to exist and are already as narrow as they go, and without this the builder's four controls pushed the last one past the right edge and took the whole document into horizontal scroll — the thing DESIGN forbids and the runner is tested for at 320px. The meta is `hidden sm:*` unless a caller asks otherwise, which only the builder does: a survey count the page repeats below it is not worth a truncated title, and a save indicator carrying the retry for an edit that has not landed is.

- **`ShareLink` drops its field and keeps its button below `sm`.** It is a 26ch box that cannot shrink, and inside a survey row it held the first column open wide enough to push the response count off a phone — the one figure 020 arranged that layout around. Reading the slug matters less than sending it. In the builder's bar the whole control goes below `sm` instead: the bar already carries four things there, and the survey list a tap away keeps its copy button at every width.

- **`whitespace-nowrap` on a table cell overrides every `min-w-0` inside it.** shadcn's `TableCell` sets it, so the survey list's first column reported its entire contents as its minimum and claimed 273px of a 358px row however many `truncate`s were nested in there. The first column opts out; everything in it truncates on its own account.

- **A respondent who comes back to a link they have answered is told so, and can answer anyway.** The flag was already being written — `lib/runner/analytics.ts` keeps one so an abandon beacon cannot follow a submit — but nothing read it, so a habitual refresh returned a blank form and a second response with it. It is deliberately *not* that flag that gates this: the analytics one is optimistic, set when a submit is attempted, and rendering "thank you" off it would greet a respondent whose submission failed with a page that says their answers are saved. `lib/runner/visit.ts` writes its own on success alone, and the screen is skipped once this page load has tried to submit, so a failure shows the error and the answers rather than a thank-you. The way through — "Vasta uuesti" — is there because a shared phone in a lobby is exactly where this link gets opened twice on purpose.

- **A survey closing mid-answer no longer wipes the screen.** It used to replace the page with a notice, discarding everything the respondent had typed at the one moment they might want to keep it, and leaving `RunnerErrors.closed` and `RunnerErrors.notFound` in three catalogues with nothing able to render them. The form stays, the inline alert says what happened, and the action goes quiet — retrying cannot work, and a button that offers it would be lying.

- **An empty draft is no draft.** Writing one meant every survey a respondent so much as opened left a record behind, which on a shared computer is a list of what its user has been asked. `writeDraft` removes the key instead, which also cleans up after the last answer is cleared. `pruneOtherDraftVersions` removes the keys the version in the storage key (Phase 6) otherwise accumulates one of per republish.

- **Small ones, for the record.** Stat-card hints wrap instead of truncating — two cards to a row on a phone meant every explanation of what a figure *means* ended in an ellipsis. The funnel's steepest-drop advice has a second body for a stage that is not a question: telling an owner whose worst drop is "Vastamist alustatud" to check whether the question is too long is advice about a question that does not exist, and `stage.questionId` already distinguished the two for the button underneath. Russian writes `71,4 %` in the funnel's share, as `Intl` already had it doing on the completion card.

**Not done, deliberately.** The responses table still holds to `PAGE_WIDTH` on a wide monitor and scrolls inside its own container. That is what DESIGN asks of wide content, and 020 exempted the builder because it is a three-panel workspace, not because tables are cramped. The runner progress bar's `aria-valuemax="0"` needed no fix: 022 stopped a survey with no questions rendering a form at all.

**Consequence.** `e2e/runner-recovery.spec.ts` covers the two runner paths. Both it and `results-live.spec.ts` now build a survey of their own through the service key rather than working on the seed: the two Playwright projects run in parallel over one fixture, and the moment two specs both *changed* it — one closing it, one counting its responses exactly — the suite started failing intermittently in ways neither spec was wrong about. `createFixtureSurvey` in `e2e/support.ts` is that pattern, with the project name in the slug so the two runs cannot collide.

## 024 — A question key belongs to one question, for the life of the survey

**Status:** accepted

**Context.** Testing what happens when two surveys, or two questions, are given the same name turned up one bug that wedged the builder and three smaller things around it. Slugs came through clean — `proposeSlug` offers the bare title, the `slug unique` index arbitrates, and a random six-character suffix settles the second claimant (003) — so everything here is about `key`.

The wedge: `sync_survey_questions()` inserted the arriving projection rows *before* it removed the departed ones. Any single write to `elements` in which a key moved from one `question_id` to another therefore tripped `survey_questions_live_key_idx` against a row the same trigger was about to delete. The builder reaches that in one gesture — delete a question and add another inside the 700ms autosave debounce, where both carry the default title and so both derive `uus_kusimus`. The save failed; the document was unchanged, so every retry re-sent it and failed identically; the owner's edit was unrecoverable short of hand-editing a key.

**Decisions.**

- **The trigger departs before it arrives.** The `delete` and the tombstone `update` now run above the `insert`. A key freed by an element leaving is free within the same write, which is the only thing the old order got wrong — the end state was always correct when the two halves arrived as separate saves.

- **Uniqueness is total, not just over live rows.** `survey_questions_survey_key_idx` replaces the partial index. Enforcing it only `where removed_at is null` meant a key freed by deleting an *answered* question could be handed to a new question on a later save, leaving one survey holding two questions on one key: a tombstone carrying the real answers and a live newcomer. Wave comparison joins on exactly that key (003), so this would have merged two different questions' answers into one column the first time the comparison shipped. A tombstone keeps its key for the life of the survey.

- **The builder is told which keys are spent, from both directions.** `listReservedQuestionKeys` reads the tombstoned ones at page load, and `useSurveyBuilder` adds every key whose element has left the document *this session* — the page's snapshot predates a delete the owner has only just made, and the tombstone that delete creates is the one the next question would collide with. `takenKeys` takes both, so `createElement`, `duplicateElement` and `nextKeyFor` all mint `linn_2` rather than proposing something the database will refuse. Retirement is keyed on the element leaving, never on its key changing, or backspacing a title under `derive` would mint a `_2` against the key the question started with.

  The two travel as one `SurveyKeys` value rather than as a policy prop and a reserved-keys prop, because every site that mints or edits a key needs both and a site assembling them separately can assemble only one.

- **The autosave gate parses the document, not each element.** It ran `SurveyElementSchema` per element, which no per-element schema can catch a *collision* with — so hand-typing a key a sibling already owned produced a correct `keyTaken` message on the field and a doomed save on top of it. `SurveyElementsSchema` is `SurveySchema`'s element rules lifted out so both sides run the same check; the builder now holds the save, as it already did for an emptied option label, and resumes when the document is whole.

- **The CSV disambiguates headers, having nothing else to go on.** Headers are the author's titles and two questions may share one; the file carries no keys, so a spreadsheet got two columns with one name. `withUniqueHeaders` qualifies *both* colliding headers with the column id — the same string a comparison joins on — and leaves a file whose titles are distinct exactly as it was. The on-screen responses table needs none of this: it is keyed on `QuestionId` and its columns sit in document order beside the questions.

**Consequence.** `lib/builder/keys.ts` is now the whole of the builder's key logic, `takenKeys` included; `new-element.ts` imports from it rather than the other way round. Migration `20260908120000` refuses to apply if a survey already holds two questions on one key: there is no safe automatic answer, because renaming either row rewrites a CSV column header and a comparison join someone may already be reading.
