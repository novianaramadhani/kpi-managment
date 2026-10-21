import * as XLSX from "xlsx";
import {
  calculateKpiScore,
  calculateDynamicRealization,
  aggregateMonthly,
  normalizeWeight,
  type GenericScoringRule,
  type KpiScoreResult,
} from "./scoring";

// ============================================================================
// TYPES & DATA STRUCTURES
// ============================================================================

export interface ExcelParsedBlock {
  rawTitle: string;
  monthlyTargets: (number | null)[];
  monthlyActuals: (number | null)[];
  annualTarget: number | null;
  annualActual: number | null;
  excelPercentageText?: string;
  hasMonthlyData: boolean;
  warningNotes: string[];
  rowNumber: number;
}

export interface IndicatorMatchingTarget {
  appraisalItemId: number;
  parameterId: number | null;
  name: string;
  categoryName?: string;
  target?: number | string | null;
  unit?: string | null;
  inputType?: string;
  aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO" | string;
  compareBasis?: "ACTUAL" | "ACHIEVEMENT" | string;
  direction?: string | null;
  measurementType?: string | null;
  indicatorWeight: number | string;
  parameterWeight: number | string;
  maxScore: number;
  scoringRules: GenericScoringRule[];
  currentActual?: number | null;
  currentAnnualActual?: number | null;
  currentScore?: number | null;
}

export interface BatchPreviewItem {
  key: string;
  rawTitle: string;
  excelRowNumber: number;
  selectedAppraisalItemId: number | null;
  matchedIndicator: IndicatorMatchingTarget | null;
  matchType: "EXACT" | "ALIAS" | "FUZZY" | "UNMATCHED";
  confidence: number;
  warningNotes: string[];

  // Excel extracted data
  excelAnnualTarget: number | null;
  excelAnnualActual: number | null;
  excelMonthlyActuals: (number | null)[];
  excelMonthlyTargets: (number | null)[];
  excelPercentageText?: string;
  hasMonthlyData: boolean;

  // Evaluated result using existing scoring logic
  effectiveTarget: number | null;
  targetDisplay: string;
  effectiveRealization: number | null;
  realizationDisplay: string;
  realizationPct: number | null;
  realizationPctDisplay: string;
  score: number | null;
  bandLabel: string | null;
  weightedScoreFraction: number;
  weightedScorePct: number;
  weightedScoreDisplay: string;
  status: "TARGET_TERCAPAI" | "PERLU_PERBAIKAN" | "DI_BAWAH_TARGET" | "BELUM_DIISI";

  // Comparison against current system values
  currentScore: number | null;
  scoreDelta: number | null;

  // Selected for save
  isSelected: boolean;
  isDuplicate: boolean;
  duplicateWarning?: string;
}

export interface BatchParseAndPreviewResult {
  fileName: string;
  totalParsedBlocks: number;
  matchedCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  items: BatchPreviewItem[];
  availableIndicators: IndicatorMatchingTarget[];
}

export interface SheetEmployeeInfo {
  nik: string | null;
  name: string | null;
  department: string | null;
  periodYear: number | null;
  isCurrentEmployeeMatch: boolean;
}

export interface SheetParseResult {
  sheetName: string;
  sheetIndex: number;
  employeeInfo: SheetEmployeeInfo;
  totalParsedBlocks: number;
  matchedCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  items: BatchPreviewItem[];
  isValidSheet: boolean;
}

export interface MultiSheetBatchResult {
  fileName: string;
  totalSheets: number;
  totalEmployeesDetected: number;
  sheets: SheetParseResult[];
  activeSheetIndex: number;
}

// ============================================================================
// 1. DATA SANITIZATION UTILITIES
// ============================================================================

export function sanitizeNumericCell(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }

  let str = String(val).trim();
  if (!str) return null;

  // Check for common Excel formula errors
  if (
    str.includes("#DIV/0!") ||
    str.includes("#N/A") ||
    str.includes("#VALUE!") ||
    str.includes("#REF!") ||
    str.includes("#NAME?") ||
    str.includes("#NUM!") ||
    str.includes("#NULL!")
  ) {
    return null;
  }

  // Handle ratio formatted as "X:Y" e.g. "1:2" -> 0.5
  const ratioMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)$/);
  if (ratioMatch) {
    const num1 = parseFloat(ratioMatch[1].replace(/,/g, "."));
    const num2 = parseFloat(ratioMatch[2].replace(/,/g, "."));
    if (!isNaN(num1) && !isNaN(num2) && num2 !== 0) {
      return parseFloat((num1 / num2).toFixed(4));
    }
  }

  // Remove "Rp", "IDR" prefix if present
  str = str.replace(/^(?:Rp|IDR)\.?\s*/i, "").trim();

  // Handle suffix words like "hari", "day", "days" e.g. "3 hari" -> "3"
  str = str.replace(/\s*(?:hari|day|days)\b/i, "").trim();

  // Handle prefix inequality symbols like "<3" or ">= 4"
  str = str.replace(/^[<>≤≥=]+\s*/, "").trim();

  // Handle "Miliar" / "Milyar" / "M" or "Juta" / "Jt" e.g. "24.96 Miliar" or "25 M"
  const miliarMatch = str.match(/^([\d.,]+)\s*(?:miliar|milyar|m)\b/i);
  if (miliarMatch) {
    const rawNum = miliarMatch[1].replace(/,/g, ".");
    const parsedM = parseFloat(rawNum);
    return isNaN(parsedM) ? null : parsedM;
  }

  const jutaMatch = str.match(/^([\d.,]+)\s*(?:juta|jt)\b/i);
  if (jutaMatch) {
    const rawNum = jutaMatch[1].replace(/,/g, ".");
    const parsedJ = parseFloat(rawNum);
    return isNaN(parsedJ) ? null : parsedJ;
  }

  // Handle percentages (e.g. "91.45%", "98 %")
  if (str.endsWith("%")) {
    const rawNum = str.slice(0, -1).trim().replace(/,/g, ".");
    const parsed = parseFloat(rawNum);
    return isNaN(parsed) ? null : parsed;
  }

  // Handle formatted numbers with thousand separators
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    // Indonesian thousand dots: 25.000.000,50
    str = str.replace(/\./g, "").replace(/,/g, ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    // English thousand commas: 25,000,000.50
    str = str.replace(/,/g, "");
  } else if (str.includes(",") && !str.includes(".")) {
    // Simple decimal with comma e.g. "10,2"
    str = str.replace(/,/g, ".");
  }

  const num = Number(str);
  return isNaN(num) ? null : num;
}

// ============================================================================
// 2. EXCEL PARSER (Spesifik Kolom H, I-T, U, V)
// ============================================================================

/**
 * Membaca sheet Excel dengan struktur:
 * Kolom H (index 7): Judul Parameter, "Type", "Target", "Actual"
 * Kolom I s/d T (index 8..19): Bulan Jan s/d Dec (12 bulan)
 * Kolom U (index 20): Realisasi (Nilai Tahunan)
 * Kolom V (index 21): Persentase capaian di Excel
 *
 * Mendukung auto-detection kolom anchor bila tabel bergeser kolom.
 */
export function parseKpiExcelMatrix(rawMatrix: unknown[][]): ExcelParsedBlock[] {
  const blocks: ExcelParsedBlock[] = [];
  if (!rawMatrix || rawMatrix.length === 0) return blocks;

  for (let r = 0; r < rawMatrix.length; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];

    // Cari kolom yang memuat teks "Type" (prioritas Kolom H = index 7)
    let colTypeIdx = -1;
    if (row[7] !== undefined && String(row[7]).trim().toLowerCase() === "type") {
      colTypeIdx = 7;
    } else {
      // Fallback auto-detection jika ada geseran kolom
      for (let c = 0; c < row.length; c++) {
        if (String(row[c] || "").trim().toLowerCase() === "type") {
          colTypeIdx = c;
          break;
        }
      }
    }

    if (colTypeIdx >= 0) {
      // Baris r adalah baris 'Type'.
      // 1. Ekstraksi Judul Parameter dari baris sebelumnya (r - 1) di kolom yang sama
      let rawTitle = "";
      for (let lookback = 1; lookback <= 3; lookback++) {
        const prevRow = rawMatrix[r - lookback] as unknown[] | undefined;
        if (prevRow) {
          const cand = String(prevRow[colTypeIdx] || "").trim();
          if (cand && cand.toLowerCase() !== "parameter" && cand.toLowerCase() !== "type") {
            rawTitle = cand;
            break;
          }
          // Jika di kolom colTypeIdx bertuliskan "Parameter", cek kolom sebelahnya (colTypeIdx + 1)
          const candNext = String(prevRow[colTypeIdx + 1] || "").trim();
          if (candNext) {
            rawTitle = candNext;
            break;
          }
        }
      }

      if (!rawTitle) {
        // Fallback jika judul ada di baris yang sama atau di sel sekitar
        continue;
      }

      // 2. Baris Target (biasanya r + 1) dan Baris Actual (biasanya r + 2)
      let targetRow: unknown[] | null = null;
      let actualRow: unknown[] | null = null;

      for (let offset = 1; offset <= 4; offset++) {
        const nextRow = rawMatrix[r + offset] as unknown[] | undefined;
        if (!nextRow) continue;
        const labelPrimary = String(nextRow[colTypeIdx] || "").trim().toLowerCase();
        const labelPrev = colTypeIdx > 0 ? String(nextRow[colTypeIdx - 1] || "").trim().toLowerCase() : "";
        const labelNext = String(nextRow[colTypeIdx + 1] || "").trim().toLowerCase();
        const combined = `${labelPrimary} ${labelPrev} ${labelNext}`;

        if (
          combined.includes("target") ||
          combined.includes("tgt") ||
          combined.includes("harus")
        ) {
          targetRow = nextRow;
        } else if (
          combined.includes("actual") ||
          combined.includes("aktual") ||
          combined.includes("realisasi")
        ) {
          actualRow = nextRow;
        }
      }

      // Jika baris target atau actual tidak memiliki label eksplisit, ambil berurutan r+1 dan r+2
      if (!targetRow && rawMatrix[r + 1]) targetRow = rawMatrix[r + 1] as unknown[];
      if (!actualRow && rawMatrix[r + 2]) actualRow = rawMatrix[r + 2] as unknown[];

      const monthlyTargets: (number | null)[] = [];
      const monthlyActuals: (number | null)[] = [];
      const warningNotes: string[] = [];

      // Ekstraksi 12 bulan (Kolom I s/d T, yaitu index colTypeIdx + 1 s/d colTypeIdx + 12)
      for (let m = 1; m <= 12; m++) {
        const colIdx = colTypeIdx + m;
        const tgtVal = targetRow ? sanitizeNumericCell(targetRow[colIdx]) : null;
        const actVal = actualRow ? sanitizeNumericCell(actualRow[colIdx]) : null;
        monthlyTargets.push(tgtVal);
        monthlyActuals.push(actVal);
      }

      // Ekstraksi Kolom U (Realisasi) = colTypeIdx + 13
      const realisasiColIdx = colTypeIdx + 13;
      const annualTarget = targetRow ? sanitizeNumericCell(targetRow[realisasiColIdx]) : null;
      const rawAnnualActual = actualRow ? actualRow[realisasiColIdx] : null;

      if (typeof rawAnnualActual === "string" && rawAnnualActual.includes("#DIV/0!")) {
        warningNotes.push("Formula Excel menghasilkan error #DIV/0! (pembagian nol).");
      }
      const annualActual = sanitizeNumericCell(rawAnnualActual);

      // Ekstraksi Kolom V (Persentase Excel) = colTypeIdx + 14
      const pctColIdx = colTypeIdx + 14;
      const rawPct = actualRow ? actualRow[pctColIdx] : null;
      const excelPercentageText = rawPct !== null && rawPct !== undefined ? String(rawPct).trim() : undefined;

      const hasMonthlyData = monthlyActuals.some((v) => v !== null);

      blocks.push({
        rawTitle,
        monthlyTargets,
        monthlyActuals,
        annualTarget,
        annualActual,
        excelPercentageText,
        hasMonthlyData,
        warningNotes,
        rowNumber: r + 1,
      });

      // Lewati baris target & actual yang sudah diproses
      r += 2;
    }
  }

  return blocks;
}

export function parseKpiExcelSheet(sheet: XLSX.WorkSheet): ExcelParsedBlock[] {
  const rawMatrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parseKpiExcelMatrix(rawMatrix);
}

// ============================================================================
// 3. PARAMETER MATCHING ENGINE (Exact, Alias, Fuzzy)
// ============================================================================

export function cleanParamTitle(str: string): string {
  return String(str || "")
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, "") // Hapus tahun (2024, 2025, 2026, dst)
    .replace(/\b(target|actual|aktual|kpi|tahun|thn|pemenuhan)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const PARAM_ALIAS_MAP: Record<string, string> = {
  couchingcounseling: "coachingcounseling",
  couching: "coachingcounseling",
  coaching: "coachingcounseling",
  kehadirandisiplin: "kehadiran",
  kehadiran: "kehadiran",
  disiplin: "kehadiran",
  harushadi: "kehadiran",
  aktualhadi: "kehadiran",
  pemenuhankebutuhanuser: "kebutuhanuser",
  kebutuhanuser: "kebutuhanuser",
  nilaistockonhand: "stockonhand",
  stockonhand: "stockonhand",
  soh: "stockonhand",
  rasiodeadstock: "deadstock",
  deadstock: "deadstock",
};

export function matchParameter(
  rawTitle: string,
  indicators: IndicatorMatchingTarget[]
): {
  matched: IndicatorMatchingTarget | null;
  matchType: "EXACT" | "ALIAS" | "FUZZY" | "UNMATCHED";
  confidence: number;
} {
  const cleanRaw = cleanParamTitle(rawTitle);
  if (!cleanRaw) {
    return { matched: null, matchType: "UNMATCHED", confidence: 0 };
  }

  // 1. Exact Match on cleaned name
  for (const ind of indicators) {
    const cleanInd = cleanParamTitle(ind.name);
    if (cleanInd === cleanRaw) {
      return { matched: ind, matchType: "EXACT", confidence: 1.0 };
    }
  }

  // 2. Known Alias Match
  const aliasedRaw = PARAM_ALIAS_MAP[cleanRaw] || cleanRaw;
  for (const ind of indicators) {
    const cleanInd = cleanParamTitle(ind.name);
    const aliasedInd = PARAM_ALIAS_MAP[cleanInd] || cleanInd;
    if (
      aliasedInd === aliasedRaw ||
      aliasedInd.includes(aliasedRaw) ||
      aliasedRaw.includes(aliasedInd)
    ) {
      return { matched: ind, matchType: "ALIAS", confidence: 0.95 };
    }
  }

  // 3. Substring / Inclusion Match
  for (const ind of indicators) {
    const cleanInd = cleanParamTitle(ind.name);
    if (cleanRaw.includes(cleanInd) || cleanInd.includes(cleanRaw)) {
      return { matched: ind, matchType: "FUZZY", confidence: 0.8 };
    }
  }

  // 4. Fuzzy Levenshtein Distance
  let bestMatch: IndicatorMatchingTarget | null = null;
  let bestScore = 0;

  for (const ind of indicators) {
    const cleanInd = cleanParamTitle(ind.name);
    const sim = calculateStringSimilarity(cleanRaw, cleanInd);
    if (sim > bestScore) {
      bestScore = sim;
      bestMatch = ind;
    }
  }

  if (bestScore >= 0.7 && bestMatch) {
    return { matched: bestMatch, matchType: "FUZZY", confidence: bestScore };
  }

  return { matched: null, matchType: "UNMATCHED", confidence: 0 };
}

function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  let editDistance = 0;
  const matrix: number[][] = [];

  for (let i = 0; i <= shorter.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= longer.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      if (shorter.charAt(i - 1) === longer.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  editDistance = matrix[shorter.length][longer.length];

  return (longerLength - editDistance) / longerLength;
}

// ============================================================================
// 4. VALUE FORMATTING HELPER
// ============================================================================

export function formatValueWithUnit(val: number | null, unit?: string | null): string {
  if (val === null || val === undefined) return "-";
  const u = unit?.trim();
  if (u === "%") {
    return `${val}%`;
  } else if (u && u.toLowerCase() === "hari") {
    return `${val} hari`;
  } else if (u && (u.toLowerCase() === "miliar" || u.toLowerCase() === "m")) {
    return `${val.toLocaleString("id-ID")} M`;
  } else if (u && (u.toLowerCase() === "juta" || u.toLowerCase() === "jt")) {
    return `${val.toLocaleString("id-ID")} Jt`;
  } else if (u) {
    return `${val.toLocaleString("id-ID")} ${u}`;
  }
  return val.toLocaleString("id-ID");
}

// ============================================================================
// 5. PREVIEW GENERATOR MENGGUNAKAN SCORING ENGINE EKSISTING
// ============================================================================

/**
 * Menghasilkan data preview dengan memproses nilai Target dan Actual dari Excel
 * melalui fungsi scoring eksisting (calculateKpiScore, aggregateMonthly).
 */
export function generateBatchPreview(
  parsedBlocks: ExcelParsedBlock[],
  availableIndicators: IndicatorMatchingTarget[],
  fileName = "upload.xlsx"
): BatchParseAndPreviewResult {
  const items: BatchPreviewItem[] = [];
  const assignedItemIds = new Set<number>();

  for (let i = 0; i < parsedBlocks.length; i++) {
    const block = parsedBlocks[i];
    const matchRes = matchParameter(block.rawTitle, availableIndicators);
    const ind = matchRes.matched;

    let isDuplicate = false;
    let duplicateWarning: string | undefined = undefined;

    if (ind && ind.appraisalItemId) {
      if (assignedItemIds.has(ind.appraisalItemId)) {
        isDuplicate = true;
        duplicateWarning = `Indikator "${ind.name}" sudah dipetakan pada baris lain di Excel.`;
      } else {
        assignedItemIds.add(ind.appraisalItemId);
      }
    }

    // 1. Tentukan Nilai Realisasi (Kolom U baris Actual atau agregasi bulanan Kolom I-T)
    let effectiveRealization: number | null = null;
    if (block.annualActual !== null && block.annualActual !== undefined) {
      effectiveRealization = block.annualActual;
    } else if (block.hasMonthlyData) {
      const aggMethod = ind?.aggregation || "AVERAGE";
      const aggRes = aggregateMonthly(
        aggMethod as any,
        block.monthlyActuals,
        block.monthlyTargets
      );
      effectiveRealization = aggRes.annualActual;
    }

    // 2. Evaluasi Target Langsung dari Kolom U Baris Target Excel
    // PENTING: Target wajib dibaca langsung dari Excel (Kolom U baris Target).
    // Jangan gunakan default 100% jika target tersedia di Excel!
    let effectiveTarget: number | null = null;
    const hasExcelAnnualTarget = block.annualTarget !== null && block.annualTarget !== undefined;
    const hasExcelMonthlyTargets = block.monthlyTargets && block.monthlyTargets.some((v) => v !== null);

    if (hasExcelAnnualTarget) {
      // Prioritas 1: Baca langsung dari Kolom U baris Target Excel
      effectiveTarget = block.annualTarget;
    } else if (hasExcelMonthlyTargets) {
      // Prioritas 2: Agregasi dari data bulanan Januari-Desember baris Target (Kolom I-T)
      const aggMethod = ind?.aggregation || "AVERAGE";
      const aggTgt = aggregateMonthly(
        aggMethod as any,
        block.monthlyTargets,
        block.monthlyTargets
      );
      effectiveTarget = aggTgt.annualActual;
    }

    // Peringatan jika Target Excel kosong atau tidak terbaca:
    // PENTING: Jangan menggantinya dengan nilai default 100% secara otomatis!
    const itemWarnings = [...block.warningNotes];
    if (effectiveTarget === null) {
      itemWarnings.push("Target pada Excel kosong atau tidak terbaca di Kolom U.");
    }

    // 3. Pencegahan kesalahan konversi desimal dan persentase untuk Realisasi & Target
    const isPercentageIndicator =
      ind?.unit === "%" ||
      ind?.name?.includes("%") ||
      block.rawTitle.includes("%") ||
      (block.excelPercentageText && block.excelPercentageText.includes("%"));

    if (isPercentageIndicator) {
      const rulesHaveHighNumbers = ind?.scoringRules?.some(
        (r) => Number(r.minValue || 0) > 1 || Number(r.maxValue || 0) > 1
      );

      // Konversi desimal Actual jika masuk sebagai desimal Excel (misal 0.95 -> 95)
      if (
        effectiveRealization !== null &&
        effectiveRealization > 0 &&
        effectiveRealization <= 1 &&
        (rulesHaveHighNumbers || effectiveTarget === null || effectiveTarget > 1)
      ) {
        effectiveRealization = parseFloat((effectiveRealization * 100).toFixed(4));
      }

      // Konversi desimal Target jika masuk sebagai desimal Excel (misal 0.95 -> 95)
      if (
        effectiveTarget !== null &&
        effectiveTarget > 0 &&
        effectiveTarget <= 1 &&
        rulesHaveHighNumbers
      ) {
        effectiveTarget = parseFloat((effectiveTarget * 100).toFixed(4));
      }
    }

    const targetDisplay = formatValueWithUnit(effectiveTarget, ind?.unit);
    const realizationDisplay = formatValueWithUnit(effectiveRealization, ind?.unit);

    // 4. Eksekusi Scoring Engine Eksisting Menggunakan Target & Actual Excel
    let scoreResult: KpiScoreResult | null = null;
    if (ind && effectiveRealization !== null) {
      scoreResult = calculateKpiScore(effectiveRealization, ind.scoringRules, {
        indicatorWeight: ind.indicatorWeight,
        parameterWeight: ind.parameterWeight,
        maxScore: ind.maxScore || 25,
        compareBasis: ind.compareBasis || "ACTUAL",
        target: effectiveTarget,
        direction: ind.direction,
        measurementType: ind.measurementType,
        unit: ind.unit,
      });
    }

    const currentScore = ind?.currentScore ?? null;
    const newScore = scoreResult?.score ?? null;
    const scoreDelta =
      newScore !== null && currentScore !== null ? newScore - currentScore : null;

    items.push({
      key: `block-${i}-${block.rowNumber}`,
      rawTitle: block.rawTitle,
      excelRowNumber: block.rowNumber,
      selectedAppraisalItemId: ind ? ind.appraisalItemId : null,
      matchedIndicator: ind,
      matchType: matchRes.matchType,
      confidence: matchRes.confidence,
      warningNotes: itemWarnings,

      excelAnnualTarget: block.annualTarget,
      excelAnnualActual: block.annualActual,
      excelMonthlyActuals: block.monthlyActuals,
      excelMonthlyTargets: block.monthlyTargets,
      excelPercentageText: block.excelPercentageText,
      hasMonthlyData: block.hasMonthlyData,

      effectiveTarget,
      targetDisplay,
      effectiveRealization,
      realizationDisplay,
      realizationPct: scoreResult?.realizationPct ?? null,
      realizationPctDisplay: scoreResult?.realizationPctDisplay ?? "-",
      score: newScore,
      bandLabel: scoreResult?.bandLabel ?? null,
      weightedScoreFraction: scoreResult?.finalScoreFraction ?? 0,
      weightedScorePct: scoreResult?.finalScorePercentage ?? 0,
      weightedScoreDisplay: scoreResult?.finalScoreDisplay ?? "0.0%",
      status: scoreResult?.status ?? "BELUM_DIISI",

      currentScore,
      scoreDelta,
      isSelected: !!ind && !isDuplicate,
      isDuplicate,
      duplicateWarning,
    });
  }

  const matchedCount = items.filter((it) => it.matchType === "EXACT").length;
  const needsReviewCount = items.filter(
    (it) => it.matchType === "ALIAS" || it.matchType === "FUZZY"
  ).length;
  const unmatchedCount = items.filter((it) => it.matchType === "UNMATCHED").length;

  return {
    fileName,
    totalParsedBlocks: items.length,
    matchedCount,
    needsReviewCount,
    unmatchedCount,
    items,
    availableIndicators,
  };
}

/**
 * Recalculate single preview item when user overrides indicator mapping from dropdown
 */
export function recalculatePreviewItemMapping(
  item: BatchPreviewItem,
  newIndicatorId: number | null,
  availableIndicators: IndicatorMatchingTarget[]
): BatchPreviewItem {
  if (!newIndicatorId) {
    return {
      ...item,
      selectedAppraisalItemId: null,
      matchedIndicator: null,
      matchType: "UNMATCHED",
      confidence: 0,
      score: null,
      bandLabel: null,
      weightedScoreFraction: 0,
      weightedScorePct: 0,
      weightedScoreDisplay: "0.0%",
      status: "BELUM_DIISI",
      isSelected: false,
    };
  }

  const newInd = availableIndicators.find((ind) => ind.appraisalItemId === newIndicatorId) || null;
  if (!newInd) return item;

  // 1. Tentukan Nilai Realisasi (dari Kolom U baris Actual atau agregasi bulanan)
  let effectiveRealization: number | null = null;
  if (item.excelAnnualActual !== null && item.excelAnnualActual !== undefined) {
    effectiveRealization = item.excelAnnualActual;
  } else if (item.hasMonthlyData) {
    const aggRes = aggregateMonthly(
      (newInd.aggregation as any) || "AVERAGE",
      item.excelMonthlyActuals,
      item.excelMonthlyTargets
    );
    effectiveRealization = aggRes.annualActual;
  }

  // 2. Evaluasi Target Langsung dari Kolom U Baris Target Excel
  let effectiveTarget: number | null = null;
  const hasExcelAnnualTarget = item.excelAnnualTarget !== null && item.excelAnnualTarget !== undefined;
  const hasExcelMonthlyTargets = item.excelMonthlyTargets && item.excelMonthlyTargets.some((v) => v !== null);

  if (hasExcelAnnualTarget) {
    effectiveTarget = item.excelAnnualTarget;
  } else if (hasExcelMonthlyTargets) {
    const aggTgt = aggregateMonthly(
      (newInd.aggregation as any) || "AVERAGE",
      item.excelMonthlyTargets,
      item.excelMonthlyTargets
    );
    effectiveTarget = aggTgt.annualActual;
  }

  const updatedWarnings = [...item.warningNotes];
  if (effectiveTarget === null && !updatedWarnings.some((w) => w.includes("Target pada Excel kosong"))) {
    updatedWarnings.push("Target pada Excel kosong atau tidak terbaca di Kolom U.");
  }

  // 3. Pencegahan kesalahan konversi desimal dan persentase untuk Realisasi & Target
  const isPercentageIndicator =
    newInd.unit === "%" ||
    newInd.name.includes("%") ||
    item.rawTitle.includes("%") ||
    (item.excelPercentageText && item.excelPercentageText.includes("%"));

  if (isPercentageIndicator) {
    const rulesHaveHighNumbers = newInd.scoringRules.some(
      (r) => Number(r.minValue || 0) > 1 || Number(r.maxValue || 0) > 1
    );

    if (
      effectiveRealization !== null &&
      effectiveRealization > 0 &&
      effectiveRealization <= 1 &&
      (rulesHaveHighNumbers || effectiveTarget === null || effectiveTarget > 1)
    ) {
      effectiveRealization = parseFloat((effectiveRealization * 100).toFixed(4));
    }

    if (
      effectiveTarget !== null &&
      effectiveTarget > 0 &&
      effectiveTarget <= 1 &&
      rulesHaveHighNumbers
    ) {
      effectiveTarget = parseFloat((effectiveTarget * 100).toFixed(4));
    }
  }

  const targetDisplay = formatValueWithUnit(effectiveTarget, newInd.unit);
  const realizationDisplay = formatValueWithUnit(effectiveRealization, newInd.unit);

  let scoreResult: KpiScoreResult | null = null;
  if (effectiveRealization !== null) {
    scoreResult = calculateKpiScore(effectiveRealization, newInd.scoringRules, {
      indicatorWeight: newInd.indicatorWeight,
      parameterWeight: newInd.parameterWeight,
      maxScore: newInd.maxScore || 25,
      compareBasis: newInd.compareBasis || "ACTUAL",
      target: effectiveTarget,
      direction: newInd.direction,
      measurementType: newInd.measurementType,
      unit: newInd.unit,
    });
  }

  const currentScore = newInd.currentScore ?? null;
  const newScore = scoreResult?.score ?? null;
  const scoreDelta =
    newScore !== null && currentScore !== null ? newScore - currentScore : null;

  return {
    ...item,
    selectedAppraisalItemId: newInd.appraisalItemId,
    matchedIndicator: newInd,
    matchType: item.rawTitle.toLowerCase().trim() === newInd.name.toLowerCase().trim() ? "EXACT" : "ALIAS",
    confidence: 1.0,
    warningNotes: updatedWarnings,
    effectiveTarget,
    targetDisplay,
    effectiveRealization,
    realizationDisplay,
    realizationPct: scoreResult?.realizationPct ?? null,
    realizationPctDisplay: scoreResult?.realizationPctDisplay ?? "-",
    score: newScore,
    bandLabel: scoreResult?.bandLabel ?? null,
    weightedScoreFraction: scoreResult?.finalScoreFraction ?? 0,
    weightedScorePct: scoreResult?.finalScorePercentage ?? 0,
    weightedScoreDisplay: scoreResult?.finalScoreDisplay ?? "0.0%",
    status: scoreResult?.status ?? "BELUM_DIISI",
    currentScore,
    scoreDelta,
    isSelected: true,
  };
}

/**
 * Helper to convert MonthlyCategoryGroup[] into IndicatorMatchingTarget[]
 */
export function extractMatchingTargetsFromCategories(categories: any[]): IndicatorMatchingTarget[] {
  const targets: IndicatorMatchingTarget[] = [];
  if (!categories || !Array.isArray(categories)) return targets;

  for (const cat of categories) {
    if (!cat.indicators || !Array.isArray(cat.indicators)) continue;
    for (const ind of cat.indicators) {
      targets.push({
        appraisalItemId: ind.appraisalItemId,
        parameterId: ind.parameterId ?? null,
        name: ind.indicatorName || "Indikator",
        categoryName: cat.categoryName,
        target: ind.target,
        unit: ind.unit,
        inputType: ind.inputType,
        aggregation: ind.aggregation || "AVERAGE",
        compareBasis: ind.compareBasis || "ACTUAL",
        direction: ind.direction,
        measurementType: ind.measurementType,
        indicatorWeight: ind.indicatorWeight ?? 0.2,
        parameterWeight: ind.parameterWeight ?? 1.0,
        maxScore: ind.maxScore || 25,
        scoringRules: ind.scoringRules || [],
        currentActual: ind.actualValue,
        currentAnnualActual: ind.annualActual,
        currentScore: ind.score,
      });
    }
  }

  return targets;
}

/**
 * Ekstraksi informasi identitas karyawan (NIK, Nama, Departemen, Periode) dari sebuah sheet Excel
 */
export function extractSheetEmployeeInfo(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  currentEmployee?: { nik?: string; name?: string; department?: string; periodYear?: number }
): SheetEmployeeInfo {
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  let detectedNik: string | null = null;
  let detectedName: string | null = null;
  let detectedDept: string | null = null;
  let detectedYear: number | null = null;

  // 1. Scan 25 baris pertama untuk metadata karyawan
  const maxRows = Math.min(matrix.length, 25);
  for (let r = 0; r < maxRows; r++) {
    const row = (matrix[r] as unknown[]) || [];
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] || "").trim();
      if (!cellStr) continue;

      const lower = cellStr.toLowerCase();

      // Deteksi NIK
      if (!detectedNik) {
        if (
          lower === "nik" ||
          lower === "n.i.k" ||
          lower === "no. induk" ||
          lower === "no induk" ||
          lower === "badge id" ||
          lower === "nik:"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const belowVal = matrix[r + 1] ? String((matrix[r + 1] as unknown[])[c] || "").trim() : "";
          if (nextVal && !nextVal.toLowerCase().includes("nama")) {
            detectedNik = nextVal;
          } else if (belowVal) {
            detectedNik = belowVal;
          }
        } else {
          // Format standar NIK (misal 1.1025.273 atau 01.1224.001)
          const nikMatch = cellStr.match(/\b\d{1,2}\.\d{4}\.\d{3,4}\b/);
          if (nikMatch) {
            detectedNik = nikMatch[0];
          }
        }
      }

      // Deteksi Nama
      if (!detectedName) {
        if (
          lower === "nama" ||
          lower === "nama karyawan" ||
          lower === "nama employee" ||
          lower === "nama pegawai" ||
          lower === "nama:" ||
          lower === "employee name"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const belowVal = matrix[r + 1] ? String((matrix[r + 1] as unknown[])[c] || "").trim() : "";
          if (nextVal && !nextVal.toLowerCase().includes("nik") && !nextVal.toLowerCase().includes("jabatan")) {
            detectedName = nextVal;
          } else if (belowVal) {
            detectedName = belowVal;
          }
        }
      }

      // Deteksi Departemen
      if (!detectedDept) {
        if (
          lower === "departemen" ||
          lower === "department" ||
          lower === "dept" ||
          lower === "divisi" ||
          lower === "bagian" ||
          lower === "departemen:" ||
          lower === "unit"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const belowVal = matrix[r + 1] ? String((matrix[r + 1] as unknown[])[c] || "").trim() : "";
          if (nextVal) detectedDept = nextVal;
          else if (belowVal) detectedDept = belowVal;
        }
      }

      // Deteksi Periode / Tahun
      if (!detectedYear) {
        if (
          lower === "periode" ||
          lower === "tahun" ||
          lower === "period" ||
          lower === "tahun penilaian" ||
          lower === "periode:"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const yearMatch = nextVal.match(/\b(20\d\d)\b/);
          if (yearMatch) detectedYear = parseInt(yearMatch[1], 10);
        } else {
          const titleYearMatch = cellStr.match(/tahun\s+(20\d\d)/i) || cellStr.match(/\b(20\d\d)\b/);
          if (titleYearMatch && r < 5) {
            detectedYear = parseInt(titleYearMatch[1], 10);
          }
        }
      }
    }
  }

  // Fallback dari Nama Sheet jika belum terdeteksi dari sel
  const cleanSheetName = sheetName.trim();
  if (!detectedNik) {
    const nikMatch = cleanSheetName.match(/\b\d{1,2}\.\d{4}\.\d{3,4}\b/);
    if (nikMatch) detectedNik = nikMatch[0];
  }

  if (!detectedName) {
    if (!/^sheet\d+$/i.test(cleanSheetName) && !/template|rekap|summary|panduan/i.test(cleanSheetName)) {
      const nameCand = cleanSheetName
        .replace(/\b\d{1,2}\.\d{4}\.\d{3,4}\b/, "")
        .replace(/[-_()]/g, " ")
        .trim();
      if (nameCand.length > 2) {
        detectedName = nameCand;
      } else {
        detectedName = cleanSheetName;
      }
    }
  }

  // Validasi kecocokan dengan karyawan aktif saat ini
  let isCurrentEmployeeMatch = false;
  if (currentEmployee) {
    const currNik = (currentEmployee.nik || "").trim().toLowerCase();
    const currName = (currentEmployee.name || "").trim().toLowerCase();
    const detNik = (detectedNik || "").trim().toLowerCase();
    const detName = (detectedName || "").trim().toLowerCase();
    const sName = cleanSheetName.toLowerCase();

    if (currNik && detNik && (currNik === detNik || detNik.includes(currNik) || currNik.includes(detNik))) {
      isCurrentEmployeeMatch = true;
    } else if (currName && detName && (currName === detName || detName.includes(currName) || currName.includes(detName))) {
      isCurrentEmployeeMatch = true;
    } else if (currNik && sName.includes(currNik)) {
      isCurrentEmployeeMatch = true;
    } else if (currName && sName.includes(currName)) {
      isCurrentEmployeeMatch = true;
    }
  }

  return {
    nik: detectedNik,
    name: detectedName,
    department: detectedDept || currentEmployee?.department || null,
    periodYear: detectedYear || currentEmployee?.periodYear || null,
    isCurrentEmployeeMatch,
  };
}

/**
 * Membaca seluruh sheet dalam berkas Excel (1 sheet = 1 karyawan)
 */
export function parseKpiExcelWorkbook(
  wb: XLSX.WorkBook,
  availableIndicators: IndicatorMatchingTarget[],
  fileName: string,
  currentEmployee?: { nik?: string; name?: string; department?: string; periodYear?: number }
): MultiSheetBatchResult {
  const sheets: SheetParseResult[] = [];

  for (let i = 0; i < wb.SheetNames.length; i++) {
    const sheetName = wb.SheetNames[i];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const employeeInfo = extractSheetEmployeeInfo(ws, sheetName, currentEmployee);
    const blocks = parseKpiExcelSheet(ws);
    const preview = generateBatchPreview(blocks, availableIndicators, fileName);

    sheets.push({
      sheetName,
      sheetIndex: i,
      employeeInfo,
      totalParsedBlocks: preview.totalParsedBlocks,
      matchedCount: preview.matchedCount,
      needsReviewCount: preview.needsReviewCount,
      unmatchedCount: preview.unmatchedCount,
      items: preview.items,
      isValidSheet: blocks.length > 0,
    });
  }

  // Cari default activeSheetIndex:
  // 1. Sheet yang sesuai dengan karyawan aktif & memiliki parameter
  // 2. Sheet pertama yang memiliki parameter > 0
  // 3. Fallback ke sheet index 0
  let activeSheetIndex = sheets.findIndex(
    (s) => s.employeeInfo.isCurrentEmployeeMatch && s.totalParsedBlocks > 0
  );
  if (activeSheetIndex === -1) {
    activeSheetIndex = sheets.findIndex((s) => s.totalParsedBlocks > 0);
  }
  if (activeSheetIndex === -1) {
    activeSheetIndex = 0;
  }

  const totalEmployeesDetected = sheets.filter((s) => s.totalParsedBlocks > 0).length;

  return {
    fileName,
    totalSheets: wb.SheetNames.length,
    totalEmployeesDetected,
    sheets,
    activeSheetIndex,
  };
}
