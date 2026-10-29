import { db } from "@/db";
import {
  systemConfig,
  employees,
  departments,
  jobLevels,
  jobPositions,
  departmentHeads,
  auditLogs,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  type ApprovalWorkflowConfig,
  type WorkflowVersionRecord,
  type MasterResolutionContext,
  type ResolvedAppraisalWorkflow,
  getDefaultApprovalWorkflowConfig,
  summarizeWorkflowConfig,
  validateWorkflowConfigInput,
  buildResolvedWorkflowFromContext,
  mapStageKeyToDbStatus,
} from "@/lib/approval-workflow-utils";

export * from "@/lib/approval-workflow-utils";

// ============================================================================
// DATABASE STORAGE & VERSIONING (USING SYSTEM_CONFIG + AUDIT_LOGS)
// ============================================================================

const CONFIG_KEY_PUBLISHED = "kpi_approval_workflow_published_v1";
const CONFIG_KEY_DRAFT = "kpi_approval_workflow_draft_v1";
const CONFIG_KEY_VERSIONS = "kpi_approval_workflow_versions_v1";

async function getSystemConfigJson<T>(key: string): Promise<T | null> {
  try {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (!row || !row.value) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function setSystemConfigJson(
  key: string,
  value: unknown,
  description: string
): Promise<void> {
  const jsonStr = JSON.stringify(value);
  const now = new Date();
  const [existing] = await db
    .select({ key: systemConfig.key })
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(systemConfig)
      .set({
        value: jsonStr,
        description,
        updatedAt: now,
      })
      .where(eq(systemConfig.key, key));
  } else {
    await db.insert(systemConfig).values({
      key,
      value: jsonStr,
      description,
      updatedAt: now,
    });
  }
}

export async function getApprovalWorkflowState(): Promise<{
  publishedConfig: ApprovalWorkflowConfig;
  draftConfig: ApprovalWorkflowConfig | null;
  hasUnpublishedDraft: boolean;
  versions: WorkflowVersionRecord[];
}> {
  const defaultCfg = getDefaultApprovalWorkflowConfig();
  let published = await getSystemConfigJson<ApprovalWorkflowConfig>(CONFIG_KEY_PUBLISHED);

  if (!published || !published.mode) {
    published = defaultCfg;
  }

  const draft = await getSystemConfigJson<ApprovalWorkflowConfig>(CONFIG_KEY_DRAFT);
  let versions = await getSystemConfigJson<WorkflowVersionRecord[]>(CONFIG_KEY_VERSIONS);

  if (!versions || !Array.isArray(versions) || versions.length === 0) {
    versions = [
      {
        id: 1,
        versionNumber: published.version || 1,
        mode: published.mode,
        summary: summarizeWorkflowConfig(published),
        configJson: published,
        publishedBy: published.updatedBy || "System Default",
        publishedAt: published.updatedAt || new Date().toISOString(),
      },
    ];
  }

  return {
    publishedConfig: published,
    draftConfig: draft,
    hasUnpublishedDraft: Boolean(draft),
    versions: versions.sort((a, b) => b.versionNumber - a.versionNumber),
  };
}

export async function getActiveApprovalWorkflowConfig(): Promise<ApprovalWorkflowConfig> {
  const published = await getSystemConfigJson<ApprovalWorkflowConfig>(CONFIG_KEY_PUBLISHED);
  if (!published || !published.mode) {
    return getDefaultApprovalWorkflowConfig();
  }
  return published;
}

export async function saveApprovalWorkflowDraft(params: {
  config: ApprovalWorkflowConfig;
  actorName: string;
  notes?: string;
}): Promise<{ success: boolean; draftConfig?: ApprovalWorkflowConfig; error?: string }> {
  const check = validateWorkflowConfigInput(params.config);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const state = await getApprovalWorkflowState();
  const draftToSave: ApprovalWorkflowConfig = {
    ...check.normalized,
    version: state.publishedConfig.version,
    updatedAt: new Date().toISOString(),
    updatedBy: params.actorName,
    notes: params.notes || check.normalized.notes || "Draft perubahan konfigurasi staging approval",
  };

  await setSystemConfigJson(
    CONFIG_KEY_DRAFT,
    draftToSave,
    "Draft konfigurasi Staging Approval RBAC"
  );

  try {
    await db.insert(auditLogs).values({
      entity: "approval_workflow",
      entityId: draftToSave.version,
      action: "SAVE_DRAFT",
      actor: params.actorName,
      changes: {
        mode: draftToSave.mode,
        summary: summarizeWorkflowConfig(draftToSave),
      },
    });
  } catch {
    // non-blocking
  }

  return { success: true, draftConfig: draftToSave };
}

export async function publishApprovalWorkflowConfig(params: {
  config: ApprovalWorkflowConfig;
  actorName: string;
  notes?: string;
}): Promise<{
  success: boolean;
  publishedConfig?: ApprovalWorkflowConfig;
  versions?: WorkflowVersionRecord[];
  error?: string;
}> {
  const check = validateWorkflowConfigInput(params.config);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const state = await getApprovalWorkflowState();
  const maxVer = state.versions.reduce(
    (max, v) => Math.max(max, v.versionNumber),
    state.publishedConfig.version || 0
  );
  const nextVersion = maxVer + 1;
  const nowIso = new Date().toISOString();

  const publishedToSave: ApprovalWorkflowConfig = {
    ...check.normalized,
    version: nextVersion,
    updatedAt: nowIso,
    updatedBy: params.actorName,
    notes: params.notes || check.normalized.notes || summarizeWorkflowConfig(check.normalized),
  };

  const newVersionRecord: WorkflowVersionRecord = {
    id: nextVersion,
    versionNumber: nextVersion,
    mode: publishedToSave.mode,
    summary: params.notes?.trim()
      ? `${summarizeWorkflowConfig(publishedToSave)} (${params.notes.trim()})`
      : summarizeWorkflowConfig(publishedToSave),
    configJson: publishedToSave,
    publishedBy: params.actorName,
    publishedAt: nowIso,
  };

  const updatedVersions = [newVersionRecord, ...state.versions].slice(0, 30);

  await setSystemConfigJson(
    CONFIG_KEY_PUBLISHED,
    publishedToSave,
    `Konfigurasi aktif Staging Approval RBAC v${nextVersion}`
  );
  await setSystemConfigJson(
    CONFIG_KEY_VERSIONS,
    updatedVersions,
    "Riwayat versi konfigurasi Staging Approval RBAC"
  );

  try {
    await db.delete(systemConfig).where(eq(systemConfig.key, CONFIG_KEY_DRAFT));
  } catch {
    // ignore
  }

  try {
    await db.insert(auditLogs).values({
      entity: "approval_workflow",
      entityId: nextVersion,
      action: "PUBLISH_CONFIG",
      actor: params.actorName,
      changes: {
        version: nextVersion,
        mode: publishedToSave.mode,
        summary: newVersionRecord.summary,
      },
    });
  } catch {
    // non-blocking
  }

  return {
    success: true,
    publishedConfig: publishedToSave,
    versions: updatedVersions,
  };
}

export async function rollbackApprovalWorkflowVersion(params: {
  targetVersionNumber: number;
  actorName: string;
}): Promise<{
  success: boolean;
  publishedConfig?: ApprovalWorkflowConfig;
  versions?: WorkflowVersionRecord[];
  error?: string;
}> {
  const state = await getApprovalWorkflowState();
  const targetVer = state.versions.find((v) => v.versionNumber === params.targetVersionNumber);
  if (!targetVer) {
    return {
      success: false,
      error: `Versi v${params.targetVersionNumber} tidak ditemukan dalam riwayat.`,
    };
  }

  return publishApprovalWorkflowConfig({
    config: targetVer.configJson,
    actorName: params.actorName,
    notes: `Rollback ke konfigurasi Versi v${params.targetVersionNumber}`,
  });
}

export async function loadMasterResolutionContext(): Promise<MasterResolutionContext> {
  const [emps, deps, lvls, pos, dHeads] = await Promise.all([
    db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        departmentId: employees.departmentId,
        jobLevelId: employees.jobLevelId,
        jobPositionId: employees.jobPositionId,
        jobPosition: employees.jobPosition,
        role: employees.role,
        appraiserId: employees.appraiserId,
        headDeptId: employees.headDeptId,
        managerId: employees.managerId,
        isActive: employees.isActive,
      })
      .from(employees)
      .orderBy(asc(employees.name)),
    db.select().from(departments).orderBy(asc(departments.code)),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(jobPositions).orderBy(asc(jobPositions.name)),
    db
      .select({
        departmentId: departmentHeads.departmentId,
        employeeId: departmentHeads.employeeId,
        status: departmentHeads.status,
      })
      .from(departmentHeads),
  ]);

  return {
    allEmployees: emps,
    allDepartments: deps,
    allJobLevels: lvls,
    allJobPositions: pos,
    allDeptHeads: dHeads,
  };
}

export async function resolveWorkflowForEmployee(params: {
  employeeId: number;
  appraisalStatus?: string | null;
  currentStageKey?: string | null;
  currentUser?: { id: number; role: string; departmentId?: number } | null;
  overrideConfig?: ApprovalWorkflowConfig;
}): Promise<ResolvedAppraisalWorkflow> {
  const [config, context] = await Promise.all([
    params.overrideConfig
      ? Promise.resolve(params.overrideConfig)
      : getActiveApprovalWorkflowConfig(),
    loadMasterResolutionContext(),
  ]);

  return buildResolvedWorkflowFromContext({
    config,
    targetEmployeeId: params.employeeId,
    context,
    appraisalStatus: params.appraisalStatus,
    currentStageKey: params.currentStageKey,
    currentUser: params.currentUser,
  });
}

export { mapStageKeyToDbStatus };
