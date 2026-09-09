# Build plan

A survey builder + collector + analyser for the Estonian market. Competitive targets: connect.ee (strong charting, dead UI, 10 question types) and surveer.com (good builder and skip logic, hard response caps, no ranking or image-choice questions).

**MVP definition:** a logged-in user can build a survey, publish it, send the link to a stranger, that stranger can answer it on a phone, and the user can see aggregated charts and download a CSV. Running in dev mode against local Supabase. Nothing else counts as must-have.

---

## Phase 0 — Scaffold and the feedback loop

**Goal:** a repo where `pnpm check` runs and fails loudly.

Set up Next.js (App Router, TS, Tailwind), shadcn/ui, Vitest, Playwright, ESLint + Prettier, local Supabase via CLI. Wire `pnpm check` to run `tsc --noEmit && eslint . && vitest run`. Strict tsconfig including `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.

Drop in the audited design tokens as CSS variables in `globals.css` and map them in the Tailwind theme. Add `CLAUDE.md`, `docs/DECISIONS.md`, `docs/DESIGN.md` and this file.

> **Prompt:** Scaffold the project per Phase 0 of docs/PLAN.md, into the current directory, which already contains CLAUDE.md and docs/ — don't overwrite them. Set up the strict tsconfig, the `pnpm check` script, local Supabase, and shadcn.
>
> For styling: use @docs/design-tokens.css as the source for globals.css — the `:root` block, the `.dark` block and the `@theme inline` block go in exactly as written. Do not regenerate, round or substitute any value; they have been contrast-audited. Load IBM Plex Sans and IBM Plex Mono via `next/font`, not a CSS `@import`.
>
> @docs/DESIGN.md is the visual spec for this and every later phase. Don't invent spacing, type sizes or colours that aren't in it. If it doesn't cover something you need, ask rather than improvising.
>
> Add one trivial passing test so I can see the loop work. Do not create any application code, routes, or tables.

**Done when:** `pnpm check` is green, `pnpm dev` renders a blank themed page in both light and dark, and `supabase start` works.

**After this phase:** `app/globals.css` is canonical for tokens. Replace `docs/design-tokens.css` with a one-line pointer to it so the two can't drift.

---

## Phase 1 — The domain package (do this properly; it's the whole project)

**Goal:** the question union and everything derived from it, with zero dependencies.

This phase has no UI and no database. Review it yourself, carefully. Everything downstream inherits its mistakes.

MVP question types — eight, chosen to cover both competitors' common ground:

| Type | Notes |
|---|---|
| `single_choice` | radio; optional "other" text |
| `multi_choice` | checkboxes; optional min/max selections |
| `dropdown` | single answer, long option lists |
| `short_text` | one line, optional max length |
| `long_text` | textarea |
| `opinion_scale` | 1..N with labelled endpoints, N ≤ 15 |
| `nps` | 0–10, fixed |
| `matrix_single` | rows × columns, one answer per row |

Plus a non-question `statement` block (connect.ee's "väite tekst") — content shown but not answered. Model it in the same union with an `isAnswerable` discriminator so the runner and the aggregator both handle it explicitly.

Deliverables in `domain/`:

- `ids.ts` — branded `SurveyId`, `QuestionId`, `ResponseId` + constructors.
- `question.ts` — `QuestionSchema` as `z.discriminatedUnion("type", [...])`. Each member has `id`, `key`, `type`, `title`, `description?`, `required`, plus its own config.
  - **`id` vs `key`.** `id` is a branded UUID, unique within a survey, regenerated on duplication. `key` is a slug (`nps_overall`, `q_satisfaction`), unique within a survey, and **preserved across duplication**. Wave-over-wave comparison groups on `key`, so rewording a question doesn't sever its trend line. Auto-derive the key from the title on creation, let the owner override it, and warn loudly before allowing a rename on a published survey.
- `answer.ts` — `buildAnswerSchema(question): ZodType`. This is the load-bearing function. Given a question, return the Zod schema its answer must satisfy, honouring `required`, min/max selections, scale bounds, matrix row coverage. Used identically on client and server.
- `survey.ts` — `SurveySchema` (title, description, status: `draft | published | closed`, slug, locale, `waveGroupId`, `waveLabel?`, ordered elements). Duplicating a survey inherits the source's `waveGroupId`; a survey created from scratch gets a fresh one. `waveLabel` is free text ("2025", "Q1"), used as the axis label in comparisons.
- `duplicate.ts` — `duplicateSurvey(survey, opts): Survey`. New survey id, new question ids, **same question keys**, same `waveGroupId`. Test this explicitly; getting it wrong is silent and only shows up a year later.
- `aggregate.ts` — `aggregate(question, answers[]): QuestionSummary`, a discriminated union of result shapes: `CategoricalSummary` (counts + percentages), `NumericSummary` (mean, median, distribution), `TextSummary` (list of responses), `MatrixSummary` (row × column counts). NPS gets promoters/passives/detractors and the score.
- `export.ts` — `toCsvColumns(question)` and `toCsvCells(question, answer)`. Multi-choice fans out to one column per option; matrix to one per row.
- `assert-never.ts`.

> **Prompt:** Implement Phase 1 of docs/PLAN.md — the whole of domain/, with no dependencies beyond zod. Write the vitest tests first, then the implementation. Cover: every question type round-trips through buildAnswerSchema for both a valid and an invalid answer; required vs optional; a multi_choice with min 2 max 3; an opinion_scale rejecting out-of-range values; matrix_single rejecting a partial row set; aggregate() over a hand-built fixture of 20 responses; CSV column fan-out for multi_choice and matrix; and duplicateSurvey producing fresh ids but identical keys and an unchanged waveGroupId. Then prove the exhaustiveness works: temporarily add a ninth question type to the union, run tsc, and show me the list of errors before removing it.

**Done when:** tests pass, and that exhaustiveness demonstration produced errors in every file that switches on type.

---

## Phase 2 — Database and RLS

Tables: `profiles`, `surveys`, `survey_versions`, `survey_questions` (derived), `responses`, `answers`, `survey_events`.

**Storage decision — settled, see docs/DECISIONS.md.** The survey definition is a validated JSONB `elements` column on `surveys`, parsed through `SurveySchema` on read. Responses go relational: one `responses` row per submission, one `answers` row per question answered, with a JSONB `value`. Aggregation is ordinary SQL over `answers`.

`surveys` also carries `wave_group_id uuid not null` and `wave_label text`, both indexed.

**`survey_questions` is a derived projection, built now rather than later.** A trigger on `surveys` rebuilds this table whenever `elements` changes. Application code never writes to it.

```sql
create table survey_questions (
                                question_id uuid primary key,
                                survey_id   uuid not null references surveys(id) on delete cascade,
                                key         text not null,
                                type        text not null,
                                title       text not null,
                                position    int  not null
);
create index on survey_questions (survey_id);
create index on survey_questions (key);
```

It buys three things at once: an FK target for `answers.question_id` (the main integrity cost of the JSONB choice), fast wave comparison via `join survey_questions using (key)` across a `wave_group_id`, and the exact table a question bank would need if that ever ships.

**`survey_events` — interaction analytics.** Append-only, one row per respondent interaction, written from the public runner:

```sql
create table survey_events (
                             id          bigint generated always as identity primary key,
                             survey_id   uuid not null references surveys(id) on delete cascade,
                             session_id  uuid not null,            -- anonymous, per-visit, not a user id
                             question_id uuid,                     -- null for survey-level events
                             type        text not null,            -- view | start | question_view | question_answer | submit | abandon
                             at          timestamptz not null default now(),
                             meta        jsonb                     -- device, referrer/collector, dwell ms
);
create index on survey_events (survey_id, at);
```

That's what powers drop-off funnels, time-per-question, and abandonment rate. Keep it separate from `answers`: it's high-volume, disposable, and must never be joinable back to an individual's answers — `session_id` is not stored on `responses`.

RLS: owners read/write their own surveys. Anonymous users may `INSERT` into `responses`, `answers` and `survey_events` only when the parent survey is `published`, and may `SELECT` nothing from them. Nobody but the owner reads responses. Write the anonymous-insert policies carefully — that's the one place where getting RLS wrong leaks other people's data.

> **Prompt:** Phase 2 of docs/PLAN.md. Write the Supabase migrations including RLS on every table, the trigger that maintains survey_questions from the elements JSONB, a seed script creating one user and two waves of the same survey (same wave_group_id, same question keys, 30 fake responses each with differing distributions), and the repository layer in lib/db/ that parses everything through the Phase 1 schemas on read. Then write tests asserting: (a) a second user cannot read the first user's responses, (b) an anonymous client can insert a response to a published survey but not to a draft one, and (c) editing a survey's elements updates survey_questions correctly, including deletions.

**Done when:** all three tests pass and `pnpm db:reset` gives you two comparable waves to look at.

---

## Phase 3 — Auth, shell, i18n

Supabase magic-link auth, `proxy.ts`-protected `(app)` routes, next-intl with `et` / `en` / `ru`. App shell from the Claude Design mockups: sidebar, survey list page, empty states.

**Locale is resolved per surface — settled, see docs/DECISIONS.md 011.** There is no locale segment. The owner app reads a `NEXT_LOCALE` cookie written by the sidebar switcher, because language there is a property of the person, not of the URL: a results link forwarded to a colleague should render in their language. The runner takes its locale from `survey.locale`, passed explicitly, because language there is a property of the survey — and because reading a cookie would make every respondent request dynamic. Catalogues are split by surface from the start: `messages/app/{et,en,ru}.json` and `messages/runner/{et,en,ru}.json`, so the runner never ships builder copy to a phone. `<html lang>` therefore differs by surface, which means several root layouts and no `app/layout.tsx`.

> **Prompt:** Phase 3 of docs/PLAN.md — magic link auth, route protection, next-intl with et/en/ru, and the app shell matching the design tokens. Every string goes in the message files. No survey functionality yet beyond an empty list page.

---

## Phase 4 — Survey CRUD

List, create, rename, duplicate, delete, publish/close. Publishing generates the slug and flips status. This is a small phase — do it in one session and use it to check that the repository layer and Server Action wrapper feel right before the big phases.

---

## Phase 5 — The builder

The hardest UI. Left panel = element list with dnd-kit reordering; centre = live preview; right = the editor for the selected element, rendered by a switch over `question.type`. Autosave debounced through TanStack Query with optimistic updates.

Build it as: element list first, then add/delete/reorder, then the editor panel one question type at a time. Resist doing all eight types in one prompt.

> **Prompt:** Phase 5 of docs/PLAN.md, step 1 only: the three-panel builder layout, the element list with dnd-kit reordering, add and delete, and autosave. Wire the editor panel for single_choice only, with an explicit `assertNever` for the other types so the build tells us what's left. Stop there.

---

## Phase 6 — The public runner

`/(public)/k/[slug]` (`k` for *küsitlus*; see DECISIONS 011). Server-rendered, no auth, mobile-first — most respondents arrive from a WhatsApp or email link on a phone. One question per screen or all-on-one-page; pick one for MVP (all-on-one-page is less work and fine for short surveys). Validate with `buildAnswerSchema` client-side, re-validate server-side, save partial progress to localStorage so a refresh doesn't lose answers. Thank-you screen.

**Emit `survey_events` here**, not later. A per-visit `session_id` in sessionStorage, and events fired on view, start, question answer, submit, and on `visibilitychange`/`beforeunload` for abandon (via `navigator.sendBeacon`). Batch them; never let analytics writes block or fail a submission. Retrofitting instrumentation into a finished runner is fiddly and you lose the early data.

This is the phase to write the one Playwright test that matters: open the seeded survey, answer every question type, submit, assert the row lands in the database.

---

## Phase 7 — Results

Response count and completion rate. Per-question cards, each rendering the right chart for its `QuestionSummary` variant via — again — an exhaustive switch.

**Chart type switcher per question** — connect.ee's genuinely good idea, and the part of it worth keeping. But *which* encodings a question offers is derived from the question type by a pure function in `domain/` ending in `assertNever`, not a fixed menu: adding a question type must force a decision about how it is charted rather than silently inheriting every option. `docs/DESIGN.md` §7 governs what those encodings are and how they are coloured, and it is stricter than the competitor's menu:

| Question type | Encodings offered |
|---|---|
| `single_choice`, `multi_choice`, `dropdown` | horizontal bars (default); vertical bars only at ≤ 5 options with short labels |
| `opinion_scale`, `nps`, `matrix_single` | ramp bars (default); stacked ramp |
| `short_text`, `long_text` | none — the summary is a response list |

**There are no pie or doughnut charts, at any count** (DESIGN §7). An earlier draft of this phase listed them; they were copied from a competitor's feature list and predate the token audit. See DECISIONS 017, which also settles the general rule: DESIGN.md wins on presentation, PLAN.md wins on scope.

A line encoding is offered only where the data is a series — grouped by wave or over time. Nothing in MVP produces one, so nothing offers it yet; wave comparison is after-MVP item 2.

Individual responses table via TanStack Table. Real-time count via Supabase realtime subscription — cheap to add, and neither competitor has it.

Plus a **drop-off funnel** from `survey_events`: views → starts → per-question reach → submits, with median time per question. Since Phase 6 already emits the events, this is a couple of grouped queries and a bar chart. It's the first thing that makes the product feel more serious than either competitor, so don't defer it past MVP.

---

## Phase 8 — CSV export and MVP close-out

`toCsvColumns` / `toCsvCells` from Phase 1 wired to a download route. Then: empty states, loading skeletons, error boundaries, a pass over the et/ru translations, and mobile QA on the runner.

**MVP is done here.** Stop, use it yourself for something real, and let that tell you what's wrong before building anything below.

---

## After MVP

The original ordering of this section was a *value* ordering, and it assumed a running product. It isn't one: there is no hosted Supabase project, no deploy target and no CI, so Phase 8's own instruction — use it for something real and let that tell you what's wrong — cannot be followed. Phases 9 and 10 fix that, and the rest follows in the order DECISIONS 025 argues for.

---

## Phase 9 — Hardening the public endpoint

**Goal:** the runner's two write paths survive contact with the open internet.

This was item 11 of the old list, with the note "do this before any real launch, not after". This is that moment: it is the deploy's other half, not a chore that follows it.

The runner is anonymous-insert by design and nothing throttles it. `submitResponseAction` in `lib/runner/actions.ts` and the beacon handler in `app/api/events/route.ts` have no rate limit, no captcha, no honeypot and no server-side duplicate guard. `hasAnswered` in `lib/runner/visit.ts` is `localStorage` only — it exists to stop an accidental double-submit from one browser (023) and is bypassed by a cleared store, an incognito window or a second device. `get_runner_survey(slug)` protects against *enumeration* (009); once a slug is known — and a slug travels by WhatsApp — both write paths are open to anyone.

**The limiter lives in Postgres.** Not Redis, not in-memory: serverless has no shared memory between invocations, and the database is already the trust boundary every other anonymous write goes through. A `security definer` function in the shape 009 established, its own table, RLS and policy in the same migration as the table.

**Its key is a salted hash of the client IP, in a short-TTL table of its own.** A raw IP is personal data, and 004 was deliberate that analytics must never be joinable back to an individual's answers — a rate-limit table must not become the join that undoes it. The hash never goes on `responses`, and the salt rotates. The IP comes from `x-forwarded-for` through `headers()`, which is Promise-only in Next 16.

**A honeypot and a submission-timing floor come before a captcha.** Both are free and invisible, and they keep a third-party script off a mobile-first runner that DESIGN §10 calls the priority surface. Turnstile is the documented fallback for if real abuse actually appears — it is not in this phase.

> **Prompt:** Phase 9 of docs/PLAN.md. Add the Postgres rate limiter — migration, table, RLS policy and `security definer` function — keyed on a salted hash of the client IP with a rotating salt and a short TTL, and wire it into both `submitResponseAction` and `app/api/events/route.ts`. Add a honeypot field and a submission-timing floor to the runner form, checked server-side before answers are parsed. A blocked submit must fail the way every other runner error does, through `RunnerErrors`, in all three catalogues. Do not add a captcha or any third-party script.

**Done when:** a `.db.test.ts` proves the limiter rejects over-threshold writes and that a different survey and a different IP hash are unaffected, an e2e spec proves an ordinary respondent is never blocked, and `pnpm check` and `pnpm test:db` are green.

**Done.** `supabase/migrations/20260908130000_rate_limit.sql`, `lib/db/rate-limit.ts`, `lib/runner/honeypot.ts` and `lib/runner/throttle.ts`, with `e2e/runner-hardening.spec.ts` and `lib/db/rate-limit.db.test.ts`. DECISIONS 026 records what was decided along the way — chiefly that the tables carry RLS with *no* policy and no grant rather than a policy, since the only legitimate reader is the definer function; that the bucket and the survey go into the digest rather than staying as columns; and that the server-side duplicate guard named in the paragraph above was deliberately not built, because identifying a repeat respondent is the one thing the hashing exists to make impossible.

Two things this phase left for Phase 10: nothing schedules `prune_rate_limits()` — the sweep runs probabilistically from the calls themselves, which is enough while rows live an hour but is worth a cron once there is a hosted project to put one in — and the thresholds are a guess until real traffic argues with them.

---

## Phase 10 — Production deploy and CI

**Goal:** a stranger can answer a survey at a real domain, on their own phone, and the owner sees the response.

Nothing here is hard; it is simply undone. A hosted Supabase project with the migrations pushed, the app on Vercel, a real transactional email sender behind the magic link (Mailpit is local-only), `NEXT_PUBLIC_SITE_URL` and the `auth.site_url` / redirect allow-list pointing at the real origin, and a first `.github/workflows/` running `pnpm check` and `pnpm test:db`.

Some of this is not an agent's to do. Creating the Supabase and Vercel projects, buying the domain and its DNS, and issuing the email provider's API key are the owner's; writing the workflow, the deploy configuration, the environment documentation in `.env.example` and the README's deployment section are the agent's. The phase should say which is which rather than stalling in the middle.

> **Prompt:** Phase 10 of docs/PLAN.md. Write the CI workflow, the deployment configuration and the environment documentation, and list for me — as a numbered checklist I can work through by hand — every step that needs an account, a domain or a key that you cannot create. Do not put any secret in the repository.

**Done when:** the checklist is done, the workflow is green on `master`, and a survey answered from a phone on cellular data lands in the hosted database.

**The agent's half is done.** `.github/workflows/ci.yml` (two jobs: `pnpm check`, and `pnpm test:db` against a stack the CLI brings up), `vercel.json`, a rewritten `.env.example`, the README's deployment section, and `docs/DEPLOY.md` — the numbered checklist, thirty steps in eight sections. DECISIONS 027 records what was decided along the way, chiefly that `pnpm check` now runs `next typegen` first (without it the contract cannot pass on a fresh clone, which is every CI run), that migrations are pushed by hand rather than from CI, and that the deployed app holds no secret at all.

**The owner's half is `docs/DEPLOY.md`,** and nothing below is reachable until it is worked through: the Supabase and Vercel projects, the domain and its DNS, the email provider and its keys. Two items on it are decisions rather than chores — which region (it has to match `vercel.json`'s `arn1`), and whether email sign-ups stay open, since as deployed anyone who finds `/login` can create an account.

---

## Phase 11 — Wave comparison

**Goal:** pick a wave group, see each question's waves side by side.

This is the feature neither connect.ee nor Surveer offers, and the one that makes an annual customer stay for year two. It is also the cheapest thing on this list, because almost all of it was built during Phases 1–2 and has been earning nothing since:

- `domain/survey.ts` carries `waveGroupId` and `waveLabel`; `domain/duplicate.ts` already produces a new survey with fresh ids, **identical keys** and the same wave group, with tests that say so.
- `lib/db/surveys.ts` already has `listSurveysInWaveGroup` — summaries only, no responses.
- `survey_questions.key` is indexed for exactly this join, and 024 made key uniqueness total across tombstones *specifically* so the join can never merge two different questions' answers into one column.
- `domain/charts.ts` already defines `CHART_DATA_SHAPES` with a `series` member and a `line` kind, and `components/results/question-card.tsx` already has the `line` branches. They are unreachable today. This phase is what turns them on.
- `domain/aggregate.ts` has no survey concept in it at all: `aggregate(question, answers)` called once per wave gives you the summaries to place beside each other.

So the net new work is one repository function that fetches a wave group's responses aligned on `key`, and one screen. The entry point is the survey list, which already groups by wave group and deliberately offers no compare control (013).

Two things to decide rather than improvise: what a question present in one wave and absent from another renders as, and whether a tombstoned question (008) with answers in an earlier wave still appears. Both are the same question — a column that exists for some waves — and 021's `unshownCount` is the precedent for saying so on the card rather than dropping it silently.

> **Prompt:** Phase 11 of docs/PLAN.md. Start with the repository function and its `.db.test.ts` against the seed's two waves — the alignment on `key` is the load-bearing part and it should be proven before any UI exists. Then the screen. Do not change `aggregate()`; call it once per wave.

**Done when:** the seeded two waves render side by side with their wave labels as the series, a question missing from one wave says so rather than rendering an empty series, and `pnpm test:db` is green.

**Done.** `lib/db/waves.ts` reads a wave group in three queries however many waves it holds; `lib/results/wave-comparison.ts` aligns them on `key` and calls `aggregate()` once per wave; `lib/results/wave-chart-data.ts` shapes the series. The screen is `/waves/[waveGroupId]`, reached from the compare control DESIGN §5 always specified and 013 left out, and the `line` branches are reachable at last. DECISIONS 029 records the five decisions, chiefly what an absent wave renders as and why the wave costs the palette its five colours. Proved by `lib/db/waves.db.test.ts` against the seed's two waves and a constructed group whose questionnaire changed, and by `e2e/wave-comparison.spec.ts` end to end as the owner.

---

## Phase 12 — Multilingual survey content

**Goal:** an author writes one survey in Estonian, Russian and English; a respondent picks their language.

Table stakes in this market, and the reason all copy has been in message files since Phase 0. It comes before skip logic for one reason that applies to nothing else on this list: **its cost grows with every survey in production.** Every title, description, choice label, `otherLabel`, scale endpoint label and matrix row and column label on all nine element schemas becomes a locale-keyed shape, so the `elements` JSONB document changes shape and every existing document needs a fallback. That is cheap while there are a handful and expensive once real customers' surveys are in there.

The routing seam was left open for it deliberately: `lib/i18n/runner.ts` documents adding a `/k/[slug]/[locale]` segment "with no change below that function", and 011 says the same.

The blast radius is wide but entirely compiler-visible: the nine schemas, the nine builder editors, the runner inputs, the CSV headers in `domain/export.ts`, and `SummaryBase.title` — every place that reads a question's words.

The author has to specify the language they are using to build a survey. The user can only pick a language that is supported for the survey.

Three sessions, not one:

1. ~~The schema, the fallback migration and the domain tests. Nothing user-visible changes.~~ **Done** — DECISIONS 030.
2. ~~The builder's translation surface — how an author moves between the survey's languages without the editor panel doubling in size.~~ **Done** — DECISIONS 031. A survey now carries the set of languages it is *offered* in (`surveys.locales`), the builder edits one of them at a time and merges each edit back, and the language being translated from shows through as placeholder text. Respondents still see nothing.
3. ~~The respondent picker and the `/k/[slug]/[locale]` segment.~~ **Done** — DECISIONS 033. The language is a path segment and nothing else: `/k/<slug>` is still the share link and renders the survey's own language, the others are `/k/<slug>/<locale>`, and the picker is three links above the first question. `responses.locale` now records the language answered in.

**Done when:** ~~every existing survey still renders identically, the domain tests cover a question with a missing translation falling back to the survey's own locale, and a respondent following `/k/[slug]` to a survey offered in three languages can pick one.~~ **Met.**

**What this phase leaves behind.** A survey's own `title` and `description` are untranslated columns (030) and the runner shows both to the respondent, so a Russian reading of an Estonian survey has Estonian in the header and in the opening paragraph. The workaround is a `statement` element, which is part of the document and translates. Translating the two columns is a schema change with a migration behind it — a decision of its own, as 030 said it would be, and the obvious next thing this phase invites.

---

## Phase 13 — Skip logic / branching

**Goal:** an element can be shown conditionally on earlier answers.

Surveer has it and connect.ee doesn't, so it closes a gap rather than opening one — which is why it moved from the top of this list to the end of its scheduled phases. Pull it forward the moment a real prospect is choosing between us on a feature grid.

The runtime half is cheap and well isolated. The runner is one page: `components/runner/runner-screen.tsx` maps every element unconditionally, so visibility is a predicate applied in that one loop, and in `validateAll` and `answerProgress` in `lib/runner/validation.ts` so a hidden required question cannot block a submit. `buildAnswerSchema` does not change at all — conditional requiredness is a question about which questions are evaluated, one level above it.

`submitResponseAction` must re-derive visibility server-side from the *submitted* answers. A client-sent "this was hidden" flag is not evidence; a Server Action is a public POST endpoint.

The expensive half is authoring, which does not exist in any form — plus the cycle check the original list called out. Both belong to a new pure module, `domain/conditions.ts`.

One thing to settle before building: a hidden question and an abandoned one look identical in `survey_events`, so the Phase 7 funnel needs to know the difference or it will report drop-off that never happened.

> **Prompt:** Phase 13 of docs/PLAN.md, step 1 only: `domain/conditions.ts` — the condition schema, the evaluator, and the cycle check — tests first. No UI, no runner changes.

**Done when:** the evaluator is tested against a chain, a cycle and a condition referencing a deleted question, and nothing else has changed.

---

---

## Phase 14 — Plans and billing

**Goal:** a stranger signs up, hits the free tier's ceiling, and can pay their way past it.

Nothing in the codebase knows the product is meant to be sold. There is no plan on an account, no limit on anything, and no place to put one — so as deployed, every address that asks for a magic link gets an account that can build and collect without a ceiling. DECISIONS 028 settles the shape of the answer in advance, because the phases either side of this one would otherwise settle it by accident, one convenient afternoon at a time. Read it before starting: it argues for a free tier and paid tiers, two meters (surveys owned, responses per calendar month), a pure `domain/plan.ts` with no money in it, and — the part that is easy to get wrong — enforcement in *two* places for two different reasons.

The work, in the order it wants doing:

1. **The seam.** `domain/plan.ts` — the tiers as pure data, their limits, and a flag per gated capability, tests first. A plan column on `profiles` that the account itself cannot write. The limits mirrored into a table the RLS policy can read, with the `.db.test.ts` that fails when the mirror and the module disagree. A usage counter for the monthly meter, maintained by a trigger rather than counted on the respondent's hot path.
2. **The enforcement.** The survey ceiling in `createSurveyAction` and `duplicateSurveyAction`, where the owner can be told what they hit; the response allowance in the INSERT policy on `responses`, because that path is anonymous and reachable with nothing but the publishable key. `get_runner_survey` grows an "is this still collecting" flag so the runner says so before it renders a form rather than after twenty questions, and it is a distinct state from `closed` in all three catalogues.
3. **Stripe.** Checkout, the customer portal, and a webhook that writes the plan column as the service role. The webhook is a Route Handler in `app/api/`, not a Server Action, for the same reason the analytics beacon is one. Signature verification is not optional and the handler must be idempotent: Stripe retries.
4. **The surfaces.** A pricing page and an upgrade path in three languages, and the owner's own meter — the survey list already carries response counts and is where "84 of 100 this month" belongs. Until this exists an owner learns about their ceiling from an error message, which is tolerable for weeks and not for longer.

Two things to settle rather than improvise: what happens to a survey still collecting when a subscription lapses (the meter stops it and the responses already in are untouched — but the owner has to be *told*, and email is the only channel that reaches them), and whether a dunning grace period is a plan of its own or a date column beside the plan.

**Ordering.** This does not block Phases 11–13, and they do not block it — but each of those three is a paid hook, so whichever lands second wires its flag rather than inventing a second kind of gate. What *does* press on the timing is sign-ups: every account created before a ceiling exists is one that has been using the product without one, and imposing a limit afterwards is a conversation rather than a fact somebody agreed to. Either this phase follows the opening of sign-ups closely, or sign-ups stay closed until it lands (`docs/DEPLOY.md` step 22).

> **Prompt:** Phase 14 of docs/PLAN.md, step 1 only — the seam, no Stripe and no UI. Read DECISIONS 028 first; it is a decision made in advance, not a suggestion, and this step must not create a second source of truth for what a tier permits. Tests first for `domain/plan.ts`, then the migration, then the mirror test.

**Done when:** a free account is refused its fourth survey with a message that names the limit, a survey whose owner is out of allowance says so on the runner rather than on submit, `lib/db/plans.db.test.ts` proves the database refuses the submission even when the action is bypassed, and `pnpm check` and `pnpm test:db` are green.

## Backlog

Unscheduled, roughly in order of value:

1. **Remaining question types** — ranking and image choice first, since neither competitor's modern option has them; then slider, star rating, matrix_multi, number, date, email, phone, URL. **These come after Phase 12, not before:** every new type adds more labels that would otherwise have to be locale-keyed a second time. Each one is a compiler-guided checklist — around eleven `assertNever` switch sites plus a migration widening the `survey_questions.type` CHECK (008).
2. **Themes and branding** — logo, colours, custom thank-you page. Cheaper than it looks: DESIGN §8's `--survey-*` namespace already exists, so no runner component reads `--primary` directly.
3. ~~**Billing** — Stripe.~~ **Promoted to Phase 14**, and its shape is settled in DECISIONS 028. Still price against Surveer's caps: their PRO is €24/mo for 1,000 responses and unlimited responses needs €99/mo, which is the obvious place to undercut — matching their response allowance on the middle tier makes the comparison like-for-like.
4. **Multiple collector links** with per-channel source tracking.
5. **Templates library**, then AI survey generation from a prompt.
6. **PDF report export** and shareable public results links.
7. **Teams / organisations** — a real RLS redesign, not a bolt-on. Plan for it before you sell to a university.
8. Response quotas, geolocation capture, custom domains, webhooks, public API.

---

## Working rhythm with Claude Code

- Start each session in **plan mode**, have it read `docs/PLAN.md` and restate the phase before writing anything.
- One phase per branch, one commit per working increment, `pnpm check` green before merge.
- When it says a phase is done, ask it to run the exhaustiveness trick from Phase 1 again — add a fake question type, see what breaks. If nothing breaks in the new code, the new code isn't wired into the union properly.
- `docs/DECISIONS.md` is append-only. Whenever Claude Code deviates from this plan or makes a schema call that isn't written down, have it add an entry. Deviations are fine; silent ones aren't.