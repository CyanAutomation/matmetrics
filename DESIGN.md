# Design System Document: The Kinetic Athlete

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Technical Sensei."** Judo is a sport of maximum efficiency and minimal effort (_Seiryoku Zenyo_). This system must mirror that philosophy by stripping away the "noise" of traditional dashboard design—eliminating harsh borders and cluttered grids—and replacing them with a sophisticated, editorial-grade interface that feels as fluid as a well-executed _ippon seoi nage_.

We break the "standard app" mold by using **Intentional Asymmetry** and **Tonal Depth**. Data isn't just displayed; it is choreographed. By utilizing high-contrast typography scales and overlapping surfaces, we create a rhythmic experience that guides the athlete’s eye toward progress and performance insights.

## 2. Colors & Surface Philosophy

The palette is rooted in the "Judo Blue" (`primary: #005cab`) and the "Clean Mat" (`surface: #f7fafc`). We move beyond flat UI by treating the screen as a physical space with varying elevations.

### Canonical Token Guidance (Source of Truth)

Use the following token table as the canonical source for implementation. Product surfaces, charts, badges, and controls should reference token names only (never hardcoded hex values in component code).

| Token                         | Hex       | Intended Usage                                                                             |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `primary`                     | `#005cab` | Primary action backgrounds, key chart series, high-emphasis links                          |
| `primary-container`           | `#0075d6` | Elevated primary surfaces, gradient companion for primary CTAs                             |
| `primary-fixed`               | `#0075d6` | Legacy-safe primary emphasis token (stable alias for `primary-container` during migration) |
| `on-primary`                  | `#ffffff` | Text/icons on `primary` backgrounds                                                        |
| `on-primary-container`        | `#ffffff` | Text/icons on `primary-container`                                                          |
| `secondary`                   | `#515f78` | Secondary actions, supporting data series                                                  |
| `tertiary`                    | `#67587a` | Tertiary chart series and alternate data accents                                           |
| `secondary-container`         | `#d4e3ff` | Secondary chips, low-emphasis highlights                                                   |
| `on-secondary`                | `#ffffff` | Text/icons on `secondary`                                                                  |
| `on-secondary-container`      | `#1b2a41` | Text/icons on `secondary-container`                                                        |
| `surface`                     | `#f7fafc` | App canvas/base background                                                                 |
| `surface-container-low`       | `#f1f4f6` | Section grouping backgrounds                                                               |
| `surface-container-lowest`    | `#ffffff` | Cards and foreground modules                                                               |
| `surface-container-high`      | `#e5e9eb` | Elevated neutral containers (secondary controls, skeletons)                                |
| `surface-bright`              | `#f7fafc` | Active overlays and glass-like floating surfaces                                           |
| `surface-tint`                | `#005faf` | Ambient interaction glow for elevated controls                                             |
| `surface-variant`             | `#e0e3e5` | Tracks, muted chart elements, neutral separators by tone                                   |
| `on-surface`                  | `#181c1e` | Primary body text/icons                                                                    |
| `on-surface-variant`          | `#43474a` | Secondary text, helper metadata                                                            |
| `outline`                     | `#73777a` | Focus/selection outlines requiring strong visibility                                       |
| `outline-variant`             | `#c2c7ca` | Subtle strokes for accessibility fallbacks                                                 |
| `success`                     | `#0f7a43` | Positive outcomes, successful states                                                       |
| `success-container`           | `#d7f3e3` | Success banners, positive badge fills                                                      |
| `on-success`                  | `#ffffff` | Text/icons on `success`                                                                    |
| `on-success-container`        | `#0a4b2a` | Text/icons on `success-container`                                                          |
| `warning`                     | `#b26a00` | Cautionary messages, anomaly callouts                                                      |
| `warning-container`           | `#ffe7c2` | Warning badges, caution background panels                                                  |
| `on-warning`                  | `#1f1600` | Text/icons on `warning`                                                                    |
| `on-warning-container`        | `#5c3a00` | Text/icons on `warning-container`                                                          |
| `error`                       | `#c62828` | Error states, critical regressions                                                         |
| `error-container`             | `#ffd9d6` | Error banners, destructive confirmation backgrounds                                        |
| `on-error`                    | `#ffffff` | Text/icons on `error`                                                                      |
| `on-error-container`          | `#5f1313` | Text/icons on `error-container`                                                            |
| `info`                        | `#00639b` | Informational notices and neutral status messaging                                         |
| `info-container`              | `#cde5ff` | Info callouts and non-critical status cards                                                |
| `on-info`                     | `#ffffff` | Text/icons on `info`                                                                       |
| `on-info-container`           | `#0d3b66` | Text/icons on `info-container`                                                             |
| `primary-hover`               | `#004f94` | Hover state for primary controls                                                           |
| `primary-pressed`             | `#00437d` | Pressed/active state for primary controls                                                  |
| `primary-focus`               | `#66a3d9` | Focus ring/accent for primary controls                                                     |
| `primary-disabled`            | `#9bbbd7` | Disabled primary controls                                                                  |
| `secondary-hover`             | `#47556c` | Hover state for secondary controls                                                         |
| `secondary-pressed`           | `#3d495d` | Pressed/active state for secondary controls                                                |
| `secondary-focus`             | `#8d9cb4` | Focus ring/accent for secondary controls                                                   |
| `secondary-disabled`          | `#b4bcc8` | Disabled secondary controls                                                                |
| `trend-positive`              | `#0f7a43` | Positive chart deltas and uptrend badges                                                   |
| `trend-positive-container`    | `#d7f3e3` | Positive trend chip backgrounds                                                            |
| `on-trend-positive-container` | `#0a4b2a` | Text/icons on positive trend containers                                                    |
| `trend-negative`              | `#c62828` | Negative chart deltas and regression badges                                                |
| `trend-negative-container`    | `#ffd9d6` | Negative trend chip backgrounds                                                            |
| `on-trend-negative-container` | `#5f1313` | Text/icons on negative trend containers                                                    |
| `trend-neutral`               | `#6b7280` | Flat/no-change chart signals and neutral badges                                            |
| `trend-neutral-container`     | `#e5e7eb` | Neutral trend chip backgrounds                                                             |
| `on-trend-neutral-container`  | `#374151` | Text/icons on neutral trend containers                                                     |

### Token Naming Convention

All semantic tokens use **kebab-case**.

Examples:

- `primary-container`
- `surface-container-lowest`
- `on-surface-variant`
- `trend-positive-container`
- `outline-variant`

Rule: use lowercase letters and hyphen separators only. Do not introduce `snake_case`, `PascalCase`, or mixed-separator aliases in new token definitions.

### Token Migration Mapping (Old -> Canonical)

Use this mapping during migration for frontend and Go/CLI consumers so token lookups can be updated safely.

| Old token                  | Canonical token            |
| -------------------------- | -------------------------- |
| `primary_container`        | `primary-container`        |
| `secondary_container`      | `secondary-container`      |
| `surface_container_low`    | `surface-container-low`    |
| `surface_container_lowest` | `surface-container-lowest` |
| `surface_container_high`   | `surface-container-high`   |
| `surface_variant`          | `surface-variant`          |
| `outline_variant`          | `outline-variant`          |
| `success_container`        | `success-container`        |
| `warning_container`        | `warning-container`        |
| `error_container`          | `error-container`          |
| `info_container`           | `info-container`           |
| `on_surface`               | `on-surface`               |
| `on_surface_variant`       | `on-surface-variant`       |
| `surface_bright`           | `surface-bright`           |
| `surface_tint`             | `surface-tint`             |
| `primary_fixed`            | `primary-fixed`            |

**Migration note:** Components must consume semantic token names from the shared token map/theme layer (e.g., CSS variables or design-token exports) instead of inline raw hex values. This applies to existing button variants, chart series, badges, and any newly introduced states.

`primary-fixed` preserves legacy `primary_fixed` semantics and should be treated as a primary-emphasis token (not a secondary-emphasis substitute).

### Token Completeness Check

Every token used in this document must exist in the canonical token table in Section 2. If guidance introduces a new token, add it to the canonical table with its hex value and intended usage before adoption.

### The "No-Line" Rule

**Prohibition:** Solid 1px borders are strictly forbidden for sectioning or containment.
**The Standard:** Boundaries must be defined through background shifts. For example, a card utilizing `surface-container-lowest` (#ffffff) should sit atop a `surface-container-low` (#f1f4f6) section. This creates "soft" containment that feels premium and architectural rather than "boxed in."

### Surface Hierarchy & Nesting

Treat the UI as a series of nested, high-performance layers:

- **Base Level:** `surface` (#f7fafc) – The canvas.
- **Sectioning:** `surface-container-low` (#f1f4f6) – Large grouping areas.
- **Primary Content:** `surface-container-lowest` (#ffffff) – Individual cards or data modules.
- **Active Overlays:** `surface-bright` (#f7fafc) with Glassmorphism.

### The "Glass & Gradient" Rule

To inject "soul" into the athletic aesthetic, use subtle gradients. Main Action buttons or Performance Hero headers should transition from `primary` (#005cab) to `primary-container` (#0075d6) at a 135-degree angle. Floating elements (like navigation bars or quick-action FABs) must use **Glassmorphism**: a semi-transparent `surface-container-lowest` with a `backdrop-blur` of 12px-16px to let the underlying data "glow" through the interface.

## 3. Typography

We use **Inter** as our primary typographic engine, leveraging its mathematical precision to convey authority and clarity.

- **Display Scales (`display-lg` to `display-sm`):** Reserved for "The Scoreboard"—major milestones, session counts, or win rates. These should use a Tight Letter Spacing (-0.02em) to feel aggressive and athletic.
- **Headline & Title:** Used for technique categories (e.g., _Nage-waza_, _Katame-waza_). The contrast between `headline-lg` (2rem) and `body-md` (0.875rem) creates an editorial hierarchy that feels like a premium sports magazine.
- **Labels:** Use `label-md` in uppercase with increased letter spacing (+0.05em) for metadata like "KUMITE DURATION" or "TECHNIQUE TYPE."

## 4. Elevation & Depth

In this design system, "shadows" are atmospheric, not structural.

- **The Layering Principle:** Depth is achieved by stacking tones. Place a `secondary-container` (#d4e3ff) badge on a `surface-container-lowest` (#ffffff) card to create a natural "lift" without a single drop shadow.
- **Ambient Shadows:** If an element must float (e.g., a technique video modal), use a shadow with a blur of `24px` and an opacity of `6%`, tinted with the `on-surface` color (#181c1e).
- **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-contrast modes), use `outline-variant` at **15% opacity**. Never use a 100% opaque border.

## 5. Components

### Performance Buttons

- **Primary:** Gradient fill (`primary` to `primary-container`), `xl` roundedness (0.75rem). No border.
- **Secondary:** `surface-container-high` (#e5e9eb) background with `on-surface-variant` text.
- **Interaction:** On hover, a subtle `surface-tint` (#005faf) glow should emanate from beneath the button using an Ambient Shadow.

### Technique Chips

- **Visual Style:** Rounded `full` (9999px).
- **Categorization:** Use `secondary-container` for broad categories and `primary-container` for active selections.
- **Constraint:** No borders. Use the color shift to indicate state.

### Data Visualization & Lists

- **The No-Divider Rule:** Forbid the use of horizontal rules (line dividers).
- **Implementation:** Separate list items using `spacing: 4` (1rem) of vertical white space or by alternating background tones between `surface-container-lowest` and `surface-container-low`.
- **Progress Bars:** Use a `surface-variant` (#e0e3e5) track with a `primary` (#005cab) indicator. Ensure the ends are rounded (`full`) to maintain the modern athletic feel.
- **Chart Palette Mapping:** Standardize series colors in this order: `primary` (#005cab), `secondary` (#515f78), `tertiary` (#67587a), `primary-container` (#0075d6), `secondary-container` (#d4e3ff), then neutral accents from `surface-variant` (#e0e3e5). Keep the same series-to-color mapping across screens so an athlete can build pattern memory.
- **Reserved Alert/Outlier Colors:** Reserve warm colors for exceptions only: warning/anomaly = `#b26a00`, critical regression = `#c62828`, positive outlier highlight = `#0f7a43`. These colors must never be reused for baseline series data.
- **Axis Labels & Tick Density:** Axis titles use `label-md` (uppercase, +0.05em tracking); tick labels use `body-sm` at `12px` minimum, and never below `11px` in constrained mobile views. Default to 5-7 major ticks per axis (max 8 on desktop, 6 on mobile) and prefer abbreviated units (e.g., `min`, `%`, `wk`) to reduce clutter.
- **Tooltip Behavior & Accessibility:** Tooltips appear on hover and keyboard focus, are pinned to the nearest data mark, and include: series name, exact value, unit, timestamp/session date, and comparative delta when available. Keep tooltip contrast at WCAG AA minimum, and preserve focus state until the user tabs away or presses `Esc`.
- **Hover/Focus Feedback:** On hover/focus, increase active series stroke width by `+1px`, raise point marker size by `+2px`, and fade inactive series to 40-60% opacity. Keyboard focus must render a 2px high-contrast focus ring using `outline` tokens.
- **Empty/Loading/Error States:**
  - **Empty:** Show a neutral illustration placeholder with headline "No data yet" and one actionable CTA (e.g., "Log your next session").
  - **Loading:** Use skeleton charts with animated shimmer at 1.2-1.6s cycles; skeleton bars/lines should use `surface-container-high` blocks over `surface-container-low`.
  - **Error:** Show concise failure text, retry action, and a non-blocking fallback summary ("Last successful sync: <date>") when available.
- **Colorblind-Safe Differentiation:** Never rely on hue alone. Distinguish series with paired channels: marker shape (circle/square/triangle/diamond), stroke style (solid/dashed/dotted), and optional low-contrast pattern fills (45° hatch, dot matrix) for area/bar charts. All legends must reflect both color and non-color encodings.

### Judo-Specific Components

- **The "Heat Map" Card:** A `surface-container-lowest` container utilizing a subtle background pattern or a very low-opacity `primary` gradient to represent mat dominance or training intensity.
- **Technique Mastery Hex:** A custom visualization using `outline` tokens for the grid and `primary` for the filled mastery area.

## 6. Do's and Don'ts

### Do:

- **Do** use asymmetrical margins (e.g., a wider left margin for headlines) to create a high-end editorial feel.
- **Do** use `body-lg` for coaching tips to give the text more "weight" and authority.
- **Do** prioritize white space over "filling the screen." If a screen feels empty, increase the typography scale rather than adding lines or boxes.

### Don't:

- **Don't** use pure black (#000000) for body text; use `on-surface` (#181c1e) to maintain a sophisticated tonal range.
- **Don't** use standard "Material" shadows. If the shadow is visible enough to be noticed, it is too dark.
- **Don't** use icons as the primary way to communicate—let the typography and the "Kinetic" layout do the heavy lifting.

## 7. Responsive Layout & Breakpoint Behavior

Maintain the "Technical Sensei" editorial rhythm on every screen size by adapting asymmetry, density, and module structure without sacrificing readability.

### Breakpoint Strategy

- **Mobile (`< 640px`)**
  - Single-column flow.
  - Asymmetrical page margins must collapse to **symmetric gutters** to prevent clipped labels and chart axes.
  - Default horizontal gutter: `spacing-4` (16px).
- **Tablet (`640px - 1023px`)**
  - Flexible 8-column grid for mixed single/double-span modules.
  - Asymmetry may return only in sectional composition (e.g., hero copy alignment), not in core content gutters.
  - Default horizontal gutter: `spacing-6` (24px).
- **Desktop (`>= 1024px`)**
  - Full editorial layout with asymmetrical margins permitted.
  - Wider lead margin can be used for hero/headline framing while data modules remain on a predictable grid.
  - Default horizontal gutter: `spacing-8` to `spacing-10` (32-40px).

**Asymmetry collapse rule:** If any module width drops below **320px usable content width** or if chart labels require truncation beyond standard abbreviation rules, switch immediately to symmetric gutters.

### Maximum Content Width & Grid Rules

- **Mobile (`< 640px`)**
  - `max-width: 100%`.
  - 1-column stack; cards fill available width.
- **Tablet (`640px - 1023px`)**
  - `max-width: 960px`.
  - 8-column grid; common spans: `span-8` (full), `span-4` (two-up), `span-2` (small stats only).
- **Desktop (`>= 1024px`)**
  - `max-width: 1200px` standard content rail.
  - Optional expanded analytics canvases may extend to `1440px` when required for dense comparative charts.
  - 12-column grid; common spans: `span-12` hero, `span-8/4` split feature, `span-6` two-up modules, `span-4` three-up cards.

### Spacing Scale Adjustments for Small Screens

Editorial whitespace should compress proportionally, not disappear:

- **Desktop baseline**
  - Section gap: `spacing-16` (64px)
  - Card gap: `spacing-8` (32px)
  - Internal card padding: `spacing-6` to `spacing-8` (24-32px)
- **Tablet**
  - Section gap: `spacing-12` (48px)
  - Card gap: `spacing-6` (24px)
  - Internal card padding: `spacing-5` to `spacing-6` (20-24px)
- **Mobile**
  - Section gap: `spacing-8` to `spacing-10` (32-40px)
  - Card gap: `spacing-4` to `spacing-5` (16-20px)
  - Internal card padding: `spacing-4` (16px)

**Minimum rhythm guardrail:** Never reduce vertical gaps between distinct modules below `spacing-4` (16px), or the interface loses scanability.

### Module Behavior Examples (Desktop vs Mobile)

- **Hero/Header**
  - **Desktop:** Asymmetrical composition allowed (headline starts on shifted column; supporting KPI strip can overlap lower section).
  - **Mobile:** Collapse to linear stack (headline -> subcopy -> KPI chips -> CTA). Remove overlap effects that reduce legibility.
- **Card Grids**
  - **Desktop:** 3-up (`span-4`), 4-up for compact metric cards where labels remain fully readable.
  - **Mobile:** Single-column stack. Two-up is allowed only for compact numeric tiles with labels that fit at `label-sm` without wrapping awkwardly.
- **List Modules (sessions, trends, logs)**
  - **Desktop:** Multi-column metadata rows (date, category, effort, duration) with generous row breathing room.
  - **Mobile:** Convert metadata to two-line pattern or chip stack under the primary row title; preserve tap targets and avoid horizontal scrolling.

### Responsive Anti-Patterns

- Asymmetrical gutters on narrow screens that push charts/cards off-canvas.
- Hero overlaps that obscure KPI values or CTA labels on mobile.
- Dense 3-up/4-up card grids below `640px` causing unreadable labels.
- Fixed-height cards that clip trend badges, axis labels, or localization-expanded text.
- Preserving desktop typography scale on phones without reducing line length, resulting in orphaned words and broken hierarchy.
- Horizontal scrolling lists used as a workaround for poor breakpoint planning (except deliberate, card-carousel interactions with clear affordances).

## 8. Implementation Appendix (Tailwind + Radix)

This appendix translates design intent into implementation-ready recipes for Tailwind and Radix UI consumers. Use semantic tokens via CSS variables as the only source for component styling.

### 8.1 Token-to-Implementation Mapping

Define CSS variables in the theme layer (for example `:root` and optional `[data-theme]` overrides), then reference those variables through Tailwind arbitrary values.

```css
:root {
  --color-primary: #005cab;
  --color-primary-container: #0075d6;
  --color-primary-fixed: #0075d6;
  --color-on-primary: #ffffff;
  --color-secondary: #515f78;
  --color-secondary-container: #d4e3ff;
  --color-on-secondary-container: #1b2a41;
  --color-surface: #f7fafc;
  --color-surface-low: #f1f4f6;
  --color-surface-lowest: #ffffff;
  --color-surface-high: #e5e9eb;
  --color-surface-variant: #e0e3e5;
  --color-on-surface: #181c1e;
  --color-on-surface-variant: #43474a;
  --color-outline: #73777a;
  --color-outline-variant: #c2c7ca;
  --color-success: #0f7a43;
  --color-success-container: #d7f3e3;
  --color-warning: #b26a00;
  --color-warning-container: #ffe7c2;
  --color-error: #c62828;
  --color-error-container: #ffd9d6;
  --color-info: #00639b;
  --color-info-container: #cde5ff;

  --radius-card: 1rem;
  --radius-button: 0.75rem;
  --radius-pill: 9999px;

  --shadow-ambient: 0 12px 24px rgb(24 28 30 / 0.06);
}
```

| Token / Surface                             | CSS Variable                                   | Tailwind Utility Recipe                                                                                      |
| ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Canvas (`surface`)                          | `--color-surface`                              | `bg-[var(--color-surface)] text-[var(--color-on-surface)]`                                                   |
| Section (`surface-container-low`)           | `--color-surface-low`                          | `bg-[var(--color-surface-low)]`                                                                              |
| Card (`surface-container-lowest`)           | `--color-surface-lowest`                       | `bg-[var(--color-surface-lowest)] rounded-2xl`                                                               |
| Neutral elevated (`surface-container-high`) | `--color-surface-high`                         | `bg-[var(--color-surface-high)]`                                                                             |
| Muted track (`surface-variant`)             | `--color-surface-variant`                      | `bg-[var(--color-surface-variant)]`                                                                          |
| Primary action                              | `--color-primary`, `--color-primary-container` | `bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)]`                          |
| Primary fixed emphasis (`primary-fixed`)    | `--color-primary-fixed`                        | `bg-[var(--color-primary-fixed)] text-[var(--color-on-primary)]`                                             |
| Secondary emphasis                          | `--color-secondary-container`                  | `bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]`                           |
| Positive trend                              | `--color-success-container`                    | `bg-[var(--color-success-container)] text-[var(--color-success)]`                                            |
| Warning trend                               | `--color-warning-container`                    | `bg-[var(--color-warning-container)] text-[var(--color-warning)]`                                            |
| Error trend                                 | `--color-error-container`                      | `bg-[var(--color-error-container)] text-[var(--color-error)]`                                                |
| Focus ring                                  | `--color-outline`                              | `focus-visible:ring-2 focus-visible:ring-[var(--color-outline)]`                                             |
| Ghost accessibility border fallback         | `--color-outline-variant`                      | `border border-[color:color-mix(in_srgb,var(--color-outline-variant)_15%,transparent)]` (fallback mode only) |

> Implementation note: default state should remain borderless; only apply outline fallback in explicit accessibility/high-contrast modes.

### 8.2 Radix Variant Contract

Use `class-variance-authority (cva)` or an equivalent variant system to keep all Radix primitives aligned.

#### Button (`@radix-ui/react-slot` or `button` primitive)

- `variant=primary`: gradient, white text, ambient shadow on hover.
- `variant=secondary`: tonal neutral fill, no border.
- `variant=ghost`: transparent by default, tonal hover only.
- `size=sm|md|lg` mapped to consistent heights and horizontal padding.

Base recipe:

```ts
const button = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-medium transition-all rounded-[var(--radius-button)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-outline)] disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'text-[var(--color-on-primary)] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] shadow-[var(--shadow-ambient)] hover:brightness-105 active:brightness-95',
        secondary:
          'bg-[var(--color-surface-high)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-variant)]',
        ghost:
          'text-[var(--color-on-surface)] hover:bg-[var(--color-surface-low)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```

#### Chip (`@radix-ui/react-toggle` or `@radix-ui/react-badge` style wrapper)

- `intent=neutral|active|success|warning|error`
- Always `rounded-full`, compact typography, no border.
- Active/selected state should use tonal fill changes, not strokes.

#### Card (`@radix-ui/react-slot` wrapper over `div/section`)

- `elevation=base|raised|glass`
- `base`: `surface-container-lowest`
- `raised`: same tonal base + ambient shadow
- `glass`: translucent white + `backdrop-blur-[12px]`

### 8.3 Canonical Component Recipes

#### A) Primary Button

```tsx
<Button variant="primary" size="md" className="gap-2">
  Save Session
</Button>
```

Class recipe outcome:

- `inline-flex items-center justify-center h-10 px-4 rounded-[var(--radius-button)]`
- `bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)]`
- `text-[var(--color-on-primary)] shadow-[var(--shadow-ambient)]`
- `focus-visible:ring-2 focus-visible:ring-[var(--color-outline)]`

#### B) Technique Chip

```tsx
<Toggle
  pressed={selected}
  className={cn(
    'h-8 px-3 rounded-full text-xs font-medium transition-colors',
    selected
      ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
      : 'bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-high)]'
  )}
>
  Uchi mata
</Toggle>
```

Class recipe outcome:

- `rounded-full`
- Tonal state shift only (no border)
- Compact metadata typography (`text-xs`, `font-medium`)

#### C) Metric Card

```tsx
<article className="rounded-2xl bg-[var(--color-surface-lowest)] p-6 shadow-[var(--shadow-ambient)]">
  <p className="text-xs uppercase tracking-[0.05em] text-[var(--color-on-surface-variant)]">
    Weekly Volume
  </p>
  <p className="mt-2 text-3xl font-semibold text-[var(--color-on-surface)]">
    7.4 hrs
  </p>
  <p className="mt-3 inline-flex rounded-full bg-[var(--color-success-container)] px-2.5 py-1 text-xs font-medium text-[var(--color-success)]">
    +12% vs last week
  </p>
</article>
```

Class recipe outcome:

- Card uses `surface-container-lowest`
- Label hierarchy preserved with uppercase + tracking
- Trend badge uses semantic status container token

### 8.4 Forbidden Implementation Patterns

The following patterns are non-compliant and should fail design review:

1. **Hardcoded borders for layout containment** (e.g., `border border-slate-200` on cards/sections).
2. **Unapproved shadow presets** (e.g., `shadow-md`, `shadow-xl`) not mapped to `--shadow-ambient`.
3. **Raw hex values in component files** (e.g., `bg-[#005cab]`, `text-[#181c1e]`) outside token/theme definitions.
4. **Divider lines as primary separators** (`divide-y`, `<hr />`) where spacing/tonal separation is required.
5. **State changes encoded only by hue** without shape/label/typographic reinforcement in data visuals.

### 8.5 How to Theme (Brand Variations)

To support future brand skins without breaking hierarchy:

1. **Keep semantic variable names stable.** Only values in theme scopes change.
2. **Override at theme root, not component level.**
   - Example: `[data-theme="dojo-night"] { --color-surface: ... }`
3. **Preserve structural tokens and interaction contracts.**
   - Do not alter radius scale, spacing rhythm, or focus ring thickness per brand.
4. **Validate contrast + status semantics per theme.**
   - `primary/on-primary`, `surface/on-surface`, and all status containers must remain WCAG AA.
5. **Regression check canonical components.**
   - Primary Button, Technique Chip, and Metric Card are mandatory snapshots for every new theme.

This allows visual brand variance while preserving the Technical Sensei hierarchy, motion language, and information clarity.

## 9. Governance

This section defines how the design system evolves, who approves changes, and what implementation/migration evidence is required before adoption.

### 9.1 Versioning Policy (Tokens + Components)

Use a two-part semantic format: `MAJOR.MINOR`.

- **MAJOR** increments for breaking changes:
  - Token renames/removals.
  - Token meaning/usage contract changes that require code updates.
  - Component API breaking changes (prop removals/renames, required behavior changes).
  - Visual behavior changes that materially alter interaction patterns across products.
- **MINOR** increments for non-breaking changes:
  - New additive tokens or aliases.
  - New optional component variants/sizes/states.
  - Visual refinements that do not require consumer-side code changes.
  - Documentation clarifications and implementation guidance updates.

**Release labeling examples**

- `1.4 -> 1.5`: Added `info-container` usage guidance (non-breaking).
- `1.5 -> 2.0`: Replaced `secondary-container` chip selection contract with a new token family (breaking).

### 9.2 Change Proposal Workflow

All changes must be submitted as a Design Change Proposal (DCP) in version control and reviewed before merge.

1. **Author submits DCP**
   - Scope: token, visual style, component contract, or mixed.
   - Includes rationale, impacted surfaces/components, rollout type (major/minor), and risk level.
2. **Required reviewers by change type**
   - **Visual-only changes (non-token, non-API):** Design Owner + Frontend Owner.
   - **Token changes:** Design Owner + Frontend Owner + QA Owner.
   - **Component API/behavior changes:** Design Owner + Frontend Owner + QA Owner.
   - **Breaking (`MAJOR`) changes:** all three owners; approval is mandatory from each role.
3. **Validation gate**
   - Accessibility and regression checks are completed.
   - Migration notes are verified for any consumer impact.
4. **Merge + release note**
   - Version increment must match change impact.
   - DCP link is included in release notes/changelog.

No major token/component change may be merged with fewer than three-role approval.

### 9.3 Deprecation + Transition Windows

Deprecated tokens/components must remain available during a defined migration period unless there is a security or legal exception.

- **Minor deprecations (non-breaking path available):** minimum **1 minor release** transition window.
- **Major deprecations (breaking path):** minimum **2 minor releases or 90 days** (whichever is longer) before removal.
- **Emergency removals:** permitted only for security/compliance/legal reasons and require explicit owner sign-off with incident notes.

Each deprecation must include:

- `Deprecated in`: exact version.
- `Removal target`: exact version/date.
- `Replacement`: canonical token/component and migration example.
- Runtime/build-time warning strategy where technically feasible.

### 9.4 Required Artifacts for Major Changes

Every `MAJOR` token/component change must attach all artifacts below:

1. **Before/After examples**
   - Side-by-side screenshots or snapshots for canonical components and at least one real screen context.
2. **Accessibility impact statement**
   - Contrast changes, focus-state impact, keyboard/screen reader implications, and mitigations.
3. **Migration notes**
   - Step-by-step consumer migration path (old -> new tokens/components), codemod/manual guidance, and rollback instructions.
4. **Regression checklist**
   - Status colors, chart encodings, responsive behavior, and high-contrast fallback verification.

Major changes are incomplete and not merge-ready without these artifacts.

### 9.5 Ownership Matrix

| Area                                            | Design Owner | Frontend Owner | QA Owner |
| ----------------------------------------------- | ------------ | -------------- | -------- |
| Token taxonomy & semantic meaning               | **A/R**      | C              | C        |
| Component API contract (props/variants/states)  | C            | **A/R**        | C        |
| Visual behavior and interaction patterns        | **A/R**      | R              | C        |
| Accessibility acceptance criteria               | A            | R              | **R**    |
| Regression test definition and sign-off         | C            | R              | **A/R**  |
| Deprecation communication + migration readiness | **A/R**      | **R**          | C        |
| Release/version bump validation                 | A            | **R**          | **R**    |

Legend: **A** = Accountable, **R** = Responsible, **C** = Consulted.
