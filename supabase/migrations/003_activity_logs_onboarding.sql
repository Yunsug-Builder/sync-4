-- Onboarding: explicit nickname (null = user must set in app)
alter table public.profiles
  add column if not exists nickname text;

-- New signups: nickname null → 온보딩에서 설정 (display_name 컬럼 미사용)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    null,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- artists: catalog (may already exist in your project)
-- ---------------------------------------------------------------------------
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

comment on table public.artists is '팬덤 아티스트 카탈로그';

-- ---------------------------------------------------------------------------
-- activity_types: selectable activity kinds for submissions
-- ---------------------------------------------------------------------------
create table if not exists public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.activity_types is '활동 인증 유형 (드롭다운용)';

-- ---------------------------------------------------------------------------
-- activity_logs: user submissions pending admin approval
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles (id)
    on delete cascade
    on update cascade,
  artist_id uuid not null
    references public.artists (id)
    on delete restrict
    on update cascade,
  activity_type_id uuid not null
    references public.activity_types (id)
    on delete restrict
    on update cascade,
  proof_text text,
  proof_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint activity_logs_proof_nonempty check (
    (proof_text is not null and length(trim(proof_text)) > 0)
    or (proof_url is not null and length(trim(proof_url)) > 0)
  )
);

comment on table public.activity_logs is '사용자 활동 인증 제출 (관리자 승인 전)';

create index if not exists activity_logs_user_id_idx
  on public.activity_logs (user_id);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.artists enable row level security;
alter table public.activity_types enable row level security;
alter table public.activity_logs enable row level security;
alter table public.profiles enable row level security;

-- Idempotent policy creation
drop policy if exists "artists_select_public" on public.artists;
create policy "artists_select_public"
  on public.artists for select
  using (true);

drop policy if exists "activity_types_select_public" on public.activity_types;
create policy "activity_types_select_public"
  on public.activity_types for select
  using (true);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "activity_logs_insert_own" on public.activity_logs;
create policy "activity_logs_insert_own"
  on public.activity_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "activity_logs_select_own" on public.activity_logs;
create policy "activity_logs_select_own"
  on public.activity_logs for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed default activity types (safe to re-run)
-- ---------------------------------------------------------------------------
insert into public.activity_types (name, slug, sort_order)
values
  ('현장 인증', 'live', 10),
  ('굿즈 인증', 'goods', 20),
  ('SNS 인증', 'sns', 30),
  ('기타', 'other', 90)
on conflict (slug) do nothing;
