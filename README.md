# Küsimustik

A survey builder, collector and analyser for the Estonian market. Next.js App
Router + TypeScript + Supabase.

Read `CLAUDE.md` before changing anything: it carries the non-negotiables, the
directory layout and the Next.js 16 differences that have already caught us
out. `docs/PLAN.md` is the phased build plan, `docs/DECISIONS.md` the settled
architecture decisions, `docs/DESIGN.md` the visual spec.

## Development

You need Node (the version in `.nvmrc`), [pnpm](https://pnpm.io), Docker for
the local Supabase stack, and the Supabase CLI, which is a devDependency rather
than a global install.

```bash
pnpm install
cp .env.example .env.local     # then fill it from `supabase status`
pnpm exec supabase start
pnpm dev
```

Open http://127.0.0.1:3000 — not `localhost`. Supabase's local stack, and
therefore `auth.site_url`, speak `127.0.0.1`, and cookies are keyed by host, so
a sign-in started on one and finished on the other loses its PKCE verifier.

Sign-in is a magic link. Locally the mail never leaves the machine: it lands in
Mailpit at http://127.0.0.1:54324. `supabase/seed.sql` creates
`owner@kusimustik.test` with two waves of thirty responses behind it.

### Commands

```bash
pnpm dev            # dev server
pnpm check          # typegen + typecheck + lint + unit tests + format check.
                    # MUST be green before you say you're done.
pnpm test           # vitest, watching
pnpm test:db        # integration tests against local Supabase — RLS, triggers,
                    # repositories. Needs `supabase start`; not part of `pnpm check`.
                    # Run it after touching anything in supabase/ or lib/db/.
pnpm test:e2e       # playwright
pnpm format         # prettier --write .
pnpm db:types       # regenerate lib/db/database.types.ts from local Supabase
pnpm db:reset       # reset local DB and replay migrations + seed
```

`pnpm check` and `pnpm test:db` are what CI runs (`.github/workflows/ci.yml`),
on every pull request and every push to `master`.

## Deployment

The app is a Next.js deployment on Vercel in front of a hosted Supabase
project. Nothing else runs anywhere: there is no server of ours, no queue and
no cache tier.

**The deployed app holds no secret.** It runs on three variables, and all three
are public by nature — two of them are shipped to the browser on every page
load, and the third is the site's own address:

| Variable                               | Value in production                     |
| -------------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key           |
| `NEXT_PUBLIC_SITE_URL`                 | the site's own origin, no trailing slash |

Row-level security is what protects the data, which is why the publishable key
can be public. `SUPABASE_SECRET_KEY` bypasses RLS and is read **only** by the
two test suites; it must not be added to the deployment's environment.

**The database is deployed separately from the app, and by hand.** `supabase db
push` applies the migrations in `supabase/migrations/` to the linked project.
Pushing migrations is not wired into CI: a schema change and a code change land
in the same commit but not at the same instant, and deciding which goes first
is a judgement about the specific change. Push the migration, then let Vercel
deploy the code.

> **Never run `supabase db reset` against production.** It replays the
> migrations from empty _and_ runs `supabase/seed.sql`, which invents an owner
> and sixty fabricated responses. `db push` is the production command; `db
> reset` is the local one.

**`supabase/config.toml` configures the local stack only.** Its `auth.site_url`
and `additional_redirect_urls` point at `127.0.0.1`, and `supabase config push`
would overwrite the hosted project's auth settings with them. Production's
Site URL, redirect allow-list, SMTP and rate limits are set in the dashboard.

**Regions must match.** `vercel.json` pins the functions to `arn1` (Stockholm)
because every page render is a round trip to Postgres; put the Supabase project
in the nearest region to it. A function in Washington in front of a database in
Stockholm pays that latency several times per render.

**Preview deployments send their magic links to production.**
`NEXT_PUBLIC_SITE_URL` is set per environment and a preview's own URL changes
with every push, so a link requested from a preview arrives pointing at the
production origin. That is the safe failure — the alternative is an auth
redirect allow-list with a wildcard in it — but it means a preview cannot be
signed into without setting the variable for that environment by hand.

### First-time setup

`docs/DEPLOY.md` is the numbered checklist: the accounts, the domain, the DNS
and the keys, in the order they have to happen. Everything on it needs a human
with a credit card or a registrar login, which is why it is a document rather
than a script.
