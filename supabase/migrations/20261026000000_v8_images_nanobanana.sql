-- V8 : Nano Banana 2.1 génère toutes les illustrations ; GPT Image 2 est le seul secours.
-- Les anciennes images (Recraft, Seedream, Gemini) restent lisibles : les valeurs existantes
-- sont conservées dans les contraintes, seules les nouvelles sont ajoutées.

alter table public.app_settings drop constraint if exists app_settings_image_vector_provider_check;
alter table public.app_settings add constraint app_settings_image_vector_provider_check
  check (image_vector_provider in ('recraft', 'seedream', 'nanobanana', 'gptimage'));
alter table public.app_settings drop constraint if exists app_settings_image_realistic_provider_check;
alter table public.app_settings add constraint app_settings_image_realistic_provider_check
  check (image_realistic_provider in ('recraft', 'seedream', 'nanobanana', 'gptimage'));
alter table public.app_settings drop constraint if exists app_settings_image_diagram_provider_check;
alter table public.app_settings add constraint app_settings_image_diagram_provider_check
  check (image_diagram_provider in ('recraft', 'seedream', 'nanobanana', 'gptimage'));
alter table public.app_settings drop constraint if exists app_settings_image_illustration_provider_check;
alter table public.app_settings add constraint app_settings_image_illustration_provider_check
  check (image_illustration_provider in ('recraft', 'seedream', 'nanobanana', 'gptimage'));

alter table public.app_settings alter column image_illustration_provider set default 'nanobanana';
alter table public.app_settings alter column image_illustration_model set default 'google/gemini-nano-banana-2.1';
alter table public.app_settings alter column image_vector_provider set default 'nanobanana';
alter table public.app_settings alter column image_vector_model set default 'google/gemini-nano-banana-2.1';
alter table public.app_settings alter column image_realistic_provider set default 'nanobanana';
alter table public.app_settings alter column image_realistic_model set default 'google/gemini-nano-banana-2.1';
alter table public.app_settings alter column image_diagram_provider set default 'nanobanana';
alter table public.app_settings alter column image_diagram_model set default 'google/gemini-nano-banana-2.1';

update public.app_settings set
  image_illustration_provider = 'nanobanana', image_illustration_model = 'google/gemini-nano-banana-2.1',
  image_vector_provider = 'nanobanana', image_vector_model = 'google/gemini-nano-banana-2.1',
  image_realistic_provider = 'nanobanana', image_realistic_model = 'google/gemini-nano-banana-2.1',
  image_diagram_provider = 'nanobanana', image_diagram_model = 'google/gemini-nano-banana-2.1';

-- Images de secours (GPT Image 2) : fournisseur « openai » dans les assets.
alter table public.visual_assets drop constraint if exists visual_assets_provider_check;
alter table public.visual_assets add constraint visual_assets_provider_check
  check (provider in ('commons', 'unsplash', 'gemini', 'recraft', 'seedream', 'openai'));
