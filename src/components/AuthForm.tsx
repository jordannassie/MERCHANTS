"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AuthFormProps {
  mode: "login" | "signup";
  configured: boolean;
}

export default function AuthForm({ mode, configured }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setError(null);
    setMessage(null);
    setLoading("email");

    const supabase = createClient();
    const { error: authError } = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(null);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (isSignup) {
      setMessage("Check your email to confirm your account.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogle() {
    if (!configured) return;
    setError(null);
    setLoading("google");

    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard";
    const siteBase =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteBase}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-bg-surface p-8 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
        Merchants
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {isSignup ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {configured
          ? "Use email and password or continue with Google."
          : "Add your Supabase keys to .env.local to enable auth."}
      </p>

      {!configured && (
        <p className="mt-4 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
          Supabase is not configured yet.
        </p>
      )}

      <form onSubmit={handleEmail} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-text-secondary">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!configured || loading !== null}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 outline-none focus:border-text-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!configured || loading !== null}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 outline-none focus:border-text-primary"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-positive">{message}</p>}
        <button
          type="submit"
          disabled={!configured || loading !== null}
          className="w-full rounded-lg bg-text-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading === "email"
            ? "Working..."
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={!configured || loading !== null}
        className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {loading === "google" ? "Redirecting..." : "Continue with Google"}
      </button>

      <p className="mt-6 text-center text-sm text-text-secondary">
        {isSignup ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-medium text-text-primary underline"
        >
          {isSignup ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
