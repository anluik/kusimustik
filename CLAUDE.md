@AGENTS.md

# CLAUDE.md

Survey SaaS. Next.js App Router + TypeScript + Supabase.

## Commands

```bash
pnpm dev            # dev server
pnpm check          # typegen + typecheck + lint + unit tests + format — MUST be
                    # green before you say you're done. Also what CI runs.
pnpm test           # vitest
pnpm test:db        # integration tests against local Supabase — RLS, triggers, repositories.
                    # Needs `supabase start`; not part of `pnpm check`. Run it after
                    # touching anything in supabase/ or lib/db/.
pnpm test:e2e       # playwright
pnpm format         # prettier --write .
pnpm db:types       # regenerate lib/db/database.types.ts from local Supabase
pnpm db:reset       # reset local DB and replay migrations + seed
```

`pnpm check` is the contract. Do not report a task complete without running it.

## Non-negotiables

- **Types come from Zod.** Every domain type is `z.infer<typeof XSchema>`. Never hand-write an interface that duplicates a schema.
- **No `any`, no `as` casts** except at the Supabase boundary, and there only inside `lib/db/`. Parse with Zod on the way out of the DB.
- **No enums.** Use `as const` objects + `satisfies`.
- **Exhaustive switches.** Every `switch` on `question.type` ends with `default: assertNever(question)`. Never add a fallback branch to make a build pass — handle the case.
- **`domain/` imports nothing.** No React, no Supabase, no Next. It is pure functions and schemas. If you need to reach for a dependency there, stop and ask.
- **Server-side validation is not optional.** Every mutation re-derives its Zod schema server-side and re-parses. Client validation is a UX nicety only.
- **`id` and `key` are not interchangeable.** `id` identifies a question within one survey and changes on duplication. `key` is stable across duplication and is what wave comparison joins on. Never key analytics, comparison or export column identity on `id`.
- **A survey's words are locale-keyed; its identifiers are not.** `surveys.elements` holds the *authored* document — every title, description, label and placeholder is a `LocalizedText` map — and `AuthoredSurveySchema` is what the repository parses. One language of it is a *resolved* survey (`SurveySchema`, plain strings), which is what the runner, the aggregator and the exporter read. `domain/localize.ts` is the only thing that maps between them; never reach into a `LocalizedText` yourself. Keys, ids, option values and slugs are never translated. See docs/DECISIONS.md 030.

  `surveys.locale` is the language a survey is *written* in and everything's fallback; `surveys.locales` is the set it is *offered* in, always containing `locale` and normalised by `surveys_before_write()`. The builder holds the authored document and edits one language of it: `projectElement` for what the panel binds to, `mergeElement` for what comes back. Never author over a stored document — that replaces every other translation. See docs/DECISIONS.md 031.

- **`survey_questions` is derived.** A trigger rebuilds it from `surveys.elements`. Application code never writes to it and never reads a definition from it — definitions come from `surveys.elements` through `SurveySchema`. A question that leaves the document keeps a tombstoned row (`removed_at`) if it has answers; readers filter it out.
- **Locale is resolved per surface, and there is no locale segment.** The owner app reads the `NEXT_LOCALE` cookie through `lib/i18n/request.ts`; the runner is rendered in `survey.locale`, passed explicitly to `getRunnerTranslations()` and `NextIntlClientProvider`. Never read the locale cookie from `app/(public)/` — it would make every respondent request dynamic. See docs/DECISIONS.md 011.
- **Analytics never blocks.** `survey_events` writes are best-effort and batched. A failed event write must never surface to a respondent or abort a submission.
- **No hardcoded user-facing strings.** All copy goes through next-intl message files. Two catalogues, split by surface (docs/DECISIONS.md 011): `messages/app/{et,en,ru}.json` for the owner app, `messages/runner/{et,en,ru}.json` for the respondent runner. Top-level namespaces never collide between them. Estonian is the source of truth — add the key to `et.json` first, then all three; if you cannot write the et or ru wording, use the English text as the placeholder and flag it in your summary.

## Layout

No `src/`. `app/` is the router directory and holds routes and nothing else;
everything else sits beside it at the repo root. `@/*` resolves from the repo
root, so `domain/` is `@/domain` and `lib/db/` is `@/lib/db`.

```
app/                 App Router — routes only. NO app/layout.tsx: each group
                     below is its own root layout, because <html lang> differs
                     by surface (docs/DECISIONS.md 011)
  (app)/             authed dashboard — builder, results, wave comparison
  (auth)/            signed-out surfaces — /login
  (public)/          respondent runner at /k/[slug], no auth
  auth/callback/     magic-link landing (route handler)
  api/               route handlers (analytics beacons, CSV download)
  global-not-found.tsx  the 404; needed because there are several root layouts
  globals.css        canonical design tokens — see docs/DESIGN.md §1
domain/              pure schemas + logic (question union, answer validation, aggregation).
                     content.ts is LocalizedText and its fallback; localize.ts maps
                     between the stored document and one language of it
lib/db/              supabase clients, generated types, repository fns
lib/supabase/        request-scoped clients (server, proxy)
lib/auth/            session helpers + sign-in/sign-out actions
lib/actions/         the Server Action result envelope + wrapper
lib/i18n/            next-intl setup, locale cookie, runner translator
lib/runner/          the respondent's server side — the submit action and its error
                     codes, draft storage, analytics batching, and the Phase 9
                     honeypot and rate-limit throttle
lib/surveys/         survey actions, error codes, and the pure list shaping
lib/builder/         the builder's pure parts — document reducer, element factory,
                     key policy, optional-field patches
components/ui/       shadcn — do not hand-edit, re-run the CLI (one documented
                     exception: docs/DECISIONS.md 012)
components/shell/    app shell — sidebar, app bar, empty state, providers
components/surveys/  the survey list, its row actions and its dialogs
components/builder/  the three-panel builder — element list, canvas, editor panel;
                     translation.tsx is the language the panel edits and the
                     reference text behind its placeholders
components/          app components
hooks/               use-survey-builder.ts is the builder's document, its autosave
                     and the seam between the stored document and one language of it;
                     use-mobile.ts is shadcn-generated (lint/format-ignored)
e2e/                 playwright specs
messages/app/        et.json, en.json, ru.json — owner app
messages/runner/     et.json, en.json, ru.json — respondent runner
supabase/migrations/
supabase/seed.sql    one owner, two waves, 30 responses each — `pnpm db:reset`
docs/PLAN.md         the phased build plan — read the current phase before starting
docs/DECISIONS.md    settled architecture decisions — read before proposing a schema change
docs/DESIGN.md       the visual spec — read before writing any UI
docs/DEPLOY.md       the one-time production setup, as a checklist for a human
.github/workflows/   CI: `pnpm check` and `pnpm test:db` on every PR and push
```

## Conventions

- Server Components by default. `"use client"` only for interactivity, pushed as far down the tree as possible.
- Mutations are Server Actions, wrapped so they return `{ ok: true, data } | { ok: false, error }` rather than throwing to the client. **The wrapper's `catch` must start with `unstable_rethrow(err)`** from `next/navigation` — `redirect()`, `permanentRedirect()` and `notFound()` all work by throwing, and a catch-all wrapper swallows them silently.
- A Server Action is a public POST endpoint, reachable without going through your UI. Every action re-checks auth and ownership itself; never rely on the calling page having checked.
- TanStack Query for client cache only. Query keys come from the factory in `lib/query-keys.ts` — never inline an array literal. Neither exists yet: the builder's autosave is a debounced mutation over local state with no cache to reconcile, so it does not use them (docs/DECISIONS.md 014).
- Forms: react-hook-form + `zodResolver`, schema imported from `domain/`.
- Charts: Recharts via the shadcn `chart` component. Theme colours only, no hex literals.
- IDs are branded types (`SurveyId`, `QuestionId`, `ResponseId`). Construct via the helpers in `domain/ids.ts`.
- Every new table gets RLS enabled in the same migration that creates it. A migration that adds a table without a policy is incomplete.
- Repository functions in `lib/db/` take the Supabase client as their first argument and never build one — the caller decides which identity, and therefore which policies, the query runs under. They parse every row through a Zod schema on the way out and throw `DbError` subclasses on failure.
- Adding a question type means a migration too: `survey_questions.type` mirrors `ELEMENT_TYPES` as a CHECK constraint. See docs/DECISIONS.md 008.

## Next.js 16

Read `AGENTS.md`. These are the version differences that have already caught us out — the rest is in `node_modules/next/dist/docs/`.

- **There is no `middleware.ts`.** It is `proxy.ts` at the repo root, exporting `proxy()`. Node runtime only, not configurable. next-intl's own docs still say middleware — ignore them on that point, and note we run next-intl without its middleware anyway (DECISIONS 011). `proxy.ts` refreshes the Supabase session and protects routes *deny by default* — see `PUBLIC_PREFIXES` in `lib/routes.ts` — but it is an optimistic filter, not authorisation: pages still call `requireSessionUser()` and actions still re-check.
- **`revalidateTag` takes two arguments** (`revalidateTag(tag, 'max')`); the one-arg form is a type error. For owner-facing mutations you almost always want `updateTag(tag)` instead — it gives read-your-writes, so the owner sees their edit immediately rather than a stale render. `refresh()` refreshes the client router from an action.
- **Server Actions dispatch one at a time per client.** `Promise.all` over actions serialises them. Batch into a single action instead. This constrains builder autosave.
- **Analytics beacons go to a Route Handler in `app/api/`**, not a Server Action — `sendBeacon` needs a plain endpoint, and actions queue behind each other.
- **`params`, `searchParams`, `cookies()`, `headers()` and `draftMode()` are Promise-only.** Sync access was removed in 16. Type pages with the generated `PageProps<'/k/[slug]'>` / `LayoutProps` / `RouteContext` helpers. They only exist once something has written `.next/types`, so a bare `tsc --noEmit` on a clean tree reports `Cannot find name 'PageProps'`. `pnpm check` runs `next typegen` first for exactly this reason — half a second, and it is what lets a fresh clone and CI run the contract at all.
- `next lint` no longer exists and `next build` does not lint — which is exactly why `pnpm check` runs `eslint` itself.
- Turbopack is the default for `dev` and `build`. No `--turbopack` flag.
- `cacheComponents` (the old PPR / `dynamicIO` / `useCache`) is **off** and stays off until someone deliberately adopts it. Turning it on errors on uncached data outside `<Suspense>`; it is not a rename.

## Working style

- One phase from `docs/PLAN.md` per session. Do not start the next phase.
- For `domain/`, write the test first, then the implementation.
- If the plan and reality disagree, stop and say so rather than improvising a workaround.
