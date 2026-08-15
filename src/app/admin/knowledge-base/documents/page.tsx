import { KBDocumentList } from "@/components/knowledge-base/KBDocumentList";

export const dynamic = "force-dynamic";

export default function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <KBDocumentList initialFilters={undefined} />;
}
