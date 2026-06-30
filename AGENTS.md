<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Post-P0 status: Phase 1 P0 security hardening has been applied to Production through `supabase/migrations/020_p0_security_hardening_phase1.sql` and verified in `DOCS/PROD_VERIFY_20260625.md` under the 2026-06-29 section. Baseline/schema/RPC realignment is still pending. Treat `DOCS/DB_SCHEMA.md`, `DOCS/RPC_FUNCTIONS.md`, `DOCS/RPC_SPEC.md`, and `DOCS/SYNC_AUDIT.md` as historical references until they are regenerated from Production; for DB/RLS/RPC work, check `DOCS/PROD_VERIFY_20260625.md` and migration 020 first.

## Project Context

- SYNC is a fandom archiving and reward platform.
- The current priority is Phase 1.5 / post-P0 stabilization: baseline migration recovery, schema/RPC documentation realignment, and stable development rule-setting.
- Do not prioritize new feature expansion unless explicitly requested.
- Prioritize security verification, safe changes, and stable engineering workflow.

## Operational Rules and Documentation Sync

Before finishing meaningful work, decide whether tests and documentation sync are required for the size and risk of the change.

Documentation sync must be considered when work includes:

- Phase transitions
- DB schema, RLS, grants, RPC, or migration changes
- Reward or settlement rule changes
- AI agent workflow or operating-rule changes
- Product direction changes
- Deployment, environment-variable, or security-operation changes
- Completion of a feature-sized unit of work
- Discovery and resolution of an important regression during testing

Use these documentation sync levels:

- Level 0: no document update needed for typo fixes, tiny style changes, or internal-only implementation changes with no policy or flow impact.
- Level 1: update record/verification documents only for test results, verification results, or small bug fixes.
- Level 2: update the related documents for one completed feature, API/RPC call-flow change, or UI-flow change.
- Level 3: perform full document synchronization for phase transitions, DB/RLS/RPC changes, reward/settlement policy changes, or Source of Truth changes.

Feature Definition of Done:

- User value is clear.
- Core user flow has been tested at the right level.
- Loading, empty, error, and permission states are checked when relevant.
- Documentation sync need has been judged.
- Test results or decisions are recorded when they affect future work.

DB/RLS/RPC Definition of Done:

- State impact scope before making changes.
- State migration or SQL apply method.
- Run post-apply verification or equivalent local verification.
- Record rollback/recovery plan.
- Record results in `DOCS/PROD_VERIFY_YYYYMMDD.md` or the relevant verification document.
- Decide whether `DOCS/DB_SCHEMA.md`, `DOCS/RPC_FUNCTIONS.md`, and `DOCS/RPC_SPEC.md` need sync.
- Check service_role exposure and client exposure.

Refactoring policy:

- Do not casually mix feature work and broad refactoring.
- Define scope, test method, and rollback plan before refactoring.
- Plan refactoring after a feature bundle completes, complexity/duplication accumulates, around phase transitions, or during stabilization after security/performance work.
- Limit UI and structure refactoring during P0/P1 security stabilization.

Documentation Source of Truth:

- Repo IDE docs and browser AI shared docs are both synchronization targets.
- After repo docs are updated, note any browser AI shared docs that need the same status update.
- Keep paired docs such as `design.md` and `design-process.md` consistent across locations.
- For historical references, prefer adding a banner and links to current verification docs instead of overwriting history.

Operating rules are living documents. When repeated mistakes, missed tests, missed docs, or AI workflow errors happen, add a concrete prevention rule that says when it applies, what to check, and where to record the result.

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
