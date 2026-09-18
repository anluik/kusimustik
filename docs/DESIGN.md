# Design spec

Visual contract for Inquirdi. Claude Code follows this and does not invent values that aren't here.

Direction: **paper and ink**. Warm paper, one ink-teal accent, a serif for the words that are the point. Dense where you work, quiet and generous where someone is answering.

**Status:** complete, and re-cut in the September 2026 redesign (docs/DECISIONS.md 037). Tokens are audited by a script rather than by claim; type, spacing, components, density, states and chart rules are all specified. Screenshots in `docs/design/` are from the **previous** direction and are kept only as a record of it — **where a screenshot and this document disagree, this document wins.**

---

## 1. Tokens

`app/globals.css` is canonical. Never hardcode a colour; never add a token without adding it to both `:root` and `.dark`.

**The audit is a command, not a claim.** `node tools/token-audit.mjs` reads every `oklch()` token out of `globals.css` and checks it; `pnpm check` runs it, so a token cannot change without the audit agreeing. It enforces:

- every text pair ≥ 4.5:1, in both modes;
- non-text UI ≥ 3:1, **input borders included** — `--input` is a real 3.5:1 border, not a hairline;
- every categorical chart colour ≥ 3:1 on `--card`;
- the ordered ramp: one hue, monotone lightness, ≥ 0.06 lightness per step, and a light end that still clears 2:1 on the card;
- `--ramp-label-flip` matches where an in-bar label actually has to flip;
- every token inside sRGB. The script prints what it snapped; paste the snapped values back rather than shipping a colour the browser will clip.

The **categorical palette order is the colour-vision safety mechanism**, and it was searched rather than chosen: `--chart-1` … `--chart-5` are teal → terracotta → violet → olive → steel blue, the order picked from the 122 of 3024 candidate orders that clear every gate in both modes (worst adjacent separation ΔE 11.8 against a target of 8, under simulated protanopia and deuteranopia). Do not reorder it, and do not add a sixth — see §7.

**Radius.** `--radius: 0.5rem`. Containers are softer than what sits inside them: cards `rounded-xl` (11px), controls and rows `rounded-lg` (8px), pills `rounded-full`. Never the bare `rounded` utility — it is a hardcoded 4px that ignores the token. The respondent runner has its own radius at 10px, as a token (§8).

**Shadows are tinted, never black.** `--shadow-tint` is a warm hue per mode, and the `--shadow-*` scale is built from it. A card on paper gets `shadow-xs`; a dialog or a floating surface `shadow-sm`. A shadow is the surface in shade, so it carries the surface's warmth.

**Texture.** A fixed, non-interactive grain overlays the page (`body::after`), multiplying in light and screening in dark, to keep a large plain surface from reading as flat vector. It is suppressed under `forced-colors` and `prefers-contrast: more`.

**The surfaces the browser draws.** Selection, the caret, the scrollbar and a link's underline all ship with defaults that belong to no design system — on warm paper, the browser's stock blue selection is the one place the app reads as assembled rather than built. They are themed once, in a base layer in `app/globals.css`, so every surface inherits them: `::selection` takes `--accent` on `--accent-foreground`, which is the same pale teal that marks a chosen option, so selecting text looks like the app's own "this one" state; `caret-color` on inputs, textareas and `contenteditable` is `--primary`; scrollbars are `--input` on a transparent track, thin, declared both as `scrollbar-color`/`scrollbar-width` for Firefox and as the `-webkit-scrollbar` parts for WebKit and Blink, the thumb going to `--muted-foreground` on hover; and links carry `text-underline-offset: 0.2em` so an underline clears its descenders rather than cutting through them. Under `forced-colors` the selection falls back to `Highlight`/`HighlightText` — the user asked for exactly the colours they chose. This is app-wide, not one surface's decoration.

**Fonts.** Three faces, each with a job, all three carrying Cyrillic because Russian is a launch locale:

- **Geist** — the interface.
- **Source Serif 4** — display: survey names, page and card titles, and the figures a panel exists to show. It has an optical-size axis, so it is a text serif at 15px and a display serif at 32px from one file.
- **Geist Mono** — identifiers only: slugs, share links, emails, keys, `⌘K`. **Numbers are not mono.** Both other faces have tabular figures, which is what actually lines a column up; mono digits made every count look like a code.

Loaded via `next/font` in `lib/fonts.ts` and shared by every root layout; the token file deliberately has no `@import`.

---

## 2. Type scale

Named once, in `components/type.ts`, and imported. **There are no local copies of these strings** — a dozen files each keeping their own is how one card's label drifted to `text-xs` while its neighbour stayed at 10px. Use the constants; use the arbitrary pixel values as written if you must write one.

| Level | Constant | Value | Face | Used for |
|---|---|---|---|---|
| Display | `DISPLAY` | `text-[28px] leading-[1.15] font-semibold tracking-[-0.015em]` | **Serif** | A survey's name where it is the subject of the page: the runner's intro, a notice card, sign-in |
| Metric | `METRIC` | `text-[32px] leading-[0.95] font-semibold tabular-nums` | **Serif** | The figure a stat card exists to show |
| Title | `TITLE` | `text-[17px] leading-[1.25] font-semibold` | **Serif** | App-bar title, survey row titles, card and section headers, empty-state headings |
| Question | `QUESTION` | `text-[15px] leading-[1.4] font-medium` | Sans | Question text on the builder canvas and results cards |
| Panel head | `PANEL_HEAD` | `text-[13px] leading-[1.2] font-semibold` | Sans | Panel headers that are labels rather than names |
| Row title | `ROW_TITLE` | `text-[13px] leading-[1.25] font-medium` | Sans | Wave labels, the app bar's current item |
| Body | `BODY` | `text-[15px] leading-[1.45]` | Sans | Respondent-facing prose and option labels |
| UI | `UI` | `text-xs leading-none` (12px) | Sans | Buttons, inputs, selects, list cells, nav items |
| Meta | `META` | `text-[12px] leading-none tabular-nums` | Sans | Counts, timestamps, drop figures |
| Label | `LABEL` | `text-[11px] leading-none font-medium` muted | Sans | Column headers, section labels, stat card labels |
| Tag | `TAG` | `text-[11px] leading-none font-medium` | Sans | Status badges, question-type tags |
| Code | `CODE` | `font-mono text-[12px] leading-none` | **Mono** | Slugs, share links, emails, keys |

**Rules.**

- Weight carries emphasis, not size. A selected row stays at its size and goes to `font-medium`; it never grows.
- **The serif marks content, not chrome.** A survey's name, a question's words, a figure that is the answer to the panel's question. A button, a tab, a column header and a nav item are chrome and stay sans — a serif button is a costume.
- **Labels are sentence case.** The old all-caps mono label was the loudest thing on a quiet screen, and in Estonian and Russian it also cost the most width (§9). Nothing in the app is uppercased by CSS.
- Two weights in the interior — `font-normal` and `font-medium`. `font-semibold` belongs to the serif levels and to panel heads.
- **Respondent-facing text never goes below 14px**, and on the runner the body is 15px and questions are 17px. Owner chrome bottoms out at 11px, and only for a label or a tag.

## 3. Spacing rhythm

Base unit 4px. **On application surfaces** — the owner app, the builder, the runner — the allowed steps are 2, 4, 6, 8, 10, 12, 14, 16, 20, 24. Nothing between. The marketing register below is the one named exception, and it does not widen this ladder.

| Purpose | Value | Tailwind |
|---|---|---|
| Icon ↔ label | 6px | `gap-1.5` |
| Within a control cluster | 8px | `gap-2` |
| Between stacked rows | 1px | `gap-px` |
| Between form fields | 12px | `gap-3` |
| Panel section padding | 12px | `p-3` |
| Card padding (owner) | 16px / 14px | `px-4 py-3.5` |
| Card padding (runner) | 16px | `px-4 py-4` |
| Card padding (a card that is the whole page: sign-in, notice, 404) | 24px | `px-6 py-6` |
| Grid gutter between panels | 12px | `gap-3` |
| Page padding (owner) | 16px | `p-4` |
| Page padding (runner) | 16px / 24px | `px-4 py-6` |

A dense table is `table-fixed` (§5) and its columns are narrower below `sm`: the response count and the row actions both stay on a 380px screen. Dense table column gutters are 10–12px. Horizontal padding on a list row is 12px; on a nested wave row, 8px plus a 12px indent from a `border-l` rule.

**Never use vertical margin to separate siblings** — use flex/grid `gap`. Scroll-list rows use `gap-px` and rely on `hover:bg-muted` for separation.

**The marketing register is coarser, and it is an exception, not an extension.** The landing page (§12) is read at arm's length by someone who has not decided to be here yet, not worked in at a desk, and the 2–24px ladder makes a page like that read as a cramped panel. It runs on its own intervals — 24, 32, 48, 56, 64, 80, 96px — and they are used only there:

| Purpose | Value | Tailwind |
|---|---|---|
| Between the page's sections | 96px | `gap-24` |
| Between the question card and the owner's column | 64px | `gap-16` |
| Page padding, top / bottom | 56px → 80px at `sm` / 64px | `pt-14 sm:pt-20 pb-16` |
| Section rule to its content | 32px | `pt-8` |
| The closing section's rule to its content | 48px | `pt-12` |
| The footer's rule to its content | 24px | `pt-6` |
| Words ↔ evidence gutter | 24px → 48px at `lg` | `gap-6 lg:gap-12` |
| Marketing column cap | 1100px | `max-w-[1100px]` |

Nothing in `app/`, `components/builder/`, `components/runner/` or `components/results/` reaches for these. A dense workspace that starts spacing at 32px has stopped being dense.

**Width is capped.** Owner pages are held to `PAGE_WIDTH` (1280px, `components/shell/page-width.ts`); the builder is exempt, being a three-panel workspace. A **plot** is capped at 720px on top of that (§7) and the runner's column at 620px: a bar that runs a metre across a wide monitor is harder to compare than one that does not, and prose past ~70 characters is harder to read.

---

## 4. Density: builder vs runner

Two different jobs, two different densities. **Do not average them.**

### Owner surfaces — dense, mouse and keyboard

```
app bar           48      option row         36
tab row           36      survey list row    52   (two lines)
panel header      34      wave row           46
list row          32      gutters            12
control           30      panels    268 / fluid / 340
radius       8 / 11       type            11–17
```

- Hit targets may go to 28px. Rows are 32px with 12px padding.
- Hover is `bg-muted` (list) or `bg-sidebar-accent` (nav), and it **transitions over 150ms, colour only** — nothing moves on hover. Selection adds a 2px inset primary rule, so hover never obscures which row is selected.
- Press feedback is the button primitive's own 1px nudge. Nothing scales.
- Focus is `ring-[3px] ring-ring/18` plus `border-primary`. **Never remove the ring for aesthetics.**
- Truncate with ellipsis. Do not wrap in a dense row.

### Respondent runner — generous, thumb-first, 380px baseline

```
header            48      option gap          8
progress bar       3      card gap           14
card padding      16      page padding   16 / 24
question    17px / 1.35   radius             10
body        15px / 1.45   column            620
option row  min-h 48      sticky footer  action min-h 48
```

- Every tap target ≥ 44px; ≥ 48px in practice.
- **The survey's name is set in the display serif at the top of the page**, above the description and the language picker's row — not only in the pinned header, which is 48px of chrome carrying a truncated copy and a count. A name that only ever appears truncated in a bar is not a title.
- One question group per card, one column, no side-by-side controls. Cards are `--survey-radius`, a hairline, and `shadow-xs` on paper.
- Progress and the primary action are pinned. The respondent never hunts for "next".
- Options and scale steps darken on press (`active:bg-muted`) as well as on hover: hover does not exist on the device most of them are using.
- **The language picker is the first thing in the page, above the description.** A row of equal-width links, one per language the survey is offered in, each at least 44px tall and named in its own language ("Eesti keel", "English", "Русский"). The one being read carries the selected-option treatment below *plus* a tick, because the person who needs this control cannot read the page it is on. Nothing is rendered at all for a survey offered in one language. See docs/DECISIONS.md 033.
- Selected option: `border-[1.5px] border-survey-primary bg-survey-accent text-survey-accent-foreground` plus a filled control. **Colour alone never carries state.**
- Text wrapping is deliberate here: `text-pretty` on prose and option labels, `text-balance` on the survey's name and a notice's heading. A single word alone on the last line of a question is avoidable and looks like a bug.

---

## 5. Component map

Every element resolves to an existing shadcn primitive. `components/ui/` is generated — never hand-edit it, re-run the CLI. If a design appears to need a primitive shadcn doesn't have, stop and ask.

### App shell

| Element | Primitive |
|---|---|
| Left navigation, collapse | `Sidebar` + `SidebarProvider`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem` |
| Workspace header | `SidebarHeader`, 48px, `BrandMark` + the product name in `TITLE`. `components/shell/brand-mark.tsx` is the one drawn asset in the app (§11); `app/icon.svg` is the same mark with the tokens resolved |
| Nav item, active | `SidebarMenuButton isActive` → `bg-sidebar-accent text-sidebar-accent-foreground` + `shadow-[inset_2px_0_0_var(--primary)]` |
| Nav item, disabled (Templates) | `SidebarMenuButton disabled` + `Badge variant="outline"` reading the "coming soon" string |
| Nav item count | `SidebarMenuBadge` |
| Recents list | `SidebarGroup` + `SidebarGroupLabel` |
| Language switcher | `Tabs` + `TabsList`/`TabsTrigger`, `h-7`, `LABEL` |
| User menu | `SidebarFooter` + `DropdownMenu` |
| Collapse trigger | `SidebarTrigger` |
| Top bar title + count | plain `h1` in `TITLE` (the serif) + a `META` span, no primitive |
| Search | `Input`, `h-[30px]` |
| Status filter | `Select`, `h-[30px]` |
| Primary action | `Button` default, `h-[30px] text-xs` |

### Survey list

| Element | Primitive |
|---|---|
| List container | `Table` with **`table-fixed`**, or a `div` grid if virtualising — keep the same column template either way. Fixed layout is not cosmetic: under auto layout a cell's content is its own minimum (`truncate` inside it does not let it shrink), so a long survey name held the first column open and pushed the response count and the row actions off the right edge of a phone. Every column but the first declares its width; the first takes the rest and truncates |
| Column header row | `TableHeader` / `TableHead`, `h-[30px]`, `bg-muted`, `LABEL` (sentence case) |
| Row | `TableRow`, 52px, `transition-colors hover:bg-muted`; the title is `TITLE` at 15px, the way into the builder |
| Status badge | `Badge`, `rounded-full`, `TAG` — draft `secondary`, published restyled to `bg-accent text-accent-foreground` + primary dot, closed `outline` |
| Wave-group marker | `Badge`, accent fill |
| Share link | `Input readOnly` styled flat and transparent, `CODE`, filling to `bg-muted` on hover or focus + `Button variant="outline" size="xs"`; on click swap the label for 2s. **No toast.** |
| Group expand/collapse | `Collapsible` + `CollapsibleTrigger` on the caret cell, `CollapsibleContent` holding wave rows |
| Compare waves | `Button variant="outline" size="sm"` |
| Row actions | `DropdownMenu` + `DropdownMenuItem`, `DropdownMenuSeparator`; delete gets `text-destructive` |
| Rename | `DropdownMenuItem` opening a `Dialog` with one `Input` |
| Delete | `AlertDialog`, destructive confirm |
| Close survey | `AlertDialog` — irreversible, so it confirms |
| Row hairlines | `Separator` **or** `border-b`, never both |

One actions menu component serves both row kinds. Only the first item's wording changes — "duplicate" on a standalone survey, "new wave" on a wave group. "Close survey" is disabled when already closed rather than hidden.

### Builder

| Element | Primitive |
|---|---|
| Left element list | `Sidebar` (secondary variant), rows as `Button variant="ghost"` |
| Section headers | `SidebarGroupLabel` |
| Drag / reorder | `dnd-kit`. The handle is the affordance; the whole row is the click target |
| Drop indicator | 2px `bg-primary` rule + 5px dot. No row-displacement animation |
| Tabs | `Tabs`, underline via `shadow-[inset_0_-2px_0_var(--primary)]` |
| Logic rule count on a tab | `Badge variant="secondary"` |
| Canvas question card | `Card`; selected gets `border-primary` + `ring-[3px] ring-ring/18` |
| Selected-card label | absolutely positioned `Badge`, primary fill |
| Right editor panel | `Sheet` on narrow viewports, static `aside` at ≥ 1280px |
| Type picker | `Select` |
| Question / help fields | `Input`, `Textarea` |
| Character counter | `META` span, `text-muted-foreground`; 14px on the runner, which may not go below it |
| Option rows | `Input` + drag handle + remove `Button variant="ghost" size="icon"` |
| Toggles | `Switch` |
| Logic rule preview | `Card` with `bg-muted`, `CODE` |
| Duplicate / delete in panel header | `Button variant="ghost" size="sm"` |
| Autosave indicator | plain dot + `META` text in the app bar. **Not a `Toast`, not a canvas spinner.** |
| Command palette (⌘K) | `Command` / `CommandDialog` |

### Wave comparisons

Three surfaces, all owner-side and dense (§4). Waves are always named `waveLabel`, falling back to the wave's creation date — never the survey title, which is usually the same for every wave.

**The group's comparison list** (`/waves/[waveGroupId]`), reached from the survey list's compare control.

| Element | Primitive |
|---|---|
| List | `Table`, the survey list's header and row geometry; columns: name, waves (`META`, `2025 · 2026 · 2027`), updated, actions |
| Row actions | `DropdownMenu` — open, edit matches, rename (`Dialog` with one `Input`), delete (`AlertDialog`, destructive) |
| New comparison | `Button` default in the app bar; disabled with a `Tooltip` when the group has one wave |
| Empty, one wave | §6 empty state: "a comparison needs a second wave", action back to the survey list |
| Empty, two or more waves | §6 empty state; primary action **Compare all waves** (creates a comparison of the newest five, with suggestions), secondary **New comparison** |

**New comparison** — a `Dialog`. One `Input` for the name, prefilled `oldest – newest` of the chosen waves and following the choice until the owner types in it. The waves are a list of rows, each a `Label` + `Switch`, newest first; the newest five start on. The submit is disabled below two and above five, and the footer says which (`text-input`, not a toast).

**The matching editor** (`/comparisons/[comparisonId]/matches`).

| Element | Primitive |
|---|---|
| App bar | the comparison's name; autosave indicator exactly as the builder's (§6 error state included); **Done** `Button` default back to the result |
| Toolbar | `Button variant="outline" size="sm"`: *Suggest matches*, *Add wave* (`DropdownMenu` of the group's remaining waves; disabled at five or when every wave is compared, the reason in a `Tooltip`); `Switch` *Only incomplete* |
| Wave header | one column per wave, oldest left, a `--chart-n` swatch as in the result legend, and a ghost icon `Button` to remove the wave (`AlertDialog`: its matches go with it) |
| Row | a `Card` per row; one `Select` per wave, `h-[30px]`, listing that wave's questions as `N. title` with a `TAG` type tag. Nothing chosen shows the placeholder *Not in this wave*; it is not an option. A ghost icon `Button` beside a filled select clears it. A question already used in another row is still listed and says so; choosing it moves it. A question the row's rules refuse is a disabled item, with no explanation |
| Remove row | ghost icon `Button` |
| Add row | a trailing `Button variant="outline"` |
| Narrow viewport | a row stacks its `Select`s, each captioned with its wave's name |

**The result** (`/comparisons/[comparisonId]`) is Phase 11's screen: the legend, then a card per row. A wave that has no question in the row is a sentence on the card, as absent waves were; a question removed from its wave is captioned *removed in <wave>* and still charted. **No key badge**, and no review state: a suggested row is a row like any other.

### Results — behaviour tab

| Element | Primitive |
|---|---|
| Sub-tabs | `Tabs`, pill style on `bg-muted` |
| Stat cards | `Card`, header and content collapsed into one padded stack |
| Delta | `META`; `text-foreground` improving, `text-destructive` worsening. Arrow glyph, no coloured chip |
| **Funnel** | **Not Recharts.** CSS grid per stage with a `div` bar — 15 rows of horizontal bars need direct labelling and a flag column that Recharts fights |
| Funnel flag | 2px `bg-destructive` mark in the row gutter + `Badge variant="outline"` in destructive |
| Problem-question callout | `Alert` with `bg-muted` and `shadow-[inset_3px_0_0_var(--destructive)]`, one `Button variant="outline"` jumping to the editor |
| Median time per question | Recharts `BarChart layout="vertical"` via `ChartContainer` / `ChartTooltip` |
| **Device mix** | Single stacked `div` bar + legend rows. **Three values do not justify a chart component** |
| Empty-state actions | `Button` default + `Button variant="outline"` |
| Ramp legend | inline swatch spans, 16×10px, each with `border` |

---

## 6. States

Every panel defines all four. None of them is a spinner over the whole page.

**Empty.** A muted skeleton of the shape that will appear (funnel bars in `--ramp-track` with `border`), then a `TITLE` line naming what's missing, a 13px muted sentence explaining what unblocks it, then one primary and one secondary action. **Never an illustration.** Panels with a volume threshold say so explicitly ("needs at least 20 responses").

**Loading.** `Skeleton` blocks matching final geometry — same heights, same column widths, so nothing reflows on arrival. Rows keep their 32px height. No spinner in a panel whose shape is known. A spinner is acceptable only inside a `Button` that was just pressed.

**Error.** Text-first and local to what failed. Autosave failure: destructive dot + message + underlined retry in the app bar. Panel failure: `Alert variant="destructive"` inside the panel with a retry action, surrounding data left on screen. **Never a full-page error for a partial failure. Never a toast for something the user must act on.**

**Disabled.** `--input` for the text, and a `--muted` fill where the enabled control was filled. **No opacity dimming**; opacity stacking breaks the audited contrast. This is **not** applied per call site: one unlayered block at the end of `app/globals.css` overrides the generated primitives by `data-slot`, and a new primitive with an opacity-dimmed disabled state gets its slot added there. See docs/DECISIONS.md 036. An item that will exist later carries a "coming soon" outline badge. An item that's contextually unavailable stays in the menu rather than disappearing, so menu shape is stable.

**Offline.** Hollow dot + queued-changes count in the app bar. Queue, don't block.

---

## 7. Chart colour assignment

These rules follow from the token audit, not from taste. Run `pnpm audit:tokens` after touching any of them.

**Categorical — unordered, 5 or fewer.** `--chart-1` … `--chart-5`, in the order the search settled on (§1), no skipping. Maximum five, and there is no sixth token to reach for: `--chart-6/7/8` were deleted in the redesign.

**Six or more series — change the encoding, not the palette.** Horizontal bars, sorted descending, one per category, each directly labelled with name and value. Single fill: `--chart-1`. Never a sixth colour. **Never a pie or donut, at any count.**

**More than 8 options on one question.** Rank descending, show the top 7, aggregate the remainder into a final "other (n)" bar in `--muted` with a `--border` stroke. The aggregate always sorts last regardless of size, and its tooltip lists what it contains. If the owner needs all 14 options, that's the table view, not the chart.

**Ordered data — always the ramp.** Opinion scale, NPS, Likert, matrix intensity, funnel stages: `--ramp-1` … `--ramp-7`, never the categorical palette. Two hard requirements:

1. Every ramp fill carries `border: 1px solid var(--border)`. The ramp's light end now clears 2:1 on the card on its own, but the stroke is what keeps a single low bar readable against a card *and* against the muted track behind it.
2. Value labels on the fill flip from `--foreground` to `--background` at **step 4 light, step 3 dark**. Read `--ramp-label-flip` — do not hardcode it; the audit checks that the token matches where the flip actually has to happen.

**More ordered stages than ramp steps.** Bin monotonically onto the 7 steps, front to back. The 15-stage funnel bins two per step: `[1,1,2,2,3,3,4,4,5,5,6,6,7,7,7]`. **The ramp encodes position in the sequence, not health** — a stage is never recoloured for performing badly. Problem stages are flagged in the row chrome (destructive gutter mark, destructive drop figure, outline badge), which keeps the colour channel honest and the flag readable for colour-blind users.

**Single-series comparison.** `--chart-1` alone. Emphasise the notable value with weight and a 1px `--foreground` outline, never a second hue.

**Bar direction.** Categorical bars are horizontal whenever labels are words. Vertical bars with rotated labels are not acceptable. Time series may be vertical.

**Marks.** Thin marks, not slabs: a horizontal bar caps at 18px (14px per series when waves are grouped), a vertical one at 40–56px. The **data end is rounded 4px and the baseline end is square**, so which corners are rounded follows the direction the bar grows. Segments of a stacked bar are separated by a 2px gap in the surface colour, never by a hairline rule — a rule between two fills reads as a third fill. A plot is capped at 720px wide (§3). Legend swatches are dots, not bordered rectangles.

**Implementation.**

- Compute bar widths with a dot decimal (`toFixed(1)`). Locale formatting is for display strings only — `width: '39,6%'` is invalid CSS and is silently dropped. This bug is invisible in review and obvious in production.
- Display numbers use Estonian formatting: comma decimal, thin-space thousands (`1 284`, `76,9%`). Percentage-point deltas are labelled `pp`, not `%`.
- Give every ramp bar a `min-width` large enough for its in-bar label, or move the label outside the fill below that width.
- Recharts colours come from CSS variables via `ChartContainer`'s config, never hex literals.

---

## 8. Runner theming namespace

Owner-customisable survey branding is post-MVP, but it constrains the runner now.

The runner reads its colours **and its radius** from its own namespace (`--survey-*`), defaulting to the app tokens:

```css
--survey-radius: 0.625rem;  /* the 10px runner radius from §4 */
--survey-primary: var(--primary);
--survey-background: var(--background);
--survey-card: var(--card);
--survey-accent: var(--accent);
--survey-accent-foreground: var(--accent-foreground);
```

Owner branding later overrides this namespace only. If runner components consume `--primary` directly, adding branding means touching every one of them. Cheap now, expensive later.

This is also the cleanest home for the runner's radius exception — it becomes a token rather than a magic number scattered through components. The builder's canvas cards use `rounded-survey` too: that canvas is a preview of the runner, so it takes the runner's radius, not the owner app's.

---

## 9. Copy and locale

Estonian is primary; EN and RU ship at launch. **Assume 30–40% string expansion from English and never size a control to its label.**

Owner-facing microcopy is plain and factual. Dates and numbers follow Estonian conventions (`12. jaan 2026`, `1 284`, `76,9%`).

**All strings shown in this spec are `et.json` values, not literals.** Every one goes through next-intl with a key, present in all three message files — see the CLAUDE.md non-negotiable. A hardcoded Estonian string is the same bug as a hardcoded English one.

Use `Intl.NumberFormat('et-EE')` and `Intl.DateTimeFormat('et-EE')` rather than hand-rolled formatting, and remember the §7 warning: never feed a locale-formatted number into a CSS value.

---

## 10. Accessibility floor

- Body text ≥ 4.5:1; large text and non-text UI ≥ 3:1, **input borders included** — respondents fill forms on phones in daylight.
- Colour is never the only encoding. Charts get labels; status gets text alongside badge colour; validation gets a message, not just a red border; funnel problems get chrome flags, not a recolour.
- Every interactive element is keyboard reachable with a visible `--ring` focus state. Never remove the ring.
- Disabled states use the `--input` token, not opacity — see §6.
- The runner is the priority surface. Owners can be asked to use a modern browser; respondents cannot be asked anything.

---

## 11. Reconciliation notes

Points where this spec overrode an earlier decision. Recorded so nobody "fixes" them back.

1. **`--chart-6/7/8` are gone.** They were frozen and unused; the redesign deleted them. `lib/results/chart-data.test.ts` asserts that nothing reaches for them. Do not re-add one to dodge the five-colour cap; change the encoding instead (§7).
2. **Two panels are deliberately not Recharts.** The funnel and the device-mix bar are hand-built CSS. This is an exception to the otherwise absolute "charts are Recharts" rule, made because 15 directly-labelled rows with a flag column fight the library. Do not migrate them.
3. **The provisional type scale is gone.** §2 replaces the placeholder that existed before the design sessions. The arbitrary pixel values are intentional.

6. **Mono is no longer the "data" face, and nothing is uppercased.** The previous direction set every count, label and badge in uppercase mono, which is what made the app read as a terminal. Numbers take tabular figures in the sans or the serif; mono is reserved for identifiers (§2). Sentence-case copy is already in the catalogues — no message needed changing.
7. **The bare `rounded` utility is banned.** It is a hardcoded 4px that silently ignores `--radius`; the redesign replaced 263 uses of it. Use `rounded-lg`, `rounded-xl`, `rounded-survey` or `rounded-full`.
8. **The old screenshots in `docs/design/` are a record, not a reference.** They show the pre-redesign direction. Nothing should be matched to them.
4. **The runner's radius is a token, not an override.** Implemented as `--survey-radius` (§8) rather than a one-off class.
5. **Disabled uses colour, not opacity.** Standard shadcn dims with opacity; that stacks and breaks audited contrast, so it's overridden here.
---

## 12. The landing page

The product's front door, at `/`, `/en` and `/ru` — one file under `app/(marketing)/[[...locale]]/`, its own root layout, its own message catalogue. The architecture is docs/DECISIONS.md 038 and is not restated here; what follows is the visual contract, and it applies to anything added to this surface later.

**The page is a survey.** The visitor is handed one real single-choice question in the runner's own card, and the moment they answer it the same answer is shown back from the owner's side: a bar marked as theirs in a chart, and a row of their own at the top of a list of recent answers. Nothing is submitted, stored or sent: the answer is component state and the copy says so. The page argues by running the product on the reader, so every visual decision below exists to keep that demonstration legible rather than to decorate it.

**Two densities meet here, and that is the argument.** §4 says the owner's density and the runner's are two answers to two jobs and **must not be averaged**. This is the one surface where both appear at once, and they are *juxtaposed* rather than blended: the question card is runner density exactly — `--survey-*` tokens, `rounded-survey`, `bg-survey-card`, a hairline, `shadow-xs`, 17px question, 15px option labels, 48px option rows, the runner's own `OptionRow` component rather than a copy of it — and the plates that receive the answer are owner density exactly: `bg-card`, `rounded-xl`, `px-4 py-3.5`, an 11px sentence-case `LABEL` header, 12–13px figures on tabular numerals. Neither moves toward the other. A visitor who later signs in should recognise both halves of what they were shown, which only works if each half is the real thing. **Do not invent a middle density for this page**; if a new block belongs to the respondent it takes the runner's tokens, and if it belongs to the owner it takes the card's.

**Composition: one column, one sheet of paper.** The whole page is a single 1100px column. The question card is centred in what is left of the first screen (`min-h-[calc(100svh-9rem)]`, capped at the runner's own 620px) so the owner's side begins *below* the fold — showing an empty results panel in the first viewport would spend the reveal before the visitor had done anything, and the largest shape on the page would be a chart of nothing. `svh`, not `vh`: a phone's toolbars are part of the first screen and `vh` lies about them. Below that, every section is a two-column spine — the words on the left (`SectionHead`: a serif heading at `DISPLAY`, capped at 24 characters and balanced, plus one 15px muted line capped at 52 characters), the evidence on the right (a `Plate`, capped at the §3 plot width of 720px) — collapsing to one column below `lg`. Sections are separated by a `border-t` hairline and the §3 marketing rhythm and by nothing else. **No section is a coloured band, and there is no full-bleed anything**; the paper field with its §1 grain runs edge to edge under the entire page, and the rule plus the rhythm is what makes a section a section. Four centred heading-and-subhead blocks stacked down a page is the arrangement this category always ships and it reads as a brochure; a rule that runs the full column with a heading that starts where every other line starts reads as a document, which is what this product makes.

**Heading order follows the page, not the layout.** The document's single `<h1>` is a plain statement of what the product does, set in the display serif at 20px, under the card and separated from it by a hairline. The demo question is an `<h2>` inside the card. A demo question is the loudest thing on the first screen and is still not what the page is about — it is an instrument, and naming it the page's title would tell a screen reader and a search engine that the product is one satisfaction survey. Section headings below are `<h2>`, plate labels `<h3>`.

**One authored moment of motion, and nothing else.** A bar grows on `width` only — 620ms, `cubic-bezier(0.16, 1, 0.3, 1)`, under `motion-safe:` — when the answer lands. Separately, the owner's column is scrolled into view **once**, on the first answer, with `scrollIntoView({ behavior: "smooth", block: "start" })`, which honours `prefers-reduced-motion` itself; a visitor changing their mind is not asking to be moved again, so it never fires twice. Nothing scrolls on its own, nothing fades in on scroll, nothing parallaxes, nothing counts up. This is §4's "nothing moves on hover" carried onto a marketing surface: the page has one thing to show happening, and everything else holding still is what makes it visible.

**Demonstration data is labelled, and it has to add up.** PRODUCT.md forbids inventing customers, logos, testimonials, usage figures, press and prices, and the landing page invents none. Two plates carry figures that are not the visitor's own, and both wear a *Näidisandmed* / *Demonstration data* / *Демонстрационные данные* note in the plate header, in every locale — the header's `aside` slot, muted, 12px. Two further rules hold for anything added later:

1. **Demonstration figures agree arithmetically across the page.** The waves plate's 2026 figure (71,3%) is the top two steps of the scale plate's distribution (32,0 + 39,3); both plates title the same question, so a reader who adds the bars up is entitled to get that number. The two once disagreed by 3,6pp, which is a defect a reader can find.
2. **A plate that shows a derived figure names its metric.** The waves plate's label is the question *and* what is being counted — "rahul (4–5)" — because "71,3%" of an opinion scale is meaningless without it.

Charts here take §7 unchanged and without exception: ordered data gets the ramp through the shared `rampFill`/`rampStep` helpers with the mandatory 1px stroke, a single series gets `--chart-1`, two waves get `--chart-1` and `--chart-2` with dot swatches, bars are horizontal and thin (14px, under the 18px cap), the data end is rounded and the baseline end square, widths come from the results surface's own `barWidth` with its dot decimal, and figures are Estonian-formatted regardless of the page's language. Labels sit outside the fill on this page rather than inside it: §7 permits either, and these fills spend most of their life at 0%, where a label that has to move out of the bar below some width is a rule with a seam in it.

**Both plates open on a survey that has been running, not on an empty panel.** The built-in question carries illustrative counts and three illustrative recent answers, so the chart shows a real distribution and the list shows rows before the visitor has done anything. Answering adds one: the count ticks up, every share is recomputed, and the visitor's row appears at the top of the list. This is deliberate and it replaced a genuinely empty first state, because a chart of five zeroes and a table of dashes is the weakest object a page can put in front of a reader, and one response against a count of one is not a result.

Three rules hold it honest, and any figure added to this surface later inherits them:

1. **Illustrative figures are labelled where they are, not at the edge of the card.** A plate whose numbers were not produced by the reader carries the *demonstration data* tag beside its own name (§12's `Plate` `note` slot). The sentence under the question card says the same thing in words.
2. **The visitor's own figure is the one real number on the plate**, so the baseline stays small enough that adding one moves it. A baseline in the thousands would make the only true value invisible.
3. **Nothing illustrative is ever attached to a real survey's question.** When the page is running on a published survey rather than its built-in question, both plates drop the counts, the rows and the tag, and the list falls back to the dash-per-cell empty state in `--input`, the disabled token, never dimmed (§6). Hanging invented counts on somebody's actual question is the one thing this page may not do.

The list is named *recent answers* rather than *answers* for the same reason: four rows under a heading that promises all of them is a panel that looks broken, and a survey's owner reads a recent-answers list on the results surface too.

**It degrades to a built-in question.** The question is read from a real published survey through the runner's own loader, named by `NEXT_PUBLIC_DEMO_SURVEY_SLUG`. When that is unset, or the survey is closed, missing, or has no single-choice question, the page falls back to a built-in question — the same component, the same card, the same two plates, and the secondary "answer a real one" action disappears rather than pointing at nothing. The fallback is the current behaviour in every environment. Nothing about the page's composition changes between the two; the only visible difference is one absent button.

**Chrome is one 48px rail.** A hairline under the mark, the three language endonyms as links to distinct URLs (`Eesti`, `English`, `Русский`, the same three strings in every catalogue, as the runner's picker does — §4), and a sign-in link. On a phone it wraps to two rows from `sm` down rather than truncating, because the thing that loses a truncation contest is always the product's own name. The footer repeats the mark, the languages and the way in, and carries the appearance control: light, dark or system, as three quiet text buttons rather than a filled tab list, because a preference is not a destination and nobody arrives wanting it. The page's primary action is a 48px `--primary` link at the end, not at the top: by then the visitor has answered a question and seen it land two ways.
