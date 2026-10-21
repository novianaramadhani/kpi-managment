import { db } from "@/db";
import { appraisals, departments, employees, jobLevels, kpiPeriods, kpiTemplates } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { gradeOf, formatDateMedium, formatTenureExact, fmtPct } from "./scoring";

export interface SummaryKpiRow {
  id: number;
  nik: string;
  name: string;
  polaPenggajian: string;
  jobPosition: string;
  operatingUnit: string;
  dateOfHire: string | null;
  hireDateFormatted: string;
  tenureFormatted: string;
  deptId: number;
  dept: string;
  levelId: number;
  level: string;
  template: string | null;
  tenureMonths: number;
  isEligible: boolean;
  status: string;
  statusLabel: string;
  isFinal: boolean;
  finalScore: string | null;
  scoreFormatted: string;
  scoreNumber: number;
  appraiserName: string;
  gajiPokok?: string | number | null;
  tJabatan?: string | number | null;
  totalGaji?: string | number | null;
  jlhBulan?: string | number | null;
  jlhHari?: string | number | null;
}

export async function getReport(periodId?: number) {
  const periods = await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year));
  const period = periods.find((p) => p.id === periodId) ?? periods.find((p) => p.status === "ACTIVE") ?? periods[0];
  if (!period) {
    return {
      periods,
      period: null,
      rows: [],
      byDept: [],
      byLevel: [],
      distribution: [],
      avg: 0,
      scoredCount: 0,
      finalCount: 0,
    };
  }

  const appraiser = alias(employees, "appraiser");
  const headDeptApprover = alias(employees, "headDeptApprover");
  const empAppraiser = alias(employees, "empAppraiser");

  // Query seluruh data penilaian KPI yang berstatus FINAL dari database (hanya data riil final/selesai)
  const rawRows = await db
    .select({
      id: appraisals.id,
      nik: employees.nik,
      name: employees.name,
      jobPosition: employees.jobPosition,
      operatingUnit: employees.operatingUnit,
      dateOfHire: employees.dateOfHire,
      polaPenggajian: employees.polaPenggajian,
      deptId: departments.id,
      dept: departments.name,
      levelId: jobLevels.id,
      level: jobLevels.name,
      template: kpiTemplates.name,
      tenureMonths: appraisals.tenureMonths,
      isEligible: appraisals.isEligible,
      status: appraisals.status,
      finalScore: appraisals.finalScore,
      appraiserName: appraiser.name,
      headDeptApproverName: headDeptApprover.name,
      empAppraiserName: empAppraiser.name,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
    .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
    .leftJoin(appraiser, eq(appraisals.appraiserId, appraiser.id))
    .leftJoin(headDeptApprover, eq(appraisals.headDeptApprovedById, headDeptApprover.id))
    .leftJoin(empAppraiser, eq(employees.appraiserId, empAppraiser.id))
    .where(and(eq(appraisals.periodId, period.id), eq(appraisals.status, "FINAL")))
    .orderBy(asc(departments.name), asc(employees.name));

  const targetEvalDate = period.evaluationDate || undefined;

  const rows: SummaryKpiRow[] = rawRows.map((r) => {
    const f = Number(r.finalScore ?? 0);
    const isFinal = true;
    const statusLabel = "Final / Selesai";

    const scoreFormatted =
      r.finalScore !== null && r.finalScore !== undefined && Number(r.finalScore) >= 0
        ? `${(f * 100).toFixed(1)}%`
        : "-";

    const resolvedAppraiser =
      r.appraiserName ||
      r.headDeptApproverName ||
      r.empAppraiserName ||
      "-";

    return {
      ...r,
      deptId: r.deptId || 0,
      dept: r.dept || "Umum",
      levelId: r.levelId || 0,
      level: r.level || "Staff",
      jobPosition: r.jobPosition || "-",
      operatingUnit: (r.operatingUnit || "HO").toUpperCase(),
      polaPenggajian: r.polaPenggajian || "All In",
      hireDateFormatted: formatDateMedium(r.dateOfHire),
      tenureFormatted: formatTenureExact(r.dateOfHire, targetEvalDate),
      statusLabel,
      isFinal,
      scoreFormatted,
      scoreNumber: f,
      appraiserName: resolvedAppraiser,
    };
  });

  // Prioritas penilaian terisi / final
  const scored = rows.filter((r) => r.isFinal || (r.finalScore && Number(r.finalScore) > 0));
  const finalRows = rows.filter((r) => r.isFinal);
  const avgOf = (list: typeof scored) =>
    list.length ? list.reduce((s, r) => s + Number(r.finalScore), 0) / list.length : 0;

  const group = (key: "dept" | "level") => {
    const names = [...new Set(rows.map((r) => r[key]))];
    return names.map((name) => {
      const all = rows.filter((r) => r[key] === name);
      const sc = scored.filter((r) => r[key] === name);
      return {
        name,
        total: all.length,
        eligible: all.filter((r) => r.isEligible).length,
        scored: sc.length,
        final: all.filter((r) => r.status === "FINAL").length,
        avg: avgOf(sc),
        max: sc.length ? Math.max(...sc.map((r) => Number(r.finalScore))) : 0,
        min: sc.length ? Math.min(...sc.map((r) => Number(r.finalScore))) : 0,
      };
    });
  };

  const grades = ["Outstanding", "Exceeds", "Meets", "Needs Improvement", "Below"];
  const distribution = grades.map((g) => ({
    grade: g,
    count: scored.filter((r) => gradeOf(Number(r.finalScore) * 100).label === g).length,
  }));

  return {
    periods,
    period,
    rows,
    byDept: group("dept"),
    byLevel: group("level"),
    distribution,
    avg: avgOf(scored),
    scoredCount: scored.length,
    finalCount: finalRows.length,
  };
}
