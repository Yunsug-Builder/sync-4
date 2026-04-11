-- 상세 페이지 조회수: 클라이언트가 호출하는 RPC 이름·파라미터 정리

create or replace function public.increment_view_count(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_logs
  set view_count = view_count + 1
  where id = p_log_id
    and status = 'approved';
end;
$$;

comment on function public.increment_view_count(uuid) is
  '상세 페이지 조회 시 view_count +1 (승인된 글만)';

revoke all on function public.increment_view_count(uuid) from public;
grant execute on function public.increment_view_count(uuid) to anon, authenticated;

-- 이전 이름은 제거(이미 배포한 환경에서만 존재할 수 있음)
drop function if exists public.increment_activity_log_views(uuid);
