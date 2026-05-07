alter table public.practices
  add column if not exists logo_storage_path text,
  add column if not exists vat_number text,
  add column if not exists hpcsa_number text,
  add column if not exists bhf_number text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text;

insert into storage.buckets (id, name, public)
values ('practice-branding', 'practice-branding', false)
on conflict (id) do nothing;
