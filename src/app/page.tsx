import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";
import { SERVICES, INDUSTRIES, PROCESS_STEPS, STATS, TESTIMONIALS } from "@/lib/constants";

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated mesh background */}
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "3s" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-24 pb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-grey mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Intelligent Automation for Modern Businesses
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] font-[var(--font-heading)]">
            AI Automation That{" "}
            <span className="gradient-text">Saves Time</span>, Reduces Costs &amp; Helps Your Business{" "}
            <span className="gradient-text">Scale</span>.
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-grey max-w-3xl mx-auto leading-relaxed">
            We build AI chatbots, voice agents, and intelligent automation systems that eliminate repetitive work, improve customer experience, and accelerate business growth.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/book-discovery-call" className="btn-primary text-base px-8 py-4">
              Book Free Discovery Call
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link href="/services" className="btn-secondary text-base px-8 py-4">
              Explore Solutions
            </Link>
          </div>

          {/* Trust stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl md:text-4xl font-semibold gradient-text font-[var(--font-heading)]">{stat.value}</p>
                <p className="mt-1 text-xs text-grey">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-bg to-transparent" />
      </section>

      {/* Trusted By */}
      <section className="section-padding border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-grey-dark uppercase tracking-[0.15em] mb-10">
            Trusted by forward-thinking businesses
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40">
            {["TechVenture", "MedCare", "GlobalLogistics", "DataFirst", "ScaleUp", "InnovateCo"].map((name) => (
              <span key={name} className="text-lg font-semibold tracking-tight text-white font-[var(--font-heading)]">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="section-padding" id="services">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Services"
            title="AI Solutions That Drive Results"
            description="From intelligent chatbots to end-to-end workflow automation, we deliver AI systems that transform how your business operates."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((service) => (
              <Link
                key={service.slug}
                href="/services"
                className="group rounded-xl border border-border bg-surface p-6 md:p-8 card-hover"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <ServiceIcon type={service.icon} />
                </div>
                <h3 className="text-lg font-semibold font-[var(--font-heading)] group-hover:text-primary transition-colors">
                  {service.title}
                </h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">
                  {service.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {service.features.map((f) => (
                    <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-grey-dark border border-border">
                      {f}
                    </span>
                  ))}
                </div>
                <p className="mt-5 text-sm font-medium text-primary">
                  Starting from {service.startingPrice} →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Industries"
            title="AI Automation for Every Industry"
            description="We serve businesses across healthcare, finance, hospitality, real estate, e-commerce, and more."
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {INDUSTRIES.map((ind) => (
              <Link
                key={ind.slug}
                href="/industries"
                className="group rounded-xl border border-border bg-bg p-5 text-center card-hover"
              >
                <span className="text-3xl">{ind.icon}</span>
                <p className="mt-3 text-sm font-medium text-white group-hover:text-primary transition-colors">
                  {ind.name}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Why Vyravo AI"
            title="Built for Scale. Designed for Results."
            description="We don't just build AI tools — we engineer intelligent systems that deliver measurable business outcomes."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Enterprise-Grade Quality", desc: "Production-ready AI solutions built with best-in-class architecture, security, and scalability.", icon: "⚡" },
              { title: "Custom-Built Solutions", desc: "Every solution is designed around your specific business needs — no cookie-cutter templates.", icon: "🎯" },
              { title: "Rapid Deployment", desc: "From strategy to launch in weeks, not months. Agile development with continuous iteration.", icon: "🚀" },
              { title: "Measurable ROI", desc: "Clear KPIs and metrics tracking from day one. We prove the value of every automation.", icon: "📊" },
              { title: "Ongoing Optimization", desc: "Continuous monitoring, maintenance, and improvement to maximize long-term performance.", icon: "🔄" },
              { title: "Dedicated Support", desc: "Direct access to your development team with priority support and regular strategy reviews.", icon: "🤝" },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-surface p-6 md:p-8 card-hover">
                <span className="text-2xl">{item.icon}</span>
                <h3 className="mt-4 text-lg font-semibold font-[var(--font-heading)]">{item.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Our Process"
            title="From Strategy to Scale in 4 Steps"
            description="A proven, transparent process that keeps you informed and in control at every stage."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS_STEPS.map((step) => (
              <div key={step.step} className="relative rounded-xl border border-border bg-bg p-6 md:p-8">
                <span className="text-5xl font-bold text-white/5 font-[var(--font-heading)] absolute top-4 right-4">
                  {String(step.step).padStart(2, "0")}
                </span>
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

      {/* Business Results */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Results"
            title="Real Impact. Measurable Growth."
            description="Our AI solutions consistently deliver transformative results across industries."
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { stat: "85%", desc: "Reduction in manual tasks", detail: "Automate repetitive work so your team can focus on strategy." },
              { stat: "3x", desc: "Faster response times", detail: "AI agents respond instantly, 24/7, across all channels." },
              { stat: "60%", desc: "Cost savings", detail: "Reduce operational costs with intelligent automation." },
              { stat: "40%", desc: "Revenue increase", detail: "Convert more leads with AI-powered sales automation." },
            ].map((item) => (
              <div key={item.stat} className="rounded-xl border border-border bg-surface p-6 md:p-8 text-center card-hover">
                <p className="text-4xl md:text-5xl font-semibold gradient-text font-[var(--font-heading)]">{item.stat}</p>
                <p className="mt-2 text-sm font-medium text-white">{item.desc}</p>
                <p className="mt-2 text-xs text-grey">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Case Studies"
            title="See How We Deliver Results"
            description="Explore how our AI solutions have transformed businesses across industries."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "AI Chatbot for Healthcare",
                industry: "Healthcare",
                result: "85% reduction in response time",
                description: "Deployed an AI-powered patient engagement chatbot that handles appointment scheduling, FAQ responses, and triage assistance.",
              },
              {
                title: "Sales Automation for SaaS",
                industry: "Technology",
                result: "3x increase in qualified leads",
                description: "Built an end-to-end AI sales pipeline with automated lead scoring, personalized outreach, and intelligent follow-ups.",
              },
              {
                title: "Workflow Automation for Logistics",
                industry: "Manufacturing",
                result: "200+ hours saved per month",
                description: "Automated order processing, inventory tracking, and vendor communication workflows for a global logistics company.",
              },
            ].map((study) => (
              <Link
                key={study.title}
                href="/case-studies"
                className="group rounded-xl border border-border bg-bg overflow-hidden card-hover"
              >
                <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center">
                  <span className="text-5xl opacity-30">📊</span>
                </div>
                <div className="p-6">
                  <span className="text-xs font-medium text-primary uppercase tracking-wider">{study.industry}</span>
                  <h3 className="mt-2 text-lg font-semibold font-[var(--font-heading)] group-hover:text-primary transition-colors">
                    {study.title}
                  </h3>
                  <p className="mt-2 text-sm text-grey leading-relaxed">{study.description}</p>
                  <p className="mt-4 text-sm font-medium text-accent">{study.result}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/case-studies" className="btn-secondary">
              View All Case Studies →
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Testimonials"
            title="What Our Clients Say"
            description="Hear directly from the businesses we've helped transform with AI automation."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-xl border border-border bg-surface p-6 md:p-8 card-hover">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-grey leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                    {t.name[0]}
                  </div>
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
      <section className="section-padding bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="FAQ"
            title="Frequently Asked Questions"
            description="Get answers to common questions about our AI automation services."
          />
          <Accordion
            columns={2}
            items={[
              { question: "What is AI automation?", answer: "AI automation uses artificial intelligence to perform repetitive tasks, make decisions, and streamline business processes — reducing manual work and improving efficiency." },
              { question: "How long does implementation take?", answer: "Most projects are delivered within 4–8 weeks depending on complexity. Simple chatbots can be deployed in as little as 2 weeks." },
              { question: "What industries do you serve?", answer: "We work with healthcare, finance, real estate, hospitality, manufacturing, education, marketing agencies, e-commerce, and more." },
              { question: "Do you offer ongoing support?", answer: "Yes. All our solutions include post-launch support, monitoring, and optimization to ensure continuous performance." },
              { question: "What's the ROI of AI automation?", answer: "Our clients typically see 60% cost savings and 3x improvement in response times within the first 3 months of deployment." },
              { question: "Can you integrate with our existing tools?", answer: "Absolutely. We integrate with popular CRMs, ERPs, communication platforms, and custom APIs to fit seamlessly into your workflow." },
              { question: "Is my data secure?", answer: "Yes. We follow enterprise-grade security practices including encryption, access controls, and compliance with GDPR and other regulations." },
              { question: "What makes Vyravo AI different?", answer: "We focus on measurable business outcomes, not just technology. Every solution is custom-built to your needs with transparent pricing and dedicated support." },
              { question: "Do you offer a free consultation?", answer: "Yes! We offer a free 30-minute discovery call where we analyze your business needs and propose an AI automation strategy." },
              { question: "What is the cost of your services?", answer: "Pricing is customized based on project scope. AI chatbots start at $2,500 and workflow automation starts at $3,000. Book a discovery call for a detailed quote." },
              { question: "Can I see a demo before starting?", answer: "Yes. During the discovery call, we can walk you through relevant demos and case studies that match your industry and use case." },
              { question: "Do you work with startups?", answer: "Yes! We work with startups, SMEs, and enterprises. Our solutions are designed to scale with your business as it grows." },
              { question: "What technologies do you use?", answer: "We use state-of-the-art AI frameworks including GPT-4, Claude, custom fine-tuned models, along with robust cloud infrastructure." },
              { question: "Can you train AI on our company data?", answer: "Yes. We can train custom AI models on your company data to deliver highly accurate, context-aware automation." },
              { question: "How do I get started?", answer: "Simply book a free discovery call on our website. We'll discuss your needs, propose a solution, and provide a detailed timeline and investment breakdown." },
              { question: "Do you provide white-label solutions?", answer: "Yes. We offer white-label AI solutions that can be fully branded as your own for agencies and resellers." },
              { question: "What happens after the project is complete?", answer: "We provide ongoing maintenance, monitoring, and optimization packages to ensure your AI solution continues performing at its best." },
              { question: "Can AI chatbots handle multiple languages?", answer: "Yes. Our AI chatbots support multi-language conversations, making them ideal for businesses with international customers." },
            ]}
          />
        </div>
      </section>

      {/* Final CTA */}
      <CTA />
    </main>
  );
}
