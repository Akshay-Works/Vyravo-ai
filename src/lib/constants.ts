export const COMPANY = {
  name: "Vyravo AI",
  tagline: "Intelligent Automation for Modern Businesses.",
  phone: "+91 9075707650",
  phoneLink: "tel:+919075707650",
  email: "akshay.navale.work@gmail.com",
  emailLink: "mailto:akshay.navale.work@gmail.com",
  linkedin: "https://www.linkedin.com/in/akshay-n-2692851b7",
  location: "India",
  hours: "Mon – Fri, 9:00 AM – 6:00 PM IST",
};

export const SITE_LINKS = {
  mainSite: "https://vyravo-ai.vercel.app",
  emailAutomation: "https://vyravo-ai-email-automation-yf54.vercel.app",
};

export const NAV_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Industries", href: "/industries" },
  { label: "Case Studies", href: "/case-studies" },
  { label: "Email Automation", href: SITE_LINKS.emailAutomation, external: true },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export const SERVICES = [
  {
    title: "AI Chatbots",
    slug: "ai-chatbots",
    description: "Intelligent conversational agents that handle customer queries 24/7, qualify leads, and deliver instant support across all channels.",
    icon: "chatbot",
    features: ["24/7 Customer Support", "Lead Qualification", "Multi-language", "Omnichannel"],
    startingPrice: "$2,500",
  },
  {
    title: "AI Workflow Automation",
    slug: "ai-workflow-automation",
    description: "End-to-end automation of repetitive business processes, from data entry to complex multi-step workflows.",
    icon: "workflow",
    features: ["Process Automation", "Data Pipeline", "Error Reduction", "Scalable"],
    startingPrice: "$3,000",
  },
  {
    title: "AI Voice Agents",
    slug: "ai-voice-agents",
    description: "Natural-sounding AI voice assistants that handle inbound and outbound calls, appointments, and customer interactions.",
    icon: "voice",
    features: ["Inbound Calls", "Outbound Calls", "Appointment Booking", "Natural Voice"],
    startingPrice: "$4,000",
  },
  {
    title: "AI Sales Automation",
    slug: "ai-sales-automation",
    description: "Automate your entire sales pipeline from lead generation to follow-ups with intelligent AI-powered systems.",
    icon: "sales",
    features: ["Lead Scoring", "Auto Follow-up", "CRM Integration", "Pipeline Management"],
    startingPrice: "$3,500",
  },
  {
    title: "AI Consulting",
    slug: "ai-consulting",
    description: "Strategic guidance on AI adoption, implementation roadmaps, and technology selection for your organization.",
    icon: "consulting",
    features: ["Strategy", "Roadmap", "Tech Selection", "ROI Analysis"],
    startingPrice: "$1,500",
  },
  {
    title: "Custom AI Solutions",
    slug: "custom-ai-solutions",
    description: "Bespoke AI systems tailored to your unique business needs, from computer vision to predictive analytics.",
    icon: "custom",
    features: ["Custom Models", "API Integration", "Tailored Solutions", "Full Ownership"],
    startingPrice: "$5,000",
  },
];

export const INDUSTRIES = [
  { name: "Healthcare", slug: "healthcare", icon: "🏥", description: "AI-powered patient engagement, appointment scheduling, and clinical workflow automation." },
  { name: "Restaurants", slug: "restaurants", icon: "🍽️", description: "Automated ordering, reservation management, and customer engagement systems." },
  { name: "Real Estate", slug: "real-estate", icon: "🏢", description: "Lead qualification, property matching, and automated follow-up systems." },
  { name: "Hotels & Hospitality", slug: "hotels", icon: "🏨", description: "Guest experience automation, booking management, and concierge AI." },
  { name: "Finance", slug: "finance", icon: "💰", description: "Automated compliance, risk assessment, and customer onboarding." },
  { name: "Manufacturing", slug: "manufacturing", icon: "🏭", description: "Quality control automation, supply chain optimization, and predictive maintenance." },
  { name: "Education", slug: "education", icon: "🎓", description: "Student engagement, enrollment automation, and learning assistance." },
  { name: "Marketing Agencies", slug: "marketing-agencies", icon: "📊", description: "Content automation, campaign management, and client reporting." },
  { name: "Professional Services", slug: "professional-services", icon: "💼", description: "Client intake, document automation, and scheduling systems." },
  { name: "E-commerce", slug: "ecommerce", icon: "🛒", description: "Product recommendations, customer support, and order management automation." },
];

export const PROCESS_STEPS = [
  { step: 1, title: "Discovery Call", description: "We understand your business, challenges, and automation goals in a free 30-minute consultation." },
  { step: 2, title: "Strategy & Proposal", description: "Our team designs a custom AI solution with clear deliverables, timeline, and investment breakdown." },
  { step: 3, title: "Build & Iterate", description: "We develop your AI solution with weekly demos and continuous feedback integration." },
  { step: 4, title: "Launch & Optimize", description: "We deploy your solution, monitor performance, and continuously optimize for maximum ROI." },
];

export const STATS = [
  { value: "85%", label: "Reduction in Response Time" },
  { value: "60%", label: "Cost Savings on Average" },
  { value: "3x", label: "Increase in Lead Conversion" },
  { value: "24/7", label: "Always-On Availability" },
];

export const TESTIMONIALS = [
  {
    name: "Sarah Chen",
    role: "CEO, TechVenture Capital",
    quote: "Vyravo AI transformed our lead qualification process. What used to take our team hours now happens instantly with their AI chatbot. Our conversion rate improved by 3x.",
    company: "TechVenture Capital",
  },
  {
    name: "Dr. Rajesh Patel",
    role: "Director, MedCare Hospitals",
    quote: "The AI voice agent handles our appointment scheduling flawlessly. Patient satisfaction scores are up 40% and our staff can focus on what matters most — patient care.",
    company: "MedCare Hospitals",
  },
  {
    name: "Michael Torres",
    role: "COO, Global Logistics Inc.",
    quote: "Their workflow automation saved us 200+ hours per month. The ROI was visible within the first quarter. Truly enterprise-grade quality.",
    company: "Global Logistics Inc.",
  },
];
