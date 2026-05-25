# Setup & Deployment Guide

## Overview

This guide consolidates all critical setup steps for deploying MatMetrics. Essential configuration information was previously scattered across [README.md](README.md), [nextsteps.md](nextsteps.md), and [DESIGN.md](DESIGN.md). Follow this guide to ensure complete and error-free deployment.

## Prerequisites

### Development Environment
- Node.js 24.x
- npm 11.x
- Google Gen AI API key (for AI-powered features)
- GitHub personal access token for GitHub-backed storage

### Production Environment
- Vercel account
- Firebase project
- GitHub repository for session storage

## Complete Setup Checklist

### 1. Environment Variables Configuration

#### Local Development
```bash
cp .env.example .env.local
```

Add all required variables to `.env.local`:

| Variable | Required | Source |
|----------|----------|--------|
| `GITHUB_TOKEN` | ✓ | GitHub → Settings → Developer settings → Personal access tokens |
| `GOOGLE_GENAI_API_KEY` | ✓ | [ai.google.dev](https://ai.google.dev/) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✓ | Firebase console → Project Settings → Your web app |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✓ | Firebase console → Project Settings → Your web app |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✓ | Firebase console → Project Settings → Your web app |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✓ | Firebase console → Project Settings → Your web app |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✓ | Firebase console → Project Settings → Your web app |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✓ | Firebase console → Project Settings → Your web app |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | ✓ | Firebase console → Project Settings → Service accounts |

#### Vercel Configuration
Add all environment variables to Vercel dashboard under **Environment Variables**:

**Critical Notes:**
- `NEXT_PUBLIC_*` variables are baked at build time and require redeployment to take effect
- Changes to these variables alone (without code changes) need a manual "Redeploy" in Vercel dashboard

### 2. Firebase Project Setup

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Add a web app to the project

#### Get Firebase Configuration
From Firebase console → Project Settings → Your web app, copy the configuration values:

| Variable | Where to find it |
|----------|------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase SDK config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase SDK config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase SDK config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase SDK config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase SDK config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase SDK config |

#### Generate Service Account Key
1. Go to Firebase console → Project Settings → Service accounts
2. Click "Generate new private key" → download `.json` file
3. Convert to single-line string for environment variable:

```bash
cat /path/to/your-downloaded-key.json | tr -d '\n'
```

4. Set as `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable
5. Delete the downloaded JSON file (sensitive credential)

**⚠️ Critical Pitfall:** The service account JSON contains literal `\n` characters in the `private_key` field. Vercel's environment variable editor can mangle them. Always paste as a single-line JSON string.

### 3. Firestore Security Rules

**Required before any real use** - Firestore was likely created in test mode (open access).

1. Go to Firebase console → **Firestore → Rules**
2. Set the following rules:

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

This ensures each user can only read/write their own preferences document.

### 4. Firebase Authorised Domains (Most Commonly Missed Step)

Once Vercel assigns your deployment URL (e.g., `matmetrics-xyz.vercel.app`), you must add it to Firebase:

1. Go to Firebase console → **Authentication → Settings → Authorised domains**
2. Add both:
   - Your main Vercel domain (e.g., `matmetrics-xyz.vercel.app`)
   - Any Vercel preview URLs if you want preview deployments to support auth (e.g., `matmetrics-abc.vercel.app`)

**⚠️ If you skip this step, authentication will fail.**

### 5. GitHub Token Setup

For GitHub-backed session storage:

1. Create GitHub personal access token:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with "repo" scope
2. Set `GITHUB_TOKEN` environment variable

**Note:** When `GITHUB_TOKEN` is missing, GitHub sync features will not work even if Firebase auth is configured.

## Deployment Process

### Vercel Deployment (Recommended)

1. **Push to GitHub**: Ensure your code is on GitHub

2. **Create Vercel Project**:
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New" → "Project"
   - Select your GitHub repository
   - Click "Import"

3. **Configure Environment Variables**:
   - In the "Environment Variables" section, add:
     - `GITHUB_TOKEN`: Fine-grained token with repository contents write access
     - `GOOGLE_GENAI_API_KEY`: Your Google Gen AI API key from [ai.google.dev](https://ai.google.dev/)
     - All Firebase variables from step 1

4. **Set Runtime**: Configure Node.js 24.x for both local development and deployment

5. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

### Data Storage Behavior
- **Before GitHub configuration**: Sessions are written to local markdown storage under `data/YYYY/MM/`
- **After GitHub setup**: Sessions are stored directly in the configured repository
- **Browser behavior**: Always maintains local cache and offline sync queue

## Post-Deployment Verification

### 1. Test Authentication
- Try to log in using Firebase authentication
- Verify that user preferences can be saved

### 2. Test Session Storage
- Create a test session
- Verify it appears in the session list
- Check that it's stored in GitHub (if configured) or local markdown files

### 3. Test AI Features
- Try the technique suggestion feature
- Verify Google Gen AI integration is working

### 4. Test GitHub Sync
- Enable GitHub sync in the app settings
- Verify sessions sync between local and remote storage

## Troubleshooting

### Common Issues

#### Authentication Fails
- Check Firebase Authorised Domains configuration
- Verify all `NEXT_PUBLIC_FIREBASE_*` variables are correctly set
- Ensure deployment URL matches exactly what's added to Firebase

#### Service Account Key Issues
- Verify the key is pasted as a single-line JSON string
- Check that `\n` characters in `private_key` are escaped as `\\n`
- Regenerate the key if corrupted

#### GitHub Sync Not Working
- Verify `GITHUB_TOKEN` has correct permissions
- Check repository access permissions
- Verify the token is not expired

#### Build Failures
- Ensure all environment variables are set before build
- Check Node.js version compatibility (requires 24.x)
- Verify dependency installation is complete

## Related Documentation

- [Project Overview](README.md) - General project information and tech stack
- [Next Steps](nextsteps.md) - Additional post-deployment configuration details
- [Design System](DESIGN.md) - Visual design tokens and component specifications
- [Go Contract](docs/go-contract.md) - Session data format and storage contracts

## Quick Reference Summary

| Task | Location | Criticality |
|------|----------|-------------|
| Environment Variables | Step 1 | 🔴 Critical |
| Firebase Service Account Key | Step 2 | 🔴 Critical (common pitfall) |
| Firestore Security Rules | Step 3 | 🔴 Critical |
| Firebase Authorised Domains | Step 4 | 🔴 Critical (most commonly missed) |
| GitHub Token | Step 5 | 🟡 Important |
| Vercel Deployment | Deployment Process | 🟡 Important |

**Key Takeaway:** The most common deployment failures are missing Firebase Authorised Domains and improper FIREBASE_SERVICE_ACCOUNT_KEY formatting. Double-check these two items before deployment.