import { KBDocumentDetail } from "@/components/knowledge-base/KBDocumentDetail";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KBDocumentDetail id={id} />;
}
