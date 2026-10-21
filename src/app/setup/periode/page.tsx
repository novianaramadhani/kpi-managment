import { db } from "@/db";
import { kpiPeriods } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { createPeriod, deletePeriod, setPeriodStatus } from "@/lib/actions";
import { PeriodTableClient } from "@/components/master-tables-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PeriodeSetupPage() {
  const periods = await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year));

  return (
    <div className="space-y-6">
      {/* Breadcrumb Header */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link href="/admin" className="hover:text-slate-900 transition">
          KPI SYSTEM
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Configuration</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-bold">Periode KPI</span>
      </nav>

      {/* Header Halaman */}
      <PageHeader
        title="Master Periode KPI"
        subtitle="Jadwal evaluasi tahunan, batas waktu penilaian, jendela input, dan syarat eligibilitas."
        backHref="/admin"
        backLabel="Kembali"
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
