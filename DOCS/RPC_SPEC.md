# RPC specification (historical export; post-P0 realignment pending)

**Source:** production Supabase (user-provided export). **Synced:** 2026-04-29.

> Post-P0 warning: this file may reflect pre-P0 RPC signatures and policies. Do not treat it as the latest canonical RPC spec until post-P0 Production re-export/realignment is completed. Phase 1 P0 hardening was applied through `supabase/migrations/020_p0_security_hardening_phase1.sql` and verified in `DOCS/PROD_VERIFY_20260625.md` under the 2026-06-29 section.

PL/pgSQL **전문**은 [RPC_FUNCTIONS.md](./RPC_FUNCTIONS.md)에 정리되어 있습니다. 구현·리뷰 시 **이 스펙과 실제 DB**를 기준으로 하고, 레포의 `supabase/migrations`와 다르면 동기화 여부를 확인하세요.

## Post-P0 RPC policy summary

This summary captures confirmed 020-era policy only. The historical table below has not been fully regenerated.

- `increment_view_count_v5` is the current post-P0 view RPC path. It keeps `view_count` as a public display metric and separates rewardable counting through qualified-view handling.
- `increment_view_count_v4` remains available to `anon` and `authenticated` as a compatibility wrapper.
- `increment_view_count_v2` and `increment_view_count_v3` are blocked for `anon` and `authenticated`.
- `set_activity_sync` is authenticated only.
- `get_activity_sync_state` and `get_activity_sync_counts` are available to `anon` and `authenticated`.
- `admin_approve_activity_log`, `admin_approve_activity_log_v2`, and `perform_weekly_settlement` are service_role only.
- Settlement and reward logic must not use `view_count`; it must use `qualified_view_count` or trusted qualified-view data.

## Summary

| function_name                   | arguments                                                   | return_type                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| generate_sync_verification_code | (trigger)                                                   | trigger                                                                                                                                               |
| toggle_item_active              | p_inventory_id uuid                                         | jsonb                                                                                                                                                 |
| increment_view_count_v2         | p_log_id uuid, p_user_id uuid DEFAULT NULL                  | void                                                                                                                                                  |
| increment_view_count_v3         | p_log_id uuid, p_user_id uuid                               | void                                                                                                                                                  |
| purchase_item                   | p_item_id uuid                                              | jsonb                                                                                                                                                 |
| increment_view_count_v4         | p_log_id uuid, p_user_id uuid DEFAULT NULL                  | void                                                                                                                                                  |
| admin_approve_activity_log      | p_log_id uuid                                               | jsonb                                                                                                                                                 |
| perform_weekly_settlement       | —                                                           | integer                                                                                                                                               |
| get_weekly_rising_leaderboard   | p_limit integer DEFAULT 50                                  | TABLE(user_id uuid, display_name text, avatar_url text, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint) |
| get_weekly_rising_user_place    | p_user_id uuid                                              | TABLE(rank bigint, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint)                                      |
| admin_approve_activity_log_v2   | p_log_id uuid, p_final_vibes integer, p_ai_evaluation jsonb | jsonb                                                                                                                                                 |

## 조회수 RPC 정책 요약

| 버전 | `view_count` | `qualified_view_count` / 로그 |
| ---- | ------------- | ------------------------------ |
| v2   | 로그인만; `activity_view_logs` 일 1회 성공 시 +1 | (컬럼 없음·미사용) |
| v3   | `activity_view_logs` 일 1회 성공 시 +1 (`p_user_id` 필수) | (컬럼 없음·미사용) |
| v4   | **호출마다** +1 | 로그인 시 `activity_view_logs` 일 1회 삽입 성공 시 `qualified_view_count` +1 |

## Related

- [DB_SCHEMA.md](./DB_SCHEMA.md) — 테이블·컬럼
- [RPC_FUNCTIONS.md](./RPC_FUNCTIONS.md) — 함수 본문 전체
