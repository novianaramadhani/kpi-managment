import { db } from "@/db";
import {
  kpiTemplates,
  kpiCategories,
  kpiParameters,
  kpiBands,
  kpiPeriods,
  employees,
  departments,
  jobLevels,
  appraisals,
  appraisalItems,
  kpiAssessorAssignments,
  kpiAssessorDelegations,
  departmentHeads,
  auditLogs,
} from "@/db/schema";
import { and, eq, inArray, sql, asc, desc, lte, gte, isNotNull, isNull, or } from "drizzle-orm";
import { tenureMonths } from "./scoring";
import { revalidatePath } from "next/cache";
import { resolveTemplateMasterEmployee } from "./master-employee-resolver";

export interface TemplateAssignmentStatus {
  templateId: number;
  assignedCount: number;
  isAssessorComplete: boolean;
  status: "NONE" | "COMPLETE" | "INCOMPLETE";
  label: string;
}

export interface DrawerEmployeeItem {
  id: number;
  nik: string;
  name: string;
  jobPosition: string | null;
  jobLevelId: number;
  jobLevelName: string;
  departmentId: number;
  departmentName: string;
  operatingUnit: string;
  appraiserId: number | null;
  appraiserName: string | null;
  headDeptId: number | null;
  headDeptName: string | null;
  headDeptNik?: string | null;
  headDeptPosition?: string | null;
  isHeadDeptFound: boolean;
  hasDelegation?: boolean;
  delegationDelegateeName?: string | null;
  currentAssignedTemplateId: number | null;
  currentAssignedTemplateName: string | null;
  isAssignedToThisTemplate: boolean;
  isAssignedToOtherTemplate: boolean;
  matchesJobLevel: boolean;
}

export interface DrawerCategoryItem {
  id: number;
  name: string;
  weight: number | string;
  sortOrder: number;
  indicatorCount: number;
  assignedAssessorIds: number[];
}

export interface DrawerNikOverrideItem {
  employeeId: number;
  employeeName: string;
  employeeNik: string;
  assessorId: number;
  assessorName: string;
  assessorNik: string;
  categoryId?: number | null;
}

export interface DrawerAssessorOption {
  id: number;
  nik: string;
  name: string;
  jobPosition: string | null;
  departmentId: number | null;
  departmentName: string | null;
  hasActiveDelegation: boolean;
  delegationDelegateeName?: string | null;
}

export interface TemplateAssignmentDrawerData {
  template: {
    id: number;
    name: string;
    departmentId: number;
    departmentName: string;
    jobLevelId: number;
    jobLevelName: string;
    isActive: boolean;
    version: number;
    isCustom?: boolean;
    employeeId?: number | null;
  };
  period: {
    id: number;
    year: number;
    name: string;
    status: string;
  };
  categories: DrawerCategoryItem[];
  employees: DrawerEmployeeItem[];
  nikOverrides: DrawerNikOverrideItem[];
  assessorOptions: DrawerAssessorOption[];
  defaultRule: "APPRAISER" | "HEAD_DEPT" | "CUSTOM";
}

/**
 * Mendapatkan overview status penugasan untuk semua template pada periode tertentu.
 * Penilai otomatis dicek berdasarkan Head Department per unit/departemen.
 */
export async function getTemplateAssignmentsOverview(periodId: number): Promise<Record<number, TemplateAssignmentStatus>> {
  const [allAppraisals, allTemplates, allDeptHeads] = await Promise.all([
    db
      .select({
        templateId: appraisals.templateId,
        employeeId: appraisals.employeeId,
        departmentId: employees.departmentId,
        operatingUnit: employees.operatingUnit,
        appraiserId: appraisals.appraiserId,
        headDeptId: appraisals.headDeptId,
      })
      .from(appraisals)
      .innerJoin(employees, eq(appraisals.employeeId, employees.id))
      .where(and(eq(appraisals.periodId, periodId), isNotNull(appraisals.templateId))),
    db.select({ id: kpiTemplates.id }).from(kpiTemplates),
    db
      .select({
        departmentId: departmentHeads.departmentId,
        operatingUnit: departmentHeads.operatingUnit,
        employeeId: departmentHeads.employeeId,
      })
      .from(departmentHeads)
      .where(eq(departmentHeads.status, "Active")),
  ]);

  const activeHeadDeptSet = new Set<string>();
  for (const dh of allDeptHeads) {
    activeHeadDeptSet.add(`${dh.departmentId}_${(dh.operatingUnit || "HO").trim().toUpperCase()}`);
  }

  // Group appraisals by templateId
  const appraisalsByTemplate = new Map<number, typeof allAppraisals>();
  for (const a of allAppraisals) {
    if (!a.templateId) continue;
    const list = appraisalsByTemplate.get(a.templateId) || [];
    list.push(a);
    appraisalsByTemplate.set(a.templateId, list);
  }

  const result: Record<number, TemplateAssignmentStatus> = {};

  for (const tpl of allTemplates) {
    const assignedList = appraisalsByTemplate.get(tpl.id) || [];
    const assignedCount = assignedList.length;

    if (assignedCount === 0) {
      result[tpl.id] = {
        templateId: tpl.id,
        assignedCount: 0,
        isAssessorComplete: false,
        status: "NONE",
        label: "Belum ada penugasan",
      };
    } else {
      // Cek apakah seluruh karyawan yang ditugaskan sudah memiliki Head Dept / Penilai aktif
      const allHaveAssessor = assignedList.every((a) => {
        if (a.appraiserId || a.headDeptId) return true;
        const key = `${a.departmentId}_${(a.operatingUnit || "HO").trim().toUpperCase()}`;
        return activeHeadDeptSet.has(key);
      });

      if (allHaveAssessor) {
        result[tpl.id] = {
          templateId: tpl.id,
          assignedCount,
          isAssessorComplete: true,
          status: "COMPLETE",
          label: `${assignedCount} karyawan · Penilai lengkap`,
        };
      } else {
        result[tpl.id] = {
          templateId: tpl.id,
          assignedCount,
          isAssessorComplete: false,
          status: "INCOMPLETE",
          label: `${assignedCount} karyawan · Penilai belum ditentukan`,
        };
      }
    }
  }

  return result;
}

/**
 * Memuat seluruh data detail untuk Drawer Penugasan Template & Penilai.
 */
export async function getTemplateAssignmentDrawerData(
  templateId: number,
  periodId?: number
): Promise<TemplateAssignmentDrawerData | null> {
  // 1. Get period
  let targetPeriod;
  if (periodId) {
    const [p] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId)).limit(1);
    targetPeriod = p;
  }
  if (!targetPeriod) {
    const [active] = await db
      .select()
      .from(kpiPeriods)
      .where(eq(kpiPeriods.status, "ACTIVE"))
      .orderBy(desc(kpiPeriods.year))
      .limit(1);
    targetPeriod = active;
  }
  if (!targetPeriod) {
    const [first] = await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)).limit(1);
    targetPeriod = first;
  }
  if (!targetPeriod) return null;

  const currentPeriodId = targetPeriod.id;

  // 2. Get template with department and job level
  const [tpl] = await db
    .select({
      template: kpiTemplates,
      dept: departments,
      lvl: jobLevels,
    })
    .from(kpiTemplates)
    .innerJoin(departments, eq(kpiTemplates.departmentId, departments.id))
    .innerJoin(jobLevels, eq(kpiTemplates.jobLevelId, jobLevels.id))
    .where(eq(kpiTemplates.id, templateId))
    .limit(1);

  if (!tpl) return null;

  // 3. Get categories & indicators for this template
  const cats = await db
    .select({
      category: kpiCategories,
      indicatorCount: sql<number>`cast(count(${kpiParameters.id}) as int)`,
    })
    .from(kpiCategories)
    .leftJoin(kpiParameters, eq(kpiParameters.categoryId, kpiCategories.id))
    .where(eq(kpiCategories.templateId, templateId))
    .groupBy(kpiCategories.id)
    .orderBy(asc(kpiCategories.sortOrder));

  const catIds = cats.map((c) => c.category.id);

  // 4. Get active delegations for today
  const today = new Date().toISOString().split("T")[0];
  const activeDelegations = await db
    .select({
      delegatorId: kpiAssessorDelegations.delegatorEmployeeId,
      delegateeId: kpiAssessorDelegations.delegateeEmployeeId,
    })
    .from(kpiAssessorDelegations)
    .where(
      and(
        eq(kpiAssessorDelegations.periodId, currentPeriodId),
        eq(kpiAssessorDelegations.isActive, true),
        lte(kpiAssessorDelegations.startDate, today),
        gte(kpiAssessorDelegations.endDate, today)
      )
    );

  const activeDelegatorMap = new Map<number, number>();
  for (const d of activeDelegations) {
    activeDelegatorMap.set(d.delegatorId, d.delegateeId);
  }

  // 5. Get existing assessor assignments for these categories in current period
  const existingAssignments = catIds.length > 0
    ? await db
        .select({
          id: kpiAssessorAssignments.id,
          categoryId: kpiAssessorAssignments.categoryId,
          assessorId: kpiAssessorAssignments.assessorEmployeeId,
          scopeType: kpiAssessorAssignments.scopeType,
          targetEmployeeId: kpiAssessorAssignments.targetEmployeeId,
          assessorName: employees.name,
          assessorNik: employees.nik,
        })
        .from(kpiAssessorAssignments)
        .innerJoin(employees, eq(kpiAssessorAssignments.assessorEmployeeId, employees.id))
        .where(
          and(
            eq(kpiAssessorAssignments.periodId, currentPeriodId),
            inArray(kpiAssessorAssignments.categoryId, catIds),
            eq(kpiAssessorAssignments.isActive, true)
          )
        )
    : [];

  const categoryAssessorMap = new Map<number, number[]>();
  const nikOverrides: DrawerNikOverrideItem[] = [];

  for (const assign of existingAssignments) {
    if (assign.scopeType === "INDIVIDUAL" && assign.targetEmployeeId) {
      const [targetEmp] = await db
        .select({ name: employees.name, nik: employees.nik })
        .from(employees)
        .where(eq(employees.id, assign.targetEmployeeId))
        .limit(1);

      nikOverrides.push({
        employeeId: assign.targetEmployeeId,
        employeeName: targetEmp?.name || "Karyawan",
        employeeNik: targetEmp?.nik || "-",
        assessorId: assign.assessorId,
        assessorName: assign.assessorName,
        assessorNik: assign.assessorNik,
        categoryId: assign.categoryId,
      });
    } else {
      const list = categoryAssessorMap.get(assign.categoryId) || [];
      if (!list.includes(assign.assessorId)) {
        list.push(assign.assessorId);
      }
      categoryAssessorMap.set(assign.categoryId, list);
    }
  }

  // 6. Get target employee if personal template, or all active employees in this department
  let targetEmployeeId: number | null = tpl.template.employeeId ?? null;
  if (!targetEmployeeId) {
    const resolved = await resolveTemplateMasterEmployee(templateId, db);
    if (resolved?.id) {
      targetEmployeeId = resolved.id;
    }
  }

  let deptEmployees: Array<{
    emp: typeof employees.$inferSelect;
    lvl: typeof jobLevels.$inferSelect;
    dept: typeof departments.$inferSelect;
  }> = [];

  if (targetEmployeeId) {
    deptEmployees = await db
      .select({
        emp: employees,
        lvl: jobLevels,
        dept: departments,
      })
      .from(employees)
      .innerJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.id, targetEmployeeId))
      .limit(1);
  }

  // Fallback: If not personal or target employee was not found, query department employees
  if (deptEmployees.length === 0) {
    deptEmployees = await db
      .select({
        emp: employees,
        lvl: jobLevels,
        dept: departments,
      })
      .from(employees)
      .innerJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.departmentId, tpl.template.departmentId), eq(employees.isActive, true)))
      .orderBy(asc(jobLevels.rank), asc(employees.name));
  }

  // 7. Get existing appraisals in this period for all department employees
  const deptEmpIds = deptEmployees.map((e) => e.emp.id);
  const existingAppraisals = deptEmpIds.length > 0
    ? await db
        .select({
          employeeId: appraisals.employeeId,
          templateId: appraisals.templateId,
          templateName: kpiTemplates.name,
        })
        .from(appraisals)
        .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
        .where(and(eq(appraisals.periodId, currentPeriodId), inArray(appraisals.employeeId, deptEmpIds)))
    : [];

  const empAppraisalMap = new Map<number, { templateId: number | null; templateName: string | null }>();
  for (const a of existingAppraisals) {
    empAppraisalMap.set(a.employeeId, {
      templateId: a.templateId,
      templateName: a.templateName,
    });
  }

  // Pre-fetch appraisers and supervisors names
  const allSupervisorIds = Array.from(
    new Set(
      deptEmployees
        .map((e) => e.emp.appraiserId)
        .concat(deptEmployees.map((e) => e.emp.headDeptId))
        .filter((id): id is number => typeof id === "number")
    )
  );

  const supervisorMap = new Map<number, string>();
  if (allSupervisorIds.length > 0) {
    const sups = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, allSupervisorIds));
    for (const s of sups) {
      supervisorMap.set(s.id, s.name);
    }
  }

  // 8. Get all active employees across company as assessor options & for delegation lookup
  const allEmployees = await db
    .select({
      emp: employees,
      dept: departments,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(departments.name), asc(employees.name));

  const empLookupMap = new Map(allEmployees.map((e) => [e.emp.id, e.emp]));

  // 8b. Query all active Department Heads from master department_heads (Employee -> Department -> OU -> Head Dept)
  const allDeptHeads = await db
    .select({
      id: departmentHeads.id,
      departmentId: departmentHeads.departmentId,
      operatingUnit: departmentHeads.operatingUnit,
      employeeId: departmentHeads.employeeId,
      status: departmentHeads.status,
      headName: employees.name,
      headNik: employees.nik,
      headPosition: employees.jobPosition,
    })
    .from(departmentHeads)
    .innerJoin(employees, eq(departmentHeads.employeeId, employees.id))
    .where(eq(departmentHeads.status, "Active"));

  const deptHeadMap = new Map<
    string,
    { employeeId: number; name: string; nik: string; position: string | null }
  >();
  for (const dh of allDeptHeads) {
    const ouKey = (dh.operatingUnit || "HO").trim().toUpperCase();
    deptHeadMap.set(`${dh.departmentId}_${ouKey}`, {
      employeeId: dh.employeeId,
      name: dh.headName,
      nik: dh.headNik,
      position: dh.headPosition,
    });
  }

  const drawerEmployees: DrawerEmployeeItem[] = deptEmployees.map((row) => {
    const appInfo = empAppraisalMap.get(row.emp.id);
    const assignedTplId = appInfo?.templateId ?? null;
    const isThis = assignedTplId === templateId || Boolean(targetEmployeeId && row.emp.id === targetEmployeeId);
    const isOther = assignedTplId !== null && assignedTplId !== templateId && !isThis;

    const empOU = (row.emp.operatingUnit || "HO").trim().toUpperCase();
    const headInfo = deptHeadMap.get(`${row.emp.departmentId}_${empOU}`);

    const isHeadDeptFound = !!headInfo;
    const headDeptId = headInfo ? headInfo.employeeId : null;
    const headDeptName = headInfo ? headInfo.name : null;
    const headDeptNik = headInfo ? headInfo.nik : null;
    const headDeptPosition = headInfo ? headInfo.position : null;

    const hasDel = headDeptId ? activeDelegatorMap.has(headDeptId) : false;
    const delTargetId = headDeptId ? activeDelegatorMap.get(headDeptId) : undefined;
    const delTarget = delTargetId ? empLookupMap.get(delTargetId)?.name || null : null;

    return {
      id: row.emp.id,
      nik: row.emp.nik,
      name: row.emp.name,
      jobPosition: row.emp.jobPosition,
      jobLevelId: row.emp.jobLevelId,
      jobLevelName: row.lvl.name,
      departmentId: row.emp.departmentId,
      departmentName: row.dept.name,
      operatingUnit: empOU,
      appraiserId: row.emp.appraiserId,
      appraiserName: row.emp.appraiserId ? supervisorMap.get(row.emp.appraiserId) || null : null,
      headDeptId,
      headDeptName,
      headDeptNik,
      headDeptPosition,
      isHeadDeptFound,
      hasDelegation: hasDel,
      delegationDelegateeName: delTarget,
      currentAssignedTemplateId: assignedTplId,
      currentAssignedTemplateName: appInfo?.templateName ?? null,
      isAssignedToThisTemplate: isThis,
      isAssignedToOtherTemplate: isOther,
      matchesJobLevel: row.emp.jobLevelId === tpl.template.jobLevelId,
    };
  });

  const assessorOptions: DrawerAssessorOption[] = allEmployees.map((r) => {
    const isDel = activeDelegatorMap.has(r.emp.id);
    const delTargetId = activeDelegatorMap.get(r.emp.id);
    const delTarget = delTargetId ? empLookupMap.get(delTargetId)?.name || null : null;

    return {
      id: r.emp.id,
      nik: r.emp.nik,
      name: r.emp.name,
      jobPosition: r.emp.jobPosition,
      departmentId: r.emp.departmentId,
      departmentName: r.dept?.name || null,
      hasActiveDelegation: isDel,
      delegationDelegateeName: delTarget,
    };
  });

  const categories: DrawerCategoryItem[] = cats.map((c) => ({
    id: c.category.id,
    name: c.category.name,
    weight: c.category.weight,
    sortOrder: c.category.sortOrder,
    indicatorCount: c.indicatorCount,
    assignedAssessorIds: categoryAssessorMap.get(c.category.id) || [],
  }));

  return {
    template: {
      id: tpl.template.id,
      name: tpl.template.name,
      departmentId: tpl.template.departmentId,
      departmentName: tpl.dept.name,
      jobLevelId: tpl.template.jobLevelId,
      jobLevelName: tpl.lvl.name,
      isActive: tpl.template.isActive,
      version: tpl.template.version,
      isCustom: Boolean(tpl.template.isCustom || targetEmployeeId),
      employeeId: targetEmployeeId ?? tpl.template.employeeId ?? null,
    },
    period: {
      id: targetPeriod.id,
      year: targetPeriod.year,
      name: targetPeriod.name,
      status: targetPeriod.status,
    },
    categories,
    employees: drawerEmployees,
    nikOverrides,
    assessorOptions,
    defaultRule: "CUSTOM",
  };
}

/**
 * Menyimpan penugasan template dan asesor KPI secara terpadu (Atomic & Single Source of Truth).
 * Mendukung opsi `scope`:
 * - "ALL": Menyimpan penugasan karyawan dan konfigurasi penilai sekaligus.
 * - "EMPLOYEES": Hanya menyimpan penugasan karyawan pada template ini.
 * - "ASSESSORS": Hanya menyimpan penilai parameter dan NIK override tanpa mengubah daftar karyawan.
 */
export async function saveTemplateAssignmentDrawerData(params: {
  templateId: number;
  periodId: number;
  assignedEmployeeIds?: number[];
  parameterAssessors?: Record<number, number[]>; // categoryId -> assessorEmployeeIds[]
  nikOverrides?: Array<{ employeeId: number; assessorId: number; categoryId?: number | null }>;
  scope?: "ALL" | "EMPLOYEES" | "ASSESSORS";
  actor?: string;
  actorId?: number;
}) {
  const {
    templateId,
    periodId,
    assignedEmployeeIds = [],
    parameterAssessors = {},
    nikOverrides = [],
    scope = "ALL",
    actor = "admin",
    actorId,
  } = params;

  if (!templateId) throw new Error("ID Template KPI wajib disertakan.");
  if (!periodId) throw new Error("ID Periode KPI wajib disertakan.");

  // 1. Verify template is active/published
  const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, templateId)).limit(1);
  if (!tpl) throw new Error("Template KPI tidak ditemukan.");
  if (!tpl.isActive) {
    throw new Error("Template harus berstatus Published sebelum dapat ditugaskan kepada karyawan.");
  }

  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId)).limit(1);
  if (!period) throw new Error("Periode KPI tidak ditemukan.");

  // 2. Fetch template categories, parameters, and bands for snapshotting
  const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, templateId));
  const catIds = cats.map((c) => c.id);
  const catWeightMap = new Map(cats.map((c) => [c.id, c.weight]));

  const paramsList = catIds.length > 0
    ? await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, catIds)).orderBy(asc(kpiParameters.sortOrder))
    : [];
  const paramIds = paramsList.map((p) => p.id);

  const bandsList = paramIds.length > 0
    ? await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramIds)).orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
    : [];

  const bandsByParamMap = new Map<number, Array<{ id: number; label: string; operator: string; minValue: number | null; maxValue: number | null; score: number; sortOrder: number }>>();
  for (const b of bandsList) {
    const list = bandsByParamMap.get(b.parameterId) || [];
    list.push({
      id: b.id,
      label: b.label,
      operator: b.operator,
      minValue: b.minValue !== null ? Number(b.minValue) : null,
      maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
      score: Number(b.score),
      sortOrder: b.sortOrder,
    });
    bandsByParamMap.set(b.parameterId, list);
  }

  // Query active department heads mapped by (departmentId + operatingUnit)
  const allDeptHeads = await db
    .select({
      departmentId: departmentHeads.departmentId,
      operatingUnit: departmentHeads.operatingUnit,
      employeeId: departmentHeads.employeeId,
    })
    .from(departmentHeads)
    .where(eq(departmentHeads.status, "Active"));

  const deptHeadMap = new Map<string, number>();
  for (const dh of allDeptHeads) {
    const ouKey = (dh.operatingUnit || "HO").trim().toUpperCase();
    deptHeadMap.set(`${dh.departmentId}_${ouKey}`, dh.employeeId);
  }

  // 3. Update appraisals for assigned employees (Only if scope is ALL or EMPLOYEES)
  if (scope === "ALL" || scope === "EMPLOYEES") {
    // A. Find currently assigned employees for this template in this period
    const currentlyAssignedAppraisals = await db
      .select({
        id: appraisals.id,
        employeeId: appraisals.employeeId,
        status: appraisals.status,
      })
      .from(appraisals)
      .where(and(eq(appraisals.periodId, periodId), eq(appraisals.templateId, templateId)));

    const targetEmpIdSet = new Set(assignedEmployeeIds);

    // B. For unselected employees who were previously assigned: unassign or remove
    const unselectedAppraisals = currentlyAssignedAppraisals.filter((a) => !targetEmpIdSet.has(a.employeeId));
    for (const unselected of unselectedAppraisals) {
      // If draft and has no submitted values, remove cleanly
      await db.delete(appraisals).where(eq(appraisals.id, unselected.id));
    }

    // Resolve primary template assessors for fallback if needed
    const allAssignedAssessorIds: number[] = [];
    for (const catId of catIds) {
      if (parameterAssessors[catId]) {
        allAssignedAssessorIds.push(...parameterAssessors[catId]);
      }
    }

    if (allAssignedAssessorIds.length === 0 && catIds.length > 0) {
      const existing = await db
        .select({ assessorId: kpiAssessorAssignments.assessorEmployeeId })
        .from(kpiAssessorAssignments)
        .where(
          and(
            eq(kpiAssessorAssignments.periodId, periodId),
            inArray(kpiAssessorAssignments.categoryId, catIds),
            eq(kpiAssessorAssignments.isActive, true)
          )
        );
      allAssignedAssessorIds.push(...existing.map((e) => e.assessorId));
    }

    // C. For selected employees: create or update appraisal & populate snapshot items
    for (const empId of assignedEmployeeIds) {
      const [emp] = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
      if (!emp) continue;

      const tenure = tenureMonths(emp.dateOfHire, period.evaluationDate);
      const eligible = tenure >= period.minTenureMonths;

      const empOU = (emp.operatingUnit || "HO").trim().toUpperCase();
      const autoHeadDeptId = deptHeadMap.get(`${emp.departmentId}_${empOU}`) ?? null;
      const override = nikOverrides.find((o) => o.employeeId === empId);
      const effectiveAssessorId = override ? override.assessorId : autoHeadDeptId;

      // Sync employee headDeptId if autoHeadDeptId exists
      if (autoHeadDeptId && emp.headDeptId !== autoHeadDeptId) {
        await db.update(employees).set({ headDeptId: autoHeadDeptId }).where(eq(employees.id, emp.id));
      }

      // No dummy data fallback: only set Head Dept if found in Master Head Dept (or override)
      const headDeptToSet = autoHeadDeptId ?? null;
      const appraiserToSet = override ? override.assessorId : (autoHeadDeptId ?? null);

      const [existingAppr] = await db
        .select()
        .from(appraisals)
        .where(and(eq(appraisals.employeeId, empId), eq(appraisals.periodId, periodId)))
        .limit(1);

      let appraisalId: number;

      if (existingAppr) {
        await db
          .update(appraisals)
          .set({
            templateId,
            appraiserId: appraiserToSet,
            headDeptId: headDeptToSet,
            managerId: emp.managerId ?? null,
            tenureMonths: tenure,
            isEligible: eligible,
            updatedAt: new Date(),
          })
          .where(eq(appraisals.id, existingAppr.id));
        appraisalId = existingAppr.id;

        // Re-populate items only if template changed or items are missing
        if (existingAppr.templateId !== templateId) {
          await db.delete(appraisalItems).where(eq(appraisalItems.appraisalId, existingAppr.id));
          if (paramsList.length > 0) {
            await db.insert(appraisalItems).values(
              paramsList.map((p) => ({
                appraisalId,
                parameterId: p.id,
                indicatorNameSnapshot: p.name,
                indicatorDescriptionSnapshot: p.description,
                parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
                target: p.target,
                targetSnapshot: p.target,
                unitSnapshot: p.unit,
                weightSnapshot: p.weight,
                scoringRulesSnapshot: bandsByParamMap.get(p.id) || [],
                monthlyTargets: p.target !== null && p.target !== undefined ? Array(12).fill(Number(p.target)) : null,
              }))
            );
          }
        }
      } else {
        const [inserted] = await db
          .insert(appraisals)
          .values({
            periodId,
            employeeId: emp.id,
            templateId,
            appraiserId: appraiserToSet,
            headDeptId: headDeptToSet,
            managerId: emp.managerId ?? null,
            tenureMonths: tenure,
            isEligible: eligible,
            status: "DRAFT",
          })
          .returning();
        appraisalId = inserted.id;

        if (paramsList.length > 0) {
          await db.insert(appraisalItems).values(
            paramsList.map((p) => ({
              appraisalId,
              parameterId: p.id,
              indicatorNameSnapshot: p.name,
              indicatorDescriptionSnapshot: p.description,
              parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
              target: p.target,
              targetSnapshot: p.target,
              unitSnapshot: p.unit,
              weightSnapshot: p.weight,
              scoringRulesSnapshot: bandsByParamMap.get(p.id) || [],
              monthlyTargets: p.target !== null && p.target !== undefined ? Array(12).fill(Number(p.target)) : null,
            }))
          );
        }
      }
    }
  }

  // 4. Save Assessor Assignments (Scope: ALL, ASSESSORS, or EMPLOYEES)
  if (scope === "ALL" || scope === "ASSESSORS" || scope === "EMPLOYEES") {
    if (catIds.length > 0) {
      // Remove existing assignments for these categories in this period
      await db
        .delete(kpiAssessorAssignments)
        .where(
          and(
            eq(kpiAssessorAssignments.periodId, periodId),
            inArray(kpiAssessorAssignments.categoryId, catIds)
          )
        );

      const newDeptAssignments: typeof kpiAssessorAssignments.$inferInsert[] = [];

      // A. Auto-assign Head Department as assessor for every assigned employee across all categories
      let targetEmpIds = assignedEmployeeIds.length > 0 ? assignedEmployeeIds : [];
      if (targetEmpIds.length === 0) {
        const assignedInDb = await db
          .select({ employeeId: appraisals.employeeId })
          .from(appraisals)
          .where(and(eq(appraisals.periodId, periodId), eq(appraisals.templateId, templateId)));
        targetEmpIds = assignedInDb.map((a) => a.employeeId);
      }
      for (const empId of targetEmpIds) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
        if (!emp) continue;

        const empOU = (emp.operatingUnit || "HO").trim().toUpperCase();
        const autoHeadDeptId = deptHeadMap.get(`${emp.departmentId}_${empOU}`) ?? null;
        const override = nikOverrides.find((o) => o.employeeId === empId);
        const effectiveAssessorId = override ? override.assessorId : autoHeadDeptId;

        if (!effectiveAssessorId) continue;

        for (const catId of catIds) {
          newDeptAssignments.push({
            periodId,
            categoryId: catId,
            assessorEmployeeId: effectiveAssessorId,
            assessorDeptId: tpl.departmentId,
            scopeType: override ? "INDIVIDUAL" : "DEPARTMENT",
            targetEmployeeId: override ? empId : null,
            targetDepartmentId: override ? null : tpl.departmentId,
            roleAssessor: "HEAD_DEPT",
            stage: "PENILAI",
            notes: override
              ? `NIK Override Khusus Karyawan ID: ${empId}`
              : `Auto-Assigned Head Department (${empOU})`,
            createdBy: actorId || null,
          });
        }
      }

      // B. If manual parameterAssessors were also provided, merge them
      for (const catId of catIds) {
        const assessorIds = parameterAssessors[catId] || [];
        for (const assessorId of assessorIds) {
          newDeptAssignments.push({
            periodId,
            categoryId: catId,
            assessorEmployeeId: assessorId,
            assessorDeptId: tpl.departmentId,
            scopeType: "DEPARTMENT",
            targetEmployeeId: null,
            targetDepartmentId: null,
            roleAssessor: "HEAD_DEPT",
            stage: "PENILAI",
            notes: `Penugasan Departemen Template: ${tpl.name}`,
            createdBy: actorId || null,
          });
        }
      }

      // C. Also apply any explicit NIK Overrides
      for (const ov of nikOverrides) {
        if (ov.employeeId === ov.assessorId) {
          throw new Error("Karyawan tidak boleh menjadi penilai untuk dirinya sendiri.");
        }
        const targetCats = ov.categoryId ? [ov.categoryId] : catIds;
        for (const cId of targetCats) {
          newDeptAssignments.push({
            periodId,
            categoryId: cId,
            assessorEmployeeId: ov.assessorId,
            assessorDeptId: tpl.departmentId,
            scopeType: "INDIVIDUAL",
            targetEmployeeId: ov.employeeId,
            targetDepartmentId: null,
            roleAssessor: "SPECIAL_ASSESSOR",
            stage: "PENILAI",
            notes: `NIK Override Khusus Karyawan ID: ${ov.employeeId}`,
            createdBy: actorId || null,
          });
        }
      }

      // Deduplicate
      const uniqueKeys = new Set<string>();
      const toInsert: typeof kpiAssessorAssignments.$inferInsert[] = [];
      for (const a of newDeptAssignments) {
        const key = `${a.periodId}_${a.categoryId}_${a.assessorEmployeeId}_${a.scopeType}_${a.targetEmployeeId ?? "null"}`;
        if (!uniqueKeys.has(key)) {
          uniqueKeys.add(key);
          toInsert.push(a);
        }
      }

      if (toInsert.length > 0) {
        await db.insert(kpiAssessorAssignments).values(toInsert);
      }
    }
  }

  // 5. Record Audit Trail
  const auditAction =
    scope === "EMPLOYEES"
      ? "ASSIGN_TEMPLATE_EMPLOYEES"
      : scope === "ASSESSORS"
      ? "ASSIGN_TEMPLATE_ASSESSORS"
      : "ASSIGN_TEMPLATE_AND_ASSESSORS";

  await db.insert(auditLogs).values({
    entity: "template_assignment",
    entityId: templateId,
    action: auditAction,
    actor,
    changes: JSON.stringify({
      templateId,
      templateName: tpl.name,
      periodId,
      scope,
      assignedEmployeeCount: assignedEmployeeIds.length,
      assignedEmployeeIds: scope !== "ASSESSORS" ? assignedEmployeeIds : undefined,
      nikOverridesCount: nikOverrides.length,
    }),
  });

  // 6. Invalidate caches across related pages
  try {
    revalidatePath("/setup/templates");
    revalidatePath("/setup/assignments");
    revalidatePath("/dashboard");
    revalidatePath("/input-kpi");
    revalidatePath("/admin");
  } catch {
    // Ignore safe outside Next.js request context
  }

  return {
    success: true,
    templateId,
    periodId,
    scope,
    assignedCount: assignedEmployeeIds.length,
  };
}
