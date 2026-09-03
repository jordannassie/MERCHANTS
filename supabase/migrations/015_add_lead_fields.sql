-- Add lead-specific fields for gtp landing page
alter table if exists public.leads
  add column if not exists industry text;

alter table if exists public.leads
  add column if not exists payment_need text;

alter table if exists public.leads
  add column if not exists opening_timeline text;

alter table if exists public.leads
  add column if not exists sms_consent boolean not null default false;

alter table if exists public.leads
  add column if not exists sms_consent_timestamp timestamptz;

alter table if exists public.leads
  add column if not exists sms_consent_text_version text;

alter table if exists public.leads
  add column if not exists page_path text;

alter table if exists public.leads
  add column if not exists utm_source text;
alter table if exists public.leads
  add column if not exists utm_medium text;
alter table if exists public.leads
  add column if not exists utm_campaign text;
alter table if exists public.leads
  add column if not exists utm_content text;
alter table if exists public.leads
  add column if not exists utm_term text;

create index if not exists idx_leads_phone_recent on public.leads (primary_phone);
create index if not exists idx_leads_page_path on public.leads (page_path);

