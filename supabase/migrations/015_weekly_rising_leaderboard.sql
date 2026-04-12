-- 주간 라이징 스타: UTC 월요일 00:00 ~ 현재 승인 활동 기준 포인트(기본+예상 보너스) 집계 RPC

create or replace function public.get_weekly_rising_leaderboard(p_limit integer default 50)
returns table (
  user_id uuid,
  nickname text,
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
    p.nickname,
    p.avatar_url,
    pu.weekly_points,
    pu.week_post_count,
    coalesce(sw.week_sync_received, 0)::bigint as week_sync_received,
    pu.week_view_sum
  from per_user pu
  inner join public.profiles p on p.id = pu.user_id
  left join syncs_week sw on sw.user_id = pu.user_id
  order by pu.weekly_points desc, pu.user_id asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.get_weekly_rising_leaderboard(integer) is
  'UTC 주 시작(월요일 00:00)부터 현재까지 승인된 활동의 기본점수+예상 보너스(Sync×5+조회÷10) 합으로 상위 랭킹';

create or replace function public.get_weekly_rising_user_place(p_user_id uuid)
returns table (
  rank bigint,
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
  ),
  ranked as (
    select
      pu.user_id,
      pu.weekly_points,
      pu.week_post_count,
      pu.week_view_sum,
      row_number() over (order by pu.weekly_points desc, pu.user_id asc) as rnk
    from per_user pu
  )
  select
    r.rnk as rank,
    r.weekly_points,
    r.week_post_count,
    coalesce(sw.week_sync_received, 0)::bigint as week_sync_received,
    r.week_view_sum
  from ranked r
  left join syncs_week sw on sw.user_id = r.user_id
  where r.user_id = p_user_id;
$$;

comment on function public.get_weekly_rising_user_place(uuid) is
  '특정 유저의 이번 주 라이징 스타 순위·주간 포인트(상위 목록에 없을 때 사용)';

create index if not exists activity_logs_approved_created_at_desc_idx
  on public.activity_logs (created_at desc)
  where status = 'approved';

revoke all on function public.get_weekly_rising_leaderboard(integer) from public;
grant execute on function public.get_weekly_rising_leaderboard(integer) to anon, authenticated;

revoke all on function public.get_weekly_rising_user_place(uuid) from public;
grant execute on function public.get_weekly_rising_user_place(uuid) to anon, authenticated;
