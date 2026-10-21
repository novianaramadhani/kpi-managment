import { db } from "@/db";
import { employees, departments } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";

export interface ApprovalOfficial {
  id: number;
  name: string;
  nik: string;
  jobPosition: string;
  role: string;
}

export interface EmployeeApprovalLine {
  employeeId: number;
  employeeName: string;
  employeeNik: string;
  departmentId: number;
  departmentName: string;
  appraiser: ApprovalOfficial | null;
  headDept: ApprovalOfficial | null;
  manager: ApprovalOfficial | null;
}

/**
 * Mendapatkan jalur pejabat persetujuan (Penilai, Head Dept, Manager)
 * dengan konsep pewarisan (inherit) dari Departemen + override Karyawan.
 */
export async function getEmployeeApprovalLine(employeeId: number): Promise<EmployeeApprovalLine | null> {
  const [empRow] = await db
    .select({
      emp: employees,
      dept: departments,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!empRow) return null;

  const resolvedHeadDeptId = empRow.emp.headDeptId ?? null;
  const resolvedManagerId = empRow.emp.managerId ?? null;
  const resolvedAppraiserId = empRow.emp.appraiserId ?? null;

  const targetIds = [resolvedAppraiserId, resolvedHeadDeptId, resolvedManagerId].filter(
    (id): id is number => id !== null && id !== undefined && id > 0
  );

  const officialsMap = new Map<number, ApprovalOfficial>();
  if (targetIds.length > 0) {
    const officials = await db
      .select({
        id: employees.id,
        name: employees.name,
        nik: employees.nik,
        jobPosition: employees.jobPosition,
        role: employees.role,
      })
      .from(employees)
      .where(inArray(employees.id, targetIds));

    for (const off of officials) {
      officialsMap.set(off.id, off);
    }
  }

  return {
    employeeId: empRow.emp.id,
    employeeName: empRow.emp.name,
    employeeNik: empRow.emp.nik,
    departmentId: empRow.dept?.id ?? empRow.emp.departmentId,
    departmentName: empRow.dept?.name ?? "-",
    appraiser: resolvedAppraiserId ? officialsMap.get(resolvedAppraiserId) ?? null : null,
    headDept: resolvedHeadDeptId ? officialsMap.get(resolvedHeadDeptId) ?? null : null,
    manager: resolvedManagerId ? officialsMap.get(resolvedManagerId) ?? null : null,
  };
}

/**
 * Batch resolver untuk banyak karyawan sekaligus agar terhindar dari N+1 query.
 */
export async function getBatchEmployeeApprovalLines(
  employeeIds: number[]
): Promise<Map<number, EmployeeApprovalLine>> {
  const result = new Map<number, EmployeeApprovalLine>();
  if (employeeIds.length === 0) return result;

  const empRows = await db
    .select({
      emp: employees,
      dept: departments,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(inArray(employees.id, employeeIds));

  const allOfficialIds = new Set<number>();
  for (const r of empRows) {
    const hId = r.emp.headDeptId;
    const mId = r.emp.managerId;
    const aId = r.emp.appraiserId;
    if (hId) allOfficialIds.add(hId);
    if (mId) allOfficialIds.add(mId);
    if (aId) allOfficialIds.add(aId);
  }

  const officialsMap = new Map<number, ApprovalOfficial>();
  if (allOfficialIds.size > 0) {
    const officials = await db
      .select({
        id: employees.id,
        name: employees.name,
        nik: employees.nik,
        jobPosition: employees.jobPosition,
        role: employees.role,
      })
      .from(employees)
      .where(inArray(employees.id, Array.from(allOfficialIds)));

    for (const off of officials) {
      officialsMap.set(off.id, off);
    }
  }

  for (const r of empRows) {
    const resolvedHeadDeptId = r.emp.headDeptId ?? null;
    const resolvedManagerId = r.emp.managerId ?? null;
    const resolvedAppraiserId = r.emp.appraiserId ?? null;

    result.set(r.emp.id, {
      employeeId: r.emp.id,
      employeeName: r.emp.name,
      employeeNik: r.emp.nik,
      departmentId: r.dept?.id ?? r.emp.departmentId,
      departmentName: r.dept?.name ?? "-",
      appraiser: resolvedAppraiserId ? officialsMap.get(resolvedAppraiserId) ?? null : null,
      headDept: resolvedHeadDeptId ? officialsMap.get(resolvedHeadDeptId) ?? null : null,
      manager: resolvedManagerId ? officialsMap.get(resolvedManagerId) ?? null : null,
    });
  }

  return result;
}
