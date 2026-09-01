import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const configured = isSupabaseConfigured();
  const user = configured
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
        Dashboard
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {user ? `Welcome, ${user.email}` : "Welcome"}
      </h1>
      <p className="mt-3 text-text-secondary">
        This route is protected by the Supabase session proxy. Add your
        merchant product here.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
        >
          Home
        </Link>
        {user && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg bg-text-primary px-4 py-2.5 text-sm font-medium text-white"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
