import Link from "next/link";
import { db } from "@/db";
import {
  appraisals,
  departments,
  employees,
  jobLevels,
  kpiPeriods,
  kpiTemplates,
} from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { getSystemDate } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [deps, emps, tpls, periods, systemDate, currentUser] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.name)),
    db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        departmentId: employees.departmentId,
        deptName: departments.name,
        jobLevelId: employees.jobLevelId,
        levelName: jobLevels.name,
        jobPosition: employees.jobPosition,
        operatingUnit: employees.operatingUnit,
        dateOfHire: employees.dateOfHire,
        role: employees.role,
        headDeptId: employees.headDeptId,
        appraiserId: employees.appraiserId,
        isActive: employees.isActive,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
    db.select().from(kpiTemplates),
    db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)),
    getSystemDate(),
    getCurrentUser(),
  ]);

  if (deps.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <PageHeader title="Selamat Datang di Sistem KPI" subtitle="Database Master Departemen masih kosong." />
        <Card>
          <p className="text-sm text-slate-600">
            Departemen belum dikonfigurasi. Silakan masuk ke menu Master Data untuk menambahkan atau mengimpor data departemen dari Excel.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/setup/master?tab=departemen" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
              Setup Master Departemen
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const activePeriod = periods.find((p) => p.status === "ACTIVE") ?? periods[0] ?? {
    id: 1,
    name: "Periode 2025",
    year: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    evaluationDate: "2025-12-31",
    status: "ACTIVE",
  };

  // Ambil semua data appraisal untuk seluruh periode agar filter periode di client langsung responsif
  const allAppraisals = await db
    .select({
      id: appraisals.id,
      periodId: appraisals.periodId,
      employeeId: appraisals.employeeId,
      status: appraisals.status,
      finalScore: appraisals.finalScore,
      isEligible: appraisals.isEligible,
      empName: employees.name,
      nik: employees.nik,
      jobPosition: employees.jobPosition,
      operatingUnit: employees.operatingUnit,
      deptName: departments.name,
      deptId: departments.id,
      levelName: jobLevels.name,
      headDeptId: employees.headDeptId,
      appraiserId: employees.appraiserId,
      updatedAt: appraisals.updatedAt,
      currentStage: appraisals.currentStage,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
    .orderBy(desc(appraisals.updatedAt));

  return (
    <DashboardClient
      currentUser={currentUser}
      activePeriod={activePeriod}
      periods={periods}
      departments={deps}
      allEmployees={emps}
      allAppraisals={allAppraisals}
      systemDate={systemDate}
      templatesCount={tpls.length}
    />
  );
}
