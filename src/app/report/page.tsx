import { getReport } from "@/lib/report";
import { ReportPageClient } from "@/components/report/report-page-client";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const reportData = await getReport(sp.period ? Number(sp.period) : undefined);

  return <ReportPageClient reportData={reportData} />;
}
