---
version: 1
slug: "app-marketing-locale-page-tsx"
primary_target: "app/(marketing)/[[...locale]]/page.tsx"
related_targets: []
---

# Landing page — `/`, `/en`, `/ru`

**Scope:** the root marketing surface, its three locale URLs, and the header/footer
rail they share. Not the app shell, not the runner.

**Visitor mode:** Persuade.

**Audience & job:** someone inside an Estonian organisation who runs a recurring
survey — an annual satisfaction study, a member poll, a course evaluation — and
is deciding between connect.ee, surveer.com and us. They have never seen the
product. They are on a desk browser more often than a phone, but not always.

**Action:** create an account (sign-ups are open; PRODUCT.md records this as a
deliberate deviation from PLAN Phase 14 / DEPLOY step 22). Secondary action:
answer the real live demo survey at its own share link.

**Proof:** the product doing its job, and one live demo survey. There are no
customers, logos, testimonials, usage numbers, press, prices or certifications,
and none may be invented. Demonstration data is permitted where it is labelled
as such.

**Constraints:** no locale cookie on a public route (DECISIONS 011, 033) — the
language is a path segment, mirroring `/k/[slug]/[[...locale]]`. No new public
read path: `responses` is RLS-protected and the anon key cannot aggregate it,
so the hero's interaction resolves client-side and claims no live tally. The
page must render when the demo survey does not exist.

## Direction contract

**THESIS.** The page is a survey, and the visitor is its respondent. It refuses
the arrangement this category always ships — centred headline, two buttons, a
product screenshot floating in browser chrome — because a screenshot of a survey
tool asks to be believed, and a question asks to be answered. The visitor learns
what the product is by being on the receiving end of it for fifteen seconds,
then is shown the same fifteen seconds from the owner's side.

**OWN-WORLD.** Paper and ink, unchanged from DESIGN.md: warm paper ground
(`--background`), one ink-teal (`--primary`), Source Serif 4 for the words that
are the point and Geist for everything that is chrome, the fixed paper grain,
tinted shadows, 8/11px container radii with the runner's 10px inside its own
cards. Recognisable with all content removed by: a single 620px column of
generous runner-density cards on open paper, hairline-ruled plates, sentence-case
11px labels, and bars that are thin, directly labelled and rounded only on the
data end. Three disciplines carried from directions this one beat — one
continuous surface with no section bands (marbling bath), exactly one element
alive at a time with the teal reserved for it (crank automata), and emphasis
built from rule and row density rather than any colour the token system does not
have (moiré gallery).

**STORY.** The visitor understands, in one viewport, that this is a tool for
asking people things — because they are being asked something. They believe it
works because they just watched their own answer become a chart mark, a table
row and a CSV cell without a page reload. They believe it is *better* because
the two things neither competitor does are shown on their own answer: the same
question standing in three languages behind one link, and the same question
compared across two years by matches the owner chose. They act by taking the
open sign-up at the close, or by answering the real demo survey for real.

**FIRST VIEWPORT.** A 48px hairline rail: brand mark and wordmark left, the
three language links and a quiet sign-in right. Then open paper — no headline,
no kicker, no bar — and a single runner card centred in a 620px column, holding
the demo survey's real first question at 17px with its options as 48px rows. The
card is the only thing on the ground and the only thing in teal when touched.
Beneath it, one 12px muted line naming that this is the real runner and the
answer stays in the browser. The primary action is *answering*; the sign-up sits
at the page's close, where the visitor has earned the right to want it.

**FORM.** "Answer It Yourself" — the runner turned on the visitor. Ranked first
on my grounded list of seven; the dice dealt 3, 4, 5, so it reached the table as
IMPECCABLE'S PICK rather than as the roll, and the user locked it over the
assigned share-link spine, the folded-packet challenger and the standing exit.
Seed key **3814c6a6**, scope surface, mode persuade, code-led.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance

## Unresolved

- The production demo survey does not exist yet; the slug is configurable and
  the page degrades to a built-in question without it.
- Whether `/` should redirect a signed-in owner to `/surveys`. Currently it does
  not: the CTA points at `/login`, which the proxy already redirects to
  `/surveys` for a signed-in visitor, so one static page serves both.
