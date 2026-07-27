"use client";

import Link from "next/link";
import type { QuickAction } from "@/lib/chatbot/types";

interface QuickActionsProps {
  actions: QuickAction[];
  onActionClick: (action: QuickAction) => void;
}

export function QuickActions({ actions, onActionClick }: QuickActionsProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-start">
      {actions.map((action) => {
        if (action.action === "link") {
          return (
            <Link
              key={action.id}
              href={action.value}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            >
              {action.label}
            </Link>
          );
        }

        return (
          <button
            key={action.id}
            onClick={() => onActionClick(action)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-border bg-surface hover:border-primary/30 hover:bg-primary/5 text-grey hover:text-white transition-colors"
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
