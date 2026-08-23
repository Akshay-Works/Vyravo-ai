import { SITE_LINKS } from "@/lib/constants";

export function WhatsAppCTA({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={SITE_LINKS.whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Vyravo AI on WhatsApp"
      className={
        compact
          ? "inline-flex items-center gap-2 rounded-lg border border-[#25D366]/35 bg-[#25D366]/10 px-4 py-2.5 text-sm font-medium text-[#8af0ad] transition-colors hover:border-[#25D366]/60 hover:bg-[#25D366]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          : "inline-flex items-center justify-center gap-2 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-6 py-3.5 text-sm font-medium text-[#8af0ad] transition-colors hover:border-[#25D366]/70 hover:bg-[#25D366]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      }
    >
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.52 3.48A11.82 11.82 0 0 0 12.08 0C5.56 0 .25 5.3.25 11.83c0 2.08.54 4.1 1.56 5.88L.15 24l6.43-1.64a11.8 11.8 0 0 0 5.5 1.4h.01c6.52 0 11.82-5.31 11.82-11.83 0-3.16-1.23-6.13-3.39-8.45ZM12.09 21.74h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.22-3.82.98 1.02-3.72-.23-.38a9.85 9.85 0 0 1-1.51-5.2C2.15 6.38 6.6 1.93 12.08 1.93c2.66 0 5.16 1.04 7.04 2.92a9.9 9.9 0 0 1 2.91 7.06c0 5.48-4.46 9.93-9.94 9.93Zm5.45-7.44c-.3-.15-1.77-.87-2.05-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.28-.47-2.44-1.5-.9-.8-1.51-1.78-1.69-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.68-1.64-.93-2.24-.24-.59-.49-.51-.68-.52h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.5 1.69.64.71.23 1.35.2 1.86.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      </svg>
      <span>Chat with Vyravo AI on WhatsApp</span>
      <span aria-hidden="true" className="text-base">↗</span>
    </a>
  );
}
