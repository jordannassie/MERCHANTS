# Daily Automatic Import Setup

Merchant Radar runs a daily import of Texas sales-tax permit holders using
Supabase Cron (pg_cron) → pg_net → `import-texas-leads` Edge Function.

---

## Prerequisites

1. Edge Function `import-texas-leads` is deployed.
2. You have a strong cron secret (generate one below).
3. Supabase project is on Pro or Team plan (required for pg_cron + Vault).

### Generate a cron secret

```bash
openssl rand -hex 32
```

### Set the secret on the Edge Function

```bash
supabase secrets set MERCHANT_RADAR_CRON_SECRET=<your-secret>
```

---

## Step 1 — Enable extensions

In the Supabase SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

---

## Step 2 — Store secrets in Vault

Replace `<PLACEHOLDER>` with your real values before running.

```sql
-- Your Supabase project URL
select vault.create_secret(
  'https://<YOUR-PROJECT-REF>.supabase.co',
  'merchant_radar_project_url'
);

-- The same cron secret you set above
select vault.create_secret(
  '<YOUR-CRON-SECRET>',
  'merchant_radar_cron_secret'
);
```

Verify:

```sql
select name, created_at from vault.secrets where name like 'merchant_radar%';
```

---

## Step 3 — Schedule the daily job

The cron expression `0 6 * * *` runs at **06:00 UTC** every day.

| UTC Hour | CST (UTC-6) | CDT (UTC-5) |
|---|---|---|
| 06:00 UTC | 00:00 CST | 01:00 CDT |

**Daylight saving note**: Texas observes CDT (UTC-5) from March to November and
CST (UTC-6) November to March. If you want "1 AM Dallas time year-round" you
would need to update the cron expression when the clocks change. UTC-6 is the
safer default since the import is not time-sensitive.

```sql
select cron.schedule(
  'merchant-radar-daily-import',
  '0 6 * * *',
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

## Step 4 — Verify the job

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'merchant-radar-daily-import';
```

---

## Step 5 — Monitor runs

Check the Supabase Dashboard → **Edge Functions → Logs** after 06:00 UTC.

Or query import_runs directly:

```sql
select status, fetched_count, inserted_count, started_at, error_message
from import_runs
order by started_at desc
limit 10;
```

---

## Updating the schedule

```sql
-- Remove old job
select cron.unschedule('merchant-radar-daily-import');

-- Re-create with new schedule
select cron.schedule('merchant-radar-daily-import', '0 7 * * *', $$ ... $$);
```

---

## Rotating the cron secret

1. Generate a new secret: `openssl rand -hex 32`
2. Update Edge Function: `supabase secrets set MERCHANT_RADAR_CRON_SECRET=<new>`
3. Update Vault: `select vault.update_secret('<new>', 'merchant_radar_cron_secret');`
4. No cron job restart needed — the Vault value is read on each invocation.
