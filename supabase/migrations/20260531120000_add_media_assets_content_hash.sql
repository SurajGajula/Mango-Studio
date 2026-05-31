alter table public.media_assets
  add column if not exists content_hash text;

create index if not exists media_assets_user_image_content_hash_idx
  on public.media_assets (user_id, content_hash)
  where kind = 'image' and content_hash is not null;
