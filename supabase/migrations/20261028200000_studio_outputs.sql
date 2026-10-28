-- Studio: signed-in users save their own generated images under outputs/<uid>/studio/.
-- Read access to outputs/<uid>/ already exists ("outputs owner read").
-- Down: drop policy "outputs owner write studio" on storage.objects; drop policy "outputs owner delete studio" on storage.objects;
create policy "outputs owner write studio" on storage.objects for insert to authenticated
  with check (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text and (storage.foldername(name))[2] = 'studio');
create policy "outputs owner delete studio" on storage.objects for delete to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text and (storage.foldername(name))[2] = 'studio');
