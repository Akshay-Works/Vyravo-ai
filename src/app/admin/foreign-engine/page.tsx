import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { ForeignEngineDashboard } from "./ForeignEngineDashboard";

export const dynamic = "force-dynamic";

export default async function AdminForeignEnginePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <ForeignEngineDashboard />;
}
