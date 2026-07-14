"use client";

// Request a password-reset email via Supabase Auth's standard flow. The email
// link returns the user to /reset-password to set a new password. We always show
// the same generic confirmation (no account-enumeration signal).

import { useState } from "react";
import Link from "next/link";
import { Command } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    // Ignore the result deliberately — never reveal whether the email exists.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jubo-navy">
          <Command className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">Jubo</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {sent ? (
          <div className="text-center">
            <h1 className="mb-1 text-base font-semibold text-foreground">Check your email</h1>
            <p className="mb-5 text-xs text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>, we&apos;ve
              sent a link to reset your password. The link expires shortly for your security.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-1"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-base font-semibold text-foreground">Reset your password</h1>
            <p className="mb-5 text-xs text-muted-foreground">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="text-jubo-navy hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
