-- 조회수, Sync(좋아요 대체), 댓글

alter table public.activity_logs
  add column if not exists view_count integer not null default 0;

comment on column public.activity_logs.view_count is '상세 페이지 조회 수(누적)';

-- ---------------------------------------------------------------------------
-- activity_syncs: 활동별 사용자 Sync (유니크 1인 1회)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_syncs (
  id uuid primary key default gen_random_uuid(),
  activity_log_id uuid not null
    references public.activity_logs (id)
    on delete cascade
    on update cascade,
  user_id uuid not null
    references public.profiles (id)
    on delete cascade
    on update cascade,
  created_at timestamptz not null default now(),
  unique (activity_log_id, user_id)
);

create index if not exists activity_syncs_activity_log_id_idx
  on public.activity_syncs (activity_log_id);

comment on table public.activity_syncs is '활동 인증에 대한 Sync(공감)';

-- ---------------------------------------------------------------------------
-- activity_comments: 승인된 활동에 대한 댓글
-- ---------------------------------------------------------------------------
create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_log_id uuid not null
    references public.activity_logs (id)
    on delete cascade
    on update cascade,
  user_id uuid not null
    references public.profiles (id)
    on delete cascade
    on update cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint activity_comments_content_nonempty check (length(trim(content)) > 0)
);

create index if not exists activity_comments_activity_log_id_idx
  on public.activity_comments (activity_log_id, created_at desc);

comment on table public.activity_comments is '승인된 활동 인증 댓글';

-- ---------------------------------------------------------------------------
-- 조회수 증가 RPC (RLS 우회, 승인된 글만)
-- ---------------------------------------------------------------------------
create or replace function public.increment_activity_log_views(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_logs
  set view_count = view_count + 1
  where id = p_activity_id
    and status = 'approved';
end;
$$;

comment on function public.increment_activity_log_views(uuid) is
  '상세 페이지 조회 시 view_count +1 (승인된 글만)';

revoke all on function public.increment_activity_log_views(uuid) from public;
grant execute on function public.increment_activity_log_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.activity_syncs enable row level security;
alter table public.activity_comments enable row level security;

drop policy if exists "activity_syncs_select" on public.activity_syncs;
create policy "activity_syncs_select"
  on public.activity_syncs for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.activity_logs al
      where al.id = activity_syncs.activity_log_id
        and al.status = 'approved'
    )
    or user_id = auth.uid()
  );

drop policy if exists "activity_syncs_insert_own" on public.activity_syncs;
create policy "activity_syncs_insert_own"
  on public.activity_syncs for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.activity_logs al
      where al.id = activity_log_id
        and al.status = 'approved'
    )
  );

drop policy if exists "activity_syncs_delete_own" on public.activity_syncs;
create policy "activity_syncs_delete_own"
  on public.activity_syncs for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "activity_comments_select" on public.activity_comments;
create policy "activity_comments_select"
  on public.activity_comments for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.activity_logs al
      where al.id = activity_comments.activity_log_id
        and al.status = 'approved'
    )
    or user_id = auth.uid()
  );

drop policy if exists "activity_comments_insert_own" on public.activity_comments;
create policy "activity_comments_insert_own"
  on public.activity_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.activity_logs al
      where al.id = activity_log_id
        and al.status = 'approved'
    )
  );

-- 댓글 작성자 프로필(닉네임) 조회
drop policy if exists "profiles_select_if_comment_on_approved" on public.profiles;
create policy "profiles_select_if_comment_on_approved"
  on public.profiles for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.activity_comments c
      join public.activity_logs al on al.id = c.activity_log_id
      where c.user_id = profiles.id
        and al.status = 'approved'
    )
  );
