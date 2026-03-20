# Design System Document: The Kinetic Athlete

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Technical Sensei."** Judo is a sport of maximum efficiency and minimal effort (*Seiryoku Zenyo*). This system must mirror that philosophy by stripping away the "noise" of traditional dashboard design—eliminating harsh borders and cluttered grids—and replacing them with a sophisticated, editorial-grade interface that feels as fluid as a well-executed *ippon seoi nage*.

We break the "standard app" mold by using **Intentional Asymmetry** and **Tonal Depth**. Data isn't just displayed; it is choreographed. By utilizing high-contrast typography scales and overlapping surfaces, we create a rhythmic experience that guides the athlete’s eye toward progress and performance insights.

## 2. Colors & Surface Philosophy
The palette is rooted in the "Judo Blue" (`primary: #005cab`) and the "Clean Mat" (`surface: #f7fafc`). We move beyond flat UI by treating the screen as a physical space with varying elevations.

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

*   **Display Scales (`display-lg` to `display-sm`):** Reserved for "The Scoreboard"—major milestones, session counts, or win rates. These should use a Tight Letter Spacing (-0.02em) to feel aggressive and athletic.
*   **Headline & Title:** Used for technique categories (e.g., *Nage-waza*, *Katame-waza*). The contrast between `headline-lg` (2rem) and `body-md` (0.875rem) creates an editorial hierarchy that feels like a premium sports magazine.
*   **Labels:** Use `label-md` in uppercase with increased letter spacing (+0.05em) for metadata like "KUMITE DURATION" or "TECHNIQUE TYPE."

## 4. Elevation & Depth
In this design system, "shadows" are atmospheric, not structural.

*   **The Layering Principle:** Depth is achieved by stacking tones. Place a `primary_fixed` (#d4e3ff) badge on a `surface_container_lowest` (#ffffff) card to create a natural "lift" without a single drop shadow.
*   **Ambient Shadows:** If an element must float (e.g., a technique video modal), use a shadow with a blur of `24px` and an opacity of `6%`, tinted with the `on_surface` color (#181c1e). 
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-contrast modes), use `outline_variant` at **15% opacity**. Never use a 100% opaque border.

## 5. Components

### Performance Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), `xl` roundedness (0.75rem). No border.
*   **Secondary:** `surface_container_high` (#e5e9eb) background with `on_surface_variant` text.
*   **Interaction:** On hover, a subtle `surface_tint` (#005faf) glow should emanate from beneath the button using an Ambient Shadow.

### Technique Chips
*   **Visual Style:** Rounded `full` (9999px). 
*   **Categorization:** Use `secondary_container` for broad categories and `primary_fixed` for active selections.
*   **Constraint:** No borders. Use the color shift to indicate state.

### Data Visualization & Lists
*   **The No-Divider Rule:** Forbid the use of horizontal rules (line dividers). 
*   **Implementation:** Separate list items using `spacing: 4` (1rem) of vertical white space or by alternating background tones between `surface_container_lowest` and `surface_container_low`.
*   **Progress Bars:** Use a `surface_variant` (#e0e3e5) track with a `primary` (#005cab) indicator. Ensure the ends are rounded (`full`) to maintain the modern athletic feel.

### Judo-Specific Components
*   **The "Heat Map" Card:** A `surface_container_lowest` container utilizing a subtle background pattern or a very low-opacity `primary` gradient to represent mat dominance or training intensity.
*   **Technique Mastery Hex:** A custom visualization using `outline` tokens for the grid and `primary` for the filled mastery area.

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical margins (e.g., a wider left margin for headlines) to create a high-end editorial feel.
*   **Do** use `body-lg` for coaching tips to give the text more "weight" and authority.
*   **Do** prioritize white space over "filling the screen." If a screen feels empty, increase the typography scale rather than adding lines or boxes.

### Don't:
*   **Don't** use pure black (#000000) for body text; use `on_surface` (#181c1e) to maintain a sophisticated tonal range.
*   **Don't** use standard "Material" shadows. If the shadow is visible enough to be noticed, it is too dark.
*   **Don't** use icons as the primary way to communicate—let the typography and the "Kinetic" layout do the heavy lifting.