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
