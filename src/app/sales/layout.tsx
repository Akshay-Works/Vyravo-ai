import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import WorkspaceShell from "@/components/WorkspaceShell";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/sales", label: "Overview", icon: "📊" },
  { href: "/sales/leads", label: "My Leads", icon: "👥" },
  { href: "/sales/calls", label: "Call Queue", icon: "📞" },
  { href: "/sales/tasks", label: "Follow-ups", icon: "📌" },
  { href: "/sales/meetings", label: "Meetings", icon: "📅" },
  { href: "/sales/performance", label: "Performance", icon: "🏆" },
];

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "social") redirect("/social");
  return (
    <WorkspaceShell items={NAV} title="Sales Dashboard" accent="bg-emerald-600" homeHref="/sales"
      admin={user.role === "admin"} userName={user.name}>
      {children}
    </WorkspaceShell>
  );
}
