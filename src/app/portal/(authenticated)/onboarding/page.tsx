"use client";

export default function PortalOnboardingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Onboarding</span></h1>
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-5xl mb-4">🚀</p>
        <p className="text-lg">Your onboarding checklist will appear here once initiated.</p>
        <p className="text-sm text-grey mt-2">After proposal acceptance, Vyravo AI will set everything up for you.</p>
      </div>
    </div>
  );
}
