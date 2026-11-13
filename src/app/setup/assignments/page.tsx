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
import { hasUserPermission } from "@/lib/rbac-catalog";
import { redirect } from "next/navigation";
import { AssessorMatrixManager } from "@/components/assignment/assessor-matrix-manager";
import { DelegationManager } from "@/components/assignment/delegation-manager";

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

  const canAccess =
    currentUser.role === "ADMIN" ||
    currentUser.role === "HR" ||
    currentUser.isCustomRole ||
    hasUserPermission(currentUser, "template.assign") ||
    hasUserPermission(currentUser, "master.approval_hierarchy.manage");
  if (!canAccess) {
    redirect("/dashboard");
  }

  const { tab = "asesor" } = await searchParams;

  // Normalize tab: "asesor" | "delegasi"
  let activeTab: "asesor" | "delegasi" = "asesor";
  if (tab === "delegasi") {
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
        code: kpiTemplates.code,
        departmentId: kpiTemplates.departmentId,
        jobLevelId: kpiTemplates.jobLevelId,
        jobPositionId: kpiTemplates.jobPositionId,
        employeeId: kpiTemplates.employeeId,
        isCustom: kpiTemplates.isCustom,
      })
      .from(kpiTemplates)
      .orderBy(asc(kpiTemplates.departmentId), asc(kpiTemplates.name)),
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
      id: "asesor",
      label: "Penugasan Asesor KPI",
      title: "Penugasan Asesor KPI",
      subtitle:
        "Daftar seluruh Template KPI yang tersedia untuk pengaturan penilai (asesor), role, dan tahap penilaian.",
    },
    {
      id: "delegasi",
      label: "Delegasi Penilaian",
      title: "Delegasi Penilaian",
      subtitle:
        "Kelola pelimpahan wewenang penilaian sementara antar asesor.",
    },
  ];

  const currentTab = tabsConfig.find((t) => t.id === activeTab) || tabsConfig[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title={currentTab.title}
        subtitle={currentTab.subtitle}
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs */}
      <div
        data-tour="step-4-assign-tabs"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 max-w-fit shadow-2xs"
      >
        {tabsConfig.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <Link
              key={t.id}
              href={`/setup/assignments?tab=${t.id}`}
              prefetch={false}
              className={`inline-flex items-center rounded-lg px-3.5 py-1.5 text-xs transition ${
                isActive
                  ? "bg-blue-600 text-white font-semibold shadow-2xs"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
              }`}
            >
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Tab 1: Penugasan Asesor KPI (Berdasarkan Daftar Template yang Sudah Ada) */}
      {activeTab === "asesor" && (
        <AssessorMatrixManager
          periods={periods}
          departments={deps}
          jobLevels={lvls}
          jobPositions={positions}
          employees={emps}
          templates={tpls}
          parameters={categories}
        />
      )}

      {/* Tab 2: Delegasi Penilaian */}
      {activeTab === "delegasi" && (
        <DelegationManager
          periods={periods}
          departments={deps}
          employees={emps}
          templates={tpls}
          parameters={categories}
        />
      )}
    </div>
  );
}
