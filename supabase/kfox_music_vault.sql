-- K-FOX MUSIC VAULT
-- Run once in Supabase SQL Editor. Creates private metadata and a private audio bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kfox-music-vault', 'kfox-music-vault', false, 52428800, array['audio/mpeg','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=52428800, allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.kfox_music_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  audio_path text not null,
  cover_path text,
  lyrics text,
  created_at timestamptz not null default now()
);
alter table public.kfox_music_tracks enable row level security;
drop policy if exists "Users manage own music tracks" on public.kfox_music_tracks;
create policy "Users manage own music tracks" on public.kfox_music_tracks
for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Users manage own music files" on storage.objects;
create policy "Users manage own music files" on storage.objects
for all to authenticated
using (bucket_id = 'kfox-music-vault' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'kfox-music-vault' and (storage.foldername(name))[1] = auth.uid()::text);
