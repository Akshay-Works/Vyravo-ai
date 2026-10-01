"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-grey hover:text-white"
      title="Copy to clipboard"
    >
      {done ? "✅ Copied" : "📋 Copy"}
    </button>
  );
}
