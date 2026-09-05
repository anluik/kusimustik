@AGENTS.md

# CLAUDE.md

Survey SaaS. Next.js App Router + TypeScript + Supabase.

## Commands

```bash
pnpm dev            # dev server
pnpm check          # typecheck + lint + unit tests — MUST be green before you say you're done
pnpm test           # vitest
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
- **Analytics never blocks.** `survey_events` writes are best-effort and batched. A failed event write must never surface to a respondent or abort a submission.
- **No hardcoded user-facing strings.** All copy goes through next-intl message files (`messages/et.json`, `en.json`, `ru.json`). Add the key to all three; use the English text as the placeholder for et/ru and flag it in your summary.

## Layout

No `src/`. `app/` is the router directory and holds routes and nothing else;
everything else sits beside it at the repo root. `@/*` resolves from the repo
root, so `domain/` is `@/domain` and `lib/db/` is `@/lib/db`.

```
app/                 App Router — routes only
  (app)/             authed dashboard — builder, results
  (public)/          respondent runner, no auth
  api/               route handlers (analytics beacons, CSV download)
  globals.css        canonical design tokens — see docs/DESIGN.md §1
domain/              pure schemas + logic (question union, answer validation, aggregation)
lib/db/              supabase clients, generated types, repository fns
lib/i18n/            next-intl setup
components/ui/       shadcn — do not hand-edit, re-run the CLI
components/          app components
e2e/                 playwright specs
messages/            et.json, en.json, ru.json
supabase/migrations/
docs/PLAN.md         the phased build plan — read the current phase before starting
docs/DECISIONS.md    settled architecture decisions — read before proposing a schema change
docs/DESIGN.md       the visual spec — read before writing any UI
```

## Conventions

- Server Components by default. `"use client"` only for interactivity, pushed as far down the tree as possible.
- Mutations are Server Actions, wrapped so they return `{ ok: true, data } | { ok: false, error }` rather than throwing to the client. **The wrapper's `catch` must start with `unstable_rethrow(err)`** from `next/navigation` — `redirect()`, `permanentRedirect()` and `notFound()` all work by throwing, and a catch-all wrapper swallows them silently.
- A Server Action is a public POST endpoint, reachable without going through your UI. Every action re-checks auth and ownership itself; never rely on the calling page having checked.
- TanStack Query for client cache only. Query keys come from the factory in `lib/query-keys.ts` — never inline an array literal.
- Forms: react-hook-form + `zodResolver`, schema imported from `domain/`.
- Charts: Recharts via the shadcn `chart` component. Theme colours only, no hex literals.
- IDs are branded types (`SurveyId`, `QuestionId`, `ResponseId`). Construct via the helpers in `domain/ids.ts`.
- Every new table gets RLS enabled in the same migration that creates it. A migration that adds a table without a policy is incomplete.

## Next.js 16

Read `AGENTS.md`. These are the version differences that have already caught us out — the rest is in `node_modules/next/dist/docs/`.

- **There is no `middleware.ts`.** It is `proxy.ts` at the repo root, exporting `proxy()`. Node runtime only, not configurable. next-intl's own docs still say middleware — ignore them on that point.
- **`revalidateTag` takes two arguments** (`revalidateTag(tag, 'max')`); the one-arg form is a type error. For owner-facing mutations you almost always want `updateTag(tag)` instead — it gives read-your-writes, so the owner sees their edit immediately rather than a stale render. `refresh()` refreshes the client router from an action.
- **Server Actions dispatch one at a time per client.** `Promise.all` over actions serialises them. Batch into a single action instead. This constrains builder autosave.
- **Analytics beacons go to a Route Handler in `app/api/`**, not a Server Action — `sendBeacon` needs a plain endpoint, and actions queue behind each other.
- **`params`, `searchParams`, `cookies()`, `headers()` and `draftMode()` are Promise-only.** Sync access was removed in 16. Type pages with the generated `PageProps<'/s/[slug]'>` / `LayoutProps` / `RouteContext` helpers.
- `next lint` no longer exists and `next build` does not lint — which is exactly why `pnpm check` runs `eslint` itself.
- Turbopack is the default for `dev` and `build`. No `--turbopack` flag.
- `cacheComponents` (the old PPR / `dynamicIO` / `useCache`) is **off** and stays off until someone deliberately adopts it. Turning it on errors on uncached data outside `<Suspense>`; it is not a rename.

## Working style

- One phase from `docs/PLAN.md` per session. Do not start the next phase.
- For `domain/`, write the test first, then the implementation.
- If the plan and reality disagree, stop and say so rather than improvising a workaround.
