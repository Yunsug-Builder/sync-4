# DB 스키마 설계도 (Source of Truth: Supabase)

## activity_comments

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | uuid_generate_v4() |
| user_id | uuid | N | Y | null |
| activity_log_id | uuid | N | Y | null |
| content | text | N | N | null |
| created_at | timestamp with time zone | N | Y | timezone('utc'::text, now()) |

## activity_logs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| user_id | uuid | N | Y | null |
| artist_id | uuid | N | Y | null |
| activity_type_id | uuid | N | Y | null |
| status | text | N | Y | 'pending'::text |
| proof_url | text | N | Y | null |
| created_at | timestamp with time zone | N | Y | now() |
| content | text | N | Y | null |
| image_url | text | N | Y | null |
| translations | jsonb | N | Y | {} |
| view_count | integer | N | Y | 0 |
| bonus_vibes | integer | N | Y | 0 |
| total_reward_vibes | integer | N | Y | 0 |
| is_settled | boolean | N | Y | false |

## activity_syncs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | uuid_generate_v4() |
| user_id | uuid | N | Y | null |
| activity_id | uuid | N | Y | null |
| created_at | timestamp with time zone | N | Y | timezone('utc'::text, now()) |

## activity_types

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| name | text | N | N | null |
| base_vibes | integer | N | Y | 0 |

## activity_view_logs

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | uuid_generate_v4() |
| user_id | uuid | N | Y | null |
| activity_id | uuid | N | Y | null |
| viewed_at | date | N | Y | CURRENT_DATE |

## artists

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| name | text | N | N | null |
| image_url | text | N | Y | null |
| created_at | timestamp with time zone | N | Y | now() |
| fandom_name | text | N | Y | null |
| description | text | N | Y | null |
| archive_guide | text | N | Y | null |
| sync_strategy | text | N | Y | null |

## profiles

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | null |
| nickname | text | N | Y | null |
| avatar_url | text | N | Y | null |
| total_vibes | integer | N | Y | 0 |
| updated_at | timestamp with time zone | N | Y | now() |

## settlement_history

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | uuid_generate_v4() |
| user_id | uuid | N | Y | null |
| week_start | timestamp with time zone | N | Y | null |
| total_syncs_count | integer | N | Y | 0 |
| total_views_count | integer | N | Y | 0 |
| bonus_vibes | integer | N | Y | 0 |
| created_at | timestamp with time zone | N | Y | now() |

## shop_items

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| name | text | N | N | null |
| description | text | N | Y | null |
| price | bigint | N | N | null |
| image_url | text | N | Y | null |
| category | text | N | Y | 'deco'::text |
| created_at | timestamp with time zone | N | Y | now() |

## spots

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| artist_id | uuid | N | Y | null |
| title | text | N | N | null |
| lat | double precision | N | N | null |
| lng | double precision | N | N | null |
| image_url | text | N | Y | null |
| created_at | timestamp with time zone | N | Y | now() |

## user_inventory

| 컬럼명 | 데이터 타입 | PK | NULL 허용 | 기본값 |
|---|---|---|---|---|
| id | uuid | Y | N | gen_random_uuid() |
| user_id | uuid | N | Y | null |
| item_id | uuid | N | Y | null |
| is_active | boolean | N | Y | false |
| purchased_at | timestamp with time zone | N | Y | now() |

### 제약/인덱스 (최신 반영)

- `ux_user_inventory_user_item` (UNIQUE INDEX on `user_inventory(user_id, item_id)`)
  - 동일 유저의 동일 아이템 중복 보유를 DB 레벨에서 차단합니다.

---

## Shop/Inventory 동작 관련 최신 변경사항

- `purchase_item(p_item_id uuid)`:
  - `auth.uid()` 기준으로 현재 로그인 유저만 구매 가능
  - `shop_items.price` 조회 후, `profiles.total_vibes`를 `FOR UPDATE`로 잠그고 잔액 검증
  - 이미 보유한 아이템 구매 시 `ok=false`와 에러 메시지를 반환
  - 성공 시 `profiles.total_vibes` 차감 후 `user_inventory(user_id, item_id)`에 새 row 생성
  - 반환값은 `jsonb`이며 기본 형태는 `ok`, `message|error`
- `toggle_item_active(p_inventory_id uuid)`:
  - 장착/해제 토글을 RPC로 일원화
  - 파라미터는 `shop_items.id`가 아니라 `user_inventory.id`
  - `auth.uid()` 기준으로 본인 인벤토리 row만 수정 가능
  - `true`로 활성화할 때 동일 `shop_items.category`의 다른 장착 아이템은 자동 `false` 처리
  - 카테고리가 없는 아이템은 적용 불가
  - 반환값은 `jsonb`이며 기본 형태는 `ok`, `is_active`, `message|error`
