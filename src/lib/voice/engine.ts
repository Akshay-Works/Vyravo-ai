// Voice Receptionist — conversation engine.
//
// Handles the call conversation flow: greeting → intent detection →
// response generation → lead qualification → actions → call summary.
//
// Architecture notes (kept consistent with the existing chatbot engine):
//  - Intent detection is pattern-based and deterministic today.
//  - All business facts come from getBusinessKnowledge() — the engine never
//    invents business-specific information.
//  - The engine is a pure state machine operating on CallState; all side
//    effects (CRM, email, storage) happen in the API layer / integrations.

import { getBusinessKnowledge } from "./knowledge";
import type {
  CallRecord,
  CallSummary,
  CallTurn,
  LeadStatus,
  Qualification,
  TranscriptMessage,
  VoiceConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Intent detection (same pattern style as lib/chatbot/engine.ts)
// ---------------------------------------------------------------------------

export type IntentId =
  | "general_inquiry"
  | "pricing"
  | "service_inquiry"
  | "appointment_request"
  | "existing_customer"
  | "business_hours"
  | "location"
  | "callback_request"
  | "complaint"
  | "human_request"
  | "greeting"
  | "farewell"
  | "thanks"
  | "confirmation"
  | "unknown";

const INTENT_PATTERNS: Record<IntentId, RegExp[]> = {
  greeting: [/^(hi|hello|hey|good\s*(morning|afternoon|evening))\b/i],
  farewell: [
    /^(bye|goodbye|see you|talk to you later|that'?s all|nothing else|end (the )?call|hang ?up)\b/i,
    /(bye|goodbye)[.!]?$/i,
    /thank you (so much )?for (your )?(help|time|everything|the information)/i,
  ],
  thanks: [/^(thanks|thank you|thanks a lot|ok thanks)[.!]?$/i],
  confirmation: [/^(yes|yeah|yep|sure|absolutely|definitely|of course|please|sounds good|great|ok|okay|no|nope|not really|not now)\b/i],
  business_hours: [
    /(business )?hours|what time|open|close|when (are|do) you (open|work)|timing/i,
  ],
  location: [/where (are you|is your)|location|based|address|office/i],
  pricing: [
    /price|pricing|cost|how much|rate|fee|budget|charge|quote|afford|expensive|cheap/i,
  ],
  service_inquiry: [
    /service|offer|provide|what (do|can) you (do|build)|chatbot|voice agent|automation|workflow|crm|ai (solution|agent|system)|product/i,
  ],
  appointment_request: [
    /appointment|book(ing)?|schedule|discovery call|demo|meeting|consultation|set up (a )?(time|call)/i,
  ],
  existing_customer: [
    /existing (customer|client)|current (customer|client)|my (account|project|order)|already (work|working)|support.*(issue|problem)|onboarding/i,
  ],
  callback_request: [
    /call (me|us) back|call back|have someone (call|contact|reach)|return my call|request a callback/i,
  ],
  complaint: [
    /complaint|unhappy|not satisfied|angry|terrible|awful|problem with|issue with|disappointed/i,
  ],
  human_request: [
    /speak (to|with) (a |an |the )?(human|person|someone|representative|agent|manager|team|real)/i,
    /connect (me (to|with))?.*(human|person|agent|representative|manager)/i,
    /talk to a (real )?(human|person|agent)/i,
    /(this is )?urgent|emergency|escalate/i,
    /real (human|person|agent)|human (agent|being|operator)/i,
  ],
  general_inquiry: [
    /who are you|what is .*company|tell me about|information|more (about|info)|how (does|do) (it|this|you) work/i,
  ],
  unknown: [],
};

export function detectIntent(text: string): IntentId {
  const t = text.trim();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(t)) return intent as IntentId;
    }
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Call state
// ---------------------------------------------------------------------------

export type AskedField =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "requirements"
  | "preferredContactTime"
  | "booking_confirm"
  | null;

/** Intent priority — the most significant intent of the call wins the record. */
const INTENT_PRIORITY: Record<IntentId, number> = {
  appointment_request: 10,
  complaint: 9,
  human_request: 8,
  callback_request: 7,
  pricing: 6,
  service_inquiry: 5,
  existing_customer: 4,
  general_inquiry: 3,
  business_hours: 2,
  location: 1,
  greeting: 0,
  thanks: 0,
  confirmation: 0,
  farewell: 0,
  unknown: 0,
};

export interface CallState {
  callId: string;
  config: VoiceConfig;
  callerName: string | null;
  callerPhone: string | null;
  callerEmail: string | null;
  callerCompany: string | null;
  qualification: Qualification;
  transcript: TranscriptMessage[];
  intent: IntentId | null;
  primaryIntent: IntentId | null;
  leadStatus: LeadStatus;
  actions: string[];
  startedAt: number;
  bookingConfirmed: boolean;
  callbackOffered: boolean;
  crmSynced: boolean;
  emailTriggered: boolean;
  ended: boolean;
  lastAsked: AskedField;
}

export function createCallState(
  callId: string,
  config: VoiceConfig,
  callerPhone: string | null
): CallState {
  return {
    callId,
    config,
    callerName: null,
    callerPhone,
    callerEmail: null,
    callerCompany: null,
    qualification: {},
    transcript: [],
    intent: null,
    primaryIntent: null,
    leadStatus: "new",
    actions: [],
    startedAt: Date.now(),
    bookingConfirmed: false,
    callbackOffered: false,
    crmSynced: false,
    emailTriggered: false,
    ended: false,
    lastAsked: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function pushTranscript(state: CallState, role: TranscriptMessage["role"], text: string) {
  state.transcript.push({ role, text, at: nowIso() });
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  return m ? m[0].toLowerCase() : null;
}

function extractPhone(text: string): string | null {
  const m = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function extractName(text: string): string | null {
  const m = text.match(/^(?:my name is|i'?m|i am|this is)\s+([A-Za-z][A-Za-z .'-]{1,40})$/i);
  return m ? m[1].trim() : null;
}

function extractCompany(text: string): string | null {
  const m = text.match(
    /(?:i (?:run|own|work (?:at|for|with)|represent)|my (?:company|business) is|(?:our )?company is|we are|we'?re called)\s+(?:a |an |the )?([A-Za-z0-9][A-Za-z0-9 .&'-]{1,60})/i
  );
  return m ? m[1].trim() : null;
}

function extractInterest(text: string): string | null {
  const m = text.match(/i(?:'m| am)? (?:interested in|looking for|need help with|need|want)\s+(.{3,120})/i);
  return m ? m[1].trim().replace(/[.!?]+$/, "") : null;
}

/** Which qualification field should we ask for next? */
function nextQualificationQuestion(state: CallState): keyof Qualification | null {
  const q = state.qualification;
  if (!q.name) return "name";
  if (!q.serviceInterest) return "serviceInterest";
  if (!q.email && !q.phone) return "email";
  if (!q.company) return "company";
  if (!q.requirements) return "requirements";
  if (!q.preferredContactTime) return "preferredContactTime";
  return null;
}

function isQualified(state: CallState): boolean {
  const q = state.qualification;
  return Boolean(q.name && q.serviceInterest && (q.email || q.phone));
}

/** Best contact detail we captured so far (for follow-up messaging). */
function contactDetail(state: CallState): string | null {
  return state.qualification.email || state.qualification.phone || state.callerPhone || null;
}

function setLeadStatus(state: CallState) {
  if (state.leadStatus !== "customer" && isQualified(state)) {
    state.leadStatus = "qualified";
  }
}

const FALLBACK_UNKNOWN =
  "I don't want to give you incorrect information. I can take your details and have someone from the team get back to you.";

const HONEST_TRANSFER =
  "I'd love to connect you right away. Let me take your name and number, and I'll make sure someone from the team calls you back as a priority.";

/** Append the next qualification question to a reply (sets state.lastAsked). */
function continueQualification(state: CallState, prefix: string): string {
  const nextQ = nextQualificationQuestion(state);
  const prompts: Record<keyof Qualification, string> = {
    name: "May I have your name?",
    email: "Could you share an email address so we can send you the details?",
    phone: "What's the best phone number to reach you on?",
    serviceInterest: "Which of our services are you most interested in?",
    company: "And which company are you with?",
    requirements: "Could you briefly tell me what you're looking to automate?",
    preferredContactTime: "What's a good time for our team to reach you?",
  };
  if (nextQ) {
    state.lastAsked = nextQ as AskedField;
    return `${prefix} ${prompts[nextQ]}`;
  }
  state.lastAsked = null;
  return `${prefix} Anything else I can help you with?`;
}

// ---------------------------------------------------------------------------
// Turn processing
// ---------------------------------------------------------------------------

export function processTurn(state: CallState, callerText: string): CallTurn {
  const knowledge = getBusinessKnowledge(state.config);
  const text = callerText.trim();
  const intent = detectIntent(text);
  pushTranscript(state, "caller", text);

  const actions: string[] = [];
  let reply = "";
  let callEnded = false;
  let bookingRequested = false;

  // ---------------------------------------------------------------
  // Capture sweep — record any data the caller mentions this turn.
  // ---------------------------------------------------------------
  const email = extractEmail(text);
  if (email) state.qualification.email = email;
  const phone = extractPhone(text);
  if (phone) state.qualification.phone = phone;
  const name = extractName(text);
  if (name) state.qualification.name = name;
  const company = extractCompany(text);
  if (company) state.qualification.company = company;
  const interest = extractInterest(text);
  if (interest) state.qualification.serviceInterest = interest;

  switch (intent) {
    case "greeting": {
      reply = `Hello! You've reached ${knowledge.businessName}. ${state.config.receptionistName} here — how can I help you today?`;
      state.lastAsked = null;
      break;
    }

    case "business_hours": {
      reply = `${knowledge.answers.businessHours} Is there anything else I can help you with?`;
      if (!state.actions.includes("FAQ answered")) state.actions.push("FAQ answered");
      state.lastAsked = null;
      break;
    }

    case "location": {
      reply = `${knowledge.answers.location} Is there anything else I can help you with?`;
      if (!state.actions.includes("FAQ answered")) state.actions.push("FAQ answered");
      state.lastAsked = null;
      break;
    }

    case "pricing": {
      bookingRequested = true;
      reply = `${knowledge.pricingPolicy} Would you like me to arrange a free ${knowledge.booking.duration} discovery call so we can prepare a tailored proposal for you?`;
      state.lastAsked = "booking_confirm";
      break;
    }

    case "service_inquiry":
    case "general_inquiry": {
      reply = continueQualification(state, `Happy to help with that. ${knowledge.answers.services}.`);
      break;
    }

    case "appointment_request": {
      bookingRequested = true;
      if (nextQualificationQuestion(state) === "name") {
        reply = `I can help you book a free ${knowledge.booking.duration} discovery call — it includes ${knowledge.booking.whatToExpect.slice(0, 3).join(", ")}, and more. May I have your name first?`;
        state.lastAsked = "name";
      } else {
        reply = continueQualification(state, `Happy to arrange a discovery call.`);
      }
      break;
    }

    case "existing_customer": {
      state.leadStatus = "customer";
      reply = `Thanks for calling about your existing work with us. ${continueQualification(state, "To make sure the right person follows up,")}`;
      if (!state.actions.includes("Existing customer identified")) {
        state.actions.push("Existing customer identified");
      }
      break;
    }

    case "callback_request": {
      reply = `Of course. ${continueQualification(state, "To arrange that,")}`;
      state.callbackOffered = true;
      break;
    }

    case "complaint": {
      reply = `I'm sorry to hear that — thank you for telling us. ${HONEST_TRANSFER} ${state.qualification.name ? "" : "May I take your name and phone number?"}`;
      state.callbackOffered = true;
      state.lastAsked = state.qualification.name ? "phone" : "name";
      if (!state.actions.includes("Complaint logged — human follow-up required")) {
        state.actions.push("Complaint logged — human follow-up required");
      }
      break;
    }

    case "human_request": {
      // Honest escalation: never pretend a transfer happened if a live
      // transfer mechanism isn't actually available (see provider.ts).
      reply = `${HONEST_TRANSFER} ${state.qualification.name ? "" : "May I take your name and phone number?"}`;
      state.callbackOffered = true;
      state.lastAsked = state.qualification.name ? "phone" : "name";
      if (!state.actions.includes("Human escalation requested")) {
        state.actions.push("Human escalation requested");
      }
      break;
    }

    case "confirmation": {
      const yes = /^(yes|yeah|yep|sure|absolutely|definitely|of course|please|sounds good|great|ok|okay)\b/i.test(text);
      const wantsBooking = /book|schedule|appointment|discovery|demo|meeting|consult/i.test(text);
      if (yes && (state.lastAsked === "booking_confirm" || wantsBooking)) {
        state.bookingConfirmed = true;
        if (!state.qualification.serviceInterest) state.qualification.serviceInterest = "Discovery call";
        if (!state.actions.includes("Discovery call requested")) {
          state.actions.push("Discovery call requested");
        }
        reply = `Wonderful — visit ${knowledge.booking.link} to pick a time that suits you. I've noted your request; our team will follow up with the confirmation.`;
        reply = continueQualification(state, reply);
      } else if (yes) {
        reply = continueQualification(state, "Great.");
      } else {
        reply = "No problem at all. Is there anything else I can help you with?";
        state.lastAsked = null;
      }
      break;
    }

    case "thanks": {
      reply = "You're welcome! Is there anything else I can help you with?";
      state.lastAsked = null;
      break;
    }

    case "farewell": {
      callEnded = true;
      reply = farewellMessage(state);
      state.lastAsked = null;
      break;
    }

    default: {
      // Unknown intent — answer the question we last asked, if we asked one.
      if (state.lastAsked === "name" && name) {
        reply = continueQualification(state, `Nice to meet you, ${name}.`);
      } else if (state.lastAsked === "email" && email) {
        reply = continueQualification(state, `Thank you — I've noted your email.`);
      } else if (state.lastAsked === "phone" && phone) {
        reply = continueQualification(state, `Thank you — I've noted your number.`);
      } else if (state.lastAsked === "company" && company) {
        reply = continueQualification(state, `Thanks, ${company} — noted.`);
      } else if (state.lastAsked === "requirements" && text.length > 3) {
        state.qualification.requirements = text.slice(0, 500);
        reply = continueQualification(state, "Understood — thanks for sharing that.");
      } else if (state.lastAsked === "preferredContactTime" && text.length > 2) {
        state.qualification.preferredContactTime = text.slice(0, 200);
        reply = continueQualification(state, "Perfect, I've noted that.");
      } else if (company) {
        reply = continueQualification(state, `Thanks, ${company} — noted.`);
      } else if (name) {
        reply = continueQualification(state, `Nice to meet you, ${name}.`);
      } else if (email) {
        reply = continueQualification(state, `Thank you — I've noted your email.`);
      } else if (phone) {
        reply = continueQualification(state, `Thank you — I've noted your number.`);
      } else if (interest) {
        reply = continueQualification(state, `Great choice — ${interest} is exactly what we do.`);
      } else {
        const c = contactDetail(state);
        reply = c
          ? `${FALLBACK_UNKNOWN} I've noted ${c} — anything else I can help with while you're on the line?`
          : continueQualification(state, FALLBACK_UNKNOWN);
      }
      break;
    }
  }

  // ---- booking confirmation within this turn ----
  if (
    bookingRequested &&
    !state.bookingConfirmed &&
    /^(yes|yeah|yep|sure|absolutely|definitely|book it|confirm|sounds good|ok(ay)?|please|great)\b/i.test(text)
  ) {
    state.bookingConfirmed = true;
    if (!state.qualification.serviceInterest) state.qualification.serviceInterest = "Discovery call";
    if (!state.actions.includes("Discovery call requested")) {
      state.actions.push("Discovery call requested");
    }
    reply = `Wonderful — visit ${knowledge.booking.link} to pick a time that suits you. I've noted your request; our team will follow up with the confirmation.`;
    reply = continueQualification(state, reply);
  }

  setLeadStatus(state);
  state.intent = intent;
  if (
    !state.primaryIntent ||
    INTENT_PRIORITY[intent] > INTENT_PRIORITY[state.primaryIntent]
  ) {
    state.primaryIntent = intent;
  }
  pushTranscript(state, "receptionist", reply);

  return {
    reply,
    actions: [...state.actions],
    leadStatus: state.leadStatus,
    leadQualified: state.leadStatus === "qualified",
    intent,
    callEnded,
    bookingRequested,
  };
}

function farewellMessage(state: CallState): string {
  const q = state.qualification;
  if (isQualified(state) || state.bookingConfirmed) {
    return `Thank you so much for calling — I've noted your details and the team will be in touch shortly. Have a great day!`;
  }
  if (q.name || state.callbackOffered) {
    return `Thanks for calling, ${q.name ? q.name + " — " : ""}someone from the team will follow up with you. Have a great day!`;
  }
  return "Thank you for calling. Feel free to call back any time — have a great day!";
}

// ---------------------------------------------------------------------------
// Call finalization (summary + outcome)
// ---------------------------------------------------------------------------

export function finalizeCall(state: CallState, durationSec: number): CallSummary {
  const q = state.qualification;
  const intent = state.primaryIntent || state.intent;
  const leadStatus = state.leadStatus;

  let outcome = "General inquiry";
  let followUpRequired = false;

  if (state.bookingConfirmed) {
    outcome = "Discovery call requested";
    followUpRequired = true;
  } else if (state.callbackOffered) {
    outcome = "Callback requested";
    followUpRequired = true;
  } else if (intent === "human_request") {
    outcome = "Escalated for human follow-up";
    followUpRequired = true;
  } else if (intent === "complaint") {
    outcome = "Complaint logged";
    followUpRequired = true;
  } else if (leadStatus === "qualified") {
    outcome = "Lead qualified";
    followUpRequired = true;
  } else if (leadStatus === "customer") {
    outcome = "Existing customer — support follow-up";
    followUpRequired = true;
  } else if (intent === "business_hours" || intent === "location" || intent === "pricing") {
    outcome = "Question answered";
  } else {
    outcome = "Call completed";
  }

  const summaryParts: string[] = [];
  if (q.name) summaryParts.push(`Caller: ${q.name}`);
  if (intent) summaryParts.push(`Intent: ${intent}`);
  if (q.serviceInterest) summaryParts.push(`Interested in: ${q.serviceInterest}`);
  if (q.requirements) summaryParts.push(`Requirements: ${q.requirements}`);
  if (q.email) summaryParts.push(`Email: ${q.email}`);
  if (q.phone) summaryParts.push(`Phone: ${q.phone}`);
  if (q.company) summaryParts.push(`Company: ${q.company}`);
  if (q.preferredContactTime) summaryParts.push(`Preferred contact time: ${q.preferredContactTime}`);
  if (state.bookingConfirmed) summaryParts.push("Discovery call booking requested.");
  if (state.callbackOffered) summaryParts.push("Callback requested.");
  summaryParts.push(`Call lasted ${Math.round(durationSec)} seconds.`);

  return {
    summary: summaryParts.join(" "),
    outcome,
    followUpRequired,
    leadStatus,
    intent,
    actions: [...state.actions],
  };
}

// ---------------------------------------------------------------------------
// Record mapping (state → stored call record)
// ---------------------------------------------------------------------------

export function stateToRecord(
  state: CallState,
  summary: CallSummary,
  durationSec: number,
  source: "demo" | "live",
  crmSyncStatus: CallRecord["crmSyncStatus"],
  emailStatus: CallRecord["emailStatus"]
): CallRecord {
  return {
    callId: state.callId,
    businessId: state.config.businessId,
    callerName: state.qualification.name || state.callerName || null,
    callerPhone: state.qualification.phone || state.callerPhone || null,
    callerEmail: state.qualification.email || state.callerEmail || null,
    callerCompany: state.qualification.company || state.callerCompany || null,
    intent: summary.intent,
    leadStatus: summary.leadStatus,
    qualification: state.qualification,
    transcript: state.transcript,
    summary: summary.summary,
    outcome: summary.outcome,
    actions: summary.actions,
    durationSec: Math.max(1, Math.round(durationSec)),
    followUpRequired: summary.followUpRequired,
    followUpStatus: summary.followUpRequired ? "pending" : "none",
    crmSyncStatus,
    emailStatus,
    source,
    recordingAvailable: false,
    transcriptAvailable: true,
    startedAt: new Date(state.startedAt).toISOString(),
    endedAt: nowIso(),
  };
}
