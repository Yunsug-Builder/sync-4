# DB Schema (historical export; post-P0 realignment pending)

**Source:** production Supabase (user-provided export). **Synced:** 2026-04-29.

> Post-P0 warning: this file is not the current canonical Production schema. It is a historical 2026-04-29 export and must be realigned after a fresh Production re-export. Phase 1 P0 hardening was applied through `supabase/migrations/020_p0_security_hardening_phase1.sql` and verified in `DOCS/PROD_VERIFY_20260625.md` under the 2026-06-29 section. For DB/RLS/grants work, check that verification record and migration 020 before relying on this file.

앱 코드·마이그레이션을 수정할 때 **이 문서를 우선**하고, 로컬 `supabase/migrations`와 차이가 있으면 마이그레이션을 DB에 맞추거나 이 문서를 갱신하세요.

## Post-P0 hardening notes

These notes summarize confirmed 020-era changes only. They do not replace a full Production schema re-export.

- Migration `020_p0_security_hardening_phase1.sql` has been applied to Production with SQL Editor result `Success. No rows returned`.
- Post-apply verification confirmed RLS enabled for `profiles`, `activity_logs`, `activity_syncs`, `activity_view_logs`, and `settlement_history`.
- Direct client table access to `activity_syncs` and `activity_view_logs` is blocked; sync/view flows must use the approved RPC paths.
- Direct `anon`/`authenticated` writes to `activity_logs` are blocked; `service_role` server privileges are preserved.
- `settlement_history` is `authenticated` SELECT-only; settlement mutation remains server-only through service-role-controlled paths.
- `view_count` is the public display metric. `qualified_view_count` is the reward/settlement metric. Reward and settlement logic must not use `view_count`.
- Direct client writes to `profiles.total_vibes` and `profiles.is_admin` are blocked.
- `profiles` public SELECT remains broad and is a Phase 1.5 read-minimization backlog item.

| table_name         | column_name          | data_type                | is_nullable | column_default               |
| ------------------ | -------------------- | ------------------------ | ----------- | ---------------------------- |
| activity_comments  | id                   | uuid                     | NO          | uuid_generate_v4()           |
| activity_comments  | user_id              | uuid                     | YES         | null                         |
| activity_comments  | activity_log_id      | uuid                     | YES         | null                         |
| activity_comments  | content              | text                     | NO          | null                         |
| activity_comments  | created_at           | timestamp with time zone | YES         | timezone('utc'::text, now()) |
| activity_logs      | id                   | uuid                     | NO          | gen_random_uuid()            |
| activity_logs      | user_id              | uuid                     | YES         | null                         |
| activity_logs      | artist_id            | uuid                     | YES         | null                         |
| activity_logs      | activity_type_id     | uuid                     | YES         | null                         |
| activity_logs      | status               | text                     | YES         | 'pending'::text              |
| activity_logs      | proof_url            | text                     | YES         | null                         |
| activity_logs      | created_at           | timestamp with time zone | YES         | now()                        |
| activity_logs      | content              | text                     | YES         | null                         |
| activity_logs      | view_count           | integer                  | YES         | 0                            |
| activity_logs      | bonus_vibes          | integer                  | YES         | 0                            |
| activity_logs      | total_reward_vibes   | integer                  | YES         | 0                            |
| activity_logs      | is_settled           | boolean                  | YES         | false                        |
| activity_logs      | translations         | jsonb                    | YES         | '{}'::jsonb                  |
| activity_logs      | source_type          | text                     | YES         | 'internal'::text             |
| activity_logs      | external_url         | text                     | YES         | null                         |
| activity_logs      | ai_evaluation        | jsonb                    | YES         | '{}'::jsonb                  |
| activity_logs      | raw_content          | text                     | YES         | null                         |
| activity_logs      | image_urls           | ARRAY                    | YES         | '{}'::text[]                 |
| activity_logs      | qualified_view_count | integer                  | YES         | 0                            |
| activity_logs      | deleted_at           | timestamp with time zone | YES         | null                         |
| activity_logs      | ai_score             | integer                  | YES         | null                         |
| activity_logs      | admin_memo           | text                     | YES         | null                         |
| activity_syncs     | id                   | uuid                     | NO          | uuid_generate_v4()           |
| activity_syncs     | user_id              | uuid                     | YES         | null                         |
| activity_syncs     | activity_id          | uuid                     | YES         | null                         |
| activity_syncs     | created_at           | timestamp with time zone | YES         | timezone('utc'::text, now()) |
| activity_types     | id                   | uuid                     | NO          | gen_random_uuid()            |
| activity_types     | name                 | text                     | NO          | null                         |
| activity_types     | base_vibes           | integer                  | YES         | 0                            |
| activity_view_logs | id                   | uuid                     | NO          | uuid_generate_v4()           |
| activity_view_logs | user_id              | uuid                     | YES         | null                         |
| activity_view_logs | activity_id          | uuid                     | YES         | null                         |
| activity_view_logs | viewed_at            | date                     | YES         | CURRENT_DATE                 |
| artists            | id                   | uuid                     | NO          | gen_random_uuid()            |
| artists            | name                 | text                     | NO          | null                         |
| artists            | image_url            | text                     | YES         | null                         |
| artists            | created_at           | timestamp with time zone | YES         | now()                        |
| artists            | fandom_name          | text                     | YES         | null                         |
| artists            | description          | text                     | YES         | null                         |
| artists            | archive_guide        | text                     | YES         | null                         |
| artists            | sync_strategy        | text                     | YES         | null                         |
| profiles           | id                   | uuid                     | NO          | null                         |
| profiles           | nickname             | text                     | YES         | null                         |
| profiles           | avatar_url           | text                     | YES         | null                         |
| profiles           | total_vibes          | integer                  | YES         | 0                            |
| profiles           | updated_at           | timestamp with time zone | YES         | now()                        |
| profiles           | preferred_language   | text                     | YES         | 'en'::text                   |
| profiles           | x_handle             | text                     | YES         | null                         |
| profiles           | verification_code    | text                     | YES         | null                         |
| profiles           | is_x_verified        | boolean                  | YES         | false                        |
| settlement_history | id                   | uuid                     | NO          | uuid_generate_v4()           |
| settlement_history | user_id              | uuid                     | YES         | null                         |
| settlement_history | week_start           | timestamp with time zone | YES         | null                         |
| settlement_history | total_syncs_count    | integer                  | YES         | 0                            |
| settlement_history | total_views_count    | integer                  | YES         | 0                            |
| settlement_history | bonus_vibes          | integer                  | YES         | 0                            |
| settlement_history | created_at           | timestamp with time zone | YES         | now()                        |
| shop_items         | id                   | uuid                     | NO          | gen_random_uuid()            |
| shop_items         | name                 | text                     | NO          | null                         |
| shop_items         | description          | text                     | YES         | null                         |
| shop_items         | price                | bigint                   | NO          | null                         |
| shop_items         | image_url            | text                     | YES         | null                         |
| shop_items         | category             | text                     | YES         | 'deco'::text                 |
| shop_items         | created_at           | timestamp with time zone | YES         | now()                        |
| spots              | id                   | uuid                     | NO          | gen_random_uuid()            |
| spots              | artist_id            | uuid                     | YES         | null                         |
| spots              | title                | text                     | NO          | null                         |
| spots              | lat                  | double precision         | NO          | null                         |
| spots              | lng                  | double precision         | NO          | null                         |
| spots              | image_url            | text                     | YES         | null                         |
| spots              | created_at           | timestamp with time zone | YES         | now()                        |
| user_inventory     | id                   | uuid                     | NO          | gen_random_uuid()            |
| user_inventory     | user_id              | uuid                     | YES         | null                         |
| user_inventory     | item_id              | uuid                     | YES         | null                         |
| user_inventory     | is_active            | boolean                  | YES         | false                        |
| user_inventory     | purchased_at         | timestamp with time zone | YES         | now()                        |

## Notes for agents

- **`activity_logs.image_urls`:** `text[]` (empty default `'{}'::text[]`). 다중 이미지 URL.
- **`activity_logs.qualified_view_count`:** 정산/퀄리파이드 조회; `increment_view_count_v4`와 `activity_view_logs`와 연동.
- **`activity_logs.deleted_at`:** 소프트 삭제 시각(`status='deleted'`와 함께 사용).
- **`activity_logs.ai_score`:** 관리자 판단 보조용 AI 점수(상태 결정과 분리).
- **`activity_logs.admin_memo`:** 관리자 내부 메모.
- **`activity_view_logs`:** UNIQUE `(user_id, activity_id, viewed_at)` 기반으로 유저·글·일 단위 기록을 관리.
