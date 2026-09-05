-- Migration 019: QUO SMS Integration
-- Creates sms_messages, sms_suppression tables and adds SMS columns to leads.
-- Idempotent: safe to re-run. Never drops or truncates existing data.

-- ── sms_messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  quo_message_id  TEXT        UNIQUE,
  direction       TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  to_number       TEXT        NOT NULL,
  from_number     TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted', 'delivered', 'failed', 'received')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id
  ON public.sms_messages(lead_id);

CREATE INDEX IF NOT EXISTS idx_sms_messages_quo_id
  ON public.sms_messages(quo_message_id)
  WHERE quo_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at
  ON public.sms_messages(sent_at DESC);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sms_messages'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.sms_messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── sms_suppression ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_suppression (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone TEXT        NOT NULL UNIQUE,
  lead_id          UUID        REFERENCES public.leads(id),
  opt_out_reason   TEXT        NOT NULL DEFAULT 'STOP',
  opted_out_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_suppression ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sms_suppression'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.sms_suppression
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── New columns on leads ──────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quo_contact_id   TEXT,
  ADD COLUMN IF NOT EXISTS sms_status       TEXT
    CHECK (sms_status IN ('submitted', 'delivered', 'failed', 'needs_reply', 'opted_out')),
  ADD COLUMN IF NOT EXISTS sms_last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_needs_reply  BOOLEAN DEFAULT FALSE;
