import type { Metadata } from "next";
import { SectionHeading } from "@/components/SectionHeading";
import { CTA } from "@/components/CTA";

export const metadata: Metadata = {
  title: "Case Studies",
  description: "Explore how Vyravo AI has transformed businesses with AI chatbots, voice agents, workflow automation, and custom AI solutions.",
};

const caseStudies = [
  {
    title: "AI Patient Engagement Platform for MedCare Hospitals",
    industry: "Healthcare",
    problem: "MedCare Hospitals struggled with high call volumes, appointment no-shows, and after-hours patient inquiries that overwhelmed their staff.",
    solution: "We deployed an AI chatbot for 24/7 patient support, an AI voice agent for appointment confirmations, and automated patient intake workflows.",
    workflow: ["Patient sends inquiry via website/WhatsApp", "AI chatbot handles FAQ and triage", "Voice agent confirms appointments", "Data syncs to hospital EHR"],
    technologies: ["GPT-4 Fine-tuned Model", "Voice AI", "WhatsApp API", "HL7 FHIR Integration"],
    timeline: "6 weeks",
    results: ["85% reduction in response time", "40% decrease in no-shows", "60% reduction in administrative workload", "Significant annual cost savings"],
    roi: "320% projected ROI in first year",
    testimonial: { name: "Dr. Rajesh Patel", role: "Director, MedCare Hospitals", quote: "The AI voice agent handles our appointment scheduling flawlessly. Patient satisfaction scores are up 40%." },
  },
  {
    title: "AI Sales Pipeline for TechVenture Capital",
    industry: "Technology / Finance",
    problem: "TechVenture Capital's sales team was spending 60% of their time on manual lead qualification and follow-ups, missing high-value opportunities.",
    solution: "We built an end-to-end AI sales automation system with intelligent lead scoring, personalized outreach sequences, and automated CRM updates.",
    workflow: ["Leads captured from multiple channels", "AI scores and qualifies leads", "Personalized email sequences triggered", "Sales team gets hot lead alerts"],
    technologies: ["Custom AI Model", "CRM Integration", "Email Automation", "Analytics Dashboard"],
    timeline: "5 weeks",
    results: ["3x increase in qualified leads", "70% faster lead response time", "45% improvement in conversion rate", "Sales team reclaimed 25 hours/week"],
    roi: "450% projected ROI in first year",
    testimonial: { name: "Sarah Chen", role: "CEO, TechVenture Capital", quote: "Vyravo AI transformed our lead qualification process. Our conversion rate improved by 3x." },
  },
  {
    title: "Workflow Automation for Global Logistics Inc.",
    industry: "Manufacturing / Logistics",
    problem: "Global Logistics was drowning in manual data entry, order processing errors, and vendor communication delays that cost them hours and revenue.",
    solution: "We automated their order processing, inventory tracking, and vendor communication workflows with intelligent AI-powered systems.",
    workflow: ["Orders received via email/portal", "AI extracts and validates data", "Inventory automatically updated", "Vendor notifications dispatched"],
    technologies: ["Document AI", "Process Automation", "API Integrations", "Real-time Dashboard"],
    timeline: "8 weeks",
    results: ["200+ hours saved per month", "95% reduction in data entry errors", "50% faster order processing", "Substantial annual cost savings"],
    roi: "280% projected ROI in first year",
    testimonial: { name: "Michael Torres", role: "COO, Global Logistics Inc.", quote: "Their workflow automation saved us 200+ hours per month. The ROI was visible within the first quarter." },
  },
  {
    title: "AI Concierge for LuxStay Hotels",
    industry: "Hospitality",
    problem: "LuxStay Hotels needed to provide consistent, multilingual guest support 24/7 while maximizing upsell opportunities during the guest journey.",
    solution: "We built a multilingual AI concierge chatbot integrated with their property management system, capable of handling 80% of guest inquiries autonomously.",
    workflow: ["Guest sends message via app/SMS", "AI identifies language and intent", "Handles request or escalates to staff", "Upsell recommendations triggered contextually"],
    technologies: ["Multilingual NLP", "PMS Integration", "SMS/WhatsApp API", "Recommendation Engine"],
    timeline: "7 weeks",
    results: ["90% guest satisfaction score", "80% of inquiries resolved by AI", "25% increase in upsell revenue", "Staff freed for high-touch interactions"],
    roi: "350% projected ROI in first year",
    testimonial: { name: "Elena Rodriguez", role: "GM, LuxStay Hotels", quote: "The AI concierge transformed our guest experience. Satisfaction scores have never been higher." },
  },
  {
    title: "Enrollment Chatbot for EduFirst Academy",
    industry: "Education",
    problem: "EduFirst Academy's enrollment team couldn't keep up with 1,000+ weekly inquiries, leading to delayed responses and lost prospective students.",
    solution: "We deployed an intelligent enrollment chatbot that handles inquiries, qualifies prospects, schedules campus tours, and automates application follow-ups.",
    workflow: ["Prospect visits website", "Chatbot engages and qualifies", "Tour scheduled automatically", "Follow-up sequence initiated"],
    technologies: ["Conversational AI", "Calendar Integration", "CRM Sync", "Analytics"],
    timeline: "4 weeks",
    results: ["60% faster enrollment processing", "35% improvement in student engagement", "1,000+ inquiries handled weekly", "Meaningful annual cost reduction"],
    roi: "250% projected ROI in first year",
    testimonial: { name: "Prof. David Kim", role: "Dean, EduFirst Academy", quote: "The enrollment chatbot handles the volume we never could manually. Our team can now focus on personal connections." },
  },
  {
    title: "AI-Powered E-commerce Assistant for ShopSmart",
    industry: "E-commerce",
    problem: "ShopSmart faced high cart abandonment rates, overwhelming support ticket volume, and missed opportunities for personalized product recommendations.",
    solution: "We built an AI shopping assistant with smart product recommendations, automated support, and proactive cart recovery via chat and email.",
    workflow: ["Customer browses products", "AI recommends based on behavior", "Abandoned cart triggers recovery", "Support handled automatically"],
    technologies: ["Recommendation AI", "Chat Integration", "Email Automation", "Behavior Analytics"],
    timeline: "5 weeks",
    results: ["35% reduction in cart abandonment", "25% increase in average order value", "80% of support tickets resolved by AI", "15% uplift in repeat purchases"],
    roi: "400% projected ROI in first year",
    testimonial: { name: "Amanda Foster", role: "Head of Digital, ShopSmart", quote: "The AI assistant feels like having a dedicated salesperson for every single customer. Results speak for themselves." },
  },
];

export default function CaseStudiesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Case Studies
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Real Solutions.{" "}
            <span className="gradient-text">Real Results.</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            See how our AI automation solutions have delivered measurable business impact across industries.
          </p>
        </div>
      </section>

      {/* Case Studies */}
      <section className="section-padding">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {caseStudies.map((cs) => (
            <article key={cs.title} className="rounded-2xl border border-border bg-surface overflow-hidden">
              {/* Header */}
              <div className="p-8 md:p-10 bg-gradient-to-r from-primary/5 to-accent/5 border-b border-border">
                <span className="text-xs font-medium text-primary uppercase tracking-wider">{cs.industry}</span>
                <h2 className="mt-2 text-xl md:text-2xl font-semibold font-[var(--font-heading)]">{cs.title}</h2>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-grey">
                  <span>Timeline: {cs.timeline}</span>
                  <span>•</span>
                  <span>ROI: {cs.roi}</span>
                </div>
              </div>

              <div className="p-8 md:p-10 space-y-8">
                {/* Problem & Solution */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">Problem</h3>
                    <p className="text-sm text-grey leading-relaxed">{cs.problem}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Solution</h3>
                    <p className="text-sm text-grey leading-relaxed">{cs.solution}</p>
                  </div>
                </div>

                {/* Workflow */}
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">AI Workflow</h3>
                  <div className="flex flex-wrap gap-2">
                    {cs.workflow.map((step, i) => (
                      <div key={step} className="flex items-center gap-2">
                        <span className="text-xs px-3 py-1.5 rounded-lg bg-bg border border-border text-grey">{step}</span>
                        {i < cs.workflow.length - 1 && <span className="text-primary">→</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tech & Results */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Technologies</h3>
                    <div className="flex flex-wrap gap-2">
                      {cs.technologies.map((t) => (
                        <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">Results</h3>
                    <ul className="space-y-1">
                      {cs.results.map((r) => (
                        <li key={r} className="flex items-center gap-2 text-sm text-grey">
                          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Testimonial */}
                <div className="rounded-xl bg-bg border border-border p-6">
                  <p className="text-sm text-grey italic leading-relaxed">&ldquo;{cs.testimonial.quote}&rdquo;</p>
                  <p className="mt-3 text-sm font-medium text-white">{cs.testimonial.name} <span className="text-grey font-normal">— {cs.testimonial.role}</span></p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <CTA
        title="Want Results Like These?"
        description="Book a free discovery call and let us show you how AI automation can transform your business."
      />
    </main>
  );
}
