import { db } from "@/db";
import { kpiPeriods } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { createPeriod, deletePeriod, setPeriodStatus } from "@/lib/actions";
import { PeriodTableClient } from "@/components/master-tables-client";
import { getCurrentUser } from "@/lib/auth";
import { hasUserPermission } from "@/lib/rbac-catalog";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PeriodeSetupPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const canAccess =
    currentUser.role === "ADMIN" ||
    currentUser.role === "HR" ||
    currentUser.isCustomRole ||
    hasUserPermission(currentUser, "period.manage");
  if (!canAccess) {
    redirect("/dashboard");
  }

  const periods = await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year));

  return (
    <div className="space-y-4">
      {/* Header Halaman (Single Back Navigation) */}
      <PageHeader
        title="Master Periode KPI"
        subtitle="Jadwal evaluasi tahunan, batas waktu penilaian, jendela input, dan syarat eligibilitas."
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Tabel Master Periode KPI */}
      <PeriodTableClient
        periods={periods}
        createAction={createPeriod}
        setStatusAction={setPeriodStatus}
        deleteAction={deletePeriod}
      />
    </div>
  );
}
