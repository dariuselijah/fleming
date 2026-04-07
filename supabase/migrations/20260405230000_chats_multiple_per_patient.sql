-- Allow multiple consult threads per user + patient (drop unique constraint).
drop index if exists public.chats_user_id_patient_id_key;

create index if not exists chats_user_id_patient_id_idx
  on public.chats (user_id, patient_id)
  where patient_id is not null;

comment on index public.chats_user_id_patient_id_idx is 'List/filter chats for a clinical patient; not unique.';
