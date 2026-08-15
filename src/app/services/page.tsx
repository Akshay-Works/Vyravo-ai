import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";
import { SERVICES, PROCESS_STEPS, SITE_LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Services",
  description: "Explore Vyravo AI services: AI Chatbots, Workflow Automation, Voice Agents, Sales Automation, AI Consulting, and Custom AI Solutions.",
};

export default function ServicesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Our Services
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            AI Solutions That{" "}
            <span className="gradient-text">Transform</span> Your Business
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            From intelligent chatbots to end-to-end workflow automation, we deliver AI systems that save time, reduce costs, and accelerate growth.
          </p>
        </div>
      </section>

      {/* Services Detail */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {SERVICES.map((service, i) => (
            <div
              key={service.slug}
              className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${i % 2 === 1 ? "md:[direction:rtl] md:[&>*]:direction-ltr" : ""}`}
              id={service.slug}
            >
              <div>
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <ServiceIcon type={service.icon} className="w-7 h-7" />
                </div>
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight font-[var(--font-heading)]">
                  {service.title}
                </h2>
                <p className="mt-4 text-grey leading-relaxed">{service.description}</p>
                <div className="mt-6 space-y-3">
                  {service.features.map((f) => (
                    <div key={f} className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-grey">{f}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex items-center gap-4">
                  <a href={SITE_LINKS.discoveryCall} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
                    Get Started
                  </a>
                  <span className="text-sm text-grey">From {service.startingPrice}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-surface border border-border aspect-video flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
                    <ServiceIcon type={service.icon} className="w-8 h-8" />
                  </div>
                  <p className="mt-4 text-sm text-grey">{service.title} Workflow</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="How It Works" title="Our Development Process" description="A transparent, proven process from discovery to deployment." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS_STEPS.map((step) => (
              <div key={step.step} className="rounded-xl border border-border bg-bg p-6 md:p-8 relative">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold mb-4">
                  {step.step}
                </div>
                <h3 className="text-lg font-semibold font-[var(--font-heading)]">{step.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="FAQ" title="Services FAQ" />
          <Accordion
            items={[
              { question: "How do I know which service is right for my business?", answer: "Book a free discovery call and our team will analyze your business needs and recommend the best AI solution for your specific use case and budget." },
              { question: "Can I combine multiple services?", answer: "Absolutely. Many clients use a combination of AI chatbots with workflow automation or voice agents with sales automation for maximum impact." },
              { question: "What if I need something not listed here?", answer: "Our Custom AI Solutions service covers everything from computer vision to predictive analytics. If you can imagine it, we can likely build it." },
              { question: "Do you offer maintenance after launch?", answer: "Yes. All projects include post-launch support, and we offer ongoing maintenance packages to keep your AI solution performing optimally." },
              { question: "What technologies do you use?", answer: "We leverage cutting-edge AI models like GPT-4, Claude, and custom fine-tuned models, deployed on secure cloud infrastructure with enterprise-grade reliability." },
            ]}
          />
        </div>
      </section>

      <CTA />
    </main>
  );
}
