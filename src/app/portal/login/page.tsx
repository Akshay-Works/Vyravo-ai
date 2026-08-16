"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Invalid credentials"); setLoading(false); return; }
      router.push("/portal/dashboard");
      router.refresh();
    } catch { setError("Login failed. Please try again."); setLoading(false); }
  };

  const ic = "w-full px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50";

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 mesh-gradient" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl glass border border-border p-8 shadow-2xl shadow-black/30">
          <div className="flex justify-center mb-8"><Logo /></div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Client Portal</h1>
            <p className="mt-2 text-sm text-grey">Sign in to manage your projects, proposals, and files.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-grey mb-2">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" className={ic} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-grey mb-2">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" className={ic} />
            </div>
            {error && <div className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60 cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <p className="mt-4 text-center"><Link href="/portal/register" className="text-sm text-primary hover:underline">Create an account →</Link></p>
          <p className="mt-6 text-center"><Link href="/" className="text-sm text-grey hover:text-white transition-colors">← Back to Vyravo AI</Link></p>
        </div>
      </div>
    </main>
  );
}
