import type { Metadata } from "next";
import Link from "next/link";
import { CallHistoryList } from "@/components/voice/CallHistoryList";
import { CTA } from "@/components/CTA";

export const metadata: Metadata = {
  title: "Call History",
  description: "Every call handled by the Vyravo AI Voice Receptionist — caller, intent, outcome, qualification, and follow-up status.",
};

export default function VoiceCallsPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Voice Receptionist
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Call <span className="gradient-text">History</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Every call the AI receptionist has handled — transcripts, intents, qualifications, outcomes, and
            follow-ups. Click any call for the full record.
          </p>
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CallHistoryList />
        </div>
      </section>

      <CTA
        title="See It Answer a Call Yourself"
        description="Run a simulated call and watch the receptionist qualify a lead, book a discovery call, and sync to the CRM."
        primaryText="Run a Demo Call"
        primaryHref="/voice-receptionist#demo-call"
        secondaryText="Back to Dashboard"
        secondaryHref="/voice-receptionist"
      />
    </main>
  );
}
