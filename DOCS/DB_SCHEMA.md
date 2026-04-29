# DB Schema (canonical)

**Source:** production Supabase (user-provided export). **Synced:** 2026-04-28.

앱 코드·마이그레이션을 수정할 때 **이 문서를 우선**하고, 로컬 `supabase/migrations`와 차이가 있으면 마이그레이션을 DB에 맞추거나 이 문서를 갱신하세요.

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
- **`activity_view_logs`:** UNIQUE `(user_id, activity_id, viewed_at)` 기반으로 유저·글·일 단위 기록을 관리.
