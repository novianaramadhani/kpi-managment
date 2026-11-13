import { getReport } from "@/lib/report";
import { ReportPageClient } from "@/components/report/report-page-client";
import { getCurrentUser } from "@/lib/auth";
import { hasUserPermission } from "@/lib/rbac-catalog";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const currentUser = await getCurrentUser();
  const canViewAllOu = hasUserPermission(currentUser, "ou.view_all");
  const reportData = await getReport(sp.period ? Number(sp.period) : undefined);

  if (!canViewAllOu && currentUser?.operatingUnit) {
    const userOu = currentUser.operatingUnit.toUpperCase();
    reportData.rows = reportData.rows.filter((r) => r.operatingUnit === userOu);
  }

  return (
    <ReportPageClient
      reportData={reportData}
      canViewAllOu={canViewAllOu}
      userOu={currentUser?.operatingUnit || "HO"}
    />
  );
}
