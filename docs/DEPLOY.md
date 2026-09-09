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
      every page render is a round trip to Postgres — see step 10, and change
      `vercel.json` if you pick Frankfurt (`fra1` instead of `arn1`).
    - **Database password.** Generated once and needed in step 5. Put it in the
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

## C — The domain, and the one decision it forces

8. **Buy the domain.** For an `.ee` domain the registrar must be Estonian; for
   anything else use whichever registrar you already have. Do it before the
   Vercel project, because registrar verification and DNS both take their own
   time, and because step 16 sends you back to the same DNS panel.

   Nothing is pointed at anything yet. Attaching the domain happens in section
   E, once there is a project to attach it to.

9. **Decide the canonical origin** — the apex or the `www` host, one of them,
   with the other redirecting.

   In plain terms: the *apex* is `example.com`, with nothing in front of it;
   the `www` host is `www.example.com`. They are two different addresses that
   people treat as one site. The *canonical origin* is whichever you declare to
   be the real one — scheme and host together, `https://example.com` — and the
   other is set up to redirect to it.

   This is a decision rather than a screen: it is
   the value of `NEXT_PUBLIC_SITE_URL` in step 11 and of Supabase's Site URL in
   step 21, and every one of them has to name the same host. A magic link that
   arrives on the other one loses its PKCE verifier and fails with
   `wrongBrowser`.

   Make the non-canonical host a redirect rather than a second live host:
   `components/surveys/share-link.tsx` builds the link an owner copies with
   `new URL(path, window.location.origin)`, so an owner who happens to be on
   the other host hands respondents links on it. Both would serve the runner,
   but only one should be in circulation.

## D — The app

10. **Create the Vercel project** by importing `anluik/kusimustik` from GitHub.
    It detects Next.js and pnpm on its own; `vercel.json` supplies the region.

    Leave all four build fields at their defaults: root directory `./`, and no
    override on the build command, output directory or install command. The
    `pnpm-workspace.yaml` at the root is not a monorepo — it has no `packages:`
    key and exists only to carry `allowBuilds`. If the install step fails over
    the `packageManager` pin, add `ENABLE_EXPERIMENTAL_COREPACK=1`.

    The import screen does not ask about the domain, and there is nothing to do
    about that here — it is attached afterwards, in step 13.

    Check the first deployment's function region once it exists — plans differ
    in whether they honour `regions` from the file — and if it says anywhere
    but Stockholm, set it in the project's function region setting to match
    step 2. A function in Washington in front of a database in Stockholm pays
    that round trip several times per page render.

11. **Set the environment variables**, for the Production environment:

    | Variable                               | Value                                     |
    | -------------------------------------- | ----------------------------------------- |
    | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`       |
    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key from step 3           |
    | `NEXT_PUBLIC_SITE_URL`                 | the origin from step 9, no trailing slash |

    Nothing else, and nothing secret. Vercel's importer pre-fills a fourth
    name, `SUPABASE_SECRET_KEY`, from `.env.example` — **delete it**. It
    bypasses RLS, no application code reads it, and only the two test suites
    do.

    Do this *before* the first deploy. `NEXT_PUBLIC_*` variables are inlined
    into the browser bundle at build time, so a build without them succeeds and
    ships `undefined` where the Supabase URL should be — a broken site rather
    than a failed build, and one that stays broken until you redeploy.

    Put the real origin from step 9 in `NEXT_PUBLIC_SITE_URL` even though it
    does not resolve yet. It costs nothing — sign-in does not work until
    section F regardless — and the alternative is a second build later, since
    editing an inlined variable does nothing without one.

    If you want Preview deployments to be signable-in, give them their own
    `NEXT_PUBLIC_SITE_URL`; otherwise their magic links will point at
    production, which is the safe failure.

12. **Deploy.** The site comes up on its `*.vercel.app` URL and should render
    the sign-in page. It cannot actually sign anyone in yet — that is section
    F — and the domain is not attached yet either, which is next.

## E — Pointing the domain at it

13. **Attach both hosts** in the project's **Settings → Domains**. Until you do,
    that screen shows only the `*.vercel.app` URL Vercel assigns every project;
    your own domain appears there once you add it, and not before.

    Use **Add Existing** (the neighbouring **Buy** is for registering a new one
    through Vercel) and enter the apex. The form offers a checkbox, *Redirect
    apex domains to www (recommended)* — that recommendation is Vercel's
    generic default and neither of its usual rationales applies here:

    - Cookies. The argument against an apex is that its cookies reach every
      subdomain. Ours do not: nothing in `lib/supabase/*` sets a `Domain`
      attribute, so the auth cookies are host-only.
    - DNS. The argument for `www` is that an apex cannot take a CNAME. True in
      general, but Vercel needs an A record on the apex either way — something
      has to serve the redirect.

    So set the checkbox to match step 9 rather than taking the default, and
    afterwards confirm both hosts are listed with one serving and the other
    redirecting to it. Then create the DNS records Vercel prints at the
    registrar from step 8: an A record for the apex (or ALIAS/ANAME if your
    registrar offers one) and a CNAME for `www`. Vercel gives the exact values.

    **Delete the registrar's parking records first.** A freshly registered
    domain usually arrives with a URL redirect record on the apex and a CNAME
    on `www` pointing at the registrar's own parking page. They are not a
    configuration anyone chose, and an apex cannot hold both a URL redirect
    record and an A record — leave them and Vercel reports an invalid
    configuration while the certificate never issues. Check too that the domain
    is still on the registrar's basic DNS rather than custom nameservers, or
    the records you add are never served.

    Use **308** if asked for the redirect's status code. Permanent, so clients
    stop re-requesting the wrong host, and method-preserving, which 301 and 302
    are not: both let a client rewrite a `POST` into a `GET` and drop the body.
    Every write here is a POST to the same origin — the Server Actions, and
    `/api/events`, which is a POST-only route handler that would answer a
    rewritten GET with a 405 — so under a 301 a submission arriving on the
    non-canonical host would vanish rather than fail. Note that a permanent
    redirect is cached hard by browsers, so it is a commitment; 307 is the
    temporary equivalent if the canonical host is still genuinely undecided.

    Whichever way round it ends up, `NEXT_PUBLIC_SITE_URL` and Supabase's Site
    URL (step 21) have to name the *serving* host, not the redirecting one.
    Nothing breaks because you chose one over the other; things break when the
    three disagree.

    The `*.vercel.app` domain stays in the list and nothing depends on it. Keep
    it until step 27 — if the real domain misbehaves it tells you instantly
    whether the fault is the app or the DNS in front of it — and remove it
    afterwards if you like. Two caveats while it exists: sign-in does not work
    on it, because the magic link is built from `NEXT_PUBLIC_SITE_URL` and
    lands on a host that has no PKCE verifier cookie; and `share-link.tsx`
    builds the copyable survey link from whatever host the owner is browsing,
    so a link copied there is the link respondents get.

    It issues the TLS certificate itself once the records resolve. Minutes,
    usually; hours occasionally.

14. **Redeploy if the origin changed.** If step 11 went in with a placeholder,
    correcting the variable now is not enough — it is compiled into the bundle,
    so it takes a fresh deployment. If you put the real origin in already,
    there is nothing to do here.
## F — Sending real email

The steps below are written for **Resend**; Postmark, SendGrid or any other
SMTP provider would do, and only the screen names and the host in step 19
would change.

This is the section that decides whether anyone can sign in, so it is worth
knowing what the chain actually is before touching a screen. Nothing in it is
application work — every piece already exists:

- **The request.** An owner submits `/login`. `signIn` in
  `lib/auth/actions.ts` calls `signInWithOtp` with `emailRedirectTo` built
  from `NEXT_PUBLIC_SITE_URL` — `<origin>/auth/callback?next=…` — and the
  Supabase client sets a PKCE verifier cookie in that browser.
- **The send.** Supabase Auth renders its **Magic Link** template and hands
  the message to an SMTP server. **This is the only missing link in
  production**, and the whole of this section: by default that SMTP server is
  Supabase's own built-in sender, which is rate limited to a handful of
  messages an hour and is documented as being for testing only. Locally it is
  Mailpit, which never leaves the laptop.
- **The delivery.** Resend accepts the message and gets it into an inbox
  rather than a spam folder — which is what steps 16 and 17 are for.
- **The click.** The link goes to Supabase's `/auth/v1/verify`, which
  redirects to `/auth/callback?code=…` on the canonical origin.
- **The exchange.** `app/auth/callback/route.ts` trades that code for a
  session against the verifier cookie from the first stage, and redirects
  into the app.

Sign-in is the *only* email this product sends. It is also the only thing
standing between an owner and their account, so a failure anywhere in that
chain is total rather than partial.

15. **Add the sending domain in Resend**, on the Domains screen.

    Two choices are made in that dialog and neither is convenient to change
    afterwards:

    - **Region.** Resend sends from one of four: North Virginia
      (`us-east-1`), Ireland (`eu-west-1`), São Paulo (`sa-east-1`) and Tokyo
      (`ap-northeast-1`). Ireland — nearest to both the recipients and the
      Stockholm project. It is per domain and fixed at creation.
    - **The name to send from.** The field wants a bare hostname — the domain
      from step 8 and nothing around it: `example.com`, not `https://`, not
      `www.`, not an address with an `@`. It is the part after the `@` in the
      sender address, so this is what you type in step 19 and what owners see
      in their inbox.

      **The apex, not a subdomain.** Resend's own advice is to send from
      something like `mail.example.com`, so that sending reputation is
      isolated from the domain itself. That matters for a product with
      newsletters and a marketing list; here the only message is a sign-in
      link, sent to someone who asked for it seconds earlier, so there is no
      second stream to isolate it from and `no-reply@example.com` is the
      plainer thing for an owner to recognise.

      Doing it this way does not put everything on the apex: Resend still
      hangs its own records off `send.example.com` and
      `resend._domainkey.example.com` in step 16, and that is not a choice
      either way. It also leaves the apex free — Vercel's A record from step
      13, and an MX for receiving mail should you ever add one, both sit
      beside it untouched.

    Resend does let you send before any of this, from `onboarding@resend.dev`,
    but only to the address on the Resend account itself. That is enough to
    prove an API key works and nothing more — Supabase sends from one fixed
    sender to whichever owner asked for a link — so the domain has to be
    verified for real.

16. **Add the DNS records Resend prints**, at the registrar from step 8,
    alongside the ones step 13 put there. They do not collide: these hang off
    `send` and `resend._domainkey`, not the apex.

    Copy the values verbatim from the domain's page rather than from anywhere
    else, including this file — the DKIM key is unique to your domain, and the
    exact set varies (older domains get an MX plus a TXT for SPF and a TXT for
    DKIM; domains added recently get CNAMEs instead). Four things go wrong
    here, and all four are silent:

    - **The name field.** Most registrars append the zone themselves, so the
      name is `send`, not `send.example.com`. Entering the full name gives you
      `send.example.com.example.com`.
    - **The value field, in the other direction.** Some registrars append the
      zone to *values* too. Give fully-qualified values a trailing dot —
      `feedback-smtp.eu-west-1.amazonses.com.` — which says "this is complete,
      leave it alone".
    - **Proxying.** If the DNS is behind Cloudflare, these records must be
      grey-cloud (DNS only). A proxied CNAME does not resolve as a CNAME and
      verification never finishes.
    - **A conflict on the `send` subdomain.** A CNAME cannot coexist with an
      A, TXT or MX record of the same name. If something is already there,
      remove it or point Resend at a different return-path subdomain.

    Resend re-checks on its own; verified usually within fifteen minutes.
    Propagation can take up to 72 hours if the registrar is slow or a stale
    record is still cached. **Wait for `Verified` before step 19** — until
    then Resend rejects the sender, and Supabase will report only that sending
    failed.

17. **Add a DMARC record**, at the same registrar: a TXT record named `_dmarc`
    with a value of `v=DMARC1; p=none; rua=mailto:<an address you read>`.

    SPF and DKIM (step 16) prove the message came from you; DMARC is the
    record that tells a receiving server what to do when they disagree, and
    Gmail and Outlook now treat its absence as a mark against the sender.
    `p=none` asks for no enforcement and only for reports, which is the right
    place to start: it cannot break delivery, and the reports tell you whether
    a stricter policy would.

    This is not optional in effect, even though nothing rejects mail without
    it. A magic link in a spam folder reads to an owner as a broken sign-in,
    and they have no way to tell the difference.

18. **Create the SMTP credential.** In Resend the API key *is* the SMTP
    password — there is no separate SMTP user to create. On the API Keys
    screen create one with **sending access only**, restricted to the domain
    from step 15 if the option is offered.

    It is shown once, starts `re_`, and goes in the password manager now. It
    is the only real secret this deployment has, and it lives in Supabase's
    settings rather than in Vercel's environment — no application code sends
    mail, so nothing in the repository ever reads it.

19. **Configure custom SMTP** on the Supabase project, under Authentication →
    SMTP settings. Enable custom SMTP and fill in:

    | Field         | Value                                             |
    | ------------- | ------------------------------------------------- |
    | Host          | `smtp.resend.com`                                 |
    | Port          | `465`                                             |
    | Username      | `resend` — literally that word, not your address  |
    | Password      | the API key from step 18                          |
    | Sender email  | `no-reply@<the domain verified in step 16>`       |
    | Sender name   | what owners should see as the sender              |

    Port 465 is implicit TLS: encrypted from the first byte. Resend also
    accepts 587 and 2587 (STARTTLS, which begins in plaintext and upgrades)
    and 25 and 2465; use 587 only if 465 turns out to be blocked.

    The sender address must be on the verified domain. If it is not, Resend
    answers with a 403, `signInWithOtp` returns a non-429 error, and
    `lib/auth/actions.ts` maps that to `sendFailed` — the login form says
    sending failed and nothing distinguishes a wrong sender from a wrong
    password. Check this field against step 15 before blaming the key.

20. **Raise the auth email rate limit**, under Authentication → Rate limits.

    Supabase applies a deliberately low cap of 30 messages an hour when custom
    SMTP is first enabled, to protect a new sender's reputation. Left there,
    it is survivable but tight; the local stack sets `email_sent = 2` in
    `supabase/config.toml` precisely so that the limited path is easy to hit
    in development. Raise it to something an ordinary day cannot reach — a
    hundred an hour is far more than this product's one email per sign-in
    needs, and well inside Resend's own allowance.

    What the owner sees when it is hit: `signInWithOtp` returns a 429, the
    action maps it to `rateLimited`, and the form says to wait. It is not
    silent, but it is indistinguishable from a broken deployment to someone
    who has mistyped their address twice.

21. **Set the auth URLs** on the same project's URL configuration screen:
    - **Site URL:** the origin from step 9.
    - **Redirect URLs:** that origin with `/**`.

    These are the hosted equivalents of `auth.site_url` and
    `additional_redirect_urls` in `supabase/config.toml`. That file configures
    the *local* stack and points at `127.0.0.1`; **do not run `supabase config
    push`**, which would overwrite what you just set with those values.

22. **Decide whether sign-ups stay open.** As deployed, `signInWithOtp` creates
    an account for any address that asks for a link, so anyone who finds the
    login page can start building surveys in your project. That is correct for
    a public product and wrong for a private one. If it should be private,
    disable email sign-ups in the Authentication providers settings and create
    the owner account by invitation before doing so.

    Weigh it knowing that **nothing limits an account yet**. There are no
    plans, no quotas and no billing: an account created here can build surveys
    and collect responses against your Supabase project without a ceiling, and
    the only thing standing between that and a stranger is this setting. The
    plan system is designed (docs/DECISIONS.md 028) and scheduled (Phase 14 of
    docs/PLAN.md) but not built.

    That cuts both ways, and the cost of getting it wrong is not symmetric.
    Keeping sign-ups closed until Phase 14 costs you nothing but time. Opening
    them earlier is fine too — but every account created before a ceiling
    exists is one that has been using the product without one, and imposing a
    limit on somebody afterwards is a conversation, where imposing it at
    sign-up is a fact they agreed to. If you open them now, treat Phase 14 as
    the next thing you build rather than something on a list.

23. *(Optional)* **Translate the magic-link email**, under Authentication →
    Email templates → Magic Link. The default is English; the rest of the
    product speaks Estonian first.

    Whatever you write, **keep `{{ .ConfirmationURL }}` as the link's href.**
    That is the placeholder that carries the PKCE handshake: it expands to
    Supabase's `/auth/v1/verify`, which is what redirects to
    `/auth/callback?code=…`. Substituting `{{ .Token }}` or
    `{{ .TokenHash }}`, as several Supabase examples do, produces a link the
    callback route cannot use — it reads `code` and nothing else, so every
    sign-in would fail with `linkInvalid`.

24. **Watch one message go out.** Ask for a link from the deployed login page
    and open Resend's Emails screen. This splits the chain at the one point
    that matters:

    - **Nothing appears in Resend.** The message never got past Supabase.
      Credentials, port or sender address — steps 18 and 19.
    - **It appears, and is delivered.** The SMTP leg is done, and anything
      still wrong is on the receiving side: spam filtering (step 17) or the
      link itself (steps 21 and 23).

    Resend keeps the rendered message, so this is also where you read what an
    owner actually received.

## G — Prove it

25. **Sign in at the real domain** with an address that has never been used
    here. That exercises the first-time path, which is the one that differs
    between the local stack and a hosted project.

26. **Build and publish a survey**, then open its `/k/<slug>` link **on a phone
    on cellular data** — not on the office wifi. This is the acceptance test
    Phase 10 asks for: a stranger, a real network, a real device.

27. **Submit it, and find the response** on the results page. If it is there,
    the phase is done.

## H — After it works

28. **Push `master` and confirm CI is green.** Then require the `pnpm check`
    and `pnpm test:db` checks on the branch, so a red suite blocks a merge
    rather than merely being visible.

29. **Schedule the rate limiter's sweep.** `prune_rate_limits()` currently runs
    probabilistically from the calls themselves (DECISIONS 026), which is
    enough while rows live an hour but wants a real schedule now that there is
    a project to put one in — `pg_cron` on the Supabase side, hourly.

30. **Turn on backups.** Point-in-time recovery is a paid feature and this is
    the moment it starts being worth it: from step 27 onwards the database
    holds answers that cannot be recreated.
