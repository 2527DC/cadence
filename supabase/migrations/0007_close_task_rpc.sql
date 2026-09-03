-- 0007_close_task_rpc.sql
-- The only door. Source of truth: doc/03-data-model-supabase.md §5
--
-- Why one RPC: the event row and the status flip are one transaction. There is no
-- window in which a task is closed without a note in the ledger.
--
-- Privileges for this function are granted in 0010 with everything else.
--
-- DEVIATION from the doc: added an ownership check on p_voice_note_id. Without it a
-- caller can attach a voice note belonging to another user, because the foreign key
-- is checked by the system, which does not apply RLS. Cheap to check, and the whole
-- point of this phase is that the record cannot be falsified.

create or replace function close_task(
  p_task_id       uuid,
  p_to_status     task_status,
  p_note          text default null,
  p_voice_note_id uuid default null,
  p_nc_reason     nc_reason default null
)
returns tasks
language plpgsql
security invoker            -- RLS still applies; the user can only touch their own rows
as $$
declare
  v_task tasks;
  v_from task_status;
begin
  if p_to_status = 'OPEN' then
    raise exception 'close_task cannot set status back to OPEN.'
      using errcode = 'check_violation';
  end if;

  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task % not found.', p_task_id
      using errcode = 'no_data_found';
  end if;

  if not v_task.is_finalized then
    raise exception 'Task % is still a draft. Finalize it before closing it.', p_task_id
      using errcode = 'check_violation';
  end if;

  v_from := v_task.status;
  if v_from = p_to_status then
    raise exception 'Task % is already %.', p_task_id, p_to_status
      using errcode = 'check_violation';
  end if;

  -- R3: note or voice note, always
  if p_voice_note_id is null
     and (p_note is null or length(trim(p_note)) < 15) then
    raise exception
      'A note of at least 15 characters, or a voice note, is required to close a task.'
      using errcode = 'check_violation';
  end if;

  -- reject low-effort placeholder notes
  if p_voice_note_id is null
     and lower(trim(p_note)) ~ '^(ok|done|na|n/a|nil|asdf|test|\.+|-+)$' then
    raise exception 'Write a real note. That one says nothing.'
      using errcode = 'check_violation';
  end if;

  -- a voice note stands in for the written note, so it had better be the caller's own
  if p_voice_note_id is not null
     and not exists (
       select 1 from voice_notes
        where id = p_voice_note_id and user_id = v_task.user_id
     ) then
    raise exception 'Voice note % does not belong to you.', p_voice_note_id
      using errcode = 'check_violation';
  end if;

  if p_to_status = 'NC' and p_nc_reason is null then
    raise exception 'NC requires a reason category.'
      using errcode = 'check_violation';
  end if;

  -- append the immutable event first
  insert into task_status_events
    (user_id, task_id, from_status, to_status, note, voice_note_id, nc_reason)
  values
    (v_task.user_id, p_task_id, v_from, p_to_status, p_note, p_voice_note_id, p_nc_reason);

  -- then flip the denormalized status, with the guard flag on
  perform set_config('cadence.closing_task', 'on', true);   -- true = transaction-local
  update tasks
     set status    = p_to_status,
         closed_at = now(),
         nc_reason = case when p_to_status = 'NC' then p_nc_reason else null end
   where id = p_task_id
  returning * into v_task;

  -- drop the flag again so the rest of the transaction cannot ride on it
  perform set_config('cadence.closing_task', 'off', true);

  return v_task;
end $$;
