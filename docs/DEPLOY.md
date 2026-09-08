# Deploying

Phase 10 of `docs/PLAN.md`. This is the half of the deploy that needs a human:
every step below wants an account, a domain, a card or a key that cannot be
created from inside the repository.

**What is already done, and is not on this list:** the CI workflow
(`.github/workflows/ci.yml`), the Vercel configuration (`vercel.json`), the
environment documentation (`.env.example`) and the deployment section of
`README.md`. Read the README's deployment section first — it explains the shape
of what you are about to set up, and this file assumes it.

Names of dashboard screens are given rather than click paths, because the click
paths move.

---

## Before you start

Have ready: a card, access to the domain registrar you intend to buy from, and
a password manager. Two of the steps below produce a password or a key that is
shown once.

---

## A — The Supabase project

1. **Create a Supabase account and organisation**, if there is not one already.

2. **Create the project.** Two choices matter and neither is easy to change
   afterwards:
    - **Region.** Stockholm (`eu-north-1`) if it is offered, otherwise
      Frankfurt (`eu-central-1`). It has to be near the Vercel region, because
      every page render is a round trip to Postgres — see step 12, and change
      `vercel.json` if you pick Frankfurt (`fra1` instead of `arn1`).
    - **Database password.** Generated once and needed in step 8. Put it in the
      password manager now; recovering it later means resetting it.

    Check all three of the Data API options offered — **Enable Data API**,
    **Automatically expose new tables**, **Enable automatic RLS**.

    The first is mandatory: every repository function and all three runner RPCs
    go through PostgREST. The third changes nothing here — every migration
    already ends in `alter table ... enable row level security` — but its
    failure mode is fail-safe, so it is worth having behind the convention.

    The second deserves a note. Nothing in `supabase/migrations/` needs it:
    every table revokes from `anon, authenticated` and then grants exactly what
    it means to, and every function anon may call has its own `grant execute`.
    Turning it *off* would be the better posture for that reason. It is checked
    anyway because `supabase/config.toml` leaves `auto_expose_new_tables`
    unset, which falls back to `true` — and a production database that differs
    from the local one is a database `pnpm test:db` no longer describes.
    `prune_rate_limits()` is the live example: `service_role` can execute it
    only because of this default, and a db test calls it that way. Changing it
    means changing both, resetting locally and re-running the suite.

3. **Note the project ref** (the subdomain of the project's API URL,
   `https://<project-ref>.supabase.co`) and, from the API keys screen, the
   **publishable key**. Both go into step 11.

   The publishable key is meant to be public and ships to every browser — RLS
   is what protects the data. The **secret key on the same screen is not
   needed anywhere**: no application code reads it, only the test suites do.
   Do not put it in Vercel.

## B — The database schema

4. **Create a personal access token** on your Supabase account page, and run
   `pnpm exec supabase login` with it.

5. **Link the repository to the project:**

    ```bash
    pnpm exec supabase link --project-ref <project-ref>
    ```

    It asks for the database password from step 2.

6. **Push the migrations:**

    ```bash
    pnpm exec supabase db push
    ```

    This applies everything in `supabase/migrations/` in order and nothing
    else. **Do not run `supabase db reset`** — that one replays from empty
    *and* runs `supabase/seed.sql`, which invents an owner and sixty fabricated
    responses.

7. **Check what landed.** In the table editor you should see `profiles`,
   `surveys`, `survey_versions`, `survey_questions`, `responses`, `answers`,
   `survey_events`, `rate_limit_hits` and `rate_limit_salts` — all empty, all
   with RLS enabled. If any row exists anywhere, a seed ran; stop and work out
   why before anyone signs in.

## C — The domain

8. **Buy the domain.** For an `.ee` domain the registrar must be Estonian; for
   anything else use whichever registrar you already have.

9. **Add it to Vercel** in step 11's project, and create the DNS records Vercel
   gives you at the registrar. Vercel issues the TLS certificate itself once
   the records resolve; this usually takes minutes and can take hours.

10. **Decide the canonical origin** — `https://kusimustik.ee` or
    `https://www.kusimustik.ee`, one of them, with the other redirecting. Every
    variable below has to name the same one, and a magic link that arrives on
    the other host loses its PKCE verifier and fails with `wrongBrowser`.

## D — The app

11. **Create the Vercel project** by importing `anluik/kusimustik` from GitHub.
    It detects Next.js and pnpm on its own; `vercel.json` supplies the region.
    Check the first deployment's function region afterwards — plans differ in
    whether they honour `regions` from the file — and if it says anywhere but
    Stockholm, set it in the project's function region setting to match step 2.
    A function in Washington in front of a database in Stockholm pays that
    round trip several times per page render.

12. **Set the environment variables**, for the Production environment:

    | Variable                               | Value                               |
    | -------------------------------------- | ----------------------------------- |
    | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co` |
    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key from step 3     |
    | `NEXT_PUBLIC_SITE_URL`                 | the origin from step 10, no trailing slash |

    Nothing else, and nothing secret. If you want Preview deployments to be
    signable-in, give them their own `NEXT_PUBLIC_SITE_URL`; otherwise their
    magic links will point at production, which is the safe failure.

13. **Deploy**, and confirm the site loads at the domain. It will not sign in
    yet — that is section E.

## E — Sending real email

Mailpit is local-only, and Supabase's built-in sender is rate limited to a
handful of messages an hour and is explicitly not for production. Sign-in is
the *only* email this product sends, which also means it is the only thing
standing between an owner and their account.

14. **Create an account with a transactional email provider** — Resend,
    Postmark and SendGrid all work; any SMTP provider does.

15. **Verify the sending domain** with the provider. This means adding SPF and
    DKIM records at the registrar from step 8, alongside the Vercel records.
    Unverified domains land in spam, and a magic link in a spam folder reads to
    the owner as a broken sign-in.

16. **Issue an SMTP credential / API key** and put it in the password manager.

17. **Configure custom SMTP** on the Supabase project's Authentication settings
    — host, port, username, password, sender address and sender name. The
    sender address must be on the domain verified in step 15.

18. **Raise the auth email rate limit.** It defaults to a number chosen for the
    built-in testing sender, and until it is raised an owner who mistypes their
    address once cannot ask for a second link within the hour.

19. **Set the auth URLs** on the same project's URL configuration screen:
    - **Site URL:** the origin from step 10.
    - **Redirect URLs:** that origin with `/**`.

    These are the hosted equivalents of `auth.site_url` and
    `additional_redirect_urls` in `supabase/config.toml`. That file configures
    the *local* stack and points at `127.0.0.1`; **do not run `supabase config
    push`**, which would overwrite what you just set with those values.

20. **Decide whether sign-ups stay open.** As deployed, `signInWithOtp` creates
    an account for any address that asks for a link, so anyone who finds the
    login page can start building surveys in your project. That is correct for
    a public product and wrong for a private one. If it should be private,
    disable email sign-ups in the Authentication providers settings and create
    the owner account by invitation before doing so.

21. *(Optional)* **Translate the magic-link email.** The default template is
    English; the rest of the product speaks Estonian first.

## F — Prove it

22. **Sign in at the real domain** with an address that has never been used
    here. That exercises the first-time path, which is the one that differs
    between the local stack and a hosted project.

23. **Build and publish a survey**, then open its `/k/<slug>` link **on a phone
    on cellular data** — not on the office wifi. This is the acceptance test
    Phase 10 asks for: a stranger, a real network, a real device.

24. **Submit it, and find the response** on the results page. If it is there,
    the phase is done.

## G — After it works

25. **Push `master` and confirm CI is green.** Then require the `pnpm check`
    and `pnpm test:db` checks on the branch, so a red suite blocks a merge
    rather than merely being visible.

26. **Schedule the rate limiter's sweep.** `prune_rate_limits()` currently runs
    probabilistically from the calls themselves (DECISIONS 026), which is
    enough while rows live an hour but wants a real schedule now that there is
    a project to put one in — `pg_cron` on the Supabase side, hourly.

27. **Turn on backups.** Point-in-time recovery is a paid feature and this is
    the moment it starts being worth it: from step 24 onwards the database
    holds answers that cannot be recreated.
