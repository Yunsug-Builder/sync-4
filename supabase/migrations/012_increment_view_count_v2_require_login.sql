-- 비로그인(p_user_id NULL) 조회는 view_count를 올리지 않음 (클라이언트와 함께 이중 방어)

create or replace function public.increment_view_count_v2(p_log_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select al.user_id
  into v_author
  from public.activity_logs al
  where al.id = p_log_id
    and al.status = 'approved';

  if v_author is null then
    return;
  end if;

  if p_user_id = v_author then
    return;
  end if;

  update public.activity_logs
  set view_count = view_count + 1
  where id = p_log_id
    and status = 'approved';
end;
$$;

comment on function public.increment_view_count_v2(uuid, uuid) is
  '상세 조회 시 view_count +1. 비로그인·본인 글 조회는 제외.';
