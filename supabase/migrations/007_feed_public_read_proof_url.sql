-- 피드용 원문 링크 + 승인된 활동 공개 조회 (RLS)

alter table public.activity_logs
  add column if not exists proof_url text;

comment on column public.activity_logs.proof_url is '원문·참고 링크 (선택)';

-- 누구나 승인된 인증은 피드에서 조회 가능
drop policy if exists "activity_logs_select_approved_public" on public.activity_logs;
create policy "activity_logs_select_approved_public"
  on public.activity_logs for select
  to anon, authenticated
  using (status = 'approved');

-- 승인된 인증이 있는 작성자의 프로필(닉네임 등)은 피드 조인을 위해 읽기 허용
drop policy if exists "profiles_select_if_feed_author" on public.profiles;
create policy "profiles_select_if_feed_author"
  on public.profiles for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.activity_logs al
      where al.user_id = profiles.id
        and al.status = 'approved'
    )
  );
