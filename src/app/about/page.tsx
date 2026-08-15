import type { Metadata } from "next";
import { SectionHeading } from "@/components/SectionHeading";
import { CTA } from "@/components/CTA";
import { STATS, INDUSTRIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about Vyravo AI — our mission, story, values, and the team behind intelligent automation solutions for modern businesses.",
};

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            About Us
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            We Build the Future of{" "}
            <span className="gradient-text">Business Automation</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Vyravo AI exists to help businesses eliminate repetitive work, reduce costs, and scale faster through intelligent AI automation.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 inline-block">Our Story</span>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight font-[var(--font-heading)]">
                Why Vyravo AI Exists
              </h2>
              <p className="mt-4 text-grey leading-relaxed">
                We saw businesses drowning in repetitive manual tasks — answering the same questions, processing the same data, following up on the same leads. Hours wasted, opportunities missed, teams burned out.
              </p>
              <p className="mt-4 text-grey leading-relaxed">
                Vyravo AI was founded to solve this. We build intelligent AI systems that handle the repetitive work so your team can focus on what truly matters — strategy, creativity, and growth.
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/5 border border-border p-8 md:p-12">
              <div className="space-y-6">
                <div>
                  <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">Mission</p>
                  <p className="mt-2 text-sm text-grey">Help businesses automate repetitive work using AI chatbots, workflow automation, voice agents, and custom AI solutions.</p>
                </div>
                <div className="border-t border-border pt-6">
                  <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">Vision</p>
                  <p className="mt-2 text-sm text-grey">To become the most trusted AI automation partner for businesses worldwide — known for quality, results, and integrity.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Core Values" title="What We Stand For" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Results First", desc: "We measure success by business impact, not lines of code. Every project has clear KPIs and measurable outcomes.", icon: "🎯" },
              { title: "Radical Transparency", desc: "No hidden fees, no scope creep surprises. Clear communication, honest timelines, and transparent pricing.", icon: "🔍" },
              { title: "Continuous Improvement", desc: "We don't just deploy and disappear. We monitor, iterate, and optimize for long-term performance.", icon: "📈" },
              { title: "Client Partnership", desc: "We work as an extension of your team. Your success is our success — we grow together.", icon: "🤝" },
            ].map((v) => (
              <div key={v.title} className="rounded-xl border border-border bg-bg p-6 md:p-8 card-hover">
                <span className="text-2xl">{v.icon}</span>
                <h3 className="mt-4 text-lg font-semibold font-[var(--font-heading)]">{v.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl bg-surface border border-border aspect-square flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-semibold mx-auto">
                  A
                </div>
                <p className="mt-4 text-sm text-grey">Founder & CEO</p>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 inline-block">Founder</span>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight font-[var(--font-heading)]">
                Led by Vision, Driven by Results
              </h2>
              <p className="mt-4 text-grey leading-relaxed">
                Vyravo AI was founded with a singular vision: to make enterprise-grade AI automation accessible to businesses of all sizes. Our founder brings deep expertise in AI, machine learning, and business automation.
              </p>
              <p className="mt-4 text-grey leading-relaxed">
                With a passion for solving real business problems through technology, we&apos;ve built a company that prioritizes outcomes over outputs — delivering AI solutions that create genuine, measurable value.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-4xl md:text-5xl font-semibold gradient-text font-[var(--font-heading)]">{s.value}</p>
                <p className="mt-2 text-sm text-grey">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-grey-dark text-center max-w-2xl mx-auto">
            *Illustrative benchmarks based on typical automation scenarios — your actual results are measured against clear KPIs from day one.
          </p>
        </div>
      </section>

      {/* Industries */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Industries" title="We Serve Businesses Across Industries" />
          <div className="flex flex-wrap justify-center gap-4">
            {INDUSTRIES.map((ind) => (
              <span key={ind.slug} className="px-4 py-2 rounded-full border border-border bg-surface text-sm text-grey">
                {ind.icon} {ind.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <CTA />
    </main>
  );
}
