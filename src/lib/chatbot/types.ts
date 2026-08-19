// Chatbot Types - designed for future AI provider integration

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: string;
    sentiment?: string;
    leadScore?: number;
    suggestedActions?: string[];
  };
}

export interface ConversationContext {
  messages: ChatMessage[];
  leadInfo: LeadInfo;
  sessionId: string;
  startedAt: Date;
}

export interface LeadInfo {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  companySize?: string;
  industry?: string;
  challenges?: string[];
  budget?: string;
  timeline?: string;
  interests?: string[];
  qualified?: boolean;
  /** How the visitor handles this work today (captured conversationally by the AI). */
  currentWorkflow?: string;
  /** What the visitor wants to achieve (captured conversationally by the AI). */
  desiredOutcome?: string;
  /** AI-assessed buying interest for this conversation. */
  interestLevel?: "low" | "medium" | "high" | "unknown";
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  action: "message" | "link" | "booking";
  value: string;
}

export interface ChatbotConfig {
  welcomeMessage: string;
  quickActions: QuickAction[];
  collectLeadInfo: boolean;
  bookingEnabled: boolean;
  provider: "internal" | "openai" | "anthropic" | "gemini";
}

// For future AI provider integration
export interface AIProviderConfig {
  provider: "openai" | "anthropic" | "gemini";
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ChatRequest {
  message: string;
  context: ConversationContext;
  config?: Partial<AIProviderConfig>;
}

export interface ChatResponse {
  message: string;
  suggestedActions?: QuickAction[];
  shouldCollectInfo?: keyof LeadInfo;
  intent?: string;
}
