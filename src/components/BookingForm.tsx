"use client";

import { useState } from "react";
import { SERVICES } from "@/lib/constants";

export function BookingForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch("/api/book", {
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
        <h3 className="text-xl font-semibold font-[var(--font-heading)]">Booking Confirmed!</h3>
        <p className="mt-2 text-sm text-grey">Thank you! We&apos;ll reach out within 24 hours to schedule your discovery call.</p>
        <button onClick={() => setStatus("idle")} className="btn-secondary mt-4 text-sm">
          Submit Another Request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="book-name" className="block text-sm font-medium text-white mb-2">Name *</label>
          <input type="text" id="book-name" name="name" required className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" placeholder="Your full name" />
        </div>
        <div>
          <label htmlFor="book-email" className="block text-sm font-medium text-white mb-2">Email *</label>
          <input type="email" id="book-email" name="email" required className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" placeholder="you@company.com" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="book-phone" className="block text-sm font-medium text-white mb-2">Phone</label>
          <input type="tel" id="book-phone" name="phone" className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" placeholder="+91 9075707650" />
        </div>
        <div>
          <label htmlFor="book-company" className="block text-sm font-medium text-white mb-2">Company</label>
          <input type="text" id="book-company" name="company" className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" placeholder="Your company name" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="book-size" className="block text-sm font-medium text-white mb-2">Company Size</label>
          <select id="book-size" name="companySize" className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors">
            <option value="">Select size</option>
            <option value="1-10">1–10 employees</option>
            <option value="11-50">11–50 employees</option>
            <option value="51-200">51–200 employees</option>
            <option value="201-1000">201–1,000 employees</option>
            <option value="1000+">1,000+ employees</option>
          </select>
        </div>
        <div>
          <label htmlFor="book-service" className="block text-sm font-medium text-white mb-2">Service Interest</label>
          <select id="book-service" name="service" className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors">
            <option value="">Select a service</option>
            {SERVICES.map((s) => (
              <option key={s.slug} value={s.title}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="book-message" className="block text-sm font-medium text-white mb-2">Tell us about your project</label>
        <textarea id="book-message" name="message" rows={4} className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none" placeholder="What challenges are you looking to solve with AI automation?" />
      </div>
      {status === "error" && <p className="text-sm text-red-400">{errorMsg}</p>}
      <button type="submit" disabled={status === "loading"} className="btn-primary w-full justify-center py-3.5">
        {status === "loading" ? "Submitting..." : "Book My Discovery Call"}
        {status !== "loading" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        )}
      </button>
    </form>
  );
}
