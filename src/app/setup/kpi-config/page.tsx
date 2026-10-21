import { db } from "@/db";
import {
  kpiMeasurementTypes,
  kpiDirections,
  kpiScoringMethods,
} from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MeasurementTypeManager } from "@/components/kpi-config/measurement-type-manager";
import { KpiDirectionManager } from "@/components/kpi-config/kpi-direction-manager";
import { ScoringMethodManager } from "@/components/kpi-config/scoring-method-manager";
import { Layers, Compass, Calculator } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function KpiConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { tab = "measurement" } = await searchParams;

  // Normalize activeTab
  let activeTab: "measurement" | "direction" | "scoring" = "measurement";
  if (tab === "direction") {
    activeTab = "direction";
  } else if (tab === "scoring" || tab === "method") {
    activeTab = "scoring";
  }

  // Fetch actual configuration from database in parallel
  const [measurementTypes, directions, scoringMethods] = await Promise.all([
    db
      .select()
      .from(kpiMeasurementTypes)
      .orderBy(asc(kpiMeasurementTypes.sortOrder), asc(kpiMeasurementTypes.name)),
    db
      .select()
      .from(kpiDirections)
      .orderBy(asc(kpiDirections.sortOrder), asc(kpiDirections.name)),
    db
      .select()
      .from(kpiScoringMethods)
      .orderBy(asc(kpiScoringMethods.sortOrder), asc(kpiScoringMethods.name)),
  ]);

  const tabsConfig = [
    {
      id: "measurement",
      label: "Measurement Type",
      icon: Layers,
      title: "Measurement Type",
      subtitle:
        "Konfigurasi tipe nilai Actual seperti Number, Percentage, Currency, Count, Days, Ratio, Boolean, Rating, dan Text.",
    },
    {
      id: "direction",
      label: "KPI Direction",
      icon: Compass,
      title: "KPI Direction",
      subtitle:
        "Konfigurasi arah target pencapaian KPI: Higher is Better, Lower is Better, Exact Target, dan Target Range.",
    },
    {
      id: "scoring",
      label: "Scoring Method",
      icon: Calculator,
      title: "Scoring Method",
      subtitle:
        "Konfigurasi metode perhitungan skor: Criteria Based, Formula Based, Direct Score, dan Rating Based.",
    },
  ];

  const currentTab = tabsConfig.find((t) => t.id === activeTab) || tabsConfig[0];

  return (
    <div className="space-y-4">
      {/* Breadcrumb Header */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/admin" className="hover:text-slate-900 transition">
          WORKSPACE
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-semibold">KPI Configuration</span>
      </nav>

      {/* Header Halaman */}
      <PageHeader
        title="KPI Configuration"
        subtitle="Pengaturan master tipe pengukuran actual, arah target pencapaian, dan metode kalkulasi penilaian KPI."
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs (3 Sub-Menu) */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/70 p-1">
        {tabsConfig.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <Link
              key={t.id}
              href={`/setup/kpi-config?tab=${t.id}`}
              prefetch={false}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs transition-colors ${
                isActive
                  ? "bg-slate-900 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/80 font-medium"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Sub-menu 1: Measurement Type */}
      {activeTab === "measurement" && (
        <MeasurementTypeManager initialData={measurementTypes} />
      )}

      {/* Sub-menu 2: KPI Direction */}
      {activeTab === "direction" && (
        <KpiDirectionManager initialData={directions} />
      )}

      {/* Sub-menu 3: Scoring Method */}
      {activeTab === "scoring" && (
        <ScoringMethodManager initialData={scoringMethods} />
      )}
    </div>
  );
}
