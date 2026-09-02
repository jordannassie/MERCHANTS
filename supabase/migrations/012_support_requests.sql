-- Support requests submitted via the public landing page contact form.
-- No RLS needed — inserted via service role from the API route.

create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  phone      text,
  email      text not null,
  comments   text not null,
  status     text not null default 'new',   -- new | in_progress | resolved
  created_at timestamptz not null default now()
);
