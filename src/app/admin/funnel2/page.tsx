import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { Funnel2Dashboard } from "./Funnel2Dashboard";

export const dynamic = "force-dynamic";

export default async function AdminFunnel2Page() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <Funnel2Dashboard />;
}
