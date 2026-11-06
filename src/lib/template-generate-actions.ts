"use server";

import { db } from "@/db";
import {
  departments,
  jobCategories,
  jobPositions,
  jobPositionMappings,
  jobLevels,
  employees,
  masterParameters,
  kpiTemplates,
  kpiCategories,
  kpiParameters,
  kpiBands,
  kpiPeriods,
  appraisals,
  appraisalItems,
  departmentHeads,
  auditLogs,
  type Department,
  type JobCategory,
  type KpiPeriod,
} from "@/db/schema";
import { and, eq, inArray, asc, desc, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { tenureMonths } from "./scoring";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-fatal outside Next.js request context
  }
}

async function audit(
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
      changes: changes ?? null,
      actor,
    });
  } catch {
    // Non-fatal if audit fails
  }
}

export interface GeneratePreviewEmployee {
  id: number;
  nik: string;
  name: string;
  jobPositionId: number | null;
  jobPositionName: string;
  jobLevelId: number;
  jobLevelName: string;
  operatingUnit: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  generatedTemplateName: string; // Format: Nama Karyawan - Departemen - Job Position
  hasExistingKpi: boolean;
  currentTemplateId: number | null;
  currentTemplateName: string | null;
  currentAppraisalId: number | null;
  currentAppraisalStatus: string | null;
}

export interface GeneratePreviewBand {
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  minValue: number | null;
  maxValue: number | null;
  score: number;
  sortOrder: number;
}

export interface GeneratePreviewParameter {
  id: number; // master_parameters.id
  code: string | null;
  name: string;
  description: string | null;
  categoryName: string;
  departmentId: number | null; // null = Corporate / Umum
  scope: string; // INDIVIDUAL | DEPARTMENT
  inputType: string;
  unit: string;
  target: string;
  weight: number; // bobot persen (0 - 100) dalam parameter utama
  scoringRules: GeneratePreviewBand[];
  isEnabled: boolean;
}

export interface GeneratePreviewCategory {
  parameterKey:
    | "TARGET_KERJA"
    | "KEHADIRAN_DISIPLIN"
    | "KESELAMATAN_KERJA"
    | "KEPATUHAN_SP"
    | "INOVASI_IMPROVEMENT";
  categoryName: string;
  categoryType: "SUB_ITEMS" | "DIRECT";
  hasSubIndicators: boolean;
  categoryWeight: number; // bobot persen (0 - 100)
  sortOrder: number;
  parameters: GeneratePreviewParameter[];
}

export interface GenerateTemplatePreviewData {
  department: Department;
  jobCategory: JobCategory;
  period: KpiPeriod;
  mappedPositionsCount: number;
  employees: GeneratePreviewEmployee[];
  categories: GeneratePreviewCategory[]; // 5 Parameter Utama Wajib
  allMasterParameters: GeneratePreviewParameter[]; // Seluruh indikator Kamus KPI untuk departemen ini + umum
  totalEmployees: number;
  employeesWithKpiCount: number;
  employeesWithoutKpiCount: number;
}

/**
 * Definisi 5 Parameter Utama Wajib sesuai standar KPI Perusahaan
 */
const MANDATORY_MAIN_PARAMETERS: Array<{
  parameterKey: GeneratePreviewCategory["parameterKey"];
  categoryName: string;
  categoryType: "SUB_ITEMS" | "DIRECT";
  hasSubIndicators: boolean;
  defaultWeight: number;
  sortOrder: number;
  aliases: string[];
}> = [
  {
    parameterKey: "TARGET_KERJA",
    categoryName: "Target Kerja",
    categoryType: "SUB_ITEMS",
    hasSubIndicators: true,
    defaultWeight: 65,
    sortOrder: 1,
    aliases: ["target kerja"],
  },
  {
    parameterKey: "KEHADIRAN_DISIPLIN",
    categoryName: "Kehadiran & Disiplin",
    categoryType: "DIRECT",
    hasSubIndicators: false,
    defaultWeight: 20,
    sortOrder: 2,
    aliases: ["kehadiran & disiplin", "kehadiran dan disiplin", "disiplin"],
  },
  {
    parameterKey: "KESELAMATAN_KERJA",
    categoryName: "Keselamatan Kerja",
    categoryType: "DIRECT",
    hasSubIndicators: false,
    defaultWeight: 10,
    sortOrder: 3,
    aliases: ["keselamatan kerja", "k3", "safety"],
  },
  {
    parameterKey: "KEPATUHAN_SP",
    categoryName: "Kepatuhan & SP",
    categoryType: "DIRECT",
    hasSubIndicators: false,
    defaultWeight: 10,
    sortOrder: 4,
    aliases: ["kepatuhan & sp", "kepatuhan dan sp", "surat peringatan"],
  },
  {
    parameterKey: "INOVASI_IMPROVEMENT",
    categoryName: "Inovasi & Improvement",
    categoryType: "DIRECT",
    hasSubIndicators: false,
    defaultWeight: 10,
    sortOrder: 5,
    aliases: [
      "inovasi & improvement",
      "inovasi dan improvement",
      "perilaku, inisiatif, inovasi, partisipasi  aktif dalam meeting",
      "kontribusi tambahan",
    ],
  },
];

function classifyMasterParamKey(
  rawCategoryName: string | null | undefined,
  paramName: string
): GeneratePreviewCategory["parameterKey"] {
  const catLower = (rawCategoryName || "").trim().toLowerCase();
  const nameLower = (paramName || "").trim().toLowerCase();

  for (const main of MANDATORY_MAIN_PARAMETERS) {
    if (main.aliases.includes(catLower)) {
      return main.parameterKey;
    }
  }

  if (nameLower.includes("kehadiran & disiplin") || nameLower === "kehadiran dan disiplin") {
    return "KEHADIRAN_DISIPLIN";
  }
  if (nameLower === "keselamatan kerja") {
    return "KESELAMATAN_KERJA";
  }
  if (nameLower.includes("kepatuhan") && nameLower.includes("sp")) {
    return "KEPATUHAN_SP";
  }
  if (nameLower.includes("inovasi") && nameLower.includes("improvement")) {
    return "INOVASI_IMPROVEMENT";
  }

  return "TARGET_KERJA";
}

function getDefaultScoringBandsForKey(
  parameterKey: GeneratePreviewCategory["parameterKey"]
): GeneratePreviewBand[] {
  if (parameterKey === "KEHADIRAN_DISIPLIN") {
    return [
      { label: "> 98%", operator: "GT", minValue: 98, maxValue: null, score: 25, sortOrder: 1 },
      { label: "95% - 98%", operator: "BETWEEN", minValue: 95, maxValue: 98, score: 15, sortOrder: 2 },
      { label: "< 95%", operator: "LT", minValue: null, maxValue: 95, score: 5, sortOrder: 3 },
    ];
  }
  if (parameterKey === "KESELAMATAN_KERJA") {
    return [
      { label: "Tidak terlibat unsafe act / nearmiss / accident", operator: "TEXT", minValue: null, maxValue: null, score: 20, sortOrder: 1 },
      { label: "Nearmiss / unsafe act", operator: "TEXT", minValue: null, maxValue: null, score: 15, sortOrder: 2 },
      { label: "Accident", operator: "TEXT", minValue: null, maxValue: null, score: 0, sortOrder: 3 },
    ];
  }
  if (parameterKey === "KEPATUHAN_SP") {
    return [
      { label: "Tidak ada SP / Pelanggaran Etika", operator: "TEXT", minValue: null, maxValue: null, score: 15, sortOrder: 1 },
      { label: "SP 1 Aktif", operator: "TEXT", minValue: null, maxValue: null, score: 10, sortOrder: 2 },
      { label: "SP 2 Aktif", operator: "TEXT", minValue: null, maxValue: null, score: 5, sortOrder: 3 },
      { label: "SP 3 Aktif", operator: "TEXT", minValue: null, maxValue: null, score: 0, sortOrder: 4 },
    ];
  }
  if (parameterKey === "INOVASI_IMPROVEMENT") {
    return [
      { label: ">= 2 Improvement", operator: "GTE", minValue: 2, maxValue: null, score: 15, sortOrder: 1 },
      { label: "1 Improvement", operator: "EQ", minValue: 1, maxValue: null, score: 10, sortOrder: 2 },
      { label: "Tidak ada Improvement", operator: "TEXT", minValue: null, maxValue: null, score: 5, sortOrder: 3 },
    ];
  }
  return [
    { label: ">= 100%", operator: "GTE", minValue: 100, maxValue: null, score: 25, sortOrder: 1 },
    { label: "85% - 99%", operator: "BETWEEN", minValue: 85, maxValue: 99, score: 15, sortOrder: 2 },
    { label: "< 85%", operator: "LT", minValue: null, maxValue: 85, score: 5, sortOrder: 3 },
  ];
}

function normalizeScoringBand(
  raw: {
    label?: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
    score?: number;
  },
  idx: number
): GeneratePreviewBand {
  const rawLabel = (raw.label || "").trim();
  let op = (raw.operator as GeneratePreviewBand["operator"]) || "TEXT";
  let minVal = raw.minValue !== undefined ? raw.minValue : null;
  let maxVal = raw.maxValue !== undefined ? raw.maxValue : null;

  if (op === "TEXT" || (minVal === null && maxVal === null)) {
    const gteM = rawLabel.match(/(?:>=|≥|=>)\s*([0-9]+(?:[.,][0-9]+)?)/);
    const gtM = !gteM ? rawLabel.match(/(?:>|di\s+atas|lebih\s+dari)\s*([0-9]+(?:[.,][0-9]+)?)/i) : null;
    const lteM = rawLabel.match(/(?:<=|≤|=<)\s*([0-9]+(?:[.,][0-9]+)?)/);
    const ltM = !lteM ? rawLabel.match(/(?:<|di\s+bawah|kurang\s+dari)\s*([0-9]+(?:[.,][0-9]+)?)/i) : null;
    const rangeM = rawLabel.match(/([0-9]+(?:[.,][0-9]+)?)\s*%?\s*(?:-|–|s\/d)\s*([0-9]+(?:[.,][0-9]+)?)/i);

    if (rangeM) {
      op = "BETWEEN";
      minVal = parseFloat(rangeM[1].replace(",", "."));
      maxVal = parseFloat(rangeM[2].replace(",", "."));
    } else if (gteM) {
      op = "GTE";
      minVal = parseFloat(gteM[1].replace(",", "."));
      maxVal = null;
    } else if (gtM) {
      op = "GT";
      minVal = parseFloat(gtM[1].replace(",", "."));
      maxVal = null;
    } else if (lteM) {
      op = "LTE";
      minVal = null;
      maxVal = parseFloat(lteM[1].replace(",", "."));
    } else if (ltM) {
      op = "LT";
      minVal = null;
      maxVal = parseFloat(ltM[1].replace(",", "."));
    }
  }

  return {
    label: rawLabel,
    operator: op,
    minValue: minVal,
    maxValue: maxVal,
    score: Number(raw.score) || 0,
    sortOrder: idx + 1,
  };
}

/**
 * 1. Ambil data review untuk Generate Template KPI:
 *    - Posisi & karyawan aktif hasil mapping (Departemen + Job Category)
 *    - 5 Parameter Utama wajib beserta indikator dari Kamus Parameter KPI
 *    - Deteksi status KPI existing per karyawan pada periode terpilih
 */
export async function getGenerateTemplatePreviewAction(params: {
  departmentId: number;
  jobCategoryId: number;
  periodId?: number;
}): Promise<{ success: boolean; data?: GenerateTemplatePreviewData; error?: string }> {
  try {
    const { departmentId, jobCategoryId } = params;

    if (!departmentId) return { success: false, error: "Pilih Departemen terlebih dahulu." };
    if (!jobCategoryId) return { success: false, error: "Pilih Job Category terlebih dahulu." };

    const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
    if (!dept) return { success: false, error: "Departemen tidak ditemukan." };

    const [cat] = await db.select().from(jobCategories).where(eq(jobCategories.id, jobCategoryId));
    if (!cat) return { success: false, error: "Job Category tidak ditemukan." };

    let targetPeriod: KpiPeriod | undefined;
    if (params.periodId) {
      const [p] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, params.periodId));
      targetPeriod = p;
    }
    if (!targetPeriod) {
      const [activeP] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.status, "ACTIVE"));
      targetPeriod = activeP || (await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)).limit(1))[0];
    }
    if (!targetPeriod) return { success: false, error: "Tidak ditemukan Periode KPI aktif." };

    // Ambil posisi dalam Departemen yang dipetakan ke Job Category ini
    const mappedPositions = await db
      .select({
        positionId: jobPositionMappings.jobPositionId,
        jobLevelId: jobPositionMappings.jobLevelId,
      })
      .from(jobPositionMappings)
      .where(
        and(
          eq(jobPositionMappings.departmentId, departmentId),
          eq(jobPositionMappings.jobCategoryId, jobCategoryId)
        )
      );

    const mappedPositionIds = mappedPositions.map((m) => m.positionId);

    const positionDetails =
      mappedPositionIds.length > 0
        ? await db.select().from(jobPositions).where(inArray(jobPositions.id, mappedPositionIds))
        : [];
    const positionNamesLower = new Set(positionDetails.map((p) => p.name.toLowerCase().trim()));

    // Ambil karyawan aktif di departemen ini beserta status appraisal & template individual
    const [allDeptEmployees, allJobLevels, existingAppraisals, allTemplates] = await Promise.all([
      db
        .select()
        .from(employees)
        .where(and(eq(employees.departmentId, departmentId), eq(employees.isActive, true)))
        .orderBy(asc(employees.name)),
      db.select().from(jobLevels),
      db
        .select({
          id: appraisals.id,
          employeeId: appraisals.employeeId,
          templateId: appraisals.templateId,
          status: appraisals.status,
          periodId: appraisals.periodId,
        })
        .from(appraisals)
        .where(eq(appraisals.periodId, targetPeriod.id)),
      db
        .select({
          id: kpiTemplates.id,
          name: kpiTemplates.name,
          employeeId: kpiTemplates.employeeId,
          periodId: kpiTemplates.periodId,
        })
        .from(kpiTemplates),
    ]);

    const levelMap = new Map(allJobLevels.map((l) => [l.id, l]));
    const appraisalMap = new Map(existingAppraisals.map((a) => [a.employeeId, a]));
    const templateNameMap = new Map(allTemplates.map((t) => [t.id, t.name]));
    const employeePersonalTplMap = new Map<number, { id: number; name: string }>();
    for (const t of allTemplates) {
      if (t.employeeId && (!t.periodId || t.periodId === targetPeriod.id)) {
        employeePersonalTplMap.set(t.employeeId, { id: t.id, name: t.name });
      }
    }

    const matchingEmployees: GeneratePreviewEmployee[] = [];

    for (const emp of allDeptEmployees) {
      let isMatch = false;
      let matchedPosName = emp.jobPosition || "";
      let matchedPosId = emp.jobPositionId ?? null;

      if (emp.jobPositionId && mappedPositionIds.includes(emp.jobPositionId)) {
        isMatch = true;
        const pObj = positionDetails.find((p) => p.id === emp.jobPositionId);
        if (pObj) matchedPosName = pObj.name;
      } else if (emp.jobPosition && positionNamesLower.has(emp.jobPosition.toLowerCase().trim())) {
        isMatch = true;
        const pObj = positionDetails.find(
          (p) => p.name.toLowerCase().trim() === emp.jobPosition.toLowerCase().trim()
        );
        if (pObj) {
          matchedPosName = pObj.name;
          matchedPosId = pObj.id;
        }
      }

      if (isMatch) {
        const currentApp = appraisalMap.get(emp.id);
        const personalTpl = employeePersonalTplMap.get(emp.id);
        const lvl = levelMap.get(emp.jobLevelId);
        const finalPosName = matchedPosName || cat.name;
        const generatedTemplateName = `${emp.name} - ${dept.name} - ${finalPosName}`;

        const currentTemplateId = currentApp?.templateId ?? personalTpl?.id ?? null;
        const currentTemplateName = currentTemplateId
          ? templateNameMap.get(currentTemplateId) || personalTpl?.name || null
          : null;

        matchingEmployees.push({
          id: emp.id,
          nik: emp.nik,
          name: emp.name,
          jobPositionId: matchedPosId,
          jobPositionName: finalPosName,
          jobLevelId: emp.jobLevelId,
          jobLevelName: lvl?.name || "Staff",
          operatingUnit: emp.operatingUnit || "HO",
          departmentId: emp.departmentId,
          departmentCode: dept.code,
          departmentName: dept.name,
          generatedTemplateName,
          hasExistingKpi: Boolean(currentApp?.templateId || personalTpl),
          currentTemplateId,
          currentTemplateName,
          currentAppraisalId: currentApp?.id ?? null,
          currentAppraisalStatus: currentApp?.status ?? null,
        });
      }
    }

    // Ambil seluruh indikator dari Kamus Parameter KPI (master_parameters) untuk Departemen ini + Corporate (NULL)
    const rawParams = await db
      .select()
      .from(masterParameters)
      .where(
        and(
          or(eq(masterParameters.departmentId, departmentId), isNull(masterParameters.departmentId)),
          eq(masterParameters.isActive, true)
        )
      )
      .orderBy(asc(masterParameters.departmentId), asc(masterParameters.code), asc(masterParameters.name));

    const groupedByKey = new Map<
      GeneratePreviewCategory["parameterKey"],
      GeneratePreviewParameter[]
    >();
    for (const main of MANDATORY_MAIN_PARAMETERS) {
      groupedByKey.set(main.parameterKey, []);
    }

    const allMasterParameters: GeneratePreviewParameter[] = [];

    for (const p of rawParams) {
      const pKey = classifyMasterParamKey(p.categoryName, p.name);
      const mainDef = MANDATORY_MAIN_PARAMETERS.find((m) => m.parameterKey === pKey)!;
      const list = groupedByKey.get(pKey)!;

      const rawBands = Array.isArray(p.defaultBands) && p.defaultBands.length > 0
        ? p.defaultBands.map((b, idx) => normalizeScoringBand(b, idx))
        : getDefaultScoringBandsForKey(pKey);

      const paramItem: GeneratePreviewParameter = {
        id: p.id,
        code: p.code || null,
        name: p.name,
        description: p.description || null,
        categoryName: mainDef.categoryName,
        departmentId: p.departmentId ?? null,
        scope: p.scope || "INDIVIDUAL",
        inputType: p.inputType || "PERCENTAGE",
        unit: p.unit || "%",
        target: p.target && p.target.trim() !== "" ? p.target : "100%",
        weight: p.weight ? Math.round(Number(p.weight) * 100 * 10) / 10 : 0,
        scoringRules: rawBands,
        isEnabled: false, // Akan diaktifkan secara cerdas di bawah
      };

      list.push(paramItem);
      allMasterParameters.push(paramItem);
    }

    // Susun 5 Parameter Utama Wajib
    const categories: GeneratePreviewCategory[] = MANDATORY_MAIN_PARAMETERS.map((mainDef) => {
      const candidates = groupedByKey.get(mainDef.parameterKey) || [];

      if (mainDef.hasSubIndicators) {
        // Parameter 1: Target Kerja (Memiliki Sub Indikator)
        // Aktifkan sub-indikator milik departemen terlebih dahulu (maksimal 5 default pertama agar rapi, sisanya tetap tampil di kamus untuk dipilih Admin)
        const deptSpecific = candidates.filter((c) => c.departmentId === departmentId);
        const toEnableIds = new Set(
          (deptSpecific.length > 0 ? deptSpecific.slice(0, 5) : candidates.slice(0, 3)).map((c) => c.id)
        );

        const enabledCount = toEnableIds.size || 1;
        const evenWeight = Math.round((100 / enabledCount) * 10) / 10;

        let enabledIdx = 0;
        const finalizedParams = candidates.map((item) => {
          const enabled = toEnableIds.has(item.id);
          let w = item.weight;
          if (enabled) {
            if (enabledIdx === enabledCount - 1) {
              w = Math.round((100 - evenWeight * (enabledCount - 1)) * 10) / 10;
            } else {
              w = evenWeight;
            }
            enabledIdx++;
          } else {
            w = 0;
          }
          return {
            ...item,
            isEnabled: enabled,
            weight: w,
          };
        });

        return {
          parameterKey: mainDef.parameterKey,
          categoryName: mainDef.categoryName,
          categoryType: mainDef.categoryType,
          hasSubIndicators: true,
          categoryWeight: mainDef.defaultWeight,
          sortOrder: mainDef.sortOrder,
          parameters: finalizedParams,
        };
      } else {
        // Parameter 2..5: Indikator Penilaian Langsung (DIRECT)
        // Utamakan indikator spesifik departemen jika ada, jika tidak gunakan indikator Corporate
        const deptSpecific = candidates.filter((c) => c.departmentId === departmentId);
        const primaryIndicator = deptSpecific[0] || candidates[0];

        const finalizedParams = candidates.map((item) => {
          const isPrimary = primaryIndicator ? item.id === primaryIndicator.id : false;
          return {
            ...item,
            isEnabled: isPrimary,
            weight: isPrimary ? 100 : 0,
          };
        });

        // Fallback aman jika kamus kosong untuk kategori ini
        if (finalizedParams.length === 0) {
          finalizedParams.push({
            id: -mainDef.sortOrder,
            code: `DEF-0${mainDef.sortOrder}`,
            name: mainDef.categoryName,
            description: `Penilaian langsung ${mainDef.categoryName}`,
            categoryName: mainDef.categoryName,
            departmentId: null,
            scope: "INDIVIDUAL",
            inputType: "PERCENTAGE",
            unit: "%",
            target: "100%",
            weight: 100,
            scoringRules: getDefaultScoringBandsForKey(mainDef.parameterKey),
            isEnabled: true,
          });
        }

        return {
          parameterKey: mainDef.parameterKey,
          categoryName: mainDef.categoryName,
          categoryType: mainDef.categoryType,
          hasSubIndicators: false,
          categoryWeight: mainDef.defaultWeight,
          sortOrder: mainDef.sortOrder,
          parameters: finalizedParams,
        };
      }
    });

    const employeesWithKpiCount = matchingEmployees.filter((e) => e.hasExistingKpi).length;

    return {
      success: true,
      data: {
        department: dept,
        jobCategory: cat,
        period: targetPeriod,
        mappedPositionsCount: mappedPositionIds.length,
        employees: matchingEmployees,
        categories,
        allMasterParameters,
        totalEmployees: matchingEmployees.length,
        employeesWithKpiCount,
        employeesWithoutKpiCount: matchingEmployees.length - employeesWithKpiCount,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export interface EmployeeGenerateResult {
  employeeId: number;
  nik: string;
  name: string;
  jobPositionName: string;
  templateId: number | null;
  templateName: string;
  appraisalId: number | null;
  status: "SUCCESS" | "UPDATED" | "SKIPPED" | "FAILED";
  message: string;
}

export type CategoryGeneratePayloadItem = {
  name: string;
  categoryType: "SUB_ITEMS" | "DIRECT";
  weight: number; // e.g. 55 = 55% (0.55)
  sortOrder: number;
  parameters: Array<{
    masterParameterId?: number | null;
    name: string;
    description?: string | null;
    target: string | null;
    unit: string | null;
    weight: number; // e.g. 20 = 20% (0.20)
    maxScore?: number;
    scope?: string;
    inputType?: string;
    scoringRules: Array<{
      label: string;
      operator: string;
      minValue: number | null;
      maxValue: number | null;
      score: number;
      sortOrder: number;
    }>;
  }>;
};

export interface ExecuteGenerateTemplatePayload {
  departmentId: number;
  jobCategoryId: number;
  periodId: number;
  duplicateHandling: "SKIP_EXISTING" | "UPDATE_EXISTING";
  assignedEmployeeIds: number[];
  categories: CategoryGeneratePayloadItem[];
  employeeCategoriesOverride?: Record<number, CategoryGeneratePayloadItem[]>;
}

/**
 * 2. Eksekusi Simpan & Generate KPI Karyawan (Semua Karyawan atau Per Karyawan):
 *    - Membuat Template KPI Individual untuk setiap karyawan dengan format:
 *      `Nama Karyawan - Departemen - Job Position`
 *    - Menyimpan 5 Parameter Utama beserta Indikator / Sub Indikator, Target, Satuan, Bobot, dan Kriteria Penilaian
 *    - Membuat / menyinkronkan data Penilaian (Appraisal & Appraisal Items) secara individual untuk masing-masing karyawan
 *    - Mencegah duplikasi KPI berdasarkan karyawan, periode, dan jenis evaluasi
 *    - Mengembalikan status Berhasil / Gagal untuk setiap karyawan
 */
export async function executeGenerateTemplateAction(
  payload: ExecuteGenerateTemplatePayload
): Promise<{
  success: boolean;
  results?: EmployeeGenerateResult[];
  successCount?: number;
  skippedCount?: number;
  failedCount?: number;
  error?: string;
}> {
  try {
    const {
      departmentId,
      jobCategoryId,
      periodId,
      duplicateHandling = "UPDATE_EXISTING",
      assignedEmployeeIds,
      categories,
    } = payload;

    if (!departmentId) return { success: false, error: "Departemen wajib dipilih." };
    if (!jobCategoryId) return { success: false, error: "Job Category wajib dipilih." };
    if (!periodId) return { success: false, error: "Periode KPI wajib dipilih." };
    if (!assignedEmployeeIds || assignedEmployeeIds.length === 0) {
      return { success: false, error: "Pilih minimal 1 karyawan untuk digenerate KPI-nya." };
    }
    if (!categories || categories.length === 0) {
      return { success: false, error: "Struktur 5 Parameter KPI wajib diisi." };
    }

    // Validasi setiap Parameter utama memiliki minimal 1 indikator aktif & total bobot = 115%
    let defaultTotalWeightPct = 0;
    for (const c of categories) {
      if (!c.parameters || c.parameters.length === 0) {
        return {
          success: false,
          error: `Parameter "${c.name}" belum memiliki indikator terpilih dari Kamus KPI.`,
        };
      }
      defaultTotalWeightPct += Number(c.weight) || 0;
    }
    if (Math.abs(defaultTotalWeightPct - 115) > 0.5) {
      return {
        success: false,
        error: `Total bobot 5 Parameter KPI wajib 115% (saat ini: ${Math.round(defaultTotalWeightPct * 10) / 10}%).`,
      };
    }

    const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
    const [cat] = await db.select().from(jobCategories).where(eq(jobCategories.id, jobCategoryId));
    const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId));

    if (!dept || !cat || !period) {
      return { success: false, error: "Data Departemen, Job Category, atau Periode tidak ditemukan." };
    }

    const selectedEmployees = await db
      .select()
      .from(employees)
      .where(inArray(employees.id, assignedEmployeeIds))
      .orderBy(asc(employees.name));

    if (selectedEmployees.length === 0) {
      return { success: false, error: "Data karyawan terpilih tidak ditemukan." };
    }

    // Ambil detail nama posisi dan head department
    const [allPositions, allDeptHeads] = await Promise.all([
      db.select().from(jobPositions).where(eq(jobPositions.departmentId, departmentId)),
      db
        .select({
          departmentId: departmentHeads.departmentId,
          operatingUnit: departmentHeads.operatingUnit,
          employeeId: departmentHeads.employeeId,
        })
        .from(departmentHeads)
        .where(eq(departmentHeads.status, "Active")),
    ]);

    const posByIdMap = new Map(allPositions.map((p) => [p.id, p]));
    const posByNameMap = new Map(allPositions.map((p) => [p.name.toLowerCase().trim(), p]));

    const deptHeadMap = new Map<string, number>();
    for (const dh of allDeptHeads) {
      const ouKey = (dh.operatingUnit || "HO").trim().toUpperCase();
      deptHeadMap.set(`${dh.departmentId}_${ouKey}`, dh.employeeId);
    }

    const results: EmployeeGenerateResult[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const emp of selectedEmployees) {
      const empCategories =
        payload.employeeCategoriesOverride && payload.employeeCategoriesOverride[emp.id]
          ? payload.employeeCategoriesOverride[emp.id]
          : categories;
      const empTotalWeightNum = empCategories.reduce(
        (acc, c) => acc + (Number(c.weight) || 0) / 100,
        0
      );
      const totalWeightStr = empTotalWeightNum.toFixed(4);

      const posObj =
        (emp.jobPositionId ? posByIdMap.get(emp.jobPositionId) : undefined) ||
        (emp.jobPosition ? posByNameMap.get(emp.jobPosition.toLowerCase().trim()) : undefined);

      const resolvedJobPositionId = posObj?.id ?? emp.jobPositionId ?? null;
      const resolvedJobPositionName = posObj?.name || emp.jobPosition || cat.name;

      // Format wajib: Nama Karyawan - Departemen - Job Position
      const individualTemplateName = `${emp.name} - ${dept.name} - ${resolvedJobPositionName}`;

      try {
        // 1. Cek apakah karyawan sudah memiliki Appraisal / Template KPI individual pada periode ini
        const [existingAppraisal] = await db
          .select()
          .from(appraisals)
          .where(and(eq(appraisals.employeeId, emp.id), eq(appraisals.periodId, periodId)));

        const existingPersonalTemplates = await db
          .select()
          .from(kpiTemplates)
          .where(and(eq(kpiTemplates.employeeId, emp.id), eq(kpiTemplates.departmentId, departmentId)))
          .orderBy(desc(kpiTemplates.id));

        const existingPersonalTpl =
          existingPersonalTemplates.find((t) => t.periodId === periodId) ||
          existingPersonalTemplates[0] ||
          null;

        const hasExisting = Boolean(existingAppraisal || existingPersonalTpl);

        // Validasi Pencegahan Duplikasi
        if (hasExisting && duplicateHandling === "SKIP_EXISTING") {
          skippedCount++;
          results.push({
            employeeId: emp.id,
            nik: emp.nik,
            name: emp.name,
            jobPositionName: resolvedJobPositionName,
            templateId: existingAppraisal?.templateId ?? existingPersonalTpl?.id ?? null,
            templateName: individualTemplateName,
            appraisalId: existingAppraisal?.id ?? null,
            status: "SKIPPED",
            message: "Dilewati: Karyawan sudah memiliki KPI aktif pada periode ini.",
          });
          continue;
        }

        // Lindungi penilaian yang sudah berstatus FINAL agar tidak tertimpa
        if (existingAppraisal && existingAppraisal.status === "FINAL") {
          failedCount++;
          results.push({
            employeeId: emp.id,
            nik: emp.nik,
            name: emp.name,
            jobPositionName: resolvedJobPositionName,
            templateId: existingAppraisal.templateId ?? null,
            templateName: individualTemplateName,
            appraisalId: existingAppraisal.id,
            status: "FAILED",
            message: "Gagal: Penilaian KPI karyawan sudah berstatus FINAL dan terkunci.",
          });
          continue;
        }

        // 2. Buat atau Perbarui Template KPI Individual untuk karyawan ini
        let employeeTemplateId: number;
        let isUpdated = false;

        if (existingPersonalTpl) {
          employeeTemplateId = existingPersonalTpl.id;
          isUpdated = true;

          await db
            .update(kpiTemplates)
            .set({
              name: individualTemplateName,
              departmentId,
              jobLevelId: emp.jobLevelId,
              jobPositionId: resolvedJobPositionId,
              jobCategoryId,
              periodId,
              employeeId: emp.id,
              isCustom: true,
              isActive: true,
              totalWeight: totalWeightStr,
              description: `KPI Individual - ${emp.name} (${dept.name} / ${cat.name} / ${resolvedJobPositionName})`,
              updatedAt: new Date(),
            })
            .where(eq(kpiTemplates.id, employeeTemplateId));

          // Hapus kategori lama pada template individual karyawan ini sebelum insert struktur terbaru
          await db.delete(kpiCategories).where(eq(kpiCategories.templateId, employeeTemplateId));
        } else {
          const nikSuffix = emp.nik.replace(/[^0-9A-Za-z]/g, "").slice(-4) || String(emp.id);
          const generatedCode = `TPL-${dept.code}-${nikSuffix}-${Math.floor(1000 + Math.random() * 9000)}`;

          const [newTpl] = await db
            .insert(kpiTemplates)
            .values({
              code: generatedCode,
              name: individualTemplateName,
              departmentId,
              jobLevelId: emp.jobLevelId,
              jobPositionId: resolvedJobPositionId,
              jobCategoryId,
              periodId,
              employeeId: emp.id,
              isCustom: true,
              isActive: true,
              version: 1,
              totalWeight: totalWeightStr,
              description: `KPI Individual - ${emp.name} (${dept.name} / ${cat.name} / ${resolvedJobPositionName})`,
            })
            .returning();

          employeeTemplateId = newTpl.id;
        }

        // 3. Simpan 5 Parameter Utama (kpi_categories), Indikator (kpi_parameters), dan Kriteria Penilaian (kpi_bands)
        const insertedParamsForEmployee: Array<{
          id: number;
          categoryId: number;
          masterParameterId: number | null;
          name: string;
          description: string | null;
          target: string | null;
          unit: string | null;
          weight: string;
          categoryWeight: string;
          scoringRules: Array<{
            label: string;
            operator: string;
            minValue: number | null;
            maxValue: number | null;
            score: number;
          }>;
        }> = [];

        for (let cIdx = 0; cIdx < empCategories.length; cIdx++) {
          const c = empCategories[cIdx];
          const catWeightDecimal = (Number(c.weight) / 100).toFixed(4);

          const [insertedCat] = await db
            .insert(kpiCategories)
            .values({
              templateId: employeeTemplateId,
              name: c.name,
              weight: catWeightDecimal,
              categoryType: c.categoryType || (cIdx === 0 ? "SUB_ITEMS" : "DIRECT"),
              sortOrder: c.sortOrder || cIdx + 1,
            })
            .returning();

          for (let pIdx = 0; pIdx < c.parameters.length; pIdx++) {
            const p = c.parameters[pIdx];
            const paramWeightDecimal = (Number(p.weight) / 100).toFixed(4);
            const validMasterParamId =
              p.masterParameterId && p.masterParameterId > 0 ? p.masterParameterId : null;

            const validInputType = [
              "PERCENTAGE",
              "NUMBER",
              "CURRENCY",
              "MONTHLY_ACTUAL",
              "QUALITATIVE",
            ].includes(String(p.inputType))
              ? (p.inputType as "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE")
              : "PERCENTAGE";

            const maxBandScore =
              p.scoringRules && p.scoringRules.length > 0
                ? Math.max(...p.scoringRules.map((b) => Number(b.score) || 0), 20)
                : Number(p.maxScore) || 25;

            const [insertedParam] = await db
              .insert(kpiParameters)
              .values({
                categoryId: insertedCat.id,
                name: p.name,
                description: p.description || null,
                weight: paramWeightDecimal,
                target: p.target || null,
                unit: p.unit || null,
                inputType: validInputType,
                maxScore: String(maxBandScore),
                scope: (p.scope as "INDIVIDUAL" | "DEPARTMENT") || "INDIVIDUAL",
                masterParameterId: validMasterParamId,
                sortOrder: pIdx + 1,
              })
              .returning();

            const bandsToInsert = (p.scoringRules || []).map((b, bIdx) => ({
              parameterId: insertedParam.id,
              label: b.label || "-",
              operator: (b.operator as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT") || "EQ",
              minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
              maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
              score: String(b.score ?? 0),
              sortOrder: b.sortOrder || bIdx + 1,
            }));

            if (bandsToInsert.length > 0) {
              await db.insert(kpiBands).values(bandsToInsert);
            }

            insertedParamsForEmployee.push({
              id: insertedParam.id,
              categoryId: insertedCat.id,
              masterParameterId: validMasterParamId,
              name: p.name,
              description: p.description || null,
              target: p.target || null,
              unit: p.unit || null,
              weight: paramWeightDecimal,
              categoryWeight: catWeightDecimal,
              scoringRules: bandsToInsert.map((b) => ({
                label: b.label,
                operator: b.operator,
                minValue: b.minValue !== null ? Number(b.minValue) : null,
                maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
                score: Number(b.score),
              })),
            });
          }
        }

        // 4. Buat / Sinkronkan Penilaian (Appraisal & Appraisal Items) Individual Karyawan
        const tenure = tenureMonths(emp.dateOfHire, period.evaluationDate);
        const eligible = tenure >= period.minTenureMonths;
        const empOU = (emp.operatingUnit || "HO").trim().toUpperCase();
        const headDeptId = deptHeadMap.get(`${emp.departmentId}_${empOU}`) || emp.headDeptId || null;

        let appraisalId: number;
        const oldItemByNameMap = new Map<string, typeof appraisalItems.$inferSelect>();

        if (existingAppraisal) {
          isUpdated = true;
          appraisalId = existingAppraisal.id;

          // Simpan nilai realisasi lama jika indikator sama agar progres penilaian karyawan tidak hilang
          const prevItems = await db
            .select()
            .from(appraisalItems)
            .where(eq(appraisalItems.appraisalId, appraisalId));
          for (const prev of prevItems) {
            if (prev.indicatorNameSnapshot) {
              oldItemByNameMap.set(prev.indicatorNameSnapshot.toLowerCase().trim(), prev);
            }
          }

          await db
            .update(appraisals)
            .set({
              templateId: employeeTemplateId,
              appraiserId: emp.appraiserId ?? null,
              headDeptId: headDeptId ?? null,
              tenureMonths: tenure,
              isEligible: eligible,
              updatedAt: new Date(),
            })
            .where(eq(appraisals.id, appraisalId));

          await db.delete(appraisalItems).where(eq(appraisalItems.appraisalId, appraisalId));
        } else {
          const [insertedApp] = await db
            .insert(appraisals)
            .values({
              periodId,
              employeeId: emp.id,
              templateId: employeeTemplateId,
              appraiserId: emp.appraiserId ?? null,
              headDeptId: headDeptId ?? null,
              tenureMonths: tenure,
              isEligible: eligible,
              status: "DRAFT",
            })
            .returning();

          appraisalId = insertedApp.id;
        }

        if (insertedParamsForEmployee.length > 0) {
          await db.insert(appraisalItems).values(
            insertedParamsForEmployee.map((p) => {
              const prev = oldItemByNameMap.get(p.name.toLowerCase().trim());
              const numericTarget =
                p.target !== null && !isNaN(Number(p.target.replace("%", "").trim()))
                  ? Number(p.target.replace("%", "").trim())
                  : null;

              return {
                appraisalId,
                parameterId: p.id,
                indicatorNameSnapshot: p.name,
                indicatorDescriptionSnapshot: p.description,
                target: p.target,
                targetSnapshot: p.target,
                unitSnapshot: p.unit,
                weightSnapshot: p.weight,
                parameterWeightSnapshot: p.categoryWeight,
                scoringRulesSnapshot: p.scoringRules,
                monthlyTargets:
                  prev?.monthlyTargets ?? (numericTarget !== null ? Array(12).fill(numericTarget) : null),
                actual: prev?.actual ?? null,
                monthlyActuals: prev?.monthlyActuals ?? null,
                monthlyNotes: prev?.monthlyNotes ?? null,
                qualitativeValue: prev?.qualitativeValue ?? null,
                annualActual: prev?.annualActual ?? null,
                achievement: prev?.achievement ?? null,
                bandLabel: prev?.bandLabel ?? null,
                score: prev?.score ?? null,
                weightedScore: prev?.weightedScore ?? null,
              };
            })
          );
        }

        successCount++;
        results.push({
          employeeId: emp.id,
          nik: emp.nik,
          name: emp.name,
          jobPositionName: resolvedJobPositionName,
          templateId: employeeTemplateId,
          templateName: individualTemplateName,
          appraisalId,
          status: isUpdated ? "UPDATED" : "SUCCESS",
          message: isUpdated
            ? "Berhasil diperbarui: KPI individual karyawan telah disinkronkan."
            : "Berhasil dibuat: KPI individual karyawan telah digenerate.",
        });
      } catch (empErr: unknown) {
        failedCount++;
        const errMsg = empErr instanceof Error ? empErr.message : String(empErr);
        results.push({
          employeeId: emp.id,
          nik: emp.nik,
          name: emp.name,
          jobPositionName: resolvedJobPositionName,
          templateId: null,
          templateName: individualTemplateName,
          appraisalId: null,
          status: "FAILED",
          message: `Gagal: ${errMsg}`,
        });
      }
    }

    await audit("kpi_templates", null, "GENERATE_INDIVIDUAL_KPI_TEMPLATES", {
      departmentId,
      jobCategoryId,
      periodId,
      totalProcessed: selectedEmployees.length,
      successCount,
      skippedCount,
      failedCount,
    });

    safeRevalidate("/setup/templates");
    safeRevalidate("/setup/assignments");
    safeRevalidate("/dashboard");

    return {
      success: true,
      results,
      successCount,
      skippedCount,
      failedCount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
