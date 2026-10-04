-- Reconcile the live audit_reports table with the versioned report storage contract.
-- The pre-contract table contained no rows in the Audit Engine project when this
-- migration was applied, so it is safe to replace the obsolete shape.
drop table if exists public.audit_reports cascade;

create table public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  audit_job_id uuid not null references public.audit_jobs(id) on delete cascade,
  tier text not null check (tier in ('sample','full')),
  version integer not null default 1,
  access_status text not null check (access_status in ('available','locked','unlocked')),
  storage_path text not null,
  sha256 text not null,
  content_type text not null default 'application/pdf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_job_id, tier, version)
);

create index audit_reports_job_idx
  on public.audit_reports(audit_job_id, tier, version desc);

alter table public.audit_reports enable row level security;

create policy audit_reports_service_only
  on public.audit_reports
  for all
  using (false)
  with check (false);

insert into storage.buckets (id, name, public)
values ('audit-reports', 'audit-reports', false)
on conflict (id) do update set public = false;
