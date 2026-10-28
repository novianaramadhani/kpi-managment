import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { employees, departments, appraisals, kpiTemplates } from "@/db/schema";
import {
  findMasterEmployeeForTemplate,
  type MasterEmployeeMatchInput,
  type ResolvedMasterEmployee,
} from "./master-employee-matcher";

export {
  cleanTemplateEmployeeName,
  findMasterEmployeeForTemplate,
  type MasterEmployeeMatchInput,
  type ResolvedMasterEmployee,
} from "./master-employee-matcher";

/**
 * Server-side resolution for an employee record for a given template.
 * Queries Postgres with joins and auto-heals template.employeeId if missing.
 */
export async function resolveTemplateMasterEmployee(
  templateId: number,
  dbInstance = defaultDb
): Promise<ResolvedMasterEmployee | null> {
  const [tpl] = await dbInstance
    .select()
    .from(kpiTemplates)
    .where(eq(kpiTemplates.id, templateId));

  if (!tpl) return null;

  // 1. Direct employeeId
  if (tpl.employeeId) {
    const [row] = await dbInstance
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        jobPosition: employees.jobPosition,
        departmentId: employees.departmentId,
        departmentName: departments.name,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.id, tpl.employeeId));

    if (row) {
      return {
        id: row.id,
        nik: row.nik || "-",
        name: row.name,
        jobPosition: row.jobPosition || "-",
        departmentId: row.departmentId,
        departmentName: row.departmentName || "-",
      };
    }
  }

  // 2. Appraisal link
  const [appraisalRow] = await dbInstance
    .select({
      id: employees.id,
      nik: employees.nik,
      name: employees.name,
      jobPosition: employees.jobPosition,
      departmentId: employees.departmentId,
      departmentName: departments.name,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(appraisals.templateId, templateId))
    .limit(1);

  if (appraisalRow) {
    // Auto-heal template link
    await dbInstance
      .update(kpiTemplates)
      .set({ employeeId: appraisalRow.id })
      .where(eq(kpiTemplates.id, templateId));

    return {
      id: appraisalRow.id,
      nik: appraisalRow.nik || "-",
      name: appraisalRow.name,
      jobPosition: appraisalRow.jobPosition || "-",
      departmentId: appraisalRow.departmentId,
      departmentName: appraisalRow.departmentName || "-",
    };
  }

  // 3. Name-based resolution from all employees
  const allEmps = await dbInstance
    .select({
      id: employees.id,
      nik: employees.nik,
      name: employees.name,
      jobPosition: employees.jobPosition,
      departmentId: employees.departmentId,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id));

  const allDepts = await dbInstance.select().from(departments);

  const matched = findMasterEmployeeForTemplate({
    template: tpl,
    employees: allEmps,
    departments: allDepts,
  });

  if (matched) {
    // Auto-heal template link
    await dbInstance
      .update(kpiTemplates)
      .set({ employeeId: matched.id })
      .where(eq(kpiTemplates.id, templateId));
  }

  return matched;
}
