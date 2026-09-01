-- Merchants starter schema.
-- Apply from the Supabase SQL editor or: supabase db push

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.merchants enable row level security;

create policy "Owners can read their merchants"
  on public.merchants
  for select
  using (auth.uid() = owner_id);

create policy "Owners can insert their merchants"
  on public.merchants
  for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their merchants"
  on public.merchants
  for update
  using (auth.uid() = owner_id);

create policy "Owners can delete their merchants"
  on public.merchants
  for delete
  using (auth.uid() = owner_id);
