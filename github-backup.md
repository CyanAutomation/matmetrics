# GitHub Sync Setup Guide

This guide walks you through configuring GitHub as a backup storage location for your MatMetrics Judo training sessions. Once configured, all your sessions are automatically backed up and version-controlled in a GitHub repository.

## Overview

GitHub Sync enables:

- **Automatic backups** of all training sessions to a GitHub repository
- **Version control** for session history and changes
- **Multi-device sync** access to your sessions across devices
- **Data portability** — your sessions remain in a format you control

## Prerequisites

- A GitHub account ([github.com](https://github.com))
- A GitHub repository (new or existing) to store session markdown files
- Vercel deployment with access to environment variables

## Step 1: Create a GitHub Personal Access Token

A Personal Access Token (PAT) authenticates MatMetrics with your GitHub account securely.

### Instructions

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens)
2. Click **"Generate new token"**
3. Fill in the token details:
   - **Token name:** `matmetrics`
   - **Expiration:** Select 90 days or custom period (note renewal reminders)
   - **Resource owner:** Your personal account
   - **Repository access:** Select specific repository or "All repositories"
     - For new repo: Choose "All repositories"
     - For existing repo: Select the specific repository
4. Configure permissions under **Repository permissions**:
   - **Contents:** Read and write (required for creating/updating session files)
   - **Commit statuses:** Read-only (optional, for CI integration)
5. Click **"Generate token"** and copy the token immediately
   - ⚠️ **Important:** You cannot view the token again; save it securely (e.g., in a password manager)

## Step 2: Configure Token in Vercel

Deploy your token to Vercel's environment variables so MatMetrics can authenticate with GitHub.

### Instructions

1. Go to your Vercel project dashboard
   - URL: `https://vercel.com/dashboard` → Select your MatMetrics project
2. Navigate to **Settings → Environment Variables**
3. Add a new environment variable:
   - **Name:** `GITHUB_TOKEN`
   - **Value:** Paste the token from Step 1
   - **Environments:** Select Production (and Preview if you want preview deploys to sync)
4. Click **"Save"**
5. Trigger a **redeploy** to apply the environment variable:
   - Go to **Deployments** tab
   - Click the three-dot menu on the latest deployment
   - Select **"Redeploy"**
   - Confirm redeployment

> **Note:** Simply pushing code does not redeploy if only environment variables changed. Use the Redeploy button in the Vercel dashboard.

## Step 3: Configure GitHub Sync in MatMetrics

Link your GitHub repository to your MatMetrics account in the app settings.

### Instructions

1. Open MatMetrics (your deployed app)
2. Navigate to **Settings → GitHub Sync**
3. Enter your GitHub repository details:
   - **GitHub username:** Your GitHub username (e.g., `john-doe`)
   - **Repository name:** Name of the repo where sessions will be stored (e.g., `my-judo-diary`)
4. Click **"Test Connection"** to verify the token and repository access
   - Success: You'll see a confirmation message
   - Error: Check the token and repository name are correct
5. Click **"Sync All Sessions"** to push all existing local sessions to GitHub
   - This creates a backup of all previously logged sessions
   - Sessions are stored in `data/YYYY/MM/YYYYMMDD-matmetrics.md` format

## Step 4: Verify Sync is Active

After setup, verify that sync is working correctly.

### In MatMetrics

1. Log a new training session in the app
2. Complete the session and save it
3. Navigate to **Settings → GitHub Sync**
4. Check the status panel for "Last sync: [timestamp]"

### In GitHub

1. Go to your GitHub repository
2. Navigate to the **`data/`** folder
3. Browse to `data/YYYY/MM/` where `YYYY-MM` matches the current date
4. Confirm your session markdown file appears:
   - File format: `YYYYMMDD-matmetrics.md` (e.g., `20260421-matmetrics.md`)
   - File contains YAML frontmatter with session metadata (id, date, effort, category)
   - Session description and techniques are present

## Troubleshooting

### "Connection failed" Error

**Problem:** Test connection shows an error.

**Solutions:**

- Verify `GITHUB_TOKEN` is set in Vercel environment variables (not just locally)
- Confirm you used **"Redeploy"** (not just pushing code) after adding the token
- Check token has not expired; if expired, generate a new one and update Vercel
- Ensure the repository name matches exactly (case-sensitive on some systems)

### Sessions not appearing in GitHub

**Problem:** You logged sessions in MatMetrics but they don't appear in GitHub.

**Solutions:**

- Verify the token has "Contents: Read and write" permissions
- Manually trigger sync: Go to **Settings → GitHub Sync → Sync All Sessions**
- Check Vercel deployment logs for errors (Vercel Dashboard → Logs → Runtime)
- Ensure you're looking in the correct GitHub repository
- Refresh the GitHub page (local cache may be outdated)

### Token Expiration

**Problem:** Sync suddenly stops working after several weeks.

**Solutions:**

- GitHub fine-grained tokens typically expire after 90 days
- Generate a new token in [GitHub Settings](https://github.com/settings/personal-access-tokens)
- Update the `GITHUB_TOKEN` value in Vercel
- Redeploy the app using the Vercel dashboard

## Auto-Sync Behavior

Once configured:

- New sessions are **automatically synced** to GitHub within ~30 seconds of creation
- Updated sessions are synced with each save
- Deleted sessions are synced as deletions (soft-deleted in GitHub)
- Local fallback: If sync fails, sessions remain stored locally in `data/YYYY/MM/`

## Security Notes

- **Never commit the token to Git** — keep it in Vercel environment variables only
- **Rotate tokens regularly** — consider setting a 90-day expiration in GitHub
- **Limit repository scope** — if possible, create a dedicated `my-judo-diary` repository for sessions only
- **Review GitHub permissions** — PAT should have minimal permissions (Contents: read/write only)

## See Also

- [MatMetrics README](./README.md) — Project overview
- [docs/go-contract.md](./docs/go-contract.md) — Session data format specification
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) — Official GitHub documentation
