# Video Library Plugin

## Purpose and capabilities

The Video Library plugin provides a **dashboard tab** for auditing `videoUrl` coverage, reviewing domain policy, and running live link checks against approved providers.

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
3. Review sessions missing videos, sessions with disallowed domains, and any results from the latest link check.
4. Use **Edit** to update a single session or **Remove video** to clear a stored `videoUrl`.
5. Add custom domains if you are signed in and preferences are available.
6. Use review tabs, filters, and per-row or filtered bulk checks to focus the current audit task.

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
