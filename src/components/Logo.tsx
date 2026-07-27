import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 group ${className}`}>
      {/* Abstract V mark */}
      <div className="relative w-8 h-8 flex items-center justify-center">
        <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
          <path
            d="M9 10L16 22L23 10"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="logo-gradient" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className="text-xl font-semibold tracking-tight font-[var(--font-heading)]">
        <span className="text-white group-hover:text-primary transition-colors">Vyravo</span>
        <span className="text-grey ml-1.5 text-base font-medium">AI</span>
      </span>
    </Link>
  );
}
