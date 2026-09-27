import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";

export const dynamic = "force-dynamic";

// NOTE: no KBShell here — the parent /admin/crm/layout.tsx already provides
// it, and Next.js nests layouts. Rendering KBShell twice caused the duplicate
// sidebar/header ("second panel") bug on the CRM Leads page.
export default async function CrmLeadsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <>{children}</>;
}
