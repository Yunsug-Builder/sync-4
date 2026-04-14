# RPC 명세서 (Source of Truth)

기준 파일: `Supabase Snippet Function Docs in Markdown.csv`

---

### admin_approve_activity_log(p_log_id uuid)
- **Return Type**: jsonb
- **Source Code**:
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

### get_weekly_rising_leaderboard(p_limit integer DEFAULT 50)
- **Return Type**: TABLE(user_id uuid, display_name text, avatar_url text, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint)
- **Source Code**:
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

### get_weekly_rising_user_place(p_user_id uuid)
- **Return Type**: TABLE(rank bigint, weekly_vibes bigint, week_post_count bigint, week_sync_received bigint, week_view_sum bigint)
- **Source Code**:
```sql
  WITH leaderboard AS (SELECT user_id, weekly_vibes, week_post_count, week_sync_received, week_view_sum, ROW_NUMBER() OVER (ORDER BY weekly_vibes DESC) as rnk FROM public.get_weekly_rising_leaderboard(200))
  SELECT rnk, weekly_vibes, week_post_count, week_sync_received, week_view_sum FROM leaderboard WHERE user_id = p_user_id;
```

### increment_view_count_v2(p_log_id uuid, p_user_id uuid DEFAULT NULL::uuid)
- **Return Type**: void
- **Source Code**:
```sql
BEGIN
    -- 1. [정책] 비로그인 유저인 경우 즉시 종료
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    -- 2. [정책] 본인 게시글인 경우 조회수 증가 안 함
    IF EXISTS (SELECT 1 FROM activity_logs WHERE id = p_log_id AND user_id = p_user_id) THEN
        RETURN;
    END IF;

    -- 3. [정책] 하루 1회 제한 (중복 로그 체크)
    INSERT INTO activity_view_logs (user_id, activity_id)
    VALUES (p_user_id, p_log_id)
    ON CONFLICT (user_id, activity_id, viewed_at) DO NOTHING;

    -- 4. 신규 조회인 경우에만 실제 숫자 업데이트
    IF FOUND THEN
        UPDATE activity_logs SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_log_id;
    END IF;
END;
```

### perform_weekly_settlement()
- **Return Type**: integer
- **Source Code**:
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
        FROM activity_logs al
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

    UPDATE activity_logs SET 
        is_settled = TRUE,
        bonus_vibes = ((SELECT COUNT(*) FROM activity_syncs WHERE activity_id = activity_logs.id) * 5 + (COALESCE(view_count, 0) / 10)),
        total_reward_vibes = ((SELECT base_vibes FROM activity_types WHERE id = activity_type_id) + ((SELECT COUNT(*) FROM activity_syncs WHERE activity_id = activity_logs.id) * 5 + (COALESCE(view_count, 0) / 10)))
    WHERE status = 'approved' AND is_settled = FALSE;

    RETURN v_user_count;
END;
```

### purchase_item(p_item_id uuid)
- **Return Type**: jsonb
- **Source Code**:
```sql
DECLARE
    v_user_id uuid := auth.uid(); -- 현재 로그인한 유저 ID
    v_item_price bigint;
    v_user_vibes bigint;
BEGIN
    -- 1. 상품 가격 확인
    SELECT price INTO v_item_price FROM shop_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다.');
    END IF;

    -- 2. 유저의 현재 바이브 잔액 확인
    SELECT total_vibes INTO v_user_vibes FROM profiles WHERE id = v_user_id;
    IF v_user_vibes < v_item_price THEN
        RETURN jsonb_build_object('ok', false, 'error', '바이브가 부족합니다.');
    END IF;

    -- 3. 트랜잭션 처리: 바이브 차감 및 인벤토리 추가
    -- 바이브 차감
    UPDATE profiles 
    SET total_vibes = total_vibes - v_item_price 
    WHERE id = v_user_id;

    -- 인벤토리 추가
    INSERT INTO user_inventory (user_id, item_id)
    VALUES (v_user_id, p_item_id);

    RETURN jsonb_build_object('ok', true, 'message', '구매가 완료되었습니다.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
```
