# Daily Automatic Import Setup

Merchant Radar runs a daily import of Texas sales-tax permit holders using
Supabase Cron (pg_cron) → pg_net → `import-texas-leads` Edge Function.

---

## Prerequisites

1. Edge Function `import-texas-leads` is deployed.
2. `supabase/config.toml` contains `verify_jwt = false` for the function
   (already committed — ensures cron requests without a JWT can reach the
   function's own auth layer).
3. Supabase project is on **Pro or Team plan** (required for pg_cron + Vault).

---

## IMPORTANT — one secret, two destinations

You will generate **one** cron secret and store it in **exactly two places**.
The value must be identical in both; generating a separate value for either
place will cause every scheduled import to fail with 401 Unauthorized.

```
┌──────────────────────────────────────────────────────────────────┐
│  ONE secret, same value:                                         │
│                                                                  │
│  1. Edge Function environment  (supabase secrets set …)          │
│  2. Supabase Vault             (vault.create_secret …)           │
└──────────────────────────────────────────────────────────────────┘
```

### Step A — Generate the secret (do this once)

```bash
openssl rand -hex 32
```

Copy the output. You will paste it in Step B and Step 2 below.

### Step B — Store it as an Edge Function secret

```bash
supabase secrets set MERCHANT_RADAR_CRON_SECRET=<PASTE-YOUR-SECRET-HERE>
```

---

## Step 1 — Enable extensions

In the Supabase **SQL Editor**:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

---

## Step 2 — Store the same secret in Vault

Replace both `<PLACEHOLDER>` values with your real values before running.
**Use the exact same secret value you set in Step B above.**

```sql
-- Your Supabase project URL
select vault.create_secret(
  'https://<YOUR-PROJECT-REF>.supabase.co',
  'merchant_radar_project_url'
);

-- The cron secret — must be identical to the Edge Function secret above
select vault.create_secret(
  '<PASTE-YOUR-SECRET-HERE>',
  'merchant_radar_cron_secret'
);
```

Verify both are saved:

```sql
select name, created_at from vault.secrets where name like 'merchant_radar%';
```

---

## Step 3 — Schedule the daily job

The cron expression `0 12 * * *` runs at **12:00 UTC** every day.

| UTC Hour | CST (UTC−6) | CDT (UTC−5) |
|----------|-------------|-------------|
| 12:00 UTC | **06:00 AM CST** | **07:00 AM CDT** |

**Daylight saving note**: Texas observes CDT (UTC−5) roughly March–November
and CST (UTC−6) November–March. Supabase Cron runs on UTC and has no concept
of daylight saving time. At 12:00 UTC the Dallas clock will show either 6 AM
or 7 AM depending on the season — both are acceptable for a morning import
run. If you need a fixed local time you must update the cron expression when
the clocks change.

```sql
select cron.schedule(
  'merchant-radar-daily-import',
  '0 12 * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'merchant_radar_project_url'
      ) || '/functions/v1/import-texas-leads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'merchant_radar_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
```

---

## Step 4 — Verify the job was created

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'merchant-radar-daily-import';
```

---

## Step 5 — Monitor runs

Check **Supabase Dashboard → Edge Functions → Logs** after 12:00 UTC.

Or query import runs directly:

```sql
select status, fetched_count, inserted_count, started_at, error_message
from import_runs
order by started_at desc
limit 10;
```

---

## Updating the schedule

```sql
-- Remove old job first
select cron.unschedule('merchant-radar-daily-import');

-- Re-create with a new expression
select cron.schedule('merchant-radar-daily-import', '0 13 * * *', $$ ... $$);
```

---

## Rotating the cron secret

**Both destinations must be updated to the same new value.**

1. Generate a new secret: `openssl rand -hex 32`
2. Update Edge Function secret:
   `supabase secrets set MERCHANT_RADAR_CRON_SECRET=<new-value>`
3. Update Vault:
   `select vault.update_secret('<new-value>', 'merchant_radar_cron_secret');`
4. No cron job restart needed — Vault is read on each invocation.

---

## How the Edge Function validates requests

The function rejects every request that does not carry **exactly one** of:

| Header | Valid value | Result |
|--------|-------------|--------|
| `x-cron-secret` | Matches `MERCHANT_RADAR_CRON_SECRET` env var | Scheduled import runs for all active territories |
| `Authorization: Bearer <token>` | Valid Supabase user JWT (verified via `auth.getUser`) | Manual import runs for that user's territories |
| Neither / invalid | — | **401 Unauthorized** |

Because `verify_jwt = false` in `supabase/config.toml`, the Supabase gateway
does not pre-validate JWTs. The function performs its own validation, which
allows both auth paths to work correctly.
