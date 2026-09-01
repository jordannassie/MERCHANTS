# Merchant Radar

Internal CRM for importing Texas sales-tax permit leads, scoring them by merchant-services fit, and managing a calling pipeline.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (Auth, Postgres, Edge Functions) |
| Validation | Zod |
| Deployment | Netlify + `@netlify/plugin-nextjs` |
| AI Enrichment | Claude (Phase 4, optional) |

---

## Quick Start

### 1. Create a Supabase project

Go to [app.supabase.com](https://app.supabase.com), create a project, and note your:
- Project URL: `https://<ref>.supabase.co`
- Anon key (public)
- Service role key (secret — server only)

### 2. Run migrations

In the Supabase SQL Editor, run these files **in order**:

```
supabase/migrations/002_merchant_radar.sql
supabase/migrations/003_enrichment.sql
```

The file `004_cron_template.sql` is a commented template — see `docs/DAILY_IMPORT_SETUP.md`.

### 3. Create your first user

In Supabase Dashboard → **Authentication → Users → Add user**.

There is no public signup page. This is intentional.

### 4. Add Auth redirect URLs

In Supabase Dashboard → **Authentication → URL Configuration**, add:

```
http://localhost:3000/auth/callback
https://your-netlify-domain.netlify.app/auth/callback
```

### 5. Set environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 6. Install and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.

On first login, the app automatically creates your profile and default DFW territory.

---

## Deploy Edge Functions

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Link project
supabase link --project-ref <your-ref>

# Deploy functions
supabase functions deploy import-texas-leads
supabase functions deploy enrich-leads

# Set Edge Function secrets
supabase secrets set MERCHANT_RADAR_CRON_SECRET=<strong-random-secret>
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-key>  # optional, for Phase 4
```

### Verify manual import works

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/import-texas-leads \
  -H "Authorization: Bearer <your-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"territoryId": "<your-territory-id>"}'
```

---

## Deploy to Netlify

### Using Netlify UI (recommended)

1. Push this repo to GitHub.
2. In [app.netlify.com](https://app.netlify.com) → **Add new site → Import existing project**.
3. Select the `MERCHANTS` repository.
4. Netlify reads `netlify.toml` — no extra build config needed.
5. Add environment variables in **Site configuration → Environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (your Netlify production URL)
6. Deploy.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin key — **server-side only** |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical URL for auth redirects |

Edge Function secrets (set via `supabase secrets set`):

| Secret | Required | Description |
|---|---|---|
| `MERCHANT_RADAR_CRON_SECRET` | For cron | Strong random string, min 32 chars |
| `ANTHROPIC_API_KEY` | Phase 4 only | Claude enrichment API key |

---

## Application Routes

| Route | Description |
|---|---|
| `/login` | Email/password login (no public signup) |
| `/dashboard` | Stats, hot leads, today's follow-ups, import button |
| `/leads` | Filterable, paginated lead table with CSV export |
| `/leads/[id]` | Full lead detail: calling workflow, contacts, timeline |
| `/pipeline` | Kanban by status |
| `/follow-ups` | Overdue / today / upcoming sections |
| `/settings` | Territory config, manual import, import history |

---

## Texas Data Source

- **Dataset**: Active Sales Tax Permit Holders
- **Dataset ID**: `jrea-zgmq`
- **Endpoint**: `https://data.texas.gov/resource/jrea-zgmq.json`
- **Filtered by**: `outlet_permit_issue_date` (enforced in the Edge Function)
- **Counties**: 11 default DFW counties + Hood/Somervell optional

---

## Daily Scheduled Import

See [`docs/DAILY_IMPORT_SETUP.md`](docs/DAILY_IMPORT_SETUP.md) for full instructions.

---

## Scripts

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # TypeScript check
npm test           # unit tests (vitest)
npm run lint       # ESLint
```
