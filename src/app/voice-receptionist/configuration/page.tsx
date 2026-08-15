import type { Metadata } from "next";
import Link from "next/link";
import { ConfigForm } from "@/components/voice/ConfigForm";

export const metadata: Metadata = {
  title: "Voice Receptionist Configuration",
  description: "Configure the Vyravo AI Voice Receptionist — business information, greeting, voice, and escalation settings.",
};

export default function VoiceConfigurationPage() {
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
            <span className="gradient-text">Configuration</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Set up how your AI receptionist sounds, greets callers, and represents your business. The
            receptionist only ever speaks from this configuration and the business knowledge base — it never
            invents information.
          </p>
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <ConfigForm />
          <div className="mt-8 text-center">
            <Link href="/voice-receptionist" className="btn-secondary">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
