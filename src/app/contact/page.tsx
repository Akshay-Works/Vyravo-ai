import type { Metadata } from "next";
import { COMPANY } from "@/lib/constants";
import { ContactForm } from "@/components/ContactForm";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with Vyravo AI. Reach out for AI chatbots, workflow automation, voice agents, and custom AI solutions.",
};

export default function ContactPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Contact Us
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Let&apos;s Build Something{" "}
            <span className="gradient-text">Extraordinary</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Ready to automate your business with AI? Reach out and we&apos;ll get back to you within 24 hours.
          </p>
        </div>
      </section>

      {/* Contact Grid */}
      <section className="section-padding pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-border bg-surface p-8 md:p-10">
                <h2 className="text-2xl font-semibold font-[var(--font-heading)] mb-6">Send Us a Message</h2>
                <ContactForm />
              </div>
            </div>

            {/* Contact Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-8">
                <h3 className="text-lg font-semibold font-[var(--font-heading)] mb-6">Contact Information</h3>
                <div className="space-y-5">
                  <a href={COMPANY.phoneLink} className="flex items-start gap-4 group">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Phone</p>
                      <p className="text-sm text-grey group-hover:text-primary transition-colors">{COMPANY.phone}</p>
                    </div>
                  </a>
                  <a href={COMPANY.emailLink} className="flex items-start gap-4 group">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Email</p>
                      <p className="text-sm text-grey group-hover:text-primary transition-colors">{COMPANY.email}</p>
                    </div>
                  </a>
                  <a href={COMPANY.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 group">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">LinkedIn</p>
                      <p className="text-sm text-grey group-hover:text-primary transition-colors">Connect on LinkedIn</p>
                    </div>
                  </a>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Business Hours</p>
                      <p className="text-sm text-grey">{COMPANY.hours}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Location</p>
                      <p className="text-sm text-grey">{COMPANY.location}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map placeholder */}
              <div className="rounded-2xl border border-border bg-surface overflow-hidden h-48 flex items-center justify-center">
                <p className="text-sm text-grey">📍 Serving businesses worldwide</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)] text-center mb-10">Contact FAQ</h2>
          <Accordion
            items={[
              { question: "How quickly do you respond?", answer: "We respond to all inquiries within 24 hours during business days. Urgent requests are prioritized." },
              { question: "Can I schedule a call instead?", answer: "Absolutely! Visit our Book Discovery Call page to schedule a free 30-minute consultation." },
              { question: "Do you work with international clients?", answer: "Yes, we work with clients worldwide. We accommodate different time zones for calls and meetings." },
              { question: "What information should I include in my message?", answer: "Include your business type, the challenge you're facing, any specific AI solutions you're interested in, and your preferred timeline." },
            ]}
          />
        </div>
      </section>

      <CTA
        title="Prefer a Call?"
        description="Skip the form and book a free 30-minute discovery call directly."
        primaryText="Book Discovery Call"
        secondaryText="View Pricing"
        secondaryHref="/pricing"
      />
    </main>
  );
}
