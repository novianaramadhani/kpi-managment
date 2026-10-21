import { Metadata } from "next";
import { db } from "@/db";
import { appraisals, departments, kpiPeriods } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import {
  getMonthlyAssessmentEmployees,
  getMonthlyAssessmentDetail,
} from "@/lib/monthly-assessment-service";
import { MonthlyAssessmentView } from "@/components/kpi/monthly-assessment-view";
import { KpiAssessmentListView } from "@/components/kpi/kpi-assessment-list-view";
import type { EmployeeProgressItem } from "@/types/monthly-assessment";

export const metadata: Metadata = {
  title: "Penilaian KPI Bulanan · Performance Management",
  description: "Daftar dan formulir penilaian kinerja bulanan karyawan",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface PageProps {
  searchParams?: Promise<{
    employeeId?: string;
    id?: string;
    month?: string;
    year?: string;
  }>;
}

export default async function InputKpiPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};

  // 1. Dapatkan daftar tahun periode yang tersedia di database
  const periods = await db
    .select({ id: kpiPeriods.id, year: kpiPeriods.year, status: kpiPeriods.status })
    .from(kpiPeriods)
    .orderBy(desc(kpiPeriods.year));

  const availableYears = Array.from(new Set(periods.map((p) => p.year))).filter(Boolean);
  if (availableYears.length === 0) {
    availableYears.push(new Date().getFullYear());
  }

  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const defaultYear = activePeriod ? activePeriod.year : availableYears[0];

  const currentYear = sp.year ? Number(sp.year) : defaultYear;
  const currentMonth = sp.month ? Number(sp.month) : 1;

  // 2. Dapatkan currentUser dan Master Departemen
  const currentUser = await getCurrentUser();
  const deps = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .orderBy(departments.name);

  const userDeptName = deps.find((d) => d.id === currentUser?.departmentId)?.name;

  // 3. Dapatkan daftar karyawan untuk tahun ini sesuai scoping user penilai
  const rawEmployees = await getMonthlyAssessmentEmployees({
    year: currentYear,
    month: currentMonth,
    currentUser,
  });

  const employees: EmployeeProgressItem[] = rawEmployees.map((e) => ({
    appraisalId: e.appraisalId,
    appraisalStatus: e.appraisalStatus,
    employeeId: e.employeeId,
    nik: e.nik,
    name: e.name,
    jobPosition: e.jobPosition ?? "-",
    departmentId: e.departmentId,
    departmentName: e.departmentName ?? "-",
    jobLevelName: e.jobLevelName ?? "-",
    month: e.month,
    totalIndicators: e.totalIndicators,
    totalParameters: e.totalParameters,
    filledParameters: e.filledParameters,
    filledCount: e.filledCount,
    unfilledCount: e.unfilledCount,
    completionRate: e.completionRate,
    monthlyStatus: e.monthlyStatus,
    appraiserName: e.appraiserName,
    templateName: e.templateName,
    finalScore: e.finalScore,
    grade: e.grade,
  }));

  // 5. Periksa apakah user telah memilih karyawan untuk input nilai
  let targetEmployeeId: number | null = null;

  if (sp.employeeId) {
    targetEmployeeId = Number(sp.employeeId);
  } else if (sp.id && !isNaN(Number(sp.id))) {
    const [appr] = await db
      .select({ employeeId: appraisals.employeeId })
      .from(appraisals)
      .where(eq(appraisals.id, Number(sp.id)))
      .limit(1);
    if (appr) targetEmployeeId = appr.employeeId;
  }

  // JIKA BELUM MEMILIH KARYAWAN: Tampilkan List View
  if (!targetEmployeeId) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <KpiAssessmentListView
          employees={employees}
          availableYears={availableYears}
          currentYear={currentYear}
          currentMonth={sp.month ? Number(sp.month) : undefined}
          departments={deps}
          userRole={currentUser?.role || "ADMIN"}
          userDeptName={userDeptName}
        />
      </div>
    );
  }

  // JIKA SUDAH MEMILIH KARYAWAN: Tampilkan Form Penilaian (Clean Accordion Form)
  const initialDetail = await getMonthlyAssessmentDetail({
    year: currentYear,
    month: currentMonth,
    employeeId: targetEmployeeId,
    currentUser,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MonthlyAssessmentView
        initialDetail={initialDetail}
        employees={employees}
        availableYears={availableYears}
        currentYear={currentYear}
        currentMonth={currentMonth}
        currentEmployeeId={targetEmployeeId}
        userRole={currentUser?.role || "ADMIN"}
        currentUser={
          currentUser
            ? {
                id: currentUser.id,
                name: currentUser.name,
                role: currentUser.role,
              }
            : null
        }
      />
    </div>
  );
}
