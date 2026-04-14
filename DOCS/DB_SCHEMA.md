# DB 스키마 설계도 (Source of Truth: Supabase CSV)

기준 파일: `Supabase Snippet DB 스키마 확인 쿼리 (마크다운) (1).csv`

## activity_comments

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| activity_log_id | uuid | N | Y |
| content | text | N | N |
| created_at | timestamp with time zone | N | Y |

## activity_logs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| artist_id | uuid | N | Y |
| activity_type_id | uuid | N | Y |
| status | text | N | Y |
| proof_url | text | N | Y |
| created_at | timestamp with time zone | N | Y |
| content | text | N | Y |
| view_count | integer | N | Y |
| bonus_vibes | integer | N | Y |
| total_reward_vibes | integer | N | Y |
| is_settled | boolean | N | Y |

## activity_syncs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| activity_id | uuid | N | Y |
| created_at | timestamp with time zone | N | Y |

## activity_types

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| name | text | N | N |
| base_vibes | integer | N | Y |

## activity_view_logs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| activity_id | uuid | N | Y |
| viewed_at | date | N | Y |

## artists

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| name | text | N | N |
| image_url | text | N | Y |
| created_at | timestamp with time zone | N | Y |

## profiles

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| nickname | text | N | Y |
| avatar_url | text | N | Y |
| total_vibes | integer | N | Y |
| updated_at | timestamp with time zone | N | Y |

## settlement_history

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| week_start | timestamp with time zone | N | Y |
| total_syncs_count | integer | N | Y |
| total_views_count | integer | N | Y |
| bonus_vibes | integer | N | Y |
| created_at | timestamp with time zone | N | Y |

## shop_items

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| name | text | N | N |
| description | text | N | Y |
| price | bigint | N | N |
| image_url | text | N | Y |
| category | text | N | Y |
| created_at | timestamp with time zone | N | Y |

## spots

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| artist_id | uuid | N | Y |
| title | text | N | N |
| lat | double precision | N | N |
| lng | double precision | N | N |
| image_url | text | N | Y |
| created_at | timestamp with time zone | N | Y |

## user_inventory

| 컬럼명 | 데이터 타입 | PK | NULL 허용 |
|---|---|---|---|
| id | uuid | Y | N |
| user_id | uuid | N | Y |
| item_id | uuid | N | Y |
| is_active | boolean | N | Y |
| purchased_at | timestamp with time zone | N | Y |
