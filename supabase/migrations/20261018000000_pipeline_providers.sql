-- Pipeline (Atlas) : illustrations vectorielles Recraft (SVG assaini). Idempotent, ajouts seulement.
alter table public.visual_assets drop constraint if exists visual_assets_provider_check;
alter table public.visual_assets add constraint visual_assets_provider_check
  check (provider in ('commons', 'unsplash', 'gemini', 'recraft'));
alter table public.visual_assets drop constraint if exists visual_assets_mime_check;
alter table public.visual_assets add constraint visual_assets_mime_check
  check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'));
