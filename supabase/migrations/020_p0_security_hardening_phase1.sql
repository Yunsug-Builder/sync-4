-- Phase 1 P0 security hardening.
-- Production DB is the temporary source of truth for this migration.
-- Forward-only scope:
-- - protect profiles.total_vibes / profiles.is_admin from client writes
-- - protect activity_logs from direct client writes
-- - protect activity_syncs / activity_view_logs / settlement_history from direct client writes
-- - lock admin and settlement RPC execution to service_role
-- - keep view_count as public display metric only
-- - move reward settlement to verified qualified views

-- ---------------------------------------------------------------------------
-- profiles: RLS, grants, and sensitive-field guard
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM authenticated;

-- Keep current public read behavior needed by feed/profile/leaderboard screens.
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

DO $$
DECLARE
  v_insert_cols text;
  v_update_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO v_insert_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN (
      'id',
      'nickname',
      'avatar_url',
      'preferred_language',
      'x_handle'
    );

  IF v_insert_cols IS NOT NULL THEN
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', v_insert_cols);
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO v_update_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN (
      'nickname',
      'avatar_url',
      'preferred_language',
      'x_handle'
    );

  IF v_update_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_update_cols);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.guard_profiles_client_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'client cannot set profiles.is_admin';
    END IF;
    IF COALESCE(NEW.total_vibes, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'client cannot set profiles.total_vibes';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'client cannot change profiles.id';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'client cannot change profiles.is_admin';
  END IF;
  IF NEW.total_vibes IS DISTINCT FROM OLD.total_vibes THEN
    RAISE EXCEPTION 'client cannot change profiles.total_vibes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_profiles_client_sensitive_fields ON public.profiles;
CREATE TRIGGER tr_guard_profiles_client_sensitive_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profiles_client_sensitive_fields();

-- ---------------------------------------------------------------------------
-- activity_logs: RLS, grants, and direct client write protection
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_logs FROM authenticated;
GRANT SELECT ON TABLE public.activity_logs TO anon, authenticated;

DROP POLICY IF EXISTS "activity_logs_insert_own" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_own" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_delete_own" ON public.activity_logs;

DROP POLICY IF EXISTS "activity_logs_select_approved_public" ON public.activity_logs;
CREATE POLICY "activity_logs_select_approved_public"
  ON public.activity_logs
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "activity_logs_select_own" ON public.activity_logs;
CREATE POLICY "activity_logs_select_own"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_activity_logs_client_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'client cannot set activity_logs.user_id for another user';
    END IF;
    IF COALESCE(NEW.status, 'pending') IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'client cannot set activity_logs.status';
    END IF;
    IF COALESCE(NEW.view_count, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'client cannot set activity_logs.view_count';
    END IF;
    IF COALESCE(NEW.qualified_view_count, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'client cannot set activity_logs.qualified_view_count';
    END IF;
    IF COALESCE(NEW.bonus_vibes, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'client cannot set activity_logs.bonus_vibes';
    END IF;
    IF COALESCE(NEW.total_reward_vibes, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'client cannot set activity_logs.total_reward_vibes';
    END IF;
    IF COALESCE(NEW.is_settled, false) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'client cannot set activity_logs.is_settled';
    END IF;
    IF NEW.ai_evaluation IS NOT NULL THEN
      RAISE EXCEPTION 'client cannot set activity_logs.ai_evaluation';
    END IF;
    IF NEW.ai_score IS NOT NULL THEN
      RAISE EXCEPTION 'client cannot set activity_logs.ai_score';
    END IF;
    IF NEW.translations IS NOT NULL THEN
      RAISE EXCEPTION 'client cannot set activity_logs.translations';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'client cannot set activity_logs.deleted_at';
    END IF;
    IF NEW.admin_memo IS NOT NULL THEN
      RAISE EXCEPTION 'client cannot set activity_logs.admin_memo';
    END IF;
    IF NEW.created_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'client cannot set activity_logs.created_at';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'client cannot change activity_logs.user_id';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'client cannot change activity_logs.status';
  END IF;
  IF NEW.view_count IS DISTINCT FROM OLD.view_count THEN
    RAISE EXCEPTION 'client cannot change activity_logs.view_count';
  END IF;
  IF NEW.qualified_view_count IS DISTINCT FROM OLD.qualified_view_count THEN
    RAISE EXCEPTION 'client cannot change activity_logs.qualified_view_count';
  END IF;
  IF NEW.bonus_vibes IS DISTINCT FROM OLD.bonus_vibes THEN
    RAISE EXCEPTION 'client cannot change activity_logs.bonus_vibes';
  END IF;
  IF NEW.total_reward_vibes IS DISTINCT FROM OLD.total_reward_vibes THEN
    RAISE EXCEPTION 'client cannot change activity_logs.total_reward_vibes';
  END IF;
  IF NEW.is_settled IS DISTINCT FROM OLD.is_settled THEN
    RAISE EXCEPTION 'client cannot change activity_logs.is_settled';
  END IF;
  IF NEW.ai_evaluation IS DISTINCT FROM OLD.ai_evaluation THEN
    RAISE EXCEPTION 'client cannot change activity_logs.ai_evaluation';
  END IF;
  IF NEW.ai_score IS DISTINCT FROM OLD.ai_score THEN
    RAISE EXCEPTION 'client cannot change activity_logs.ai_score';
  END IF;
  IF NEW.translations IS DISTINCT FROM OLD.translations THEN
    RAISE EXCEPTION 'client cannot change activity_logs.translations';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'client cannot change activity_logs.deleted_at';
  END IF;
  IF NEW.admin_memo IS DISTINCT FROM OLD.admin_memo THEN
    RAISE EXCEPTION 'client cannot change activity_logs.admin_memo';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'client cannot change activity_logs.created_at';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_activity_logs_client_sensitive_fields ON public.activity_logs;
CREATE TRIGGER tr_guard_activity_logs_client_sensitive_fields
BEFORE INSERT OR UPDATE ON public.activity_logs
FOR EACH ROW
EXECUTE FUNCTION public.guard_activity_logs_client_sensitive_fields();

-- ---------------------------------------------------------------------------
-- Admin approval RPCs: service_role only, capped reward input.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_activity_log_v2(
  p_log_id uuid,
  p_final_vibes integer,
  p_ai_evaluation jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_final_vibes integer;
BEGIN
  IF p_final_vibes IS NULL OR p_final_vibes < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reward');
  END IF;
  IF p_final_vibes > 1000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reward_too_large');
  END IF;

  v_final_vibes := p_final_vibes;

  SELECT al.user_id
    INTO v_user_id
  FROM public.activity_logs al
  WHERE al.id = p_log_id
    AND al.status IN ('pending', 'analyzed')
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_pending');
  END IF;

  UPDATE public.activity_logs
  SET status = 'approved',
      total_reward_vibes = v_final_vibes,
      ai_evaluation = p_ai_evaluation
  WHERE id = p_log_id
    AND status IN ('pending', 'analyzed');

  UPDATE public.profiles
  SET total_vibes = COALESCE(total_vibes, 0) + v_final_vibes
  WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'vibes_added', v_final_vibes);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_activity_log(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_activity_log(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_approve_activity_log(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_activity_log(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_approve_activity_log_v2(uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_activity_log_v2(uuid, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.admin_approve_activity_log_v2(uuid, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_activity_log_v2(uuid, integer, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Reward interaction tables: direct client writes are blocked.
-- Counts and user sync state are exposed only through SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_view_logs ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_view_logs FROM PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_view_logs FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_view_logs FROM authenticated;

DROP POLICY IF EXISTS "Anyone can select view logs" ON public.activity_view_logs;
DROP POLICY IF EXISTS "Users can insert their own view logs" ON public.activity_view_logs;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_view_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_view_logs', v_policy.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.activity_syncs ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_syncs FROM PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_syncs FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_syncs FROM authenticated;
GRANT SELECT ON TABLE public.activity_syncs TO service_role;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_syncs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_syncs', v_policy.policyname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_sync_state(p_activity_id uuid)
RETURNS TABLE (
  sync_count bigint,
  is_synced boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_author_id uuid;
  v_sync_count bigint;
  v_is_synced boolean;
BEGIN
  SELECT al.user_id
    INTO v_author_id
  FROM public.activity_logs al
  WHERE al.id = p_activity_id
    AND al.status = 'approved';

  IF v_author_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::bigint
    INTO v_sync_count
  FROM public.activity_syncs s
  WHERE s.activity_id = p_activity_id
    AND s.user_id IS NOT NULL
    AND s.user_id <> v_author_id;

  IF v_viewer_id IS NULL OR v_viewer_id = v_author_id THEN
    v_is_synced := false;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.activity_syncs s
      WHERE s.activity_id = p_activity_id
        AND s.user_id = v_viewer_id
        AND s.user_id <> v_author_id
    )
      INTO v_is_synced;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(v_sync_count, 0)::bigint,
    COALESCE(v_is_synced, false)::boolean;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_activity_sync(
  p_activity_id uuid,
  p_synced boolean
)
RETURNS TABLE (
  sync_count bigint,
  is_synced boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_author_id uuid;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF p_synced IS NULL THEN
    RAISE EXCEPTION 'invalid_sync_state' USING ERRCODE = '22023';
  END IF;

  SELECT al.user_id
    INTO v_author_id
  FROM public.activity_logs al
  WHERE al.id = p_activity_id
    AND al.status = 'approved';

  IF v_author_id IS NULL THEN
    RETURN;
  END IF;

  IF v_author_id = v_viewer_id THEN
    RETURN QUERY
    SELECT state.sync_count, state.is_synced
    FROM public.get_activity_sync_state(p_activity_id) AS state;
    RETURN;
  END IF;

  IF p_synced IS TRUE THEN
    INSERT INTO public.activity_syncs (user_id, activity_id)
    VALUES (v_viewer_id, p_activity_id)
    ON CONFLICT (user_id, activity_id) DO NOTHING;
  ELSE
    DELETE FROM public.activity_syncs
    WHERE user_id = v_viewer_id
      AND activity_id = p_activity_id;
  END IF;

  RETURN QUERY
  SELECT state.sync_count, state.is_synced
  FROM public.get_activity_sync_state(p_activity_id) AS state;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_sync_counts(p_activity_ids uuid[])
RETURNS TABLE (
  activity_id uuid,
  sync_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    al.id AS activity_id,
    COUNT(s.activity_id)::bigint AS sync_count
  FROM public.activity_logs al
  LEFT JOIN public.activity_syncs s
    ON s.activity_id = al.id
   AND s.user_id IS NOT NULL
   AND s.user_id <> al.user_id
  WHERE p_activity_ids IS NOT NULL
    AND cardinality(p_activity_ids) > 0
    AND al.id = ANY(p_activity_ids)
    AND al.status = 'approved'
  GROUP BY al.id;
$$;

REVOKE ALL ON FUNCTION public.get_activity_sync_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_sync_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_activity_sync_state(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_activity_sync_state(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_activity_sync(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_activity_sync(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_activity_sync(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_activity_sync(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_activity_sync_counts(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_sync_counts(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_activity_sync_counts(uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_activity_sync_counts(uuid[]) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_activity_sync_counts(uuid[]) TO anon, authenticated, service_role;

ALTER TABLE public.settlement_history ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.settlement_history FROM PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.settlement_history FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.settlement_history FROM authenticated;
GRANT SELECT ON TABLE public.settlement_history TO authenticated;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settlement_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlement_history', v_policy.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "settlement_history_select_own"
  ON public.settlement_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Settlement RPC: service_role only, qualified-view based reward formula.
-- Existing settlement_history rows are not recalculated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perform_weekly_settlement()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count integer;
BEGIN
  WITH syncs AS (
    SELECT
      s.activity_id,
      COUNT(*)::integer AS sync_count
    FROM public.activity_syncs s
    JOIN public.activity_logs al_for_sync
      ON al_for_sync.id = s.activity_id
    WHERE s.user_id IS NOT NULL
      AND s.user_id <> al_for_sync.user_id
    GROUP BY s.activity_id
  ),
  verified_views AS (
    SELECT avl.activity_id, COUNT(*)::integer AS qualified_views
    FROM public.activity_view_logs avl
    JOIN public.activity_logs al_for_view
      ON al_for_view.id = avl.activity_id
    WHERE avl.user_id IS NOT NULL
      AND avl.user_id <> al_for_view.user_id
    GROUP BY avl.activity_id
  ),
  eligible_logs AS (
    SELECT
      al.id,
      al.user_id,
      COALESCE(s.sync_count, 0) AS sync_count,
      COALESCE(vv.qualified_views, 0) AS qualified_views,
      CASE
        WHEN COALESCE(al.total_reward_vibes, 0) > 0 THEN al.total_reward_vibes
        ELSE COALESCE(at.base_vibes, 0)
      END AS initial_reward_vibes
    FROM public.activity_logs al
    LEFT JOIN public.activity_types at
      ON at.id = al.activity_type_id
    LEFT JOIN syncs s ON s.activity_id = al.id
    LEFT JOIN verified_views vv ON vv.activity_id = al.id
    WHERE al.status = 'approved'
      AND COALESCE(al.is_settled, false) = false
  ),
  log_bonus AS (
    SELECT
      id,
      user_id,
      sync_count,
      qualified_views,
      initial_reward_vibes,
      GREATEST(0, (sync_count * 5) + (qualified_views / 10))::integer AS bonus_vibes
    FROM eligible_logs
  ),
  user_week AS (
    SELECT
      user_id,
      (date_trunc('week', now() - interval '1 week'))::date AS week_start,
      SUM(sync_count)::integer AS total_syncs_count,
      SUM(qualified_views)::integer AS total_views_count,
      SUM(bonus_vibes)::integer AS bonus_vibes
    FROM log_bonus
    GROUP BY user_id
  ),
  inserted_history AS (
    INSERT INTO public.settlement_history (
      user_id,
      week_start,
      total_syncs_count,
      total_views_count,
      bonus_vibes
    )
    SELECT
      user_id,
      week_start,
      total_syncs_count,
      total_views_count,
      bonus_vibes
    FROM user_week
    WHERE bonus_vibes > 0
    RETURNING user_id
  ),
  updated_profiles AS (
    UPDATE public.profiles p
    SET total_vibes = COALESCE(p.total_vibes, 0) + uw.bonus_vibes
    FROM user_week uw
    WHERE p.id = uw.user_id
      AND uw.bonus_vibes > 0
    RETURNING p.id
  ),
  updated_logs AS (
    UPDATE public.activity_logs al
    SET is_settled = true,
        bonus_vibes = lb.bonus_vibes,
        total_reward_vibes = lb.initial_reward_vibes + lb.bonus_vibes
    FROM log_bonus lb
    WHERE al.id = lb.id
    RETURNING al.id
  )
  SELECT COUNT(*)::integer
    INTO v_user_count
  FROM updated_profiles;

  RETURN COALESCE(v_user_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.perform_weekly_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perform_weekly_settlement() FROM anon;
REVOKE ALL ON FUNCTION public.perform_weekly_settlement() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.perform_weekly_settlement() TO service_role;

-- ---------------------------------------------------------------------------
-- Weekly leaderboard RPCs: keep public view_count display separate from points.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_weekly_rising_leaderboard(integer);
DROP FUNCTION IF EXISTS public.get_weekly_rising_user_place(uuid);

CREATE OR REPLACE FUNCTION public.get_weekly_rising_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  nickname text,
  avatar_url text,
  weekly_points bigint,
  week_post_count bigint,
  week_sync_received bigint,
  week_view_sum bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('week', timezone('utc', now()))) AT TIME ZONE 'utc' AS week_start_utc,
      now() AS now_ts
  ),
  sync_per_log AS (
    SELECT s.activity_id, count(*)::integer AS sync_count
    FROM public.activity_syncs s
    JOIN public.activity_logs al_for_sync
      ON al_for_sync.id = s.activity_id
    WHERE s.user_id IS NOT NULL
      AND s.user_id <> al_for_sync.user_id
    GROUP BY s.activity_id
  ),
  week_logs AS (
    SELECT
      al.id,
      al.user_id,
      COALESCE(al.qualified_view_count, 0)::integer AS qualified_view_count,
      COALESCE(at.base_vibes, 0)::integer AS base_vibes,
      COALESCE(spl.sync_count, 0)::integer AS sync_on_log
    FROM public.activity_logs al
    INNER JOIN public.activity_types at ON at.id = al.activity_type_id
    CROSS JOIN bounds b
    LEFT JOIN sync_per_log spl ON spl.activity_id = al.id
    WHERE al.status = 'approved'
      AND al.created_at >= b.week_start_utc
      AND al.created_at <= b.now_ts
  ),
  per_log AS (
    SELECT
      wl.user_id,
      wl.qualified_view_count,
      (wl.base_vibes + GREATEST(0, wl.sync_on_log * 5 + (wl.qualified_view_count / 10)))::bigint AS log_points
    FROM week_logs wl
  ),
  per_user AS (
    SELECT
      pl.user_id,
      SUM(pl.log_points)::bigint AS weekly_points,
      COUNT(*)::bigint AS week_post_count,
      SUM(pl.qualified_view_count)::bigint AS week_view_sum
    FROM per_log pl
    GROUP BY pl.user_id
  ),
  syncs_week AS (
    SELECT al.user_id, COUNT(*)::bigint AS week_sync_received
    FROM public.activity_syncs s
    INNER JOIN public.activity_logs al ON al.id = s.activity_id
    CROSS JOIN bounds b
    WHERE s.created_at >= b.week_start_utc
      AND s.created_at <= b.now_ts
      AND al.status = 'approved'
      AND s.user_id IS NOT NULL
      AND s.user_id <> al.user_id
    GROUP BY al.user_id
  )
  SELECT
    p.id AS user_id,
    p.nickname,
    p.avatar_url,
    pu.weekly_points,
    pu.week_post_count,
    COALESCE(sw.week_sync_received, 0)::bigint AS week_sync_received,
    pu.week_view_sum
  FROM per_user pu
  INNER JOIN public.profiles p ON p.id = pu.user_id
  LEFT JOIN syncs_week sw ON sw.user_id = pu.user_id
  ORDER BY pu.weekly_points DESC, pu.user_id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_rising_user_place(p_user_id uuid)
RETURNS TABLE (
  rank bigint,
  weekly_points bigint,
  week_post_count bigint,
  week_sync_received bigint,
  week_view_sum bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('week', timezone('utc', now()))) AT TIME ZONE 'utc' AS week_start_utc,
      now() AS now_ts
  ),
  sync_per_log AS (
    SELECT s.activity_id, count(*)::integer AS sync_count
    FROM public.activity_syncs s
    JOIN public.activity_logs al_for_sync
      ON al_for_sync.id = s.activity_id
    WHERE s.user_id IS NOT NULL
      AND s.user_id <> al_for_sync.user_id
    GROUP BY s.activity_id
  ),
  week_logs AS (
    SELECT
      al.id,
      al.user_id,
      COALESCE(al.qualified_view_count, 0)::integer AS qualified_view_count,
      COALESCE(at.base_vibes, 0)::integer AS base_vibes,
      COALESCE(spl.sync_count, 0)::integer AS sync_on_log
    FROM public.activity_logs al
    INNER JOIN public.activity_types at ON at.id = al.activity_type_id
    CROSS JOIN bounds b
    LEFT JOIN sync_per_log spl ON spl.activity_id = al.id
    WHERE al.status = 'approved'
      AND al.created_at >= b.week_start_utc
      AND al.created_at <= b.now_ts
  ),
  per_log AS (
    SELECT
      wl.user_id,
      wl.qualified_view_count,
      (wl.base_vibes + GREATEST(0, wl.sync_on_log * 5 + (wl.qualified_view_count / 10)))::bigint AS log_points
    FROM week_logs wl
  ),
  per_user AS (
    SELECT
      pl.user_id,
      SUM(pl.log_points)::bigint AS weekly_points,
      COUNT(*)::bigint AS week_post_count,
      SUM(pl.qualified_view_count)::bigint AS week_view_sum
    FROM per_log pl
    GROUP BY pl.user_id
  ),
  syncs_week AS (
    SELECT al.user_id, COUNT(*)::bigint AS week_sync_received
    FROM public.activity_syncs s
    INNER JOIN public.activity_logs al ON al.id = s.activity_id
    CROSS JOIN bounds b
    WHERE s.created_at >= b.week_start_utc
      AND s.created_at <= b.now_ts
      AND al.status = 'approved'
      AND s.user_id IS NOT NULL
      AND s.user_id <> al.user_id
    GROUP BY al.user_id
  ),
  ranked AS (
    SELECT
      pu.user_id,
      pu.weekly_points,
      pu.week_post_count,
      pu.week_view_sum,
      row_number() OVER (ORDER BY pu.weekly_points DESC, pu.user_id ASC) AS rnk
    FROM per_user pu
  )
  SELECT
    r.rnk AS rank,
    r.weekly_points,
    r.week_post_count,
    COALESCE(sw.week_sync_received, 0)::bigint AS week_sync_received,
    r.week_view_sum
  FROM ranked r
  LEFT JOIN syncs_week sw ON sw.user_id = r.user_id
  WHERE r.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_rising_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_rising_leaderboard(integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_weekly_rising_user_place(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_rising_user_place(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- View count RPCs: public display count is separate from qualified reward count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_view_count_v5(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_author_id uuid;
  v_inserted integer := 0;
BEGIN
  SELECT al.user_id
    INTO v_author_id
  FROM public.activity_logs al
  WHERE al.id = p_log_id
    AND al.status = 'approved';

  IF v_author_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.activity_logs
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_log_id
    AND status = 'approved';

  IF v_viewer_id IS NULL OR v_viewer_id = v_author_id THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.activity_view_logs (user_id, activity_id, viewed_at)
    VALUES (v_viewer_id, p_log_id, CURRENT_DATE)
    ON CONFLICT (user_id, activity_id, viewed_at) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_inserted := 0;
  END;

  IF v_inserted > 0 THEN
    UPDATE public.activity_logs
    SET qualified_view_count = COALESCE(qualified_view_count, 0) + 1
    WHERE id = p_log_id
      AND status = 'approved';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_view_count_v4(
  p_log_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_user_id is intentionally ignored. Caller identity comes from auth.uid().
  PERFORM public.increment_view_count_v5(p_log_id);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_view_count_v5(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_view_count_v5(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.increment_view_count_v4(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_view_count_v4(uuid, uuid) TO anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.increment_view_count_v2(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_view_count_v2(uuid, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_view_count_v2(uuid, uuid) FROM anon;
    REVOKE ALL ON FUNCTION public.increment_view_count_v2(uuid, uuid) FROM authenticated;
  END IF;

  IF to_regprocedure('public.increment_view_count_v3(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_view_count_v3(uuid, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_view_count_v3(uuid, uuid) FROM anon;
    REVOKE ALL ON FUNCTION public.increment_view_count_v3(uuid, uuid) FROM authenticated;
  END IF;
END;
$$;
