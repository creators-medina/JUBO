"use client";

// Set a new password after arriving from the reset email. Supabase establishes
// a short-lived recovery session from the link (PKCE `code` or a recovery hash);
// we confirm a session exists, then call updateUser({ password }). No custom
// password storage, no token exposure, no auto-login beyond Supabase's own
// recovery session.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Command } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Phase = "verifying" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Establish the recovery session from the link, then confirm we can proceed.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    (async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) { if (active) setPhase("invalid"); return; }
        }
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setPhase(data.session ? "ready" : "invalid");
      } catch {
        if (active) setPhase("invalid");
      }
    })();

    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setPhase("done");
    setLoading(false);
    setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 1200);
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
        {phase === "verifying" && (
          <p className="py-6 text-center text-sm text-muted-foreground">Verifying your reset link…</p>
        )}

        {phase === "invalid" && (
          <div className="text-center">
            <h1 className="mb-1 text-base font-semibold text-foreground">This link isn&apos;t valid</h1>
            <p className="mb-5 text-xs text-muted-foreground">
              It may have expired or already been used. Request a fresh reset link to continue.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-1"
            >
              Request a new link
            </Link>
          </div>
        )}

        {phase === "done" && (
          <p className="py-6 text-center text-sm text-foreground">Password updated — taking you to your dashboard…</p>
        )}

        {phase === "ready" && (
          <>
            <h1 className="mb-1 text-base font-semibold text-foreground">Set a new password</h1>
            <p className="mb-5 text-xs text-muted-foreground">Choose a strong password you don&apos;t use elsewhere.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="confirm">Confirm password</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
                  placeholder="Re-enter your password"
                  required
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
