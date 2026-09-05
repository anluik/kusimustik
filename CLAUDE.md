@AGENTS.md

# CLAUDE.md

Survey SaaS. Next.js App Router + TypeScript + Supabase.

## Commands

```bash
pnpm dev            # dev server
pnpm check          # typecheck + lint + unit tests — MUST be green before you say you're done
pnpm test           # vitest
pnpm test:e2e       # playwright
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

```
app/
  domain/          pure schemas + logic (question union, answer validation, aggregation)
  lib/db/          supabase clients, generated types, repository fns
  lib/i18n/        next-intl setup
  app/(app)/       authed dashboard — builder, results
  app/(public)/    respondent runner, no auth
  app/api/
  components/ui/   shadcn — do not hand-edit, re-run the CLI
  components/      app components
supabase/migrations/
messages/          et.json, en.json, ru.json
docs/PLAN.md       the phased build plan — read the current phase before starting
docs/DECISIONS.md  settled architecture decisions — read before proposing a schema change
```

## Conventions

- Server Components by default. `"use client"` only for interactivity, pushed as far down the tree as possible.
- Mutations are Server Actions, wrapped so they return `{ ok: true, data } | { ok: false, error }` rather than throwing to the client.
- TanStack Query for client cache only. Query keys come from the factory in `lib/query-keys.ts` — never inline an array literal.
- Forms: react-hook-form + `zodResolver`, schema imported from `domain/`.
- Charts: Recharts via the shadcn `chart` component. Theme colours only, no hex literals.
- IDs are branded types (`SurveyId`, `QuestionId`, `ResponseId`). Construct via the helpers in `domain/ids.ts`.
- Every new table gets RLS enabled in the same migration that creates it. A migration that adds a table without a policy is incomplete.

## Working style

- One phase from `docs/PLAN.md` per session. Do not start the next phase.
- For `domain/`, write the test first, then the implementation.
- If the plan and reality disagree, stop and say so rather than improvising a workaround.