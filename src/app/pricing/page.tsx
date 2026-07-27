import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";
import { SERVICES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Explore Vyravo AI pricing for AI chatbots, workflow automation, voice agents, sales automation, consulting, and custom AI solutions.",
};

export default function PricingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Pricing
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Transparent, Custom{" "}
            <span className="gradient-text">Pricing</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Every business is unique. We provide custom pricing based on your specific needs, scope, and goals — with no hidden fees.
          </p>
        </div>
      </section>

      {/* Pricing Philosophy */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">Why Custom Pricing?</h2>
          <p className="mt-4 text-grey leading-relaxed max-w-2xl mx-auto">
            One-size-fits-all pricing doesn&apos;t work for AI solutions. A simple chatbot for a small business requires different resources than an enterprise workflow automation system. We assess your specific needs and provide a transparent quote that reflects the actual scope of work.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="section-padding pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((service, i) => (
              <div
                key={service.slug}
                className={`rounded-xl border p-6 md:p-8 card-hover ${
                  i === 0 ? "border-primary/30 bg-gradient-to-b from-primary/5 to-surface relative" : "border-border bg-surface"
                }`}
              >
                {i === 0 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full bg-primary text-white">
                    Most Popular
                  </span>
                )}
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <ServiceIcon type={service.icon} />
                </div>
                <h3 className="text-lg font-semibold font-[var(--font-heading)]">{service.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{service.description}</p>
                <div className="mt-6 border-t border-border pt-6">
                  <p className="text-sm text-grey">Starting from</p>
                  <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">{service.startingPrice}</p>
                  <p className="text-xs text-grey-dark mt-1">per project</p>
                </div>
                <ul className="mt-6 space-y-2">
                  {service.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-grey">
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/book-discovery-call" className="btn-primary w-full justify-center mt-6 text-sm">
                  Get Custom Quote
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Included" title="What Every Project Includes" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Free Discovery Call", desc: "30-minute consultation to understand your needs and design the perfect solution." },
              { title: "Custom Development", desc: "Solutions built specifically for your business — no cookie-cutter templates." },
              { title: "Testing & QA", desc: "Rigorous testing to ensure reliability, accuracy, and performance at scale." },
              { title: "Deployment & Launch", desc: "Full deployment support with documentation and team training." },
              { title: "30-Day Support", desc: "Complimentary post-launch support to ensure smooth operation." },
              { title: "Performance Reports", desc: "Regular reports on KPIs, usage metrics, and optimization recommendations." },
              { title: "Security & Compliance", desc: "Enterprise-grade security practices and compliance with industry standards." },
              { title: "Source Code Access", desc: "Full ownership of the code and intellectual property for your solution." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-bg p-6 card-hover">
                <h3 className="text-sm font-semibold font-[var(--font-heading)]">{item.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="section-padding">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Comparison" title="Compare Our Services" />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="text-left px-6 py-4 font-semibold text-white">Feature</th>
                  <th className="text-center px-4 py-4 font-semibold text-white">Chatbot</th>
                  <th className="text-center px-4 py-4 font-semibold text-white">Workflow</th>
                  <th className="text-center px-4 py-4 font-semibold text-white">Voice</th>
                  <th className="text-center px-4 py-4 font-semibold text-white">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { feat: "24/7 Availability", chatbot: true, workflow: true, voice: true, sales: true },
                  { feat: "Multi-channel Support", chatbot: true, workflow: false, voice: true, sales: true },
                  { feat: "CRM Integration", chatbot: true, workflow: true, voice: false, sales: true },
                  { feat: "Custom AI Model", chatbot: true, workflow: true, voice: true, sales: true },
                  { feat: "Analytics Dashboard", chatbot: true, workflow: true, voice: true, sales: true },
                  { feat: "Lead Scoring", chatbot: true, workflow: false, voice: false, sales: true },
                  { feat: "Voice Interaction", chatbot: false, workflow: false, voice: true, sales: false },
                  { feat: "Process Automation", chatbot: false, workflow: true, voice: false, sales: true },
                ].map((row) => (
                  <tr key={row.feat} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 text-grey">{row.feat}</td>
                    <td className="text-center px-4 py-3">{row.chatbot ? <span className="text-primary">✓</span> : <span className="text-grey-dark">—</span>}</td>
                    <td className="text-center px-4 py-3">{row.workflow ? <span className="text-primary">✓</span> : <span className="text-grey-dark">—</span>}</td>
                    <td className="text-center px-4 py-3">{row.voice ? <span className="text-primary">✓</span> : <span className="text-grey-dark">—</span>}</td>
                    <td className="text-center px-4 py-3">{row.sales ? <span className="text-primary">✓</span> : <span className="text-grey-dark">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="FAQ" title="Pricing FAQ" />
          <Accordion
            items={[
              { question: "Why isn't there a fixed price for each service?", answer: "AI solutions vary significantly in complexity, integrations, and scope. Custom pricing ensures you pay for exactly what you need — nothing more, nothing less." },
              { question: "Do you offer payment plans?", answer: "Yes. For larger projects, we typically structure payments across milestones: 40% upfront, 30% at midpoint, and 30% upon delivery." },
              { question: "Is there a refund policy?", answer: "We offer a satisfaction guarantee. If we can't deliver the agreed-upon solution, we'll refund the remaining balance. Details are in our Terms & Conditions." },
              { question: "Are there ongoing costs after launch?", answer: "The initial project fee covers development and 30-day support. Optional maintenance packages are available for ongoing monitoring and optimization." },
              { question: "How do I get a detailed quote?", answer: "Book a free discovery call. We'll discuss your needs, design a solution, and provide a detailed quote within 48 hours." },
              { question: "Do you offer discounts for startups?", answer: "Yes. We offer flexible pricing for early-stage startups. Share your situation during the discovery call and we'll work with your budget." },
            ]}
          />
        </div>
      </section>

      <CTA
        title="Get Your Custom Quote Today"
        description="Book a free 30-minute discovery call and receive a detailed proposal tailored to your business needs."
        primaryText="Book Free Discovery Call"
      />
    </main>
  );
}
