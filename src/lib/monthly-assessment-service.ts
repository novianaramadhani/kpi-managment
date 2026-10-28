import { db } from "@/db";
import {
  appraisals,
  appraisalItems,
  appraisalMonthlyValues,
  appraisalApprovalLogs,
  appraisalCalculationLogs,
  kpiPeriods,
  employees,
  departments,
  jobLevels,
  kpiParameters,
  kpiCategories,
  auditLogs,
  kpiTemplates,
  kpiBands,
  kpiCalculationRules,
  kpiAssessorAssignments,
  kpiAssessorDelegations,
  appraisalEvidence,
} from "@/db/schema";
import { and, eq, inArray, sql, asc, desc, or, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getEmployeeApprovalLine } from "./employee-hierarchy";
import {
  calculateKpiScore,
  calculateParameterScore,
  calculateOverallKpiScore,
  normalizeWeight,
  aggregateMonthly,
  type GenericScoringRule,
  type KpiScoreResult,
} from "./scoring";

import {
  getAuthorizedAssessorIds,
  isUserAuthorizedForParameter,
  type AssessorInfo,
} from "./assessor-assignment-service";
import { getCurrentUser } from "./auth";

import {
  INDONESIAN_MONTH_NAMES,
  type MonthlyIndicatorItem,
  type MonthlyCategoryGroup,
  type MonthlyAssessmentDetailResult,
  type EmployeeProgressItem,
  type SaveItemValueInput,
  type IndicatorMonthDetail,
  type AppraisalEvidenceItem,
} from "@/types/monthly-assessment";

export {
  INDONESIAN_MONTH_NAMES,
  type MonthlyIndicatorItem,
  type MonthlyCategoryGroup,
  type MonthlyAssessmentDetailResult,
  type EmployeeProgressItem,
  type SaveItemValueInput,
  type AppraisalEvidenceItem,
};

async function recordAudit(
  entity: string,
  entityId: number | null,
  action: string,
  changes?: unknown,
  actor = "admin"
) {
  try {
    await db.insert(auditLogs).values({
      entity,
      entityId,
      action,
      changes: changes ? JSON.stringify(changes) : null,
      actor,
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Memuat data detail penilaian bulanan untuk 1 karyawan pada tahun dan bulan tertentu.
 */
export async function getMonthlyAssessmentDetail(params: {
  year: number;
  month: number;
  employeeId: number;
  currentUser?: {
    id: number;
    role: string;
    departmentId?: number;
  } | null;
}): Promise<MonthlyAssessmentDetailResult | null> {
  const { year, month, employeeId, currentUser } = params;
  if (month < 1 || month > 12) {
    throw new Error(`Bulan tidak valid: ${month}. Harus antara 1 s/d 12.`);
  }

  // 1. Dapatkan periode KPI berdasarkan tahun
  const [period] = await db
    .select()
    .from(kpiPeriods)
    .where(eq(kpiPeriods.year, year))
    .limit(1);

  if (!period) return null;

  // 2. Dapatkan data appraisal & employee beserta master template
  const [apprRow] = await db
    .select({
      appraisal: appraisals,
      employee: employees,
      department: departments,
      jobLevel: jobLevels,
      template: kpiTemplates,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
    .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
    .where(and(eq(appraisals.periodId, period.id), eq(appraisals.employeeId, employeeId)))
    .limit(1);

  if (!apprRow) return null;

  // Resolusi nama template master dari database:
  let resolvedTemplateName = apprRow.template?.name ?? null;
  let resolvedTemplateId = apprRow.appraisal.templateId ?? apprRow.template?.id ?? null;

  if (!resolvedTemplateName && apprRow.employee.id) {
    // 1. Prioritas Utama: Template Personal Karyawan
    const [personalTpl] = await db
      .select({ id: kpiTemplates.id, name: kpiTemplates.name })
      .from(kpiTemplates)
      .where(
        and(
          eq(kpiTemplates.employeeId, apprRow.employee.id),
          eq(kpiTemplates.isCustom, true),
          eq(kpiTemplates.isActive, true)
        )
      )
      .limit(1);

    if (personalTpl) {
      resolvedTemplateName = personalTpl.name;
      resolvedTemplateId = personalTpl.id;
    } else if (apprRow.employee.jobPositionId) {
      // 2. Prioritas Kedua: Template Standar Job Position
      const [posTpl] = await db
        .select({ id: kpiTemplates.id, name: kpiTemplates.name })
        .from(kpiTemplates)
        .where(
          and(
            eq(kpiTemplates.jobPositionId, apprRow.employee.jobPositionId),
            eq(kpiTemplates.isCustom, false),
            eq(kpiTemplates.isActive, true)
          )
        )
        .limit(1);

      if (posTpl) {
        resolvedTemplateName = posTpl.name;
        resolvedTemplateId = posTpl.id;
      }
    }

    // 3. Prioritas Ketiga: Template Standar Departemen & Job Level
    if (!resolvedTemplateName && apprRow.employee.departmentId && apprRow.employee.jobLevelId) {
      const [matchingTemplate] = await db
        .select({ id: kpiTemplates.id, name: kpiTemplates.name })
        .from(kpiTemplates)
        .where(
          and(
            eq(kpiTemplates.departmentId, apprRow.employee.departmentId),
            eq(kpiTemplates.jobLevelId, apprRow.employee.jobLevelId),
            eq(kpiTemplates.isCustom, false),
            eq(kpiTemplates.isActive, true)
          )
        )
        .limit(1);
      if (matchingTemplate) {
        resolvedTemplateName = matchingTemplate.name;
        resolvedTemplateId = matchingTemplate.id;
      }
    }
  }

  // 3. Dapatkan semua appraisal_items
  const items = await db
    .select({
      item: appraisalItems,
      parameter: kpiParameters,
      category: kpiCategories,
    })
    .from(appraisalItems)
    .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .leftJoin(kpiCategories, eq(kpiParameters.categoryId, kpiCategories.id))
    .where(eq(appraisalItems.appraisalId, apprRow.appraisal.id))
    .orderBy(asc(kpiCategories.sortOrder), asc(kpiParameters.sortOrder), asc(appraisalItems.id));

  // Dapatkan approval line karyawan (inherit dari department jika belum dioverride)
  const approvalLine = await getEmployeeApprovalLine(apprRow.employee.id);

  // Dapatkan approval history logs
  const rawLogs = await db
    .select()
    .from(appraisalApprovalLogs)
    .where(eq(appraisalApprovalLogs.appraisalId, apprRow.appraisal.id))
    .orderBy(appraisalApprovalLogs.createdAt);

  const approvalLogs = rawLogs.map((lg) => ({
    id: lg.id,
    action: lg.action,
    fromStatus: lg.fromStatus,
    toStatus: lg.toStatus,
    stage: lg.stage,
    actorName: lg.actorName,
    actorRole: lg.actorRole,
    notes: lg.notes,
    createdAt: lg.createdAt,
  }));

  const currentStage =
    apprRow.appraisal.currentStage ??
    (apprRow.appraisal.status === "FINAL"
      ? "FINAL"
      : apprRow.appraisal.status === "PENDING_HR" || apprRow.appraisal.status === "REVIEWED"
      ? "HR"
      : apprRow.appraisal.status === "PENDING_MANAGER" || apprRow.appraisal.status === "REVISED_MGR"
      ? "MANAGER"
      : apprRow.appraisal.status === "PENDING_HEAD_DEPT" || apprRow.appraisal.status === "SUBMITTED" || apprRow.appraisal.status === "REVISED_HEAD"
      ? "HEAD_DEPT"
      : "PENILAI");

  if (items.length === 0) {
    return {
      period: { id: period.id, name: period.name, year: period.year, status: period.status },
      employee: {
        id: apprRow.employee.id,
        nik: apprRow.employee.nik,
        name: apprRow.employee.name,
        departmentName: apprRow.department?.name ?? "-",
        jobLevelName: apprRow.jobLevel?.name ?? "-",
        jobPosition: apprRow.employee.jobPosition ?? "-",
        templateId: resolvedTemplateId,
        templateName: resolvedTemplateName ?? "-",
      },
      approvalLine,
      appraisalId: apprRow.appraisal.id,
      appraisalStatus: apprRow.appraisal.status,
      currentStage,
      rejectionReason: apprRow.appraisal.rejectionReason,
      submittedAt: apprRow.appraisal.submittedAt,
      headDeptApprovedAt: apprRow.appraisal.headDeptApprovedAt,
      headDeptNotes: apprRow.appraisal.headDeptNotes,
      managerValidatedAt: apprRow.appraisal.managerValidatedAt,
      managerNotes: apprRow.appraisal.managerNotes,
      hrApprovedAt: apprRow.appraisal.hrApprovedAt,
      hrNotes: apprRow.appraisal.hrNotes,
      finalizedAt: apprRow.appraisal.finalizedAt,
      approvalLogs,
      templateId: resolvedTemplateId,
      templateName: resolvedTemplateName ?? "-",
      month,
      monthName: INDONESIAN_MONTH_NAMES[month - 1],
      categories: [],
      summary: {
        totalIndicators: 0,
        filledIndicators: 0,
        unfilledIndicators: 0,
        completionPercentage: 0,
        overallScoreFraction: 0,
        overallScorePercentage: 0,
        overallScoreDisplay: "0.0%",
        grade: "E",
        label: "Belum Diisi",
        action: "-",
        monthlyStatus: "NOT_STARTED",
      },
    };
  }

  const itemIds = items.map((r) => r.item.id);

  // 4. Dapatkan data bulanan dari appraisal_monthly_values untuk semua 12 bulan
  const monthlyRows = await db
    .select()
    .from(appraisalMonthlyValues)
    .where(inArray(appraisalMonthlyValues.appraisalItemId, itemIds));

  const monthlyMap = new Map<string, typeof appraisalMonthlyValues.$inferSelect>();
  for (const m of monthlyRows) {
    monthlyMap.set(`${m.appraisalItemId}_${m.month}`, m);
  }

  // 4b. Dapatkan data evidence untuk appraisal ini
  const evidenceRows = await db
    .select()
    .from(appraisalEvidence)
    .where(eq(appraisalEvidence.appraisalId, apprRow.appraisal.id))
    .orderBy(desc(appraisalEvidence.createdAt));

  const evidenceByParamId = new Map<number, AppraisalEvidenceItem[]>();
  for (const ev of evidenceRows) {
    const list = evidenceByParamId.get(ev.parameterId) || [];
    list.push({
      id: ev.id,
      appraisalId: ev.appraisalId,
      parameterId: ev.parameterId,
      month: ev.month,
      fileType: ev.fileType,
      fileName: ev.fileName,
      filePath: ev.filePath,
      fileSize: ev.fileSize,
      mimeType: ev.mimeType,
      extractedValue: ev.extractedValue,
      extractedData: ev.extractedData as Record<string, any> | null,
      matchStatus: ev.matchStatus,
      description: ev.description,
      uploadedBy: ev.uploadedBy,
      createdAt: ev.createdAt,
    });
    evidenceByParamId.set(ev.parameterId, list);
  }

  const INDONESIAN_MONTH_SHORT_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"
  ];

  // Helper untuk deteksi inverse indicator (e.g. deadstock, komplain, SP)
  const isInverseKpi = (rules: GenericScoringRule[], indicatorName?: string): boolean => {
    if (indicatorName) {
      const lower = indicatorName.toLowerCase();
      if (
        lower.includes("deadstock") ||
        /\bsp\b/i.test(lower) ||
        lower.includes("surat peringatan") ||
        lower.includes("kasus") ||
        lower.includes("pelanggaran") ||
        lower.includes("komplain") ||
        lower.includes("loss")
      ) {
        return true;
      }
    }
    if (!rules || rules.length < 2) return false;

    // Cek apakah semakin tinggi nilai, skor semakin menurun
    const sortedByVal = [...rules]
      .map((r) => ({
        val: r.minValue ?? r.maxValue ?? 0,
        score: r.score,
      }))
      .sort((a, b) => a.val - b.val);

    if (sortedByVal.length >= 2) {
      const first = sortedByVal[0];
      const last = sortedByVal[sortedByVal.length - 1];
      if (first.score > last.score) {
        return true;
      }
    }

    const sortedByScore = [...rules].sort((a, b) => b.score - a.score);
    const bestRule = sortedByScore[0];
    if (
      bestRule.operator === "<=" ||
      bestRule.operator === "<" ||
      bestRule.operator === "LTE" ||
      bestRule.operator === "LT"
    ) {
      return true;
    }

    return false;
  };

  // Helper untuk hitung achievement
  const calculateAchievementVal = (
    actual: number | null,
    target: number | null,
    isInverse: boolean
  ): number | null => {
    if (actual === null) return null;
    if (target === 0) {
      if (actual === 0) return 100;
      return Math.max(0, Math.round((1 - actual) * 100));
    }
    if (target === null || target === 0) return null;

    if (isInverse) {
      if (actual <= 0) return 200;
      return Math.floor((target / actual) * 100);
    } else {
      return Math.round((actual / target) * 100);
    }
  };

  // 5. Kelompokkan per Kategori (Parameter KPI) dan hitung skor
  const categoryMap = new Map<
    number,
    {
      categoryId: number;
      categoryName: string;
      categoryWeight: number;
      indicators: MonthlyIndicatorItem[];
    }
  >();

  let totalFilled = 0;
  let hasSubmitted = false;
  let hasDraft = false;

  let catIndex = 0;
  const catOrderMap = new Map<number, number>();

  // Pre-fetch kpi_bands untuk parameter sebagai fallback jika scoringRulesSnapshot belum ada
  const paramIds = items
    .map((r) => r.parameter?.id)
    .filter((id): id is number => typeof id === "number");

  const bandsByParamId = new Map<number, GenericScoringRule[]>();
  if (paramIds.length > 0) {
    const dbBands = await db
      .select()
      .from(kpiBands)
      .where(inArray(kpiBands.parameterId, paramIds))
      .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id));

    for (const b of dbBands) {
      const list = bandsByParamId.get(b.parameterId) || [];
      list.push({
        id: b.id,
        label: b.label,
        operator: b.operator,
        minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
        maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
        score: Number(b.score),
        sortOrder: b.sortOrder,
      });
      bandsByParamId.set(b.parameterId, list);
    }
  }

  for (const row of items) {
    const it = row.item;
    const catId = row.category?.id ?? 0;
    const catName = row.category?.name ?? "Indikator Utama";
    const catWeightNorm = normalizeWeight(it.parameterWeightSnapshot ?? row.category?.weight ?? 1);

    if (!categoryMap.has(catId)) {
      catIndex++;
      catOrderMap.set(catId, catIndex);
      categoryMap.set(catId, {
        categoryId: catId,
        categoryName: catName,
        categoryWeight: catWeightNorm,
        indicators: [],
      });
    }

    const currentCatNum = catOrderMap.get(catId) ?? 1;
    const currentIndNum = categoryMap.get(catId)!.indicators.length + 1;
    const indicatorCode = `${currentCatNum}.${currentIndNum}`;

    // Rules snapshot dengan fallback otomatis ke kpi_bands database jika snapshot kosong atau nilainya null semua
    let rules: GenericScoringRule[] = [];
    const snapshotRules = (it.scoringRulesSnapshot as GenericScoringRule[]) || [];
    const hasValidRuleValues =
      Array.isArray(snapshotRules) &&
      snapshotRules.length > 0 &&
      snapshotRules.some((r) => (r.minValue !== null && r.minValue !== undefined) || (r.maxValue !== null && r.maxValue !== undefined));

    if (hasValidRuleValues) {
      rules = snapshotRules;
    } else if (row.parameter?.id && bandsByParamId.has(row.parameter.id)) {
      rules = bandsByParamId.get(row.parameter.id) || [];
    } else if (snapshotRules.length > 0) {
      rules = snapshotRules;
    }

    const indWeightNorm = normalizeWeight(it.weightSnapshot ?? row.parameter?.weight ?? 0.2);
    const maxScore = Number(row.parameter?.maxScore) || 25;
    const indName = it.indicatorNameSnapshot || row.parameter?.name || "Indikator";
    const compareBasis = row.parameter?.compareBasis || "ACTUAL";
    const isInverse = isInverseKpi(rules, indName);
    const indDirection = row.parameter?.direction || (isInverse ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER");
    const indMeasurementType = row.parameter?.measurementType || null;
    const indScoringMethod = row.parameter?.scoringMethod || null;
    const indTarget =
      it.target !== null && it.target !== undefined && !isNaN(Number(it.target))
        ? Number(it.target)
        : it.targetSnapshot !== null && it.targetSnapshot !== undefined && !isNaN(Number(it.targetSnapshot))
        ? Number(it.targetSnapshot)
        : row.parameter?.target !== null && row.parameter?.target !== undefined && !isNaN(Number(row.parameter.target))
        ? Number(row.parameter.target)
        : null;
    const indUnit = it.unitSnapshot || row.parameter?.unit || "";

    const effectiveParamId = row.parameter?.id ?? it.parameterId ?? null;
    const paramEvidence = effectiveParamId ? (evidenceByParamId.get(effectiveParamId) || []) : [];

    // Bangun data 12 bulan (Jan - Des)
    const monthlyDetails: IndicatorMonthDetail[] = [];
    let filledMonthsCount = 0;
    let sumActual = 0;

    for (let m = 1; m <= 12; m++) {
      const mVal = monthlyMap.get(`${it.id}_${m}`);
      const legacyActual =
        Array.isArray(it.monthlyActuals) && it.monthlyActuals[m - 1] !== null && it.monthlyActuals[m - 1] !== undefined
          ? Number(it.monthlyActuals[m - 1])
          : null;
      const mActual =
        mVal?.actualValue !== null && mVal?.actualValue !== undefined && mVal.actualValue !== ""
          ? Number(mVal.actualValue)
          : legacyActual;
      const mNotes = mVal?.notes ?? (Array.isArray(it.monthlyNotes) ? it.monthlyNotes[m - 1] : null);
      const mStatus = (mVal?.status as "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED") ?? (mActual !== null ? "DRAFT" : "NOT_STARTED");
      const monthEvidence = paramEvidence.filter((e) => e.month === m);

      const legacyTarget =
        Array.isArray(it.monthlyTargets) && it.monthlyTargets[m - 1] !== null && it.monthlyTargets[m - 1] !== undefined
          ? Number(it.monthlyTargets[m - 1])
          : null;
      const mTarget = legacyTarget !== null ? legacyTarget : indTarget;

      const mScoreRes = calculateKpiScore(mActual, rules, {
        indicatorWeight: indWeightNorm,
        parameterWeight: catWeightNorm,
        maxScore,
        compareBasis,
        target: mTarget,
        direction: indDirection,
        measurementType: indMeasurementType,
        unit: indUnit,
      });
      const mAch = mScoreRes.realizationPct;

      if (mActual !== null) {
        filledMonthsCount++;
        sumActual += mActual;
      }

      monthlyDetails.push({
        month: m,
        monthShort: INDONESIAN_MONTH_SHORT_NAMES[m - 1],
        monthName: INDONESIAN_MONTH_NAMES[m - 1],
        target: mTarget,
        unit: indUnit,
        actual: mActual,
        achievement: mAch,
        realizationPct: mAch,
        bandLabel: mScoreRes.bandLabel,
        score: mActual !== null ? mScoreRes.score : null,
        status: mStatus,
        notes: mNotes,
        evidenceList: monthEvidence,
      });
    }

    // Hitung ringkasan tahunan
    const allMonthlyActuals = monthlyDetails.map((m) => m.actual);
    const allMonthlyTargets = monthlyDetails.map((m) => m.target);
    const indAggregation = row.parameter?.aggregation || "AVERAGE";

    const { annualActual: aggAnnualActual } = aggregateMonthly(
      indAggregation as any,
      allMonthlyActuals,
      allMonthlyTargets
    );

    let annualActual: number | null = null;
    let annualInputMode: "MONTHLY" | "ANNUAL_DIRECT" = "MONTHLY";

    if (filledMonthsCount > 0) {
      annualActual = aggAnnualActual;
      annualInputMode = "MONTHLY";
    } else if (it.annualActual !== null && it.annualActual !== undefined) {
      annualActual = Number(it.annualActual);
      annualInputMode = "ANNUAL_DIRECT";
    } else if (it.actual !== null && it.actual !== undefined) {
      annualActual = Number(it.actual);
      annualInputMode = "ANNUAL_DIRECT";
    }

    const annualScoreRes = calculateKpiScore(annualActual, rules, {
      indicatorWeight: indWeightNorm,
      parameterWeight: catWeightNorm,
      maxScore,
      compareBasis,
      target: indTarget,
      direction: indDirection,
      measurementType: indMeasurementType,
      unit: indUnit,
    });
    const annualAchievement = annualScoreRes.realizationPct;
    const annualStatus: "Completed" | "In Progress" | "Not Started" =
      annualInputMode === "MONTHLY"
        ? (filledMonthsCount === 12 ? "Completed" : filledMonthsCount > 0 ? "In Progress" : "Not Started")
        : (annualActual !== null ? "Completed" : "Not Started");

    // Data bulan terpilih (current selected month)
    const curMonthVal = monthlyMap.get(`${it.id}_${month}`);
    const curActual = monthlyDetails[month - 1].actual;
    if (curActual !== null) {
      totalFilled++;
    }
    if (curMonthVal?.status === "SUBMITTED" || curMonthVal?.status === "APPROVED") {
      hasSubmitted = true;
    } else if (curMonthVal?.status === "DRAFT" || curActual !== null) {
      hasDraft = true;
    }

    const curScoreRes = calculateKpiScore(curActual, rules, {
      indicatorWeight: indWeightNorm,
      parameterWeight: catWeightNorm,
      maxScore,
      compareBasis,
      target: monthlyDetails[month - 1].target,
      direction: indDirection,
      measurementType: indMeasurementType,
      unit: indUnit,
    });

    // Resolusi asesor yang sah untuk parameter ini
    let isEditable = true;
    let assignedAssessors: AssessorInfo[] = [];
    let assessorResolutionSource: "NIK_OVERRIDE" | "DEPT_ASSIGNMENT" | "GLOBAL_ASSIGNMENT" | "DEFAULT_HIERARCHY" = "DEFAULT_HIERARCHY";
    let isDelegatedAccess = false;

    if (catId) {
      const authRes = await getAuthorizedAssessorIds({
        periodId: period.id,
        categoryId: catId,
        targetEmployeeId: apprRow.employee.id,
        targetDepartmentId: apprRow.employee.departmentId,
        parameterPicRole: row.parameter?.picRole,
        employeeAppraiserId: apprRow.employee.appraiserId,
        employeeHeadDeptId: apprRow.employee.headDeptId,
        employeeManagerId: apprRow.employee.managerId,
      });

      assignedAssessors = authRes.assessors;
      assessorResolutionSource = authRes.source;

      if (currentUser) {
        const isAssessor = authRes.effectiveAssessorIds.includes(currentUser.id);
        isDelegatedAccess = authRes.delegatedAssessorIds.includes(currentUser.id);
        const apprStatus = String(apprRow.appraisal.status);

        if (
          apprStatus === "FINAL" ||
          apprStatus === "REVIEWED" ||
          apprStatus.startsWith("PENDING_")
        ) {
          // Locked in In Review / Final
          isEditable = false;
        } else if (apprStatus.startsWith("REVISED_")) {
          // In Revision: ONLY flagged parameter items can be edited by authorized assessor
          const isFlagged = it.isRevisionFlagged ?? false;
          isEditable = (currentUser.role === "ADMIN" || isAssessor) && isFlagged;
        } else {
          // In Draft: Only authorized assessor (or admin) can edit
          if (currentUser.role === "ADMIN") {
            isEditable = true;
          } else if (currentUser.id === apprRow.employee.id) {
            isEditable = false;
          } else {
            // Kunci jika penilai ini sudah mengirimkan penilaian untuk bulan ini
            if (curMonthVal?.status === "SUBMITTED" || curMonthVal?.status === "APPROVED") {
              isEditable = false;
            } else {
              isEditable = isAssessor;
            }
          }
        }
      }
    }

    categoryMap.get(catId)!.indicators.push({
      appraisalItemId: it.id,
      monthlyValueId: curMonthVal?.id ?? null,
      indicatorCode,
      indicatorName: it.indicatorNameSnapshot || row.parameter?.name || "Indikator",
      indicatorDescription: it.indicatorDescriptionSnapshot || row.parameter?.description || null,
      target: indTarget,
      unit: indUnit,
      direction: indDirection,
      measurementType: indMeasurementType,
      scoringMethod: indScoringMethod,
      aggregation: (row.parameter?.aggregation || "AVERAGE") as any,
      compareBasis,
      indicatorWeight: indWeightNorm,
      parameterWeight: catWeightNorm,
      actualValue: curActual,
      realizationPct: curScoreRes.realizationPct,
      score: curScoreRes.score,
      maxScore: curScoreRes.maxScore,
      finalScoreFraction: curScoreRes.finalScoreFraction,
      finalScorePercentage: curScoreRes.finalScorePercentage,
      finalScoreDisplay: curScoreRes.finalScoreDisplay,
      matchedRuleLabel: curScoreRes.matchedRule?.label ?? null,
      bandLabel: curScoreRes.bandLabel,
      status: curScoreRes.status,
      monthlyStatus: (curMonthVal?.status as "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED") ?? "NOT_STARTED",
      notes: curMonthVal?.notes ?? null,
      scoringRules: rules,
      allMonthlyActuals: Array.isArray(it.monthlyActuals) ? (it.monthlyActuals as (number | null)[]) : Array(12).fill(null),
      allMonthlyNotes: Array.isArray(it.monthlyNotes) ? (it.monthlyNotes as (string | null)[]) : Array(12).fill(null),
      monthlyDetails,
      annualTarget: indTarget,
      annualActual,
      annualAchievement,
      annualScore: annualActual !== null ? annualScoreRes.score : null,
      annualBandLabel: annualScoreRes.bandLabel,
      annualProgress: `${filledMonthsCount}/12`,
      annualStatus,
      annualInputMode,
      annualNotes: it.qualitativeValue ?? null,
      parameterId: row.parameter?.id,
      picRole: row.parameter?.picRole,
      isEditable,
      isRevisionFlagged: it.isRevisionFlagged ?? false,
      revisionNote: it.revisionNote ?? null,
      assignedAssessors,
      assessorResolutionSource,
      isDelegatedAccess,
      evidenceList: paramEvidence,
      latestEvidence: paramEvidence[0] || null,
    });
  }

  // 6. Hitung agregasi parameter & agregasi total KPI (Bulanan & Tahunan)
  const categoriesList: MonthlyCategoryGroup[] = [];
  const paramScoreSummaries: { totalFraction: number }[] = [];
  const annualParamScoreSummaries: { totalFraction: number }[] = [];

  let catIdx = 0;
  for (const group of categoryMap.values()) {
    catIdx++;

    const paramScore = calculateParameterScore(group.indicators);
    paramScoreSummaries.push(paramScore);


    // Hitung skor tahunan per kategori
    const annualIndicators = group.indicators.map((ind) => {
      const annRes = calculateKpiScore(ind.annualActual, ind.scoringRules, {
        indicatorWeight: ind.indicatorWeight,
        parameterWeight: ind.parameterWeight,
        maxScore: ind.maxScore,
        compareBasis: ind.compareBasis,
        target: ind.annualTarget,
        direction: ind.direction,
        measurementType: ind.measurementType,
        unit: ind.unit,
      });
      return { finalScoreFraction: annRes.finalScoreFraction };
    });
    annualParamScoreSummaries.push(calculateParameterScore(annualIndicators));

    // Hitung rata-rata progress bulan untuk kategori ini
    const filledAvg =
      group.indicators.length > 0
        ? Math.round(
            group.indicators.reduce((acc, ind) => {
              const count = ind.monthlyDetails?.filter((m) => m.actual !== null).length ?? 0;
              return acc + count;
            }, 0) / group.indicators.length
          )
        : 0;

    categoriesList.push({
      ...group,
      categoryNumber: catIdx,
      indicatorCount: group.indicators.length,
      progressMonths: `${filledAvg}/12`,
      scorePercentage: paramScore.totalPercentage,
      parameterScore: paramScore,
    });
  }

  const overall = calculateOverallKpiScore(paramScoreSummaries);
  const annualOverall = calculateOverallKpiScore(annualParamScoreSummaries);
  const totalCount = items.length;
  const unfilledCount = totalCount - totalFilled;
  const completionPercentage = totalCount > 0 ? parseFloat(((totalFilled / totalCount) * 100).toFixed(1)) : 0;

  let overallMonthlyStatus: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED" = "NOT_STARTED";
  if (hasSubmitted) {
    overallMonthlyStatus = "SUBMITTED";
  } else if (hasDraft || totalFilled > 0) {
    overallMonthlyStatus = "DRAFT";
  }

  // Hitung progres per penilai unik untuk penilaian paralel
  const assessorMap = new Map<number, {
    assessorId: number;
    assessorName: string;
    assessorNik: string;
    role: string;
    categoryNames: Set<string>;
    totalIndicators: number;
    filledIndicators: number;
    submittedIndicators: number;
  }>();

  let myTotalIndicators = 0;
  let myFilledIndicators = 0;
  let mySubmittedIndicators = 0;
  let myHasRevisionPending = false;
  let isMyAssigned = false;

  for (const cat of categoriesList) {
    for (const ind of cat.indicators) {
      const isFilled = ind.actualValue !== null && ind.actualValue !== undefined;
      const isSub = ind.monthlyStatus === "SUBMITTED" || ind.monthlyStatus === "APPROVED";

      if (currentUser) {
        const isAssignedToMe = currentUser.role === "ADMIN" || ind.assignedAssessors?.some((a) => a.id === currentUser.id);
        if (isAssignedToMe) {
          isMyAssigned = true;
          myTotalIndicators++;
          if (isFilled) myFilledIndicators++;
          if (isSub) mySubmittedIndicators++;
          if (ind.isRevisionFlagged) myHasRevisionPending = true;
        }
      }

      if (ind.assignedAssessors && ind.assignedAssessors.length > 0) {
        for (const a of ind.assignedAssessors) {
          if (!assessorMap.has(a.id)) {
            assessorMap.set(a.id, {
              assessorId: a.id,
              assessorName: a.name,
              assessorNik: a.nik,
              role: a.jobPosition || "Penilai",
              categoryNames: new Set([cat.categoryName]),
              totalIndicators: 1,
              filledIndicators: isFilled ? 1 : 0,
              submittedIndicators: isSub ? 1 : 0,
            });
          } else {
            const entry = assessorMap.get(a.id)!;
            entry.categoryNames.add(cat.categoryName);
            entry.totalIndicators++;
            if (isFilled) entry.filledIndicators++;
            if (isSub) entry.submittedIndicators++;
          }
        }
      }
    }
  }

  const assessorProgress = Array.from(assessorMap.values()).map((e) => ({
    assessorId: e.assessorId,
    assessorName: e.assessorName,
    assessorNik: e.assessorNik,
    role: e.role,
    categoryNames: Array.from(e.categoryNames),
    totalIndicators: e.totalIndicators,
    filledIndicators: e.filledIndicators,
    submittedIndicators: e.submittedIndicators,
    isSubmitted: e.totalIndicators > 0 && e.submittedIndicators === e.totalIndicators,
  }));

  const myAssessorEntry = currentUser ? assessorMap.get(currentUser.id) : undefined;
  const myAssessmentStatus = currentUser ? {
    isAssigned: isMyAssigned,
    assignedCategoryNames: myAssessorEntry ? Array.from(myAssessorEntry.categoryNames) : [],
    totalIndicators: myTotalIndicators,
    filledIndicators: myFilledIndicators,
    submittedIndicators: mySubmittedIndicators,
    isSubmitted: myTotalIndicators > 0 && mySubmittedIndicators === myTotalIndicators,
    hasRevisionPending: myHasRevisionPending,
  } : undefined;

  return {
    period: {
      id: period.id,
      name: period.name,
      year: period.year,
      status: period.status,
    },
    employee: {
      id: apprRow.employee.id,
      nik: apprRow.employee.nik,
      name: apprRow.employee.name,
      departmentName: apprRow.department?.name ?? "-",
      jobLevelName: apprRow.jobLevel?.name ?? "-",
      jobPosition: apprRow.employee.jobPosition ?? "-",
      templateId: resolvedTemplateId,
      templateName: resolvedTemplateName ?? "-",
    },
    approvalLine,
    appraisalId: apprRow.appraisal.id,
    appraisalStatus: apprRow.appraisal.status,
    currentStage,
    rejectionReason: apprRow.appraisal.rejectionReason,
    submittedAt: apprRow.appraisal.submittedAt,
    headDeptApprovedAt: apprRow.appraisal.headDeptApprovedAt,
    headDeptNotes: apprRow.appraisal.headDeptNotes,
    managerValidatedAt: apprRow.appraisal.managerValidatedAt,
    managerNotes: apprRow.appraisal.managerNotes,
    hrApprovedAt: apprRow.appraisal.hrApprovedAt,
    hrNotes: apprRow.appraisal.hrNotes,
    finalizedAt: apprRow.appraisal.finalizedAt,
    approvalLogs,
    assessorProgress,
    myAssessmentStatus,
    templateId: resolvedTemplateId,
    templateName: resolvedTemplateName ?? "-",
    month,
    monthName: INDONESIAN_MONTH_NAMES[month - 1],
    categories: categoriesList,
    summary: {
      totalIndicators: totalCount,
      filledIndicators: totalFilled,
      unfilledIndicators: unfilledCount,
      completionPercentage,
      overallScoreFraction: overall.overallScoreFraction,
      overallScorePercentage: overall.overallScorePercentage,
      overallScoreDisplay: overall.overallScoreDisplay,
      grade: overall.grade,
      label: overall.label,
      action: overall.action,
      annualScoreFraction: annualOverall.overallScoreFraction,
      annualScorePercentage: annualOverall.overallScorePercentage,
      annualScoreDisplay: annualOverall.overallScoreDisplay,
      annualGrade: annualOverall.grade,
      annualLabel: annualOverall.label,
      annualAction: annualOverall.action,
      monthlyStatus: overallMonthlyStatus,
    },
  };
}

/**
 * Daftar karyawan dengan progres penilaian bulanan mereka.
 */
export async function getMonthlyAssessmentEmployees(params: {
  year: number;
  month: number;
  departmentId?: number;
  currentUser?: {
    id: number;
    role: string;
    departmentId?: number;
    operatingUnit?: string;
  } | null;
}): Promise<EmployeeProgressItem[]> {
  const { year, month, departmentId, currentUser } = params;

  const [period] = await db
    .select()
    .from(kpiPeriods)
    .where(eq(kpiPeriods.year, year))
    .limit(1);

  if (!period) return [];

  const appraiser = alias(employees, "appraiser");
  const appraisalAppraiser = alias(employees, "appraisal_appraiser");

  // Filter kondisi dasar periode (Hanya karyawan aktif)
  const conditions = [eq(appraisals.periodId, period.id), eq(employees.isActive, true)];

  if (departmentId) {
    conditions.push(eq(employees.departmentId, departmentId));
  }

  // Scoping role penilai yang login:
  const userRole = currentUser?.role || "ADMIN";
  const userDeptId = currentUser?.departmentId;
  const userId = currentUser?.id;

  if (userId && userRole !== "ADMIN" && userRole !== "HR") {
    const today = new Date().toISOString().split("T")[0];

    // 1. Delegasi aktif yang menunjuk currentUser sebagai delegatee
    const delegations = await db
      .select({ delegatorId: kpiAssessorDelegations.delegatorEmployeeId })
      .from(kpiAssessorDelegations)
      .where(
        and(
          eq(kpiAssessorDelegations.periodId, period.id),
          eq(kpiAssessorDelegations.delegateeEmployeeId, userId),
          eq(kpiAssessorDelegations.isActive, true),
          sql`${kpiAssessorDelegations.startDate} <= ${today}`,
          sql`${kpiAssessorDelegations.endDate} >= ${today}`
        )
      );

    const effectiveAssessorIds = [userId, ...delegations.map((d) => d.delegatorId)];

    // 2. Penugasan penilai template aktif di periode ini
    const userAssignments = await db
      .select({
        categoryId: kpiAssessorAssignments.categoryId,
        scopeType: kpiAssessorAssignments.scopeType,
        targetEmployeeId: kpiAssessorAssignments.targetEmployeeId,
        assessorDeptId: kpiAssessorAssignments.assessorDeptId,
      })
      .from(kpiAssessorAssignments)
      .where(
        and(
          eq(kpiAssessorAssignments.periodId, period.id),
          inArray(kpiAssessorAssignments.assessorEmployeeId, effectiveAssessorIds),
          eq(kpiAssessorAssignments.isActive, true)
        )
      );

    const individualEmpIds = userAssignments
      .filter((a) => a.scopeType === "INDIVIDUAL" && a.targetEmployeeId)
      .map((a) => a.targetEmployeeId as number);

    const assignedCategoryIds = userAssignments.map((a) => a.categoryId).filter(Boolean);

    let templateIdsFromCategories: number[] = [];
    if (assignedCategoryIds.length > 0) {
      const cats = await db
        .select({ templateId: kpiCategories.templateId })
        .from(kpiCategories)
        .where(inArray(kpiCategories.id, assignedCategoryIds));
      templateIdsFromCategories = Array.from(
        new Set(cats.map((c) => c.templateId).filter((id): id is number => typeof id === "number"))
      );
    }

    const assignedDeptIds = Array.from(
      new Set(
        userAssignments
          .map((a) => a.assessorDeptId)
          .filter((d): d is number => typeof d === "number")
      )
    );

    const scopingOrConditions = [
      eq(employees.id, userId), // Selalu izinkan melihat penilaian diri sendiri
      eq(employees.appraiserId, userId),
      eq(appraisals.appraiserId, userId),
      eq(employees.headDeptId, userId),
      eq(appraisals.headDeptId, userId),
      eq(employees.managerId, userId),
      eq(appraisals.managerId, userId),
    ];

    if (userRole === "HEAD_DEPT" || userRole === "MANAGER" || userRole === "PENILAI") {
      if (userDeptId) {
        scopingOrConditions.push(eq(employees.departmentId, userDeptId));
      }
      if (assignedDeptIds.length > 0) {
        scopingOrConditions.push(inArray(employees.departmentId, assignedDeptIds));
      }
    }

    if (individualEmpIds.length > 0) {
      scopingOrConditions.push(inArray(employees.id, individualEmpIds));
    }

    if (templateIdsFromCategories.length > 0) {
      scopingOrConditions.push(inArray(appraisals.templateId, templateIdsFromCategories));
    }

    conditions.push(or(...scopingOrConditions)!);
  }

  const baseQuery = db
    .select({
      appraisalId: appraisals.id,
      appraisalStatus: appraisals.status,
      currentStage: appraisals.currentStage,
      rejectionReason: appraisals.rejectionReason,
      appraisalFinalScore: appraisals.finalScore,
      employeeId: employees.id,
      nik: employees.nik,
      name: employees.name,
      jobPosition: employees.jobPosition,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      jobLevelId: employees.jobLevelId,
      jobLevelName: jobLevels.name,
      appraiserName: sql<string | null>`COALESCE(${appraisalAppraiser.name}, ${appraiser.name})`,
      templateName: kpiTemplates.name,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
    .leftJoin(appraiser, eq(employees.appraiserId, appraiser.id))
    .leftJoin(appraisalAppraiser, eq(appraisals.appraiserId, appraisalAppraiser.id))
    .leftJoin(kpiTemplates, eq(appraisals.templateId, kpiTemplates.id))
    .where(and(...conditions))
    .orderBy(asc(departments.name), asc(employees.name));

  const list = await baseQuery;

  // Dapatkan seluruh master template untuk fallback kombinasi jika templateId belum terisi langsung
  const allMasterTemplates = await db
    .select({
      id: kpiTemplates.id,
      name: kpiTemplates.name,
      deptId: kpiTemplates.departmentId,
      levelId: kpiTemplates.jobLevelId,
    })
    .from(kpiTemplates);

  // Dapatkan statistik per karyawan untuk bulan yang diminta
  const results: EmployeeProgressItem[] = [];
  for (const row of list) {
    const items = await db
      .select({
        id: appraisalItems.id,
        parameterId: appraisalItems.parameterId,
        categoryId: kpiParameters.categoryId,
        weightSnapshot: appraisalItems.weightSnapshot,
        parameterWeightSnapshot: appraisalItems.parameterWeightSnapshot,
        scoringRulesSnapshot: appraisalItems.scoringRulesSnapshot,
        monthlyActuals: appraisalItems.monthlyActuals,
      })
      .from(appraisalItems)
      .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
      .where(eq(appraisalItems.appraisalId, row.appraisalId));

    const totalIndicators = items.length;
    let filledParameters = 0;
    let totalParameters = 5;
    let monthStatus: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "APPROVED" = "NOT_STARTED";

    if (totalIndicators > 0) {
      // Kelompokkan indikator ke parameter / kategori
      const paramMap = new Map<number | string, typeof items>();
      for (const it of items) {
        const pKey = it.categoryId ?? it.parameterId ?? it.id;
        if (!paramMap.has(pKey)) paramMap.set(pKey, []);
        paramMap.get(pKey)!.push(it);
      }
      totalParameters = paramMap.size > 0 ? paramMap.size : 5;

      const itemIds = items.map((i) => i.id);
      const mRows = await db
        .select()
        .from(appraisalMonthlyValues)
        .where(inArray(appraisalMonthlyValues.appraisalItemId, itemIds));

      const filledItemIds = new Set<number>();
      for (const mr of mRows) {
        if (mr.actualValue !== null && mr.actualValue !== undefined && mr.actualValue !== "") {
          filledItemIds.add(mr.appraisalItemId);
        }
      }

      // Periksa fallback monthlyActuals legacy
      for (const it of items) {
        if (!filledItemIds.has(it.id) && it.monthlyActuals) {
          const arr = Array.isArray(it.monthlyActuals)
            ? it.monthlyActuals
            : Object.values(it.monthlyActuals);
          if (arr.some((v) => v !== null && v !== undefined && v !== "")) {
            filledItemIds.add(it.id);
          }
        }
      }

      // Parameter terhitung terisi jika indikator di dalamnya memiliki nilai
      for (const pItems of paramMap.values()) {
        const isParamFilled = pItems.some((it) => filledItemIds.has(it.id));
        if (isParamFilled) filledParameters++;
      }

      const hasSub = mRows.some((r) => r.status === "SUBMITTED" || r.status === "APPROVED");
      const hasDft = mRows.some((r) => r.status === "DRAFT");
      if (hasSub || row.appraisalStatus === "FINAL" || row.appraisalStatus === "REVIEWED" || row.appraisalStatus.startsWith("PENDING_")) {
        monthStatus = "SUBMITTED";
      } else if (hasDft || filledParameters > 0) {
        monthStatus = "DRAFT";
      }
    }

    // Kalkulasi skor final jika ada (skor disimpan sebagai fraksi <= 2.0 atau persentase 0-100)
    let finalScoreNum: number | null = null;
    if (row.appraisalFinalScore !== null && row.appraisalFinalScore !== undefined) {
      const rawVal = Number(row.appraisalFinalScore);
      finalScoreNum = rawVal <= 2.0 ? parseFloat((rawVal * 100).toFixed(1)) : parseFloat(rawVal.toFixed(1));
    }

    let gradeStr = "E";
    if (finalScoreNum !== null) {
      if (finalScoreNum >= 90) gradeStr = "A";
      else if (finalScoreNum >= 80) gradeStr = "B";
      else if (finalScoreNum >= 70) gradeStr = "C";
      else if (finalScoreNum >= 60) gradeStr = "D";
    }

    results.push({
      appraisalId: row.appraisalId,
      appraisalStatus: row.appraisalStatus,
      currentStage: row.currentStage,
      rejectionReason: row.rejectionReason,
      employeeId: row.employeeId,
      nik: row.nik,
      name: row.name,
      jobPosition: row.jobPosition ?? "-",
      departmentId: row.departmentId,
      departmentName: row.departmentName ?? "-",
      jobLevelName: row.jobLevelName ?? "-",
      appraiserName: row.appraiserName ?? "Atasan Langsung",
      templateName:
        row.templateName ||
        allMasterTemplates.find(
          (t) => t.deptId === row.departmentId && t.levelId === row.jobLevelId
        )?.name ||
        "-",
      finalScore: finalScoreNum,
      grade: gradeStr,
      month,
      totalIndicators,
      totalParameters,
      filledParameters,
      filledCount: filledParameters,
      unfilledCount: totalParameters - filledParameters,
      completionRate:
        totalParameters > 0 ? parseFloat(((filledParameters / totalParameters) * 100).toFixed(1)) : 0,
      monthlyStatus: monthStatus,
    });
  }

  return results;
}

/**
 * Menyimpan nilai realisasi bulanan (Draft) ke appraisal_monthly_values
 * sekaligus sinkronisasi dual-write ke appraisal_items.monthlyActuals (JSONB legacy).
 */
export async function saveMonthlyAssessmentValues(params: {
  appraisalId: number;
  month: number;
  values: SaveItemValueInput[];
  actor?: string;
}) {
  const { appraisalId, month, values, actor = "penilai" } = params;
  if (month < 1 || month > 12) {
    throw new Error(`Bulan tidak valid: ${month}. Harus 1-12.`);
  }

  const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId)).limit(1);
  if (!appr) throw new Error("Appraisal tidak ditemukan.");

  const [period] = await db
    .select({ year: kpiPeriods.year })
    .from(kpiPeriods)
    .where(eq(kpiPeriods.id, appr.periodId))
    .limit(1);
  const periodYear = period?.year ?? new Date().getFullYear();

  const currentApprStatus = String(appr.status);

  // 1. Validasi status lock appraisal
  if (
    currentApprStatus === "FINAL" ||
    currentApprStatus === "REVIEWED" ||
    currentApprStatus.startsWith("PENDING_")
  ) {
    throw new Error(
      `Penilaian ini sedang berada pada tahap "${appr.status}" (terkunci). Nilai tidak dapat diubah.`
    );
  }

  // 2. Validasi multi-layer kewenangan asesor sebelum menyimpan nilai
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Akses ditolak: Sesi login diperlukan untuk menyimpan nilai penilaian.");
  }
  if (currentUser.role !== "ADMIN") {
    const [targetEmp] = await db
      .select({ departmentId: employees.departmentId })
      .from(employees)
      .where(eq(employees.id, appr.employeeId))
      .limit(1);

    for (const itemInput of values) {
      const [itemCheck] = await db
        .select({
          item: appraisalItems,
          parameter: kpiParameters,
        })
        .from(appraisalItems)
        .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
        .where(eq(appraisalItems.id, itemInput.appraisalItemId))
        .limit(1);

      if (itemCheck?.item) {
        // Jika dalam status revisi, pastikan parameter ini memang diminta revisi
        if (currentApprStatus.startsWith("REVISED_")) {
          if (!itemCheck.item.isRevisionFlagged) {
            throw new Error(
              `Parameter "${
                itemCheck.item.indicatorNameSnapshot || itemCheck.parameter?.name
              }" terkunci karena tidak termasuk parameter yang diminta revisi oleh reviewer.`
            );
          }
        }

        if (itemCheck?.parameter?.id) {
          const auth = await isUserAuthorizedForParameter({
            currentUser,
            periodId: appr.periodId,
            categoryId: itemCheck.parameter.categoryId,
            parameterId: itemCheck.parameter.id,
            targetEmployeeId: appr.employeeId,
            targetDepartmentId: targetEmp?.departmentId ?? 1,
            parameterPicRole: itemCheck.parameter.picRole,
            employeeAppraiserId: appr.appraiserId,
            employeeHeadDeptId: appr.headDeptId,
            employeeManagerId: appr.managerId,
          });

          if (!auth.isAuthorized) {
            const names = auth.resolveResult.assessors.map((a) => `${a.name} (${a.nik})`).join(", ");
            throw new Error(
              `Akses ditolak: Anda tidak memiliki wewenang untuk mengisi nilai indikator "${
                itemCheck.item.indicatorNameSnapshot || itemCheck.parameter.name
              }". Parameter ini ditugaskan kepada: ${names || "Atasan Langsung"}.`
            );
          }
        }
      }
    }
  }

  for (const itemInput of values) {
    const [item] = await db
      .select({
        item: appraisalItems,
        parameter: kpiParameters,
        category: kpiCategories,
        calcRule: kpiCalculationRules,
      })
      .from(appraisalItems)
      .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
      .leftJoin(kpiCategories, eq(kpiParameters.categoryId, kpiCategories.id))
      .leftJoin(kpiCalculationRules, eq(kpiParameters.calculationRuleId, kpiCalculationRules.id))
      .where(
        and(
          eq(appraisalItems.id, itemInput.appraisalItemId),
          eq(appraisalItems.appraisalId, appraisalId)
        )
      )
      .limit(1);

    if (!item) continue;

    const indWeight = normalizeWeight(item.item.weightSnapshot ?? item.parameter?.weight ?? 0.2);
    const catWeight = normalizeWeight(
      item.item.parameterWeightSnapshot ?? item.category?.weight ?? 1
    );
    const maxScore = Number(item.parameter?.maxScore) || 25;
    let rules = (item.item.scoringRulesSnapshot as GenericScoringRule[]) || [];
    const hasValidRuleValues =
      Array.isArray(rules) &&
      rules.length > 0 &&
      rules.some((r) => (r.minValue !== null && r.minValue !== undefined) || (r.maxValue !== null && r.maxValue !== undefined));

    if (!hasValidRuleValues && item.parameter?.id) {
      const dbBands = await db
        .select()
        .from(kpiBands)
        .where(eq(kpiBands.parameterId, item.parameter.id))
        .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id));
      rules = dbBands.map((b) => ({
        id: b.id,
        label: b.label,
        operator: b.operator,
        minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
        maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
        score: Number(b.score),
        sortOrder: b.sortOrder,
      }));
    }

    const compareBasis = item.parameter?.compareBasis || "ACTUAL";
    const currentTarget =
      itemInput.target !== undefined && itemInput.target !== null
        ? Number(itemInput.target)
        : item.item.target !== null && item.item.target !== undefined
        ? Number(item.item.target)
        : item.parameter?.target !== null && item.parameter?.target !== undefined
        ? Number(item.parameter.target)
        : null;

    const scoreRes = calculateKpiScore(itemInput.actualValue, rules, {
      indicatorWeight: indWeight,
      parameterWeight: catWeight,
      maxScore,
      compareBasis,
      target: currentTarget,
      direction: item.parameter?.direction,
      measurementType: item.parameter?.measurementType,
      unit: item.parameter?.unit,
    });

    // 1. Simpan ke appraisal_monthly_values
    const [existingVal] = await db
      .select()
      .from(appraisalMonthlyValues)
      .where(
        and(
          eq(appraisalMonthlyValues.appraisalItemId, itemInput.appraisalItemId),
          eq(appraisalMonthlyValues.month, month)
        )
      )
      .limit(1);

    const actualStr = itemInput.actualValue !== null ? String(itemInput.actualValue) : null;
    const scoreStr = itemInput.actualValue !== null ? String(scoreRes.score) : null;
    const finalScoreStr =
      itemInput.actualValue !== null ? String(scoreRes.finalScoreFraction) : null;

    let monthlyValId: number;
    if (existingVal) {
      await db
        .update(appraisalMonthlyValues)
        .set({
          actualValue: actualStr,
          score: scoreStr,
          finalScore: finalScoreStr,
          notes: itemInput.notes !== undefined ? itemInput.notes : existingVal.notes,
          status: existingVal.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(appraisalMonthlyValues.id, existingVal.id));
      monthlyValId = existingVal.id;
    } else {
      const [insertedVal] = await db
        .insert(appraisalMonthlyValues)
        .values({
          appraisalItemId: itemInput.appraisalItemId,
          month,
          actualValue: actualStr,
          score: scoreStr,
          finalScore: finalScoreStr,
          notes: itemInput.notes ?? null,
          status: "DRAFT",
          updatedBy: actor,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: appraisalMonthlyValues.id });
      monthlyValId = insertedVal.id;
    }

    // 1.1 Tulis Calculation Audit Log (Formula Engine Phase 2)
    try {
      const calcRuleId = item.calcRule?.id ?? item.parameter?.calculationRuleId ?? null;
      const calcRuleCode =
        item.calcRule?.code ??
        (item.parameter?.unit === "SP" || item.parameter?.unit === "Insiden"
          ? "ACH-INVERSE-V1"
          : "ACH-NORMAL-V1");
      const directionCode =
        item.parameter?.direction ||
        item.calcRule?.direction ||
        (calcRuleCode === "ACH-INVERSE-V1" ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER");

      const achievementPct = scoreRes.realizationPct;
      const formulaDescription =
        directionCode === "LOWER_IS_BETTER"
          ? "Formula Lower is Better: (Target ÷ Aktual) × 100%"
          : directionCode === "NOT_APPLICABLE"
          ? "Evaluasi Langsung terhadap Kriteria (Kualitatif/Text/Boolean)"
          : "Formula Higher is Better: (Aktual ÷ Target) × 100%";

      const steps: Array<{
        step: number;
        label: string;
        formula: string;
        result: string | number;
      }> = [
        {
          step: 1,
          label: "Input Aktual & Target",
          formula: `Target: ${currentTarget !== null ? currentTarget : "-"}, Aktual: ${
            itemInput.actualValue !== null ? itemInput.actualValue : "-"
          }`,
          result: `${itemInput.actualValue !== null ? itemInput.actualValue : "-"} ${
            item.parameter?.unit || ""
          }`.trim(),
        },
        {
          step: 2,
          label: `Perhitungan Achievement (${calcRuleCode})`,
          formula: formulaDescription,
          result: achievementPct !== null ? `${achievementPct}%` : "-",
        },
        {
          step: 3,
          label: "Kriteria Scoring yang Cocok",
          formula: `Mencocokkan nilai aktual ke rentang kriteria scoring indikator`,
          result: `${scoreRes.matchedRule?.label || scoreRes.bandLabel || "-"} → Skor: ${scoreRes.score}`,
        },
        {
          step: 4,
          label: "Kontribusi Skor Akhir",
          formula: `(Skor ÷ ${maxScore}) × ${Math.round(indWeight * 100)}% (Bobot Indikator) × ${Math.round(
            catWeight * 100
          )}% (Bobot Parameter)`,
          result: `${scoreRes.finalScorePercentage.toFixed(4)}%`,
        },
      ];

      await db
        .delete(appraisalCalculationLogs)
        .where(
          and(
            eq(appraisalCalculationLogs.appraisalItemId, itemInput.appraisalItemId),
            eq(appraisalCalculationLogs.month, month)
          )
        );

      await db.insert(appraisalCalculationLogs).values({
        appraisalItemId: itemInput.appraisalItemId,
        appraisalMonthlyValueId: monthlyValId,
        month,
        periodYear,
        calculationRuleId: calcRuleId,
        calculationRuleCode: calcRuleCode,
        target: currentTarget !== null ? String(currentTarget) : null,
        actual: actualStr,
        indicatorWeight: String(indWeight),
        categoryWeight: String(catWeight),
        maxScore: String(maxScore),
        achievementPct: achievementPct !== null ? String(achievementPct) : null,
        matchedBandLabel: scoreRes.matchedRule?.label || null,
        score: scoreStr,
        finalScoreFraction: finalScoreStr,
        finalScorePct: String(scoreRes.finalScorePercentage),
        traceJson: { steps },
        calculatedBy: actor,
      });
    } catch (logErr) {
      console.error("[saveMonthlyAssessmentValues] Gagal menulis appraisal_calculation_logs:", logErr);
    }

    // 2. Dual-write sync ke appraisal_items.monthlyActuals & monthlyNotes
    const mActuals = Array.isArray(item.item.monthlyActuals)
      ? [...item.item.monthlyActuals]
      : Array(12).fill(null);
    while (mActuals.length < 12) mActuals.push(null);
    mActuals[month - 1] = itemInput.actualValue;

    const mNotes = Array.isArray(item.item.monthlyNotes)
      ? [...item.item.monthlyNotes]
      : Array(12).fill(null);
    while (mNotes.length < 12) mNotes.push(null);
    if (itemInput.notes !== undefined) {
      mNotes[month - 1] = itemInput.notes;
    }

    const mTargets = Array.isArray(item.item.monthlyTargets)
      ? [...item.item.monthlyTargets]
      : Array(12).fill(null);
    while (mTargets.length < 12) mTargets.push(null);
    if (itemInput.target !== undefined) {
      mTargets[month - 1] = itemInput.target;
    }

    const updateData: Record<string, any> = {
      monthlyActuals: mActuals,
      monthlyNotes: mNotes,
      monthlyTargets: mTargets,
      updatedBy: actor,
      updatedAt: new Date(),
    };

    // Sinkronkan kalkulasi agregasi tahunan ke kolom annualActual
    const validActuals = mActuals.filter((v): v is number => v !== null && v !== undefined);
    if (validActuals.length > 0) {
      const agg = item.parameter?.aggregation || "AVERAGE";
      let computedAnnual: number;
      if (agg === "SUM") {
        computedAnnual = validActuals.reduce((a, b) => a + b, 0);
      } else if (agg === "LAST_VALUE") {
        computedAnnual = validActuals[validActuals.length - 1];
      } else {
        computedAnnual = parseFloat((validActuals.reduce((a, b) => a + b, 0) / validActuals.length).toFixed(2));
      }
      updateData.annualActual = String(computedAnnual);
      updateData.actual = String(computedAnnual);
    }

    if (itemInput.target !== undefined && itemInput.target !== null) {
      const tStr = String(itemInput.target);
      updateData.target = tStr;
      updateData.targetSnapshot = tStr;
    }

    await db
      .update(appraisalItems)
      .set(updateData)
      .where(eq(appraisalItems.id, itemInput.appraisalItemId));
  }

  await recordAudit(
    "appraisal_monthly",
    appraisalId,
    "SAVE_DRAFT",
    { month, itemsCount: values.length },
    actor
  );

  await recalculateAppraisal(appraisalId);

  return { success: true, month, updatedCount: values.length };
}

/**
 * Submit penilaian bulanan (mengunci status bulan menjadi SUBMITTED tanpa mengunci seluruh appraisal tahunan).
 */
export async function submitMonthlyAssessment(params: {
  appraisalId: number;
  month: number;
  actor?: string;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Akses ditolak: Sesi login diperlukan untuk submit penilaian bulanan.");
  }
  const actor = `${currentUser.name} (${currentUser.nik})`;
  const { appraisalId, month } = params;
  if (month < 1 || month > 12) throw new Error("Bulan tidak valid");

  const items = await db
    .select({ id: appraisalItems.id })
    .from(appraisalItems)
    .where(eq(appraisalItems.appraisalId, appraisalId));

  if (items.length === 0) throw new Error("Tidak ada indikator untuk appraisal ini");
  const itemIds = items.map((i) => i.id);

  await db
    .update(appraisalMonthlyValues)
    .set({
      status: "SUBMITTED",
      updatedBy: actor,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(appraisalMonthlyValues.appraisalItemId, itemIds),
        eq(appraisalMonthlyValues.month, month)
      )
    );

  await recalculateAppraisal(appraisalId);

  await recordAudit("appraisal_monthly", appraisalId, "SUBMIT", { month }, actor);
  return { success: true, month, status: "SUBMITTED" };
}

/**
 * Submit Penilaian Saya:
 * Fitur pengajuan penilaian paralel khusus untuk penilai yang memiliki tugas sesuai assignment Master Template.
 * - Memvalidasi kelengkapan nilai indikator tugasnya
 * - Mengunci penilaian yang dikirim (SUBMITTED)
 * - Penilai lain dapat bekerja paralel pada parameter masing-masing tanpa harus menunggu
 * - Jika seluruh penilai telah menyelesaikan tugasnya, dokumen otomatis diteruskan ke reviewer (Head Dept)
 * - Mencatat riwayat pengiriman ke appraisal_approval_logs untuk monitoring dan audit
 */
export async function submitMyAssessorAssessment(params: {
  appraisalId: number;
  month: number;
  actor: {
    id: number;
    name: string;
    role: string;
  };
  notes?: string;
}): Promise<{
  success: boolean;
  isAllSubmitted: boolean;
  submittedCount: number;
  unfilledIndicators?: Array<{ id: number; name: string; categoryName?: string; target: string | null }>;
  message?: string;
  error?: string;
}> {
  const { appraisalId, month, actor, notes } = params;
  if (month < 1 || month > 12) {
    return { success: false, isAllSubmitted: false, submittedCount: 0, error: "Bulan tidak valid." };
  }

  // 1. Dapatkan data appraisal & employee
  const [appr] = await db
    .select({
      appraisal: appraisals,
      employee: employees,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .where(eq(appraisals.id, appraisalId))
    .limit(1);

  if (!appr) {
    return { success: false, isAllSubmitted: false, submittedCount: 0, error: "Data penilaian tidak ditemukan." };
  }

  // 2. Dapatkan seluruh indikator
  const items = await db
    .select({
      item: appraisalItems,
      parameter: kpiParameters,
      category: kpiCategories,
    })
    .from(appraisalItems)
    .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .leftJoin(kpiCategories, eq(kpiParameters.categoryId, kpiCategories.id))
    .where(eq(appraisalItems.appraisalId, appraisalId));

  if (items.length === 0) {
    return { success: false, isAllSubmitted: false, submittedCount: 0, error: "Tidak ada indikator pada dokumen ini." };
  }

  // 3. Saring indikator yang menjadi kewenangan penilai saat ini
  const myItems: typeof items = [];

  for (const row of items) {
    const catId = row.parameter?.categoryId || row.category?.id;
    if (!catId) {
      if (actor.role === "ADMIN") myItems.push(row);
      continue;
    }

    const authRes = await getAuthorizedAssessorIds({
      periodId: appr.appraisal.periodId,
      categoryId: catId,
      targetEmployeeId: appr.employee.id,
      targetDepartmentId: appr.employee.departmentId,
      parameterPicRole: row.parameter?.picRole,
      employeeAppraiserId: appr.employee.appraiserId,
      employeeHeadDeptId: appr.employee.headDeptId,
      employeeManagerId: appr.employee.managerId,
    });

    if (actor.role === "ADMIN" || authRes.effectiveAssessorIds.includes(actor.id)) {
      myItems.push(row);
    }
  }

  if (myItems.length === 0) {
    return {
      success: false,
      isAllSubmitted: false,
      submittedCount: 0,
      error: "Anda tidak memiliki tugas penilaian yang ditugaskan pada dokumen ini sesuai Master Template.",
    };
  }

  // 4. Validasi Kelengkapan Nilai
  const myItemIds = myItems.map((m) => m.item.id);
  const monthlyVals = await db
    .select()
    .from(appraisalMonthlyValues)
    .where(
      and(
        inArray(appraisalMonthlyValues.appraisalItemId, myItemIds),
        eq(appraisalMonthlyValues.month, month)
      )
    );

  const unfilled: Array<{ id: number; name: string; categoryName?: string; target: string | null }> = [];

  for (const m of myItems) {
    const valRow = monthlyVals.find((v) => v.appraisalItemId === m.item.id);
    let hasVal = false;
    if (valRow && valRow.actualValue !== null && valRow.actualValue !== undefined && String(valRow.actualValue).trim() !== "") {
      hasVal = true;
    } else if (Array.isArray(m.item.monthlyActuals) && m.item.monthlyActuals[month - 1] !== null && m.item.monthlyActuals[month - 1] !== undefined) {
      hasVal = true;
    } else if (m.item.annualActual !== null && m.item.annualActual !== undefined) {
      hasVal = true;
    }

    if (!hasVal) {
      unfilled.push({
        id: m.item.id,
        name: m.item.indicatorNameSnapshot || m.parameter?.name || "Indikator",
        categoryName: m.category?.name || "Parameter",
        target: m.item.targetSnapshot || m.item.target || m.parameter?.target || null,
      });
    }
  }

  if (unfilled.length > 0) {
    return {
      success: false,
      isAllSubmitted: false,
      submittedCount: 0,
      error: "VALIDATION_FAILED",
      unfilledIndicators: unfilled,
      message: `Terdapat ${unfilled.length} indikator tugas Anda yang belum diisi nilai realisasinya.`,
    };
  }

  // 5. Simpan & Kunci Status Nilai Bulanan (SUBMITTED)
  const now = new Date();

  for (const m of myItems) {
    const existingVal = monthlyVals.find((v) => v.appraisalItemId === m.item.id);
    if (existingVal) {
      await db
        .update(appraisalMonthlyValues)
        .set({
          status: "SUBMITTED",
          updatedBy: actor.name,
          updatedAt: now,
        })
        .where(eq(appraisalMonthlyValues.id, existingVal.id));
    } else {
      const curActual =
        Array.isArray(m.item.monthlyActuals) && m.item.monthlyActuals[month - 1] !== null
          ? m.item.monthlyActuals[month - 1]
          : m.item.annualActual !== null
          ? m.item.annualActual
          : null;

      await db.insert(appraisalMonthlyValues).values({
        appraisalItemId: m.item.id,
        month,
        actualValue: curActual ? String(curActual) : null,
        status: "SUBMITTED",
        updatedBy: actor.name,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Bersihkan flag revisi jika ada parameter yang sebelumnya diminta revisi
  await db
    .update(appraisalItems)
    .set({
      isRevisionFlagged: false,
      revisionNote: null,
      updatedAt: now,
    })
    .where(inArray(appraisalItems.id, myItemIds));

  // 6. Cek apakah SEMUA indikator dalam appraisal ini sudah berstatus SUBMITTED/APPROVED
  const allItemIds = items.map((i) => i.item.id);
  const allMonthlyVals = await db
    .select({
      appraisalItemId: appraisalMonthlyValues.appraisalItemId,
      status: appraisalMonthlyValues.status,
    })
    .from(appraisalMonthlyValues)
    .where(
      and(
        inArray(appraisalMonthlyValues.appraisalItemId, allItemIds),
        eq(appraisalMonthlyValues.month, month)
      )
    );

  const allSubmitted = allItemIds.every((id) => {
    const row = allMonthlyVals.find((v) => v.appraisalItemId === id);
    return row && (row.status === "SUBMITTED" || row.status === "APPROVED");
  });

  let isAllSubmitted = false;
  const isResubmit = String(appr.appraisal.status).startsWith("REVISED_");

  // Catat riwayat pengiriman bagian penilai ini
  await db.insert(appraisalApprovalLogs).values({
    appraisalId,
    action: isResubmit ? "RESUBMIT_REVISION_PORTION" : "SUBMIT_MY_ASSESSMENT",
    fromStatus: appr.appraisal.status,
    toStatus: allSubmitted ? "PENDING_HEAD_DEPT" : appr.appraisal.status,
    stage: "PENILAI",
    actorId: actor.id > 0 ? actor.id : null,
    actorName: actor.name,
    actorRole: actor.role,
    notes: notes || `Penilai ${actor.name} menyerahkan penilaian untuk ${myItems.length} indikator tugasnya.`,
    createdAt: now,
  });

  // Jika semua penilai telah submit: otomatis teruskan ke reviewer berikutnya (Head Dept)
  if (allSubmitted) {
    isAllSubmitted = true;
    await db
      .update(appraisals)
      .set({
        status: "PENDING_HEAD_DEPT",
        currentStage: "HEAD_DEPT",
        submittedAt: now,
        rejectionReason: null,
        notes: notes || appr.appraisal.notes,
        updatedAt: now,
      })
      .where(eq(appraisals.id, appraisalId));

    await db.insert(appraisalApprovalLogs).values({
      appraisalId,
      action: "FORWARD_TO_REVIEW",
      fromStatus: appr.appraisal.status,
      toStatus: "PENDING_HEAD_DEPT",
      stage: "HEAD_DEPT",
      actorId: actor.id > 0 ? actor.id : null,
      actorName: "Sistem KPI",
      actorRole: "SYSTEM",
      notes: "Seluruh penilai telah menyelesaikan dan menyerahkan penilaian. Berkas otomatis diteruskan ke Head Dept untuk review.",
      createdAt: new Date(now.getTime() + 100),
    });
  }

  await recalculateAppraisal(appraisalId);
  await recordAudit("appraisal_monthly", appraisalId, "SUBMIT_MY_PORTION", {
    month,
    actorId: actor.id,
    itemCount: myItems.length,
    isAllSubmitted,
  }, actor.name);

  return {
    success: true,
    isAllSubmitted,
    submittedCount: myItems.length,
    message: isAllSubmitted
      ? "Seluruh penilai telah menyelesaikan penilaian. Berkas otomatis diteruskan ke Head Dept untuk proses review."
      : `Penilaian Anda (${myItems.length} indikator) berhasil diserahkan dan dikunci. Menunggu penilai lainnya menyelesaikan penilaian mereka.`,
  };
}

/**
 * Membuka kembali penilaian bulanan yang telah disubmit menjadi DRAFT (Reopen).
 */
export async function reopenMonthlyAssessment(params: {
  appraisalId: number;
  month: number;
  actor?: string;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
    throw new Error("Akses ditolak: Hanya Administrator atau HR yang berwenang membuka kembali penilaian.");
  }
  const actor = `${currentUser.name} (${currentUser.nik})`;
  const { appraisalId, month } = params;
  if (month < 1 || month > 12) throw new Error("Bulan tidak valid");

  const items = await db
    .select({ id: appraisalItems.id })
    .from(appraisalItems)
    .where(eq(appraisalItems.appraisalId, appraisalId));

  if (items.length === 0) throw new Error("Tidak ada indikator untuk appraisal ini");
  const itemIds = items.map((i) => i.id);

  await db
    .update(appraisalMonthlyValues)
    .set({
      status: "DRAFT",
      updatedBy: actor,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(appraisalMonthlyValues.appraisalItemId, itemIds),
        eq(appraisalMonthlyValues.month, month)
      )
    );

  await recalculateAppraisal(appraisalId);

  await recordAudit("appraisal_monthly", appraisalId, "REOPEN", { month }, actor);
  return { success: true, month, status: "DRAFT" };
}

/**
 * Menyimpan nilai realisasi tahunan langsung (1x inputan untuk 1 tahun) pada appraisal_items.
 */
export async function saveIndicatorAnnualActual(params: {
  appraisalId: number;
  appraisalItemId: number;
  annualActual: number | null;
  target?: number | null;
  notes?: string | null;
  actor?: string;
}) {
  const { appraisalId, appraisalItemId, annualActual, target, notes, actor = "penilai" } = params;

  const [item] = await db
    .select()
    .from(appraisalItems)
    .where(
      and(
        eq(appraisalItems.id, appraisalItemId),
        eq(appraisalItems.appraisalId, appraisalId)
      )
    )
    .limit(1);

  if (!item) throw new Error("Indikator appraisal tidak ditemukan.");

  const actualStr = annualActual !== null ? String(annualActual) : null;
  const updateData: Record<string, any> = {
    annualActual: actualStr,
    actual: actualStr,
    updatedBy: actor,
    updatedAt: new Date(),
  };

  if (notes !== undefined) {
    updateData.qualitativeValue = notes;
  }

  if (target !== undefined && target !== null) {
    const targetStr = String(target);
    updateData.target = targetStr;
    updateData.targetSnapshot = targetStr;
  }

  await db
    .update(appraisalItems)
    .set(updateData)
    .where(eq(appraisalItems.id, appraisalItemId));

  await recordAudit(
    "appraisal_item",
    appraisalId,
    "UPDATE_ANNUAL_ACTUAL",
    { appraisalItemId, annualActual, notes },
    actor
  );

  await recalculateAppraisal(appraisalId);

  return { success: true, appraisalItemId, annualActual };
}

/**
 * Mengkalkulasi ulang seluruh appraisal karyawan secara terpusat (single source of truth).
 * Menghitung nilai tahunan dari agregasi bulanan, mencocokkan ke scoring rules,
 * memperbarui kolom appraisal_items (annualActual, actual, achievement, score, weightedScore)
 * serta memperbarui appraisals.finalScore.
 */
export async function recalculateAppraisal(appraisalId: number): Promise<number> {
  const [a] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
  if (!a) return 0;

  const [period] = await db
    .select({ year: kpiPeriods.year })
    .from(kpiPeriods)
    .where(eq(kpiPeriods.id, a.periodId))
    .limit(1);
  const periodYear = period?.year ?? new Date().getFullYear();

  const items = await db
    .select({
      item: appraisalItems,
      parameter: kpiParameters,
      category: kpiCategories,
      calcRule: kpiCalculationRules,
    })
    .from(appraisalItems)
    .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .leftJoin(kpiCategories, eq(kpiParameters.categoryId, kpiCategories.id))
    .leftJoin(kpiCalculationRules, eq(kpiParameters.calculationRuleId, kpiCalculationRules.id))
    .where(eq(appraisalItems.appraisalId, appraisalId))
    .orderBy(asc(kpiCategories.sortOrder), asc(kpiParameters.sortOrder), asc(appraisalItems.id));

  if (!items.length) return 0;

  const paramIds = items
    .map((r) => r.parameter?.id)
    .filter((id): id is number => typeof id === "number");

  const bands = paramIds.length
    ? await db
        .select()
        .from(kpiBands)
        .where(inArray(kpiBands.parameterId, paramIds))
        .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
    : [];

  const bandsByParamId = new Map<number, GenericScoringRule[]>();
  for (const b of bands) {
    const list = bandsByParamId.get(b.parameterId) || [];
    list.push({
      id: b.id,
      label: b.label,
      operator: b.operator,
      minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
      maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
      score: Number(b.score),
      sortOrder: b.sortOrder,
    });
    bandsByParamId.set(b.parameterId, list);
  }

  let totalWeightedScore = 0;

  for (const row of items) {
    const it = row.item;
    const p = row.parameter;
    const cat = row.category;
    const calcRule = row.calcRule;

    let rules: GenericScoringRule[] = (it.scoringRulesSnapshot as GenericScoringRule[]) || [];
    const hasValidRuleValues =
      Array.isArray(rules) &&
      rules.length > 0 &&
      rules.some(
        (r) =>
          (r.minValue !== null && r.minValue !== undefined) ||
          (r.maxValue !== null && r.maxValue !== undefined)
      );

    if (!hasValidRuleValues && p?.id && bandsByParamId.has(p.id)) {
      rules = bandsByParamId.get(p.id) || [];
    } else if (rules.length === 0 && p?.id && bandsByParamId.has(p.id)) {
      rules = bandsByParamId.get(p.id) || [];
    }

    const indWeight = normalizeWeight(it.weightSnapshot ?? p?.weight ?? 0.2);
    const catWeight = normalizeWeight(it.parameterWeightSnapshot ?? cat?.weight ?? 1.0);
    const maxScore = Number(p?.maxScore) || 25;

    const mActuals = (it.monthlyActuals ?? []).map((v) =>
      v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null
    );
    const hasMonthly = mActuals.some((v) => v !== null);

    let annualActual: number | null = null;
    let target =
      it.target !== null && it.target !== undefined
        ? Number(it.target)
        : it.targetSnapshot !== null && it.targetSnapshot !== undefined
        ? Number(it.targetSnapshot)
        : p?.target !== null && p?.target !== undefined
        ? Number(p.target)
        : null;

    if (it.annualActual !== null && it.annualActual !== undefined && !isNaN(Number(it.annualActual))) {
      // Prioritaskan nilai tahunan eksplisit dari Kolom U Excel
      annualActual = Number(it.annualActual);
    } else if (hasMonthly) {
      // Fallback ke kalkulasi agregasi dari data bulanan jika Kolom U kosong
      const agg = aggregateMonthly(
        (p?.aggregation || "AVERAGE") as any,
        mActuals,
        (it.monthlyTargets ?? []).map((v) => (v !== null ? Number(v) : null))
      );
      annualActual = agg.annualActual;
      if (agg.annualTarget !== null && target === null) target = agg.annualTarget;
    } else if (it.actual !== null && it.actual !== undefined) {
      annualActual = Number(it.actual);
    }

    // Pencegahan kesalahan konversi desimal dan persentase
    if (p?.unit === "%" || p?.name?.includes("%")) {
      if (
        annualActual !== null &&
        annualActual > 0 &&
        annualActual <= 1 &&
        (target === null || target > 1 || rules.some((r) => Number(r.minValue || 0) > 1))
      ) {
        annualActual = parseFloat((annualActual * 100).toFixed(4));
      }
      if (target !== null && target > 0 && target <= 1 && rules.some((r) => Number(r.minValue || 0) > 1)) {
        target = parseFloat((target * 100).toFixed(4));
      }
    }

    const compareBasis = p?.compareBasis || "ACTUAL";
    const scoreRes = calculateKpiScore(annualActual, rules, {
      indicatorWeight: indWeight,
      parameterWeight: catWeight,
      maxScore,
      compareBasis,
      target,
      direction: p?.direction,
      measurementType: p?.measurementType,
      unit: p?.unit,
    });

    totalWeightedScore += scoreRes.finalScoreFraction;

    const achievement = scoreRes.realizationPct;

    await db
      .update(appraisalItems)
      .set({
        annualActual: annualActual !== null ? String(annualActual) : null,
        actual: annualActual !== null ? String(annualActual) : null,
        achievement: achievement !== null ? String(achievement.toFixed(2)) : null,
        bandLabel: scoreRes.bandLabel ?? scoreRes.matchedRule?.label ?? null,
        score: String(scoreRes.score),
        weightedScore: String(scoreRes.finalScoreFraction),
      })
      .where(eq(appraisalItems.id, it.id));

    // Annual Calculation Audit Log (month: null)
    try {
      const calcRuleId = calcRule?.id ?? p?.calculationRuleId ?? null;
      const calcRuleCode =
        calcRule?.code ??
        (p?.unit === "SP" || p?.unit === "Insiden" ? "ACH-INVERSE-V1" : "ACH-NORMAL-V1");
      const directionCode =
        p?.direction ||
        calcRule?.direction ||
        (calcRuleCode === "ACH-INVERSE-V1" ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER");

      const annualAchPct = scoreRes.realizationPct;
      const formulaDescription =
        directionCode === "LOWER_IS_BETTER"
          ? "Formula Lower is Better: (Target ÷ Aktual) × 100%"
          : directionCode === "NOT_APPLICABLE"
          ? "Evaluasi Langsung terhadap Kriteria (Kualitatif/Text/Boolean)"
          : "Formula Higher is Better: (Aktual ÷ Target) × 100%";

      const annualSteps = [
        {
          step: 1,
          label: "Realisasi Tahunan (Annual Actual)",
          formula: `Target: ${target !== null ? target : "-"}, Aktual Tahunan: ${
            annualActual !== null ? annualActual : "-"
          }`,
          result: `${annualActual !== null ? annualActual : "-"} ${p?.unit || ""}`.trim(),
        },
        {
          step: 2,
          label: `Perhitungan Achievement Tahunan (${calcRuleCode})`,
          formula: formulaDescription,
          result: annualAchPct !== null ? `${annualAchPct}%` : "-",
        },
        {
          step: 3,
          label: "Kriteria Scoring Tahunan yang Cocok",
          formula: `Mencocokkan nilai aktual tahunan ke rentang kriteria scoring`,
          result: `${scoreRes.matchedRule?.label || scoreRes.bandLabel || "-"} → Skor: ${scoreRes.score}`,
        },
        {
          step: 4,
          label: "Kontribusi Skor Tahunan",
          formula: `(Skor ÷ ${maxScore}) × ${Math.round(indWeight * 100)}% × ${Math.round(
            catWeight * 100
          )}%`,
          result: `${scoreRes.finalScorePercentage.toFixed(4)}%`,
        },
      ];

      await db
        .delete(appraisalCalculationLogs)
        .where(
          and(
            eq(appraisalCalculationLogs.appraisalItemId, it.id),
            isNull(appraisalCalculationLogs.month)
          )
        );

      await db.insert(appraisalCalculationLogs).values({
        appraisalItemId: it.id,
        appraisalMonthlyValueId: null,
        month: null,
        periodYear,
        calculationRuleId: calcRuleId,
        calculationRuleCode: calcRuleCode,
        target: target !== null ? String(target) : null,
        actual: annualActual !== null ? String(annualActual) : null,
        indicatorWeight: String(indWeight),
        categoryWeight: String(catWeight),
        maxScore: String(maxScore),
        achievementPct: annualAchPct !== null ? String(annualAchPct) : null,
        matchedBandLabel: scoreRes.matchedRule?.label || null,
        score: String(scoreRes.score),
        finalScoreFraction: String(scoreRes.finalScoreFraction),
        finalScorePct: String(scoreRes.finalScorePercentage),
        traceJson: { steps: annualSteps },
        calculatedBy: "system_recalc",
      });
    } catch {
      // Non-blocking log insert
    }
  }

  const finalScoreFraction = parseFloat(totalWeightedScore.toFixed(6));
  await db
    .update(appraisals)
    .set({ finalScore: String(finalScoreFraction), updatedAt: new Date() })
    .where(eq(appraisals.id, appraisalId));

  return finalScoreFraction;
}

/**
 * Mengambil trace log perhitungan (audit trail) untuk suatu indikator appraisal.
 * Jika month diberikan (1..12), mengembalikan trace bulan tersebut.
 * Jika month null, mengembalikan trace tahunan (annual).
 * Jika month tidak diberikan (undefined), mengembalikan seluruh trace.
 */
export async function getCalculationTrace(params: {
  appraisalItemId: number;
  month?: number | null;
}) {
  const { appraisalItemId, month } = params;

  if (month !== undefined) {
    const whereCond =
      month === null
        ? and(
            eq(appraisalCalculationLogs.appraisalItemId, appraisalItemId),
            isNull(appraisalCalculationLogs.month)
          )
        : and(
            eq(appraisalCalculationLogs.appraisalItemId, appraisalItemId),
            eq(appraisalCalculationLogs.month, month)
          );

    const rows = await db
      .select({
        log: appraisalCalculationLogs,
        rule: kpiCalculationRules,
      })
      .from(appraisalCalculationLogs)
      .leftJoin(
        kpiCalculationRules,
        eq(appraisalCalculationLogs.calculationRuleId, kpiCalculationRules.id)
      )
      .where(whereCond);

    return rows.map((r) => ({
      ...r.log,
      rule: r.rule,
    }));
  }

  const rows = await db
    .select({
      log: appraisalCalculationLogs,
      rule: kpiCalculationRules,
    })
    .from(appraisalCalculationLogs)
    .leftJoin(
      kpiCalculationRules,
      eq(appraisalCalculationLogs.calculationRuleId, kpiCalculationRules.id)
    )
    .where(eq(appraisalCalculationLogs.appraisalItemId, appraisalItemId))
    .orderBy(asc(appraisalCalculationLogs.month));

  return rows.map((r) => ({
    ...r.log,
    rule: r.rule,
  }));
}

/**
 * Menyimpan data hasil upload batch Excel secara transaksional:
 * - Menyimpan nilai bulanan (Jan-Des) jika ada
 * - Menyimpan nilai tahunan (Realisasi)
 * - Merekalkulasi seluruh appraisal menggunakan logic input manual eksisting
 * - Mencatat riwayat audit trail
 */
export async function saveBatchAssessmentFromExcel(params: {
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
  actor?: string;
}) {
  const { appraisalId, fileName = "penilaian.xlsx", items, actor = "penilai" } = params;

  if (!items || items.length === 0) {
    throw new Error("Tidak ada item yang dipilih untuk disimpan.");
  }

  const [appr] = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.id, appraisalId))
    .limit(1);

  if (!appr) throw new Error("Appraisal tidak ditemukan.");

  const currentApprStatus = String(appr.status);
  if (
    currentApprStatus === "FINAL" ||
    currentApprStatus === "REVIEWED" ||
    currentApprStatus.startsWith("PENDING_")
  ) {
    throw new Error(
      `Penilaian ini sedang berada pada tahap "${appr.status}" (terkunci). Nilai tidak dapat diubah.`
    );
  }

  // Validasi multi-layer kewenangan asesor jika bukan ADMIN
  const currentUser = await getCurrentUser();
  if (currentUser && currentUser.role !== "ADMIN") {
    const [targetEmp] = await db
      .select({ departmentId: employees.departmentId })
      .from(employees)
      .where(eq(employees.id, appr.employeeId))
      .limit(1);

    for (const itm of items) {
      const [itemCheck] = await db
        .select({
          item: appraisalItems,
          parameter: kpiParameters,
        })
        .from(appraisalItems)
        .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
        .where(eq(appraisalItems.id, itm.appraisalItemId))
        .limit(1);

      if (itemCheck?.parameter?.id) {
        const auth = await isUserAuthorizedForParameter({
          currentUser,
          periodId: appr.periodId,
          categoryId: itemCheck.parameter.categoryId,
          parameterId: itemCheck.parameter.id,
          targetEmployeeId: appr.employeeId,
          targetDepartmentId: targetEmp?.departmentId ?? 1,
          parameterPicRole: itemCheck.parameter.picRole,
          employeeAppraiserId: appr.appraiserId,
          employeeHeadDeptId: appr.headDeptId,
          employeeManagerId: appr.managerId,
        });

        if (!auth.isAuthorized) {
          throw new Error(
            `Akses ditolak: Anda tidak memiliki wewenang untuk mengisi nilai indikator "${
              itemCheck.item.indicatorNameSnapshot || itemCheck.parameter.name
            }".`
          );
        }
      }
    }
  }

  // Proses penyimpanan per item
  for (const itm of items) {
    const [itemRow] = await db
      .select({
        item: appraisalItems,
        parameter: kpiParameters,
      })
      .from(appraisalItems)
      .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
      .where(
        and(
          eq(appraisalItems.id, itm.appraisalItemId),
          eq(appraisalItems.appraisalId, appraisalId)
        )
      )
      .limit(1);

    if (!itemRow) continue;

    const updateData: Record<string, any> = {
      updatedBy: actor,
      updatedAt: new Date(),
    };

    // 1. Simpan data bulanan jika ada
    if (itm.hasMonthlyData && itm.monthlyActuals && itm.monthlyActuals.length > 0) {
      const mActuals = [...itm.monthlyActuals];
      while (mActuals.length < 12) mActuals.push(null);
      updateData.monthlyActuals = mActuals;

      if (itm.monthlyTargets && itm.monthlyTargets.length > 0) {
        const mTargets = [...itm.monthlyTargets];
        while (mTargets.length < 12) mTargets.push(null);
        updateData.monthlyTargets = mTargets;
      }

      // Tulis transaksi bulanan ke appraisal_monthly_values
      for (let m = 1; m <= 12; m++) {
        const mVal = mActuals[m - 1];
        const [existingM] = await db
          .select({ id: appraisalMonthlyValues.id, status: appraisalMonthlyValues.status })
          .from(appraisalMonthlyValues)
          .where(
            and(
              eq(appraisalMonthlyValues.appraisalItemId, itm.appraisalItemId),
              eq(appraisalMonthlyValues.month, m)
            )
          )
          .limit(1);

        if (existingM) {
          await db
            .update(appraisalMonthlyValues)
            .set({
              actualValue: mVal !== null ? String(mVal) : null,
              status: existingM.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
              updatedBy: actor,
              updatedAt: new Date(),
            })
            .where(eq(appraisalMonthlyValues.id, existingM.id));
        } else if (mVal !== null) {
          await db.insert(appraisalMonthlyValues).values({
            appraisalItemId: itm.appraisalItemId,
            month: m,
            actualValue: String(mVal),
            status: "DRAFT",
            updatedBy: actor,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Hitung agregasi tahunan jika Kolom U tidak terisi
      const aggMethod = itemRow.parameter?.aggregation || "AVERAGE";
      const aggRes = aggregateMonthly(
        aggMethod as any,
        mActuals,
        itm.monthlyTargets || []
      );
      const computedAnnual =
        itm.annualActual !== null && itm.annualActual !== undefined
          ? itm.annualActual
          : aggRes.annualActual;
      updateData.annualActual = computedAnnual !== null ? String(computedAnnual) : null;
      updateData.actual = computedAnnual !== null ? String(computedAnnual) : null;
    } else if (itm.annualActual !== null && itm.annualActual !== undefined) {
      // Nilai tahunan langsung dari Kolom U
      const actStr = String(itm.annualActual);
      updateData.annualActual = actStr;
      updateData.actual = actStr;
    }

    // Simpan target bulanan jika ada tapi belum tersimpan
    if (itm.monthlyTargets && itm.monthlyTargets.length > 0 && !updateData.monthlyTargets) {
      const mTargets = [...itm.monthlyTargets];
      while (mTargets.length < 12) mTargets.push(null);
      updateData.monthlyTargets = mTargets;
    }

    // Simpan Target Tahunan langsung dari Excel (Kolom U baris Target)
    if (itm.annualTarget !== null && itm.annualTarget !== undefined) {
      const tgtStr = String(itm.annualTarget);
      updateData.target = tgtStr;
      updateData.targetSnapshot = tgtStr;
    }

    await db
      .update(appraisalItems)
      .set(updateData)
      .where(eq(appraisalItems.id, itm.appraisalItemId));
  }

  // 2. Rekalkulasi seluruh nilai & skor appraisal menggunakan engine eksisting
  await recalculateAppraisal(appraisalId);

  // 3. Catat audit log
  await recordAudit(
    "appraisal",
    appraisalId,
    "BATCH_UPLOAD_EXCEL",
    {
      fileName,
      totalItemsUpdated: items.length,
      updatedItemIds: items.map((it) => it.appraisalItemId),
    },
    actor
  );

  return {
    success: true,
    updatedCount: items.length,
  };
}

/**
 * Menyimpan seluruh nilai bulanan (Jan-Des) untuk satu indikator secara atomik dalam 1 transaksi/eksekusi.
 * Mencegah deadlock dan race condition dari pemanggilan Promise.all paralel 12 kali.
 */
export async function saveIndicatorMonthlyValues(params: {
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
  const { appraisalId, appraisalItemId, values, aggregationMethod, notes, actor = "penilai" } = params;

  const [itemRow] = await db
    .select({
      item: appraisalItems,
      parameter: kpiParameters,
    })
    .from(appraisalItems)
    .leftJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .where(
      and(
        eq(appraisalItems.id, appraisalItemId),
        eq(appraisalItems.appraisalId, appraisalId)
      )
    )
    .limit(1);

  if (!itemRow || !itemRow.item) {
    throw new Error("Indikator appraisal tidak ditemukan.");
  }

  const it = itemRow.item;
  const p = itemRow.parameter;

  // Siapkan array 12 bulan dari existing
  const mActuals: (number | null)[] = Array.isArray(it.monthlyActuals)
    ? [...it.monthlyActuals]
    : Array(12).fill(null);
  while (mActuals.length < 12) mActuals.push(null);

  const mTargets: (number | null)[] = Array.isArray(it.monthlyTargets)
    ? [...it.monthlyTargets]
    : Array(12).fill(null);
  while (mTargets.length < 12) mTargets.push(null);

  const mNotes: (string | null)[] = Array.isArray(it.monthlyNotes)
    ? [...it.monthlyNotes]
    : Array(12).fill(null);
  while (mNotes.length < 12) mNotes.push(null);

  let lastTargetVal: number | null = null;

  for (const v of values) {
    if (v.month >= 1 && v.month <= 12) {
      const idx = v.month - 1;
      mActuals[idx] = v.actualValue;
      if (v.target !== undefined && v.target !== null) {
        mTargets[idx] = v.target;
        lastTargetVal = v.target;
      }
      if (v.notes !== undefined) {
        mNotes[idx] = v.notes;
      }

      // Sync ke appraisalMonthlyValues
      const [existingM] = await db
        .select({ id: appraisalMonthlyValues.id, status: appraisalMonthlyValues.status })
        .from(appraisalMonthlyValues)
        .where(
          and(
            eq(appraisalMonthlyValues.appraisalItemId, appraisalItemId),
            eq(appraisalMonthlyValues.month, v.month)
          )
        )
        .limit(1);

      if (existingM) {
        await db
          .update(appraisalMonthlyValues)
          .set({
            actualValue: v.actualValue !== null ? String(v.actualValue) : null,
            notes: v.notes || null,
            status: existingM.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
            updatedBy: actor,
            updatedAt: new Date(),
          })
          .where(eq(appraisalMonthlyValues.id, existingM.id));
      } else if (v.actualValue !== null) {
        await db.insert(appraisalMonthlyValues).values({
          appraisalItemId,
          month: v.month,
          actualValue: String(v.actualValue),
          notes: v.notes || null,
          status: "DRAFT",
          updatedBy: actor,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  // Hitung agregasi tahunan
  const aggMethod = aggregationMethod || p?.aggregation || "AVERAGE";
  const validActuals = mActuals.filter((val): val is number => val !== null && val !== undefined);
  let computedAnnual: number | null = null;
  if (validActuals.length > 0) {
    if (aggMethod === "SUM") {
      computedAnnual = validActuals.reduce((a, b) => a + b, 0);
    } else if (aggMethod === "MIN") {
      computedAnnual = Math.min(...validActuals);
    } else if (aggMethod === "MAX") {
      computedAnnual = Math.max(...validActuals);
    } else if (aggMethod === "LAST_VALUE") {
      computedAnnual = validActuals[validActuals.length - 1];
    } else {
      computedAnnual = parseFloat((validActuals.reduce((a, b) => a + b, 0) / validActuals.length).toFixed(2));
    }
  }

  const updateData: Record<string, any> = {
    monthlyActuals: mActuals,
    monthlyTargets: mTargets,
    monthlyNotes: mNotes,
    annualActual: computedAnnual !== null ? String(computedAnnual) : null,
    actual: computedAnnual !== null ? String(computedAnnual) : null,
    updatedBy: actor,
    updatedAt: new Date(),
  };

  if (notes !== undefined) {
    updateData.qualitativeValue = notes;
  }

  if (lastTargetVal !== null) {
    const tgtStr = String(lastTargetVal);
    updateData.target = tgtStr;
    updateData.targetSnapshot = tgtStr;
  }

  await db
    .update(appraisalItems)
    .set(updateData)
    .where(eq(appraisalItems.id, appraisalItemId));

  await recordAudit(
    "appraisal_item",
    appraisalId,
    "UPDATE_MONTHLY_VALUES",
    { appraisalItemId, valuesCount: values.length, annualActual: computedAnnual, notes },
    actor
  );

  await recalculateAppraisal(appraisalId);

  return { success: true, appraisalItemId, annualActual: computedAnnual };
}
