-- Voiceover generations store audio files.
alter table public.generations drop constraint generations_kind_check;
alter table public.generations add constraint generations_kind_check check (kind = any (array['video','image','audio']));
