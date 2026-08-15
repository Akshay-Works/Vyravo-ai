import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { KBShell } from "@/components/knowledge-base/KBShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge Base",
  robots: { index: false, follow: false },
};

export default async function KnowledgeBaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return <KBShell>{children}</KBShell>;
}
