import { db } from "@/db";
import {
  departments,
  employees,
  jobLevels,
  jobPositions,
  kpiTemplates,
  kpiPeriods,
  kpiCategories,
} from "@/db/schema";
import { asc, eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TemplateAssignmentManager } from "@/components/assignment/template-assignment-manager";
import { AssessorMatrixManager } from "@/components/assignment/assessor-matrix-manager";
import { DelegationManager } from "@/components/assignment/delegation-manager";
import { FileSpreadsheet, UserCheck, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { tab = "template" } = await searchParams;

  // Normalize tab: "template" | "asesor" | "delegasi"
  let activeTab: "template" | "asesor" | "delegasi" = "template";
  if (tab === "asesor" || tab === "penilai") {
    activeTab = "asesor";
  } else if (tab === "delegasi") {
    activeTab = "delegasi";
  }

  // Fetch all master data in parallel from database
  const [
    deps,
    lvls,
    positions,
    emps,
    tpls,
    periods,
    categories,
  ] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        code: departments.code,
      })
      .from(departments)
      .orderBy(asc(departments.name)),
    db
      .select({
        id: jobLevels.id,
        name: jobLevels.name,
        rank: jobLevels.rank,
      })
      .from(jobLevels)
      .orderBy(asc(jobLevels.rank)),
    db
      .select({
        id: jobPositions.id,
        name: jobPositions.name,
      })
      .from(jobPositions)
      .orderBy(asc(jobPositions.name)),
    db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        jobPosition: employees.jobPosition,
        departmentId: employees.departmentId,
      })
      .from(employees)
      .orderBy(asc(employees.name)),
    db
      .select({
        id: kpiTemplates.id,
        name: kpiTemplates.name,
      })
      .from(kpiTemplates)
      .where(eq(kpiTemplates.isActive, true))
      .orderBy(asc(kpiTemplates.name)),
    db
      .select({
        id: kpiPeriods.id,
        name: kpiPeriods.name,
        year: kpiPeriods.year,
        status: kpiPeriods.status,
      })
      .from(kpiPeriods)
      .orderBy(desc(kpiPeriods.year), desc(kpiPeriods.id)),
    db
      .select({
        id: kpiCategories.id,
        name: kpiCategories.name,
        templateId: kpiCategories.templateId,
        templateName: kpiTemplates.name,
      })
      .from(kpiCategories)
      .innerJoin(kpiTemplates, eq(kpiCategories.templateId, kpiTemplates.id))
      .orderBy(asc(kpiTemplates.name), asc(kpiCategories.name)),
  ]);

  const tabsConfig = [
    {
      id: "template",
      label: "Penugasan Template KPI",
      icon: FileSpreadsheet,
      title: "Penugasan Template KPI",
      subtitle:
        "Atur Employee menggunakan KPI Template apa berdasarkan Periode, Department, Job Level, Jabatan, atau Employee spesifik.",
    },
    {
      id: "asesor",
      label: "Penugasan Asesor KPI",
      icon: UserCheck,
      title: "Penugasan Asesor KPI",
      subtitle:
        "Atur siapa yang menilai siapa (Employee, Asesor, Role, Tahap Penilaian, dan Periode).",
    },
    {
      id: "delegasi",
      label: "Delegasi Penilaian",
      icon: ShieldAlert,
      title: "Delegasi Penilaian",
      subtitle:
        "Atur pelimpahan kewenangan sementara dari Asesor kepada Delegate tanpa mengganti asesor utama dan otomatis expired.",
    },
  ];

  const currentTab = tabsConfig.find((t) => t.id === activeTab) || tabsConfig[0];

  return (
    <div className="space-y-4">
      {/* Header Halaman (Single Back Navigation) */}
      <PageHeader
        title={currentTab.title}
        subtitle={currentTab.subtitle}
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs (Soft Light-Blue Active State) */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 max-w-fit">
        {tabsConfig.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <Link
              key={t.id}
              href={`/setup/assignments?tab=${t.id}`}
              prefetch={false}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs transition ${
                isActive
                  ? "bg-sky-100/90 text-sky-950 font-semibold border border-sky-200/80"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-sky-800" : "text-slate-400"}`} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Sub-menu 1: Penugasan Template KPI */}
      {activeTab === "template" && (
        <TemplateAssignmentManager
          periods={periods}
          departments={deps}
          jobLevels={lvls}
          jobPositions={positions}
          templates={tpls}
        />
      )}

      {/* Sub-menu 2: Penugasan Asesor KPI */}
      {activeTab === "asesor" && (
        <AssessorMatrixManager
          periods={periods}
          departments={deps}
          jobLevels={lvls}
          jobPositions={positions}
          employees={emps}
          parameters={categories}
        />
      )}

      {/* Sub-menu 3: Delegasi Penilaian */}
      {activeTab === "delegasi" && (
        <DelegationManager
          periods={periods}
          departments={deps}
          employees={emps}
          parameters={categories}
        />
      )}
    </div>
  );
}
