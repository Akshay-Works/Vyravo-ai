"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ChatWidget } from "@/components/chat/ChatWidget";

// ============================================================================
// Demo data — ApexClean Services (fictional company for sales demonstration)
// ----------------------------------------------------------------------------
// All numbers, names, and interactions below are illustrative only. This demo
// is intentionally self-contained and does NOT talk to any external systems.
// ============================================================================

const DEMO_CUSTOMER_NAME = "Michael";
const DEMO_CUSTOMER_FULL = "Michael Carter";
const DEMO_CUSTOMER_EMAIL = "michael.carter@example.com";
const DEMO_CUSTOMER_PHONE = "+61 4XX XXX XXX";
const DEMO_LOCATION = "Richmond, VIC 3121";
const DEMO_PROPERTY = "2-bedroom apartment (~85 m²)";
const DEMO_SERVICE = "End-of-Lease Cleaning";
const DEMO_PRICE = "$420";
const DEMO_DATETIME = "Friday, 10:00 AM (AEST)";

type SectionId =
  | "intro"
  | "customer-experience"
  | "chat"
  | "qualification"
  | "appointment"
  | "crm"
  | "follow-up"
  | "notification"
  | "voice"
  | "before-after"
  | "automation-map"
  | "roi"
  | "script";

interface DemoState {
  stage: string;          // human-readable stage name
  email: string;
  phone: string;
  name: string;
  property: string;
  suburb: string;
  preferredDay: string;
  service: string;
  appointmentConfirmed: boolean;
  chatStep: number;        // 0..8
  customerJourneyStarted: boolean;
  callLog: Array<{ from: string; to: string; text: string }>;
}

const initialState: DemoState = {
  stage: "New Lead",
  email: "",
  phone: "",
  name: "",
  property: "",
  suburb: "",
  preferredDay: "",
  service: "",
  appointmentConfirmed: false,
  chatStep: 0,
  customerJourneyStarted: false,
  callLog: [],
};

// Pre-scripted realistic chat sequence for the demo
const chatScript: { from: "ai" | "customer"; text: string }[] = [
  { from: "customer", text: "Hi, I need an end-of-lease clean for a 2-bedroom apartment." },
  { from: "ai", text: "Absolutely — that's one of our specialities. What suburb is the property located in?" },
  { from: "customer", text: "Richmond." },
  { from: "ai", text: "Got it. When are you hoping to have the cleaning completed? It helps us to know the date range." },
  { from: "customer", text: "Friday — preferably morning." },
  { from: "ai", text: "Friday morning works. May I take your full name please, and an email or phone so I can send a confirmation?" },
  { from: "customer", text: `Michael Carter — ${DEMO_CUSTOMER_EMAIL}` },
  { from: "ai", text: "Perfect. I have everything needed to prepare a quote: end-of-lease cleaning, 2-bedroom apartment in Richmond, Friday morning. I can put a 2-hour slot at 10:00 AM on you — does that sound convenient?" },
  { from: "customer", text: "Yes please, confirm it." },
];

// Helper
const StatusBadge = ({ status }: { status: "LIVE" | "DEMO SIMULATION" }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
      status === "LIVE"
        ? "bg-green-500/10 text-green-400 border-green-500/30"
        : "bg-orange-500/10 text-orange-400 border-orange-500/30"
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full ${
        status === "LIVE" ? "bg-green-400 animate-pulse" : "bg-orange-400"
      }`}
    />
    {status}
  </span>
);

// Section nav for fixed sidebar / top tabs
const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "intro", label: "Overview", icon: "1" },
  { id: "customer-experience", label: "Customer Site", icon: "2" },
  { id: "chat", label: "AI Chat", icon: "3" },
  { id: "qualification", label: "Lead Qualification", icon: "4" },
  { id: "appointment", label: "Appointment", icon: "5" },
  { id: "crm", label: "CRM Update", icon: "6" },
  { id: "follow-up", label: "Email Follow-up", icon: "7" },
  { id: "notification", label: "Business Notify", icon: "8" },
  { id: "voice", label: "Voice Receptionist", icon: "9" },
  { id: "before-after", label: "Before / After", icon: "10" },
  { id: "automation-map", label: "Automation Map", icon: "11" },
  { id: "roi", label: "Impact Calculator", icon: "12" },
  { id: "script", label: "Sales Script", icon: "13" },
];

export default function DemoPage() {
  const [state, setState] = useState<DemoState>(initialState);
  const [scrollY, setScrollY] = useState(0);

  // Show floating reset notification for a moment when state resets
  const [showResetFeedback, setShowResetFeedback] = useState(false);

  // Persist state across page reloads (so salesperson doesn't lose progress if they accidentally navigate away)
  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("vyravo_demo_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(parsed);
      } catch {
        // ignore corrupted state
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("vyravo_demo_state", JSON.stringify(state));
    }
  }, [state]);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", onScroll);
      return () => window.removeEventListener("scroll", onScroll);
    }
    return;
  }, []);

  const reset = () => {
    localStorage.removeItem("vyravo_demo_state");
    setState(initialState);
    setShowResetFeedback(true);
    setTimeout(() => setShowResetFeedback(false), 2500);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const startJourney = () => {
    setState((s) => ({
      ...initialState,
      customerJourneyStarted: true,
    }));
    if (typeof window !== "undefined") {
      const el = document.getElementById("customer-experience");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const advanceChat = () => {
    setState((s) => {
      const nextStep = (s.chatStep ?? 0) + 1;
      let newState = { ...s, chatStep: nextStep };
      // Capture info progressively as the conversation advances
      const line = chatScript[nextStep - 1];
      if (line?.from === "customer") {
        const lower = line.text.toLowerCase();
        if (lower.includes("my name")) {
          const m = line.text.match(/my name is\s+([a-z\s]+?)(?:[\.\n]|$)/i);
          if (m) newState.name = m[1].trim();
        }
        if (lower.includes("richmond")) newState.suburb = "Richmond";
        if (lower.includes("friday")) newState.preferredDay = "Friday";
        if (lower.includes("2-bedroom") || lower.includes("2 bedroom")) newState.property = "2-bedroom apartment";
      }
      if (line?.from === "ai") {
        // Mark lead qualified once AI confirms understanding
        if (nextStep >= 6) {
          newState.service = DEMO_SERVICE;
          newState.property = newState.property || DEMO_PROPERTY;
          newState.suburb = newState.suburb || DEMO_LOCATION;
          newState.stage = "Qualified";
        }
      }
      // After full conversation, transition to qualification
      if (nextStep >= chatScript.length) {
        newState.customerJourneyStarted = false;
        return { ...newState, customerJourneyStarted: false, chatStep: newState.chatStep };
      }
      return newState;
    });
  };

  const bookAppointment = () => {
    setState((s) => ({ ...s, appointmentConfirmed: true, stage: "Appointment Booked" }));
    if (typeof window !== "undefined") {
      const el = document.getElementById("follow-up");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Scroll to section helper
  const navTo = (id: SectionId) => {
    if (typeof window !== "undefined") {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <main className="min-h-screen bg-bg">
      {/* Sticky demo nav */}
      <DemoNav state={state} onReset={reset} onNav={navTo} />

      {/* Demo banner */}
      <div className="pt-16">
        <div className="bg-orange-500/10 border-b border-orange-500/30 py-3 text-center">
          <p className="text-xs text-orange-300 font-medium uppercase tracking-wider px-4">
            ⚠ Demo Simulation — Nothing here is "Live". Do not claim integration status to prospects without verification.
          </p>
        </div>

        {/* Section 1: Intro */}
        <DemoIntro state={state} onStart={startJourney} />

        {/* Section 2: Customer Experience */}
        <DemoCustomerExperience state={state} onStart={startJourney} />

        {/* Section 3: AI Chat */}
        <DemoChat state={state} onAdvance={advanceChat} />

        {/* Section 4: Lead Qualification */}
        <DemoQualification state={state} onBook={bookAppointment} />

        {/* Section 5: Appointment */}
        <DemoAppointment state={state} onConfirm={bookAppointment} />

        {/* Section 6: CRM */}
        <DemoCRM state={state} />

        {/* Section 7: Email Follow-Up */}
        <DemoFollowUp state={state} />

        {/* Section 8: Internal Notification */}
        <DemoNotification state={state} />

        {/* Section 9: Voice Receptionist */}
        <DemoVoiceReceptionist state={state} />

        {/* Section 10: Before vs After */}
        <DemoBeforeAfter />

        {/* Section 11: Automation Map */}
        <DemoAutomationMap />

        {/* Section 12: Impact Calculator */}
        <DemoROICalculator />

        {/* Section 13: Sales Script */}
        <DemoSalesScript />

        {/* CTA */}
        <DemoCTA />

        {/* Floating controls bar */}
        <DemoControls onReset={reset} />

        {/* Reset feedback toast */}
        {showResetFeedback && (
          <div className="fixed bottom-24 right-6 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
            ✓ Demo reset
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// Demo Nav (sticky)
// ============================================================================
function DemoNav({ state, onReset, onNav }: { state: DemoState; onReset: () => void; onNav: (id: SectionId) => void }) {
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold tracking-tight text-white">Vyravo AI</span>
              <span className="text-xs text-grey-dark border-l border-border pl-3">Sales Demo · ApexClean Services</span>
              <StatusBadge status="DEMO SIMULATION" />
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-xs text-grey hover:text-white transition-colors px-3 py-1.5 hidden sm:inline">
                ← Website
              </Link>
              <button
                onClick={onReset}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-grey hover:text-white hover:border-primary/30 transition-colors"
              >
                Reset Demo
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Section anchor tabs */}
      <nav className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
        <div className="glass border border-border rounded-full px-1 py-2 flex flex-col gap-1">
          {SECTIONS.slice(0, 12).map((s) => (
            <button
              key={s.id}
              onClick={() => onNav(s.id)}
              className="w-7 h-7 rounded-full text-xs text-grey hover:bg-primary/10 hover:text-primary transition-colors"
              aria-label={`Jump to ${s.label}`}
              title={s.label}
            >
              {s.icon}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

// ============================================================================
// Section: Intro
// ============================================================================
function DemoIntro({ state, onStart }: { state: DemoState; onStart: () => void }) {
  return (
    <section id="intro" className="relative pt-16 pb-24 overflow-hidden">
      <div className="absolute inset-0 mesh-gradient" />
      <div className="absolute top-1/4 left-1/4 w-[40rem] h-[40rem] bg-primary/8 rounded-full blur-3xl animate-float" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            One unified AI operating system
          </h1>
          <p className="mt-4 text-base sm:text-lg text-grey-dark leading-relaxed">
            From a curious website visitor to a booked appointment, your business captured, qualified, and followed up automatically.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div className="glass border border-border rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-grey-dark mb-1">Demo Company</p>
            <p className="text-sm text-white font-medium">ApexClean Services</p>
            <p className="text-xs text-grey mt-1">Premium Home Cleaning · Melbourne, Australia</p>
          </div>
          <div className="glass border border-border rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-grey-dark mb-1">System</p>
            <p className="text-sm text-white font-medium">Vyravo AI</p>
            <p className="text-xs text-grey mt-1">Intelligent Automation for Modern Businesses</p>
          </div>
        </div>

        {/* Automation flow */}
        <div className="mt-12 glass border border-border rounded-2xl p-6 max-w-3xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-wider text-grey-dark mb-4">Automation Flow</p>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center text-center">
            {["Visitor", "AI Assistant", "Qualification", "Appointment", "CRM", "Follow-up", "Notify"].map((step, i) => (
              <div key={step} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-semibold flex items-center justify-center">
                  {i + 1}
                </div>
                <p className="mt-2 text-xs text-grey leading-tight">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Current lead status (apparent from local state) */}
        <div className="mt-8 glass border border-border rounded-2xl p-5 max-w-2xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-wider text-grey-dark mb-2">Live Lead Status (this session)</p>
          <p className="text-sm text-white font-medium">{state.stage}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
              state.stage === "New Lead" ? "text-grey-light bg-border" : "text-green-400 bg-green-500/10"
            }`}>
              New Lead
            </span>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
              state.stage === "Qualified" ? "text-green-400 bg-green-500/10" : "text-grey-light bg-border"
            }`}>
              Qualified
            </span>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
              state.appointmentConfirmed ? "text-green-400 bg-green-500/10" : "text-grey-light bg-border"
            }`}>
              Appointment Booked
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-grey-light bg-border">
              Paid
            </span>
          </div>
        </div>

        <div className="mt-12 flex flex-col sm:flex-row justify-center gap-3">
          <button
            onClick={onStart}
            className="btn-primary px-7 py-3 text-sm"
          >
            Start Customer Journey →
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined")
                document.getElementById("script")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="btn-secondary px-7 py-3 text-sm"
          >
            Go to Sales Script
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-grey-dark">
          ApexClean Services is a fictional company used to demonstrate Vyravo AI workflows.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Customer Experience
// ============================================================================
function DemoCustomerExperience({ state, onStart }: { state: DemoState; onStart: () => void }) {
  return (
    <section id="customer-experience" className="py-24 border-t border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={2} title="Customer Experience" subtitle="What the prospect sees — ApexClean Services website." />

        {/* Mock-up website */}
        <div className="relative mx-auto" style={{ maxWidth: "1000px" }}>
          <div className="rounded-2xl border border-border bg-bg overflow-hidden shadow-2xl shadow-black/30">
            {/* Mock browser chrome */}
            <div className="bg-surface border-b border-border px-3 py-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              <div className="ml-3 px-3 py-1 rounded bg-bg text-xs text-grey font-mono truncate">
                apexclean-services.example.com
              </div>
            </div>

            {/* Mock hero */}
            <div className="relative bg-bg px-8 py-16 text-center overflow-hidden">
              <div className="absolute inset-0 mesh-gradient pointer-events-none" />
              <div className="relative">
                <p className="text-xs text-primary uppercase tracking-wider font-medium mb-3">
                  Premium Home Cleaning · Melbourne
                </p>
                <h3 className="text-3xl font-semibold tracking-tight text-white font-[var(--font-heading)]">
                  Spotless homes. Happy tenants.
                </h3>
                <p className="mt-3 text-sm text-grey max-w-md mx-auto">
                  Fast, friendly & insured. End-of-lease, deep cleans and offices — Melbourne-wide.
                </p>
                <div className="mt-5 flex flex-col sm:flex-row justify-center gap-2 max-w-sm mx-auto">
                  <button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">
                    Get a Quote
                  </button>
                  <button className="border border-border text-grey hover:text-white px-4 py-2 rounded-lg text-sm">
                    Call Us
                  </button>
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="bg-surface border-t border-border px-8 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { name: "Standard Cleaning", price: "$90+" },
                  { name: "Deep Cleaning", price: "$220+" },
                  { name: "End-of-Lease", price: "$300+" },
                  { name: "Office Cleaning", price: "Quote" },
                ].map((service) => (
                  <div key={service.name} className="bg-bg border border-border rounded-lg p-3">
                    <p className="text-xs text-white font-medium">{service.name}</p>
                    <p className="text-[10px] text-primary mt-1">{service.price}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating AI widget */}
            <div className="absolute bottom-4 right-4 bg-primary/10 backdrop-blur border border-primary/30 px-3 py-2 rounded-full shadow-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary">AI Online</span>
            </div>
          </div>

          {/* Chat widget embedded */}
          <div className="absolute -bottom-12 -left-6 glass border border-border rounded-2xl p-3 shadow-xl scale-90 hidden lg:block">
            <ChatWidget />
          </div>
        </div>

        <div className="text-center mt-10">
          <p className="text-xs text-grey-dark">
            Live AI status: <StatusBadge status="DEMO SIMULATION" /> — The Sales Assistant can begin the journey via the button below.
          </p>
          <button
            onClick={onStart}
            className="btn-secondary mx-auto mt-4 px-6 py-2.5 text-sm"
          >
            Start Customer Journey at Chat →
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section: AI Chat
// ============================================================================
function DemoChat({ state, onAdvance }: { state: DemoState; onAdvance: () => void }) {
  const lines = chatScript.slice(0, Math.max(1, state.chatStep));
  const finished = state.chatStep >= chatScript.length;
  const startNew = () => {
    onAdvance();
  };

  return (
    <section id="chat" className="py-24 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel
          number={3}
          title="AI Chat — Natural Conversation"
          subtitle="The AI Assistant collects job details the way a human receptionist would."
        />

        <div className="grid lg:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
          {/* Chat panel */}
          <div className="bg-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-bg/60">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-xs text-primary font-medium">ApexClean AI Assistant</p>
              </div>
              <p className="text-[10px] text-grey-dark font-mono">{DEMO_CUSTOMER_NAME}</p>
            </div>
            <div className="px-4 py-6 space-y-3 h-96 overflow-y-auto bg-bg">
              {lines.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === "customer" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      msg.from === "customer"
                        ? "bg-primary/15 border border-primary text-grey-light"
                        : "bg-surface border border-border text-grey-light"
                    }`}
                  >
                    <p className="text-[10px] text-grey-dark mb-0.5">{msg.from === "customer" ? `Customer · ${DEMO_CUSTOMER_NAME}` : "AI Assistant"}</p>
                    <p className="leading-snug">{msg.text}</p>
                  </div>
                </div>
              ))}
              {state.chatStep === 0 && (
                <div className="text-center text-grey-dark text-xs italic py-8">
                  Click "Begin Chat" to start the conversation →
                </div>
              )}
            </div>
            <div className="border-t border-border p-3 bg-bg/40">
              {state.chatStep === 0 && (
                <button onClick={onAdvance} className="btn-primary w-full text-sm">
                  Begin Chat
                </button>
              )}
              {!finished && state.chatStep > 0 && (
                <button onClick={onAdvance} className="btn-secondary w-full text-sm">
                  Next Message →
                </button>
              )}
              {finished && (
                <div className="space-y-2">
                  <p className="text-xs text-grey-light text-center">
                    ✓ Conversation complete — captured key details.
                  </p>
                  <button
                    onClick={() =>
                      typeof window !== "undefined" &&
                      document.getElementById("qualification")?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="btn-primary w-full text-sm"
                  >
                    View Lead Qualification →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Captured info aside */}
          <div>
            <p className="text-xs text-grey-dark uppercase tracking-wider mb-2">Captured during chat</p>
            <div className="space-y-2">
              {[
                { label: "Name", value: state.name || "pending" },
                { label: "Suburb", value: state.suburb || "pending" },
                { label: "Property", value: state.property || "pending" },
                { label: "Service", value: state.service || "pending" },
                { label: "Preferred Day", value: state.preferredDay || "pending" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="text-xs text-grey">{row.label}</span>
                  <span className="text-xs text-white font-medium truncate max-w-[60%] text-right">{row.value}</span>
                </div>
              ))}
              <p className="text-[10px] text-grey-dark mt-2 italic">
                Information gradually captured as the AI responds naturally.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Lead Qualification
// ============================================================================
function DemoQualification({ state, onBook }: { state: DemoState; onBook: () => void }) {
  return (
    <section id="qualification" className="py-24 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={4} title="Lead Qualification" subtitle="The system scores the lead automatically." />

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass border border-border rounded-2xl p-6">
            <p className="text-xs text-grey-dark uppercase tracking-wider">Lead Profile</p>
            <h4 className="mt-1 text-xl font-medium text-white">{DEMO_CUSTOMER_NAME}</h4>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Status", state.stage],
                ["Service", state.service || "—"],
                ["Property", state.property || "—"],
                ["Location", state.suburb || "—"],
                ["Preferred Day", state.preferredDay || "—"],
                ["Email", state.chatStep >= 6 ? state.email || DEMO_CUSTOMER_EMAIL : "—"],
                ["Phone", state.chatStep >= 6 ? state.phone || DEMO_CUSTOMER_PHONE : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border pb-2 last:border-b-0 last:pb-0">
                  <dt className="text-grey-dark">{k}</dt>
                  <dd className="text-white text-right truncate max-w-[60%]">{v as string}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="glass border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-grey-dark uppercase tracking-wider">Qualification Score</p>
              <span className="bg-green-500/15 text-green-400 text-xs font-medium px-2 py-1 rounded-full border border-green-500/30">
                High Intent
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <p className="text-5xl font-semibold gradient-text font-[var(--font-heading)]">88</p>
              <p className="text-grey text-sm">/ 100</p>
            </div>
            <div className="mt-4 w-full h-2 bg-bg rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: "88%" }} />
            </div>
            <p className="mt-4 text-xs text-grey leading-relaxed">
              Trigger criteria met: service identified, location identified, day identified, contact info provided. The lead is qualified for an appointment.
            </p>

            <button
              onClick={onBook}
              className="btn-primary w-full mt-6 text-sm"
            >
              Offer Appointment Slot →
            </button>
            <p className="text-[10px] text-grey-dark mt-2 text-center">
              [Demo action — would trigger Calendly/booking integration in live mode]
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Appointment Booking
// ============================================================================
function DemoAppointment({ state, onConfirm }: { state: DemoState; onConfirm: () => void }) {
  const slots = ["08:00 AM", "10:00 AM (recommended)", "12:00 PM", "02:00 PM", "04:00 PM"];
  return (
    <section id="appointment" className="py-24 border-t border-border bg-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={5} title="Appointment Booking" subtitle="Customer self-selects a slot. System confirms in real-time." />

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Calendar mockup */}
          <div className="bg-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium text-white">Fri, Sept 13</p>
              <p className="text-[10px] text-grey-dark uppercase tracking-wider">Melbourne, AEST</p>
            </div>
            <div className="px-4 py-6 grid grid-cols-2 gap-2">
              {slots.map((slot, i) => (
                <button
                  key={slot}
                  className={`px-3 py-2 rounded-lg border text-xs ${
                    slot.includes("recommended")
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-grey-light hover:border-primary/40 hover:text-white"
                  }`}
                  onClick={onConfirm}
                >
                  {slot}
                </button>
              ))}
            </div>
            <p className="px-4 pb-4 text-[10px] text-grey-dark">
              Availability shown for demonstration only. In a live system this would be the real Calendly integration.
            </p>
          </div>

          {/* Confirmation */}
          <div className="space-y-4">
            <p className="text-xs text-grey-dark uppercase tracking-wider">Confirmation Output</p>
            <div className="glass border border-border rounded-2xl p-5">
              <p className="text-sm text-white leading-snug">
                <span className="gradient-text font-medium">You're booked</span> for Friday at 10:00 AM.
              </p>
              <p className="mt-2 text-xs text-grey">
                {DEMO_CUSTOMER_NAME} · {state.service} · {state.suburb}
              </p>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ["✓ Appointment confirmed", true],
                ["✓ Customer details captured", true],
                ["✓ CRM updated", "DEMO SIMULATION"],
                ["✓ Follow-up email triggered", "DEMO SIMULATION"],
              ].map(([label, status], i) => (
                <p key={i} className="flex items-center gap-2">
                  {status === true ? <span className="text-green-400">{label}</span> : (
                    <>
                      <span className="text-orange-400">{label}</span>
                      <span className="badge-orange text-[10px] text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">SIM</span>
                    </>
                  )}
                </p>
              ))}
            </div>
            <button
              className="btn-secondary w-full text-sm mt-4"
              onClick={() => typeof window !== "undefined" && document.getElementById("crm")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              View CRM Update →
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-grey-dark mt-8">
          Status: <StatusBadge status="DEMO SIMULATION" /> — Calendly/Cal.com integration is available but unused in this demo.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: CRM Update
// ============================================================================
function DemoCRM({ state }: { state: DemoState }) {
  const logs = [
    ["10:01 PM", "Website conversation started", "Orig: apexclean.com.au"],
    ["10:03 PM", "Contact identified", `Email: ${DEMO_CUSTOMER_EMAIL}`],
    ["10:04 PM", "Lead qualified", "Triggered by 5 captured fields"],
    ["10:05 PM", "Appointment booked", DEMO_DATETIME],
    ["10:05 PM", "CRM contact created", "Tagged: End-of-Lease · Richmond"],
    ["10:06 PM", "Email follow-up queued", "Template: appointment-confirmation"],
  ];

  return (
    <section id="crm" className="py-24 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={6} title="CRM Update" subtitle="Contact record created and enriched automatically." />

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Contact profile */}
          <div className="glass border border-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 text-primary font-semibold flex items-center justify-center">
                M
              </div>
              <div>
                <p className="font-medium text-white text-sm">{DEMO_CUSTOMER_NAME}</p>
                <p className="text-xs text-grey">ApexClean Services Demo</p>
              </div>
            </div>
            <dl className="space-y-2 text-xs">
              {[
                ["Email", DEMO_CUSTOMER_EMAIL],
                ["Phone", DEMO_CUSTOMER_PHONE],
                ["Service", state.service],
                ["Property", state.property],
                ["Location", state.suburb],
                ["Appointment", state.appointmentConfirmed ? DEMO_DATETIME : "Not yet"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border pb-1.5 last:border-b-0 last:pb-0">
                  <dt className="text-grey-dark">{k}</dt>
                  <dd className="text-white text-right truncate max-w-[60%]">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Pipeline + timeline */}
          <div className="space-y-4">
            <div className="glass border border-border rounded-2xl p-5">
              <p className="text-xs text-grey-dark uppercase tracking-wider mb-3">Pipeline</p>
              <div className="flex items-center gap-1 text-[10px]">
                {["New Lead", "Qualified", "Booked"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded ${
                      (i === 0 && state.stage === "New Lead") ||
                      (i === 1 && state.stage === "Qualified") ||
                      (i === 2 && state.appointmentConfirmed)
                        ? "bg-green-500/15 text-green-400 border border-green-500/30"
                        : "bg-bg border border-border text-grey"
                    }`}>
                      {step}
                    </span>
                    {i < 2 && <span className="text-grey">→</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass border border-border rounded-2xl p-5">
              <p className="text-xs text-grey-dark uppercase tracking-wider mb-3">Activity Timeline</p>
              <ul className="space-y-2">
                {logs.map(([time, text, sub], i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-xs font-mono text-grey-dark pt-0.5 shrink-0">{time}</span>
                    <div>
                      <p className="text-xs text-white">{text}</p>
                      <p className="text-[10px] text-grey-dark">{sub}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-grey-dark mt-6">
          Status: <StatusBadge status="DEMO SIMULATION" /> — HubSpot wiring is available but disabled here so multiple demos don't pollute the CRM.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Email Follow-up
// ============================================================================
function DemoFollowUp({ state }: { state: DemoState }) {
  return (
    <section id="follow-up" className="py-24 border-t border-border bg-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={7} title="Email Follow-Up" subtitle="Confirmation + reminder rules — simulated preview here." />

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Trigger rules */}
          <div className="glass border border-border rounded-2xl p-5">
            <p className="text-xs text-grey-dark uppercase tracking-wider mb-3">Follow-Up Rules</p>
            <ul className="space-y-3 text-xs">
              <li className="bg-bg border border-border rounded-lg p-3">
                <p className="text-white font-medium mb-1">On appointment booked</p>
                <p className="text-grey">→ Confirmation email sent immediately</p>
              </li>
              <li className="bg-bg border border-border rounded-lg p-3">
                <p className="text-white font-medium mb-1">24 hours before appointment</p>
                <p className="text-grey">→ Reminder email with job details</p>
              </li>
              <li className="bg-bg border border-border rounded-lg p-3">
                <p className="text-white font-medium mb-1">If lead doesn't book after 24 h</p>
                <p className="text-grey">→ Follow-up email with quote</p>
              </li>
              <li className="bg-bg border border-border rounded-lg p-3">
                <p className="text-white font-medium mb-1">After job complete</p>
                <p className="text-grey">→ Review request + referral ask</p>
              </li>
            </ul>
          </div>

          {/* Email preview */}
          <div className="bg-bg border border-border rounded-2xl p-5">
            <p className="text-xs text-grey-dark uppercase tracking-wider mb-3">Email Preview</p>
            <p className="text-xs text-grey-dark">To: {DEMO_CUSTOMER_EMAIL}</p>
            <p className="text-xs text-grey-dark">Subject: <span className="text-white">Your ApexClean appointment is confirmed</span></p>
            <hr className="border-border my-3" />
            <p className="text-sm text-white">Hi {DEMO_CUSTOMER_NAME.split(" ")[0]},</p>
            <p className="text-sm text-grey mt-2">
              You're booked for <strong className="text-white">{DEMO_SERVICE}</strong> at <strong className="text-white">{DEMO_DATETIME}</strong>.
            </p>
            <p className="text-sm text-grey mt-2">
              <strong className="text-white">Address:</strong> {DEMO_LOCATION}<br />
              <strong className="text-white">Property:</strong> {DEMO_PROPERTY}
            </p>
            <p className="text-sm text-grey mt-2">
              <strong className="text-white">Estimated total:</strong> {DEMO_PRICE} (final quote will be confirmed by your specialist on the day)
            </p>
            <p className="text-sm text-grey mt-3">
              Reply to this email with any changes. See you Friday!
            </p>
            <p className="text-sm text-grey-light mt-3">— ApexClean Services</p>
          </div>
        </div>

        <p className="text-center text-xs text-grey-dark mt-8">
          Status: <span className="text-orange-400">⚠ DEMO SIMULATION</span> — Resend wiring is available but the email shown is a preview only.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Internal Notification
// ============================================================================
function DemoNotification({ state }: { state: DemoState }) {
  return (
    <section id="notification" className="py-24 border-t border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={8} title="Internal Notification" subtitle="The business owner gets an alert — instantly." />

        <div className="glass border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-lg">
              🔔
            </div>
            <div>
              <p className="text-sm text-white font-medium">New qualified lead</p>
              <p className="text-xs text-grey-dark">ApexClean Services · Owner notification</p>
            </div>
            <span className="ml-auto text-[10px] text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded bg-orange-500/10">
              SIM preview
            </span>
          </div>
          <div className="border-t border-border pt-4 text-xs text-grey space-y-1.5">
            <p><span className="text-grey-dark">Customer:</span> {DEMO_CUSTOMER_FULL}</p>
            <p><span className="text-grey-dark">Requested:</span> {DEMO_SERVICE}</p>
            <p><span className="text-grey-dark">Property:</span> {DEMO_PROPERTY}</p>
            <p><span className="text-grey-dark">Location:</span> {DEMO_LOCATION}</p>
            <p><span className="text-grey-dark">Appointment:</span> {DEMO_DATETIME}</p>
            <p><span className="text-grey-dark">Lead status:</span> Qualified · High intent</p>
          </div>
          <p className="mt-4 text-[10px] text-grey-dark">
            Owner alert arrives via Notification, SMS, Email, and Slack depending on rules.
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Voice Receptionist
// ============================================================================
function DemoVoiceReceptionist(_: { state: DemoState }) {
  const transcript = [
    { from: "voicely", text: "Thanks for calling ApexClean Services. How can I help you today?" },
    { from: "customer", text: "Hi, I need an end-of-lease clean for next Friday." },
    { from: "voicely", text: "Absolutely. What suburb is the property in?" },
    { from: "customer", text: "Richmond. It's a two-bedroom apartment." },
    { from: "voicely", text: "Got it. May I take your name for the booking?" },
    { from: "customer", text: "Michael Carter." },
    { from: "voicely", text: "Perfect. I have 08:00 AM or 10:00 AM available Friday — which works?" },
    { from: "customer", text: "10:00 AM is fine." },
    { from: "voicely", text: "Booked. You'll get a confirmation by email. Anything else?" },
    { from: "customer", text: "No, that's all." },
    { from: "voicely", text: "Thanks Michael. Talk Friday." },
  ];

  return (
    <section id="voice" className="py-24 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={9} title="AI Voice Receptionist" subtitle="Calls handled the same way — 24/7." />

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Call visual */}
          <div className="bg-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-xs text-primary font-medium">Inbound Call · 10:14 PM</p>
              </div>
              <span className="text-[10px] text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded bg-orange-500/10">SIM</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-surface border border-border rounded-2xl p-3 max-w-[80%]">
                <p className="text-[10px] text-grey-dark">Voicely (ApexClean)</p>
                <p className="text-sm text-white leading-relaxed">
                  {transcript[0].text}
                </p>
              </div>
            </div>
          </div>

          {/* Transcript */}
          <div className="bg-bg border border-border rounded-2xl p-4 max-h-96 overflow-y-auto">
            <p className="text-xs text-grey-dark uppercase tracking-wider mb-3 sticky top-0 bg-bg pb-2">Call Transcript</p>
            <div className="space-y-3">
              {transcript.slice(1).map((line, i) => (
                <div key={i} className={`flex ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%]">
                    <p className="text-[10px] text-grey-dark mb-0.5">
                      {line.from === "customer" ? `Caller · ${DEMO_CUSTOMER_NAME}` : "Voicely (Voicely)"}
                    </p>
                    <p className={`text-xs rounded-lg px-2 py-1 inline-block ${
                      line.from === "customer" ? "bg-primary/15 border border-primary" : "bg-surface border border-border"
                    } text-grey-light`}>
                      {line.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-grey-dark mt-8">
          Status: <span className="text-orange-400">⚠ DEMO SIMULATION</span> — Voicely / Voice API providers can be wired but are off in this demo.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Before vs After
// ============================================================================
function DemoBeforeAfter() {
  const beforeAfter = [
    ["Missed calls after hours", "24/7 response"],
    ["Slow manual responses", "Instant + intelligent"],
    ["Manual lead entry into CRM", "Auto-captured + enriched"],
    ["Prospects forgotten for days", "Automated follow-ups"],
    ["Staff handling repetitive Qs", "AI handles 80%+"],
    ["Inconsistent qualifying", "AI-graded"],
    ["Manual bookings", "AI self-books"],
    ["Owner glued to inbox", "Owner gets alerts only"],
  ];

  return (
    <section id="before-after" className="py-24 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={10} title="Before vs After Vyravo AI" subtitle="All outcomes are conceptual — no figures invented." />

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass border border-border rounded-2xl p-6">
            <p className="text-xs uppercase tracking-wider text-grey-dark mb-4">Before AI</p>
            <ul className="space-y-3">
              {beforeAfter.map(([before], i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-grey">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
                  {before}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass border border-border rounded-2xl p-6">
            <p className="text-xs uppercase tracking-wider text-primary mb-4">With Vyravo AI</p>
            <ul className="space-y-3">
              {beforeAfter.map(([_, after], i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {after}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-grey-dark mt-8">
          Comparison is qualitative. Individual outcomes depend on the specific business and setup.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: Automation Map
// ============================================================================
function DemoAutomationMap() {
  const stages = [
    { title: "Customer", desc: "Website visitor OR phone caller" },
    { title: "AI Intake", desc: "AI Assistant or Voice Receptionist engages" },
    { title: "Qualification", desc: "Captures intent, info, urgency" },
    { title: "Lead Capture", desc: "Logged to CRM + tagged" },
    { title: "Booking", desc: "Self-selects slot; calendar integrated" },
    { title: "Email", desc: "Auto confirmation + reminders" },
    { title: "Owner Notify", desc: "Push / SMS / email / Slack" },
  ];

  return (
    <section id="automation-map" className="py-24 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={11} title="Automation Map" subtitle="Each stage hands off to the next automatically." />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
          {stages.map((s, i) => (
            <div key={s.title} className="glass border border-border rounded-2xl p-4">
              <p className="text-[10px] text-grey-dark uppercase tracking-wider mb-1">
                Stage {i + 1}
              </p>
              <p className="text-base text-white font-medium">{s.title}</p>
              <p className="text-xs text-grey mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-grey-dark mt-8">
          All stages are configurable. Each step can route to any connected system.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Section: ROI Calculator (illustrative only)
// ============================================================================
function DemoROICalculator() {
  const [leads, setLeads] = useState(50);
  const [apv, setApv] = useState(420);
  const [conv, setConv] = useState(30);
  const [missed, setMissed] = useState(10);
  const [hours, setHours] = useState(20);

  const conversions = Math.round((leads * conv) / 100);
  const customerValue = conversions * apv;

  const hoursSaved = Math.round(hours * 0.8);
  const hourValue = 35;
  const costSaved = hoursSaved * hourValue;

  return (
    <section id="roi" className="py-24 border-t border-border">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={12} title="Potential Business Impact Calculator" subtitle="Illustrative only — actual results depend on your specific business." />

        <div className="grid md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-3">
            <ROInput label="Monthly leads" value={leads} onChange={setLeads} />
            <ROInput label="Average customer value (AUD)" value={apv} onChange={setApv} />
            <ROInput label="Current conversion rate (%)" value={conv} onChange={setConv} />
            <ROInput label="Calls/leads missed per month" value={missed} onChange={setMissed} />
            <ROInput label="Staff hours on repetitive tasks" value={hours} onChange={setHours} />
          </div>

          {/* Outputs */}
          <div className="glass border border-border rounded-2xl p-6 space-y-4">
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Monthly Conversions</p>
              <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">{conversions}</p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Monthly Customer Value</p>
              <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">
                ${customerValue.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Captured Missed Leads</p>
              <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">+{missed}/month</p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Staff Hours Freed</p>
              <p className="text-3xl font-semibold gradient-text font-[var(--font-heading)]">{hoursSaved}h/month</p>
              <p className="text-xs text-grey mt-1">≈ ${costSaved.toLocaleString()} in recovered staff time</p>
            </div>
            <p className="text-[10px] text-grey-dark italic">
              Illustrative estimate — actual results vary.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ROInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2">
      <label className="text-xs text-grey-dark">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-transparent text-right text-white text-sm outline-none border-b border-border focus:border-primary"
      />
    </div>
  );
}

// ============================================================================
// Section: Sales Script
// ============================================================================
function DemoSalesScript() {
  const script = [
    { phase: "Problem (30 s)", seconds: 30, dialogue: ["Today I'd like to walk you through how a small business owner captures and converts leads without being glued to a screen — end to end.", "Tell me: when a prospect contacts you after hours, does anyone reply?"] },
    { phase: "Experience (3–4 min)", seconds: 240, dialogue: ["Let me show you what an end-to-end event actually feels like.", "Here is what a prospect sees when they land on your site → the AI Assistant kicks in → captures their details → books a slot. (demo each phase)", "I'll speed up the chat — the critical thing is that the prospect feels like they're texting a real person."] },
    { phase: "Automation (2 min)", seconds: 120, dialogue: ["While that was happening: the lead went into the CRM, a follow-up email queued itself, the owner got an alert — all without anyone clicking 'save'.", "Every step is a workflow rule, not a manual task."] },
    { phase: "Business impact (2 min)", seconds: 120, dialogue: ["What does this free up? Your first-line team stops answering the same 8 questions a day, your AI handles after-hours inquiries, conversion happens while you sleep."] },
    { phase: "Customisation", seconds: 60, dialogue: ["Note: every step shown here is configurable. The same workflow can run with Calendly, HubSpot, Resend, OpenAI, n8n — or none of them. We work with what you already have."] },
    { phase: "Transition to discovery", seconds: 30, dialogue: ["So before I dive deeper — three quick questions:", "1. What happens when a lead contacts you after business hours?", "2. How are leads currently captured?", "3. Where do they usually get lost?", "Let me show you what that would look like in your business."] },
  ];

  return (
    <section id="script" className="py-24 border-t border-border bg-surface">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionLabel number={13} title="Salesperson Script" subtitle="A 5–10 minute guided walkthrough." />
        <ol className="space-y-4">
          {script.map((s, i) => (
            <li key={i} className="bg-bg border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-primary font-medium">Phase {i + 1} · {s.phase}</p>
                <p className="text-[10px] text-grey-dark">~{Math.round(s.seconds / 60)} min</p>
              </div>
              <div className="space-y-2">
                {s.dialogue.map((line, j) => (
                  <p key={j} className="text-sm text-grey-light leading-snug">
                    <span className="text-grey-dark text-xs mr-1">›</span> {line}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 glass border border-border rounded-2xl p-5">
          <p className="text-xs text-grey-dark uppercase tracking-wider mb-2">Transition</p>
          <p className="text-sm text-white">
            "Based on what you've just seen — your lead follow-up, after-hours calls, and booking process all look like they could be automated. Let me show you what an implementation plan for <em>your</em> business would look like."
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CTA after the demo
// ============================================================================
function DemoCTA() {
  return (
    <section className="py-24 text-center">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight font-[var(--font-heading)]">
          Let's map this to your business.
        </h2>
        <p className="mt-4 text-grey">
          Free 30-minute discovery call. Bring your process; we bring the workflow.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
          <Link href="/contact" className="btn-primary px-7 py-3 text-sm">Book a Discovery Call</Link>
          <Link href="/" className="btn-secondary px-7 py-3 text-sm">Back to Website</Link>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Floating controls
// ============================================================================
function DemoControls({ onReset }: { onReset: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
      <button
        onClick={onReset}
        title="Reset demo to the initial state"
        className="w-12 h-12 rounded-full bg-surface border border-border hover:border-primary/40 text-grey hover:text-primary transition-colors shadow-lg"
      >
        ↺
      </button>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function SectionLabel({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 text-primary font-semibold flex items-center justify-center text-sm">
          {number}
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight font-[var(--font-heading)]">{title}</h2>
          {subtitle && <p className="text-sm text-grey-dark mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
