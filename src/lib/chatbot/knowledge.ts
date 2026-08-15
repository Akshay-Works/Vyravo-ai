// Vyravo AI Chatbot Knowledge Base
// This serves as the foundation for AI-powered responses

export const COMPANY_KNOWLEDGE = {
  name: "Vyravo AI",
  tagline: "Intelligent Automation for Modern Businesses.",
  
  mission: "Help businesses automate repetitive work using AI chatbots, AI workflow automation, AI voice agents, AI sales automation, and custom AI solutions.",
  
  contact: {
    phone: "+91 9075707650",
    phoneLink: "tel:+919075707650",
    email: "akshay.navale.work@gmail.com",
    emailLink: "mailto:akshay.navale.work@gmail.com",
    linkedin: "https://www.linkedin.com/in/akshay-n-2692851b7",
    hours: "Mon – Fri, 9:00 AM – 6:00 PM IST",
  },

  services: [
    {
      name: "AI Chatbots",
      description: "Intelligent conversational agents that handle customer queries 24/7, qualify leads, and deliver instant support across all channels including website, WhatsApp, Facebook Messenger, and more.",
      benefits: ["24/7 customer support", "Lead qualification", "Multi-language support", "Omnichannel deployment"],
      useCases: ["Customer support", "Lead generation", "FAQ handling", "Appointment booking"],
    },
    {
      name: "AI Workflow Automation",
      description: "End-to-end automation of repetitive business processes, from data entry to complex multi-step workflows. Integrate with your existing tools and eliminate manual work.",
      benefits: ["Eliminate manual data entry", "Reduce errors by 95%", "Save 200+ hours/month", "Seamless integrations"],
      useCases: ["Document processing", "Email automation", "Report generation", "Data synchronization"],
    },
    {
      name: "AI Voice Agents",
      description: "Natural-sounding AI voice assistants that handle inbound and outbound calls, appointments, and customer interactions without sounding robotic.",
      benefits: ["Natural conversations", "24/7 call handling", "Appointment scheduling", "Call summaries"],
      useCases: ["Appointment confirmations", "Customer inquiries", "Order updates", "Surveys"],
    },
    {
      name: "AI Sales Automation",
      description: "Automate your entire sales pipeline from lead generation to follow-ups with intelligent AI-powered systems that never miss an opportunity.",
      benefits: ["Automated lead scoring", "Personalized follow-ups", "CRM integration", "Pipeline management"],
      useCases: ["Lead nurturing", "Email sequences", "Meeting scheduling", "Proposal generation"],
    },
    {
      name: "AI Consulting",
      description: "Strategic guidance on AI adoption, implementation roadmaps, and technology selection for your organization.",
      benefits: ["Expert guidance", "Custom roadmap", "Technology selection", "ROI analysis"],
      useCases: ["AI readiness assessment", "Strategy development", "Vendor selection", "Implementation planning"],
    },
    {
      name: "Custom AI Solutions",
      description: "Bespoke AI systems tailored to your unique business needs, from computer vision to predictive analytics.",
      benefits: ["Fully customized", "Proprietary models", "Complete ownership", "Scalable architecture"],
      useCases: ["Predictive analytics", "Computer vision", "NLP applications", "Recommendation engines"],
    },
  ],

  industries: [
    { name: "Healthcare", examples: ["Patient chatbots", "Appointment scheduling", "Reminder systems", "Triage assistance"] },
    { name: "Restaurants", examples: ["Ordering bots", "Reservation systems", "Menu assistance", "Feedback collection"] },
    { name: "Hotels & Hospitality", examples: ["Concierge AI", "Booking management", "Guest support", "Upselling"] },
    { name: "Real Estate", examples: ["Lead qualification", "Property matching", "Virtual tours", "Document automation"] },
    { name: "Finance", examples: ["Customer onboarding", "Compliance automation", "Risk assessment", "Fraud detection"] },
    { name: "Manufacturing", examples: ["Quality control", "Supply chain optimization", "Predictive maintenance", "Vendor management"] },
    { name: "Education", examples: ["Enrollment chatbots", "Student support", "Learning assistants", "Administrative automation"] },
    { name: "Marketing Agencies", examples: ["Content automation", "Client reporting", "Campaign management", "Lead generation"] },
    { name: "Professional Services", examples: ["Client intake", "Document automation", "Scheduling", "Billing"] },
    { name: "E-commerce", examples: ["Shopping assistants", "Order tracking", "Product recommendations", "Customer support"] },
  ],

  process: [
    { step: 1, name: "Discovery Call", description: "Free 30-minute consultation to understand your business, challenges, and automation goals." },
    { step: 2, name: "Strategy & Proposal", description: "Custom solution design with clear deliverables, timeline, and investment breakdown." },
    { step: 3, name: "Build & Iterate", description: "Agile development with weekly demos and continuous feedback integration." },
    { step: 4, name: "Launch & Optimize", description: "Deployment, monitoring, and continuous optimization for maximum ROI." },
  ],

  discoveryCall: {
    duration: "30 minutes",
    cost: "Free",
    includes: [
      "Business analysis",
      "AI opportunity identification",
      "Solution recommendations",
      "Timeline estimation",
      "Investment breakdown",
      "ROI projection",
    ],
    nextSteps: "Within 48 hours, you'll receive a detailed proposal with recommended solutions.",
  },

  faqs: [
    { q: "How long does implementation take?", a: "Most projects are delivered within 4-8 weeks. Simple chatbots can be deployed in 2-3 weeks." },
    { q: "Do you offer ongoing support?", a: "Yes! All projects include 30 days of post-launch support. We also offer ongoing maintenance packages." },
    { q: "Can you integrate with our existing tools?", a: "Absolutely. We integrate with popular CRMs, ERPs, communication platforms, and custom APIs." },
    { q: "Is my data secure?", a: "Yes. We follow enterprise-grade security practices including encryption, access controls, and GDPR compliance." },
    { q: "Do you work with small businesses?", a: "Yes! We work with startups, SMEs, and enterprises. Our solutions scale with your business." },
    { q: "What's the ROI of AI automation?", a: "Our clients typically see 60% cost savings and 3x improvement in response times within 3 months." },
  ],

  differentiators: [
    "Custom-built solutions (no templates)",
    "Transparent pricing",
    "Measurable ROI focus",
    "Dedicated support",
    "Enterprise-grade quality",
    "Full code ownership",
  ],

  technologies: ["OpenAI GPT-4", "Claude", "Custom fine-tuned models", "n8n", "Make", "Zapier", "Various CRMs"],
};

export const INDUSTRY_RECOMMENDATIONS: Record<string, { services: string[]; examples: string[] }> = {
  healthcare: {
    services: ["AI Chatbots", "AI Voice Agents", "AI Workflow Automation"],
    examples: ["Patient FAQ chatbot", "Appointment reminder calls", "Claims processing automation"],
  },
  restaurant: {
    services: ["AI Chatbots", "AI Voice Agents"],
    examples: ["WhatsApp ordering bot", "Reservation management", "Voice agent for takeout orders"],
  },
  "real estate": {
    services: ["AI Chatbots", "AI Sales Automation", "AI Workflow Automation"],
    examples: ["Lead qualification bot", "Property matching assistant", "Automated follow-up sequences"],
  },
  hotel: {
    services: ["AI Chatbots", "AI Voice Agents", "Custom AI Solutions"],
    examples: ["AI concierge", "Booking assistance", "Multilingual guest support"],
  },
  finance: {
    services: ["AI Chatbots", "AI Workflow Automation", "Custom AI Solutions"],
    examples: ["Customer onboarding bot", "Compliance automation", "Document processing"],
  },
  ecommerce: {
    services: ["AI Chatbots", "AI Sales Automation", "Custom AI Solutions"],
    examples: ["Shopping assistant", "Cart recovery automation", "Product recommendation engine"],
  },
  agency: {
    services: ["AI Workflow Automation", "AI Sales Automation", "AI Chatbots"],
    examples: ["Proposal automation", "Client reporting", "Lead nurturing sequences"],
  },
  education: {
    services: ["AI Chatbots", "AI Workflow Automation"],
    examples: ["Enrollment chatbot", "Student support assistant", "Administrative automation"],
  },
};

export const OBJECTION_RESPONSES: Record<string, string> = {
  expensive: "I understand budget is important. Our pricing is customized based on scope, and many clients see ROI within the first quarter. The cost of NOT automating—lost time, missed leads, human errors—often exceeds the investment. Would you like to discuss a solution that fits your budget?",
  
  small: "Great news—AI automation isn't just for big companies anymore. Many of our clients are small businesses and startups. We design scalable solutions that grow with you. What's a repetitive task that takes up most of your time?",
  
  "don't need": "I hear you. Many businesses don't realize how much time is spent on repetitive tasks until they map it out. Things like answering the same questions, manual data entry, or following up on leads add up. If you had 10 extra hours a week, what would you focus on?",
  
  "have software": "That's great! We don't replace your existing software—we enhance it. Our AI solutions integrate with your current tools to automate the manual work between them. What tools are you currently using?",
  
  "no time": "Totally understand—you're busy running your business. That's exactly why automation helps. Once set up, it runs 24/7 without you. Our discovery call is just 30 minutes, and many clients say it's the most valuable half hour they've spent. Would that work for you?",
  
  "think about it": "Of course, take your time. While you're considering, would it help if I shared some information about how businesses similar to yours have benefited? Or I can send you a quick summary of what we discussed.",
};
