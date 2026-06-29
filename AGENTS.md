<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

During Phase 1 recovery, existing DOCS files are treated as historical references only. The Production Supabase database is the temporary Source of Truth until the baseline migration is rebuilt. Do not treat DOCS/DB_SCHEMA.md, DOCS/RPC_FUNCTIONS.md, DOCS/RPC_SPEC.md, or DOCS/SYNC_AUDIT.md as authoritative for current Production DB state.

## Project Context

- SYNC is a fandom archiving and reward platform.
- The current priority is Phase 1: P0 security recovery, DB drift recovery, and development rule-setting.
- Do not prioritize new feature expansion unless explicitly requested.
- Prioritize security verification, safe changes, and stable engineering workflow.

## Security-Sensitive Areas

Treat the following areas as security-sensitive:

- Supabase authentication and session handling
- Supabase client/server helpers
- admin checks and is_admin
- VIBE, rewards, settlements, views, syncs, and activity logging
- API routes, server actions, RPC calls, and database access code
- RLS policies, schema definitions, migrations, and production DB access

When touching these areas:

- explain the expected impact and risk before changing code
- keep the diff minimal
- preserve existing behavior unless explicitly asked to change it
- do not change DB schema, RLS, migration, or production data without explicit user approval

## Change Scope

- Make the smallest safe change that satisfies the user request.
- Do not refactor unrelated code unless explicitly requested.
- Do not rename files, move files, change folder structure, or rewrite large components unless necessary and approved.
- Preserve existing behavior unless the user explicitly asks to change it.
- Prefer targeted fixes over broad rewrites.

## Forbidden Without Explicit Approval

Do not run, create, modify, or apply any of the following without explicit user approval:

- Supabase remote project commands
- supabase link
- supabase db push
- supabase db pull
- supabase db reset
- migration apply commands
- schema or RLS policy changes
- production SQL execution
- .env, .env.local, .env.*, secrets, service_role keys, API tokens, credentials, or private keys
- deploy, release, or production-targeting commands
- git push, git push --force, or remote-changing git operations
- destructive shell commands such as rm -rf
- curl | sh, curl | bash, or equivalent remote script execution

## Dependency and Configuration Changes

- Do not install, remove, or upgrade packages without explicit user approval.
- Do not modify package.json, lockfiles, next.config, Tailwind config, tsconfig, middleware, auth config, or environment-related config without explaining why first.
- If a dependency or configuration change seems necessary, stop and ask for approval with:
  - reason
  - expected impact
  - affected files
  - rollback plan

## Validation

After code changes, run relevant local validation commands when available and safe:

- pnpm typecheck
- pnpm lint
- pnpm test
- npm run typecheck
- npm run lint
- npm test

If validation fails:

- analyze the failure
- fix the issue with the smallest safe change
- rerun the relevant validation

Do not weaken, skip, delete, or bypass tests, lint rules, type checks, auth checks, or security checks just to make validation pass.

## Failure Handling

- If the same validation fails twice for the same reason, stop and summarize the blocker.
- Do not make broad speculative changes to fix unclear failures.
- Ask for user direction before expanding scope.
- Do not hide unresolved failures.

## Completion Report

After completing a task, report only:

1. Files changed
2. What changed
3. Validation commands run and results
4. Any skipped validation and reason
5. Remaining risks or follow-up items
6. Rollback method if relevant

Do not paste long diffs into chat. The user will review diffs in the Codex, Cursor, or Git diff UI.

## Security Boundary

AGENTS.md is workflow guidance, not a security boundary.
High-risk actions still require human approval and should be enforced through CI, branch protection, secret management, Supabase permissions, and production access controls.
