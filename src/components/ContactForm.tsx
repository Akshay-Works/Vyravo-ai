"use client";

import { useState } from "react";
import { SERVICES } from "@/lib/constants";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus("success");
        form.reset();
      } else {
        setErrorMsg(json.error || "Something went wrong.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
        <svg className="w-12 h-12 text-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-semibold font-[var(--font-heading)]">Message Sent!</h3>
        <p className="mt-2 text-sm text-grey">Thank you for reaching out. We&apos;ll get back to you within 24 hours.</p>
        <button onClick={() => setStatus("idle")} className="btn-secondary mt-4 text-sm">
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-white mb-2">Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            placeholder="Your full name"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white mb-2">Email *</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            placeholder="you@company.com"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-white mb-2">Phone</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            placeholder="+91 9075707650"
          />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-white mb-2">Company</label>
          <input
            type="text"
            id="company"
            name="company"
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            placeholder="Your company name"
          />
        </div>
      </div>
      <div>
        <label htmlFor="service" className="block text-sm font-medium text-white mb-2">Service Interest</label>
        <select
          id="service"
          name="service"
          className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        >
          <option value="">Select a service</option>
          {SERVICES.map((s) => (
            <option key={s.slug} value={s.title}>{s.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-white mb-2">Message *</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
          placeholder="Tell us about your project..."
        />
      </div>
      {status === "error" && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="btn-primary w-full justify-center py-3.5"
      >
        {status === "loading" ? "Sending..." : "Send Message"}
        {status !== "loading" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
      </button>
    </form>
  );
}
