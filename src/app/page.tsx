import type { Metadata } from "next";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Vyravo AI terms and conditions — services, payments, intellectual property, and client responsibilities.",
};

export default function TermsPage() {
  return (
    <main className="section-padding pt-32 md:pt-40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          Legal
        </span>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight font-[var(--font-heading)]">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-sm text-grey">Last updated: January 2025</p>

        <div className="mt-10 space-y-8 text-grey leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">1. Services</h2>
            <p>Vyravo AI provides AI automation services including, but not limited to, AI chatbot development, workflow automation, AI voice agent development, AI sales automation, AI consulting, and custom AI solution development. The specific scope of services will be outlined in a project proposal or statement of work agreed upon by both parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">2. Payments</h2>
            <p>Payment terms are specified in the project proposal. Unless otherwise agreed:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>40% of the project fee is due upon signing the agreement</li>
              <li>30% is due upon reaching the project midpoint milestone</li>
              <li>30% is due upon final delivery and approval</li>
            </ul>
            <p className="mt-3">All payments are due within 7 business days of invoice date unless otherwise specified.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">3. Refund Policy</h2>
            <p>If we are unable to deliver the agreed-upon solution as specified in the project proposal, we will refund the remaining balance of the project fee. Refunds for completed milestones are not available, as work has already been delivered and approved. In case of project cancellation by the client, a cancellation fee of up to 25% of the total project value may apply.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">4. Project Ownership</h2>
            <p>Upon full payment, the client receives complete ownership of the custom-built solution, including source code, documentation, and all deliverables. Vyravo AI retains the right to use non-confidential aspects of the project for portfolio and marketing purposes unless otherwise agreed.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">5. Intellectual Property</h2>
            <p>All intellectual property created specifically for the client&apos;s project is transferred to the client upon full payment. Pre-existing frameworks, libraries, and tools developed by Vyravo AI remain our intellectual property but are licensed to the client for use within the agreed scope.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">6. Confidentiality</h2>
            <p>Both parties agree to maintain the confidentiality of all proprietary information, business data, trade secrets, and project details shared during the engagement. This obligation survives the termination of the agreement for a period of 2 years. We are happy to sign mutual NDAs upon request.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">7. Termination</h2>
            <p>Either party may terminate the agreement with 14 days written notice. In case of termination:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>The client pays for all completed work and milestones</li>
              <li>Vyravo AI delivers all completed work to the client</li>
              <li>Both parties return any confidential information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">8. Limitation of Liability</h2>
            <p>Vyravo AI&apos;s total liability for any claims arising from the services shall not exceed the total amount paid by the client for the specific project. We are not liable for indirect, incidental, consequential, or punitive damages, including lost profits or data loss.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">9. Client Responsibilities</h2>
            <p>The client agrees to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Provide timely access to required data, systems, and resources</li>
              <li>Designate a point of contact for project communication</li>
              <li>Provide feedback within agreed timelines</li>
              <li>Ensure accuracy and legality of provided content and data</li>
              <li>Make payments according to the agreed schedule</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">10. Warranty</h2>
            <p>Vyravo AI provides a 30-day warranty period after project delivery. During this period, we will fix any bugs or issues related to the delivered solution at no additional cost. Extended maintenance is available through separate maintenance packages.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">11. Governing Law</h2>
            <p>These terms and conditions shall be governed by and construed in accordance with the laws of India. Any disputes shall be resolved through good-faith negotiation first, followed by arbitration if necessary.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white font-[var(--font-heading)] mb-3">12. Contact Information</h2>
            <p>For any questions regarding these Terms &amp; Conditions, please contact us:</p>
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
