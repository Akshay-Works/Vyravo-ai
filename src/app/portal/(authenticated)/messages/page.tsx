"use client";

import { useEffect, useState, useRef } from "react";

export default function PortalMessagesPage() {
  const [messages, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch("/api/portal/messages");
    const d = await res.json();
    setMsgs(d.messages || []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    await fetch("/api/portal/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input }),
    });
    setInput("");
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Messages</span></h1>
      <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col h-[550px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12"><p className="text-4xl mb-4">💬</p><p className="text-grey text-sm">No messages yet. Send a message to start the conversation.</p></div>
          ) : messages.map((m) => (
            <div key={m.id} className={`flex ${m.senderType === "client" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.senderType === "client" ? "bg-gradient-to-br from-primary to-blue-600 text-white rounded-br-sm" : "bg-bg border border-border text-grey rounded-bl-sm"}`}>
                <p className="text-xs font-medium opacity-70 mb-1">{m.senderName || (m.senderType === "team" ? "Vyravo AI" : "You")}</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="p-4 border-t border-border bg-surface/60">
          <div className="flex gap-3">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type your message…"
              className="flex-1 px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
            <button onClick={send} disabled={!input.trim()} className="btn-primary disabled:opacity-50">Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
