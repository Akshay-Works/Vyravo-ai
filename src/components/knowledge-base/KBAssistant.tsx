"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Source {
  documentId: number;
  documentTitle: string;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  excerpt: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  confidence?: number;
  gapCreated?: boolean;
}

const SUGGESTED = [
  "What services should I recommend to a real estate agency?",
  "What is our onboarding process for new clients?",
  "What should I ask a prospect during discovery?",
  "What integrations do we support?",
  "What does our AI Voice Receptionist do?",
  "How long does implementation usually take?",
];

export function KBAssistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/knowledge-base/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          sessionId,
          accessLevels: ["public", "internal", "confidential"],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");

      const assistantMsg: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.answer,
        sources: json.sources || [],
        confidence: json.confidence,
        gapCreated: json.gapCreated,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I encountered an error: ${e?.message || "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          AI Knowledge <span className="gradient-text">Assistant</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Ask questions about Vyravo AI. Answers are grounded in the approved Knowledge Base with sources — the assistant never invents company information.
        </p>
      </div>

      {/* Chat window */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col h-[65vh]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" viewBox="0 0 32 32" fill="none">
                  <path d="M9 10L16 22L23 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-lg font-semibold font-[var(--font-heading)]">Knowledge Assistant</p>
              <p className="mt-2 text-sm text-grey max-w-md mx-auto">
                Ask about services, pricing, processes, sales playbooks, SOPs, and more. Every answer shows its sources.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-3 py-2 rounded-lg border border-border bg-bg text-xs text-grey hover:text-white hover:border-primary/40 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-primary to-blue-600 text-white rounded-br-sm"
                    : "bg-bg border border-border text-grey rounded-bl-sm"
                }`}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>

                {m.gapCreated && (
                  <div className="mt-3 text-xs px-3 py-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400">
                    🕳️ This question was recorded as a knowledge gap.
                  </div>
                )}

                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-semibold text-white mb-2">
                      📚 Sources ({m.sources.length})
                    </p>
                    <ul className="space-y-1.5">
                      {m.sources.map((s, i) => (
                        <li key={i}>
                          <Link
                            href={`/admin/knowledge-base/documents/${s.documentId}`}
                            className="text-xs text-primary hover:underline"
                          >
                            [{i + 1}] {s.documentTitle}
                            {s.section ? ` — ${s.section}` : ""}
                            {s.pageNumber ? ` (p.${s.pageNumber})` : ""}
                          </Link>
                          {s.sourceUrl && (
                            <a
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-xs text-accent hover:underline"
                            >
                              ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-bg border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-surface/60">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask the Knowledge Base…"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50 disabled:opacity-50"
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="btn-primary disabled:opacity-50">
              Send
            </button>
          </div>
          <p className="mt-2 text-[11px] text-grey-dark">
            Grounded in approved knowledge only · citations included · hallucination-guarded
          </p>
        </div>
      </div>
    </div>
  );
}
