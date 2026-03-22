# Design System Document: The Kinetic Athlete

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Technical Sensei."** Judo is a sport of maximum efficiency and minimal effort (_Seiryoku Zenyo_). This system must mirror that philosophy by stripping away the "noise" of traditional dashboard design—eliminating harsh borders and cluttered grids—and replacing them with a sophisticated, editorial-grade interface that feels as fluid as a well-executed _ippon seoi nage_.

We break the "standard app" mold by using **Intentional Asymmetry** and **Tonal Depth**. Data isn't just displayed; it is choreographed. By utilizing high-contrast typography scales and overlapping surfaces, we create a rhythmic experience that guides the athlete’s eye toward progress and performance insights.

## 2. Colors & Surface Philosophy

The palette is rooted in the "Judo Blue" (`primary: #005cab`) and the "Clean Mat" (`surface: #f7fafc`). We move beyond flat UI by treating the screen as a physical space with varying elevations.

### Canonical Token Guidance (Source of Truth)

Use the following token table as the canonical source for implementation. Product surfaces, charts, badges, and controls should reference token names only (never hardcoded hex values in component code).

| Token | Hex | Intended Usage |
| --- | --- | --- |
| `primary` | `#005cab` | Primary action backgrounds, key chart series, high-emphasis links |
| `primary_container` | `#0075d6` | Elevated primary surfaces, gradient companion for primary CTAs |
| `on-primary` | `#ffffff` | Text/icons on `primary` backgrounds |
| `on-primary-container` | `#ffffff` | Text/icons on `primary_container` |
| `secondary` | `#515f78` | Secondary actions, supporting data series |
| `secondary_container` | `#d4e3ff` | Secondary chips, low-emphasis highlights |
| `on-secondary` | `#ffffff` | Text/icons on `secondary` |
| `on-secondary-container` | `#1b2a41` | Text/icons on `secondary_container` |
| `surface` | `#f7fafc` | App canvas/base background |
| `surface_container_low` | `#f1f4f6` | Section grouping backgrounds |
| `surface_container_lowest` | `#ffffff` | Cards and foreground modules |
| `surface_container_high` | `#e5e9eb` | Elevated neutral containers (secondary controls, skeletons) |
| `surface_variant` | `#e0e3e5` | Tracks, muted chart elements, neutral separators by tone |
| `on-surface` | `#181c1e` | Primary body text/icons |
| `on-surface-variant` | `#43474a` | Secondary text, helper metadata |
| `outline` | `#73777a` | Focus/selection outlines requiring strong visibility |
| `outline_variant` | `#c2c7ca` | Subtle strokes for accessibility fallbacks |
| `success` | `#0f7a43` | Positive outcomes, successful states |
| `success_container` | `#d7f3e3` | Success banners, positive badge fills |
| `on-success` | `#ffffff` | Text/icons on `success` |
| `on-success-container` | `#0a4b2a` | Text/icons on `success_container` |
| `warning` | `#b26a00` | Cautionary messages, anomaly callouts |
| `warning_container` | `#ffe7c2` | Warning badges, caution background panels |
| `on-warning` | `#1f1600` | Text/icons on `warning` |
| `on-warning-container` | `#5c3a00` | Text/icons on `warning_container` |
| `error` | `#c62828` | Error states, critical regressions |
| `error_container` | `#ffd9d6` | Error banners, destructive confirmation backgrounds |
| `on-error` | `#ffffff` | Text/icons on `error` |
| `on-error-container` | `#5f1313` | Text/icons on `error_container` |
| `info` | `#00639b` | Informational notices and neutral status messaging |
| `info_container` | `#cde5ff` | Info callouts and non-critical status cards |
| `on-info` | `#ffffff` | Text/icons on `info` |
| `on-info-container` | `#0d3b66` | Text/icons on `info_container` |
| `primary-hover` | `#004f94` | Hover state for primary controls |
| `primary-pressed` | `#00437d` | Pressed/active state for primary controls |
| `primary-focus` | `#66a3d9` | Focus ring/accent for primary controls |
| `primary-disabled` | `#9bbbd7` | Disabled primary controls |
| `secondary-hover` | `#47556c` | Hover state for secondary controls |
| `secondary-pressed` | `#3d495d` | Pressed/active state for secondary controls |
| `secondary-focus` | `#8d9cb4` | Focus ring/accent for secondary controls |
| `secondary-disabled` | `#b4bcc8` | Disabled secondary controls |
| `trend-positive` | `#0f7a43` | Positive chart deltas and uptrend badges |
| `trend-positive-container` | `#d7f3e3` | Positive trend chip backgrounds |
| `on-trend-positive-container` | `#0a4b2a` | Text/icons on positive trend containers |
| `trend-negative` | `#c62828` | Negative chart deltas and regression badges |
| `trend-negative-container` | `#ffd9d6` | Negative trend chip backgrounds |
| `on-trend-negative-container` | `#5f1313` | Text/icons on negative trend containers |
| `trend-neutral` | `#6b7280` | Flat/no-change chart signals and neutral badges |
| `trend-neutral-container` | `#e5e7eb` | Neutral trend chip backgrounds |
| `on-trend-neutral-container` | `#374151` | Text/icons on neutral trend containers |

**Migration note:** Components must consume semantic token names from the shared token map/theme layer (e.g., CSS variables or design-token exports) instead of inline raw hex values. This applies to existing button variants, chart series, badges, and any newly introduced states.

### The "No-Line" Rule

**Prohibition:** Solid 1px borders are strictly forbidden for sectioning or containment.
**The Standard:** Boundaries must be defined through background shifts. For example, a card utilizing `surface_container_lowest` (#ffffff) should sit atop a `surface_container_low` (#f1f4f6) section. This creates "soft" containment that feels premium and architectural rather than "boxed in."

### Surface Hierarchy & Nesting

Treat the UI as a series of nested, high-performance layers:

- **Base Level:** `surface` (#f7fafc) – The canvas.
- **Sectioning:** `surface_container_low` (#f1f4f6) – Large grouping areas.
- **Primary Content:** `surface_container_lowest` (#ffffff) – Individual cards or data modules.
- **Active Overlays:** `surface_bright` (#f7fafc) with Glassmorphism.

### The "Glass & Gradient" Rule

To inject "soul" into the athletic aesthetic, use subtle gradients. Main Action buttons or Performance Hero headers should transition from `primary` (#005cab) to `primary_container` (#0075d6) at a 135-degree angle. Floating elements (like navigation bars or quick-action FABs) must use **Glassmorphism**: a semi-transparent `surface_container_lowest` with a `backdrop-blur` of 12px-16px to let the underlying data "glow" through the interface.

## 3. Typography

We use **Inter** as our primary typographic engine, leveraging its mathematical precision to convey authority and clarity.

- **Display Scales (`display-lg` to `display-sm`):** Reserved for "The Scoreboard"—major milestones, session counts, or win rates. These should use a Tight Letter Spacing (-0.02em) to feel aggressive and athletic.
- **Headline & Title:** Used for technique categories (e.g., _Nage-waza_, _Katame-waza_). The contrast between `headline-lg` (2rem) and `body-md` (0.875rem) creates an editorial hierarchy that feels like a premium sports magazine.
- **Labels:** Use `label-md` in uppercase with increased letter spacing (+0.05em) for metadata like "KUMITE DURATION" or "TECHNIQUE TYPE."

## 4. Elevation & Depth

In this design system, "shadows" are atmospheric, not structural.

- **The Layering Principle:** Depth is achieved by stacking tones. Place a `primary_fixed` (#d4e3ff) badge on a `surface_container_lowest` (#ffffff) card to create a natural "lift" without a single drop shadow.
- **Ambient Shadows:** If an element must float (e.g., a technique video modal), use a shadow with a blur of `24px` and an opacity of `6%`, tinted with the `on_surface` color (#181c1e).
- **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-contrast modes), use `outline_variant` at **15% opacity**. Never use a 100% opaque border.

## 5. Components

### Performance Buttons

- **Primary:** Gradient fill (`primary` to `primary_container`), `xl` roundedness (0.75rem). No border.
- **Secondary:** `surface_container_high` (#e5e9eb) background with `on_surface_variant` text.
- **Interaction:** On hover, a subtle `surface_tint` (#005faf) glow should emanate from beneath the button using an Ambient Shadow.

### Technique Chips

- **Visual Style:** Rounded `full` (9999px).
- **Categorization:** Use `secondary_container` for broad categories and `primary_fixed` for active selections.
- **Constraint:** No borders. Use the color shift to indicate state.

### Data Visualization & Lists

- **The No-Divider Rule:** Forbid the use of horizontal rules (line dividers).
- **Implementation:** Separate list items using `spacing: 4` (1rem) of vertical white space or by alternating background tones between `surface_container_lowest` and `surface_container_low`.
- **Progress Bars:** Use a `surface_variant` (#e0e3e5) track with a `primary` (#005cab) indicator. Ensure the ends are rounded (`full`) to maintain the modern athletic feel.
- **Chart Palette Mapping:** Standardize series colors in this order: `primary` (#005cab), `secondary` (#515f78), `tertiary` (#67587a), `primary_container` (#0075d6), `secondary_container` (#d4e3ff), then neutral accents from `surface_variant` (#e0e3e5). Keep the same series-to-color mapping across screens so an athlete can build pattern memory.
- **Reserved Alert/Outlier Colors:** Reserve warm colors for exceptions only: warning/anomaly = `#b26a00`, critical regression = `#c62828`, positive outlier highlight = `#0f7a43`. These colors must never be reused for baseline series data.
- **Axis Labels & Tick Density:** Axis titles use `label-md` (uppercase, +0.05em tracking); tick labels use `body-sm` at `12px` minimum, and never below `11px` in constrained mobile views. Default to 5-7 major ticks per axis (max 8 on desktop, 6 on mobile) and prefer abbreviated units (e.g., `min`, `%`, `wk`) to reduce clutter.
- **Tooltip Behavior & Accessibility:** Tooltips appear on hover and keyboard focus, are pinned to the nearest data mark, and include: series name, exact value, unit, timestamp/session date, and comparative delta when available. Keep tooltip contrast at WCAG AA minimum, and preserve focus state until the user tabs away or presses `Esc`.
- **Hover/Focus Feedback:** On hover/focus, increase active series stroke width by `+1px`, raise point marker size by `+2px`, and fade inactive series to 40-60% opacity. Keyboard focus must render a 2px high-contrast focus ring using `outline` tokens.
- **Empty/Loading/Error States:**
  - **Empty:** Show a neutral illustration placeholder with headline "No data yet" and one actionable CTA (e.g., "Log your next session").
  - **Loading:** Use skeleton charts with animated shimmer at 1.2-1.6s cycles; skeleton bars/lines should use `surface_container_high` blocks over `surface_container_low`.
  - **Error:** Show concise failure text, retry action, and a non-blocking fallback summary ("Last successful sync: <date>") when available.
- **Colorblind-Safe Differentiation:** Never rely on hue alone. Distinguish series with paired channels: marker shape (circle/square/triangle/diamond), stroke style (solid/dashed/dotted), and optional low-contrast pattern fills (45° hatch, dot matrix) for area/bar charts. All legends must reflect both color and non-color encodings.

### Judo-Specific Components

- **The "Heat Map" Card:** A `surface_container_lowest` container utilizing a subtle background pattern or a very low-opacity `primary` gradient to represent mat dominance or training intensity.
- **Technique Mastery Hex:** A custom visualization using `outline` tokens for the grid and `primary` for the filled mastery area.

## 6. Do's and Don'ts

### Do:

- **Do** use asymmetrical margins (e.g., a wider left margin for headlines) to create a high-end editorial feel.
- **Do** use `body-lg` for coaching tips to give the text more "weight" and authority.
- **Do** prioritize white space over "filling the screen." If a screen feels empty, increase the typography scale rather than adding lines or boxes.

### Don't:

- **Don't** use pure black (#000000) for body text; use `on_surface` (#181c1e) to maintain a sophisticated tonal range.
- **Don't** use standard "Material" shadows. If the shadow is visible enough to be noticed, it is too dark.
- **Don't** use icons as the primary way to communicate—let the typography and the "Kinetic" layout do the heavy lifting.
