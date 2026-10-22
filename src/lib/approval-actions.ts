"use server";

import { db } from "@/db";
import { appraisals, appraisalApprovalLogs, appraisalItems, employees, kpiPeriods } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recalculateAppraisal } from "./actions";
import { getMonthlyAssessmentDetail } from "./monthly-assessment-service";
import { getEmployeeApprovalLine } from "./employee-hierarchy";
import { requireAuth } from "./auth-guard";
import type { RoleType } from "./auth";

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
  } catch {
    // Outside Next.js request context
  }
}

/**
 * 1. Submit for Review: Penilai / Supervisor mengajukan penilaian yang sudah 100% lengkap
 * Validasi: Cek apakah reviewer terdaftar atau blocked.
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

  // Cek jalur reviewer
  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const hasReviewer = Boolean(
    approvalLine?.headDept || approvalLine?.manager || approvalLine?.appraiser
  );

  // Jika reviewer kosong dan bukan admin/HR override -> informasikan BLOCKED
  if (!hasReviewer && actor.role !== "ADMIN" && actor.role !== "HR") {
    return {
      success: false,
      error:
        "Pengajuan terhenti (Blocked): Karyawan ini belum memiliki Atasan Langsung / Head Dept yang ditugaskan. Silakan hubungi HR atau Administrator untuk menetapkan struktur atasan.",
    };
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

  await db
    .update(appraisals)
    .set({
      status: "PENDING_HEAD_DEPT",
      currentStage: "HEAD_DEPT",
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
    toStatus: "PENDING_HEAD_DEPT",
    stage: "HEAD_DEPT",
    actorId: validActorId,
    actorName: actor.name,
    actorRole: actor.role,
    notes: notes || "Diajukan untuk review & persetujuan",
  });

  safeRevalidate();
  return { success: true, message: "Penilaian berhasil diajukan ke tahap In Review." };
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

  // Validasi wewenang reviewer
  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const isAuthorizedReviewer =
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

  // 1. Reset semua items di appraisal ini
  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
    })
    .where(eq(appraisalItems.appraisalId, appraisalId));

  // 2. Tandai item yang diminta revisi
  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: true,
      revisionNote: revisionNotes,
    })
    .where(
      inArray(appraisalItems.id, appraisalItemIds)
    );

  // 3. Update status appraisal ke REVISED_PENILAI
  await db
    .update(appraisals)
    .set({
      status: "REVISED_PENILAI",
      currentStage: "PENILAI",
      rejectionReason: revisionNotes,
      updatedAt: now,
    })
    .where(eq(appraisals.id, appraisalId));

  // 4. Catat ke approval logs
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

  const validActorId = actor.id;
  const now = new Date();
  await recalculateAppraisal(appraisalId);

  // Lepaskan flag revisi setelah diperbaiki
  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
    })
    .where(eq(appraisalItems.appraisalId, appraisalId));

  await db
    .update(appraisals)
    .set({
      status: "PENDING_HEAD_DEPT",
      currentStage: "HEAD_DEPT",
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
    toStatus: "PENDING_HEAD_DEPT",
    stage: "HEAD_DEPT",
    actorId: validActorId,
    actorName: actor.name,
    actorRole: actor.role,
    notes: notes || "Parameter hasil revisi telah diperbaiki dan diajukan ulang.",
  });

  safeRevalidate();
  return { success: true, message: "Perbaikan revisi berhasil diajukan kembali ke In Review." };
}

/**
 * 4. Head Dept: Validasi & Teruskan ke Manager, ATAU minta Revisi ke Penilai
 */
export async function validateAppraisalByHeadDeptAction({
  appraisalId,
  action,
  notes,
}: ValidateByHeadDeptParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  // Validasi hak Head Dept
  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const isAuthorized =
    actor.role === "ADMIN" ||
    actor.role === "HR" ||
    actor.id === approvalLine?.headDept?.id;

  if (!isAuthorized) {
    return {
      success: false,
      error: "Akses ditolak: Anda bukan Head Dept yang berwenang untuk penilaian ini.",
    };
  }

  const validActorId = actor.id;
  const now = new Date();

  if (action === "FORWARD") {
    await recalculateAppraisal(appraisalId);
    await db
      .update(appraisals)
      .set({
        status: "PENDING_MANAGER",
        currentStage: "MANAGER",
        headDeptApprovedAt: now,
        headDeptApprovedById: validActorId,
        headDeptNotes: notes || null,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "VALIDATE_TO_MGR",
      fromStatus: appr.status,
      toStatus: "PENDING_MANAGER",
      stage: "MANAGER",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian berhasil divalidasi dan diteruskan ke Manager." };
  } else {
    await db
      .update(appraisals)
      .set({
        status: "REVISED_PENILAI",
        currentStage: "PENILAI",
        rejectionReason: notes || "Diminta revisi oleh Head Dept.",
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "REJECT_TO_PENILAI",
      fromStatus: appr.status,
      toStatus: "REVISED_PENILAI",
      stage: "PENILAI",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian dikembalikan ke Penilai untuk revisi." };
  }
}

/**
 * 5. Manager: Validasi & Teruskan ke HR, ATAU minta Revisi ke Head Dept
 */
export async function validateAppraisalByManagerAction({
  appraisalId,
  action,
  notes,
}: ValidateByManagerParams) {
  const actor = await getSessionActor();
  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  // Validasi hak Manager
  const approvalLine = await getEmployeeApprovalLine(appr.employeeId);
  const isAuthorized =
    actor.role === "ADMIN" ||
    actor.role === "HR" ||
    actor.id === approvalLine?.manager?.id;

  if (!isAuthorized) {
    return {
      success: false,
      error: "Akses ditolak: Anda bukan Manager yang berwenang untuk penilaian ini.",
    };
  }

  const validActorId = actor.id;
  const now = new Date();

  if (action === "FORWARD") {
    await recalculateAppraisal(appraisalId);
    await db
      .update(appraisals)
      .set({
        status: "PENDING_HR",
        currentStage: "HR",
        reviewedAt: now,
        managerValidatedAt: now,
        managerValidatedById: validActorId,
        managerNotes: notes || null,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "VALIDATE_TO_HR",
      fromStatus: appr.status,
      toStatus: "PENDING_HR",
      stage: "HR",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian berhasil divalidasi dan diteruskan ke HR." };
  } else {
    await db
      .update(appraisals)
      .set({
        status: "REVISED_HEAD",
        currentStage: "HEAD_DEPT",
        rejectionReason: notes || "Diminta revisi oleh Manager.",
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "REJECT_TO_HEAD",
      fromStatus: appr.status,
      toStatus: "REVISED_HEAD",
      stage: "HEAD_DEPT",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian dikembalikan ke Head Dept untuk ditinjau ulang." };
  }
}

/**
 * 6. HR: Approve & Finalisasi, ATAU minta Revisi ke Manager
 */
export async function approveAppraisalByHrAction({
  appraisalId,
  action,
  notes,
}: ApproveByHrParams) {
  const actor = await getSessionActor();
  if (actor.role !== "HR" && actor.role !== "ADMIN") {
    return {
      success: false,
      error: "Akses ditolak: Hanya HR atau Admin yang berwenang menyetujui atau menolak tahap HR.",
    };
  }

  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) {
    return { success: false, error: "Data penilaian tidak ditemukan." };
  }

  const validActorId = actor.id;
  const now = new Date();

  if (action === "APPROVE") {
    await recalculateAppraisal(appraisalId);
    await db
      .update(appraisals)
      .set({
        status: "FINAL",
        currentStage: "FINAL",
        finalizedAt: now,
        hrApprovedAt: now,
        hrApprovedById: validActorId,
        hrNotes: notes || null,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "APPROVE_FINAL",
      fromStatus: appr.status,
      toStatus: "FINAL",
      stage: "FINAL",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian berhasil disetujui dan difinalisasi oleh HR." };
  } else {
    await db
      .update(appraisals)
      .set({
        status: "REVISED_MGR",
        currentStage: "MANAGER",
        rejectionReason: notes || "Diminta revisi oleh HR.",
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "REJECT_TO_MGR",
      fromStatus: appr.status,
      toStatus: "REVISED_MGR",
      stage: "MANAGER",
      actorId: validActorId,
      actorName: actor.name,
      actorRole: actor.role,
      notes: notes || null,
    });

    safeRevalidate();
    return { success: true, message: "Penilaian dikembalikan ke Manager untuk ditinjau ulang." };
  }
}

/**
 * 7. Batch Approve: Persetujuan massal untuk banyak appraisal sekaligus
 */
export async function batchApproveAppraisalsAction({
  appraisalIds,
  notes,
}: {
  appraisalIds: number[];
  actor?: ApprovalActionActor;
  notes?: string;
}) {
  const actor = await getSessionActor();
  if (!appraisalIds || appraisalIds.length === 0) {
    return { success: false, count: 0, error: "Tidak ada penilaian yang dipilih." };
  }

  let successCount = 0;
  for (const id of appraisalIds) {
    try {
      const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, id)).limit(1);
      if (!appr) continue;

      if (actor.role === "HR" || actor.role === "ADMIN") {
        await approveAppraisalByHrAction({ appraisalId: id, action: "APPROVE", notes, actor });
        successCount++;
      } else if (actor.role === "MANAGER" || appr.currentStage === "MANAGER") {
        await validateAppraisalByManagerAction({ appraisalId: id, action: "FORWARD", notes, actor });
        successCount++;
      } else {
        await validateAppraisalByHeadDeptAction({ appraisalId: id, action: "FORWARD", notes, actor });
        successCount++;
      }
    } catch {
      // Continue next
    }
  }

  safeRevalidate();
  return { success: true, count: successCount, message: `Berhasil menyetujui ${successCount} penilaian.` };
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
