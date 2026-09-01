# Merchants — Next.js + Supabase + Netlify

Production-ready Next.js starter pre-wired for **Supabase** (auth, database) and **Netlify** (continuous deployment).

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (auth · postgres · storage) |
| Deployment | Netlify + `@netlify/plugin-nextjs` |

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials from [Supabase](https://app.supabase.com) → Project → **Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Database

Run `supabase/migrations/001_init.sql` in the Supabase SQL editor (or `supabase db push` if the CLI is linked).

In **Authentication → URL Configuration**, add:

- `http://localhost:3000/auth/callback`
- `https://your-netlify-site.netlify.app/auth/callback`

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── dashboard/page.tsx
│   └── auth/
│       ├── callback/route.ts
│       └── signout/route.ts
├── lib/
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── service.ts
└── proxy.ts
```

---

## Deploying to Netlify

1. Push this repo to GitHub.
2. In [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
3. Select **jordannassie/MERCHANTS**.
4. Netlify reads `netlify.toml` for the build command and publish directory.
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (your Netlify URL)
6. Deploy.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Admin key — server-side only |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical site URL for auth redirects |
