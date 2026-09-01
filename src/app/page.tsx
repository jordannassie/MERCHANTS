import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  const configured = isSupabaseConfigured();
  const user = configured
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  const checks = [
    {
      label: "Next.js",
      detail: "App Router, TypeScript, Tailwind CSS v4",
      ready: true,
    },
    {
      label: "Supabase",
      detail: configured
        ? "Project keys loaded from the environment"
        : "Copy .env.example to .env.local and add your project keys",
      ready: configured,
    },
    {
      label: "Netlify",
      detail: "netlify.toml and @netlify/plugin-nextjs are ready",
      ready: true,
    },
    {
      label: "Auth session",
      detail: user ? `Signed in as ${user.email}` : "Not signed in",
      ready: Boolean(user),
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
        Merchants
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Next.js is wired for Supabase and Netlify.
      </h1>
      <p className="mt-4 max-w-2xl text-text-secondary">
        Local development, auth, and production deploys are set up. Add your
        Supabase keys, push to GitHub, and import the repo in Netlify.
      </p>

      <ul className="mt-10 space-y-3">
        {checks.map((check) => (
          <li
            key={check.label}
            className="flex items-start justify-between gap-4 rounded-xl border border-border bg-bg-surface px-4 py-4"
          >
            <div>
              <p className="font-medium">{check.label}</p>
              <p className="mt-1 text-sm text-text-secondary">{check.detail}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                check.ready
                  ? "bg-positive-bg text-positive"
                  : "bg-warning-bg text-warning"
              }`}
            >
              {check.ready ? "Ready" : "Needs setup"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-text-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg bg-text-primary px-4 py-2.5 text-sm font-medium text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
            >
              Create account
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
