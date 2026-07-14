"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Command } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(safeNext());
      router.refresh();
    }
  };

  // Honor a ?next= redirect (used by the invite flow). Only allow internal paths.
  const safeNext = () => {
    if (typeof window === "undefined") return "/dashboard";
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  };

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-jubo-navy flex items-center justify-center">
          <Command className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">Jubo</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h1 className="text-base font-semibold text-foreground mb-1">Sign in</h1>
        <p className="text-xs text-muted-foreground mb-5">
          Enter your credentials to continue
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-3 text-center text-xs">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
            Forgot password?
          </Link>
        </p>

        <p className="text-xs text-center text-muted-foreground mt-4">
          No account?{" "}
          <Link href="/signup" className="text-jubo-navy hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
