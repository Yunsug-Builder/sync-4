-- 활동 유형별 기본 점수 + 원자적 승인 RPC (서비스 롤 전용 실행)

alter table public.activity_types
  add column if not exists base_points integer not null default 10;

update public.activity_types set base_points = 30 where slug = 'live';
update public.activity_types set base_points = 20 where slug = 'goods';
update public.activity_types set base_points = 15 where slug = 'sns';
update public.activity_types set base_points = 10 where slug = 'other';

comment on column public.activity_types.base_points is '승인 시 profiles.total_points 에 더해질 점수';

-- ---------------------------------------------------------------------------
-- 관리자 승인: pending 로그를 approved 로 바꾸고 점수 반영 (단일 트랜잭션)
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_activity_log(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_points integer;
  v_log_id uuid;
begin
  select al.user_id, at.base_points
  into v_user_id, v_points
  from public.activity_logs al
  join public.activity_types at on at.id = al.activity_type_id
  where al.id = p_log_id and al.status = 'pending';

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_not_pending');
  end if;

  update public.activity_logs
  set status = 'approved'
  where id = p_log_id and status = 'pending'
  returning id into v_log_id;

  if v_log_id is null then
    return jsonb_build_object('ok', false, 'error', 'concurrent_update');
  end if;

  update public.profiles
  set total_points = total_points + v_points
  where id = v_user_id;

  return jsonb_build_object('ok', true, 'points_added', v_points);
end;
$$;

comment on function public.admin_approve_activity_log(uuid) is
  '관리자 승인: activity_logs 승인 + profiles.total_points 반영';

revoke all on function public.admin_approve_activity_log(uuid) from public;
grant execute on function public.admin_approve_activity_log(uuid) to service_role;
