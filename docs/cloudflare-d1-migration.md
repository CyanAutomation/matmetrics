# Cloudflare D1 Migration

## Scope

This migration replaces Firestore persistence for user preferences and plugin
overrides. Firebase Authentication remains the identity provider in this phase.
Session records remain GitHub-backed Markdown files (with their existing local
fallback) and are deliberately out of scope.

## Architecture

```text
Browser -> Vercel Next.js API -> signed Cloudflare Worker -> D1
```

The browser only calls same-origin Next.js routes. Vercel verifies the Firebase
ID token, then signs each Worker request with the target path, HTTP method,
timestamp, and SHA-256 of the request body. The Worker rejects signatures older
than 60 seconds. Do not expose the Worker secret to the browser or use D1's
administrative REST API from Vercel.

## Deployment

1. Create separate `matmetrics-data-dev`, `matmetrics-data-preview`, and
   `matmetrics-data` D1 databases.
2. Replace `database_id` in each environment's Worker configuration. Do not
   commit an account-specific ID if this Worker is shared across deployments.
3. In `workers/matmetrics-data`, install dependencies and apply migrations:

   ```bash
   npm install
   npm run migrate:remote
   npm run deploy
   ```

4. Set the same randomly generated `MATMETRICS_INTERNAL_API_SECRET` as a
   Cloudflare Worker secret and a Vercel server-only environment variable.
5. Set `CLOUDFLARE_DATA_WORKER_URL` in Vercel to the deployed Worker URL.
6. Deploy the Next.js application. Until both variables are present, it retains
   the Firestore server-side fallback, which permits a controlled cutover.

## Data Migration and Cutover

1. Export `users/{uid}/preferences/app` from Firestore.
2. Normalize every exported document using the application's preference
   normalization logic, then import one D1 row per user with `revision = 0`.
3. Compare user counts and a sampled set of normalized documents.
4. Deploy with D1 variables enabled; exercise preference reads/writes and
   plugin changes for a test account.
5. Keep Firestore credentials and data untouched through a rollback window.
6. After the rollback window, remove the Firebase Firestore SDK/Admin SDK and
   service-account variable. Firebase Auth remains until its separate migration.

Plugin overrides are now per user: `(user_id, plugin_id)` is the primary key.
The prior global Firestore document must not be imported as a global setting.
If legacy global defaults are desired, apply them once to each user at first
login through an explicit product decision.

## Rollback

Remove `CLOUDFLARE_DATA_WORKER_URL` from Vercel and redeploy. The application
falls back to its server-side Firestore preference store. Before schema or bulk
data changes, create a D1 recovery point; D1 Time Travel provides the recovery
mechanism for current databases.
