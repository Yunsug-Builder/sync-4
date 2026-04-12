-- 주간 랭킹 RPC: 반환 컬럼 display_name 정렬, weekly_points > 0 만 노출 (프론트·PostgREST 계약 명확화)

create or replace function public.get_weekly_rising_leaderboard(p_limit integer default 50)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  weekly_points bigint,
  week_post_count bigint,
  week_sync_received bigint,
  week_view_sum bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('week', timezone('utc', now()))) at time zone 'utc' as week_start_utc,
      now() as now_ts
  ),
  sync_per_log as (
    select activity_log_id, count(*)::int as c
    from public.activity_syncs
    group by activity_log_id
  ),
  week_logs as (
    select
      al.id,
      al.user_id,
      coalesce(al.view_count, 0) as view_count,
      at.base_points,
      coalesce(spl.c, 0) as sync_on_log
    from public.activity_logs al
    inner join public.activity_types at on at.id = al.activity_type_id
    cross join bounds b
    left join sync_per_log spl on spl.activity_log_id = al.id
    where al.status = 'approved'
      and al.created_at >= b.week_start_utc
      and al.created_at <= b.now_ts
  ),
  per_log as (
    select
      wl.user_id,
      wl.view_count,
      (wl.base_points + greatest(0, wl.sync_on_log * 5 + (wl.view_count / 10)))::bigint as log_points
    from week_logs wl
  ),
  per_user as (
    select
      pl.user_id,
      sum(pl.log_points)::bigint as weekly_points,
      count(*)::bigint as week_post_count,
      sum(pl.view_count)::bigint as week_view_sum
    from per_log pl
    group by pl.user_id
  ),
  syncs_week as (
    select al.user_id, count(*)::bigint as week_sync_received
    from public.activity_syncs s
    inner join public.activity_logs al on al.id = s.activity_log_id
    cross join bounds b
    where s.created_at >= b.week_start_utc
      and s.created_at <= b.now_ts
      and al.status = 'approved'
    group by al.user_id
  )
  select
    p.id as user_id,
    p.nickname as display_name,
    p.avatar_url,
    pu.weekly_points,
    pu.week_post_count,
    coalesce(sw.week_sync_received, 0)::bigint as week_sync_received,
    pu.week_view_sum
  from per_user pu
  inner join public.profiles p on p.id = pu.user_id
  left join syncs_week sw on sw.user_id = pu.user_id
  where pu.weekly_points > 0
  order by pu.weekly_points desc, pu.user_id asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.get_weekly_rising_leaderboard(integer) is
  'UTC 주 시작~현재 승인 활동 기준 주간 포인트(>0) 상위 랭킹. display_name = profiles.nickname';

-- 015에서 부여한 EXECUTE 권한은 REPLACE 시 유지됩니다.
