-- 주간 정산 일괄 처리: 미정산 승인 로그의 가중 보너스(Sync×5 + 조회÷10)를 settlement_history·profiles.total_points에 반영하고 is_settled = true

create or replace function public.perform_weekly_settlement()
returns integer
language sql
security definer
set search_path = public
as $$
  with syncs as (
    select activity_log_id, count(*)::int as c
    from activity_syncs
    group by activity_log_id
  ),
  log_rows as (
    select
      al.id as log_id,
      al.user_id,
      (date_trunc('week', (al.created_at at time zone 'utc')))::date as week_start,
      coalesce(s.c, 0) as sync_count,
      coalesce(al.view_count, 0) as view_count
    from activity_logs al
    left join syncs s on s.activity_log_id = al.id
    where al.status = 'approved' and al.is_settled = false
  ),
  log_bonus as (
    select
      log_id,
      user_id,
      week_start,
      greatest(0, sync_count * 5 + (view_count / 10))::int as bonus
    from log_rows
  ),
  user_week as (
    select user_id, week_start, sum(bonus)::int as total_bonus
    from log_bonus
    group by user_id, week_start
  ),
  ins as (
    insert into settlement_history (user_id, week_start, bonus_points)
    select user_id, week_start, total_bonus
    from user_week
    where total_bonus > 0
    on conflict (user_id, week_start) do update
    set bonus_points = settlement_history.bonus_points + excluded.bonus_points
    returning user_id
  ),
  upd_prof as (
    update profiles p
    set total_points = p.total_points + uw.total_bonus
    from user_week uw
    where p.id = uw.user_id and uw.total_bonus > 0
    returning p.id
  ),
  upd_logs as (
    update activity_logs al
    set is_settled = true
    where al.id in (select log_id from log_bonus)
    returning al.id
  )
  select coalesce((select count(distinct user_id)::int from log_bonus), 0);
$$;

comment on function public.perform_weekly_settlement() is
  '미정산 승인 활동의 가중 보너스를 정산하고, 처리에 포함된 서로 다른 유저 수를 반환합니다.';

revoke all on function public.perform_weekly_settlement() from public;
grant execute on function public.perform_weekly_settlement() to service_role;
