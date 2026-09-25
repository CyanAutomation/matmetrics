---
name: front-end-design
description: Make visual and interaction decisions for a new or substantially changed MatMetrics page or component.
license: MIT
---

# Front-End Design

Use this skill when a task needs visual direction or a meaningful UI composition. For small fixes, follow the existing component and design patterns.

## Start with the product

- Read the user’s brief and inspect the existing page before choosing a layout.
- Follow the colors, typography, spacing, and component patterns in [docs/blueprint.md](../../../docs/blueprint.md).
- For plugin surfaces, follow [docs/plugin-ui-contract.md](../../../docs/plugin-ui-contract.md) and [docs/plugin-design-principles.md](../../../docs/plugin-design-principles.md).
- Distinguish a marketing page from a working app. Do not add a hero or promotional copy to a dashboard unless the brief calls for it.

## Compose for the task

- Give each screen a clear primary task and make the most relevant content easy to scan.
- Use headings, spacing, alignment, and contrast to establish hierarchy before adding decorative surfaces.
- Use cards when they express a real group or interaction; avoid both card mosaics and cardless layouts as automatic rules.
- Keep product copy concrete: describe status, scope, freshness, and next action.
- Reuse existing design tokens, Radix primitives, and icon conventions. Check package.json before proposing a new UI or animation dependency.

## Interaction and accessibility

- Add motion only when it clarifies state or strengthens the requested visual direction. Keep essential actions usable without animation.
- Respect prefers-reduced-motion and preserve keyboard navigation, focus visibility, labels, and sufficient contrast.
- Make loading, empty, error, and destructive states understandable in text as well as color or icons.
- Check narrow layouts and long content; do not optimize only for a desktop screenshot.

## Verify

Use the project’s existing component tests and linting for changed UI. For plugin dashboard components, run npm run validate:plugin-ui-contract. Follow the relevant design-system guidance rather than introducing new visual rules for a single page.
