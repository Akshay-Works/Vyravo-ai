"use client";

import { useState } from "react";

interface AccordionItem {
  question: string;
  answer: string;
}

export function Accordion({ items, columns = 1 }: { items: AccordionItem[]; columns?: number }) {
  if (columns === 2) {
    const mid = Math.ceil(items.length / 2);
    const left = items.slice(0, mid);
    const right = items.slice(mid);
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          {left.map((item, i) => (
            <AccordionRow key={i} item={item} />
          ))}
        </div>
        <div className="space-y-3">
          {right.map((item, i) => (
            <AccordionRow key={i} item={item} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {items.map((item, i) => (
        <AccordionRow key={i} item={item} />
      ))}
    </div>
  );
}

function AccordionRow({ item }: { item: AccordionItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border transition-colors ${
        open ? "border-primary/30 bg-surface-2" : "border-border bg-surface"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-white pr-4">{item.question}</span>
        <svg
          className={`w-5 h-5 text-grey shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-grey leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}
