import { ClientAdminDetail } from "@/components/portal/ClientAdminDetail";

export const dynamic = "force-dynamic";
export default async function AdminPortalClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientAdminDetail id={id} />;
}
