-- Add industry column to contacts and support_requests
alter table if exists public.contacts
  add column if not exists industry text;

alter table if exists public.support_requests
  add column if not exists industry text;

create index if not exists idx_contacts_industry on public.contacts(industry);
create index if not exists idx_support_requests_industry on public.support_requests(industry);

