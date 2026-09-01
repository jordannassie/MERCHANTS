import AuthForm from "@/components/AuthForm";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="login" configured={isSupabaseConfigured()} />
    </main>
  );
}
