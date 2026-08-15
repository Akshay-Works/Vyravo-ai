import type { Metadata } from "next";
import { CTA } from "@/components/CTA";
import { Accordion } from "@/components/Accordion";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about Vyravo AI services, pricing, AI chatbots, workflow automation, voice agents, security, and support.",
};

const faqCategories = [
  {
    category: "General",
    faqs: [
      { question: "What is Vyravo AI?", answer: "Vyravo AI is a premium AI automation company that helps businesses automate repetitive work using AI chatbots, voice agents, workflow automation, sales automation, and custom AI solutions." },
      { question: "What industries do you serve?", answer: "We serve businesses across healthcare, restaurants, real estate, hotels & hospitality, finance, manufacturing, education, marketing agencies, professional services, e-commerce, and more." },
      { question: "Where is Vyravo AI based?", answer: "We are based in India and serve clients worldwide. We accommodate different time zones for meetings and support." },
      { question: "How is Vyravo AI different from other AI agencies?", answer: "We focus on measurable business outcomes rather than just technology delivery. Every project is custom-built with transparent pricing, dedicated support, and continuous optimization." },
      { question: "Do you work with startups or only enterprises?", answer: "We work with businesses of all sizes — startups, SMEs, and enterprises. Our solutions are designed to scale with your business as it grows." },
    ],
  },
  {
    category: "Pricing & Payments",
    faqs: [
      { question: "How much do your services cost?", answer: "Pricing is customized based on your business requirements, workflows, integrations, and implementation complexity — we don't use one-size-fits-all packages. Book a free discovery call and we'll assess your needs and provide a tailored proposal." },
      { question: "Why is pricing customized?", answer: "AI solutions vary significantly in complexity, integrations, and scope. Custom pricing ensures you pay for exactly what you need — no generic packages or hidden fees." },
      { question: "Do you offer payment plans?", answer: "Yes. For larger projects, we typically structure payments across milestones: 40% upfront, 30% at midpoint, and 30% upon delivery." },
      { question: "Are there any hidden fees?", answer: "No. We provide a detailed, transparent quote before starting any project. You'll know exactly what you're paying for from day one." },
      { question: "Do you offer discounts for startups?", answer: "Yes. We offer flexible pricing for early-stage startups. Discuss your budget during the discovery call and we'll find a solution that works." },
    ],
  },
  {
    category: "AI Chatbots",
    faqs: [
      { question: "What can your AI chatbots do?", answer: "Our AI chatbots handle customer support, lead qualification, appointment scheduling, FAQ responses, product recommendations, order tracking, and more — 24/7 across all channels." },
      { question: "Which platforms do your chatbots support?", answer: "We deploy chatbots on websites, WhatsApp, Facebook Messenger, Slack, Microsoft Teams, SMS, and custom platforms via API." },
      { question: "Can chatbots be trained on our company data?", answer: "Absolutely. We train chatbots on your company knowledge base, products, services, and policies to provide accurate, context-aware responses." },
      { question: "Do chatbots support multiple languages?", answer: "Yes. Our AI chatbots support multi-language conversations, making them ideal for businesses with international customers." },
      { question: "How accurate are the chatbot responses?", answer: "With proper training on your data, our chatbots achieve 90%+ accuracy. We continuously monitor and optimize performance post-launch." },
    ],
  },
  {
    category: "Workflow Automation",
    faqs: [
      { question: "What processes can be automated?", answer: "We automate data entry, document processing, email workflows, report generation, inventory management, order processing, compliance checks, and any repetitive business process." },
      { question: "Can you integrate with our existing tools?", answer: "Yes. We integrate with popular CRMs (Salesforce, HubSpot), ERPs, communication platforms (Slack, Teams), and custom APIs." },
      { question: "How much time can automation save?", answer: "Our clients typically save 200+ hours per month by automating manual processes. The exact savings depend on the volume and complexity of your workflows." },
      { question: "Is there a risk of errors with automation?", answer: "Automation significantly reduces human error. Our systems include validation checks and exception handling to ensure accuracy and reliability." },
    ],
  },
  {
    category: "AI Voice Agents",
    faqs: [
      { question: "What can AI voice agents do?", answer: "AI voice agents handle inbound and outbound calls, appointment scheduling, customer inquiries, order confirmations, surveys, and more — with natural-sounding conversations." },
      { question: "Do voice agents sound robotic?", answer: "No. We use advanced text-to-speech technology that produces natural, human-like voice interactions. Callers often can't tell they're speaking with AI." },
      { question: "Can voice agents transfer calls to human agents?", answer: "Yes. Voice agents can intelligently escalate complex inquiries to human agents based on predefined rules and conversation context." },
      { question: "What languages do voice agents support?", answer: "We support multiple languages and can configure voice agents for specific regional accents and dialects." },
    ],
  },
  {
    category: "Security & Compliance",
    faqs: [
      { question: "Is my data secure?", answer: "Yes. We follow enterprise-grade security practices including encryption at rest and in transit, access controls, regular audits, and secure cloud infrastructure." },
      { question: "Are you GDPR compliant?", answer: "Yes. We design all solutions with GDPR compliance in mind, including data minimization, consent management, and right to deletion." },
      { question: "Do you sign NDAs?", answer: "Absolutely. We're happy to sign NDAs and confidentiality agreements before discussing any sensitive business information." },
      { question: "Where is data stored?", answer: "Data is stored on secure cloud infrastructure with industry-standard encryption. We can accommodate specific data residency requirements upon request." },
    ],
  },
  {
    category: "Integrations",
    faqs: [
      { question: "What systems can you integrate with?", answer: "We integrate with CRMs (Salesforce, HubSpot), ERPs, communication platforms (Slack, Teams, WhatsApp), payment systems (Stripe), analytics tools, and custom APIs." },
      { question: "Can you build custom API integrations?", answer: "Yes. Our team can build custom API integrations to connect your AI solution with any system that has an API." },
      { question: "Do integrations require changes to our existing systems?", answer: "In most cases, no. Our solutions integrate via APIs and webhooks without requiring modifications to your existing infrastructure." },
    ],
  },
  {
    category: "Support & Maintenance",
    faqs: [
      { question: "What support do you offer after launch?", answer: "All projects include 30 days of complimentary post-launch support. We also offer ongoing maintenance packages for monitoring, updates, and optimization." },
      { question: "How do you handle bugs or issues?", answer: "We provide prompt bug fixes during the support period. Critical issues are addressed within 4 hours, and standard issues within 24 hours." },
      { question: "Can you update the AI model over time?", answer: "Yes. We offer ongoing optimization packages that include model retraining, performance improvements, and feature additions based on usage data." },
    ],
  },
  {
    category: "Development & Timeline",
    faqs: [
      { question: "How long does a typical project take?", answer: "Simple chatbots can be deployed in 2-3 weeks. Complex workflow automation or custom AI solutions typically take 4-8 weeks. We provide a detailed timeline during the proposal stage." },
      { question: "What is your development process?", answer: "We follow a 4-step process: Discovery Call → Strategy & Proposal → Build & Iterate → Launch & Optimize. You're involved at every stage with weekly demos and feedback sessions." },
      { question: "Will I have access to the source code?", answer: "Yes. You receive full ownership of the source code and intellectual property for your custom solution." },
      { question: "Can I request changes during development?", answer: "Absolutely. We use an agile approach with weekly demos and feedback sessions. Changes within the agreed scope are always welcome." },
    ],
  },
  {
    category: "Discovery Calls",
    faqs: [
      { question: "What happens during a discovery call?", answer: "During the 30-minute call, we discuss your business challenges, explore AI automation opportunities, identify the best solution, and outline next steps." },
      { question: "Is the discovery call free?", answer: "Yes, the discovery call is completely free with no obligations. It's our way of understanding your needs before proposing a solution." },
      { question: "How do I prepare for the call?", answer: "Think about your biggest operational challenges, repetitive tasks you'd like to automate, and any specific goals you want to achieve with AI automation." },
      { question: "What happens after the discovery call?", answer: "Within 48 hours, you'll receive a detailed proposal including recommended solution, timeline, investment breakdown, and expected ROI." },
    ],
  },
];

export default function FAQPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative section-padding pt-32 md:pt-40">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            FAQ
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
            Frequently Asked{" "}
            <span className="gradient-text">Questions</span>
          </h1>
          <p className="mt-6 text-lg text-grey max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about our AI automation services, pricing, process, and support.
          </p>
        </div>
      </section>

      {/* FAQ Categories */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {faqCategories.map((cat) => (
            <div key={cat.category}>
              <h2 className="text-2xl font-semibold font-[var(--font-heading)] mb-6">{cat.category}</h2>
              <Accordion items={cat.faqs} />
            </div>
          ))}
        </div>
      </section>

      <CTA
        title="Still Have Questions?"
        description="Book a free discovery call or send us a message and we'll answer all your questions personally."
        secondaryText="Contact Us"
        secondaryHref="/contact"
      />
    </main>
  );
}
