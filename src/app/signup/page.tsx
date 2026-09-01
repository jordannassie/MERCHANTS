import AuthForm from "@/components/AuthForm";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="signup" configured={isSupabaseConfigured()} />
    </main>
  );
}
