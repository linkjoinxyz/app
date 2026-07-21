# /deploy — LinkJoin Deploy Skill

Ship the current branch all the way to production. Follows the repo's squash-merge workflow and
automatically resyncs dev with main afterward to prevent SHA divergence.

---

## Step 0: Pre-flight

Run these in parallel:

```bash
git status --short
git branch --show-current
```

**Rules:**
- If there are uncommitted changes: STOP. Tell the user to commit or stash first.
- Determine scope from the current branch:
  - **Feature branch** (anything that is not `dev` or `main`): run all steps.
  - **On `dev`**: skip Step 2 (feature→dev), run Steps 1 and 3–6.
  - **On `main`**: nothing to ship. Tell the user and stop.

---

## Step 1: Build verification

```bash
cd linkjoin-frontend && npm run build
```

Stop on build failure and report the error before doing anything with git.

---

## Step 2: Feature → dev (skip if already on dev)

Derive a PR title from the branch name: strip `feature/` or `fix/` prefix, replace hyphens with
spaces, title-case the result.

```bash
gh pr create --base dev --title "<derived title>" --body "Squash merge of $(git branch --show-current) into dev."
# capture the PR number from the output URL
gh pr merge <PR#> --squash --delete-branch
git checkout dev && git pull origin dev
```

---

## Step 3: dev → main

First push local dev to origin so the PR captures all local commits:

```bash
git push origin dev
gh pr create --base main --head dev --title "<same title as above>" --body "Deploy to production."
# capture the PR number
gh pr merge <PR#> --squash
```

---

## Step 4: Resync dev with main (mandatory)

This step prevents the "main is N commits ahead of and M commits behind dev" divergence that
happens because squash merges produce different SHAs on each branch.

```bash
git fetch origin
git checkout dev && git pull origin dev
git merge origin/main --no-edit
git push origin dev
```

---

## Step 5: Backend change detection

```bash
git diff origin/main~1 origin/main -- linkjoin-backend/
```

If any files changed in `linkjoin-backend/`:

> **Manual action required:** CI has pushed a new Docker image to Docker Hub, but Azure App
> Service does NOT auto-pull it. Go to:
> **Azure Portal → App Services → your linkjoin backend service → Restart**
> Allow ~2 minutes for the new container to come up before testing production.

If no backend files changed, skip this notice.

---

## Step 6: Summary

Print a brief summary:

```
Shipped:
  feature→dev PR: <URL or "skipped — started on dev">
  dev→main  PR: <URL>

Dev resynced with main. No more divergence.

Backend changed: <yes — restart Azure / no — no action needed>
Frontend: Vercel auto-deploys from main. Check https://vercel.com/dashboard if it
          does not appear live within 2 minutes.

CI run: <output of `gh run list --limit 1`>
```
