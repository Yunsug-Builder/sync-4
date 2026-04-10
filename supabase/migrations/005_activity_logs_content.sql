-- activity_logs: 인증 본문을 content 단일 컬럼으로 통일

alter table public.activity_logs add column if not exists content text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_logs'
      and column_name = 'proof_text'
  ) then
    update public.activity_logs
    set content = trim(proof_text)
    where (content is null or length(trim(content)) = 0)
      and proof_text is not null
      and length(trim(proof_text)) > 0;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_logs'
      and column_name = 'proof_url'
  ) then
    update public.activity_logs
    set content = trim(proof_url)
    where (content is null or length(trim(content)) = 0)
      and proof_url is not null
      and length(trim(proof_url)) > 0;
  end if;
end $$;

delete from public.activity_logs
where content is null or length(trim(content)) = 0;

alter table public.activity_logs drop constraint if exists activity_logs_proof_nonempty;

alter table public.activity_logs drop column if exists proof_text;
alter table public.activity_logs drop column if exists proof_url;

alter table public.activity_logs drop constraint if exists activity_logs_content_nonempty;

alter table public.activity_logs
  add constraint activity_logs_content_nonempty
  check (content is not null and length(trim(content)) > 0);

comment on column public.activity_logs.content is '사용자가 제출한 인증 텍스트';
