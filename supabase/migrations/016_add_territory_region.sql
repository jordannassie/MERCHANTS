-- Add region column to territories for default working area selection
alter table if exists public.territories
  add column if not exists region text not null default 'DFW';

-- backfill existing rows if any (already defaulted)
update public.territories set region = coalesce(region, 'DFW') where region is null;

