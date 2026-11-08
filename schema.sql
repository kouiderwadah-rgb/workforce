-- ============================================================================
-- New Space / Workforce Intelligence - Supabase schema
-- Idempotent: safe to run multiple times in the Supabase SQL editor.
-- Includes: tables, RLS, helper functions, storage buckets, triggers, audit.
-- Statuses: profiles.status = pending | approved | rejected | suspended
--           ('active' is accepted as a legacy alias for 'approved')
-- Roles:    profiles.role    = staff | admin | owner  (never chosen at signup)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text,
  email            text,
  phone            text,
  role             text not null default 'staff',
  status           text not null default 'pending',
  rejection_reason text,
  position         text,
  nationality      text,
  avatar_path      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name        text;
alter table public.profiles add column if not exists email            text;
alter table public.profiles add column if not exists phone            text;
alter table public.profiles add column if not exists role             text not null default 'staff';
alter table public.profiles add column if not exists status           text not null default 'pending';
alter table public.profiles add column if not exists rejection_reason text;
alter table public.profiles add column if not exists position         text;
alter table public.profiles add column if not exists nationality      text;
alter table public.profiles add column if not exists avatar_path      text;
alter table public.profiles add column if not exists created_at       timestamptz not null default now();
alter table public.profiles add column if not exists updated_at       timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_chk') then
    alter table public.profiles
      add constraint profiles_role_chk check (role in ('staff','admin','owner'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_chk') then
    alter table public.profiles
      add constraint profiles_status_chk
      check (status in ('pending','approved','rejected','suspended','active'));
  end if;
end $$;

-- staff_documents: uploaded by a staff member, reviewed by admin/owner.
create table if not exists public.staff_documents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  doc_type     text not null,
  side         text,
  file_path    text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  status       text not null default 'pending',
  review_note  text,
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  expires_on   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.staff_documents add column if not exists side        text;
alter table public.staff_documents add column if not exists file_name    text;
alter table public.staff_documents add column if not exists mime_type    text;
alter table public.staff_documents add column if not exists size_bytes    bigint;
alter table public.staff_documents add column if not exists status        text not null default 'pending';
alter table public.staff_documents add column if not exists review_note   text;
alter table public.staff_documents add column if not exists reviewed_by   uuid references public.profiles(id);
alter table public.staff_documents add column if not exists reviewed_at   timestamptz;
alter table public.staff_documents add column if not exists expires_on    date;
alter table public.staff_documents add column if not exists created_at    timestamptz not null default now();
alter table public.staff_documents add column if not exists updated_at    timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_documents_status_chk') then
    alter table public.staff_documents
      add constraint staff_documents_status_chk check (status in ('pending','approved','rejected'));
  end if;
end $$;

create index if not exists staff_documents_profile_idx on public.staff_documents (profile_id);
create index if not exists staff_documents_status_idx  on public.staff_documents (status);

-- Legacy application table still used by the old operations/app pages.
create table if not exists public.staff_applications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  position     text,
  nationality  text,
  notes        text,
  documents    jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.staff_applications add column if not exists position    text;
alter table public.staff_applications add column if not exists nationality text;
alter table public.staff_applications add column if not exists notes       text;
alter table public.staff_applications add column if not exists documents   jsonb not null default '[]'::jsonb;
alter table public.staff_applications add column if not exists created_at  timestamptz not null default now();

-- Clients / projects / jobs kept for the operations page.
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients(id) on delete set null,
  name       text not null,
  budget     numeric(14,2),
  created_at timestamptz not null default now()
);

create table if not exists public.job_assignments (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  client_id      uuid references public.clients(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  location_name  text,
  position       text,
  required_count integer not null default 1,
  work_date      date not null,
  start_time     time not null,
  end_time       time not null,
  break_minutes  integer not null default 0,
  budget         numeric(14,2),
  instructions   text,
  status         text not null default 'draft',
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

alter table public.job_assignments add column if not exists project_id     uuid references public.projects(id) on delete set null;
alter table public.job_assignments add column if not exists location_name   text;
alter table public.job_assignments add column if not exists position        text;
alter table public.job_assignments add column if not exists required_count  integer not null default 1;
alter table public.job_assignments add column if not exists break_minutes   integer not null default 0;
alter table public.job_assignments add column if not exists budget          numeric(14,2);
alter table public.job_assignments add column if not exists instructions    text;
alter table public.job_assignments add column if not exists status          text not null default 'draft';
alter table public.job_assignments add column if not exists created_by      uuid references public.profiles(id);
alter table public.job_assignments add column if not exists created_at      timestamptz not null default now();

create table if not exists public.assignment_staff (
  assignment_id uuid not null references public.job_assignments(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (assignment_id, staff_id)
);

-- Invoices / expenses (admin finance tab).
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text,
  vendor         text,
  client_id      uuid references public.clients(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  issue_date     date,
  due_date       date,
  currency       text not null default 'QAR',
  subtotal       numeric(14,2),
  tax_amount     numeric(14,2) not null default 0,
  total          numeric(14,2),
  category       text,
  notes          text,
  file_path      text,
  status         text not null default 'pending',
  created_by     uuid references public.profiles(id),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.invoices add column if not exists invoice_number text;
alter table public.invoices add column if not exists vendor         text;
alter table public.invoices add column if not exists client_id      uuid references public.clients(id) on delete set null;
alter table public.invoices add column if not exists project_id     uuid references public.projects(id) on delete set null;
alter table public.invoices add column if not exists issue_date     date;
alter table public.invoices add column if not exists due_date       date;
alter table public.invoices add column if not exists currency       text not null default 'QAR';
alter table public.invoices add column if not exists subtotal       numeric(14,2);
alter table public.invoices add column if not exists tax_amount     numeric(14,2) not null default 0;
alter table public.invoices add column if not exists total          numeric(14,2);
alter table public.invoices add column if not exists category       text;
alter table public.invoices add column if not exists notes          text;
alter table public.invoices add column if not exists file_path      text;
alter table public.invoices add column if not exists status         text not null default 'pending';
alter table public.invoices add column if not exists created_by     uuid references public.profiles(id);
alter table public.invoices add column if not exists deleted_at     timestamptz;
alter table public.invoices add column if not exists created_at     timestamptz not null default now();
alter table public.invoices add column if not exists updated_at     timestamptz not null default now();

create index if not exists invoices_deleted_idx on public.invoices (deleted_at);
create index if not exists invoices_issue_idx   on public.invoices (issue_date);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date,
  vendor       text,
  description  text,
  category     text not null default 'other',
  amount       numeric(14,2),
  currency     text not null default 'QAR',
  project_id   uuid references public.projects(id) on delete set null,
  file_path    text,
  status       text not null default 'pending',
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.expenses add column if not exists expense_date date;
alter table public.expenses add column if not exists vendor       text;
alter table public.expenses add column if not exists description  text;
alter table public.expenses add column if not exists category     text not null default 'other';
alter table public.expenses add column if not exists amount       numeric(14,2);
alter table public.expenses add column if not exists currency     text not null default 'QAR';
alter table public.expenses add column if not exists project_id   uuid references public.projects(id) on delete set null;
alter table public.expenses add column if not exists file_path    text;
alter table public.expenses add column if not exists status       text not null default 'pending';
alter table public.expenses add column if not exists created_by   uuid references public.profiles(id);
alter table public.expenses add column if not exists deleted_at   timestamptz;
alter table public.expenses add column if not exists created_at   timestamptz not null default now();
alter table public.expenses add column if not exists updated_at   timestamptz not null default now();

create index if not exists expenses_deleted_idx on public.expenses (deleted_at);
create index if not exists expenses_date_idx    on public.expenses (expense_date);

-- AI reports generated for the owner (numbers computed server-side).
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  period_start date,
  period_end   date,
  metrics      jsonb not null default '{}'::jsonb,
  content      text not null,
  model        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.reports add column if not exists period_start date;
alter table public.reports add column if not exists period_end   date;
alter table public.reports add column if not exists metrics      jsonb not null default '{}'::jsonb;
alter table public.reports add column if not exists model        text;
alter table public.reports add column if not exists created_by   uuid references public.profiles(id);
alter table public.reports add column if not exists created_at   timestamptz not null default now();

-- Audit trail (written by triggers with SECURITY DEFINER, read by owner).
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  table_name  text,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- Leads (public website form).
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  company      text,
  contact_name text,
  phone        text,
  email        text,
  service      text,
  message      text,
  status       text not null default 'new',
  created_at   timestamptz not null default now()
);

alter table public.leads add column if not exists company      text;
alter table public.leads add column if not exists contact_name text;
alter table public.leads add column if not exists phone        text;
alter table public.leads add column if not exists email        text;
alter table public.leads add column if not exists service      text;
alter table public.leads add column if not exists message      text;
alter table public.leads add column if not exists status       text not null default 'new';
alter table public.leads add column if not exists created_at   timestamptz not null default now();

-- Migrate legacy status value and backfill email from auth.
update public.profiles set status = 'approved' where status = 'active';
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

-- ---------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin','owner') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public."current_role"() to anon, authenticated;
grant execute on function public.is_admin()      to anon, authenticated;
grant execute on function public.is_owner()      to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.staff_documents   enable row level security;
alter table public.staff_applications enable row level security;
alter table public.clients           enable row level security;
alter table public.projects          enable row level security;
alter table public.job_assignments   enable row level security;
alter table public.assignment_staff  enable row level security;
alter table public.invoices          enable row level security;
alter table public.expenses          enable row level security;
alter table public.reports           enable row level security;
alter table public.audit_log         enable row level security;
alter table public.leads             enable row level security;

-- Remove any pre-existing policies on the managed tables so the rules below
-- are the single source of truth (safe because the script runs as one batch).
do $$
declare r record;
begin
  for r in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'profiles','staff_documents','staff_applications','clients','projects',
         'job_assignments','assignment_staff','invoices','expenses','reports',
         'audit_log','leads'
       )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- staff_documents
drop policy if exists staff_documents_select on public.staff_documents;
create policy staff_documents_select on public.staff_documents
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists staff_documents_insert_self on public.staff_documents;
create policy staff_documents_insert_self on public.staff_documents
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists staff_documents_update_self on public.staff_documents;
create policy staff_documents_update_self on public.staff_documents
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists staff_documents_update_admin on public.staff_documents;
create policy staff_documents_update_admin on public.staff_documents
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists staff_documents_delete on public.staff_documents;
create policy staff_documents_delete on public.staff_documents
  for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- staff_applications (legacy)
drop policy if exists staff_applications_select on public.staff_applications;
create policy staff_applications_select on public.staff_applications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists staff_applications_insert on public.staff_applications;
create policy staff_applications_insert on public.staff_applications
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists staff_applications_update_admin on public.staff_applications;
create policy staff_applications_update_admin on public.staff_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- clients / projects / job_assignments / assignment_staff (admin & owner)
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists job_assignments_admin_all on public.job_assignments;
create policy job_assignments_admin_all on public.job_assignments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assignment_staff_admin_all on public.assignment_staff;
create policy assignment_staff_admin_all on public.assignment_staff
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assignment_staff_staff_read on public.assignment_staff;
create policy assignment_staff_staff_read on public.assignment_staff
  for select to authenticated
  using (staff_id = auth.uid());

drop policy if exists job_assignments_staff_read on public.job_assignments;
create policy job_assignments_staff_read on public.job_assignments
  for select to authenticated
  using (exists (
    select 1 from public.assignment_staff a
    where a.assignment_id = job_assignments.id and a.staff_id = auth.uid()
  ));

-- invoices / expenses (admin & owner only)
drop policy if exists invoices_admin_all on public.invoices;
create policy invoices_admin_all on public.invoices
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_admin_all on public.expenses;
create policy expenses_admin_all on public.expenses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- reports (owner only; server writes with the service role)
drop policy if exists reports_owner_select on public.reports;
create policy reports_owner_select on public.reports
  for select to authenticated
  using (public.is_owner());

drop policy if exists reports_owner_delete on public.reports;
create policy reports_owner_delete on public.reports
  for delete to authenticated
  using (public.is_owner());

-- audit_log (owner reads only)
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select to authenticated
  using (public.is_owner());

-- leads (public insert, admin read/update)
drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads
  for insert to anon, authenticated
  with check (true);

drop policy if exists leads_admin_select on public.leads;
create policy leads_admin_select on public.leads
  for select to authenticated
  using (public.is_admin());

drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists leads_admin_delete on public.leads;
create policy leads_admin_delete on public.leads
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Grants (RLS still gates every row)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.staff_documents,
  public.staff_applications,
  public.clients,
  public.projects,
  public.job_assignments,
  public.assignment_staff,
  public.invoices,
  public.expenses,
  public.reports,
  public.audit_log,
  public.leads
to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;
grant insert on public.leads to anon;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- Create a staff profile on signup. Role is never taken from user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    'staff',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists staff_documents_set_updated_at on public.staff_documents;
create trigger staff_documents_set_updated_at
  before update on public.staff_documents
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Staff cannot change their own role/status/rejection reason.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.email := old.email;
  if public.is_owner() then
    return new;
  end if;
  if public.is_admin() then
    new.role := old.role;
    return new;
  end if;
  new.role             := old.role;
  new.status           := old.status;
  new.rejection_reason := old.rejection_reason;
  return new;
end $$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Staff cannot self-approve documents.
create or replace function public.protect_document_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.status      := old.status;
  new.review_note := old.review_note;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  return new;
end $$;

drop trigger if exists staff_documents_protect_review on public.staff_documents;
create trigger staff_documents_protect_review
  before update on public.staff_documents
  for each row execute function public.protect_document_review();

-- Audit logging.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_action text;
  v_record text;
begin
  if v_actor is not null then
    select email into v_email from auth.users where id = v_actor;
  end if;
  v_action := lower(tg_op);
  if tg_op = 'DELETE' then
    v_record := coalesce(old.id::text, '');
  else
    v_record := coalesce(new.id::text, '');
  end if;
  insert into public.audit_log (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (
    v_actor,
    v_email,
    v_action,
    tg_table_name,
    v_record,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row();

drop trigger if exists staff_documents_audit on public.staff_documents;
create trigger staff_documents_audit
  after insert or update or delete on public.staff_documents
  for each row execute function public.audit_row();

drop trigger if exists invoices_audit on public.invoices;
create trigger invoices_audit
  after insert or update or delete on public.invoices
  for each row execute function public.audit_row();

drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function public.audit_row();

drop trigger if exists reports_audit on public.reports;
create trigger reports_audit
  after insert or update or delete on public.reports
  for each row execute function public.audit_row();

-- Optional RPC: record that an admin opened a document.
create or replace function public.log_document_view(p_document uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorised';
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'view', 'staff_documents', p_document::text);
end $$;

grant execute on function public.log_document_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage buckets (private) + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_select on storage.objects;
create policy documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists documents_update on storage.objects;
create policy documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  )
  with check (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists receipts_admin_all on storage.objects;
create policy receipts_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Manual bootstrap (run once, edit the email)
-- ---------------------------------------------------------------------------
-- 1) Register the owner account through the app, then run:
--
--    update public.profiles
--       set role = 'owner', status = 'approved'
--     where id = (select id from auth.users where email = 'owner@example.com');
--
-- 2) Promote an admin:
--
--    update public.profiles
--       set role = 'admin', status = 'approved'
--     where id = (select id from auth.users where email = 'admin@example.com');
--
-- Roles are deliberately not selectable at registration; only these SQL
-- statements (or the owner's user-management screen) can change them.
-- ============================================================================
