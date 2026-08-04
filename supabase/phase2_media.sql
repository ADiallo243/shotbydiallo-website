-- Run this once in the Supabase SQL editor before enabling the managed media library.
-- It is safe to run after the initial CRM schema.

alter table public.media_assets
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists media_assets_website_placement_unique
  on public.media_assets (website_placement)
  where website_placement is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners manage site media files" on storage.objects;
create policy "Owners manage site media files"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'site-media'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  )
  with check (
    bucket_id = 'site-media'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  );

drop policy if exists "Public reads published website media" on public.media_assets;
create policy "Public reads published website media"
  on public.media_assets for select to anon
  using (website_placement is not null);
