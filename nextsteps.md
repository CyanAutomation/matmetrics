# Next Steps

## 1. Set Firestore Security Rules (Required before any real use)

There are no `firestore.rules` in the project and the Firestore database was likely created in test mode (open access). You must lock it down. In the Firebase console go to **Firestore → Rules** and set:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> This ensures each user can only read/write their own preferences document.

## 2. The One Gotcha: FIREBASE_SERVICE_ACCOUNT_KEY

This is the most common Vercel + Firebase pitfall. The service account JSON contains literal `\n` characters in the `private_key` field, and Vercel's environment variable editor can mangle them.

### Two safe approaches

**Option A (simplest)** — paste as a single-line JSON string:

In your terminal, run:

```bash
cat /path/to/your-downloaded-key.json | tr -d '\n'
```

Paste the result as the value in Vercel. Your `firebase-admin.ts` already handles this correctly with `.replace(/\\n/g, '\n')`.

**Option B** — use a Base64-encoded value:

Then decode it in `firebase-admin.ts` before parsing. This is more robust but requires a code change.

> Option A is fine for this project since the `parseServiceAccountKey` function already handles the escaped newlines.

## 3. `NEXT_PUBLIC_*` Variables Are Baked at Build Time

Unlike server-only variables, the `NEXT_PUBLIC_FIREBASE_*` variables are embedded into the JavaScript bundle during `next build`. In Vercel, set them under **Environment Variables** and ensure they are scoped to the correct environments (Production, Preview, Development). If you change them, you must redeploy — a new deploy is not enough if only triggered by a push with no code changes (use "Redeploy" in the Vercel dashboard).

## 4. Add Your Vercel Domain to Firebase Authorised Domains

This is the step most people miss. Once Vercel assigns your deployment URL (e.g. `matmetrics.vercel.app`), go to:

### Firebase console configuration

Navigate to: Authentication → Settings → Authorised domains → Add domain

Add both:

- `matmetrics-xyz.vercel.app` (or your custom domain)
- Any Vercel preview URLs if you want preview deployments to support auth (e.g. `matmetrics-abc.vercel.app`)

## Summary

| Task                         | Action                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| App env vars                 | Add all `.env.example` vars in Vercel dashboard                |
| FIREBASE_SERVICE_ACCOUNT_KEY | Paste as single-line JSON, verify newlines are escaped as `\n` |
| NEXT*PUBLIC*\* changes       | Requires a redeploy to take effect                             |
| Firebase authorised domains  | Add your `*.vercel.app` domain before testing login            |
| Code changes                 | None required                                                  |

---

## Detailed: Getting Your Firebase Service Account Key

What you actually need to do is click **"Generate new private key"** at the bottom. This downloads a `.json` file. The contents of that file become your `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable.

### What to do with the downloaded JSON

1. Click **"Generate new private key"** → download the `.json` file

2. In your terminal, convert it to a single-line string:

```bash
cat /path/to/your-downloaded-key.json | tr -d '\n'
```

1. Copy the output and set it as `FIREBASE_SERVICE_ACCOUNT_KEY`:
   - **Locally**: paste into `.env.local`
   - **Vercel**: paste as an environment variable in the dashboard

2. Delete the downloaded `.json` file — it's a sensitive credential and shouldn't sit on disk or be committed to git.
