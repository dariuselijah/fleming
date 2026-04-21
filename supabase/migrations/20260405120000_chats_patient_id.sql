-- Scoped consult thread per user + patient. Run in Supabase SQL editor or via CLI.
alter table public.chats
  add column if not exists patient_id text null;

create unique index if not exists chats_user_id_patient_id_key
  on public.chats (user_id, patient_id)
  where patient_id is not null;

comment on column public.chats.patient_id is 'Clinical workspace patient id; null = general (non-patient) chat.';
