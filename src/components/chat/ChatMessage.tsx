"use client";

import { memo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

function ChatMessageComponent({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-gradient-to-br from-primary to-accent text-white"
        }`}
      >
        {isUser ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M9 10L16 17L23 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(-4, -1) scale(0.8)" />
          </svg>
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-white rounded-tr-sm"
            : "bg-surface-2 text-white rounded-tl-sm border border-border"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-white">
            <ReactMarkdown
              components={{
                p: ({ children }: { children?: ReactNode }) => <p className="my-1">{children}</p>,
                ul: ({ children }: { children?: ReactNode }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                li: ({ children }: { children?: ReactNode }) => <li className="my-0.5">{children}</li>,
                strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
                a: ({ href, children }: { href?: string; children?: ReactNode }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        
        {/* Streaming indicator */}
        {isStreaming && (
          <span className="inline-flex gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
