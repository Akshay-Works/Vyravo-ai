import { ProposalsDashboard } from "@/components/proposals/ProposalsDashboard";
import { ProposalList } from "@/components/proposals/ProposalList";

export const dynamic = "force-dynamic";

export default function ProposalsPage() {
  return (
    <div className="space-y-10">
      <ProposalsDashboard />
      <ProposalList />
    </div>
  );
}
