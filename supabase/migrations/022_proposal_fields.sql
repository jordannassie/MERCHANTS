-- Migration 022: Personalized proposal fields on leads
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING

alter table if exists public.leads
  add column if not exists proposal_slug              text unique,
  add column if not exists proposal_savings_monthly   numeric,
  add column if not exists proposal_transaction_rate  text,
  add column if not exists proposal_equipment         text,
  add column if not exists proposal_contract          text,
  add column if not exists proposal_status            text not null default 'not_sent'
    check (proposal_status in ('not_sent', 'sent', 'viewed', 'accepted')),
  add column if not exists proposal_sent_at           timestamptz,
  add column if not exists proposal_viewed_at         timestamptz,
  add column if not exists proposal_accepted_at       timestamptz;

create index if not exists idx_leads_proposal_slug
  on public.leads(proposal_slug)
  where proposal_slug is not null;

-- Best-effort backfill: generate slugs from existing business names.
-- Conflicts (duplicate slugs) are silently skipped — the app handles these lazily.
update public.leads
set proposal_slug = left(
  lower(
    regexp_replace(
      regexp_replace(
        coalesce(display_name, outlet_name, taxpayer_name, id::text),
        '[^a-zA-Z0-9 ]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  ),
  60
)
where proposal_slug is null
  and coalesce(display_name, outlet_name, taxpayer_name) is not null
on conflict (proposal_slug) do nothing;
