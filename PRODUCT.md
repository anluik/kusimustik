# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**The owner**, the person who builds a survey, publishes it and reads the
results. In practice someone inside an Estonian organisation running a
recurring survey: an annual satisfaction study, a member poll, a course
evaluation. They work at a desk, with a mouse and a keyboard, and they come
back to the same survey a year later. They are not a researcher by trade and
they are not buying a research platform.

**The respondent**, a stranger who receives a link and answers it, almost
always on a phone, once, without an account and without being asked anything
about themselves first. They owe the product nothing. DESIGN.md §10 records the
consequence the whole product is built around: *owners can be asked to use a
modern browser; respondents cannot be asked anything.*

The two are not the same person and their surfaces are deliberately not the
same density (DESIGN.md §4).

## Product Purpose

Build a survey, publish it, send the link to a stranger, have that stranger
answer it on a phone, and see aggregated charts and a CSV download. That is the
MVP definition in `docs/PLAN.md` verbatim, and nothing outside it counts as
must-have.

Success is a completed loop, not a feature count: a survey that got answered,
by enough people, and told its owner something they can act on.

## Positioning

The competitive targets are named in `docs/PLAN.md`: **connect.ee** (strong
charting, dead UI, ten question types) and **surveer.com** (good builder and
skip logic, hard response caps, no ranking or image-choice questions).

Two mechanisms a neighbouring product could not truthfully copy today:

1. **Wave-over-wave comparison of a recurring survey.** A survey that runs
   every year is a *wave group*, and the owner builds a saved comparison by
   matching questions across waves by hand, `wave_comparison_matches`, keyed
   on question id. The product deliberately refuses to infer a match from a
   key, a title or anything else (DECISIONS 035). Rewording a question between
   waves therefore does not sever its trend line, and no comparison is ever
   silently wrong.
2. **One survey, three languages.** The authored survey document is
   locale-keyed throughout, every title, description, choice label, scale
   endpoint, matrix row (DECISIONS 030-034). The owner writes in one language
   and translates in place; the respondent picks theirs from a path segment,
   and `responses.locale` records which one they answered in. The share link
   never changes when a translation is added.

## Operating Context

- A survey is authored in a three-panel builder, autosaved, and published.
- Publishing yields one share link, `/k/<slug>`, which the owner sends by
  email, posts, or prints as a QR code. It carries no language.
- Respondents arrive cold from that link, answer on a phone, and leave.
- The owner reads results as charts, watches a drop-off funnel for questions
  that are losing people, and downloads a CSV when they want to do their own
  analysis elsewhere.
- A year later the owner duplicates the survey into a new wave and compares.
- Estonian conventions are the default throughout: `12. jaan 2026`, `1 284`,
  `76,9%`, comma decimals, thin-space thousands.

## Capabilities and Constraints

**Shipped** (Phases 0-12): auth by magic link, the app shell, survey CRUD, the
builder, the public runner, results with charts and a drop-off funnel, CSV
export, a hardened public endpoint (honeypot and rate limit), production deploy
and CI, wave comparison with owner-chosen matches, and multilingual survey
content including the survey's own title and intro.

**Question types, eight, plus one non-question block:** `single_choice`,
`multi_choice`, `dropdown`, `short_text`, `long_text`, `opinion_scale`, `nps`,
`matrix_single`, and the `statement` block. Ranking and image choice do not
exist; both competitors lack them too, and they are the first two items in the
backlog.

**Deliberately not built, and not to be implied anywhere:**

- **Skip logic / branching** (Phase 13, skipped). Surveer has it. The product
  does not. Nothing may claim conditional questions.
- **Plans, billing, limits** (Phase 14, skipped). There is no plan on an
  account, no ceiling on surveys or responses, and no payment path. No page may
  show a price, a tier, a quota, or a "free plan".
- **Themes and branding, templates, teams, PDF export, public results links,
  webhooks, an API.** All backlog. The Templates nav item is visibly disabled
  with a "coming soon" badge, which is the only forward-looking claim in the
  product.

**Sign-ups are open.** Decided 2026-09-18, and a deliberate deviation from
`docs/PLAN.md` Phase 14 and `docs/DEPLOY.md` step 22, both of which argued for
keeping sign-ups closed until a ceiling exists. The consequence is accepted and
recorded rather than discovered: every account created from now until Phase 14
lands has been using the product with no limit, and imposing one later is a
conversation with those people rather than a fact they agreed to.

**Technical constraints that shape any new surface:**

- Three root layouts, no `app/layout.tsx`, because `<html lang>` differs by
  surface (DECISIONS 011).
- The owner app resolves locale from the `NEXT_LOCALE` cookie; the respondent
  runner from a path segment. Reading the cookie on a public route would make
  every request dynamic and hand two people the same URL for different pages
  (DECISIONS 011, 033).
- The deployed app holds no secret. Row-level security is what protects data.
- Server Actions dispatch one at a time per client; analytics goes to a Route
  Handler, never an action.

## Brand Commitments

- **The name is Inquirdi.** Used as-is in all three languages, including in
  Russian, where it is not transliterated. "Küsimustik" is the repository's
  directory name and the origin of `/k/` in the runner's URL; it is not the
  product's name and must not appear in anything a person reads.
- **The mark** is `components/shell/brand-mark.tsx`: a sheet with two written
  lines and a ticked third, drawn rather than imported, and the one drawn asset
  in the product. `app/icon.svg` is the same mark with its tokens resolved.
- **Voice is plain and factual.** Owner-facing microcopy states what happened
  and what to do; it does not sell, apologise or exclaim. This is a recorded
  design rule (DESIGN.md §9), not a preference.
- **Estonian is the source of truth.** A key is written in `et.json` first and
  then in all three. A hardcoded English string is the same bug as a hardcoded
  Estonian one.
- **All three launch languages are real**, including on marketing surfaces:
  et, en and ru. Russian is not an afterthought, every font in the product was
  chosen partly because it ships Cyrillic.

## Evidence on Hand

**What is real and may be shown:**

- **A live demo survey**, the strongest proof a survey tool has, and the
  agreed centrepiece of the landing page (2026-09-18). A visitor answers a real
  published survey and sees it register. This requires a published survey at a
  known slug in production; locally `supabase/seed.sql` provides
  `rahulolu-2025` and `rahulolu-2026`, two waves of a service satisfaction
  survey with thirty responses each. **The production demo survey does not
  exist yet** and must be created before the page ships.
- **The product itself**, the builder, the results charts, the wave
  comparison and the runner are all built and can be shown truthfully.

**What does not exist and must never be invented:**

- No customers, named or anonymous. No logos. No testimonials or quotes.
- No usage numbers, no survey count, response count, user count, uptime
  figure or "trusted by" line.
- No press, no awards, no case studies, no benchmarks.
- No pricing, no plans, no free-tier claim, no trial length.
- No security certification, GDPR badge or compliance claim. The data is in
  Supabase behind RLS in Stockholm (`arn1`); that is a fact about hosting and
  may be stated as one, but no certification may be implied.

## Product Principles

1. **The respondent is the priority surface.** They cannot be asked for
   patience, a modern browser, a wide screen or an account. Anything that
   trades their experience for the owner's convenience is the wrong trade.
2. **Never infer what the owner can state.** The refusal to guess a
   cross-wave match is the clearest case, and it generalises: a silent wrong
   answer is worse than an explicit empty one.
3. **A survey's words are content; its identifiers are not.** Everything a
   person reads is translatable; nothing a system compares is.
4. **Say only what is true.** Applies to error messages, empty states and
   marketing copy identically, there is no surface where the product is
   allowed to imply a capability it does not have.
5. **Density follows the job.** Dense where someone works, generous where
   someone answers. The two are never averaged.

## Accessibility & Inclusion

Established, and enforced by `tools/token-audit.mjs` on every `pnpm check`
rather than asserted:

- Body text ≥ 4.5:1 and non-text UI ≥ 3:1 in both light and dark, **input
  borders included**, respondents fill forms on phones in daylight.
- Colour is never the only encoding, anywhere.
- Every interactive element is keyboard reachable with a visible focus ring;
  the ring is never removed for aesthetics.
- Disabled states use the `--input` token, never opacity, because opacity
  stacking breaks the audited contrast.
- Respondent-facing text never goes below 14px; tap targets are ≥ 44px, and
  ≥ 48px in practice.
- Assume 30-40% string expansion from English. Never size a control to its
  label.
- The paper grain and other texture are suppressed under `forced-colors` and
  `prefers-contrast: more`.
