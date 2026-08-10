# MatMetrics Design System Blueprint

## Overview

The MatMetrics design system embodies **"The Technical Sensei"** philosophy—a sophisticated, editorial-grade interface that mirrors Judo's principle of maximum efficiency through minimal effort. This system strips away traditional dashboard noise, replacing harsh borders with intentional asymmetry and tonal depth to create a fluid, professional experience for athletic performance tracking.

## Creative North Star

**"The Technical Sensei"** guides every design decision, reflecting Judo's core philosophy of _Seiryoku Zenyo_ (maximum efficiency, minimal effort). We break the "standard app" mold through:

### Design Principles

- **Intentional Asymmetry**: Creates high-end editorial rhythm that guides the athlete's eye toward progress insights
- **Tonal Depth**: Uses sophisticated color shifts and layering to define spaces without harsh boundaries
- **"No-Line" Rule**: Boundaries are defined through background shifts, not borders
- **Kinetic Flow**: Data isn't just displayed—it's choreographed through overlapping surfaces and high-contrast typography
- **Restraint & Precision**: Every element serves a purpose; no decorative chrome or visual noise

## Architecture & Philosophy

### The "Clean Mat" Surface System

The UI is organized as a series of nested layers that create depth without visual clutter:

- **Base Level**: `surface` (#f7fafc) – The app canvas
- **Sectioning**: `surface-container-low` (#f1f4f6) – Large grouping areas
- **Primary Content**: `surface-container-lowest` (#ffffff) – Individual data modules
- **Active Overlays**: `surface-bright` (#f7fafc) with glassmorphism for floating elements

### Component Philosophy

**Cards are the exception, not the default.** Use Card only for:
- Form surfaces where the form itself is the interaction boundary
- Modal content containers
- Surfaces requiring explicit lift (floating panels, dropdowns)

For data display, prefer:
- **DataSurface**: Soft-toned container for grouped data
- **DataStrip**: Label/value row for flat statistic display
- **Section + Separator**: Whitespace and thin dividers between related items
- **Row layout**: Session lists use dividers and section grouping

## Color System

The design system uses a comprehensive semantic token approach. Colors are defined through semantic meanings, not raw hex values.

### Canonical Design Tokens

All design tokens use **kebab-case** naming and are exported from `src/lib/design-tokens.ts`. Product surfaces, charts, badges, and controls should reference token names only (never hardcoded hex values).

#### Primary Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `primary` | `#E85D04` (light), `#296BCD` (dark) | Primary action backgrounds, key chart series |
| `primary-container` | `#F5843C` (light), `#0075d6` (dark) | Elevated primary surfaces, gradient companion |
| `on-primary` | `#ffffff` | Text/icons on `primary` backgrounds |
| `on-primary-container` | `#ffffff` | Text/icons on `primary-container` |

#### Surface & Background Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `surface` | `#f7fafc` | App canvas/base background |
| `surface-container-low` | `#f1f4f6` | Section grouping backgrounds |
| `surface-container-lowest` | `#ffffff` | Cards and foreground modules |
| `surface-container-high` | `#e5e9eb` | Elevated neutral containers |
| `surface-variant` | `#e0e3e5` | Muted chart elements, neutral separators |

#### Status & Semantic Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `success` | `#0f7a43` | Positive outcomes, successful states |
| `warning` | `#b26a00` | Cautionary messages, anomaly callouts |
| `error` | `#c62828` | Error states, critical regressions |
| `info` | `#00639b` | Informational notices |

### Token Migration Guide

Legacy snake_case tokens are mapped to canonical kebab-case:

```typescript
// Old token → Canonical token
'primary_container' → 'primary-container'
'secondary_container' → 'secondary-container'
'surface_container_low' → 'surface-container-low'
```

## Typography System

The system uses **Inter** as the primary typographic engine, leveraging mathematical precision for authority and clarity.

### Typography Scale

| Scale | Usage | Example |
| --- | --- | --- |
| `display-lg` to `display-sm` | Major milestones, session counts | "127 Sessions" |
| `headline-lg` to `headline-sm` | Technique categories, section headers | "Nage-waza" |
| `body-lg` to `body-sm` | Descriptive text, helper copy | Session descriptions |
| `label-md` | Short, scannable UI labels | "RANDORI DURATION" |

### Typography Guidelines

- **Display scales**: Use tight letter spacing (-0.02em) for aggressive, athletic feel
- **Headlines**: Create editorial hierarchy with `headline-lg` (2rem) vs `body-md` (0.875rem)
- **Labels**: Uppercase with increased letter spacing (+0.05em) for metadata
- **Body**: `body-lg` for coaching tips to give text more "weight" and authority

## Component Patterns

### Buttons

```tsx
// Primary Button
<Button variant="primary" size="md">
  Save Session
</Button>

// Class recipe:
// bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)]
// text-[var(--color-on-primary)] rounded-[var(--radius-button)]
// shadow-[var(--shadow-ambient)] hover:brightness-105
```

### Technique Chips

```tsx
<Toggle pressed={selected}>
  Uchi mata
</Toggle>

// Class recipe:
// rounded-full h-8 px-3 text-xs font-medium
// selected: bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]
// !selected: bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]
```

### Metric Cards

```tsx
<article className="rounded-2xl bg-[var(--color-surface-lowest)] p-6">
  <p className="text-xs uppercase tracking-[0.05em] text-[var(--color-on-surface-variant)]">
    Weekly Volume
  </p>
  <p className="mt-2 text-3xl font-semibold text-[var(--color-on-surface)]">
    7.4 hrs
  </p>
  <p className="mt-3 inline-flex rounded-full bg-[var(--color-success-container)] px-2.5 py-1 text-xs">
    +12% vs last week
  </p>
</article>
```

## Visual Language

### The "No-Line" Rule

**Boundaries must be defined through background shifts.** For example:
- Card using `surface-container-lowest` (#ffffff) sits atop `surface-container-low` (#f1f4f6)
- This creates "soft" containment that feels premium and architectural

### Elevation & Depth

- **Layering Principle**: Depth is achieved by stacking tones
- **Ambient Shadows**: Use `shadow-ambient` with 24px blur and 6% opacity
- **Ghost Borders**: Only in high-contrast modes using `outline-variant` at 15% opacity

### "Glass & Gradient" Rule

- **Gradients**: Main actions transition from `primary` to `primary-container` at 135°
- **Glassmorphism**: Floating elements use `surface-container-lowest` with `backdrop-blur-[12px]`

## Responsive Design

### Breakpoint Strategy

- **Mobile (< 640px)**: Single-column, symmetric gutters, 1-column stack
- **Tablet (640px-1023px)**: Flexible 8-column grid, mixed single/double-span
- **Desktop (>= 1024px)**: Full editorial layout with asymmetrical margins permitted

### Spacing Scale

| Device | Section Gap | Card Gap | Internal Padding |
| --- | --- | --- | --- |
| Desktop | `spacing-16` (64px) | `spacing-8` (32px) | `spacing-6-8` (24-32px) |
| Tablet | `spacing-12` (48px) | `spacing-6` (24px) | `spacing-5-6` (20-24px) |
| Mobile | `spacing-8-10` (32-40px) | `spacing-4-5` (16-20px) | `spacing-4` (16px) |

## Implementation Guidelines

### CSS Variables Setup

```css
:root {
  --color-primary: #E85D04;
  --color-primary-container: #F5843C;
  --color-surface: #f7fafc;
  --color-surface-low: #f1f4f6;
  --color-surface-lowest: #ffffff;
  --color-on-surface: #181c1e;
  --color-on-surface-variant: #43474a;
  --radius-button: 0.75rem;
  --shadow-ambient: 0 12px 24px rgb(24 28 30 / 0.06);
}
```

### Component Implementation Rules

1. **Never use hardcoded hex values** in component files
2. **Always reference semantic tokens** via CSS variables
3. **Follow the "No-Line" rule**—use tonal separation instead of borders
4. **Use semantic variant contracts** for consistent component behavior
5. **Maintain accessibility** with proper contrast and focus states

### Forbidden Patterns

- ❌ Hardcoded borders for layout containment
- ❌ Unapproved shadow presets not mapped to `--shadow-ambient`
- ❌ Raw hex values in component files
- ❌ Divider lines as primary separators
- ❌ State changes encoded only by hue without reinforcement

## Animation Standards

### Motion Philosophy

Ship 2-3 intentional motions that enhance without distraction:

```tsx
// Entrance sequence
<div className="reveal-fade-up">
  <h2>Session Overview</h2>
</div>

// Hover/reveal
<button className="hover:brightness-105 transition-all">
  Action
</button>

// Layout transition
<div className="stagger-1">
  {sessions.map(session => <SessionCard key={session.id} />)}
</div>
```

### Motion Rules

- **Duration**: 200ms-400ms
- **Timing**: Consistent across the page
- **Purpose**: Noticeable but not distracting
- **Removal**: Remove if ornamental only

## Core Features Implementation

### Session Logging

Uses `DataSurface` containers with `label-md` typography for metadata and `body-md` for descriptions.

### AI Technique Helper

Technique selection uses `Toggle` components with `secondary-container` backgrounds for broad categories and `primary-container` for active selections.

### Effort Rating

1-5 scale displayed as `text-display-sm` with trend indicators using `success`, `warning`, or `error` containers.

### Dashboard Overview

Uses asymmetrical layout with `headline-lg` titles and `DataStrip` components for metrics.

## Accessibility & Governance

### Accessibility Standards

- WCAG AA minimum contrast for all text
- Keyboard navigation with visible focus states
- Screen reader-friendly semantic HTML
- High-contrast mode with proper outline fallbacks

### Feedback States

- Notices use an alert live region, with a heading followed by descriptive copy.
- Reinforce semantic tones with an icon and the corresponding semantic color
  token; warning notices use `warning`, while informational notices use `info`.
- Do not rely on passed-in copy or color alone to communicate a notice's state.

### Version Control

- **MAJOR**: Breaking changes (token renames, component API changes)
- **MINOR**: Non-breaking changes (new tokens, visual refinements)
- **Governance**: Design changes require approval from Design, Frontend, and QA owners

## References

- [DESIGN.md](DESIGN.md) - Comprehensive design system documentation
- [src/lib/design-tokens.ts](../src/lib/design-tokens.ts) - Canonical token definitions
- [docs/MARKDOWN_STYLE.md](MARKDOWN_STYLE.md) - Documentation standards
- [AGENTS.md](../AGENTS.md) - Project guidelines and architecture
