import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";
import { SERVICES, SITE_LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Custom Solutions",
  description:
    "Vyravo AI builds custom AI automation solutions tailored to your business requirements, workflows, integrations, and implementation complexity. Book a discovery call for a tailored proposal.",
};

export default function PricingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Custom Solutions
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Tailored to{" "}
            <span className="gradient-text">Your Business</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Every business is different. That&apos;s why we don&apos;t use one-size-fits-all pricing — our AI automation systems are designed around your workflows, goals, existing software, and operational requirements.
          </p>
        </div>
      </section>

      {/* Custom Pricing Philosophy */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">Why Custom Pricing?</h2>
          <p className="mt-4 text-grey leading-relaxed max-w-2xl mx-auto">
            Pricing is customized based on your business requirements, workflows, integrations, and implementation complexity. A simple chatbot for a small business requires different resources than an enterprise workflow automation system. Book a discovery call and we&apos;ll assess your requirements and provide a tailored proposal — with no hidden fees and no obligation.
          </p>
        </div>
      </section>

      {/* Solution Cards */}
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
                  <p className="text-2xl font-semibold gradient-text font-[var(--font-heading)]">Custom Pricing</p>
                  <p className="text-xs text-grey-dark mt-1">tailored to your requirements</p>
                </div>
                <ul className="mt-6 space-y-2">
                  {service.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-grey">
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={SITE_LINKS.discoveryCall} target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center mt-6 text-sm">
                  Get Custom Quote
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Influences Your Investment */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Factors" title="What Influences Your Investment" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Requirements & Scope", desc: "The outcomes you need, the number of use cases, and how deeply the solution fits your operations." },
              { title: "Workflows & Processes", desc: "How complex your current workflows are and how much of them you want to automate end-to-end." },
              { title: "Integrations", desc: "The tools and systems we connect with — CRMs, ERPs, communication platforms, and custom APIs." },
              { title: "Implementation Complexity", desc: "Custom AI models, data preparation, security requirements, and the speed of your desired rollout." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-surface p-6 card-hover">
                <h3 className="text-sm font-semibold font-[var(--font-heading)]">{item.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Process" title="From Discovery to Proposal" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Book a Discovery Call", desc: "A free 30-minute conversation about your business, challenges, and automation goals." },
              { step: "02", title: "Requirements Assessment", desc: "We map your workflows, tools, and priorities to identify the highest-impact automation opportunities." },
              { step: "03", title: "Tailored Proposal", desc: "You receive a custom proposal with the recommended solution, timeline, and investment breakdown." },
              { step: "04", title: "Build & Launch", desc: "We design, develop, and deploy your solution — with weekly demos and continuous feedback." },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-border bg-bg p-6 card-hover">
                <p className="text-sm font-semibold text-primary font-[var(--font-heading)]">{item.step}</p>
                <h3 className="mt-2 text-sm font-semibold font-[var(--font-heading)]">{item.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="section-padding">
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
              <div key={item.title} className="rounded-xl border border-border bg-surface p-6 card-hover">
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
          <SectionHeading label="FAQ" title="Custom Solutions FAQ" />
          <Accordion
            items={[
              { question: "Why isn't there a fixed price for each service?", answer: "Every business is different. AI solutions vary significantly in workflows, integrations, and scope — so pricing is customized based on your business requirements and implementation complexity. This ensures you pay for exactly what you need — nothing more, nothing less." },
              { question: "How do I get a quote?", answer: "Book a free discovery call. We'll discuss your requirements, assess your workflows and integrations, and provide a tailored proposal within 48 hours." },
              { question: "Do you offer payment plans?", answer: "Yes. For larger projects, we typically structure payments across milestones rather than a single upfront amount. The exact structure is included in your proposal." },
              { question: "Is there a refund policy?", answer: "We offer a satisfaction guarantee. If we can't deliver the agreed-upon solution, we'll refund the remaining balance. Details are in our Terms & Conditions." },
              { question: "Are there ongoing costs after launch?", answer: "The project scope covers development and 30-day post-launch support. Optional maintenance and optimization support is available if you want ongoing assistance." },
              { question: "Do you work with startups?", answer: "Yes. We design solutions for businesses of every size. Share your situation during the discovery call and we'll shape a solution around your requirements." },
            ]}
          />
        </div>
      </section>

      <CTA
        title="Let's Discuss Your Requirements"
        description="Book a free discovery call and we'll assess your business needs, workflows, and goals — then provide a tailored proposal."
        primaryText="Book a Discovery Call"
        secondaryText="Request a Quote"
        secondaryHref="/contact"
      />
    </main>
  );
}
