# Video Library Plugin

## Purpose and capabilities

- UI contract baseline: [docs/plugin-ui-contract.md](../../docs/plugin-ui-contract.md).

The Video Library plugin provides a **dashboard tab** for browsing linked session videos, running lightweight health checks, and reviewing domain policy for trusted providers.

- **Primary capability:** `video_audit`
- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `video-library-dashboard-tab`
  - tab id: `video-library`
  - tab title: `Video Library`
  - header title: `Video Library`
  - icon: `film`
  - component id: `video_library`

## Usage

1. Start the app with `npm run dev`.
2. Open **Dashboard → Video Library**.
3. Browse linked videos, then review any disallowed domains or recent link-check results that need attention.
4. Use **Edit** to update a single session or **Remove video** to clear a stored `videoUrl`.
5. Add custom domains if you are signed in and preferences are available.
6. Use browse-first tabs (`Watchable`, `Needs attention`, `All`, optional `No video`), plus filters and per-row or filtered bulk checks for deeper audits.

## Verification

Run these checks:

```bash
npm test -- plugins/video-library/plugin.test.ts
npm test -- plugins/video-library/src/index.test.ts
npm test -- src/lib/video-library.test.ts
npm test -- src/tests/api-video-library-check-links-route.test.ts
npm test -- src/components/video-library.ux.test.tsx
npm test -- src/components/video-library.destructive.test.tsx
```
