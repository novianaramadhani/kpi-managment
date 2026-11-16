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

      {/* Banner Integrasi Staging Approval */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold text-sky-950">
                Sistem Penilaian Terintegrasi dengan Staging Approval & Hirarki
              </h4>
              <p className="mt-0.5 text-[11px] text-sky-800 leading-relaxed">
                Penilai otomatis mengikuti Atasan Langsung (Hirarki) dan alur persetujuan bertahap di Staging Approval. Penilaian dilakukan pada 1 formulir utuh tanpa pemecahan per parameter.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/setup/access?tab=staging-approval"
              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-2xs hover:bg-sky-50 transition"
            >
              <span>Atur Staging Approval →</span>
            </Link>
            <Link
              href="/setup/access?tab=approval"
              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-2xs hover:bg-sky-50 transition"
            >
              <span>Hirarki Penilai →</span>
            </Link>
          </div>
        </div>
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
