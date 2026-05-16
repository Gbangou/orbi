# Orbi Version Control

Git is mandatory for Orbi. Do not continue serious development without
commits, branches and rollback points.

## One-Time Local Setup

Run these commands with your real identity:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

This stores the identity only for this repo. Use `--global` if you want the same
identity for all repos on your machine.

## First Commit

After checking that `.env` files are ignored:

```bash
git status --short
git add .
git commit -m "Initial Orbi production foundation"
```

## Daily Workflow

```bash
git status --short
git switch -c feature/short-name
pnpm --filter backend test -- --runInBand
pnpm typecheck
git add .
git commit -m "Describe the completed change"
```

## Rules

- Never commit `.env`, secrets, database dumps, build output or `node_modules`.
- Commit after each coherent slice, not after days of work.
- Use branches for risky changes.
- Run tests before committing.
- If a generated file appears unexpectedly, inspect it before adding it.
