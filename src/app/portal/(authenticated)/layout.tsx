import { redirect } from "next/navigation";
import { isPortalAuthenticated } from "@/lib/portal/auth";
import { PortalShell } from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client Portal", robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPortalAuthenticated())) redirect("/portal/login");
  return <PortalShell>{children}</PortalShell>;
}
