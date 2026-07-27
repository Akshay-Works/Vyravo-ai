import type { Metadata } from "next";
import { DiscoveryCallClient } from "./client";
import { COMPANY } from "@/lib/constants";
import { TESTIMONIALS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Book a Free Discovery Call",
  description: "Schedule a free 30-minute AI automation consultation with Vyravo AI. Get personalized recommendations and a custom proposal.",
};

export default function BookDiscoveryCallPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40 pb-12">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Free AI Consultation
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Let&apos;s Build Your{" "}
            <span className="gradient-text">AI Automation</span> Strategy
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Complete the quick qualification form below. Our AI will analyze your needs and recommend the perfect automation solutions for your business.
          </p>
          
          {/* Trust Stats */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-8">
            {[
              { icon: "⏱️", value: "30 min", label: "Free call" },
              { icon: "🎯", value: "Custom", label: "AI recommendations" },
              { icon: "📊", value: "48h", label: "Proposal delivery" },
              { icon: "✅", value: "Zero", label: "Obligation" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span className="text-xl">{stat.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">{stat.value}</p>
                  <p className="text-xs text-grey">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Form Column */}
            <div className="lg:col-span-2">
              <DiscoveryCallClient />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* What to Expect */}
              <div className="rounded-2xl border border-border bg-surface p-6 sticky top-24">
                <h3 className="text-lg font-semibold font-[var(--font-heading)] mb-5">What to Expect</h3>
                
                <div className="space-y-5">
                  {[
                    { icon: "📝", title: "Step 1: Complete Form", desc: "Takes about 3 minutes. Our AI analyzes your responses in real-time." },
                    { icon: "💡", title: "Step 2: Get Recommendations", desc: "See personalized AI solutions based on your industry and challenges." },
                    { icon: "📅", title: "Step 3: Schedule Call", desc: "Pick a time that works for your 30-minute consultation." },
                    { icon: "📧", title: "Step 4: Receive Prep", desc: "We'll send confirmation and meeting brief within 24 hours." },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-xl shrink-0">{item.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-grey mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-semibold mb-3">During the Call</h4>
                  <ul className="space-y-2">
                    {[
                      "Deep dive into your business challenges",
                      "AI automation opportunities analysis",
                      "Custom solution recommendations",
                      "Timeline and investment discussion",
                      "Q&A and next steps",
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-grey">
                        <span className="text-primary">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-semibold mb-3">Questions?</h4>
                  <div className="space-y-2">
                    <a
                      href={COMPANY.phoneLink}
                      className="flex items-center gap-2 text-sm text-grey hover:text-primary transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {COMPANY.phone}
                    </a>
                    <a
                      href={COMPANY.emailLink}
                      className="flex items-center gap-2 text-sm text-grey hover:text-primary transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {COMPANY.email}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)] text-center mb-10">
            What Clients Say After Their Discovery Call
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-xl border border-border bg-bg p-6 card-hover">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-grey leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">{t.name[0]}</div>
                  <div>
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-xs text-grey">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)] text-center mb-10">
            Common Questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "Is this really free?",
                a: "Yes, 100% free with zero obligation. The discovery call is our way of understanding your needs before proposing any solution.",
              },
              {
                q: "How long is the call?",
                a: "30 minutes. That's enough time to understand your challenges, discuss solutions, and outline next steps.",
              },
              {
                q: "What should I prepare?",
                a: "Just complete the form honestly. Think about your biggest operational pain points and what outcomes you're hoping to achieve.",
              },
              {
                q: "Who will I be speaking with?",
                a: "You'll speak directly with an AI automation expert who can discuss strategy, technical feasibility, and implementation.",
              },
              {
                q: "What happens after the call?",
                a: "Within 48 hours, you'll receive a detailed proposal with our recommended solution, timeline, and investment breakdown.",
              },
            ].map((faq, i) => (
              <details key={i} className="group rounded-xl border border-border bg-surface">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                  <span className="text-sm font-medium pr-4">{faq.q}</span>
                  <svg className="w-5 h-5 text-grey group-open:rotate-180 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-4">
                  <p className="text-sm text-grey leading-relaxed">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
