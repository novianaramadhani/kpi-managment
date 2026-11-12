import { db } from "@/db";
import {
  appraisals,
  departments,
  employees,
  jobLevels,
  kpiAssessorAssignments,
  kpiCategories,
  kpiPeriods,
  kpiTemplates,
} from "@/db/schema";
import { and, asc, desc, eq, isNull, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { gradeOf, formatDateMedium, formatTenureExact, fmtPct } from "./scoring";

interface PeriodAssessorAssignment {
  templateId: number;
  assessorId: number;
  assessorName: string;
  scopeType: string;
  targetEmployeeId: number | null;
  targetDepartmentId: number | null;
  roleAssessor: string | null;
}

const ASSESSOR_ROLE_ORDER: Record<string, number> = {
  PENILAI_1: 1,
  ATASAN_LANGSUNG: 2,
  PENILAI_2: 3,
};

/**
 * Nama penilai diambil dari fitur Penugasan Asesor KPI dengan prioritas
 * INDIVIDUAL (per karyawan) > DEPARTMENT (per template) > GLOBAL (per template).
 * Mengembalikan null bila belum ada penugasan sehingga pemanggil bisa memakai fallback.
 */
function resolveAssessorNames(
  assignments: PeriodAssessorAssignment[],
  target: { employeeId: number; departmentId: number; templateId: number | null }
): string | null {
  const individual = assignments.filter(
    (a) => a.scopeType === "INDIVIDUAL" && a.targetEmployeeId === target.employeeId
  );

  const sameTemplate = (a: PeriodAssessorAssignment) =>
    target.templateId !== null && a.templateId === target.templateId;

  const department = assignments.filter(
    (a) =>
      a.scopeType === "DEPARTMENT" &&
      sameTemplate(a) &&
      (a.targetDepartmentId === null || a.targetDepartmentId === target.departmentId)
  );

  const global = assignments.filter((a) => a.scopeType === "GLOBAL" && sameTemplate(a));

  const matched = [individual, department, global].find((list) => list.length > 0);
  if (!matched) return null;

  const seen = new Set<number>();
  const ordered = [...matched]
    .sort((a, b) => {
      const ra = ASSESSOR_ROLE_ORDER[a.roleAssessor ?? ""] ?? 99;
      const rb = ASSESSOR_ROLE_ORDER[b.roleAssessor ?? ""] ?? 99;
      return ra - rb || a.assessorName.localeCompare(b.assessorName);
    })
    .filter((a) => {
      if (seen.has(a.assessorId)) return false;
      seen.add(a.assessorId);
      return true;
    });

  return ordered.map((a) => a.assessorName).join(", ");
}

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
      employeeId: employees.id,
      templateId: appraisals.templateId,
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

  // Penugasan asesor aktif pada periode ini (stage persetujuan Head Dept/Manager/HR tidak dihitung sebagai penilai)
  const assessorAssignments: PeriodAssessorAssignment[] =
    rawRows.length === 0
      ? []
      : await db
          .select({
            templateId: kpiCategories.templateId,
            assessorId: kpiAssessorAssignments.assessorEmployeeId,
            assessorName: employees.name,
            scopeType: kpiAssessorAssignments.scopeType,
            targetEmployeeId: kpiAssessorAssignments.targetEmployeeId,
            targetDepartmentId: kpiAssessorAssignments.targetDepartmentId,
            roleAssessor: kpiAssessorAssignments.roleAssessor,
          })
          .from(kpiAssessorAssignments)
          .innerJoin(kpiCategories, eq(kpiAssessorAssignments.categoryId, kpiCategories.id))
          .innerJoin(employees, eq(kpiAssessorAssignments.assessorEmployeeId, employees.id))
          .where(
            and(
              eq(kpiAssessorAssignments.periodId, period.id),
              eq(kpiAssessorAssignments.isActive, true),
              or(
                isNull(kpiAssessorAssignments.stage),
                notInArray(kpiAssessorAssignments.stage, ["HEAD_DEPT", "MANAGER", "HR"])
              )
            )
          );

  const rows: SummaryKpiRow[] = rawRows.map((r) => {
    const f = Number(r.finalScore ?? 0);
    const isFinal = true;
    const statusLabel = "Final / Selesai";

    const scoreFormatted =
      r.finalScore !== null && r.finalScore !== undefined && Number(r.finalScore) >= 0
        ? `${(f * 100).toFixed(1)}%`
        : "-";

    const assignedAssessor = resolveAssessorNames(assessorAssignments, {
      employeeId: r.employeeId,
      departmentId: r.deptId || 0,
      templateId: r.templateId,
    });

    const resolvedAppraiser =
      assignedAssessor ||
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

  const grades = [
    "Outstanding",
    "Exceeds Expectations",
    "Meets Expectations",
    "Needs Improvement",
    "Unsatisfactory",
  ];
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
