import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ChatWidget } from "@/components/chat";

export const metadata: Metadata = {
  title: {
    default: "Vyravo AI — Intelligent Automation for Modern Businesses",
    template: "%s | Vyravo AI",
  },
  description:
    "Vyravo AI builds AI chatbots, voice agents, workflow automation & custom AI solutions that save time, reduce costs, and scale your business.",
  keywords: [
    "AI automation",
    "AI chatbots",
    "AI voice agents",
    "workflow automation",
    "AI consulting",
    "business automation",
    "enterprise AI",
    "AI sales automation",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Vyravo AI",
    title: "Vyravo AI — Intelligent Automation for Modern Businesses",
    description:
      "We build AI chatbots, voice agents, and intelligent automation systems that eliminate repetitive work and accelerate business growth.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vyravo AI — Intelligent Automation for Modern Businesses",
    description:
      "We build AI chatbots, voice agents, and intelligent automation systems that eliminate repetitive work and accelerate business growth.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Vyravo AI",
              description:
                "Intelligent Automation for Modern Businesses. AI chatbots, voice agents, workflow automation & custom AI solutions.",
              url: "https://vyravo.com",
              contactPoint: {
                "@type": "ContactPoint",
                telephone: "+91-9075707650",
                email: "akshay.navale.work@gmail.com",
                contactType: "sales",
              },
              sameAs: [
                "https://www.linkedin.com/in/akshay-n-2692851b7",
              ],
            }),
          }}
        />
      </head>
      <body className="bg-bg text-white antialiased font-[var(--font-body)]">
        <Header />
        {children}
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
