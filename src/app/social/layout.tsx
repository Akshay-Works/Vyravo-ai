import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import WorkspaceShell from "@/components/WorkspaceShell";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/social", label: "Overview", icon: "📊" },
  { href: "/social/calendar", label: "Calendar", icon: "🗓️" },
  { href: "/social/create", label: "Create", icon: "✍️" },
  { href: "/social/tasks", label: "Tasks", icon: "✅" },
  { href: "/social/assets", label: "Assets", icon: "🎨" },
  { href: "/social/analytics", label: "Analytics", icon: "📈" },
];

export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "sales") redirect("/sales");
  return (
    <WorkspaceShell items={NAV} title="Social Media Studio" accent="bg-violet-600" homeHref="/social"
      admin={user.role === "admin"} userName={user.name}>
      {children}
    </WorkspaceShell>
  );
}
