"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { QuickActions } from "./QuickActions";
import { TypingIndicator } from "./TypingIndicator";
import { SITE_LINKS } from "@/lib/constants";
import type { QuickAction, ConversationContext } from "@/lib/chatbot/types";

/** Client-side ceiling for a chat round trip (the server also has its own). */
const REQUEST_TIMEOUT_MS = 30_000;
/** Minimum perceived turn length, so instant answers still feel conversational. */
const MIN_TURN_MS = 700;
/** Never add more than this on top of a real response. */
const MAX_TYPING_PAD_MS = 500;

const DISCOVERY_CALL_URL = SITE_LINKS.discoveryCall;
const WELCOME_FALLBACK = "Hi! 👋 Welcome to Vyravo AI. How can I help you today?";
const ERROR_FALLBACK =
  "Sorry, I'm having trouble processing that right now. Please try again or book a discovery call.";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedActions?: QuickAction[];
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Guards against duplicate submissions (double-click, Enter spam, quick
  // actions fired while a request is already in flight).
  const isSendingRef = useRef(false);

  // Abort in-flight requests if the component unmounts.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Fetch welcome message on first open
  useEffect(() => {
    if (isOpen && !hasInitialized) {
      fetchWelcomeMessage();
      setHasInitialized(true);
    }
  }, [isOpen, hasInitialized]);

  const fetchWelcomeMessage = async () => {
    setIsTyping(true);
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();

      // Simulate typing delay for natural feel
      await new Promise(resolve => setTimeout(resolve, 800));

      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response || WELCOME_FALLBACK,
          suggestedActions: data.suggestedActions,
        },
      ]);
    } catch (error) {
      console.error("Failed to fetch welcome message:", error);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: WELCOME_FALLBACK,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    // Ignore empty input and reject overlapping sends.
    if (!trimmed || isSendingRef.current) return;
    isSendingRef.current = true;

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, context }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => null);
      const replyText: string = data?.response || ERROR_FALLBACK;

      // Keep the "typing" beat natural without adding latency to a slow AI
      // response — only pad when the server answered faster than that beat.
      const elapsed = Date.now() - startedAt;
      const padding = Math.max(0, Math.min(MAX_TYPING_PAD_MS, MIN_TURN_MS - elapsed));
      if (padding > 0) await new Promise(resolve => setTimeout(resolve, padding));

      // Update context (only when the server returned a usable one)
      if (data?.context) {
        setContext(data.context);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: replyText,
        suggestedActions: data?.suggestedActions,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      // Network failure, timeout, or unmount — show a clean, actionable message.
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) console.error("Chat error:", error);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: ERROR_FALLBACK,
          suggestedActions: [
            { id: "book", label: "📅 Book Discovery Call", action: "link", value: DISCOVERY_CALL_URL },
          ],
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      isSendingRef.current = false;
      setIsTyping(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.action === "message") {
      sendMessage(action.value);
    }
    // Links are handled by QuickActions component directly
  };

  const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg shadow-primary/20 flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? "bg-surface border border-border rotate-0"
            : "bg-gradient-to-br from-primary to-accent hover:shadow-xl hover:shadow-primary/30 hover:scale-105"
        }`}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Notification dot when closed */}
      {!isOpen && !hasInitialized && (
        <span className="fixed bottom-[72px] right-6 z-50 w-3 h-3 rounded-full bg-accent animate-pulse" />
      )}

      {/* Chat Window */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] transition-all duration-300 ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        role="dialog"
        aria-label="Vyravo AI assistant"
        aria-hidden={!isOpen}
      >
        <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-border flex flex-col h-[600px] max-h-[calc(100vh-140px)]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-surface/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 32 32" fill="none">
                  <path d="M9 10L16 22L23 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white">Vyravo AI</h3>
                <p className="text-xs text-grey flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Always online
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-grey hover:text-white transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={isTyping}
            aria-label="Conversation"
          >
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            
            {isTyping && <TypingIndicator />}
            
            {/* Quick Actions */}
            {!isTyping && lastAssistantMessage?.suggestedActions && (
              <div className="pl-11">
                <QuickActions
                  actions={lastAssistantMessage.suggestedActions}
                  onActionClick={handleQuickAction}
                />
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border bg-surface/60 backdrop-blur-sm">
            <ChatInput onSend={sendMessage} disabled={isTyping} />
          </div>
        </div>
      </div>
    </>
  );
}
