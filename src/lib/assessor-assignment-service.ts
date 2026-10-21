import { db } from "@/db";
import {
  kpiAssessorAssignments,
  kpiAssessorDelegations,
  kpiParameters,
  kpiCategories,
  kpiTemplates,
  employees,
  departments,
  jobLevels,
  jobPositions,
  appraisals,
  appraisalItems,
  kpiPeriods,
  auditLogs,
  departmentHeads,
} from "@/db/schema";
import { and, eq, inArray, lte, gte, or, sql, desc, asc, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface AssessorInfo {
  id: number;
  nik: string;
  name: string;
  jobPosition: string;
  departmentName?: string;
  isDelegated?: boolean;
}

export interface ResolveAssessorResult {
  primaryAssessorIds: number[];
  delegatedAssessorIds: number[];
  effectiveAssessorIds: number[];
  assessors: AssessorInfo[];
  source: "NIK_OVERRIDE" | "DEPT_ASSIGNMENT" | "GLOBAL_ASSIGNMENT" | "DEFAULT_HIERARCHY";
}

/**
 * Resolves authorized assessors for a specific KPI Parameter (categoryId) and target employee.
 * Uses cascading priority:
 * 1. NIK Specific Override (P1)
 * 2. Department Assessor Scope (P2)
 * 3. Default Assessor / Hierarchy (P3)
 * Then merges any active delegations for the primary assessors.
 */
export async function getAuthorizedAssessorIds(params: {
  periodId: number;
  categoryId: number;
  targetEmployeeId: number;
  targetDepartmentId?: number;
  parameterPicRole?: string | null;
  defaultAssessorId?: number | null;
  employeeAppraiserId?: number | null;
  employeeHeadDeptId?: number | null;
  employeeManagerId?: number | null;
}): Promise<ResolveAssessorResult> {
  const { periodId, categoryId, targetEmployeeId } = params;

  let primaryAssessorIds: number[] = [];
  let source: ResolveAssessorResult["source"] = "DEFAULT_HIERARCHY";

  // 1. Priority 1: Specific NIK Override for this employee on this parameter
  const indAssigns = await db
    .select({ assessorId: kpiAssessorAssignments.assessorEmployeeId })
    .from(kpiAssessorAssignments)
    .where(
      and(
        eq(kpiAssessorAssignments.periodId, periodId),
        eq(kpiAssessorAssignments.categoryId, categoryId),
        eq(kpiAssessorAssignments.scopeType, "INDIVIDUAL"),
        eq(kpiAssessorAssignments.targetEmployeeId, targetEmployeeId),
        eq(kpiAssessorAssignments.isActive, true)
      )
    );

  if (indAssigns.length > 0) {
    primaryAssessorIds = indAssigns.map((a) => a.assessorId);
    source = "NIK_OVERRIDE";
  } else {
    // 2. Priority 2: Department Scope Assignment
    // Check if there is an assessor department assigned for this parameter
    const deptAssigns = await db
      .select({ assessorId: kpiAssessorAssignments.assessorEmployeeId })
      .from(kpiAssessorAssignments)
      .where(
        and(
          eq(kpiAssessorAssignments.periodId, periodId),
          eq(kpiAssessorAssignments.categoryId, categoryId),
          eq(kpiAssessorAssignments.scopeType, "DEPARTMENT"),
          eq(kpiAssessorAssignments.isActive, true)
        )
      );

    if (deptAssigns.length > 0) {
      primaryAssessorIds = deptAssigns.map((a) => a.assessorId);
      source = "DEPT_ASSIGNMENT";
    } else {
      // 3. Priority 2.5: Global Scope (Template-wide)
      const globalAssigns = await db
        .select({ assessorId: kpiAssessorAssignments.assessorEmployeeId })
        .from(kpiAssessorAssignments)
        .where(
          and(
            eq(kpiAssessorAssignments.periodId, periodId),
            eq(kpiAssessorAssignments.categoryId, categoryId),
            eq(kpiAssessorAssignments.scopeType, "GLOBAL"),
            eq(kpiAssessorAssignments.isActive, true)
          )
        );

      if (globalAssigns.length > 0) {
        primaryAssessorIds = globalAssigns.map((a) => a.assessorId);
        source = "GLOBAL_ASSIGNMENT";
      } else {
        // 4. Priority 3: Fallback Default Hierarchy / Default Assessor
        if (params.defaultAssessorId) {
          primaryAssessorIds = [params.defaultAssessorId];
        } else if (params.parameterPicRole === "HEAD_DEPT" && params.employeeHeadDeptId) {
          primaryAssessorIds = [params.employeeHeadDeptId];
        } else if (params.parameterPicRole === "MANAGER" && params.employeeManagerId) {
          primaryAssessorIds = [params.employeeManagerId];
        } else if (params.employeeAppraiserId) {
          primaryAssessorIds = [params.employeeAppraiserId];
        } else if (params.employeeHeadDeptId) {
          primaryAssessorIds = [params.employeeHeadDeptId];
        }
      }
    }
  }

  // Deduplicate primary assessor IDs
  primaryAssessorIds = Array.from(new Set(primaryAssessorIds));

  // 5. Check active delegations for all primary assessors
  const today = new Date().toISOString().split("T")[0];
  let delegatedAssessorIds: number[] = [];

  if (primaryAssessorIds.length > 0) {
    const activeDelegations = await db
      .select({ delegateeId: kpiAssessorDelegations.delegateeEmployeeId })
      .from(kpiAssessorDelegations)
      .where(
        and(
          eq(kpiAssessorDelegations.periodId, periodId),
          inArray(kpiAssessorDelegations.delegatorEmployeeId, primaryAssessorIds),
          lte(kpiAssessorDelegations.startDate, today),
          gte(kpiAssessorDelegations.endDate, today),
          eq(kpiAssessorDelegations.isActive, true),
          or(
            eq(kpiAssessorDelegations.scopeType, "ALL"),
            and(
              eq(kpiAssessorDelegations.scopeType, "DEPARTMENT"),
              params.targetDepartmentId
                ? eq(kpiAssessorDelegations.departmentId, params.targetDepartmentId)
                : sql`TRUE`
            ),
            and(
              eq(kpiAssessorDelegations.scopeType, "PARAMETER"),
              eq(kpiAssessorDelegations.categoryId, categoryId)
            )
          )
        )
      );

    delegatedAssessorIds = Array.from(new Set(activeDelegations.map((d) => d.delegateeId)));
  }

  const effectiveAssessorIds = Array.from(new Set([...primaryAssessorIds, ...delegatedAssessorIds]));

  // Retrieve details for all effective assessors
  const assessors: AssessorInfo[] = [];
  if (effectiveAssessorIds.length > 0) {
    const assessorRows = await db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        jobPosition: employees.jobPosition,
        departmentName: departments.name,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(inArray(employees.id, effectiveAssessorIds));

    for (const row of assessorRows) {
      assessors.push({
        id: row.id,
        nik: row.nik,
        name: row.name,
        jobPosition: row.jobPosition,
        departmentName: row.departmentName ?? undefined,
        isDelegated: delegatedAssessorIds.includes(row.id),
      });
    }
  }

  return {
    primaryAssessorIds,
    delegatedAssessorIds,
    effectiveAssessorIds,
    assessors,
    source,
  };
}

/**
 * Validates whether currentUser has editing authority for a KPI parameter or indicator.
 * Resolves to the parent Parameter (categoryId) so all child indicators inherit authority.
 */
export async function isUserAuthorizedForParameter(params: {
  currentUser: { id: number; role: string };
  periodId: number;
  categoryId?: number;
  parameterId?: number;
  targetEmployeeId: number;
  targetDepartmentId?: number;
  parameterPicRole?: string | null;
  defaultAssessorId?: number | null;
  employeeAppraiserId?: number | null;
  employeeHeadDeptId?: number | null;
  employeeManagerId?: number | null;
}): Promise<{ isAuthorized: boolean; resolveResult: ResolveAssessorResult }> {
  let catId = params.categoryId;

  if (!catId && params.parameterId) {
    const [p] = await db
      .select({ categoryId: kpiParameters.categoryId })
      .from(kpiParameters)
      .where(eq(kpiParameters.id, params.parameterId))
      .limit(1);
    if (p) catId = p.categoryId;
  }

  if (!catId) {
    catId = 1; // Fallback
  }

  const resolveParams = {
    ...params,
    categoryId: catId,
    targetDepartmentId: params.targetDepartmentId ?? 1,
  };

  const { currentUser, targetEmployeeId } = params;

  // Superadmin or HR has universal authority
  if (currentUser.role === "ADMIN" || currentUser.role === "HR") {
    const resolveResult = await getAuthorizedAssessorIds(resolveParams);
    return { isAuthorized: true, resolveResult };
  }

  // Self-assessment guard: cannot score own KPI
  if (currentUser.id === targetEmployeeId) {
    const resolveResult = await getAuthorizedAssessorIds(resolveParams);
    return { isAuthorized: false, resolveResult };
  }

  const resolveResult = await getAuthorizedAssessorIds(resolveParams);
  const isAuthorized = resolveResult.effectiveAssessorIds.includes(currentUser.id);

  return { isAuthorized, resolveResult };
}

/**
 * Query assessor assignments with joined information for admin management.
 * Focuses on Parameter KPI (kpiCategories) as the assignment target.
 */
export async function getAssessorAssignments(params: {
  periodId: number;
  templateId?: number;
  categoryId?: number;
  departmentId?: number;
  jobLevelId?: number;
  jobPositionId?: number;
  roleAssessor?: string;
  stage?: string;
  search?: string;
}) {
  const {
    periodId,
    templateId,
    categoryId,
    departmentId,
    jobLevelId,
    jobPositionId,
    roleAssessor,
    stage,
    search,
  } = params;

  const targetEmp = alias(employees, "targetEmp");
  const targetDept = alias(departments, "targetDept");
  const assessorDept = alias(departments, "assessorDept");
  const targetJobPos = alias(jobPositions, "targetJobPos");
  const targetJobLvl = alias(jobLevels, "targetJobLvl");

  const conditions = [
    eq(kpiAssessorAssignments.periodId, periodId),
    eq(kpiAssessorAssignments.isActive, true),
  ];

  if (categoryId) {
    conditions.push(eq(kpiAssessorAssignments.categoryId, categoryId));
  }
  if (roleAssessor && roleAssessor !== "ALL") {
    conditions.push(eq(kpiAssessorAssignments.roleAssessor, roleAssessor));
  }
  if (stage && stage !== "ALL") {
    conditions.push(eq(kpiAssessorAssignments.stage, stage));
  }
  if (departmentId) {
    conditions.push(
      or(
        eq(kpiAssessorAssignments.targetDepartmentId, departmentId),
        eq(targetEmp.departmentId, departmentId),
        eq(kpiAssessorAssignments.assessorDeptId, departmentId)
      )!
    );
  }
  if (jobLevelId) {
    conditions.push(eq(targetEmp.jobLevelId, jobLevelId));
  }
  if (jobPositionId) {
    conditions.push(eq(targetEmp.jobPositionId, jobPositionId));
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(targetEmp.name, q),
        ilike(targetEmp.nik, q),
        ilike(employees.name, q),
        ilike(employees.nik, q),
        ilike(kpiCategories.name, q)
      )!
    );
  }

  const rows = await db
    .select({
      id: kpiAssessorAssignments.id,
      periodId: kpiAssessorAssignments.periodId,
      categoryId: kpiAssessorAssignments.categoryId,
      categoryName: kpiCategories.name,
      categoryWeight: kpiCategories.weight,
      templateId: kpiCategories.templateId,
      templateName: kpiTemplates.name,
      assessorId: kpiAssessorAssignments.assessorEmployeeId,
      assessorNik: employees.nik,
      assessorName: employees.name,
      assessorPosition: employees.jobPosition,
      assessorDeptId: kpiAssessorAssignments.assessorDeptId,
      assessorDepartmentName: assessorDept.name,
      roleAssessor: kpiAssessorAssignments.roleAssessor,
      stage: kpiAssessorAssignments.stage,
      scopeType: kpiAssessorAssignments.scopeType,
      targetDepartmentId: kpiAssessorAssignments.targetDepartmentId,
      targetDepartmentName: targetDept.name,
      targetEmployeeId: kpiAssessorAssignments.targetEmployeeId,
      targetEmployeeNik: targetEmp.nik,
      targetEmployeeName: targetEmp.name,
      targetEmployeePosition: sql<string>`COALESCE(${targetJobPos.name}, ${targetEmp.jobPosition})`,
      targetEmployeeJobLevelName: targetJobLvl.name,
      notes: kpiAssessorAssignments.notes,
      createdAt: kpiAssessorAssignments.createdAt,
    })
    .from(kpiAssessorAssignments)
    .innerJoin(kpiCategories, eq(kpiAssessorAssignments.categoryId, kpiCategories.id))
    .innerJoin(kpiTemplates, eq(kpiCategories.templateId, kpiTemplates.id))
    .innerJoin(employees, eq(kpiAssessorAssignments.assessorEmployeeId, employees.id))
    .leftJoin(assessorDept, eq(kpiAssessorAssignments.assessorDeptId, assessorDept.id))
    .leftJoin(targetDept, eq(kpiAssessorAssignments.targetDepartmentId, targetDept.id))
    .leftJoin(targetEmp, eq(kpiAssessorAssignments.targetEmployeeId, targetEmp.id))
    .leftJoin(targetJobPos, eq(targetEmp.jobPositionId, targetJobPos.id))
    .leftJoin(targetJobLvl, eq(targetEmp.jobLevelId, targetJobLvl.id))
    .where(and(...conditions))
    .orderBy(desc(kpiAssessorAssignments.createdAt));

  if (templateId) {
    return rows.filter((r) => r.templateId === templateId);
  }

  return rows;
}

/**
 * Bulk / single save for assessor assignments at the Parameter KPI level.
 * Supports assigning multiple assessors to multiple parameters (many-to-many).
 */
export async function saveAssessorAssignments(params: {
  periodId: number;
  categoryIds: number[];
  assessorEmployeeIds: number[];
  scopeType: "INDIVIDUAL" | "DEPARTMENT" | "GLOBAL";
  assessorDeptId?: number | null;
  targetEmployeeIds?: number[];
  targetDepartmentIds?: number[];
  roleAssessor?: string;
  stage?: string;
  notes?: string;
  actorId?: number;
}) {
  const {
    periodId,
    categoryIds,
    assessorEmployeeIds,
    scopeType,
    assessorDeptId,
    targetEmployeeIds = [],
    roleAssessor = "PENILAI_1",
    stage = "MONTHLY",
    notes,
    actorId,
  } = params;

  if (categoryIds.length === 0) throw new Error("Minimal satu parameter KPI wajib dipilih.");
  if (assessorEmployeeIds.length === 0) throw new Error("Minimal satu asesor wajib dipilih.");

  const insertedRecords: (typeof kpiAssessorAssignments.$inferInsert)[] = [];

  for (const catId of categoryIds) {
    for (const assessorId of assessorEmployeeIds) {
      if (scopeType === "GLOBAL") {
        insertedRecords.push({
          periodId,
          categoryId: catId,
          assessorEmployeeId: assessorId,
          scopeType: "GLOBAL",
          assessorDeptId: assessorDeptId || null,
          targetEmployeeId: null,
          targetDepartmentId: null,
          roleAssessor,
          stage,
          notes: notes || null,
          createdBy: actorId || null,
        });
      } else if (scopeType === "DEPARTMENT") {
        insertedRecords.push({
          periodId,
          categoryId: catId,
          assessorEmployeeId: assessorId,
          scopeType: "DEPARTMENT",
          assessorDeptId: assessorDeptId || null,
          targetEmployeeId: null,
          targetDepartmentId: null,
          roleAssessor,
          stage,
          notes: notes || null,
          createdBy: actorId || null,
        });
      } else if (scopeType === "INDIVIDUAL") {
        if (targetEmployeeIds.length === 0) {
          throw new Error("Target karyawan wajib dipilih untuk cakupan INDIVIDUAL (NIK Override).");
        }
        for (const empId of targetEmployeeIds) {
          if (empId === assessorId) {
            throw new Error("Asesor tidak boleh ditugaskan untuk menilai dirinya sendiri.");
          }
          insertedRecords.push({
            periodId,
            categoryId: catId,
            assessorEmployeeId: assessorId,
            scopeType: "INDIVIDUAL",
            assessorDeptId: assessorDeptId || null,
            targetEmployeeId: empId,
            targetDepartmentId: null,
            roleAssessor,
            stage,
            notes: notes || null,
            createdBy: actorId || null,
          });
        }
      }
    }
  }

  // Insert records while skipping duplicates
  let count = 0;
  for (const rec of insertedRecords) {
    const existing = await db
      .select({ id: kpiAssessorAssignments.id })
      .from(kpiAssessorAssignments)
      .where(
        and(
          eq(kpiAssessorAssignments.periodId, rec.periodId),
          eq(kpiAssessorAssignments.categoryId, rec.categoryId),
          eq(kpiAssessorAssignments.assessorEmployeeId, rec.assessorEmployeeId),
          eq(kpiAssessorAssignments.scopeType, rec.scopeType as string),
          rec.targetEmployeeId
            ? eq(kpiAssessorAssignments.targetEmployeeId, rec.targetEmployeeId)
            : sql`${kpiAssessorAssignments.targetEmployeeId} IS NULL`,
          eq(kpiAssessorAssignments.roleAssessor, rec.roleAssessor || "PENILAI_1"),
          eq(kpiAssessorAssignments.stage, rec.stage || "MONTHLY"),
          eq(kpiAssessorAssignments.isActive, true)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(kpiAssessorAssignments).values(rec);
      count++;
    }
  }

  return { success: true, count };
}

/**
 * Remove an assessor assignment.
 */
export async function deleteAssessorAssignment(assignmentId: number) {
  await db
    .update(kpiAssessorAssignments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(kpiAssessorAssignments.id, assignmentId));

  return { success: true };
}

/**
 * Bulk assign KPI Template to multiple employees.
 */
export async function bulkAssignTemplateToEmployees(params: {
  periodId: number;
  templateId: number;
  employeeIds: number[];
  actorId?: number;
}) {
  const { periodId, templateId, employeeIds } = params;

  if (employeeIds.length === 0) {
    throw new Error("Pilih minimal satu karyawan untuk pemasangan template.");
  }

  // Check template existence
  const [template] = await db
    .select()
    .from(kpiTemplates)
    .where(eq(kpiTemplates.id, templateId))
    .limit(1);

  if (!template) throw new Error("Template KPI tidak ditemukan.");

  // Get template categories
  const categories = await db
    .select({ id: kpiCategories.id })
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, templateId));
  const categoryIds = categories.map((c) => c.id);

  let updatedCount = 0;

  for (const empId of employeeIds) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!emp) continue;

    // Resolve Head Department from Master Head Department: Employee -> Department -> OU -> Head Dept
    const empOU = (emp.operatingUnit || "HO").trim().toUpperCase();
    const [activeHeadRecord] = await db
      .select({ employeeId: departmentHeads.employeeId })
      .from(departmentHeads)
      .where(
        and(
          eq(departmentHeads.departmentId, emp.departmentId),
          eq(departmentHeads.operatingUnit, empOU),
          eq(departmentHeads.status, "Active")
        )
      )
      .limit(1);

    const autoHeadDeptId = activeHeadRecord ? activeHeadRecord.employeeId : null;

    if (autoHeadDeptId && emp.headDeptId !== autoHeadDeptId) {
      await db.update(employees).set({ headDeptId: autoHeadDeptId }).where(eq(employees.id, emp.id));
    }

    // Find or create appraisal
    const [existingAppraisal] = await db
      .select()
      .from(appraisals)
      .where(and(eq(appraisals.periodId, periodId), eq(appraisals.employeeId, empId)))
      .limit(1);

    if (existingAppraisal) {
      await db
        .update(appraisals)
        .set({
          templateId,
          headDeptId: autoHeadDeptId,
          appraiserId: autoHeadDeptId,
          updatedAt: new Date(),
        })
        .where(eq(appraisals.id, existingAppraisal.id));
      updatedCount++;
    } else {
      await db.insert(appraisals).values({
        periodId,
        employeeId: empId,
        templateId,
        appraiserId: autoHeadDeptId,
        headDeptId: autoHeadDeptId,
        managerId: emp.managerId,
        status: "DRAFT",
      });
      updatedCount++;
    }

    // Auto-create category assessor assignments if Head Dept is found
    if (autoHeadDeptId && categoryIds.length > 0) {
      for (const catId of categoryIds) {
        const [existingAssign] = await db
          .select({ id: kpiAssessorAssignments.id })
          .from(kpiAssessorAssignments)
          .where(
            and(
              eq(kpiAssessorAssignments.periodId, periodId),
              eq(kpiAssessorAssignments.categoryId, catId),
              eq(kpiAssessorAssignments.assessorEmployeeId, autoHeadDeptId),
              eq(kpiAssessorAssignments.targetEmployeeId, empId)
            )
          )
          .limit(1);

        if (!existingAssign) {
          await db.insert(kpiAssessorAssignments).values({
            periodId,
            categoryId: catId,
            assessorEmployeeId: autoHeadDeptId,
            assessorDeptId: emp.departmentId,
            scopeType: "INDIVIDUAL",
            targetEmployeeId: empId,
            roleAssessor: "HEAD_DEPT",
            stage: "PENILAI",
            notes: `Auto-Assigned Head Department (${empOU})`,
            createdBy: params.actorId || null,
          });
        }
      }
    }
  }

  return { success: true, updatedCount };
}

/**
 * Assessor Delegation Service: Fetch active delegations
 */
export async function getAssessorDelegations(params: {
  periodId: number;
  departmentId?: number;
  delegatorEmployeeId?: number;
  delegateeEmployeeId?: number;
  stage?: string;
  status?: string;
}) {
  const {
    periodId,
    departmentId,
    delegatorEmployeeId,
    delegateeEmployeeId,
    stage,
    status,
  } = params;

  const delegatorEmp = alias(employees, "delegatorEmp");
  const delegateeEmp = alias(employees, "delegateeEmp");
  const delegatorDept = alias(departments, "delegatorDept");
  const delegateeDept = alias(departments, "delegateeDept");

  const conditions = [eq(kpiAssessorDelegations.periodId, periodId)];

  if (delegatorEmployeeId) {
    conditions.push(eq(kpiAssessorDelegations.delegatorEmployeeId, delegatorEmployeeId));
  }
  if (delegateeEmployeeId) {
    conditions.push(eq(kpiAssessorDelegations.delegateeEmployeeId, delegateeEmployeeId));
  }
  if (stage && stage !== "ALL") {
    conditions.push(eq(kpiAssessorDelegations.stage, stage));
  }
  if (departmentId) {
    conditions.push(
      or(
        eq(kpiAssessorDelegations.departmentId, departmentId),
        eq(delegatorEmp.departmentId, departmentId),
        eq(delegateeEmp.departmentId, departmentId)
      )!
    );
  }

  const today = new Date().toISOString().split("T")[0];

  if (status === "ACTIVE") {
    conditions.push(
      and(
        eq(kpiAssessorDelegations.isActive, true),
        gte(kpiAssessorDelegations.endDate, today)
      )!
    );
  } else if (status === "EXPIRED") {
    conditions.push(
      and(
        eq(kpiAssessorDelegations.isActive, true),
        sql`${kpiAssessorDelegations.endDate} < ${today}`
      )!
    );
  } else if (status === "REVOKED") {
    conditions.push(eq(kpiAssessorDelegations.isActive, false));
  }

  return db
    .select({
      id: kpiAssessorDelegations.id,
      periodId: kpiAssessorDelegations.periodId,
      delegatorId: kpiAssessorDelegations.delegatorEmployeeId,
      delegatorNik: delegatorEmp.nik,
      delegatorName: delegatorEmp.name,
      delegatorPosition: delegatorEmp.jobPosition,
      delegatorDepartment: delegatorDept.name,
      delegateeId: kpiAssessorDelegations.delegateeEmployeeId,
      delegateeNik: delegateeEmp.nik,
      delegateeName: delegateeEmp.name,
      delegateePosition: delegateeEmp.jobPosition,
      delegateeDepartment: delegateeDept.name,
      startDate: kpiAssessorDelegations.startDate,
      endDate: kpiAssessorDelegations.endDate,
      reason: kpiAssessorDelegations.reason,
      scopeType: kpiAssessorDelegations.scopeType,
      stage: kpiAssessorDelegations.stage,
      departmentId: kpiAssessorDelegations.departmentId,
      departmentName: departments.name,
      categoryId: kpiAssessorDelegations.categoryId,
      categoryName: kpiCategories.name,
      isActive: kpiAssessorDelegations.isActive,
      createdAt: kpiAssessorDelegations.createdAt,
    })
    .from(kpiAssessorDelegations)
    .innerJoin(delegatorEmp, eq(kpiAssessorDelegations.delegatorEmployeeId, delegatorEmp.id))
    .innerJoin(delegateeEmp, eq(kpiAssessorDelegations.delegateeEmployeeId, delegateeEmp.id))
    .leftJoin(delegatorDept, eq(delegatorEmp.departmentId, delegatorDept.id))
    .leftJoin(delegateeDept, eq(delegateeEmp.departmentId, delegateeDept.id))
    .leftJoin(departments, eq(kpiAssessorDelegations.departmentId, departments.id))
    .leftJoin(kpiCategories, eq(kpiAssessorDelegations.categoryId, kpiCategories.id))
    .where(and(...conditions))
    .orderBy(desc(kpiAssessorDelegations.createdAt));
}

/**
 * Assessor Delegation Service: Create new delegation
 */
export async function createAssessorDelegation(params: {
  periodId: number;
  delegatorEmployeeId: number;
  delegateeEmployeeId: number;
  startDate: string;
  endDate: string;
  reason: string;
  scopeType?: "ALL" | "DEPARTMENT" | "PARAMETER";
  stage?: string;
  departmentId?: number;
  categoryId?: number;
  actorId?: number;
}) {
  const {
    periodId,
    delegatorEmployeeId,
    delegateeEmployeeId,
    startDate,
    endDate,
    reason,
    scopeType = "ALL",
    stage = "MONTHLY",
    departmentId,
    categoryId,
    actorId,
  } = params;

  if (delegatorEmployeeId === delegateeEmployeeId) {
    throw new Error("Pemberi delegasi dan penerima delegasi tidak boleh karyawan yang sama.");
  }
  if (!startDate || !endDate) {
    throw new Error("Tanggal mulai dan tanggal selesai delegasi wajib diisi.");
  }
  if (startDate > endDate) {
    throw new Error("Tanggal mulai tidak boleh lebih besar dari tanggal selesai.");
  }
  if (!reason.trim()) {
    throw new Error("Alasan pendelegasian wajib diisi.");
  }

  const [created] = await db
    .insert(kpiAssessorDelegations)
    .values({
      periodId,
      delegatorEmployeeId,
      delegateeEmployeeId,
      startDate,
      endDate,
      reason: reason.trim(),
      scopeType,
      stage,
      departmentId: departmentId || null,
      categoryId: categoryId || null,
      createdBy: actorId || null,
      isActive: true,
    })
    .returning();

  return created;
}

/**
 * Assessor Delegation Service: Revoke delegation
 */
export async function revokeAssessorDelegation(delegationId: number) {
  await db
    .update(kpiAssessorDelegations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(kpiAssessorDelegations.id, delegationId));

  return { success: true };
}
