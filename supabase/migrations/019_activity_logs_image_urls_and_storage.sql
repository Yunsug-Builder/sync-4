-- activity_logs: 다중 이미지 URL 배열 + 공개 Storage 버킷 activity-images

alter table public.activity_logs
  add column if not exists image_urls text[];

comment on column public.activity_logs.image_urls is
  '직접 기록 시 첨부 이미지 공개 URL 목록 (Supabase Storage)';

-- ---------------------------------------------------------------------------
-- Storage: activity-images (공개 읽기, 본인 폴더만 업로드·삭제)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-images',
  'activity-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "activity_images_select_public" on storage.objects;
create policy "activity_images_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'activity-images');

drop policy if exists "activity_images_insert_own_folder" on storage.objects;
create policy "activity_images_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'activity-images'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );

drop policy if exists "activity_images_update_own_folder" on storage.objects;
create policy "activity_images_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'activity-images'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  )
  with check (
    bucket_id = 'activity-images'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );

drop policy if exists "activity_images_delete_own_folder" on storage.objects;
create policy "activity_images_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'activity-images'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );
