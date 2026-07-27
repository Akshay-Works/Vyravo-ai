import type { Metadata } from "next";
import { CRMSidebar } from "@/components/crm/CRMSidebar";
import { CRMHeader } from "@/components/crm/CRMHeader";

export const metadata: Metadata = {
  title: {
    default: "CRM | Vyravo AI",
    template: "%s | Vyravo AI CRM",
  },
  description: "Vyravo AI CRM - Manage leads, clients, projects, and more.",
};

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <CRMSidebar />
      <div className="lg:pl-64">
        <CRMHeader />
        <main className="p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
