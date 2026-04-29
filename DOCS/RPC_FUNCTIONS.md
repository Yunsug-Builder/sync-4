# RPC function bodies (canonical)

**Source:** production Supabase (user-provided export). **Synced:** 2026-04-29.

전체 시그니처 요약은 [RPC_SPEC.md](./RPC_SPEC.md)를 참고하세요.

---

## `generate_sync_verification_code`

- **Kind:** trigger function

```sql
BEGIN
    IF NEW.verification_code IS NULL THEN
        NEW.verification_code := 'SYNC_' || substring(md5(random()::text), 1, 6);
    END IF;
    RETURN NEW;
END;
```

---

## `toggle_item_active(p_inventory_id uuid)` → `jsonb`

```sql
DECLARE
    v_user_id uuid := auth.uid();
    v_category text;
    v_current_active boolean;
    v_next_active boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
    END IF;

    SELECT COALESCE(ui.is_active, false), si.category
    INTO v_current_active, v_category
    FROM public.user_inventory ui
    JOIN public.shop_items si ON si.id = ui.item_id
    WHERE ui.id = p_inventory_id
      AND ui.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '인벤토리 아이템을 찾을 수 없습니다.');
    END IF;

    IF v_category IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '카테고리 없는 아이템은 적용할 수 없습니다.');
    END IF;

    v_next_active := NOT v_current_active;

    IF v_next_active THEN
        UPDATE public.user_inventory ui
        SET is_active = false
        FROM public.shop_items si
        WHERE ui.user_id = v_user_id
          AND ui.item_id = si.id
          AND si.category = v_category;
    END IF;

    UPDATE public.user_inventory
    SET is_active = v_next_active
    WHERE id = p_inventory_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
        'ok', true,
        'is_active', v_next_active,
        'message', CASE
            WHEN v_next_active THEN '아이템을 프로필에 적용했습니다.'
            ELSE '아이템 적용을 해제했습니다.'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
```

---

## `increment_view_count_v2(p_log_id uuid, p_user_id uuid DEFAULT NULL)` → `void`

- 비로그인(`p_user_id` NULL)이면 즉시 return.
- `activity_view_logs`에 삽입 시도; UNIQUE `(user_id, activity_id, viewed_at)`로 **일 1회** 제한.
- 삽입 성공 시에만 `view_count` +1.

```sql
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO activity_view_logs (user_id, activity_id)
    VALUES (p_user_id, p_log_id)
    ON CONFLICT (user_id, activity_id, viewed_at) DO NOTHING;

    IF FOUND THEN
        UPDATE activity_logs
        SET view_count = COALESCE(view_count, 0) + 1
        WHERE id = p_log_id;
    END IF;
END;
```

---

## `increment_view_count_v3(p_log_id uuid, p_user_id uuid)` → `void`

- 본인 여부 무관하게 `activity_view_logs` 삽입 시도; UNIQUE로 유저·글·일 단위 1회.
- 삽입 성공 시에만 `view_count` +1.
- **주의:** 시그니처에 `p_user_id` 기본값 없음; anon 호출 시 앱/DB 정책 확인 필요.

```sql
BEGIN
    INSERT INTO activity_view_logs (user_id, activity_id)
    VALUES (p_user_id, p_log_id)
    ON CONFLICT (user_id, activity_id, viewed_at) DO NOTHING;

    IF FOUND THEN
        UPDATE activity_logs
        SET view_count = COALESCE(view_count, 0) + 1
        WHERE id = p_log_id;
    END IF;
END;
```

---

## `purchase_item(p_item_id uuid)` → `jsonb`

```sql
DECLARE
    v_user_id uuid := auth.uid();
    v_item_price bigint;
    v_user_vibes bigint;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
    END IF;

    SELECT price INTO v_item_price
    FROM public.shop_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다.');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_inventory ui
        WHERE ui.user_id = v_user_id
          AND ui.item_id = p_item_id
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', '이미 보유한 아이템입니다.');
    END IF;

    SELECT p.total_vibes INTO v_user_vibes
    FROM public.profiles p
    WHERE p.id = v_user_id
    FOR UPDATE;

    IF v_user_vibes IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '프로필 정보를 찾을 수 없습니다.');
    END IF;

    IF v_user_vibes < v_item_price THEN
        RETURN jsonb_build_object('ok', false, 'error', '바이브가 부족합니다.');
    END IF;

    UPDATE public.profiles
    SET total_vibes = total_vibes - v_item_price
    WHERE id = v_user_id;

    INSERT INTO public.user_inventory (user_id, item_id)
    VALUES (v_user_id, p_item_id);

    RETURN jsonb_build_object('ok', true, 'message', '구매가 완료되었습니다.');

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', '이미 보유한 아이템입니다.');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
```

---

## `increment_view_count_v4(p_log_id uuid, p_user_id uuid DEFAULT NULL)` → `void`

- **`view_count`:** 전체 조회수로 호출마다 +1.
- **`qualified_view_count`:** 로그인 유저(`p_user_id` not null)일 때 `activity_view_logs`에 `(user_id, activity_id, viewed_at=CURRENT_DATE)` 삽입 성공 시 +1.

```sql
BEGIN
    UPDATE activity_logs
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_log_id;

    IF p_user_id IS NOT NULL THEN
        INSERT INTO activity_view_logs (user_id, activity_id, viewed_at)
        VALUES (p_user_id, p_log_id, CURRENT_DATE)
        ON CONFLICT (user_id, activity_id, viewed_at) DO NOTHING;

        IF FOUND THEN
            UPDATE activity_logs
            SET qualified_view_count = COALESCE(qualified_view_count, 0) + 1
            WHERE id = p_log_id;
        END IF;
    END IF;
END;
```

---

## `admin_approve_activity_log(p_log_id uuid)` → `jsonb`

```sql
DECLARE
    v_user_id uuid;
    v_vibes integer;
    v_log_id uuid;
BEGIN
    SELECT al.user_id, at.base_vibes INTO v_user_id, v_vibes
    FROM public.activity_logs al
    JOIN public.activity_types at ON at.id = al.activity_type_id
    WHERE al.id = p_log_id AND al.status = 'pending';

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_pending');
    END IF;

    UPDATE public.activity_logs SET status = 'approved'
    WHERE id = p_log_id AND status = 'pending' RETURNING id INTO v_log_id;

    UPDATE public.profiles SET total_vibes = COALESCE(total_vibes, 0) + v_vibes
    WHERE id = v_user_id;

    RETURN jsonb_build_object('ok', true, 'vibes_added', v_vibes);
END;
```

---

## `perform_weekly_settlement()` → `integer`

```sql
DECLARE
    r RECORD;
    v_bonus INTEGER;
    v_user_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT al.user_id,
               SUM((SELECT COUNT(*) FROM activity_syncs s WHERE s.activity_id = al.id)) as weekly_syncs,
               SUM(COALESCE(al.view_count, 0)) as weekly_views
        FROM public.activity_logs al
        WHERE al.status = 'approved' AND al.is_settled = FALSE
        GROUP BY al.user_id
    LOOP
        v_bonus := (r.weekly_syncs * 5) + (r.weekly_views / 10);
        IF v_bonus > 0 THEN
            UPDATE profiles SET total_vibes = COALESCE(total_vibes, 0) + v_bonus WHERE id = r.user_id;
            INSERT INTO settlement_history (user_id, week_start, total_syncs_count, total_views_count, bonus_vibes)
            VALUES (r.user_id, date_trunc('week', now() - interval '1 week'), r.weekly_syncs, r.weekly_views, v_bonus);
            v_user_count := v_user_count + 1;
        END IF;
    END LOOP;

    UPDATE public.activity_logs SET
        is_settled = TRUE,
        bonus_vibes = ((SELECT COUNT(*) FROM activity_syncs WHERE activity_id = activity_logs.id) * 5 + (COALESCE(view_count, 0) / 10)),
        total_reward_vibes = ((SELECT base_vibes FROM activity_types WHERE id = activity_type_id) + ((SELECT COUNT(*) FROM activity_syncs WHERE activity_id = activity_logs.id) * 5 + (COALESCE(view_count, 0) / 10)))
    WHERE status = 'approved' AND is_settled = FALSE;

    RETURN v_user_count;
END;
```

---

## `get_weekly_rising_leaderboard(p_limit integer DEFAULT 50)`

Returns: `TABLE(user_id uuid, display_name text, avatar_url text, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint)`

```sql
WITH bounds AS (SELECT (date_trunc('week', timezone('utc', now()))) at time zone 'utc' AS week_start_utc, now() AS now_ts),
     sync_per_log AS (SELECT activity_id, count(*)::int AS c FROM public.activity_syncs GROUP BY activity_id),
     week_logs AS (
       SELECT al.id, al.user_id, coalesce(al.view_count, 0) as view_count, at.base_vibes, coalesce(spl.c, 0) as sync_on_log
       FROM public.activity_logs al
       INNER JOIN public.activity_types at ON at.id = al.activity_type_id
       CROSS JOIN bounds b
       LEFT JOIN sync_per_log spl ON spl.activity_id = al.id
       WHERE al.status = 'approved' AND al.created_at >= b.week_start_utc AND al.created_at <= b.now_ts
     ),
     per_user AS (
       SELECT wl.user_id, SUM((wl.base_vibes + greatest(0, wl.sync_on_log * 5 + (wl.view_count / 10))))::bigint as weekly_vibes, COUNT(*)::bigint as week_post_count, SUM(wl.view_count)::bigint as week_view_sum
       FROM week_logs wl GROUP BY wl.user_id
     )
SELECT p.id, p.nickname, p.avatar_url, pu.weekly_vibes, pu.week_post_count,
       COALESCE((SELECT COUNT(*) FROM public.activity_syncs s INNER JOIN public.activity_logs al ON al.id = s.activity_id CROSS JOIN bounds b WHERE al.user_id = pu.user_id AND al.status = 'approved' AND s.created_at >= b.week_start_utc), 0)::bigint,
       pu.week_view_sum
FROM per_user pu INNER JOIN public.profiles p ON p.id = pu.user_id
WHERE pu.weekly_vibes > 0 ORDER BY pu.weekly_vibes DESC LIMIT p_limit;
```

---

## `get_weekly_rising_user_place(p_user_id uuid)`

Returns: `TABLE(rank bigint, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint)`

```sql
WITH leaderboard AS (
  SELECT user_id, weekly_vibes, week_post_count, week_sync_received, week_view_sum,
         ROW_NUMBER() OVER (ORDER BY weekly_vibes DESC) as rnk
  FROM public.get_weekly_rising_leaderboard(200)
)
SELECT rnk, weekly_vibes, week_post_count, week_sync_received, week_view_sum
FROM leaderboard WHERE user_id = p_user_id;
```

---

## `admin_approve_activity_log_v2(p_log_id uuid, p_final_vibes integer, p_ai_evaluation jsonb)` → `jsonb`

```sql
DECLARE
    v_user_id uuid;
    v_log_id uuid;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.activity_logs
    WHERE id = p_log_id AND status IN ('pending', 'analyzed');

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '게시글을 찾을 수 없거나 이미 처리되었습니다.');
    END IF;

    UPDATE public.activity_logs
    SET
        status = 'approved',
        total_reward_vibes = p_final_vibes,
        ai_evaluation = p_ai_evaluation
    WHERE id = p_log_id
    RETURNING id INTO v_log_id;

    UPDATE public.profiles
    SET total_vibes = COALESCE(total_vibes, 0) + p_final_vibes
    WHERE id = v_user_id;

    RETURN jsonb_build_object('ok', true, 'vibes_added', p_final_vibes);
END;
```
