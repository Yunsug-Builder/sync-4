-- 활동별 정산 완료 여부 + 주간 정산 이력

alter table public.activity_logs
  add column if not exists is_settled boolean not null default false;

comment on column public.activity_logs.is_settled is
  '주간 정산으로 가중 리워드 반영 여부';

create index if not exists activity_logs_user_settled_idx
  on public.activity_logs (user_id, is_settled)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- settlement_history: 사용자·주차(월요일 시작)별 정산된 보너스 포인트
-- ---------------------------------------------------------------------------
create table if not exists public.settlement_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles (id)
    on delete cascade
    on update cascade,
  week_start date not null,
  bonus_points integer not null check (bonus_points >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists settlement_history_user_idx
  on public.settlement_history (user_id, week_start desc);

comment on table public.settlement_history is '주간 정산으로 확정된 가중 보너스(주차별)';

alter table public.settlement_history enable row level security;

drop policy if exists "settlement_history_select_own" on public.settlement_history;
create policy "settlement_history_select_own"
  on public.settlement_history for select
  to authenticated
  using (auth.uid() = user_id);
