import { ProposalDetail } from "@/components/proposals/ProposalDetail";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalDetail id={id} />;
}
