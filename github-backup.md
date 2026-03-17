Step 1: Create GitHub PAT

Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
Click "Generate new token"
Name: matmetrics
Repository: Select the repo (or create new: my-judo-diary)
Permissions needed:
Contents: Read and write
Commit statuses: Read-only
Generate and copy the token
Step 2: Add to Vercel

Go to your Vercel project dashboard
Settings → Environment Variables
Add variable: GITHUB_TOKEN = <your-token>
Redeploy
Step 3: Configure in App

Open matmetrics and navigate to Settings
Go to "GitHub Sync"
Enter your GitHub username and repo name
Click "Test Connection"
Click "Sync All Sessions" to push existing local markdown entries
Done! New sessions will sync automatically
