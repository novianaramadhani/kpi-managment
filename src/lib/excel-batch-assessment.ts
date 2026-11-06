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
  excelScore?: number | null;
  excelWeightedScore?: number | null;
  excelUnit?: string | null;
  excelPercentageText?: string;
  excelBandCriteria?: string;
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
  excelScore?: number | null;
  excelWeightedScore?: number | null;
  excelUnit?: string | null;
  excelPercentageText?: string;
  excelBandCriteria?: string;
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

export interface ParsedDeptKpiRow {
  departmentName: string;
  parameterName: string;
  annualActual: number | null;
  monthlyActuals: (number | null)[];
  notes?: string;
}

export interface MultiSheetBatchResult {
  fileName: string;
  totalSheets: number;
  totalEmployeesDetected: number;
  sheets: SheetParseResult[];
  activeSheetIndex: number;
  departmentKpis?: ParsedDeptKpiRow[];
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

// ============================================================================
// 2. EXCEL PARSER (Mendukung Form Realisasi Actual, Form Penilaian, & Legacy)
// ============================================================================

/**
 * Parser khusus untuk lembar kerja "Form Realisasi Actual"
 * Struktur:
 * - Col 0 (A): No
 * - Col 1 (B): Indikator KPI
 * - Col 2 (C): Bobot Indikator (%)
 * - Col 3 (D): Target Tahunan
 * - Col 4 (E): Satuan
 * - Col 5 (F): Type ("Target" / "Actual")
 * - Col 6..17 (G..R): Jan s/d Des (12 Bulan)
 * - Col 18 (S): Realisasi Tahunan (Agregasi)
 */
function parseFormRealisasiActual(rawMatrix: unknown[][], startHeaderIdx = 6): ExcelParsedBlock[] {
  const blocks: ExcelParsedBlock[] = [];
  let headerRow = startHeaderIdx >= 0 ? startHeaderIdx : 6;
  let typeCol = 5;
  let nameCol = 1;
  let targetCol = 3;
  let unitCol = 4;
  let monthStartCol = 6;
  let annualCol = 18;

  const searchStart = startHeaderIdx >= 0 ? Math.max(0, startHeaderIdx - 2) : 0;
  const searchEnd = startHeaderIdx >= 0 ? Math.min(rawMatrix.length, startHeaderIdx + 12) : Math.min(rawMatrix.length, 30);

  for (let r = searchStart; r < searchEnd; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    let hasType = false;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase();
      if (val === "type" || val === "tipe") hasType = true;
    }

    if (hasType) {
      headerRow = r;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").trim().toLowerCase();
        if (val === "type" || val === "tipe") typeCol = c;
        if (val === "indikator" || val === "indikator kpi") nameCol = c;
        if (val === "target" || val.includes("target tahunan")) targetCol = c;
        if (val === "satuan" || val === "unit") unitCol = c;
        if (val === "jan" || val === "januari") monthStartCol = c;
        if (val.includes("realisasi tahunan") || val === "realisasi") annualCol = c;
      }
      break;
    }
  }

  for (let r = headerRow + 1; r < rawMatrix.length; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    const cellType = String(row[typeCol] || "").trim().toLowerCase();

    if (cellType === "target") {
      let rawTitle = String(row[nameCol] || "").trim();
      if (!rawTitle) {
        for (let c = 0; c < typeCol; c++) {
          const cand = String(row[c] || "").trim();
          if (cand && !/^\d+(\.\d+)?$/.test(cand) && cand.toLowerCase() !== "target") {
            rawTitle = cand;
            break;
          }
        }
      }
      if (!rawTitle && r > 0) {
        const prevRow = (rawMatrix[r - 1] as unknown[]) || [];
        rawTitle = String(prevRow[nameCol] || prevRow[1] || "").trim();
      }

      // Lewati baris judul kategori / summary bar
      if (!rawTitle || /^\d+\.\s+[A-Z\s]+\(\d+%\)$/.test(rawTitle)) continue;

      const annualTarget = sanitizeNumericCell(row[targetCol]) ?? sanitizeNumericCell(row[annualCol]);
      const rawUnit = String(row[unitCol] || "").trim();

      const monthlyTargets: (number | null)[] = [];
      for (let m = 0; m < 12; m++) {
        monthlyTargets.push(sanitizeNumericCell(row[monthStartCol + m]));
      }

      let actualRow: unknown[] | null = null;
      let nextR = r + 1;
      while (nextR < Math.min(rawMatrix.length, r + 4)) {
        const candRow = (rawMatrix[nextR] as unknown[]) || [];
        const candType = String(candRow[typeCol] || "").trim().toLowerCase();
        if (candType === "actual" || candType === "aktual") {
          actualRow = candRow;
          break;
        }
        nextR++;
      }
      if (!actualRow && rawMatrix[r + 1]) actualRow = rawMatrix[r + 1] as unknown[];

      const monthlyActuals: (number | null)[] = [];
      let annualActual: number | null = null;
      const warningNotes: string[] = [];

      if (actualRow) {
        const isPct = rawUnit.toLowerCase() === "%" || rawUnit.toLowerCase().includes("persen");
        for (let m = 0; m < 12; m++) {
          let mVal = sanitizeNumericCell(actualRow[monthStartCol + m]);
          if (mVal !== null && isPct && mVal > 0 && mVal <= 2.5) {
            mVal = Math.round(mVal * 10000) / 100;
          }
          monthlyActuals.push(mVal);
        }
        const rawAnnAct = actualRow[annualCol];
        if (typeof rawAnnAct === "string" && rawAnnAct.includes("#DIV/0!")) {
          warningNotes.push("Formula Excel menghasilkan error #DIV/0! (pembagian nol).");
        }
        let aAct = sanitizeNumericCell(rawAnnAct);
        if (aAct !== null && isPct && aAct > 0 && aAct <= 2.5) {
          aAct = Math.round(aAct * 10000) / 100;
        }
        annualActual = aAct;
      }

      blocks.push({
        rawTitle,
        annualTarget,
        annualActual,
        monthlyTargets,
        monthlyActuals,
        excelUnit: rawUnit || undefined,
        hasMonthlyData: monthlyActuals.some((v) => v !== null),
        warningNotes,
        rowNumber: r + 1,
      });

      if (actualRow && nextR > r) r = nextR;
    }
  }

  return blocks;
}

/**
 * Parser khusus untuk lembar kerja "Form Penilaian"
 * Struktur:
 * - Col 0 (A): No
 * - Col 1 (B): Parameter
 * - Col 2 (C): Bobot Parameter (%)
 * - Col 3 (D): Indikator
 * - Col 4 (E): Bobot Indikator (%)
 * - Col 5 (F): Target Tahunan
 * - Col 6 (G): Satuan
 * - Col 7 (H): Realisasi Tahunan (Evaluasi Kriteria / Skor Tercapai)
 * - Col 8 (I): Kriteria Penilaian
 * - Col 9 (J): Skor
 * - Col 10 (K): Nilai Akhir
 */
function parseFormPenilaian(rawMatrix: unknown[][], startHeaderIdx = 6, maxRowIdx?: number): ExcelParsedBlock[] {
  const blocks: ExcelParsedBlock[] = [];
  let headerRow = startHeaderIdx >= 0 ? startHeaderIdx : 6;
  let nameCol = 3;
  let targetCol = 5;
  let unitCol = 6;
  let realizationCol = 7;
  let scoreCol = 9;
  let finalCol = 10;

  for (let r = Math.max(0, headerRow - 2); r < Math.min(rawMatrix.length, headerRow + 5); r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase();
      if (val === "indikator") {
        nameCol = c;
        headerRow = r;
      }
      if (val.includes("target tahunan") || val === "target") targetCol = c;
      if (val === "satuan" || val === "unit") unitCol = c;
      if (val.includes("realisasi tahunan") || val === "realisasi") realizationCol = c;
      if (val === "skor") scoreCol = c;
      if (val.includes("nilai akhir")) finalCol = c;
    }
  }

  const endLimit = maxRowIdx !== undefined ? Math.min(rawMatrix.length, maxRowIdx) : rawMatrix.length;

  for (let r = headerRow + 1; r < endLimit; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    const rowText = row.map((cell) => String(cell || "").toLowerCase().trim()).join(" ");

    // STOP parsing Table 1 if reaching Table 2 or Total row
    if (
      rowText.includes("total hasil penilaian akhir") ||
      rowText.includes("rincian target & realisasi bulanan") ||
      rowText.includes("rincian target dan realisasi bulanan")
    ) {
      break;
    }

    let rawTitle = String(row[nameCol] || "").trim();

    if (
      !rawTitle ||
      /^\d+\.\s+[A-Z\s]+\(\d+%\)$/.test(rawTitle) ||
      rawTitle.toLowerCase().includes("total bobot") ||
      rawTitle.toLowerCase().includes("overall score")
    ) {
      continue;
    }

    const annualTarget = sanitizeNumericCell(row[targetCol]);
    const rawUnit = String(row[unitCol] || "").trim();
    const evaluatedScore = sanitizeNumericCell(row[realizationCol]);
    const excelScore = evaluatedScore ?? sanitizeNumericCell(row[scoreCol]);
    const rawFinal = sanitizeNumericCell(row[finalCol]);
    const excelWeightedScore =
      rawFinal !== null
        ? rawFinal <= 1 && rawFinal > 0
          ? parseFloat((rawFinal * 100).toFixed(2))
          : rawFinal
        : null;
    const criteriaCol = scoreCol > 0 ? scoreCol - 1 : 8;
    const excelBandCriteria = String(row[criteriaCol] || "").trim() || undefined;

    blocks.push({
      rawTitle,
      annualTarget,
      annualActual: evaluatedScore,
      excelScore,
      excelWeightedScore,
      excelUnit: rawUnit || undefined,
      excelBandCriteria,
      monthlyTargets: Array(12).fill(null),
      monthlyActuals: Array(12).fill(null),
      hasMonthlyData: false,
      warningNotes: [],
      rowNumber: r + 1,
    });
  }

  return blocks;
}

/**
 * Parser format legacy (Kolom H = Type, I-T = Bulan, U = Realisasi)
 */
function parseLegacyKpiMatrix(rawMatrix: unknown[][]): ExcelParsedBlock[] {
  const blocks: ExcelParsedBlock[] = [];
  for (let r = 0; r < rawMatrix.length; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    let colTypeIdx = -1;
    let isDirectTargetRow = false;

    if (row[7] !== undefined && String(row[7]).trim().toLowerCase() === "type") {
      colTypeIdx = 7;
    } else if (row[7] !== undefined && String(row[7]).trim().toLowerCase() === "target") {
      colTypeIdx = 7;
      isDirectTargetRow = true;
    } else {
      for (let c = 0; c < row.length; c++) {
        const cellVal = String(row[c] || "").trim().toLowerCase();
        if (cellVal === "type") {
          colTypeIdx = c;
          break;
        }
      }
    }

    if (colTypeIdx >= 0) {
      let rawTitle = "";
      let targetRow: unknown[] | null = null;
      let actualRow: unknown[] | null = null;

      if (isDirectTargetRow) {
        rawTitle = String(row[3] || row[1] || "").trim();
        targetRow = row;
        const nextR = (rawMatrix[r + 1] as unknown[]) || [];
        if (String(nextR[colTypeIdx] || "").trim().toLowerCase().includes("actual")) {
          actualRow = nextR;
        }
      } else {
        for (let lookback = 1; lookback <= 3; lookback++) {
          const prevRow = rawMatrix[r - lookback] as unknown[] | undefined;
          if (prevRow) {
            const cand = String(prevRow[colTypeIdx] || "").trim();
            if (cand && cand.toLowerCase() !== "parameter" && cand.toLowerCase() !== "type") {
              rawTitle = cand;
              break;
            }
            const candNext = String(prevRow[colTypeIdx + 1] || "").trim();
            if (candNext) {
              rawTitle = candNext;
              break;
            }
          }
        }

        for (let offset = 1; offset <= 4; offset++) {
          const nextRow = rawMatrix[r + offset] as unknown[] | undefined;
          if (!nextRow) continue;
          const labelPrimary = String(nextRow[colTypeIdx] || "").trim().toLowerCase();
          const labelPrev = colTypeIdx > 0 ? String(nextRow[colTypeIdx - 1] || "").trim().toLowerCase() : "";
          const labelNext = String(nextRow[colTypeIdx + 1] || "").trim().toLowerCase();
          const combined = `${labelPrimary} ${labelPrev} ${labelNext}`;

          if (combined.includes("target") || combined.includes("tgt") || combined.includes("harus")) {
            targetRow = nextRow;
          } else if (combined.includes("actual") || combined.includes("aktual") || combined.includes("realisasi")) {
            actualRow = nextRow;
          }
        }

        if (!targetRow && rawMatrix[r + 1]) targetRow = rawMatrix[r + 1] as unknown[];
        if (!actualRow && rawMatrix[r + 2]) actualRow = rawMatrix[r + 2] as unknown[];

        if (!rawTitle && targetRow && targetRow[3]) {
          rawTitle = String(targetRow[3]).trim();
        }
      }

      if (!rawTitle) continue;

      const monthlyTargets: (number | null)[] = [];
      const monthlyActuals: (number | null)[] = [];
      const warningNotes: string[] = [];

      for (let m = 1; m <= 12; m++) {
        const colIdx = colTypeIdx + m;
        const tgtVal = targetRow ? sanitizeNumericCell(targetRow[colIdx]) : null;
        const actVal = actualRow ? sanitizeNumericCell(actualRow[colIdx]) : null;
        monthlyTargets.push(tgtVal);
        monthlyActuals.push(actVal);
      }

      const realisasiColIdx = colTypeIdx + 13;
      const annualTarget = targetRow ? sanitizeNumericCell(targetRow[realisasiColIdx]) : null;
      const rawAnnualActual = actualRow ? actualRow[realisasiColIdx] : null;

      if (typeof rawAnnualActual === "string" && rawAnnualActual.includes("#DIV/0!")) {
        warningNotes.push("Formula Excel menghasilkan error #DIV/0! (pembagian nol).");
      }
      const annualActual = sanitizeNumericCell(rawAnnualActual);

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

      r += isDirectTargetRow ? 1 : 2;
    }
  }
  return blocks;
}

/**
 * Entry point parser matriks Excel dengan deteksi otomatis format sheet
 */
export function parseKpiExcelMatrix(rawMatrix: unknown[][], sheetName = ""): ExcelParsedBlock[] {
  if (!rawMatrix || rawMatrix.length === 0) return [];

  let table1HeaderIdx = -1;
  let table2HeaderIdx = -1;

  for (let r = 0; r < rawMatrix.length; r++) {
    const row = (rawMatrix[r] as unknown[]) || [];
    const rowText = row.map((cell) => String(cell || "").toLowerCase().trim()).join(" ");

    if (
      table1HeaderIdx < 0 &&
      (rowText.includes("kriteria penilaian") || rowText.includes("nilai akhir")) &&
      (rowText.includes("parameter") || rowText.includes("indikator"))
    ) {
      table1HeaderIdx = r;
    }

    if (
      table2HeaderIdx < 0 &&
      (rowText.includes("realisasi bulanan") ||
        rowText.includes("rincian target & realisasi") ||
        (rowText.includes("type") && (rowText.includes("jan") || rowText.includes("januari") || rowText.includes("realisasi tahunan"))))
    ) {
      table2HeaderIdx = r;
    }
  }

  // Skenario 1: Sheet Terpadu (Memuat Form Penilaian di atas dan Rincian Bulanan di bawah)
  if (table1HeaderIdx >= 0 && table2HeaderIdx >= 0 && table2HeaderIdx > table1HeaderIdx) {
    const table1Blocks = parseFormPenilaian(rawMatrix, table1HeaderIdx, table2HeaderIdx);
    const table2Blocks = parseFormRealisasiActual(rawMatrix, table2HeaderIdx);

    if (table2Blocks.length > 0) {
      // Gabungkan kriteria evaluasi dan skor dari Tabel 1 ke baris Tabel 2 tanpa duplikasi
      for (const actItem of table2Blocks) {
        const actClean = cleanParamTitle(actItem.rawTitle);
        const matchedP = table1Blocks.find((p) => {
          const pClean = cleanParamTitle(p.rawTitle);
          return pClean === actClean || (pClean.length > 3 && (pClean.includes(actClean) || actClean.includes(pClean)));
        });

        if (matchedP) {
          if (matchedP.excelScore !== null && matchedP.excelScore !== undefined) {
            actItem.excelScore = matchedP.excelScore;
          }
          if (matchedP.excelWeightedScore !== null && matchedP.excelWeightedScore !== undefined) {
            actItem.excelWeightedScore = matchedP.excelWeightedScore;
          }
          if (matchedP.excelBandCriteria) {
            actItem.excelBandCriteria = matchedP.excelBandCriteria;
          }
          if (matchedP.excelUnit && !actItem.excelUnit) {
            actItem.excelUnit = matchedP.excelUnit;
          }
        }
      }
      return table2Blocks;
    }

    if (table1Blocks.length > 0) return table1Blocks;
  }

  // Skenario 2: Sheet Form Realisasi Bulanan berdiri sendiri
  if (table2HeaderIdx >= 0) {
    const res = parseFormRealisasiActual(rawMatrix, table2HeaderIdx);
    if (res.length > 0) return res;
  }

  // Skenario 3: Sheet Form Penilaian berdiri sendiri
  if (table1HeaderIdx >= 0) {
    const res = parseFormPenilaian(rawMatrix, table1HeaderIdx);
    if (res.length > 0) return res;
  }

  // Skenario 4: Deteksi berdasarkan nama sheet
  const sLow = sheetName.toLowerCase();
  if (sLow.includes("realisasi") || sLow.includes("actual")) {
    const res = parseFormRealisasiActual(rawMatrix, 6);
    if (res.length > 0) return res;
  } else if (sLow.includes("penilaian") || sLow.includes("matrix")) {
    const res = parseFormPenilaian(rawMatrix, 6);
    if (res.length > 0) return res;
  }

  return parseLegacyKpiMatrix(rawMatrix);
}

export function parseKpiExcelSheet(sheet: XLSX.WorkSheet, sheetName = ""): ExcelParsedBlock[] {
  const rawMatrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parseKpiExcelMatrix(rawMatrix, sheetName);
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
  keselamatankerja: "keselamatankerja",
  safety: "keselamatankerja",
  k3: "keselamatankerja",
  kepatuhandansp: "sp",
  sp: "sp",
  suratperingatan: "sp",
  inovasidanimprovement: "improvement",
  improvement: "improvement",
  inovasi: "improvement",
  costperbcm: "costbcm",
  bcm: "costbcm",
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
  } else if (u && (u.toLowerCase() === "rp" || u.toLowerCase() === "idr" || u.toLowerCase() === "rupiah")) {
    return `Rp ${val.toLocaleString("id-ID")}`;
  } else if (u && u.toLowerCase() === "teks") {
    return `${val}`;
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
    const itemWarnings = [...block.warningNotes];
    if (effectiveTarget === null) {
      // Ambil target langsung dari Kamus Parameter jika tidak terbaca di Excel
      if (ind?.target !== null && ind?.target !== undefined && !isNaN(Number(ind.target))) {
        effectiveTarget = Number(ind.target);
      } else {
        itemWarnings.push("Target pada Excel kosong atau tidak terbaca di Kolom U.");
      }
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

    const effectiveUnit = block.excelUnit || ind?.unit;
    const targetDisplay = formatValueWithUnit(effectiveTarget, effectiveUnit);
    const realizationDisplay = formatValueWithUnit(effectiveRealization, effectiveUnit);

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
        unit: effectiveUnit,
      });
    }

    const currentScore = ind?.currentScore ?? null;
    let newScore = scoreResult?.score ?? null;
    if (newScore === null && block.excelScore !== null && block.excelScore !== undefined) {
      newScore = block.excelScore;
    }
    const scoreDelta =
      newScore !== null && currentScore !== null ? newScore - currentScore : null;

    let finalWeightedScoreFraction = scoreResult?.finalScoreFraction ?? 0;
    let finalWeightedScorePct = scoreResult?.finalScorePercentage ?? 0;
    let finalWeightedScoreDisplay = scoreResult?.finalScoreDisplay ?? "0.0%";

    if (block.excelWeightedScore !== null && block.excelWeightedScore !== undefined) {
      finalWeightedScorePct = block.excelWeightedScore;
      finalWeightedScoreFraction = block.excelWeightedScore / 100;
      finalWeightedScoreDisplay = `${block.excelWeightedScore.toFixed(2)}%`;
    } else if (finalWeightedScoreFraction === 0 && newScore !== null && ind) {
      const maxScore = ind.maxScore || 25;
      const indW = normalizeWeight(ind.indicatorWeight);
      const catW = normalizeWeight(ind.parameterWeight);
      finalWeightedScoreFraction = maxScore > 0 ? (newScore / maxScore) * indW * catW : 0;
      finalWeightedScorePct = parseFloat((finalWeightedScoreFraction * 100).toFixed(2));
      finalWeightedScoreDisplay = `${finalWeightedScorePct}%`;
    }

    let realizationPct = scoreResult?.realizationPct ?? null;
    let realizationPctDisplay = scoreResult?.realizationPctDisplay ?? "-";
    if (
      (realizationPctDisplay === "-" || realizationPct === null) &&
      effectiveRealization !== null &&
      effectiveTarget !== null &&
      effectiveTarget > 0
    ) {
      if (effectiveUnit?.toLowerCase() === "teks") {
        realizationPct = effectiveRealization === effectiveTarget ? 100 : 0;
        realizationPctDisplay = `${realizationPct.toFixed(1)}%`;
      } else {
        realizationPct = parseFloat(((effectiveRealization / effectiveTarget) * 100).toFixed(1));
        realizationPctDisplay = `${realizationPct.toFixed(1)}%`;
      }
    }

    let bandLabel = scoreResult?.bandLabel ?? null;
    if (!bandLabel && block.excelBandCriteria) {
      bandLabel = block.excelBandCriteria;
    }

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
      excelScore: block.excelScore,
      excelWeightedScore: block.excelWeightedScore,
      excelUnit: block.excelUnit,
      excelBandCriteria: block.excelBandCriteria,
      excelPercentageText: block.excelPercentageText,
      hasMonthlyData: block.hasMonthlyData,

      effectiveTarget,
      targetDisplay,
      effectiveRealization,
      realizationDisplay,
      realizationPct,
      realizationPctDisplay,
      score: newScore,
      bandLabel,
      weightedScoreFraction: finalWeightedScoreFraction,
      weightedScorePct: finalWeightedScorePct,
      weightedScoreDisplay: finalWeightedScoreDisplay,
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

  const effectiveUnit = item.excelUnit || newInd.unit;
  const targetDisplay = formatValueWithUnit(effectiveTarget, effectiveUnit);
  const realizationDisplay = formatValueWithUnit(effectiveRealization, effectiveUnit);

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
      unit: effectiveUnit,
    });
  }

  const currentScore = newInd.currentScore ?? null;
  let newScore = scoreResult?.score ?? null;
  if (newScore === null && item.excelScore !== null && item.excelScore !== undefined) {
    newScore = item.excelScore;
  }
  const scoreDelta =
    newScore !== null && currentScore !== null ? newScore - currentScore : null;

  let finalWeightedScoreFraction = scoreResult?.finalScoreFraction ?? 0;
  let finalWeightedScorePct = scoreResult?.finalScorePercentage ?? 0;
  let finalWeightedScoreDisplay = scoreResult?.finalScoreDisplay ?? "0.0%";

  if (item.excelWeightedScore !== null && item.excelWeightedScore !== undefined) {
    finalWeightedScorePct = item.excelWeightedScore;
    finalWeightedScoreFraction = item.excelWeightedScore / 100;
    finalWeightedScoreDisplay = `${item.excelWeightedScore.toFixed(2)}%`;
  } else if (finalWeightedScoreFraction === 0 && newScore !== null && newInd) {
    const maxScore = newInd.maxScore || 25;
    const indW = normalizeWeight(newInd.indicatorWeight);
    const catW = normalizeWeight(newInd.parameterWeight);
    finalWeightedScoreFraction = maxScore > 0 ? (newScore / maxScore) * indW * catW : 0;
    finalWeightedScorePct = parseFloat((finalWeightedScoreFraction * 100).toFixed(2));
    finalWeightedScoreDisplay = `${finalWeightedScorePct}%`;
  }

  let realizationPct = scoreResult?.realizationPct ?? null;
  let realizationPctDisplay = scoreResult?.realizationPctDisplay ?? "-";
  if (
    (realizationPctDisplay === "-" || realizationPct === null) &&
    effectiveRealization !== null &&
    effectiveTarget !== null &&
    effectiveTarget > 0
  ) {
    if (effectiveUnit?.toLowerCase() === "teks") {
      realizationPct = effectiveRealization === effectiveTarget ? 100 : 0;
      realizationPctDisplay = `${realizationPct.toFixed(1)}%`;
    } else {
      realizationPct = parseFloat(((effectiveRealization / effectiveTarget) * 100).toFixed(1));
      realizationPctDisplay = `${realizationPct.toFixed(1)}%`;
    }
  }

  let bandLabel = scoreResult?.bandLabel ?? null;
  if (!bandLabel && item.excelBandCriteria) {
    bandLabel = item.excelBandCriteria;
  }

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
    realizationPct,
    realizationPctDisplay,
    score: newScore,
    bandLabel,
    weightedScoreFraction: finalWeightedScoreFraction,
    weightedScorePct: finalWeightedScorePct,
    weightedScoreDisplay: finalWeightedScoreDisplay,
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
      const norm = lower.replace(/:+$/, "").replace(/\s+/g, " ").trim();

      // Deteksi NIK
      if (!detectedNik) {
        if (
          norm === "nik" ||
          norm === "n.i.k" ||
          norm === "no. induk" ||
          norm === "no induk" ||
          norm === "badge id"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const belowVal = matrix[r + 1] ? String((matrix[r + 1] as unknown[])[c] || "").trim() : "";
          if (nextVal && !nextVal.toLowerCase().includes("nama")) {
            detectedNik = nextVal;
          } else if (belowVal) {
            detectedNik = belowVal;
          }
        } else {
          // Format standar NIK (misal 1.1025.273 atau 01.1224.001 atau 20.524.219)
          const nikMatch = cellStr.match(/\b\d{1,2}\.\d{3,4}\.\d{3,4}\b/);
          if (nikMatch) {
            detectedNik = nikMatch[0];
          }
        }
      }

      // Deteksi Nama
      if (!detectedName) {
        if (
          norm === "nama" ||
          norm === "nama karyawan" ||
          norm === "nama employee" ||
          norm === "nama pegawai" ||
          norm === "employee name"
        ) {
          const nextVal = String(row[c + 1] || "").trim();
          const belowVal = matrix[r + 1] ? String((matrix[r + 1] as unknown[])[c] || "").trim() : "";
          if (
            nextVal &&
            !nextVal.toLowerCase().includes("nik") &&
            !nextVal.toLowerCase().includes("jabatan") &&
            !nextVal.toLowerCase().includes("job")
          ) {
            detectedName = nextVal;
          } else if (belowVal) {
            detectedName = belowVal;
          }
        }
      }

      // Deteksi Departemen
      if (!detectedDept) {
        if (
          norm === "departemen" ||
          norm === "department" ||
          norm === "dept" ||
          norm === "divisi" ||
          norm === "bagian" ||
          norm === "unit"
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
          norm === "periode" ||
          norm === "tahun" ||
          norm === "period" ||
          norm === "tahun penilaian"
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
    const nikMatch = cleanSheetName.match(/\b\d{1,2}\.\d{3,4}\.\d{3,4}\b/);
    if (nikMatch) detectedNik = nikMatch[0];
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

  if (!detectedName) {
    if (
      !/^sheet\d+$/i.test(cleanSheetName) &&
      !/template|rekap|summary|panduan|form realisasi|form penilaian|kpi matrix|_system_mapping/i.test(cleanSheetName)
    ) {
      const nameCand = cleanSheetName
        .replace(/\b\d{1,2}\.\d{3,4}\.\d{3,4}\b/, "")
        .replace(/[-_()]/g, " ")
        .trim();
      if (nameCand.length > 2) {
        detectedName = nameCand;
      }
    }
    if (!detectedName && currentEmployee?.name && isCurrentEmployeeMatch) {
      detectedName = currentEmployee.name;
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
 * Mengekstrak baris parameter dari sheet Realisasi Departemen
 */
export function parseDepartmentKpiSheet(ws: XLSX.WorkSheet): ParsedDeptKpiRow[] {
  const result: ParsedDeptKpiRow[] = [];
  if (!ws || !ws["!ref"]) return result;

  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 3; r <= range.e.r; r++) {
    // Col 1 (B): Departemen, Col 3 (D): Nama Parameter, Col 4 (E): Satuan, Col 6 (G): Realisasi Tahunan
    const deptCell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    if (!nameCell || !nameCell.v) continue;

    const paramName = String(nameCell.v).trim();
    if (paramName.toUpperCase() === "NAMA PARAMETER" || paramName === "") continue;

    const deptName = deptCell && deptCell.v ? String(deptCell.v).trim() : "";
    const unitCell = ws[XLSX.utils.encode_cell({ r, c: 4 })];
    const rawUnit = unitCell && unitCell.v ? String(unitCell.v).trim().toLowerCase() : "%";
    const isPct = rawUnit === "%" || rawUnit.includes("persen");

    const annualCell = ws[XLSX.utils.encode_cell({ r, c: 6 })];
    let annualActual = sanitizeNumericCell(annualCell?.v);
    // Normalisasi skala persen jika user mengetik simbol '%' di Excel (misal 101% disimpan sebagai 1.01)
    if (annualActual !== null && isPct && annualActual > 0 && annualActual <= 2.5) {
      annualActual = Math.round(annualActual * 10000) / 100;
    }

    const monthlyActuals: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const mCell = ws[XLSX.utils.encode_cell({ r, c: 7 + m })];
      let mVal = sanitizeNumericCell(mCell?.v);
      if (mVal !== null && isPct && mVal > 0 && mVal <= 2.5) {
        mVal = Math.round(mVal * 10000) / 100;
      }
      monthlyActuals.push(mVal);
    }

    const noteCell = ws[XLSX.utils.encode_cell({ r, c: 19 })];
    const notes = noteCell && noteCell.v ? String(noteCell.v).trim() : undefined;

    result.push({
      departmentName: deptName,
      parameterName: paramName,
      annualActual,
      monthlyActuals,
      notes,
    });
  }

  return result;
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
  const parsedDepartmentKpis: ParsedDeptKpiRow[] = [];

  for (let i = 0; i < wb.SheetNames.length; i++) {
    const sheetName = wb.SheetNames[i];

    // Ekstrak sheet Realisasi Departemen jika ada
    if (/realisasi departemen/i.test(sheetName)) {
      const wsDept = wb.Sheets[sheetName];
      if (wsDept) {
        const dRows = parseDepartmentKpiSheet(wsDept);
        parsedDepartmentKpis.push(...dRows);
      }
      continue;
    }

    // Lewati sheet mapping sistem, panduan, dan rekap
    if (/^_system_mapping|panduan & ketentuan|panduan|^rekap$/i.test(sheetName)) {
      continue;
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const employeeInfo = extractSheetEmployeeInfo(ws, sheetName, currentEmployee);
    const blocks = parseKpiExcelSheet(ws, sheetName);
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

  // Cross-Sheet Correlation:
  // Jika ada Form Realisasi Actual DAN Form Penilaian dalam berkas yang sama:
  // Hubungkan nilai skor yang telah dievaluasi di Form Penilaian ke Form Realisasi Actual!
  const actualSheet = sheets.find((s) => /realisasi|actual/i.test(s.sheetName));
  const penilaianSheet = sheets.find((s) => /penilaian|matrix/i.test(s.sheetName));

  if (actualSheet && penilaianSheet) {
    for (const actItem of actualSheet.items) {
      const matchedP = penilaianSheet.items.find(
        (p) => cleanParamTitle(p.rawTitle) === cleanParamTitle(actItem.rawTitle)
      );
      if (matchedP) {
        // Form Realisasi Actual adalah sumber utama pengukuran aktual (misal 97%, 99%, 7%, 25M, 101%, 288).
        // HANYA gunakan skor dari Form Penilaian jika Form Realisasi Actual belum menghasilkan skor (misal teks/kualitatif)
        if (
          (actItem.score === null || actItem.score === undefined) &&
          matchedP.score !== null &&
          matchedP.score !== undefined
        ) {
          actItem.excelScore = matchedP.score;
          actItem.score = matchedP.score;
          actItem.weightedScoreFraction = matchedP.weightedScoreFraction;
          actItem.weightedScorePct = matchedP.weightedScorePct;
          actItem.weightedScoreDisplay = matchedP.weightedScoreDisplay;
        }
        if (matchedP.bandLabel && (!actItem.bandLabel || actItem.bandLabel === "Tidak cocok")) {
          actItem.bandLabel = matchedP.bandLabel;
        }
        if (matchedP.excelBandCriteria && (!actItem.bandLabel || actItem.bandLabel === "Tidak cocok")) {
          actItem.excelBandCriteria = matchedP.excelBandCriteria;
          actItem.bandLabel = matchedP.excelBandCriteria;
        }
        if (matchedP.excelUnit && !actItem.excelUnit) {
          actItem.excelUnit = matchedP.excelUnit;
        }
      }
    }
  }

  // Prioritaskan Form Realisasi Actual sebagai default activeSheetIndex jika memiliki data
  let activeSheetIndex = sheets.findIndex(
    (s) => /realisasi|actual/i.test(s.sheetName) && s.totalParsedBlocks > 0
  );
  if (activeSheetIndex === -1) {
    activeSheetIndex = sheets.findIndex(
      (s) => s.employeeInfo.isCurrentEmployeeMatch && s.totalParsedBlocks > 0
    );
  }
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
    departmentKpis: parsedDepartmentKpis,
  };
}
