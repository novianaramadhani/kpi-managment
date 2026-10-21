"use server";

import { revalidatePath } from "next/cache";
import {
  saveMonthlyAssessmentValues,
  submitMonthlyAssessment,
  submitMyAssessorAssessment,
  reopenMonthlyAssessment,
  saveIndicatorAnnualActual,
  saveIndicatorMonthlyValues,
  getCalculationTrace,
  saveBatchAssessmentFromExcel,
  type SaveItemValueInput,
} from "./monthly-assessment-service";

import { getCurrentUser } from "@/lib/auth";

export async function submitMyAssessmentAction(params: {
  appraisalId: number;
  month: number;
  actor?: {
    id: number;
    name: string;
    role: string;
  };
  notes?: string;
}) {
  try {
    let actor = params.actor;
    if (!actor) {
      const user = await getCurrentUser();
      if (user) {
        actor = { id: user.id, name: user.name, role: user.role };
      } else {
        actor = { id: 1, name: "Penilai", role: "PENILAI" };
      }
    }
    const res = await submitMyAssessorAssessment({
      ...params,
      actor,
    });
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    revalidatePath("/review");
    return {
      success: res.success,
      isAllSubmitted: res.isAllSubmitted,
      submittedCount: res.submittedCount,
      unfilledCount: res.unfilledIndicators?.length ?? 0,
      unfilledIndicators: res.unfilledIndicators,
      message: res.message,
      error: res.error || null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim penilaian.";
    return {
      success: false,
      isAllSubmitted: false,
      submittedCount: 0,
      unfilledCount: 0,
      error: msg,
    };
  }
}

export async function saveMonthlyDraftAction(params: {
  appraisalId: number;
  month: number;
  values: SaveItemValueInput[];
  actor?: string;
}) {
  try {
    const res = await saveMonthlyAssessmentValues(params);
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    return { success: true, data: res, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan draft penilaian.";
    return { success: false, data: null, error: msg };
  }
}

export async function submitMonthlyAction(params: {
  appraisalId: number;
  month: number;
  actor?: string;
}) {
  try {
    const res = await submitMonthlyAssessment(params);
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    return { success: true, data: res, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal submit penilaian bulanan.";
    return { success: false, data: null, error: msg };
  }
}

export async function reopenMonthlyAction(params: {
  appraisalId: number;
  month: number;
  actor?: string;
}) {
  try {
    const res = await reopenMonthlyAssessment(params);
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    return { success: true, data: res, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal membuka kembali penilaian bulanan.";
    return { success: false, data: null, error: msg };
  }
}

export async function saveIndicatorAnnualActualAction(params: {
  appraisalId: number;
  appraisalItemId: number;
  annualActual: number | null;
  target?: number | null;
  notes?: string | null;
  actor?: string;
}) {
  try {
    const res = await saveIndicatorAnnualActual(params);
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    return { success: true, data: res, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan realisasi tahunan.";
    return { success: false, data: null, error: msg };
  }
}

export async function saveIndicatorMonthlyValuesAction(params: {
  appraisalId: number;
  appraisalItemId: number;
  values: Array<{
    month: number;
    actualValue: number | null;
    target?: number | null;
    notes?: string | null;
  }>;
  aggregationMethod?: string;
  notes?: string | null;
  actor?: string;
}) {
  try {
    const res = await saveIndicatorMonthlyValues(params);
    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    return { success: true, data: res, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan realisasi bulanan.";
    return { success: false, data: null, error: msg };
  }
}

export async function getCalculationTraceAction(params: {
  appraisalItemId: number;
  month?: number | null;
}) {
  try {
    const traces = await getCalculationTrace(params);
    return { success: true, data: traces, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat trace kalkulasi.";
    return { success: false, data: null, error: msg };
  }
}

export async function saveBatchExcelAssessmentAction(params: {
  appraisalId: number;
  fileName?: string;
  items: Array<{
    appraisalItemId: number;
    annualActual: number | null;
    annualTarget?: number | null;
    monthlyActuals?: (number | null)[];
    monthlyTargets?: (number | null)[];
    hasMonthlyData?: boolean;
    rawTitle?: string;
  }>;
}) {
  try {
    const user = await getCurrentUser();
    const actor = user ? `${user.name} (${user.role})` : "penilai";

    const res = await saveBatchAssessmentFromExcel({
      ...params,
      actor,
    });

    revalidatePath("/input-kpi");
    revalidatePath("/kpi/assessments/monthly");
    revalidatePath("/review");

    return {
      success: true,
      updatedCount: res.updatedCount,
      error: null,
    };
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat menyimpan penilaian dari Excel.";
    return {
      success: false,
      updatedCount: 0,
      error: msg,
    };
  }
}
