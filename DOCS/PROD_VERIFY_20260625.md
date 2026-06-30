# SYNC Production Verification - 2026-06-25

## Verification Principles
- During Phase 1 recovery, existing DOCS files are treated as historical references only.
- The Production Supabase database is the temporary Source of Truth until the baseline migration is rebuilt.
- Findings in this document should distinguish between Confirmed facts, suspected risks, and follow-up items.
- No Production schema changes are made by this document.

---

## H-01: view count RPC abuse

### Status
Confirmed

### Severity
P0 / Critical when combined with H-02

### Summary
`increment_view_count_v4` can be executed by `anon` and `authenticated` roles. The function increments `activity_logs.view_count` on every call. This may be partly aligned with the product intention that `view_count` acts as a public popularity/display metric, including anonymous views. However, the current production settlement function uses `view_count` for VIBE bonus calculation, which turns the display metric into an economic reward input.

### Evidence
- Production DB contains:
  - `public.increment_view_count_v2(p_log_id uuid, p_user_id uuid)`
  - `public.increment_view_count_v3(p_log_id uuid, p_user_id uuid)`
  - `public.increment_view_count_v4(p_log_id uuid, p_user_id uuid)`
- `increment_view_count_v4` is `SECURITY DEFINER`.
- `increment_view_count_v4` has no function-level `search_path` config.
- EXECUTE privilege check confirmed:
  - `increment_view_count_v2`: `anon = true`, `authenticated = true`, `service_role = true`
  - `increment_view_count_v3`: `anon = true`, `authenticated = true`, `service_role = true`
  - `increment_view_count_v4`: `anon = true`, `authenticated = true`, `service_role = true`
- `increment_view_count_v4` always runs:
  - `UPDATE activity_logs SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_log_id`
- `increment_view_count_v4` inserts into `activity_view_logs` only when `p_user_id` is not null.
- `qualified_view_count` is incremented only when an `activity_view_logs` insert succeeds.
- `activity_view_logs` has a UNIQUE constraint:
  - `UNIQUE(user_id, activity_id, viewed_at)`
- `activity_view_logs.user_id` references `public.profiles.id`.
- `activity_view_logs.activity_id` references `public.activity_logs.id`.
- No custom trigger exists on `activity_view_logs`.
- Function body does not check:
  - `p_user_id = auth.uid()`
  - whether the activity is approved
  - whether the viewer is the activity author
  - rate limits for public `view_count`

### Product Context
The intended product distinction appears to be:
- `view_count`: public display/popularity metric, including anonymous traffic
- `qualified_view_count`: restricted metric for reward/settlement

This distinction is acceptable as a product direction, but the current production implementation violates it because settlement uses `view_count`.

### Impact
- `view_count` can be increased repeatedly by direct RPC calls.
- If `view_count` is used for ranking, discovery, trust, or settlement, those systems can be manipulated.
- Because H-02 confirms settlement uses `view_count`, H-01 has direct reward-economy impact.
- `qualified_view_count` has same-user/day duplicate protection, but `p_user_id` is caller-supplied and not verified against `auth.uid()`, so user-id spoofing remains a risk.

### Dynamic Test
Not executed.

### Reason Dynamic Test Was Not Executed
Static verification is sufficient for the main risk because:
- The RPC is executable by `anon` and `authenticated`.
- The function body unconditionally increments `view_count`.
- H-02 confirms `view_count` is used for settlement rewards.

### Required Fix
- Do not use `view_count` for reward or settlement calculation.
- Use only a verified qualified-view metric for reward settlement.
- Replace `p_user_id` with `auth.uid()` inside the RPC or validate `p_user_id = auth.uid()`.
- Consider creating a new `increment_view_count_v5` with explicit policy:
  - public display views may increment `view_count`
  - rewardable qualified views must be authenticated and tied to `auth.uid()`
  - approved activity only
  - optional self-view policy should be explicit
- Revoke EXECUTE from unused old RPCs:
  - `increment_view_count_v2`
  - `increment_view_count_v3`
- After code search confirms no references, drop unused old RPCs in a cleanup migration.

---

## H-02: settlement RPC abuse

### Status
Confirmed

### Severity
P0 / Critical

### Summary
`perform_weekly_settlement` calculates VIBE settlement bonuses from `activity_logs.view_count`, not `qualified_view_count`. The function is `SECURITY DEFINER`, mutates reward balances, contains no internal admin authorization check, and can be executed by `anon` and `authenticated` roles.

### Evidence
- Production DB contains:
  - `public.perform_weekly_settlement()`
- The function is `SECURITY DEFINER`.
- The function is owned by `postgres`.
- The function has `search_path=public`.
- Function body calculates:
  - `SUM(COALESCE(al.view_count, 0)) as weekly_views`
  - `v_bonus := (r.weekly_syncs * 5) + (r.weekly_views / 10)`
- Function updates:
  - `profiles.total_vibes = COALESCE(total_vibes, 0) + v_bonus`
- Function inserts:
  - `settlement_history(user_id, week_start, total_syncs_count, total_views_count, bonus_vibes)`
- Function updates `activity_logs`:
  - `is_settled = TRUE`
  - `bonus_vibes = sync_count * 5 + view_count / 10`
  - `total_reward_vibes = base_vibes + sync_count * 5 + view_count / 10`
- Function body does not check:
  - `auth.uid()`
  - `profiles.is_admin`
  - dedicated admin table membership
  - custom role claims
  - any equivalent admin authorization condition
- EXECUTE privilege check confirmed:
  - `anon = true`
  - `authenticated = true`
  - `service_role = true`

### Impact
- Non-admin callers may directly execute settlement.
- Inflated `view_count` can be converted into VIBE bonus through settlement.
- `profiles.total_vibes`, `settlement_history`, and `activity_logs.is_settled` can be mutated through a public/adminless RPC path.
- This compounds H-01, H-03, H-04, and H-05 by breaking both reward calculation and settlement execution boundaries.

### Dynamic Test
Not executed.

### Reason Dynamic Test Was Not Executed
A direct settlement execution test would mutate multiple Production tables:
- `profiles.total_vibes`
- `settlement_history`
- `activity_logs.is_settled`
- `activity_logs.bonus_vibes`
- `activity_logs.total_reward_vibes`

Static verification is sufficient because:
- The function uses `view_count` for settlement.
- `view_count` is directly incrementable through H-01.
- The function is `SECURITY DEFINER`.
- The function contains no internal admin authorization check.
- The function can be executed by `anon` and `authenticated`.

### Required Fix
- Immediately revoke unsafe EXECUTE privileges from `anon`, `authenticated`, and `public`.
- Grant EXECUTE only to `service_role` or another server-only role.
- Ensure settlement is triggered only by an admin-verified server route.
- Change settlement calculation from `view_count` to a verified qualified-view metric.
- Consider storing settlement snapshots from immutable event data rather than mutable aggregate counters.
- Add idempotency and period constraints to prevent unintended repeated settlement.
- Ensure settlement history has unique constraints for user/week or settlement period if appropriate.

### Suggested Immediate Patch Direction
- Revoke public/authenticated EXECUTE on `perform_weekly_settlement`.
- Update settlement formula to use verified `qualified_view_count` or a trusted aggregate derived from `activity_view_logs`.
- Keep public `view_count` as display-only if product direction requires it.
- Move all reward-affecting calculations behind server-only/admin-only paths.

### Next
- Proceed to P0 batch patch design for H-03/H-04/H-05/H-01/H-02.

---

## H-03: total_vibes manipulation

### Status
Confirmed

### Severity
P0 / Critical

### Summary
`public.profiles.total_vibes` can be manipulated from a client-accessible path. This directly compromises SYNCs reward economy because `total_vibes` represents user reward/value accumulation.

### Evidence
- `public.profiles` contains `total_vibes integer`.
- H-03 was previously cross-verified through both Supabase SQL Editor and browser console testing.
- The prior test confirmed that `total_vibes` could be changed from a client-accessible path.
- Current H-04 verification also confirmed that `public.profiles` has RLS disabled and that `anon` and `authenticated` roles have broad table-level privileges, including `UPDATE`.
- Therefore, H-03 and H-04 share the same root cause category: the `profiles` table lacks a safe RLS/privilege boundary for sensitive fields.

### Known Limitations / To Backfill
- The exact H-03 SQL probe, browser console script, test account UUID, before/after values, and rollback evidence are not included in this prompt.
- Add those details later if the original test logs are available.
- Until those details are backfilled, the status remains Confirmed based on prior cross-verification, but the detailed evidence trail should be completed.

### Impact
- Users may be able to directly manipulate their reward balance/value.
- Reward calculations, settlement eligibility, leaderboard values, and any logic depending on `total_vibes` cannot be trusted until patched.
- This undermines the economic integrity of SYNCs VIBE system.

### Required Fix
- Enable RLS on `public.profiles`.
- Revoke broad table-level `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` privileges from `anon` and `authenticated`.
- Block direct client updates to `total_vibes`.
- Allow `total_vibes` changes only through a controlled server-side path, such as a safe RPC, Edge Function, or service role operation.
- Add an audit trail for VIBE mutations, preferably through a `vibe_transactions` or equivalent ledger table.
- Ensure reward changes are derived from server-verified activity data, not client-submitted values.

### Rollback / Safety
- Any future dynamic tests for H-03 should be executed with a dedicated test account and should include explicit before/after/restore checks.
- If a test modifies `total_vibes`, immediately restore the original value and document the restoration result.

### Next
- Include H-03 in the upcoming profiles security patch together with H-04.
- Patch should protect both `total_vibes` and `is_admin` as sensitive fields.

---

## H-04: is_admin privilege escalation

### Status
Confirmed

### Severity
P0 / Critical

### Summary
A normal authenticated user can update `public.profiles.is_admin` to `true`, allowing privilege escalation if application/admin logic trusts `profiles.is_admin`.

### Evidence
- `public.profiles` contains `is_admin boolean`.
- `public.profiles` also contains `total_vibes integer`, connecting this issue to H-03.
- `public.profiles` RLS is disabled:
  - `rls_enabled = false`
  - `force_rls = false`
- `anon` role has broad table-level privileges on `public.profiles`, including:
  - `SELECT`
  - `INSERT`
  - `UPDATE`
  - `DELETE`
  - `TRUNCATE`
  - `REFERENCES`
  - `TRIGGER`
- `authenticated` role has broad table-level privileges on `public.profiles`, including:
  - `SELECT`
  - `INSERT`
  - `UPDATE`
  - `DELETE`
  - `TRUNCATE`
  - `REFERENCES`
  - `TRIGGER`
- `public.profiles` has no `BEFORE UPDATE` trigger that blocks changes to `is_admin`.
- The only confirmed trigger on `public.profiles` was:
  - `tr_generate_verification_code`
  - `BEFORE INSERT`
  - `EXECUTE FUNCTION generate_sync_verification_code()`
- A real test account profile row was created:
  - `id = 22903970-65d3-46fd-ac79-923ec2b6962b`
  - `nickname = 테스트 계정`
  - `total_vibes = 0`
  - `is_admin = false`
- Dynamic SQL test with `set local role authenticated` successfully updated `profiles.is_admin` to `true`.
- After rollback, safety check confirmed the test account remained:
  - `is_admin = false`

### Dynamic Test Result
The authenticated-role dynamic test returned:

- `test_step = H-04_AUTHENTICATED_IS_ADMIN_UPDATE`
- `id = 22903970-65d3-46fd-ac79-923ec2b6962b`
- `update_result_is_admin = true`

Although the attempted same-statement revert check returned `null`, the final rollback safety check confirmed the database state was restored and the account remained non-admin.

### Safety Check After Test
Final verification query confirmed:

- `id = 22903970-65d3-46fd-ac79-923ec2b6962b`
- `nickname = 테스트 계정`
- `total_vibes = 0`
- `is_admin = false`

### Impact
- A normal authenticated user can escalate privileges by directly updating `profiles.is_admin`.
- Admin-only pages, admin APIs, approval flows, settlement operations, and reward-related functions that trust `profiles.is_admin` are not reliable until patched.
- H-04 can combine with H-05-class issues if admin RPCs or admin APIs trust `profiles.is_admin` without stronger server-side protection.

### Required Fix
- Enable RLS on `public.profiles`.
- Revoke broad table-level `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` privileges from `anon` and `authenticated`.
- Ensure normal users can only update non-sensitive profile fields.
- Block direct client updates to `is_admin`.
- Block direct client updates to `total_vibes`.
- Consider column-level privileges and/or a `BEFORE UPDATE` trigger to prevent changes to sensitive fields.
- Admin authority changes must happen only through a server-controlled path.
- Long-term, consider moving admin authority away from `profiles.is_admin` into a dedicated `admin_users` or `user_roles` table.

### Rollback / Safety
- Dynamic test was performed inside a transaction and followed by rollback.
- Final safety check confirmed the test account remained `is_admin = false`.
- No lasting privilege pollution was observed.

### Next
- Proceed to H-05: admin approval RPC bypass verification.
- Include H-03 and H-04 together in the upcoming profiles security patch design.
- Do not patch H-03/H-04 individually yet if the chosen strategy remains P0 verification first, then batch security migration.

---

## H-05: admin approval RPC bypass

### Status
Confirmed

### Severity
P0 / Critical

### Summary
Admin approval RPC functions can be executed by `anon` and `authenticated` roles. The functions are `SECURITY DEFINER` and do not perform any internal caller authentication or admin authorization checks. This allows non-admin callers to approve activity logs and grant VIBE rewards if they know or can obtain a valid target `activity_logs.id`.

### Evidence
- Production DB contains the following admin approval RPC functions:
  - `public.admin_approve_activity_log(p_log_id uuid)`
  - `public.admin_approve_activity_log_v2(p_log_id uuid, p_final_vibes integer, p_ai_evaluation jsonb)`
- Both functions are `SECURITY DEFINER`.
- Both functions are owned by `postgres`.
- Both functions set `search_path=public`.
- EXECUTE privilege check confirmed:
  - `admin_approve_activity_log`: `anon = true`, `authenticated = true`, `service_role = true`
  - `admin_approve_activity_log_v2`: `anon = true`, `authenticated = true`, `service_role = true`
- Function body review confirmed that neither function checks:
  - `auth.uid()`
  - `profiles.is_admin`
  - dedicated admin table membership
  - custom role claims
  - any equivalent admin authorization condition
- `admin_approve_activity_log_v2` updates `public.activity_logs` directly:
  - sets `status = 'approved'`
  - sets `total_reward_vibes = p_final_vibes`
  - sets `ai_evaluation = p_ai_evaluation`
- `admin_approve_activity_log_v2` updates `public.profiles.total_vibes` directly:
  - `total_vibes = COALESCE(total_vibes, 0) + p_final_vibes`
- `p_final_vibes` is provided by the caller and is not validated inside the RPC.

### Impact
- A non-admin caller may be able to approve pending or analyzed activity logs by calling the RPC directly.
- A non-admin caller may be able to grant arbitrary VIBE rewards through `p_final_vibes`.
- Admin approval flow, activity status integrity, AI evaluation records, and VIBE economy integrity are compromised.
- This issue compounds H-03 and H-04 because the same reward/admin trust boundary is broken at both table and RPC levels.

### Dynamic Test
Not executed.

### Reason Dynamic Test Was Not Executed
A direct RPC execution test may mutate multiple Production tables, including:
- `activity_logs.status`
- `activity_logs.total_reward_vibes`
- `activity_logs.ai_evaluation`
- `profiles.total_vibes`

Static verification is sufficient to confirm the vulnerability because:
- `anon` and `authenticated` roles can execute the RPC.
- The RPC is `SECURITY DEFINER`.
- The function body contains no internal admin authorization check.
- The function performs admin approval and reward mutation operations.

### Required Fix
- Immediately revoke unsafe EXECUTE privileges:
  - revoke EXECUTE on `public.admin_approve_activity_log(uuid)` from `anon`, `authenticated`, and `public`.
  - revoke EXECUTE on `public.admin_approve_activity_log_v2(uuid, integer, jsonb)` from `anon`, `authenticated`, and `public`.
- Grant EXECUTE only to `service_role` or another tightly controlled server-only role.
- Add internal authorization checks if these functions must remain callable from authenticated contexts.
- Do not trust `p_final_vibes` directly from the client.
- Validate reward amount against server-side policy, such as activity type base values, configured caps, or admin-reviewed values.
- Ensure all admin approval writes happen through server-only routes or locked-down RPCs.
- Consider replacing direct admin RPC exposure with server route handlers that use service role and perform explicit admin checks.

### Suggested Immediate Patch Direction
- Keep the existing admin API route as the only intended caller.
- Revoke RPC execution from `anon` and `authenticated`.
- Ensure the admin API verifies admin identity before calling the RPC.
- Later, refactor admin authority away from `profiles.is_admin` into `admin_users` or `user_roles`.

### Next
- Proceed to H-01 view count abuse verification.
- Include H-05 together with H-03/H-04 in the upcoming P0 batch security migration.

---

## 2026-06-29 Apply & Regression Verification

### Status
Passed

### Scope
- Phase 1 P0 security hardening SQL apply verification.
- Post-apply database security verification.
- Local regression verification for core user, reward, settlement, X handle, and admin approval flows.
- Documentation-only record; this section does not apply schema changes.

### Apply Result
- Supabase SQL Editor executed the full `tmp/020_p0_security_hardening_phase1_apply.sql` script.
- Result: `Success. No rows returned`.

### RLS Verification
Passed:
- `profiles`: true
- `activity_logs`: true
- `activity_syncs`: true
- `activity_view_logs`: true
- `settlement_history`: true

### Table Grants Verification
Passed:
- `anon` and `authenticated` direct access to `activity_syncs` is blocked.
- `anon` and `authenticated` direct access to `activity_view_logs` is blocked.
- `anon` and `authenticated` writes to `activity_logs` are blocked.
- `authenticated` access to `settlement_history` is SELECT-only.
- `service_role` server privileges are preserved.

### Function Grants Verification
Passed:
- `admin_approve_activity_log` and `admin_approve_activity_log_v2`: `service_role` only.
- `perform_weekly_settlement`: `service_role` only.
- `increment_view_count_v2` and `increment_view_count_v3`: `anon` and `authenticated` blocked.
- `increment_view_count_v4` and `increment_view_count_v5`: `anon` and `authenticated` allowed.
- `set_activity_sync`: `authenticated` only.
- `get_activity_sync_state` and `get_activity_sync_counts`: `anon` and `authenticated` allowed.

### Profiles Column Grants Verification
Passed:
- `authenticated` INSERT allowed only for:
  - `id`
  - `nickname`
  - `avatar_url`
  - `preferred_language`
  - `x_handle`
- `authenticated` UPDATE allowed only for:
  - `nickname`
  - `avatar_url`
  - `preferred_language`
  - `x_handle`
- Writes are not allowed for:
  - `total_vibes`
  - `is_admin`
  - `verification_code`
  - `is_x_verified`

### RLS Policy Verification
Passed:
- `activity_logs` approved public SELECT.
- `activity_logs` own SELECT.
- `profiles` public SELECT.
- `profiles` own SELECT.
- `profiles` own INSERT.
- `profiles` own UPDATE.
- `settlement_history` own SELECT.
- `activity_syncs` and `activity_view_logs` have no direct client policies.

### Local Regression Verification
Passed:
- Login and session persistence.
- Activity creation.
- Activity edit.
- Activity delete.
- Activity detail page access.
- View count increment.
- Sync on/off.
- Home feed sync count display.
- Profile estimated reward display.
- Settlement page access.
- X handle save and verification flow.
- Admin approved-log list.
- Admin approve.
- Admin reject.
- Positive VIBE approval test: `{"ok":true,"vibes_added":10}`.

### Regression Found And Resolved
- Issue: admin approve/reject requests returned Next.js default 404 HTML.
- Cause: in Next.js 16 dev route manifest generation, `activity-logs/[id]/route.ts` prevented nested `approve` and `reject` route handlers from being registered.
- Fix: moved the detail GET route under a route group, preserving the public URL while allowing `approve` and `reject` route handlers to register.
- Additional UI fix: admin approve/reject handlers now tolerate HTML/non-JSON failure responses and always restore loading/submitting state in `finally`.

### Deferred Items
- Google Fonts download warning: P1 stabilization backlog.
- Delete confirmation UI improvement: P1/design backlog.
- X integration retention decision: Phase 2 product strategy.
- Reduce `profiles` public SELECT exposure: Phase 1.5 read minimization.
- Temporary admin-account speed issue: deferred.

### Result
P0 security hardening apply, post-apply DB verification, and local regression verification are complete and passed as of 2026-06-29.

Next step: baseline/schema/RPC documentation realignment against the verified Production DB state and migration 020.

Follow-up: operational rules were added to `AGENTS.md`, `.cursor/rules/sync-agent-workflow.mdc`, and design process docs to require documentation-sync checks after significant work.
