import Link from "next/link";
import { SITE_LINKS } from "@/lib/constants";

function isExternal(href: string) {
  return href.startsWith("http");
}

export function CTA({
  title = "Ready to Automate Your Business?",
  description = "Book a free discovery call and let us show you how AI can save time, reduce costs, and help your business scale.",
  primaryText = "Book Free Discovery Call",
  primaryHref = SITE_LINKS.discoveryCall,
  secondaryText = "Explore Solutions",
  secondaryHref = "/services",
}: {
  title?: string;
  description?: string;
  primaryText?: string;
  primaryHref?: string;
  secondaryText?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="section-padding">
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative rounded-2xl overflow-hidden p-12 md:p-16 lg:p-20">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-surface to-accent/10 animate-gradient" />
          <div className="absolute inset-0 border border-white/5 rounded-2xl" />

          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight font-[var(--font-heading)]">
              {title}
            </h2>
            <p className="mt-4 text-grey text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              {description}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isExternal(primaryHref) ? (
                <a href={primaryHref} target="_blank" rel="noopener noreferrer" className="btn-primary text-base px-8 py-3.5">
                  {primaryText}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              ) : (
                <Link href={primaryHref} className="btn-primary text-base px-8 py-3.5">
                  {primaryText}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              )}
              <Link href={secondaryHref} className="btn-secondary text-base px-8 py-3.5">
                {secondaryText}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
