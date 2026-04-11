-- 조회수 v2: 작성자 본인 조회는 증가하지 않음 (p_user_id = activity_logs.user_id 이면 스킵)
-- 비로그인(p_user_id NULL)은 타인 글에 대해서만 기존처럼 +1

create or replace function public.increment_view_count_v2(p_log_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select al.user_id
  into v_author
  from public.activity_logs al
  where al.id = p_log_id
    and al.status = 'approved';

  if v_author is null then
    return;
  end if;

  if p_user_id is not null and p_user_id = v_author then
    return;
  end if;

  update public.activity_logs
  set view_count = view_count + 1
  where id = p_log_id
    and status = 'approved';
end;
$$;

comment on function public.increment_view_count_v2(uuid, uuid) is
  '상세 조회 시 view_count +1. 본인 글 조회(p_user_id=작성자)는 제외.';

revoke all on function public.increment_view_count_v2(uuid, uuid) from public;
grant execute on function public.increment_view_count_v2(uuid, uuid) to anon, authenticated;

-- 이전 RPC (단일 인자)는 유지해도 되나 혼동 방지를 위해 제거 가능
drop function if exists public.increment_view_count(uuid);
