"use server";

import { db } from "@/db";
import { appraisals, appraisalApprovalLogs, appraisalItems, kpiPeriods } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recalculateAppraisal } from "./actions";
import { getMonthlyAssessmentDetail } from "./monthly-assessment-service";
import { getEmployeeApprovalLine } from "./employee-hierarchy";
import { requireAuth } from "./auth-guard";
import type { RoleType } from "./auth";
import {
  type ApprovalWorkflowConfig,
  resolveWorkflowForEmployee,
  mapStageKeyToDbStatus,
  saveApprovalWorkflowDraft,
  publishApprovalWorkflowConfig,
  rollbackApprovalWorkflowVersion,
} from "./approval-workflow-service";

export interface ApprovalActionActor {
  id?: number | null;
  name?: string;
  role?: string;
}

/**
 * Mengambil identitas aktor strictly dari sesi server (JWT session terverifikasi)
 * untuk mencegah client memalsukan ID, nama, atau wewenang role.
 */
async function getSessionActor(): Promise<{ id: number; name: string; role: RoleType }> {
  const user = await requireAuth();
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

export interface SubmitToHeadDeptParams {
  appraisalId: number;
  notes?: string;
  actor?: ApprovalActionActor;
}

export interface ValidateByHeadDeptParams {
  appraisalId: number;
  action: "FORWARD" | "REVISE";
  notes?: string;
  actor?: ApprovalActionActor;
}

export interface ValidateByManagerParams {
  appraisalId: number;
  action: "FORWARD" | "REVISE";
  notes?: string;
  actor?: ApprovalActionActor;
}

export interface ApproveByHrParams {
  appraisalId: number;
  action: "APPROVE" | "REVISE";
  notes?: string;
  actor?: ApprovalActionActor;
}

export interface ProcessDynamicStageApprovalParams {
  appraisalId: number;
  action: "FORWARD" | "REVISE";
  targetRevisionStageKey?: string;
  notes?: string;
}

export interface RequestParameterRevisionParams {
  appraisalId: number;
  appraisalItemIds: number[];
  revisionNotes: string;
  actor?: ApprovalActionActor;
}

function safeRevalidate() {
  try {
    revalidatePath("/review");
    revalidatePath("/input-kpi");
    revalidatePath("/dashboard");
    revalidatePath("/report");
    revalidatePath("/setup/access");
  } catch {
    // Outside Next.js request context
  }
}

// ============================================================================
// ADMIN RBAC STAGING WORKFLOW CONFIGURATION ACTIONS
// ============================================================================

export async function saveWorkflowDraftAction(params: {
  config: ApprovalWorkflowConfig;
  notes?: string;
}) {
  const actor = await getSessionActor();
  if (actor.role !== "ADMIN") {
    return {
      success: false,
      error: "Akses ditolak: Hanya Administrator yang dapat mengubah konfigurasi Staging Approval.",
    };
  }

  const res = await saveApprovalWorkflowDraft({
    config: params.config,
    actorName: actor.name,
    notes: params.notes,
  });

  safeRevalidate();
  return res;
}

export async function publishWorkflowConfigAction(params: {
  config: ApprovalWorkflowConfig;
  notes?: string;
}) {
  const actor = await getSessionActor();
  if (actor.role !== "ADMIN") {
    return {
      success: false,
      error: "Akses ditolak: Hanya Administrator yang dapat menerapkan konfigurasi Staging Approval.",
    };
  }

  const res = await publishApprovalWorkflowConfig({
    config: params.config,
    actorName: actor.name,
    notes: params.notes,
  });

  safeRevalidate();
  return res;
}

export async function rollbackWorkflowVersionAction(params: {
  targetVersionNumber: number;
}) {
  const actor = await getSessionActor();
  if (actor.role !== "ADMIN") {
    return {
      success: false,
      error: "Akses ditolak: Hanya Administrator yang dapat melakukan rollback versi workflow.",
    };
  }

  const res = await rollbackApprovalWorkflowVersion({
    targetVersionNumber: params.targetVersionNumber,
    actorName: actor.name,
  });

  safeRevalidate();
  return res;
}

// ============================================================================
// DYNAMIC STAGING APPROVAL ENGINE ACTIONS
// ============================================================================

/**
 * 1. Submit for Review: Penilai / Supervisor mengajukan penilaian yang sudah lengkap.
 * Otomatis menyesuaikan dengan Mode Workflow yang sedang aktif:
 * - DIRECT_TO_REPORT: Langsung FINAL & masuk ke Report.
 * - SINGLE_HR_VALIDATION: Masuk ke tahap Validasi HR (PENDING_HR / stage HR).
 * - MULTI_STAGE: Masuk ke tahap pertama yang aktif sesuai konfigurasi berjenjang.
 */
export async function submitAppraisalForReviewAction({
  appraisalId,
  notes,
}: SubmitToHeadDeptParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  const workflow = await resolveWorkflowForEmployee({
    employeeId: appr.employeeId,
    appraisalStatus: "DRAFT",
    currentStageKey: "PENILAI",
    currentUser: actor,
  });

  const nextStep = workflow.nextStep || workflow.steps[workflow.steps.length - 1];

  // Validasi ketersediaan pejabat approver jika bukan mode Langsung ke Report
  if (
    workflow.mode !== "DIRECT_TO_REPORT" &&
    nextStep &&
    nextStep.stageKey !== "FINAL" &&
    nextStep.isMandatory &&
    nextStep.resolvedOfficials.length === 0 &&
    actor.role !== "ADMIN" &&
    actor.role !== "HR"
  ) {
    const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
    const hasLegacyReviewer = Boolean(
      approvalLine?.headDept || approvalLine?.manager || approvalLine?.appraiser
    );
    if (!hasLegacyReviewer) {
      return {
        success: false,
        error: `Pengajuan terhenti: Belum ada pejabat yang ditugaskan untuk tahap "${nextStep.label}". Silakan hubungi HR atau Administrator.`,
      };
    }
  }

  const validActorId = actor.id;
  const now = new Date();
  await recalculateAppraisal(appraisalId);

  // Reset flag revisi jika sebelumnya ada
  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
    })
    .where(eq(appraisalItems.appraisalId, appraisalId));

  // Mode 1: Langsung ke Report (atau tidak ada tahap intermediate)
  if (workflow.mode === "DIRECT_TO_REPORT" || !nextStep || nextStep.stageKey === "FINAL") {
    await db
      .update(appraisals)
      .set({
        status: "FINAL",
        currentStage: "FINAL",
        submittedAt: now,
        finalizedAt: now,
        rejectionReason: null,
        notes: notes || appr.notes,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "SUBMIT_DIRECT_FINAL",
      fromStatus: appr.status,
      toStatus: "FINAL",
      stage: "FINAL",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || "Disubmit oleh Penilai dan langsung masuk ke Report (Mode Langsung ke Report).",
    });

    safeRevalidate();
    return {
      success: true,
      message: "Penilaian berhasil disubmit dan langsung masuk ke Report (Final).",
    };
  }

  // Mode 2 (Validasi HR) atau Mode 3 (Persetujuan Berjenjang)
  const targetStageKey = nextStep.stageKey;
  const targetDbStatus = mapStageKeyToDbStatus(targetStageKey, false);

  await db
    .update(appraisals)
    .set({
      status: targetDbStatus,
      currentStage: targetStageKey,
      submittedAt: now,
      rejectionReason: null,
      notes: notes || appr.notes,
      updatedAt: now,
    })
    .where(eq(appraisals.id, appraisalId));

  await db.insert(appraisalApprovalLogs).values({
    appraisalId,
    action: "SUBMIT_FOR_REVIEW",
    fromStatus: appr.status,
    toStatus: targetDbStatus,
    stage: targetStageKey,
    actorId: validActorId,
    actorName: actor.name,
    actorRole: actor.role,
    notes: notes || `Diajukan ke tahap ${nextStep.label}`,
  });

  safeRevalidate();
  return {
    success: true,
    message: `Penilaian berhasil diajukan ke tahap ${nextStep.label}.`,
  };
}

/**
 * Backward compatibility alias
 */
export const submitAppraisalToHeadDeptAction = submitAppraisalForReviewAction;

/**
 * 2. Granular Revision: Reviewer meminta revisi hanya pada parameter tertentu
 */
export async function requestParameterRevisionAction({
  appraisalId,
  appraisalItemIds,
  revisionNotes,
}: RequestParameterRevisionParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  if (!appraisalItemIds || appraisalItemIds.length === 0) {
    return { success: false, error: "Pilih minimal 1 parameter yang memerlukan revisi." };
  }

  const workflow = await resolveWorkflowForEmployee({
    employeeId: appr.employeeId,
    appraisalStatus: appr.status,
    currentStageKey: appr.currentStage,
    currentUser: actor,
  });

  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const isAuthorizedReviewer =
    workflow.canCurrentUserApprove ||
    actor.role === "ADMIN" ||
    actor.role === "HR" ||
    actor.id === approvalLine?.headDept?.id ||
    actor.id === approvalLine?.manager?.id;

  if (!isAuthorizedReviewer) {
    return {
      success: false,
      error: "Akses ditolak: Anda tidak memiliki wewenang meminta revisi untuk penilaian karyawan ini.",
    };
  }

  const validActorId = actor.id;
  const now = new Date();

  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
    })
    .where(eq(appraisalItems.appraisalId, appraisalId));

  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: true,
      revisionNote: revisionNotes,
    })
    .where(inArray(appraisalItems.id, appraisalItemIds));

  await db
    .update(appraisals)
    .set({
      status: "REVISED_PENILAI",
      currentStage: "PENILAI",
      rejectionReason: revisionNotes,
      updatedAt: now,
    })
    .where(eq(appraisals.id, appraisalId));

  await db.insert(appraisalApprovalLogs).values({
    appraisalId,
    action: "REQUEST_REVISION",
    fromStatus: appr.status,
    toStatus: "REVISED_PENILAI",
    stage: "PENILAI",
    actorId: validActorId,
    actorName: actor.name,
    actorRole: actor.role,
    notes: `Permintaan revisi pada ${appraisalItemIds.length} parameter: ${revisionNotes}`,
  });

  safeRevalidate();
  return {
    success: true,
    message: `Permintaan revisi berhasil dikirim ke Penilai terkait untuk ${appraisalItemIds.length} parameter.`,
  };
}

/**
 * 3. Resubmit Revision: Penilai mengajukan ulang parameter yang telah diperbaiki
 */
export async function resubmitAppraisalRevisionAction({
  appraisalId,
  notes,
}: SubmitToHeadDeptParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  const workflow = await resolveWorkflowForEmployee({
    employeeId: appr.employeeId,
    appraisalStatus: "REVISED_PENILAI",
    currentStageKey: "PENILAI",
    currentUser: actor,
  });

  const nextStep = workflow.nextStep || workflow.steps[workflow.steps.length - 1];
  const validActorId = actor.id;
  const now = new Date();
  await recalculateAppraisal(appraisalId);

  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
    })
    .where(eq(appraisalItems.appraisalId, appraisalId));

  if (workflow.mode === "DIRECT_TO_REPORT" || !nextStep || nextStep.stageKey === "FINAL") {
    await db
      .update(appraisals)
      .set({
        status: "FINAL",
        currentStage: "FINAL",
        submittedAt: now,
        finalizedAt: now,
        rejectionReason: null,
        notes: notes || appr.notes,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "RESUBMIT_DIRECT_FINAL",
      fromStatus: appr.status,
      toStatus: "FINAL",
      stage: "FINAL",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || "Perbaikan revisi disubmit dan langsung masuk ke Report.",
    });

    safeRevalidate();
    return {
      success: true,
      message: "Perbaikan revisi berhasil disubmit dan langsung masuk ke Report.",
    };
  }

  const targetStageKey = nextStep.stageKey;
  const targetDbStatus = mapStageKeyToDbStatus(targetStageKey, false);

  await db
    .update(appraisals)
    .set({
      status: targetDbStatus,
      currentStage: targetStageKey,
      submittedAt: now,
      rejectionReason: null,
      notes: notes || appr.notes,
      updatedAt: now,
    })
    .where(eq(appraisals.id, appraisalId));

  await db.insert(appraisalApprovalLogs).values({
    appraisalId,
    action: "RESUBMIT_REVISION",
    fromStatus: appr.status,
    toStatus: targetDbStatus,
    stage: targetStageKey,
    actorId: validActorId,
    actorName: actor.name,
    actorRole: actor.role,
    notes: notes || `Parameter hasil revisi telah diperbaiki dan diajukan ulang ke ${nextStep.label}.`,
  });

  safeRevalidate();
  return {
    success: true,
    message: `Perbaikan revisi berhasil diajukan kembali ke tahap ${nextStep.label}.`,
  };
}

/**
 * 4. Dynamic Stage Transition: Menangani persetujuan (FORWARD / APPROVE) maupun revisi (REVISE)
 * untuk seluruh mode workflow (Validasi HR Tunggal maupun Persetujuan Berjenjang 1..N tingkat).
 */
export async function processDynamicStageApprovalAction({
  appraisalId,
  action,
  targetRevisionStageKey,
  notes,
}: ProcessDynamicStageApprovalParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  const workflow = await resolveWorkflowForEmployee({
    employeeId: appr.employeeId,
    appraisalStatus: appr.status,
    currentStageKey: appr.currentStage,
    currentUser: actor,
  });

  // Validasi RBAC dinamis + kompatibilitas approval line
  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const isLegacyAuthorized =
    actor.role === "ADMIN" ||
    actor.role === "HR" ||
    (appr.currentStage === "HEAD_DEPT" && actor.id === approvalLine?.headDept?.id) ||
    (appr.currentStage === "MANAGER" && actor.id === approvalLine?.manager?.id);

  if (!workflow.canCurrentUserApprove && !isLegacyAuthorized) {
    return {
      success: false,
      error: `Akses ditolak: Anda tidak memiliki wewenang persetujuan pada tahap "${workflow.activeStageLabel}".`,
    };
  }

  const validActorId = actor.id;
  const now = new Date();
  const activeStageKey = workflow.activeStageKey;
  const activeStageLabel = workflow.activeStageLabel;

  if (action === "FORWARD") {
    await recalculateAppraisal(appraisalId);

    const targetStep = workflow.nextStep || workflow.steps[workflow.steps.length - 1];
    const isFinalTarget = !targetStep || targetStep.stageKey === "FINAL";
    const toStageKey = isFinalTarget ? "FINAL" : targetStep.stageKey;
    const toDbStatus = isFinalTarget ? "FINAL" : mapStageKeyToDbStatus(toStageKey, false);

    const updatePayload: Record<string, unknown> = {
      status: toDbStatus,
      currentStage: toStageKey,
      rejectionReason: null,
      updatedAt: now,
    };

    if (activeStageKey === "HEAD_DEPT") {
      updatePayload.headDeptApprovedAt = now;
      updatePayload.headDeptApprovedById = validActorId;
      updatePayload.headDeptNotes = notes || null;
    } else if (activeStageKey === "MANAGER") {
      updatePayload.reviewedAt = now;
      updatePayload.managerValidatedAt = now;
      updatePayload.managerValidatedById = validActorId;
      updatePayload.managerNotes = notes || null;
    }

    if (isFinalTarget) {
      updatePayload.finalizedAt = now;
      updatePayload.hrApprovedAt = now;
      updatePayload.hrApprovedById = validActorId;
      updatePayload.hrNotes = notes || null;
    }

    await db
      .update(appraisals)
      .set(updatePayload)
      .where(eq(appraisals.id, appraisalId));

    const logAction = isFinalTarget
      ? "APPROVE_FINAL"
      : toStageKey === "MANAGER"
      ? "VALIDATE_TO_MGR"
      : toStageKey === "HR"
      ? "VALIDATE_TO_HR"
      : `VALIDATE_TO_${toStageKey}`;

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: logAction,
      fromStatus: appr.status,
      toStatus: toDbStatus,
      stage: toStageKey,
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes:
        notes ||
        (isFinalTarget
          ? `Disetujui & difinalisasi pada tahap ${activeStageLabel}`
          : `Divalidasi pada tahap ${activeStageLabel}, diteruskan ke ${targetStep.label}`),
    });

    safeRevalidate();
    return {
      success: true,
      message: isFinalTarget
        ? `Penilaian berhasil disetujui pada tahap ${activeStageLabel} dan resmi masuk ke Report.`
        : `Penilaian berhasil divalidasi dan diteruskan ke tahap ${targetStep.label}.`,
    };
  } else {
    // Action === "REVISE"
    let revStep = workflow.prevStepForRevision || workflow.steps[0];
    if (targetRevisionStageKey) {
      const requestedStep = workflow.steps.find(
        (s) => s.stageKey.toUpperCase() === targetRevisionStageKey.toUpperCase() && !s.isSkipped
      );
      if (requestedStep) {
        revStep = requestedStep;
      }
    }

    const toStageKey = revStep ? revStep.stageKey : "PENILAI";
    const toStageLabel = revStep ? revStep.label : "Penilai";
    const toDbStatus = mapStageKeyToDbStatus(toStageKey, true);

    await db
      .update(appraisals)
      .set({
        status: toDbStatus,
        currentStage: toStageKey,
        rejectionReason: notes || `Diminta revisi oleh ${activeStageLabel}.`,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    const logAction =
      toStageKey === "PENILAI"
        ? "REJECT_TO_PENILAI"
        : toStageKey === "HEAD_DEPT"
        ? "REJECT_TO_HEAD"
        : toStageKey === "MANAGER"
        ? "REJECT_TO_MGR"
        : `REJECT_TO_${toStageKey}`;

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: logAction,
      fromStatus: appr.status,
      toStatus: toDbStatus,
      stage: toStageKey,
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || `Dikembalikan ke tahap ${toStageLabel} untuk revisi.`,
    });

    safeRevalidate();
    return {
      success: true,
      message: `Penilaian dikembalikan ke tahap ${toStageLabel} untuk ditinjau ulang.`,
    };
  }
}

/**
 * 5. Head Dept (Kompatibilitas Penuh): Delegasi ke engine dinamis
 */
export async function validateAppraisalByHeadDeptAction({
  appraisalId,
  action,
  notes,
}: ValidateByHeadDeptParams) {
  return processDynamicStageApprovalAction({
    appraisalId,
    action,
    notes,
  });
}

/**
 * 6. Manager (Kompatibilitas Penuh): Delegasi ke engine dinamis
 */
export async function validateAppraisalByManagerAction({
  appraisalId,
  action,
  notes,
}: ValidateByManagerParams) {
  return processDynamicStageApprovalAction({
    appraisalId,
    action,
    notes,
  });
}

/**
 * 7. HR (Kompatibilitas Penuh): Delegasi ke engine dinamis
 */
export async function approveAppraisalByHrAction({
  appraisalId,
  action,
  notes,
}: ApproveByHrParams) {
  return processDynamicStageApprovalAction({
    appraisalId,
    action: action === "APPROVE" ? "FORWARD" : "REVISE",
    notes,
  });
}

/**
 * 8. Batch Approve: Persetujuan massal menggunakan engine dinamis
 */
export async function batchApproveAppraisalsAction({
  appraisalIds,
  notes,
}: {
  appraisalIds: number[];
  actor?: ApprovalActionActor;
  notes?: string;
}) {
  await getSessionActor();
  if (!appraisalIds || appraisalIds.length === 0) {
    return { success: false, count: 0, error: "Tidak ada penilaian yang dipilih." };
  }

  let successCount = 0;
  for (const id of appraisalIds) {
    try {
      const res = await processDynamicStageApprovalAction({
        appraisalId: id,
        action: "FORWARD",
        notes,
      });
      if (res.success) {
        successCount++;
      }
    } catch {
      // Continue next
    }
  }

  safeRevalidate();
  return {
    success: true,
    count: successCount,
    message: `Berhasil menyetujui ${successCount} penilaian.`,
  };
}

/**
 * Mengambil histori log approval berjenjang
 */
export async function getAppraisalApprovalHistory(appraisalId: number) {
  await requireAuth();
  const logs = await db
    .select()
    .from(appraisalApprovalLogs)
    .where(eq(appraisalApprovalLogs.appraisalId, appraisalId))
    .orderBy(appraisalApprovalLogs.createdAt);

  return logs;
}

/**
 * Mengambil detail lengkap penilaian untuk Modal Review & Approval
 */
export async function getAppraisalReviewDetailAction(appraisalId: number) {
  try {
    const user = await requireAuth();
    const [appr] = await db
      .select({
        id: appraisals.id,
        employeeId: appraisals.employeeId,
        periodId: appraisals.periodId,
        status: appraisals.status,
        currentStage: appraisals.currentStage,
        finalScore: appraisals.finalScore,
        rejectionReason: appraisals.rejectionReason,
      })
      .from(appraisals)
      .where(eq(appraisals.id, appraisalId))
      .limit(1);

    if (!appr) {
      return { success: false, data: null, error: "Penilaian tidak ditemukan." };
    }

    const [period] = await db
      .select()
      .from(kpiPeriods)
      .where(eq(kpiPeriods.id, appr.periodId))
      .limit(1);

    const year = period ? period.year : new Date().getFullYear();

    const detail = await getMonthlyAssessmentDetail({
      year,
      month: 1,
      employeeId: appr.employeeId,
      currentUser: user,
    });

    return { success: true, data: detail, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat detail penilaian.";
    return { success: false, data: null, error: msg };
  }
}
