-- Owners can delete their own generated files and the matching asset rows.
create policy "outputs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "assets owner delete output" on public.assets for delete to authenticated
  using (auth.uid() = user_id and bucket = 'outputs');
