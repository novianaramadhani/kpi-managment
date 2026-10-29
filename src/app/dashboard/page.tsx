import Link from "next/link";
import { db } from "@/db";
import {
  appraisalItems,
  appraisalMonthlyValues,
  appraisals,
  departments,
  employees,
  kpiPeriods,
} from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { DashboardKpiClient } from "@/components/dashboard-kpi-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [deps, emps, periods, currentUser, rawAppraisals, monthlyAggs] = await Promise.all([
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
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        departmentId: employees.departmentId,
        jobLevelId: employees.jobLevelId,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(eq(employees.isActive, true)),
    db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)),
    getCurrentUser(),
    db
      .select({
        id: appraisals.id,
        periodId: appraisals.periodId,
        employeeId: appraisals.employeeId,
        status: appraisals.status,
        finalScore: appraisals.finalScore,
        isEligible: appraisals.isEligible,
        empName: employees.name,
        nik: employees.nik,
        deptName: departments.name,
        deptId: departments.id,
        updatedAt: appraisals.updatedAt,
        currentStage: appraisals.currentStage,
      })
      .from(appraisals)
      .innerJoin(employees, eq(appraisals.employeeId, employees.id))
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.isActive, true))
      .orderBy(desc(appraisals.updatedAt)),
    db
      .select({
        appraisalId: appraisalItems.appraisalId,
        month: appraisalMonthlyValues.month,
        monthScore: sql<string>`COALESCE(SUM(CAST(${appraisalMonthlyValues.finalScore} AS numeric)), 0)::text`,
      })
      .from(appraisalMonthlyValues)
      .innerJoin(appraisalItems, eq(appraisalMonthlyValues.appraisalItemId, appraisalItems.id))
      .where(
        sql`${appraisalMonthlyValues.actualValue} IS NOT NULL OR (${appraisalMonthlyValues.score} IS NOT NULL AND CAST(${appraisalMonthlyValues.score} AS numeric) > 0)`
      )
      .groupBy(appraisalItems.appraisalId, appraisalMonthlyValues.month),
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

  const monthlyMap = new Map<number, Record<number, number>>();
  for (const row of monthlyAggs) {
    const scoreNum = Number(row.monthScore);
    if (!Number.isFinite(scoreNum) || scoreNum <= 0) continue;
    let rec = monthlyMap.get(row.appraisalId);
    if (!rec) {
      rec = {};
      monthlyMap.set(row.appraisalId, rec);
    }
    rec[row.month] = scoreNum;
  }

  const allAppraisals = rawAppraisals.map((a) => ({
    ...a,
    monthlyScores: monthlyMap.get(a.id) ?? null,
  }));

  return (
    <DashboardKpiClient
      currentUser={currentUser}
      activePeriod={activePeriod}
      periods={periods}
      departments={deps}
      allEmployees={emps}
      allAppraisals={allAppraisals}
    />
  );
}
