import { LeadDetailContent } from "./lead-detail-content";

export const metadata = {
  title: "Lead Details",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadDetailContent leadId={id} />;
}
