import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { KBShell } from "@/components/knowledge-base/KBShell";
export const dynamic = "force-dynamic";
export default async function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <KBShell>{children}</KBShell>;
}
