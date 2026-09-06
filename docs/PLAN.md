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
> @docs/DESIGN.md is the visual spec for this and every later phase. Don't invent spacing, type sizes or colours that aren't in it. Several of its sections are marked TODO — if you need something from one of those, ask rather than improvising.
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

Response count and completion rate. Per-question cards, each rendering the right chart for its `QuestionSummary` variant via — again — an exhaustive switch. Chart type switcher per question (bar / horizontal bar / pie / doughnut / line), because that's connect.ee's genuinely good idea. Individual responses table via TanStack Table. Real-time count via Supabase realtime subscription — cheap to add, and neither competitor has it.

Plus a **drop-off funnel** from `survey_events`: views → starts → per-question reach → submits, with median time per question. Since Phase 6 already emits the events, this is a couple of grouped queries and a bar chart. It's the first thing that makes the product feel more serious than either competitor, so don't defer it past MVP.

---

## Phase 8 — CSV export and MVP close-out

`toCsvColumns` / `toCsvCells` from Phase 1 wired to a download route. Then: empty states, loading skeletons, error boundaries, a pass over the et/ru translations, and mobile QA on the runner.

**MVP is done here.** Stop, use it yourself for something real, and let that tell you what's wrong before building anything below.

---

## After MVP

Roughly in order of value for this market:

1. **Skip logic / branching** — Surveer has it, connect.ee doesn't. Model as a `conditions` array on each element, evaluated by a pure function in `domain/`. Needs a cycle check.
2. **Wave comparison** — the year-over-year view. Pick a `wave_group_id`, join waves on question `key`, render each question's summaries side by side with the wave labels as the series. The schema work is already done in Phases 1–2; this is a query and a screen. Neither connect.ee nor Surveer offers it, and it's the feature that makes an annual customer stay for year two.
3. **Multilingual surveys** — not just a translated UI but translated *survey content* with a respondent language picker. In Estonia this is table stakes, and it's the reason to have kept all copy in message files from day one.
4. **Remaining question types** — ranking and image-choice first, since neither competitor's modern option has them; then slider, star rating, matrix_multi, number, date, email, phone, URL.
5. **Themes and branding** — logo, colours, custom thank-you page.
6. **Billing** — Stripe. Price against Surveer's caps: their PRO is €24/mo for 1,000 responses and unlimited responses needs €99/mo, which is the obvious place to undercut.
7. **Multiple collector links** with per-channel source tracking.
8. **Templates library**, then AI survey generation from a prompt.
9. **PDF report export** and shareable public results links.
10. **Teams / organisations** — a real RLS redesign, not a bolt-on. Plan for it before you sell to a university.
11. **Bot protection and rate limiting** on the public endpoint. Do this before any real launch, not after.
12. Response quotas, geolocation capture, custom domains, webhooks, public API.

---

## Working rhythm with Claude Code

- Start each session in **plan mode**, have it read `docs/PLAN.md` and restate the phase before writing anything.
- One phase per branch, one commit per working increment, `pnpm check` green before merge.
- When it says a phase is done, ask it to run the exhaustiveness trick from Phase 1 again — add a fake question type, see what breaks. If nothing breaks in the new code, the new code isn't wired into the union properly.
- `docs/DECISIONS.md` is append-only. Whenever Claude Code deviates from this plan or makes a schema call that isn't written down, have it add an entry. Deviations are fine; silent ones aren't.