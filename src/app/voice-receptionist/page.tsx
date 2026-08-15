import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { CTA } from "@/components/CTA";
import { DemoCallConsole } from "@/components/voice/DemoCallConsole";
import { DashboardStats } from "@/components/voice/DashboardStats";
import { IntegrationStatus } from "@/components/voice/IntegrationStatus";
import { RecentActivity } from "@/components/voice/RecentActivity";
import { SITE_LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "AI Voice Receptionist",
  description:
    "Vyravo AI's Voice Receptionist answers calls, qualifies leads, books discovery calls, and syncs with your CRM. Try the live demo.",
};

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Answer",
    desc: "Greets callers professionally, 24/7, using the configured business greeting.",
  },
  {
    step: "02",
    title: "Understand",
    desc: "Detects the caller's intent — pricing, services, booking, support, escalation, and more.",
  },
  {
    step: "03",
    title: "Qualify",
    desc: "Collects name, service interest, contact details and requirements — naturally, without interrogating.",
  },
  {
    step: "04",
    title: "Act",
    desc: "Books discovery calls, creates CRM leads, triggers follow-up emails, and requests callbacks.",
  },
];

export default function VoiceReceptionistPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Live App · Demo Mode
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            AI Voice <span className="gradient-text">Receptionist</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Answers your business calls, understands what callers want, qualifies leads, books discovery
            calls, and syncs everything to your CRM — automatically.
          </p>
          <p className="mt-4 text-sm text-grey-dark max-w-2xl mx-auto">
            Running in Demo Mode: a simulated line with no live phone number connected. Every conversation,
            lead, CRM sync, and booking step below works exactly as it will in production.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#demo-call" className="btn-primary text-base px-8 py-4">
              Try a Demo Call
            </a>
            <Link href="/voice-receptionist/configuration" className="btn-secondary text-base px-8 py-4">
              Configure Receptionist
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard stats */}
      <section className="section-padding pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <DashboardStats />
        </div>
      </section>

      {/* Demo call console */}
      <section className="section-padding bg-surface border-t border-b border-border" id="demo-call">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Demo Mode"
            title="Experience a Real Call"
            description="Play the caller. The AI receptionist answers, qualifies, and acts — while you watch the transcript unfold in real time."
          />
          <DemoCallConsole />
        </div>
      </section>

      {/* How it works */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Call Flow"
            title="How the Receptionist Handles Calls"
            description="A clear, predictable workflow — from the first ring to the follow-up."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step.step} className="relative rounded-xl border border-border bg-surface p-6 md:p-8">
                <span className="text-5xl font-bold text-white/5 font-[var(--font-heading)] absolute top-4 right-4">
                  {step.step}
                </span>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold mb-4">
                  {step.step}
                </div>
                <h3 className="text-lg font-semibold font-[var(--font-heading)]">{step.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities — what it really does */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Capabilities"
            title="What It Can Do Today"
            description="Everything below works in this demo — verified against the live integrations."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "💬", title: "Natural-Language Conversations", desc: "Answers FAQs from the business knowledge base — business hours, location, services, pricing policy. Never invents business information." },
              { icon: "🎯", title: "Lead Qualification", desc: "Collects name, service interest, email, company, requirements and preferred contact time — adapting to the conversation." },
              { icon: "📅", title: "Discovery Call Booking", desc: `Sends callers through the existing booking flow (${SITE_LINKS.discoveryCall.replace("https://", "")}) and records the request.` },
              { icon: "🗂️", title: "CRM Sync (HubSpot)", desc: "Creates or updates leads in the existing CRM — deduped by email, source marked 'voice-receptionist'." },
              { icon: "✉️", title: "Email Automation Triggers", desc: "Fires follow-up triggers for qualified leads, bookings, callbacks and escalations through the existing Email Automation app." },
              { icon: "🤝", title: "Honest Human Escalation", desc: "Callers asking for a human get a priority callback request — no fake transfers." },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-bg p-6 md:p-8 card-hover">
                <span className="text-2xl">{c.icon}</span>
                <h3 className="mt-4 text-lg font-semibold font-[var(--font-heading)]">{c.title}</h3>
                <p className="mt-2 text-sm text-grey leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration status */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="System Status"
            title="What's Connected"
            description="The honest state of every integration — what is live and what is simulated."
          />
          <IntegrationStatus />
        </div>
      </section>

      {/* Recent activity */}
      <section className="section-padding bg-surface border-t border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading label="Activity" title="Recent Calls" description="The latest calls handled by the receptionist." />
          <RecentActivity />
          <div className="mt-8 text-center">
            <Link href="/voice-receptionist/calls" className="btn-secondary">
              View All Calls →
            </Link>
          </div>
        </div>
      </section>

      <CTA
        title="Want This Answering Your Business Calls?"
        description="Book a free discovery call and we'll configure the Voice Receptionist for your business — greeting, knowledge, CRM, and booking flow."
        primaryText="Book Discovery Call"
        secondaryText="Configure the Demo"
        secondaryHref="/voice-receptionist/configuration"
      />
    </main>
  );
}
