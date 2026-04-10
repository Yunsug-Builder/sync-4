-- App profiles shape: id, nickname, avatar_url, total_points
-- (기존 display_name 기반 트리거/컬럼과 충돌하지 않도록 가입 시 행만 생성)

alter table public.profiles add column if not exists total_points integer not null default 0;
alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists avatar_url text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url, total_points)
  values (
    new.id,
    null,
    new.raw_user_meta_data ->> 'avatar_url',
    0
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
