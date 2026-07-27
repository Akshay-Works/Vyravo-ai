"use client";

import Link from "next/link";
import type { ServiceRecommendation } from "@/lib/discovery/types";
import { COMPANY } from "@/lib/constants";

interface BookingSuccessProps {
  leadName: string;
  leadEmail: string;
  recommendations: ServiceRecommendation[];
  score: number;
}

export function BookingSuccess({ leadName, leadEmail, recommendations, score }: BookingSuccessProps) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      {/* Success Icon */}
      <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-3xl md:text-4xl font-semibold font-[var(--font-heading)] mb-4">
        You&apos;re All Set, {leadName.split(" ")[0]}! 🎉
      </h1>
      
      <p className="text-grey text-lg mb-8">
        Your information has been submitted successfully. We&apos;ll reach out within 24 hours to schedule your discovery call.
      </p>

      {/* What's Next */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8 text-left mb-8">
        <h2 className="text-xl font-semibold font-[var(--font-heading)] mb-6">What Happens Next</h2>
        
        <div className="space-y-6">
          {[
            {
              step: 1,
              title: "We Review Your Profile",
              desc: "Our team will analyze your business needs and prepare personalized recommendations.",
              time: "Within 24 hours",
            },
            {
              step: 2,
              title: "Schedule Your Call",
              desc: `We'll email you at ${leadEmail} with available times for your discovery call.`,
              time: "Within 24 hours",
            },
            {
              step: 3,
              title: "30-Minute Discovery Call",
              desc: "We'll discuss your challenges, goals, and create a custom automation strategy.",
              time: "At your scheduled time",
            },
            {
              step: 4,
              title: "Receive Your Proposal",
              desc: "Within 48 hours of our call, you'll receive a detailed proposal with timeline and investment.",
              time: "After the call",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                {item.step}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{item.title}</h3>
                  <span className="text-xs text-grey px-2 py-0.5 rounded-full bg-surface-2">{item.time}</span>
                </div>
                <p className="text-sm text-grey">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Services */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8 text-left mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-[var(--font-heading)]">Based on Your Profile</h2>
          <span className="text-sm text-primary">{score}/100 Match</span>
        </div>
        
        <div className="space-y-3">
          {recommendations.filter(r => r.priority === "high").map((rec, i) => (
            <div key={i} className="flex items-start gap-3">
              <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <span className="font-medium">{rec.service}</span>
                <p className="text-sm text-grey">{rec.reason.slice(0, 80)}...</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border border-border bg-surface-2 p-5 mb-8">
        <p className="text-sm text-grey mb-3">Have questions before your call?</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href={COMPANY.emailLink}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {COMPANY.email}
          </a>
          <a
            href={COMPANY.phoneLink}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {COMPANY.phone}
          </a>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/" className="btn-secondary text-sm">
          Return Home
        </Link>
        <Link href="/services" className="btn-primary text-sm">
          Explore Our Services
        </Link>
      </div>
    </div>
  );
}
