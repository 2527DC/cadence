-- 0012_storage_bucket.sql
-- Source of truth: doc/03-data-model-supabase.md §6 "Storage policies"
--
-- Path convention: voice-notes/{user_id}/{uuid}.m4a
-- storage.foldername(name)[1] is therefore the owning user's id, which is what the
-- policies match on.
--
-- Locally, storage.buckets / storage.objects come from the shim in supabase/local/.
-- On a hosted project they already exist and this file applies unchanged.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  false,                                   -- private. Access only via signed URLs.
  52428800,                                -- 50 MB per object
  array['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy "own voice notes read" on storage.objects for select
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own voice notes write" on storage.objects for insert
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

-- no update policy and no delete policy: recordings are permanent, exactly like the
-- task_status_events ledger. A recording that can be replaced is not evidence.
