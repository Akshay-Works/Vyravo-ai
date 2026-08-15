import type { Metadata } from "next";
import { CallDetailView } from "@/components/voice/CallDetailView";

export const metadata: Metadata = {
  title: "Call Details",
  description: "Full AI Voice Receptionist call record — transcript, summary, qualification, actions, and integration status.",
};

export default async function VoiceCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main>
      <section className="section-padding pt-32 md:pt-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
              Voice Receptionist · Call Record
            </span>
          </div>
          <CallDetailView callId={id} />
        </div>
      </section>
    </main>
  );
}
