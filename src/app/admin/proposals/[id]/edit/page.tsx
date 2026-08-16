import { ProposalEditor } from "@/components/proposals/ProposalEditor";

export const dynamic = "force-dynamic";

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalEditor id={id} />;
}
