import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { CTA } from "@/components/CTA";

export const metadata: Metadata = {
  title: "Industries",
  description: "Vyravo AI serves healthcare, restaurants, real estate, hotels, finance, manufacturing, education, marketing agencies, e-commerce and more.",
};

const industriesData = [
  {
    name: "Healthcare",
    icon: "🏥",
    challenges: ["Patient engagement delays", "Appointment no-shows", "Administrative overload", "After-hours inquiries"],
    opportunities: ["24/7 patient chatbot support", "Automated appointment scheduling", "AI triage assistance", "Claims processing automation"],
    services: ["AI Chatbots", "AI Voice Agents", "Workflow Automation"],
    examples: ["Patient FAQ chatbot reducing call volume by 60%", "Voice agent handling appointment confirmations", "Automated patient intake forms"],
    impact: "85% reduction in response time, 40% fewer no-shows",
  },
  {
    name: "Restaurants",
    icon: "🍽️",
    challenges: ["High call volume for reservations", "Order errors", "Staff shortages", "Customer feedback management"],
    opportunities: ["AI reservation system", "Automated order processing", "Customer loyalty chatbot", "Review management automation"],
    services: ["AI Chatbots", "AI Voice Agents", "Workflow Automation"],
    examples: ["Reservation chatbot handling 500+ bookings/month", "Voice agent for takeout orders", "Automated review response system"],
    impact: "50% reduction in missed reservations, 30% increase in repeat orders",
  },
  {
    name: "Real Estate",
    icon: "🏢",
    challenges: ["Slow lead follow-up", "Property matching complexity", "Documentation overhead", "Client communication gaps"],
    opportunities: ["AI lead qualification", "Property recommendation engine", "Automated follow-up sequences", "Document automation"],
    services: ["AI Chatbots", "AI Sales Automation", "Workflow Automation"],
    examples: ["Lead qualification bot converting 3x more prospects", "Automated property matching based on buyer preferences", "Contract automation workflow"],
    impact: "3x improvement in lead conversion, 70% faster response to inquiries",
  },
  {
    name: "Hotels & Hospitality",
    icon: "🏨",
    challenges: ["Guest experience inconsistency", "Booking management complexity", "Multilingual support needs", "Upsell opportunities missed"],
    opportunities: ["AI concierge chatbot", "Smart booking management", "Multilingual voice agents", "Personalized upsell recommendations"],
    services: ["AI Chatbots", "AI Voice Agents", "Custom AI Solutions"],
    examples: ["AI concierge handling 80% of guest inquiries", "Voice agent for room service and concierge", "Automated guest feedback collection"],
    impact: "90% guest satisfaction, 25% increase in upsell revenue",
  },
  {
    name: "Finance",
    icon: "💰",
    challenges: ["Regulatory compliance burden", "Risk assessment complexity", "Customer onboarding friction", "Fraud detection needs"],
    opportunities: ["Automated compliance checking", "AI risk assessment", "Digital onboarding chatbot", "Fraud pattern detection"],
    services: ["AI Chatbots", "Workflow Automation", "Custom AI Solutions"],
    examples: ["KYC automation reducing onboarding time by 80%", "Compliance monitoring dashboard", "AI-powered fraud alert system"],
    impact: "80% faster onboarding, 95% compliance accuracy",
  },
  {
    name: "Manufacturing",
    icon: "🏭",
    challenges: ["Quality control inconsistency", "Supply chain disruptions", "Predictive maintenance needs", "Vendor communication gaps"],
    opportunities: ["AI quality inspection", "Supply chain optimization", "Predictive maintenance alerts", "Automated vendor workflows"],
    services: ["Workflow Automation", "Custom AI Solutions", "AI Consulting"],
    examples: ["Computer vision quality control system", "Supply chain demand forecasting", "Automated maintenance scheduling"],
    impact: "40% reduction in defects, 200+ hours saved per month",
  },
  {
    name: "Education",
    icon: "🎓",
    challenges: ["Student engagement drops", "Enrollment process friction", "Administrative burden", "Personalized learning needs"],
    opportunities: ["AI tutoring assistant", "Enrollment chatbot", "Administrative automation", "Learning path personalization"],
    services: ["AI Chatbots", "Workflow Automation", "Custom AI Solutions"],
    examples: ["Enrollment chatbot handling 1,000+ inquiries/week", "Automated grading and feedback system", "AI-powered student support"],
    impact: "60% faster enrollment processing, 35% improvement in engagement",
  },
  {
    name: "Marketing Agencies",
    icon: "📊",
    challenges: ["Content production bottlenecks", "Campaign reporting overhead", "Client communication gaps", "Lead generation scaling"],
    opportunities: ["AI content generation", "Automated reporting dashboards", "Client communication chatbot", "AI-powered lead generation"],
    services: ["AI Chatbots", "AI Sales Automation", "Workflow Automation"],
    examples: ["Content calendar automation", "Automated client performance reports", "AI lead scoring and nurturing"],
    impact: "50% faster content production, 3x more qualified leads",
  },
  {
    name: "Professional Services",
    icon: "💼",
    challenges: ["Client intake delays", "Document management complexity", "Scheduling conflicts", "Billing automation needs"],
    opportunities: ["AI client intake system", "Document automation", "Smart scheduling assistant", "Automated invoicing"],
    services: ["AI Chatbots", "Workflow Automation", "AI Voice Agents"],
    examples: ["Client intake chatbot qualifying prospects 24/7", "Automated document generation", "AI scheduling assistant"],
    impact: "70% reduction in administrative time, 45% faster client onboarding",
  },
  {
    name: "E-commerce",
    icon: "🛒",
    challenges: ["Cart abandonment", "Customer support volume", "Product discovery friction", "Order management complexity"],
    opportunities: ["AI shopping assistant", "Automated customer support", "Product recommendation engine", "Order tracking automation"],
    services: ["AI Chatbots", "AI Sales Automation", "Custom AI Solutions"],
    examples: ["Shopping assistant reducing cart abandonment by 35%", "AI customer support handling 80% of tickets", "Personalized product recommendations"],
    impact: "35% reduction in cart abandonment, 25% increase in average order value",
  },
];

export default function IndustriesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Industries
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            AI Automation for{" "}
            <span className="gradient-text">Every Industry</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Discover how our AI solutions address the unique challenges and opportunities in your industry.
          </p>
        </div>
      </section>

      {/* Industry Sections */}
      <section className="section-padding">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          {industriesData.map((ind, i) => (
            <div key={ind.name} className="rounded-2xl border border-border bg-surface p-8 md:p-12" id={ind.name.toLowerCase().replace(/\s+/g, "-")}>
              <div className="flex items-center gap-4 mb-8">
                <span className="text-4xl">{ind.icon}</span>
                <h2 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">{ind.name}</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Challenges */}
                <div>
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Challenges</h3>
                  <ul className="space-y-2">
                    {ind.challenges.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm text-grey">
                        <span className="text-red-400 mt-0.5">•</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Opportunities */}
                <div>
                  <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">AI Opportunities</h3>
                  <ul className="space-y-2">
                    {ind.opportunities.map((o) => (
                      <li key={o} className="flex items-start gap-2 text-sm text-grey">
                        <span className="text-accent mt-0.5">•</span>{o}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Automation Examples */}
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Examples</h3>
                  <ul className="space-y-2">
                    {ind.examples.map((e) => (
                      <li key={e} className="flex items-start gap-2 text-sm text-grey">
                        <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Impact & Services */}
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Services</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {ind.services.map((s) => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{s}</span>
                    ))}
                  </div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-2 mt-4">Business Impact</h3>
                  <p className="text-sm text-accent font-medium">{ind.impact}</p>
                  <Link href="/book-discovery-call" className="btn-primary text-xs mt-4 py-2 px-4">
                    Get Started →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CTA
        title="Don't See Your Industry?"
        description="We work with businesses across all sectors. Book a discovery call and we'll show you how AI automation can transform your specific industry."
      />
    </main>
  );
}
