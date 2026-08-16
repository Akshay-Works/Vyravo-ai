"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function PortalRegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); setLoading(false); return; }
    try {
      const res = await fetch("/api/portal/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); setLoading(false); return; }
      router.push("/portal/dashboard");
      router.refresh();
    } catch { setError("Registration failed. Please try again."); setLoading(false); }
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
            <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Create Account</h1>
            <p className="mt-2 text-sm text-grey">Enter your details to access the Client Portal.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-grey mb-1.5">Full Name *</label><input className={ic} required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" /></div>
            <div><label className="block text-sm font-medium text-grey mb-1.5">Company Name *</label><input className={ic} required value={form.companyName} onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Acme Corp" /></div>
            <div><label className="block text-sm font-medium text-grey mb-1.5">Email *</label><input className={ic} type="email" required value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@acme.com" /></div>
            <div><label className="block text-sm font-medium text-grey mb-1.5">Password *</label><input className={ic} type="password" required minLength={8} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" /></div>
            {error && <div className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60 cursor-not-allowed">
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
          <p className="mt-4 text-center"><Link href="/portal/login" className="text-sm text-grey hover:text-white transition-colors">Already have an account? Sign in →</Link></p>
          <p className="mt-4 text-center"><Link href="/" className="text-sm text-grey hover:text-white transition-colors">← Back to Vyravo AI</Link></p>
        </div>
      </div>
    </main>
  );
}
