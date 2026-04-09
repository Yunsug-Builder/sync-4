-- SYNC core tables (Supabase / PostgreSQL)
-- SQL Editor 또는 supabase db push 등으로 실행하세요.
-- profiles.id 는 Supabase Auth 의 사용자와 1:1 로 연결됩니다.

-- ---------------------------------------------------------------------------
-- profiles: 앱 사용자 공개 프로필 (auth.users 와 동일한 PK)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'SYNC 사용자 프로필; id 는 auth.users.id 와 동일';

-- ---------------------------------------------------------------------------
-- spots: 성지·추천 장소 등
-- ---------------------------------------------------------------------------
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  region text,
  reward_points integer not null default 0 check (reward_points >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spots is '팬덤 성지/추천 장소';

-- ---------------------------------------------------------------------------
-- activities: 특정 사용자가 특정 스팟에서 남긴 활동(체크인·인증 등)
-- profiles · spots 와 FK 로 유기적으로 연결
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles (id)
    on delete cascade
    on update cascade,
  spot_id uuid not null
    references public.spots (id)
    on delete restrict
    on update cascade,
  kind text not null default 'visit',
  points_earned integer not null default 0 check (points_earned >= 0),
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.activities is '사용자-장소 단위 활동 로그; profile_id·spot_id FK';

create index if not exists activities_profile_id_idx
  on public.activities (profile_id);

create index if not exists activities_spot_id_idx
  on public.activities (spot_id);

create index if not exists activities_created_at_idx
  on public.activities (created_at desc);
