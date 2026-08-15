// Chatbot Engine - Intelligent Response Generation
// Designed for easy upgrade to AI providers (OpenAI, Anthropic, Gemini)

import { COMPANY_KNOWLEDGE, INDUSTRY_RECOMMENDATIONS, OBJECTION_RESPONSES } from "./knowledge";
import type { ChatMessage, ConversationContext, ChatResponse, QuickAction, LeadInfo } from "./types";
import { SITE_LINKS } from "../constants";

// Intent detection patterns
const INTENT_PATTERNS: Record<string, RegExp[]> = {
  greeting: [/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)/i],
  services: [/service|offer|provide|do you do|what.*do|help.*with/i],
  pricing: [/price|cost|how much|pricing|rate|fee|budget|afford|expensive|cheap/i],
  industries: [/industr|sector|work with|vertical|niche|who.*serve/i],
  process: [/process|how.*work|step|timeline|how long|start|begin/i],
  booking: [/book|schedule|call|meeting|consultation|discovery|demo|talk/i],
  contact: [/contact|phone|email|reach|linkedin|talk to.*human/i],
  integration: [/integrat|connect|crm|software|tool|app|zapier|hubspot/i],
  support: [/support|help|maintain|after|ongoing|issue/i],
  custom: [/custom|bespoke|specific|unique|tailor/i],
  comparison: [/different|vs|compare|better|why.*you|competitor/i],
  objection: [/expensive|too.*small|don't need|already have|no time|think about/i],
  chatbot: [/chatbot|chat.*bot|conversational|messaging/i],
  voiceAgent: [/voice|call|phone|ivr|speak|talk/i],
  workflow: [/workflow|automat|process|repetitive|manual/i],
  sales: [/sales|lead|crm|pipeline|follow.*up|convert/i],
  qualification: [/business|company|employee|challenge|problem|goal/i],
  thanks: [/thank|thanks|appreciate|helpful/i],
  goodbye: [/bye|goodbye|see you|talk later|that's all/i],
};

function detectIntent(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerMessage)) {
        return intent;
      }
    }
  }
  return "general";
}

function detectIndustry(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  const industries = ["healthcare", "restaurant", "real estate", "hotel", "finance", "ecommerce", "agency", "education", "manufacturing"];
  
  for (const industry of industries) {
    if (lowerMessage.includes(industry)) {
      return industry;
    }
  }
  
  // Common variations
  if (lowerMessage.includes("hospital") || lowerMessage.includes("clinic") || lowerMessage.includes("medical")) return "healthcare";
  if (lowerMessage.includes("food") || lowerMessage.includes("cafe") || lowerMessage.includes("dining")) return "restaurant";
  if (lowerMessage.includes("property") || lowerMessage.includes("realtor")) return "real estate";
  if (lowerMessage.includes("hospitality") || lowerMessage.includes("resort")) return "hotel";
  if (lowerMessage.includes("bank") || lowerMessage.includes("insurance") || lowerMessage.includes("fintech")) return "finance";
  if (lowerMessage.includes("shop") || lowerMessage.includes("store") || lowerMessage.includes("retail")) return "ecommerce";
  if (lowerMessage.includes("marketing") || lowerMessage.includes("digital")) return "agency";
  if (lowerMessage.includes("school") || lowerMessage.includes("university") || lowerMessage.includes("training")) return "education";
  
  return null;
}

function extractLeadInfo(message: string, context: ConversationContext): Partial<LeadInfo> {
  const info: Partial<LeadInfo> = {};
  
  // Extract email
  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) info.email = emailMatch[0];
  
  // Extract phone
  const phoneMatch = message.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
  if (phoneMatch) info.phone = phoneMatch[0];
  
  // Detect industry
  const industry = detectIndustry(message);
  if (industry) info.industry = industry;
  
  // Extract company size patterns
  if (/\b(\d+)\s*(employee|people|team|staff)/i.test(message)) {
    const match = message.match(/\b(\d+)\s*(employee|people|team|staff)/i);
    if (match) info.companySize = match[1] + " employees";
  }
  
  return info;
}

function generateBookingActions(): QuickAction[] {
  return [
    { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
    { id: "learn", label: "📖 Learn More First", action: "message", value: "Tell me more about your services" },
  ];
}

function generateServiceActions(): QuickAction[] {
  return [
    { id: "chatbot", label: "🤖 AI Chatbots", action: "message", value: "Tell me about AI Chatbots" },
    { id: "workflow", label: "⚡ Workflow Automation", action: "message", value: "Tell me about Workflow Automation" },
    { id: "voice", label: "🎙️ Voice Agents", action: "message", value: "Tell me about Voice Agents" },
    { id: "sales", label: "📈 Sales Automation", action: "message", value: "Tell me about Sales Automation" },
  ];
}

export function generateResponse(
  message: string,
  context: ConversationContext
): ChatResponse {
  const intent = detectIntent(message);
  const leadInfo = extractLeadInfo(message, context);
  const industry = context.leadInfo.industry || detectIndustry(message);
  
  // Update context with extracted info
  Object.assign(context.leadInfo, leadInfo);
  if (industry) context.leadInfo.industry = industry;

  switch (intent) {
    case "greeting":
      return {
        message: "Hello! 👋 Welcome to Vyravo AI. I'm here to help you explore how AI automation can transform your business.\n\nI can help you with:\n• Understanding our AI services\n• Finding the right solution for your industry\n• Answering pricing questions\n• Booking a free discovery call\n\nWhat brings you here today?",
        suggestedActions: [
          { id: "services", label: "💬 What services do you offer?", action: "message", value: "What services do you offer?" },
          { id: "help", label: "🤖 How can AI help my business?", action: "message", value: "How can AI help my business?" },
          { id: "pricing", label: "💰 Pricing", action: "message", value: "What are your prices?" },
          { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
        ],
        intent,
      };

    case "services":
      const servicesText = COMPANY_KNOWLEDGE.services
        .map(s => `• **${s.name}** — ${s.description.split('.')[0]}.`)
        .join("\n");
      return {
        message: `Great question! Here's what we offer:\n\n${servicesText}\n\nWhich of these sounds most relevant to your business?`,
        suggestedActions: generateServiceActions(),
        intent,
      };

    case "chatbot":
      const chatbotService = COMPANY_KNOWLEDGE.services.find(s => s.name === "AI Chatbots")!;
      return {
        message: `**AI Chatbots** are one of our most popular solutions! 🤖\n\n${chatbotService.description}\n\n**Benefits:**\n${chatbotService.benefits.map(b => `• ${b}`).join("\n")}\n\n**Starting from:** ${chatbotService.startingPrice}\n\nWe can deploy chatbots on your website, WhatsApp, Facebook Messenger, Slack, and more.\n\nWhat kind of customer interactions would you like to automate?`,
        suggestedActions: [
          { id: "example", label: "Show me examples", action: "message", value: "Show me chatbot examples" },
          { id: "pricing", label: "💰 Pricing details", action: "message", value: "How much does a chatbot cost?" },
          { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
        ],
        intent,
      };

    case "voiceAgent":
      const voiceService = COMPANY_KNOWLEDGE.services.find(s => s.name === "AI Voice Agents")!;
      return {
        message: `**AI Voice Agents** can revolutionize how you handle calls! 🎙️\n\n${voiceService.description}\n\n**Benefits:**\n${voiceService.benefits.map(b => `• ${b}`).join("\n")}\n\n**Starting from:** ${voiceService.startingPrice}\n\nOur voice agents sound natural—callers often can't tell they're speaking with AI.\n\nWhat type of calls do you handle most? Inbound support or outbound follow-ups?`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "workflow":
      const workflowService = COMPANY_KNOWLEDGE.services.find(s => s.name === "AI Workflow Automation")!;
      return {
        message: `**AI Workflow Automation** eliminates repetitive manual work! ⚡\n\n${workflowService.description}\n\n**Benefits:**\n${workflowService.benefits.map(b => `• ${b}`).join("\n")}\n\n**Starting from:** ${workflowService.startingPrice}\n\nWe integrate with tools like HubSpot, Salesforce, Slack, Google Sheets, and custom APIs.\n\nWhat repetitive tasks consume most of your team's time?`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "sales":
      const salesService = COMPANY_KNOWLEDGE.services.find(s => s.name === "AI Sales Automation")!;
      return {
        message: `**AI Sales Automation** helps you close more deals without the manual grind! 📈\n\n${salesService.description}\n\n**Benefits:**\n${salesService.benefits.map(b => `• ${b}`).join("\n")}\n\n**Starting from:** ${salesService.startingPrice}\n\nWe can automate lead scoring, personalized follow-ups, CRM updates, and meeting scheduling.\n\nHow are you currently managing your sales pipeline?`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "pricing":
      return {
        message: `Our pricing is customized based on project scope—no generic packages here. Here are starting prices:\n\n• **AI Chatbots** — from $2,500\n• **Workflow Automation** — from $3,000\n• **AI Voice Agents** — from $4,000\n• **Sales Automation** — from $3,500\n• **AI Consulting** — from $1,500\n• **Custom Solutions** — from $5,000\n\nEvery project includes:\n✓ Free discovery call\n✓ Custom development\n✓ 30-day post-launch support\n✓ Full code ownership\n\nThe best way to get an accurate quote is through a quick discovery call. Would you like to book one?`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "industries":
      const industriesList = COMPANY_KNOWLEDGE.industries
        .slice(0, 6)
        .map(i => `• **${i.name}**`)
        .join("\n");
      return {
        message: `We work with businesses across many industries:\n\n${industriesList}\n• And more...\n\nEach industry has unique automation opportunities. Which industry are you in? I can share specific recommendations!`,
        suggestedActions: [
          { id: "healthcare", label: "🏥 Healthcare", action: "message", value: "I'm in healthcare" },
          { id: "realestate", label: "🏢 Real Estate", action: "message", value: "I'm in real estate" },
          { id: "ecommerce", label: "🛒 E-commerce", action: "message", value: "I'm in e-commerce" },
          { id: "other", label: "Other industry", action: "message", value: "I'm in a different industry" },
        ],
        intent,
      };

    case "qualification":
      if (industry && INDUSTRY_RECOMMENDATIONS[industry]) {
        const rec = INDUSTRY_RECOMMENDATIONS[industry];
        return {
          message: `Great! For ${industry}, I'd typically recommend:\n\n**Services:**\n${rec.services.map(s => `• ${s}`).join("\n")}\n\n**Example automations:**\n${rec.examples.map(e => `• ${e}`).join("\n")}\n\nTo give you the best recommendation, may I ask: what's the biggest challenge you're facing right now that you'd like to solve with AI?`,
          suggestedActions: generateBookingActions(),
          intent,
        };
      }
      return {
        message: "To give you the best recommendations, I'd love to learn a bit more about your business. What industry are you in, and what's the main challenge you're looking to solve?",
        intent,
        shouldCollectInfo: "industry",
      };

    case "process":
      const processSteps = COMPANY_KNOWLEDGE.process
        .map(p => `**${p.step}. ${p.name}**\n   ${p.description}`)
        .join("\n\n");
      return {
        message: `Here's how we work:\n\n${processSteps}\n\nMost projects are delivered within 4-8 weeks. Simple chatbots can be ready in 2-3 weeks.\n\nWould you like to start with a free discovery call?`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "booking":
      const { discoveryCall } = COMPANY_KNOWLEDGE;
      return {
        message: `I'd love to set you up with a discovery call! 📅\n\n**What to expect:**\n• Duration: ${discoveryCall.duration}\n• Cost: ${discoveryCall.cost}\n• No obligation whatsoever\n\n**You'll get:**\n${discoveryCall.includes.slice(0, 4).map(i => `• ${i}`).join("\n")}\n\n${discoveryCall.nextSteps}\n\nYou can book directly on our website, or I can share more info first. What would you prefer?`,
        suggestedActions: [
          { id: "book", label: "📅 Book Now", action: "link", value: SITE_LINKS.discoveryCall },
          { id: "more", label: "Tell me more first", action: "message", value: "What happens during the call?" },
        ],
        intent,
      };

    case "contact":
      const { contact } = COMPANY_KNOWLEDGE;
      return {
        message: `Here's how you can reach us:\n\n📞 **Phone:** ${contact.phone}\n📧 **Email:** ${contact.email}\n💼 **LinkedIn:** [Connect with us](${contact.linkedin})\n\n🕐 **Business Hours:** ${contact.hours}\n\nOr you can book a discovery call and we'll reach out to you! What works best?`,
        suggestedActions: [
          { id: "call", label: "📞 Call Now", action: "link", value: contact.phoneLink },
          { id: "email", label: "📧 Email Us", action: "link", value: contact.emailLink },
          { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
        ],
        intent,
      };

    case "integration":
      return {
        message: `Absolutely! Integration is one of our strengths. 🔗\n\nWe integrate with:\n• **CRMs:** HubSpot, Salesforce, Pipedrive, Zoho\n• **Communication:** Slack, WhatsApp, Teams, Email\n• **Automation:** Zapier, Make, n8n\n• **Scheduling:** Calendly, Google Calendar\n• **Custom:** Any system with an API\n\nWe work WITH your existing tools—no need to replace anything.\n\nWhat tools are you currently using?`,
        intent,
      };

    case "support":
      return {
        message: `We've got you covered! 🛡️\n\n**Every project includes:**\n• 30 days of complimentary post-launch support\n• Bug fixes and adjustments\n• Performance monitoring\n\n**Optional ongoing support:**\n• Continuous optimization\n• Feature additions\n• Priority support\n• Regular performance reviews\n\nWe don't just build and disappear—we're partners in your success. Any specific support concerns?`,
        intent,
      };

    case "objection":
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes("expensive") || lowerMsg.includes("cost")) {
        return { message: OBJECTION_RESPONSES.expensive, suggestedActions: generateBookingActions(), intent };
      }
      if (lowerMsg.includes("small")) {
        return { message: OBJECTION_RESPONSES.small, intent };
      }
      if (lowerMsg.includes("don't need") || lowerMsg.includes("dont need")) {
        return { message: OBJECTION_RESPONSES["don't need"], intent };
      }
      if (lowerMsg.includes("already have") || lowerMsg.includes("have software")) {
        return { message: OBJECTION_RESPONSES["have software"], intent };
      }
      if (lowerMsg.includes("no time") || lowerMsg.includes("busy")) {
        return { message: OBJECTION_RESPONSES["no time"], suggestedActions: generateBookingActions(), intent };
      }
      if (lowerMsg.includes("think about")) {
        return { message: OBJECTION_RESPONSES["think about it"], intent };
      }
      return {
        message: "I understand your concern. Every business is different, and AI isn't always the right fit immediately. Would you like to share more about what's holding you back? I'm happy to address any specific concerns.",
        intent,
      };

    case "comparison":
      return {
        message: `Great question! Here's what makes Vyravo AI different:\n\n${COMPANY_KNOWLEDGE.differentiators.map(d => `✓ ${d}`).join("\n")}\n\nWe're not about selling generic solutions. We genuinely want to understand your business and build something that delivers real ROI.\n\nWant to see for yourself? The discovery call is free and zero-obligation.`,
        suggestedActions: generateBookingActions(),
        intent,
      };

    case "thanks":
      return {
        message: "You're welcome! 😊 I'm glad I could help. Is there anything else you'd like to know about AI automation for your business?",
        suggestedActions: [
          { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
          { id: "more", label: "I have more questions", action: "message", value: "I have another question" },
        ],
        intent,
      };

    case "goodbye":
      return {
        message: "Thanks for chatting with us! 👋 If you have any questions later, I'm here 24/7. You can also reach us at:\n\n📞 ${COMPANY_KNOWLEDGE.contact.phone}\n📧 ${COMPANY_KNOWLEDGE.contact.email}\n\nHave a great day!",
        intent,
      };

    default:
      // Check if they mentioned an industry
      if (industry && INDUSTRY_RECOMMENDATIONS[industry]) {
        const rec = INDUSTRY_RECOMMENDATIONS[industry];
        return {
          message: `I see you're in ${industry}! That's an industry we love working with.\n\n**Recommended solutions:**\n${rec.services.map(s => `• ${s}`).join("\n")}\n\n**Examples:**\n${rec.examples.map(e => `• ${e}`).join("\n")}\n\nWould you like to explore any of these in more detail, or shall we book a discovery call to discuss your specific needs?`,
          suggestedActions: generateBookingActions(),
          intent: "qualification",
        };
      }

      return {
        message: "Thanks for your message! I want to make sure I give you the most helpful answer.\n\nI can help you with:\n• Understanding our AI services\n• Finding the right solution for your business\n• Pricing and process questions\n• Booking a discovery call\n\nWhat would you like to explore?",
        suggestedActions: [
          { id: "services", label: "💬 Services", action: "message", value: "What services do you offer?" },
          { id: "pricing", label: "💰 Pricing", action: "message", value: "What are your prices?" },
          { id: "book", label: "📅 Book Call", action: "link", value: SITE_LINKS.discoveryCall },
        ],
        intent,
      };
  }
}

export function getWelcomeMessage(): ChatResponse {
  return {
    message: "Hi there! 👋 I'm Vyravo AI's assistant. I help businesses discover how AI automation can save time, reduce costs, and scale operations.\n\nWhether you're curious about AI chatbots, workflow automation, or voice agents—I'm here to help.\n\nWhat brings you here today?",
    suggestedActions: [
      { id: "services", label: "💬 What services do you offer?", action: "message", value: "What services do you offer?" },
      { id: "help", label: "🤖 How can AI help my business?", action: "message", value: "How can AI help my business?" },
      { id: "pricing", label: "💰 Pricing", action: "message", value: "What are your prices?" },
      { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
    ],
  };
}
