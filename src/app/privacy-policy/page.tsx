import type { Metadata } from "next";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Vyravo AI privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="section-padding pt-32 md:pt-40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          Legal
        </span>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight font-[var(--font-heading)]">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-grey">Last Updated: August 2026</p>

        <div className="mt-10 space-y-8 text-grey leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">1. Introduction</h2>
            <p>Vyravo AI is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">2. Data Collection</h2>
            <p>We collect information that you provide directly to us, including:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Name, email address, and phone number when you fill out contact forms</li>
              <li>Company name and size when booking discovery calls</li>
              <li>Project details and service preferences</li>
              <li>Communication records when you contact us</li>
            </ul>
            <p className="mt-3">We also automatically collect certain information when you visit our website, including IP address, browser type, pages visited, and referring URL.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">3. Cookies</h2>
            <p>We use cookies and similar tracking technologies to improve your browsing experience, analyze website traffic, and understand where visitors come from. You can control cookie preferences through your browser settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">4. Analytics</h2>
            <p>We may use third-party analytics services to help us understand how our website is used. These services may collect information about your use of our website and report trends without identifying individual visitors.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">5. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>To respond to your inquiries and provide customer support</li>
              <li>To schedule and conduct discovery calls</li>
              <li>To send project proposals and quotes</li>
              <li>To improve our website and services</li>
              <li>To send relevant business communications (with your consent)</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">6. GDPR Compliance</h2>
            <p>If you are a resident of the European Economic Area (EEA), you have certain data protection rights under the General Data Protection Regulation (GDPR). We process your personal data only when we have a lawful basis to do so, including consent, contractual necessity, or legitimate interest.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">7. Security</h2>
            <p>We implement industry-standard security measures to protect your personal information, including encryption, access controls, and secure data storage. However, no method of transmission over the internet is 100% secure.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Access your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Request data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">9. Data Retention</h2>
            <p>We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected, or as required by law. Contact form submissions are retained for 2 years. Project-related data is retained for 5 years after project completion.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">10. Third Parties</h2>
            <p>We do not sell your personal information to third parties. We may share your data with trusted service providers who assist us in operating our business (hosting, analytics, email services), subject to strict confidentiality agreements.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">11. Disclaimer</h2>
            <p>This privacy policy may be updated from time to time. We will notify you of any material changes by posting the updated policy on our website with a new &quot;Last updated&quot; date.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">12. Contact Information</h2>
            <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
            <div className="mt-3 space-y-1">
              <p>Email: <a href={COMPANY.emailLink} className="text-primary hover:underline">{COMPANY.email}</a></p>
              <p>Phone: <a href={COMPANY.phoneLink} className="text-primary hover:underline">{COMPANY.phone}</a></p>
              <p>LinkedIn: <a href={COMPANY.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Vyravo AI on LinkedIn</a></p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
