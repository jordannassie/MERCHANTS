-- ── Migration 009: SIFT automatic import log ─────────────────────────────────
--
-- Tracks every SIFT auto-import run so the same weekly file is never
-- reprocessed. The cron function and the manual "Import Latest" button both
-- write here.
--
-- Idempotent: all statements use IF NOT EXISTS.

create table if not exists public.sift_import_log (
  id               uuid        primary key default gen_random_uuid(),
  -- Original filename from the SIFT file list (e.g. stp09-01ph.zip)
  filename         text        not null,
  -- Full SIFT file-path key used in the get-link request
  file_path        text,
  status           text        not null default 'completed',
  records_parsed   integer     not null default 0,
  leads_matched    integer     not null default 0,
  phones_added     integer     not null default 0,
  phones_skipped   integer     not null default 0,
  error_message    text,
  imported_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Unique filename so upsert / skip-if-exists works cleanly
create unique index if not exists sift_import_log_filename
  on public.sift_import_log(filename);

-- Newest-first lookup
create index if not exists sift_import_log_imported_at
  on public.sift_import_log(imported_at desc);

-- RLS: server-side only (service-role client bypasses RLS; anon cannot read)
alter table public.sift_import_log enable row level security;
