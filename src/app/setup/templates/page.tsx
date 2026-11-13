import { db } from "@/db";
import {
  appraisals,
  departments,
  employees,
  jobLevels,
  jobPositions,
  jobCategories,
  jobPositionMappings,
  kpiAssessorAssignments,
  kpiBands,
  kpiCategories,
  kpiParameters,
  kpiPeriods,
  kpiTemplates,
  pits,
  departmentMappings,
} from "@/db/schema";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import {
  assignTemplateToEmployees,
  createTemplate,
  deleteTemplate,
  deleteTemplatesBulk,
  duplicateTemplate,
  updateTemplate,
  getMasterParameters,
  createMasterParameter,
  updateMasterParameter,
  deleteMasterParameter,
  deleteMasterParametersBulk,
  importMasterParametersBulk,
  resetAndSyncMasterParametersFromTemplatesAction,
} from "@/lib/actions";
import { TemplateHubClient } from "@/components/template-hub-client";
import { getTemplateAssignmentsOverview } from "@/lib/template-assignment-service";
import { getCurrentUser } from "@/lib/auth";
import { hasUserPermission } from "@/lib/rbac-catalog";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; dept?: string }>;
}) {
  const { view, dept } = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const canAccess =
    currentUser.role === "ADMIN" ||
    currentUser.role === "HR" ||
    currentUser.isCustomRole ||
    hasUserPermission(currentUser, "template.view");
  if (!canAccess) {
    redirect("/dashboard");
  }

  const [tpls, deps, lvls, positions, cats, params, bnds, emps, periods, masterParams, appraisalCounts, pitList, deptMappings, allJobCategories, allJobPositionMappings] =
    await Promise.all([
      db.select().from(kpiTemplates).orderBy(asc(kpiTemplates.departmentId), asc(kpiTemplates.jobLevelId)),
      db.select().from(departments).orderBy(asc(departments.name)),
      db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
      db.select().from(jobPositions).where(eq(jobPositions.isActive, true)).orderBy(asc(jobPositions.name)),
      db.select().from(kpiCategories).orderBy(asc(kpiCategories.sortOrder)),
      db.select().from(kpiParameters).orderBy(asc(kpiParameters.sortOrder)),
      db.select().from(kpiBands).orderBy(asc(kpiBands.sortOrder)),
      db
        .select({
          id: employees.id,
          nik: employees.nik,
          name: employees.name,
          departmentId: employees.departmentId,
          jobLevelId: employees.jobLevelId,
          jobPosition: employees.jobPosition,
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.name)) as unknown as Promise<typeof employees.$inferSelect[]>,
      db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)),
      getMasterParameters(undefined, true),
      db
        .select({
          templateId: appraisals.templateId,
          count: sql<number>`count(distinct ${appraisals.employeeId})::int`,
        })
        .from(appraisals)
        .where(isNotNull(appraisals.templateId))
        .groupBy(appraisals.templateId),
      db.select().from(pits).orderBy(asc(pits.name)),
      db.select().from(departmentMappings).orderBy(asc(departmentMappings.rawDepartmentName)),
      db.select().from(jobCategories).orderBy(asc(jobCategories.sortOrder), asc(jobCategories.name)),
      db
        .select({
          departmentId: jobPositionMappings.departmentId,
          jobCategoryId: jobPositionMappings.jobCategoryId,
        })
        .from(jobPositionMappings)
        .where(isNotNull(jobPositionMappings.jobCategoryId)),
    ]);

  const templateUsageMap: Record<number, number> = {};
  for (const row of appraisalCounts) {
    if (row.templateId) {
      templateUsageMap[row.templateId] = Number(row.count);
    }
  }

  const activePeriod = periods.find((p: typeof kpiPeriods.$inferSelect) => p.status === "ACTIVE") ?? periods[0];
  const activeAppraisals = activePeriod
    ? await db.select().from(appraisals).where(eq(appraisals.periodId, activePeriod.id))
    : [];

  const assignmentOverview = activePeriod
    ? await getTemplateAssignmentsOverview(activePeriod.id)
    : {};

  return (
    <div>
      <TemplateHubClient
        templates={tpls}
        departments={deps}
        jobLevels={lvls}
        jobPositions={positions}
        jobCategories={allJobCategories}
        jobPositionMappings={allJobPositionMappings}
        categories={cats}
        parameters={params}
        bands={bnds}
        employees={emps}
        activePeriod={activePeriod}
        periods={periods}
        existingAppraisals={activeAppraisals}
        templateUsageMap={templateUsageMap}
        assignmentOverview={assignmentOverview}
        masterParameters={masterParams}
        pits={pitList}
        departmentMappings={deptMappings}
        createTemplateAction={createTemplate}
        deleteTemplateAction={deleteTemplate}
        deleteTemplatesBulkAction={deleteTemplatesBulk}
        updateTemplateAction={updateTemplate}
        assignTemplateAction={assignTemplateToEmployees}
        duplicateTemplateAction={duplicateTemplate}
        createMasterParamAction={createMasterParameter}
        updateMasterParamAction={updateMasterParameter}
        deleteMasterParamAction={deleteMasterParameter}
        deleteMasterParamBulkAction={deleteMasterParametersBulk}
        importBulkMasterParamAction={importMasterParametersBulk}
        resetAndSyncFromTemplatesAction={resetAndSyncMasterParametersFromTemplatesAction}
        initialView={view}
        initialDept={dept}
      />
    </div>
  );
}
