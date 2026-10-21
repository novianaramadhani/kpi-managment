import { Metadata } from "next";
import { db } from "@/db";
import { kpiPeriods } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import {
  getMonthlyAssessmentEmployees,
  getMonthlyAssessmentDetail,
} from "@/lib/monthly-assessment-service";
import { MonthlyAssessmentView } from "@/components/kpi/monthly-assessment-view";
import type { EmployeeProgressItem } from "@/types/monthly-assessment";

export const metadata: Metadata = {
  title: "Penilaian KPI Bulanan · Performance Management",
  description: "Modul input dan monitoring penilaian KPI bulanan karyawan",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
    employeeId?: string;
  }>;
}

export default async function MonthlyAssessmentPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // 1. Dapatkan daftar tahun periode yang tersedia di database
  const periods = await db
    .select({ year: kpiPeriods.year, status: kpiPeriods.status })
    .from(kpiPeriods)
    .orderBy(desc(kpiPeriods.year));

  const availableYears = Array.from(new Set(periods.map((p) => p.year))).filter(Boolean);
  if (availableYears.length === 0) {
    availableYears.push(new Date().getFullYear());
  }

  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const defaultYear = activePeriod ? activePeriod.year : availableYears[0];

  const currentYear = params.year ? Number(params.year) : defaultYear;
  const currentMonth = params.month ? Number(params.month) : 1;

  // 2. Dapatkan daftar karyawan untuk tahun dan bulan ini
  const rawEmployees = await getMonthlyAssessmentEmployees({
    year: currentYear,
    month: currentMonth,
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
  }));

  // 3. Tentukan karyawan terpilih
  let currentEmployeeId: number | null = null;
  if (params.employeeId) {
    currentEmployeeId = Number(params.employeeId);
  } else {
    const nikan = employees.find(
      (e) => e.name.toLowerCase().includes("nikan") || e.nik === "10006"
    );
    if (nikan) {
      currentEmployeeId = nikan.employeeId;
    } else if (employees.length > 0) {
      currentEmployeeId = employees[0].employeeId;
    }
  }

  // 4. Cek user session aktif
  const currentUser = await getCurrentUser();

  // 5. Dapatkan detail data penilaian bulanan untuk karyawan terpilih
  let initialDetail = null;
  if (currentEmployeeId) {
    initialDetail = await getMonthlyAssessmentDetail({
      year: currentYear,
      month: currentMonth,
      employeeId: currentEmployeeId,
      currentUser,
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MonthlyAssessmentView
        initialDetail={initialDetail}
        employees={employees}
        availableYears={availableYears}
        currentYear={currentYear}
        currentMonth={currentMonth}
        currentEmployeeId={currentEmployeeId}
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
