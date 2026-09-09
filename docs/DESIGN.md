# Design spec

Visual contract for Register. Claude Code follows this and does not invent values that aren't here.

Direction 1c: calm, dense, professional. Dense where you work, quiet everywhere else.

**Status:** complete. Tokens locked and audited; type, spacing, components, density, states and chart rules all specified. Screenshots in `docs/design/` are reference only — **where a screenshot and this document disagree, this document wins.**

---

## 1. Tokens

`app/globals.css` is canonical. Never hardcode a colour; never add a token without adding it to both `:root` and `.dark`.

Values were contrast-audited before being committed. Do not regenerate, round, or substitute them. If a change is needed, re-run the audit and record the result in `docs/DECISIONS.md`.

Audit baseline, both modes: all text pairs ≥ 4.5:1; `--muted-foreground` 5.89:1 on `--background`; every chart colour ≥ 3:1 on `--card`; worst chart pair separation dE 0.139 normal / 0.111 deuteranopia (light), 0.150 / 0.119 (dark).

Both themes ship. Every screen is checked in `.dark` before it's considered done.

**Radius.** `--radius: 0.25rem` → `rounded` (4px) everywhere in the app. The respondent runner is the single exception at 6px — see §4 and §8.

**Fonts.** IBM Plex Sans for UI, IBM Plex Mono for numbers, codes, metadata and labels. Loaded via `next/font`; the token file deliberately has no `@import`.

---

## 2. Type scale

The scale is denser than Tailwind's defaults. **Use the arbitrary values as written** — do not round `text-[13px]` to `text-sm`.

| Level | Tailwind | Font | Used for |
|---|---|---|---|
| Metric | `text-[26px] leading-none font-semibold tracking-[-0.02em]` | Sans | Stat card figures |
| Title | `text-[17px] leading-[1.3] font-semibold` | Sans | Survey title on runner intro card |
| Question | `text-[15px] leading-[1.4] font-medium` | Sans | Question text, runner and builder canvas |
| Panel head | `text-[13px] leading-[1.2] font-semibold` | Sans | Card and panel headers |
| Row title | `text-[13px] leading-[1.2] font-medium` | Sans | Survey list rows, app bar current item |
| Body | `text-[14px] leading-[1.35]` | Sans | Runner option labels, respondent-facing prose |
| UI | `text-xs leading-none` (12px) | Sans | Buttons, inputs, selects, list cells, nav items |
| Meta | `text-[11px] leading-none` | **Mono** | Counts, timestamps, share links, drop figures |
| Label | `text-[10px] leading-none tracking-[0.07em] uppercase` | **Mono** | Column headers, section labels, stat card labels |
| Tag | `text-[9px] leading-none tracking-[0.04em] uppercase` | **Mono** | Status badges, question-type tags |

**Rules.**

- Weight carries emphasis, not size. A selected row stays 12px and goes to `font-medium`; it never grows.
- Anything countable, ordered or machine-ish is Mono: response counts, percentages, durations, question keys (`q3_source`), share links, version tags, `⌘K`.
- Two weights in the interior only — `font-normal` and `font-medium`. `font-semibold` is reserved for panel heads and metrics.
- **Respondent-facing text never goes below 14px.** Owner chrome may reach 9px, but only for Mono tags.

---

## 3. Spacing rhythm

Base unit 4px. Allowed steps: 2, 4, 6, 8, 10, 12, 14, 16, 20. Nothing between, nothing above 20 inside a panel.

| Purpose | Value | Tailwind |
|---|---|---|
| Icon ↔ label | 6–7px | `gap-1.5` |
| Within a control cluster | 8px | `gap-2` |
| Between stacked rows | 1px | `gap-px` |
| Between form fields | 10px | `gap-2.5` |
| Panel section padding | 12px | `p-3` |
| Card padding (owner) | 12–14px | `px-3.5 py-3` |
| Card padding (runner) | 16px / 14px | `px-3.5 py-4` |
| Grid gutter between panels | 12px | `gap-3` |
| Page padding | 16px | `p-4` |

Dense table column gutters are 10–12px. Horizontal padding on a list row is 12px; on a nested wave row, 8px plus a 12px indent from a `border-l` rule.

**Never use vertical margin to separate siblings** — use flex/grid `gap`. Scroll-list rows use `gap-px` and rely on `hover:bg-muted` for separation.

---

## 4. Density: builder vs runner

Two different jobs, two different densities. **Do not average them.**

### Owner surfaces — dense, mouse and keyboard

```
app bar           44      option row         36
tab row           36      survey list row    46   (two lines)
panel header      34      wave row           42
list row          32      gutters            12
control           30      panels    268 / fluid / 340
radius             4      type            10–13
```

- Hit targets may go to 28px. Rows are 32px with 12px padding.
- Hover is `bg-muted` (list) or `bg-sidebar-accent` (nav). Selection adds a 2px inset primary rule, so hover never obscures which row is selected.
- Focus is `ring-[3px] ring-ring/18` plus `border-primary`. **Never remove the ring for aesthetics.**
- Truncate with ellipsis. Do not wrap in a dense row.

### Respondent runner — generous, thumb-first, 380px baseline

```
header            52      option gap          8
progress bar       3      card gap           12
card padding  16 / 14     page padding       14
question    15px / 1.4    radius              6
option row  min-h 48      sticky footer  action min-h 48
```

- Every tap target ≥ 44px; ≥ 48px in practice.
- One question group per card, one column, no side-by-side controls.
- Progress and the primary action are pinned. The respondent never hunts for "next".
- **The language picker is the first thing in the page, above the description.** A row of equal-width links, one per language the survey is offered in, each at least 44px tall and named in its own language ("Eesti keel", "English", "Русский"). The one being read carries the selected-option treatment below *plus* a tick, because the person who needs this control cannot read the page it is on. Nothing is rendered at all for a survey offered in one language. The header is not the place for it: it is 52px with a title and a count in it already. See docs/DECISIONS.md 033.
- Selected option: `border-[1.5px] border-primary bg-accent text-accent-foreground` plus a filled control. **Colour alone never carries state.**
- Radius steps 4 → 6 and type steps up one level. This is the only place the app's density rules relax, and it is deliberate.

---

## 5. Component map

Every element resolves to an existing shadcn primitive. `components/ui/` is generated — never hand-edit it, re-run the CLI. If a design appears to need a primitive shadcn doesn't have, stop and ask.

### App shell

| Element | Primitive |
|---|---|
| Left navigation, collapse | `Sidebar` + `SidebarProvider`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem` |
| Workspace header | `SidebarHeader` wrapping a `DropdownMenu` trigger |
| Nav item, active | `SidebarMenuButton isActive` → `bg-sidebar-accent text-sidebar-accent-foreground` + `shadow-[inset_2px_0_0_var(--primary)]` |
| Nav item, disabled (Templates) | `SidebarMenuButton disabled` + `Badge variant="outline"` reading the "coming soon" string |
| Nav item count | `SidebarMenuBadge` |
| Recents list | `SidebarGroup` + `SidebarGroupLabel` |
| Language switcher | `Tabs` + `TabsList`/`TabsTrigger`, `h-7`, Mono 10px |
| User menu | `SidebarFooter` + `DropdownMenu` |
| Collapse trigger | `SidebarTrigger` |
| Top bar title + count | plain `h2` + Mono span, no primitive |
| Search | `Input`, `h-[30px]` |
| Status filter | `Select`, `h-[30px]` |
| Primary action | `Button` default, `h-[30px] text-xs` |

### Survey list

| Element | Primitive |
|---|---|
| List container | `Table`, or a `div` grid if virtualising — keep the same column template either way |
| Column header row | `TableHeader` / `TableHead`, `h-[30px]`, `bg-muted` |
| Row | `TableRow` with `hover:bg-muted` |
| Status badge | `Badge` — draft `secondary`, published `default` restyled to `bg-accent text-accent-foreground` + primary dot, closed `outline` |
| Wave-group marker | `Badge`, accent fill |
| Share link | `Input readOnly` styled flat (`bg-muted`, Mono 11px) + `Button variant="outline" size="sm"`; on click swap the label for 2s. **No toast.** |
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
| Character counter | Mono 9px span, `text-muted-foreground` |
| Option rows | `Input` + drag handle + remove `Button variant="ghost" size="icon"` |
| Toggles | `Switch` |
| Question key chip | `Badge variant="secondary"`, Mono |
| Logic rule preview | `Card` with `bg-muted`, Mono 11px |
| Duplicate / delete in panel header | `Button variant="ghost" size="sm"` |
| Autosave indicator | plain dot + Mono text in the app bar. **Not a `Toast`, not a canvas spinner.** |
| Command palette (⌘K) | `Command` / `CommandDialog` |

### Results — behaviour tab

| Element | Primitive |
|---|---|
| Sub-tabs | `Tabs`, pill style on `bg-muted` |
| Stat cards | `Card`, header and content collapsed into one padded stack |
| Delta | Mono 11px; `text-foreground` improving, `text-destructive` worsening. Arrow glyph, no coloured chip |
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

**Empty.** A muted skeleton of the shape that will appear (funnel bars in `--ramp-track` with `border`), then a 14px semibold line naming what's missing, a 12px muted sentence explaining what unblocks it, then one primary and one secondary action. **Never an illustration.** Panels with a volume threshold say so explicitly ("needs at least 20 responses").

**Loading.** `Skeleton` blocks matching final geometry — same heights, same column widths, so nothing reflows on arrival. Rows keep their 32px height. No spinner in a panel whose shape is known. A spinner is acceptable only inside a `Button` that was just pressed.

**Error.** Text-first and local to what failed. Autosave failure: destructive dot + message + underlined retry in the app bar. Panel failure: `Alert variant="destructive"` inside the panel with a retry action, surrounding data left on screen. **Never a full-page error for a partial failure. Never a toast for something the user must act on.**

**Disabled.** `text-input` — the darkened token, which clears 3:1 — with `cursor-not-allowed`. **No opacity dimming**; opacity stacking breaks the audited contrast. An item that will exist later carries a "coming soon" outline badge. An item that's contextually unavailable stays in the menu rather than disappearing, so menu shape is stable.

**Offline.** Hollow dot + queued-changes count in the app bar. Queue, don't block.

---

## 7. Chart colour assignment

These rules follow from the token audit, not from taste. `--ramp-1` … `--ramp-4` fall below 3:1 on `--card`, and the categorical palette is deuteranopia-separable only up to five entries.

**Categorical — unordered, 5 or fewer.** `--chart-1` … `--chart-5`, in order, no skipping. Maximum five. `--chart-6/7/8` exist in the token file but are **not for new work** (see §11).

**Six or more series — change the encoding, not the palette.** Horizontal bars, sorted descending, one per category, each directly labelled with name and value. Single fill: `--chart-1`. Never a sixth colour. **Never a pie or donut, at any count.**

**More than 8 options on one question.** Rank descending, show the top 7, aggregate the remainder into a final "other (n)" bar in `--muted` with a `--border` stroke. The aggregate always sorts last regardless of size, and its tooltip lists what it contains. If the owner needs all 14 options, that's the table view, not the chart.

**Ordered data — always the ramp.** Opinion scale, NPS, Likert, matrix intensity, funnel stages: `--ramp-1` … `--ramp-7`, never the categorical palette. Two hard requirements:

1. Every ramp fill carries `border: 1px solid var(--border)`. Steps 1–4 are below 3:1 on `--card`; an isolated low bar would otherwise vanish.
2. Value labels on the fill flip from `--foreground` to `--background` at **step 5 light, step 4 dark**. Read `--ramp-label-flip` — do not hardcode 5.

**More ordered stages than ramp steps.** Bin monotonically onto the 7 steps, front to back. The 15-stage funnel bins two per step: `[1,1,2,2,3,3,4,4,5,5,6,6,7,7,7]`. **The ramp encodes position in the sequence, not health** — a stage is never recoloured for performing badly. Problem stages are flagged in the row chrome (destructive gutter mark, destructive drop figure, outline badge), which keeps the colour channel honest and the flag readable for colour-blind users.

**Single-series comparison.** `--chart-1` alone. Emphasise the notable value with weight and a 1px `--foreground` outline, never a second hue.

**Bar direction.** Categorical bars are horizontal whenever labels are words. Vertical bars with rotated labels are not acceptable. Time series may be vertical.

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
--survey-radius: 0.375rem;  /* the 6px runner radius from §4 */
--survey-primary: var(--primary);
--survey-background: var(--background);
--survey-card: var(--card);
--survey-accent: var(--accent);
--survey-accent-foreground: var(--accent-foreground);
```

Owner branding later overrides this namespace only. If runner components consume `--primary` directly, adding branding means touching every one of them. Cheap now, expensive later.

This is also the cleanest home for the runner's radius exception — it becomes a token rather than a magic number scattered through components.

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

1. **`--chart-6/7/8` are frozen.** The token file's comment describes them as available for rare cases; this spec is stricter — not for new work. They stay defined so nothing breaks. Do not reach for them to dodge the five-colour cap; change the encoding instead (§7).
2. **Two panels are deliberately not Recharts.** The funnel and the device-mix bar are hand-built CSS. This is an exception to the otherwise absolute "charts are Recharts" rule, made because 15 directly-labelled rows with a flag column fight the library. Do not migrate them.
3. **The provisional type scale is gone.** §2 replaces the placeholder that existed before the design sessions. The arbitrary pixel values are intentional.
4. **The runner's 6px radius is a token, not an override.** Implemented as `--survey-radius` (§8) rather than a one-off class.
5. **Disabled uses colour, not opacity.** Standard shadcn dims with opacity; that stacks and breaks audited contrast, so it's overridden here.