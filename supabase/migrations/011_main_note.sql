-- Migration 011: persistent main-note field per lead
-- Run in Supabase SQL editor: Dashboard → SQL Editor → New query → paste → Run
--
-- Idempotent: safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- No destructive changes. Existing activity notes are untouched.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS main_note            TEXT,
  ADD COLUMN IF NOT EXISTS main_note_updated_at TIMESTAMPTZ;

-- Index so "has a note" queries are fast
CREATE INDEX IF NOT EXISTS leads_main_note_notnull
  ON public.leads (id)
  WHERE main_note IS NOT NULL;
