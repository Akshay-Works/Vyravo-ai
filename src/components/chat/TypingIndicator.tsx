"use client";

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-accent text-white">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M9 10L16 17L23 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(-4, -1) scale(0.8)" />
        </svg>
      </div>

      {/* Typing bubble */}
      <div className="bg-surface-2 rounded-2xl rounded-tl-sm border border-border px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-grey/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-grey/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-grey/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
