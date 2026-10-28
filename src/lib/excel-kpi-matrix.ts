import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { formatCriteriaExcel, createGuideRows, parseConditionString } from "./excel-template-kpi";
import { cleanTemplateEmployeeName } from "./master-employee-matcher";

// =============================================================================
// TYPES & DATA STRUCTURES FOR CORPORATE KPI (2-FORM FORMAT: Penilaian & Actual)
// =============================================================================

export interface KpiMatrixIndicator {
  id?: number | null;
  code?: string;
  name: string;
  description?: string | null;
  target?: number | string | null;
  unit?: string | null;
  weight: number; // Fraction, e.g. 0.20 for 20%
  maxScore?: number; // e.g. 25
  realization?: number | string | null;
  score?: number | null;
  finalScorePercentage?: number | null;
  scoringRules: Array<{
    id?: number | null;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
    score: number;
  }>;
  monthlyTargets?: (number | null)[];
  monthlyActuals?: (number | null)[];
  aggregation?: string;
}

export interface KpiMatrixCategory {
  id?: number | null;
  number: number;
  name: string;
  weight: number; // Fraction, e.g. 0.65 for 65%
  indicators: KpiMatrixIndicator[];
}

export interface KpiMatrixSheetData {
  templateId?: number | null;
  employee: {
    id?: number | null;
    name: string;
    nik: string;
    jobPosition: string;
    departmentName: string;
  };
  jobLevelName?: string;
  periodYear: number | string;
  totalTargetWeight?: number; // e.g. 1.15 (115%)
  categories: KpiMatrixCategory[];
  summary?: {
    overallScoreDisplay?: string;
    grade?: string;
  };
  approvalLine?: {
    appraiser?: { name?: string | null; jobPosition?: string | null } | null;
    headDept?: { name?: string | null; jobPosition?: string | null } | null;
    manager?: { name?: string | null; jobPosition?: string | null } | null;
  } | null;
}

// =============================================================================
// STYLES DEFINITION (xlsx-js-style)
// =============================================================================

const borderThin = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};

// 1. Dark Navy Header (#0F2C59)
const styleNavyHeader = {
  fill: { fgColor: { rgb: "0F2C59" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

// 2. Navy Subheader for Month columns (#173A70)
const styleNavySubHeader = {
  fill: { fgColor: { rgb: "173A70" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

// 3. Category Separator Bar
const styleCategoryBar = {
  fill: { fgColor: { rgb: "EAECF0" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F2C59" } },
  border: borderThin,
  alignment: { vertical: "center" },
};

// 4. Employee Identity Labels (Bold) & Values (Normal)
const styleIdentityLabel = {
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "101828" } },
  border: borderThin,
  alignment: { vertical: "center" },
};

const styleIdentityValue = {
  font: { name: "Calibri", sz: 10, bold: false, color: { rgb: "101828" } },
  border: borderThin,
  alignment: { vertical: "center" },
};

// 5. Target Row Styles (Soft Slate #F8FAFC)
const styleTargetRowLeft = {
  fill: { fgColor: { rgb: "F8FAFC" } },
  font: { name: "Calibri", sz: 9.5, color: { rgb: "334155" } },
  border: borderThin,
  alignment: { vertical: "center", wrapText: true },
};

const styleTargetRowCenter = {
  fill: { fgColor: { rgb: "F8FAFC" } },
  font: { name: "Calibri", sz: 9.5, color: { rgb: "334155" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleTargetRowBoldCenter = {
  fill: { fgColor: { rgb: "F8FAFC" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "334155" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

// 6. Actual Row Styles (Clean White #FFFFFF)
const styleActualRowLeft = {
  fill: { fgColor: { rgb: "FFFFFF" } },
  font: { name: "Calibri", sz: 9.5, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { vertical: "center", wrapText: true },
};

const styleActualRowCenter = {
  fill: { fgColor: { rgb: "FFFFFF" } },
  font: { name: "Calibri", sz: 9.5, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleActualRowBoldCenter = {
  fill: { fgColor: { rgb: "FFFFFF" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "0F2C59" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

// 7. Actual Annual Realization Highlight (#F0F9FF soft cyan)
const styleActualHighlightCenter = {
  fill: { fgColor: { rgb: "F0F9FF" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "0369A1" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

// 8. General Table Styles (Form Penilaian)
const styleCellLeft = {
  font: { name: "Calibri", sz: 9.5, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { vertical: "center", wrapText: true },
};

const styleCellCenter = {
  font: { name: "Calibri", sz: 9.5, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleCellBoldCenter = {
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

// 9. Skor Cell Style (Strict Number format, NOT percentage)
const styleScoreCell = {
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
  numFmt: "0",
};

/**
 * Constructs an Excel dynamic IF formula for achieved score (0..25)
 * based on the realization cell (e.g. H8) and the indicator's scoring rules.
 * If realization is empty, it returns empty string ("").
 */
/**
 * Constructs the raw nested IF score calculation expression (0..25)
 * based on the realization cell (e.g. H8) and the indicator's scoring rules.
 */
export function buildIndicatorScoreExpression(
  cellRefH: string,
  bands: Array<{
    score: number | string;
    operator?: string | null;
    minValue?: number | string | null;
    maxValue?: number | string | null;
    label?: string | null;
  }>,
  unit?: string | null,
  target?: string | number | null
): string {
  if (!bands || bands.length === 0) {
    return "25";
  }

  // Parse and normalize bands
  const normalized = bands.map((b) => {
    let op = String(b.operator || "").toUpperCase();
    let min =
      b.minValue !== null && b.minValue !== undefined && b.minValue !== ""
        ? Number(b.minValue)
        : null;
    let max =
      b.maxValue !== null && b.maxValue !== undefined && b.maxValue !== ""
        ? Number(b.maxValue)
        : null;

    if (isNaN(min as number)) min = null;
    if (isNaN(max as number)) max = null;

    if ((!op || op === "TEXT" || (min === null && max === null)) && b.label) {
      const parsed = parseConditionString(b.label);
      if (parsed.operator !== "TEXT") {
        op = parsed.operator;
        if (min === null) min = parsed.minValue;
        if (max === null) max = parsed.maxValue;
      }
    }
    return {
      score: Number(b.score) || 0,
      op,
      min,
      max,
      label: (b.label || "").trim(),
    };
  }).sort((a, b) => b.score - a.score); // DESC by score

  if (normalized.length === 1) {
    return String(normalized[0].score);
  }

  const isPct = (unit || "").trim() === "%";

  const buildCondition = (b: (typeof normalized)[0]): string | null => {
    const { op, min, max, label } = b;

    if (op === "GTE" || op === ">=") {
      if (min !== null) {
        if (isPct && min > 1) {
          return `OR(${cellRefH}>=${min},AND(${cellRefH}>=${min / 100},${cellRefH}<=1))`;
        }
        return `${cellRefH}>=${min}`;
      }
    }

    if (op === "GT" || op === ">") {
      if (min !== null) {
        if (isPct && min > 1) {
          return `OR(${cellRefH}>${min},AND(${cellRefH}>${min / 100},${cellRefH}<=1))`;
        }
        return `${cellRefH}>${min}`;
      }
    }

    if (op === "LTE" || op === "<=") {
      const val = max ?? min;
      if (val !== null) {
        if (isPct && val > 1) {
          return `OR(${cellRefH}<=${val},AND(${cellRefH}<=${val / 100},${cellRefH}>0))`;
        }
        return `${cellRefH}<=${val}`;
      }
    }

    if (op === "LT" || op === "<") {
      const val = max ?? min;
      if (val !== null) {
        if (isPct && val > 1) {
          return `OR(${cellRefH}<${val},AND(${cellRefH}<${val / 100},${cellRefH}>0))`;
        }
        return `${cellRefH}<${val}`;
      }
    }

    if (op === "BETWEEN" || op === "RANGE") {
      if (min !== null && max !== null) {
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        if (isPct && lo > 1) {
          return `OR(AND(${cellRefH}>=${lo},${cellRefH}<=${hi}),AND(${cellRefH}>=${lo / 100},${cellRefH}<=${hi / 100}))`;
        }
        return `AND(${cellRefH}>=${lo},${cellRefH}<=${hi})`;
      }
    }

    if (op === "EQ" || op === "=") {
      const val = min ?? max;
      if (val !== null) return `${cellRefH}=${val}`;
    }

    // Text / Qualitative keywords (e.g. "Nol", "Zero", "Ringan", "Berat")
    if (label) {
      const words = label.match(/([a-zA-Z]{3,})/g);
      if (words && words.length > 0) {
        const sigWord = words.sort((w1, w2) => w2.length - w1.length)[0];
        return `ISNUMBER(SEARCH("${sigWord}",${cellRefH}))`;
      }
    }

    return null;
  };

  // The last band's score serves as fallback
  const fallbackScore = normalized[normalized.length - 1].score;
  let formula = String(fallbackScore);

  for (let i = normalized.length - 2; i >= 0; i--) {
    const b = normalized[i];
    const cond = buildCondition(b);
    if (cond) {
      formula = `IF(${cond},${b.score},${formula})`;
    }
  }

  return formula;
}

/**
 * Constructs an Excel dynamic IF formula for achieved score (0..25)
 * based on the realization cell (e.g. H8) and the indicator's scoring rules.
 * If realization is empty, it returns empty string ("").
 */
export function buildIndicatorScoreFormula(
  cellRefH: string,
  bands: Array<{
    score: number | string;
    operator?: string | null;
    minValue?: number | string | null;
    maxValue?: number | string | null;
    label?: string | null;
  }>,
  unit?: string | null,
  target?: string | number | null
): string {
  const expr = buildIndicatorScoreExpression(cellRefH, bands, unit, target);
  return `IF(OR(${cellRefH}="",ISBLANK(${cellRefH})),"",${expr})`;
}

const styleTableHeaderTotal = {
  fill: { fgColor: { rgb: "F2F4F7" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const MONTH_INDONESIA = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Helper to render identical employee identity on both forms
function renderEmployeeIdentityHeader(
  ws: any,
  merges: any[],
  rowsHeight: Record<number, { hpt: number }>,
  title: string,
  totalCols: number,
  data: KpiMatrixSheetData,
  setCell: (r: number, c: number, cell: any) => void,
  fillEmptyRange: (r: number, startC: number, endC: number, style: any) => void
) {
  // Row 0: Form Title
  setCell(0, 0, {
    t: "s",
    v: title,
    s: {
      fill: { fgColor: { rgb: "0F2C59" } },
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
  fillEmptyRange(0, 0, totalCols - 1, {
    fill: { fgColor: { rgb: "0F2C59" } },
    alignment: { horizontal: "center", vertical: "center" },
  });
  rowsHeight[0] = { hpt: 26 };

  // Row 1: Spacer
  rowsHeight[1] = { hpt: 6 };

  // Both sheets share identical column placement:
  // Col A: Left Label | Cols B..E: Left Value | Col F: Right Label | Cols G..End: Right Value
  const leftValEnd = 4; // Col E
  const rightLabelCol = 5; // Col F
  const rightValStart = 6; // Col G
  const rightValEnd = totalCols - 1;

  // Row 2: Nama Karyawan & Departemen
  setCell(2, 0, { t: "s", v: "Nama Karyawan:", s: styleIdentityLabel });
  setCell(2, 1, { t: "s", v: (data.employee.name || "").toUpperCase(), s: styleIdentityValue });
  if (leftValEnd > 1) {
    merges.push({ s: { r: 2, c: 1 }, e: { r: 2, c: leftValEnd } });
    fillEmptyRange(2, 1, leftValEnd, styleIdentityValue);
  }

  setCell(2, rightLabelCol, { t: "s", v: "Departemen:", s: styleIdentityLabel });
  setCell(2, rightValStart, { t: "s", v: data.employee.departmentName || "-", s: styleIdentityValue });
  if (rightValEnd > rightValStart) {
    merges.push({ s: { r: 2, c: rightValStart }, e: { r: 2, c: rightValEnd } });
    fillEmptyRange(2, rightValStart, rightValEnd, styleIdentityValue);
  }
  rowsHeight[2] = { hpt: 20 };

  // Row 3: NIK & Job Position
  setCell(3, 0, { t: "s", v: "NIK:", s: styleIdentityLabel });
  setCell(3, 1, { t: "s", v: data.employee.nik || "-", s: styleIdentityValue });
  if (leftValEnd > 1) {
    merges.push({ s: { r: 3, c: 1 }, e: { r: 3, c: leftValEnd } });
    fillEmptyRange(3, 1, leftValEnd, styleIdentityValue);
  }

  setCell(3, rightLabelCol, { t: "s", v: "Job Position:", s: styleIdentityLabel });
  setCell(3, rightValStart, { t: "s", v: data.employee.jobPosition || "-", s: styleIdentityValue });
  if (rightValEnd > rightValStart) {
    merges.push({ s: { r: 3, c: rightValStart }, e: { r: 3, c: rightValEnd } });
    fillEmptyRange(3, rightValStart, rightValEnd, styleIdentityValue);
  }
  rowsHeight[3] = { hpt: 20 };

  // Row 4: Tahun Penilaian & Job Level
  setCell(4, 0, { t: "s", v: "Tahun Penilaian:", s: styleIdentityLabel });
  setCell(4, 1, { t: "s", v: String(data.periodYear || "2026"), s: styleIdentityValue });
  if (leftValEnd > 1) {
    merges.push({ s: { r: 4, c: 1 }, e: { r: 4, c: leftValEnd } });
    fillEmptyRange(4, 1, leftValEnd, styleIdentityValue);
  }

  setCell(4, rightLabelCol, { t: "s", v: "Job Level:", s: styleIdentityLabel });
  setCell(4, rightValStart, { t: "s", v: data.jobLevelName || "-", s: styleIdentityValue });
  if (rightValEnd > rightValStart) {
    merges.push({ s: { r: 4, c: rightValStart }, e: { r: 4, c: rightValEnd } });
    fillEmptyRange(4, rightValStart, rightValEnd, styleIdentityValue);
  }
  rowsHeight[4] = { hpt: 20 };

  // Row 5: Spacer
  rowsHeight[5] = { hpt: 8 };
}

// =============================================================================
// SHEET 2 BUILDER: FORM REALISASI ACTUAL (19 Kolom, Jan-Des Input, Agregasi)
// =============================================================================

export function buildFormRealisasiActualWorksheet(data: KpiMatrixSheetData) {
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};
  const indicatorActualRowMap = new Map<number | string, number>();

  const setCell = (r: number, c: number, cell: any) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    ws[cellRef] = cell;
  };

  const fillEmptyRange = (r: number, startC: number, endC: number, style: any) => {
    for (let col = startC; col <= endC; col++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  // 1. Employee Header (Cols A..S, total 19 cols)
  renderEmployeeIdentityHeader(
    ws,
    merges,
    rowsHeight,
    "FORM REALISASI ACTUAL KPI BULANAN",
    19,
    data,
    setCell,
    fillEmptyRange
  );

  // 2. Table Headers (Row 6 & Row 7)
  // Row 6 (Excel 7)
  const row6Headers = [
    { text: "No", col: 0, rowSpan: 2 },
    { text: "Indikator", col: 1, rowSpan: 2 },
    { text: "Bobot Indikator (%)", col: 2, rowSpan: 2 },
    { text: "Target Tahunan", col: 3, rowSpan: 2 },
    { text: "Satuan", col: 4, rowSpan: 2 },
    { text: "Type", col: 5, rowSpan: 2 },
  ];

  row6Headers.forEach((h) => {
    setCell(6, h.col, { t: "s", v: h.text, s: styleNavyHeader });
    setCell(7, h.col, { t: "s", v: "", s: styleNavyHeader });
    merges.push({ s: { r: 6, c: h.col }, e: { r: 7, c: h.col } });
  });

  // Group Header: Realisasi Bulanan (Januari - Desember) Merged G7:R7
  setCell(6, 6, {
    t: "s",
    v: "Realisasi Bulanan (Januari - Desember)",
    s: styleNavyHeader,
  });
  merges.push({ s: { r: 6, c: 6 }, e: { r: 6, c: 17 } });
  fillEmptyRange(6, 6, 17, styleNavyHeader);

  // Col 18: Realisasi Tahunan Merged S7:S8
  setCell(6, 18, { t: "s", v: "Realisasi Tahunan", s: styleNavyHeader });
  setCell(7, 18, { t: "s", v: "", s: styleNavyHeader });
  merges.push({ s: { r: 6, c: 18 }, e: { r: 7, c: 18 } });

  // Row 7 (Excel 8): Month Names
  MONTH_INDONESIA.forEach((mName, mIdx) => {
    setCell(7, 6 + mIdx, { t: "s", v: mName, s: styleNavySubHeader });
  });

  rowsHeight[6] = { hpt: 22 };
  rowsHeight[7] = { hpt: 20 };

  // 3. Data Rows (Starts Row 8, Excel 9)
  let currentR = 8;
  const sortedCategories = [...data.categories].sort(
    (a, b) => a.number - b.number || a.name.localeCompare(b.name)
  );

  sortedCategories.forEach((cat) => {
    const catWeightPct = cat.weight > 1 ? cat.weight : cat.weight * 100;

    // Category Header Bar
    const catTitle = `${cat.number}. ${cat.name.toUpperCase()} (${Math.round(catWeightPct)}%)`;
    setCell(currentR, 0, { t: "s", v: catTitle, s: styleCategoryBar });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 18 } });
    fillEmptyRange(currentR, 0, 18, styleCategoryBar);
    rowsHeight[currentR] = { hpt: 20 };
    currentR++;

    cat.indicators.forEach((ind, indIdx) => {
      const noStr = `${cat.number}.${indIdx + 1}`;
      const indKey = ind.id ?? `${cat.number}_${indIdx}`;
      const indWeightFrac = ind.weight > 1 ? ind.weight / 100 : ind.weight;
      const targetVal = ind.target !== null && ind.target !== undefined ? ind.target : "100";
      const unitVal = ind.unit || "%";
      const numTarget = Number(targetVal);
      const isTargetNumeric = !isNaN(numTarget);

      const targetRowExcel = currentR + 1; // 1-indexed
      const actualRowExcel = currentR + 2; // 1-indexed
      indicatorActualRowMap.set(indKey, actualRowExcel);

      const agg = String(ind.aggregation || "AVERAGE").toUpperCase();
      const isSum = agg === "SUM";
      const isLastValue = agg === "LAST_VALUE";
      const isRatio = agg === "RATIO";
      const isAverage = agg === "AVERAGE" || (!isSum && !isLastValue && !isRatio);

      // --- BARIS 1: TARGET ---
      setCell(currentR, 0, { t: "s", v: noStr, s: styleTargetRowCenter });
      setCell(currentR, 1, { t: "s", v: ind.name, s: styleTargetRowLeft });
      setCell(currentR, 2, { t: "n", v: indWeightFrac, z: "0%", s: styleTargetRowCenter });
      setCell(currentR, 3, {
        t: isTargetNumeric ? "n" : "s",
        v: isTargetNumeric ? numTarget : targetVal,
        s: styleTargetRowCenter,
      });
      setCell(currentR, 4, { t: "s", v: unitVal, s: styleTargetRowCenter });
      setCell(currentR, 5, { t: "s", v: "Target", s: styleTargetRowBoldCenter });

      // Monthly Targets (Cols G..R)
      for (let m = 0; m < 12; m++) {
        let mTargetVal: any = "";
        if (ind.monthlyTargets && ind.monthlyTargets[m] !== null && ind.monthlyTargets[m] !== undefined) {
          mTargetVal = ind.monthlyTargets[m];
        } else if (isTargetNumeric) {
          mTargetVal = isSum ? Math.round((numTarget / 12) * 100) / 100 : numTarget;
        } else {
          mTargetVal = targetVal;
        }

        const isMTargetNum = typeof mTargetVal === "number";
        setCell(currentR, 6 + m, {
          t: isMTargetNum ? "n" : "s",
          v: mTargetVal,
          s: styleTargetRowCenter,
        });
      }

      // Realisasi Tahunan Target (Col S)
      if (isSum) {
        setCell(currentR, 18, {
          t: "n",
          f: `SUM(G${targetRowExcel}:R${targetRowExcel})`,
          s: styleTargetRowBoldCenter,
        });
      } else if (isAverage && isTargetNumeric) {
        setCell(currentR, 18, {
          t: "n",
          f: `IFERROR(AVERAGE(G${targetRowExcel}:R${targetRowExcel}), D${targetRowExcel})`,
          s: styleTargetRowBoldCenter,
        });
      } else {
        setCell(currentR, 18, {
          t: isTargetNumeric ? "n" : "s",
          f: `D${targetRowExcel}`,
          s: styleTargetRowBoldCenter,
        });
      }
      rowsHeight[currentR] = { hpt: 20 };
      currentR++;

      // --- BARIS 2: ACTUAL (Input Pengguna) ---
      setCell(currentR, 0, { t: "s", v: "", s: styleActualRowCenter });
      setCell(currentR, 1, { t: "s", v: "", s: styleActualRowLeft });
      setCell(currentR, 2, { t: "s", v: "", s: styleActualRowCenter });
      setCell(currentR, 3, { t: "s", v: "", s: styleActualRowCenter });
      setCell(currentR, 4, { t: "s", v: "", s: styleActualRowCenter });
      setCell(currentR, 5, { t: "s", v: "Actual", s: styleActualRowBoldCenter });

      // Monthly Actuals (Cols G..R) - Sel Input
      for (let m = 0; m < 12; m++) {
        const actVal =
          ind.monthlyActuals && ind.monthlyActuals[m] !== null && ind.monthlyActuals[m] !== undefined
            ? ind.monthlyActuals[m]
            : "";
        const isActNum = typeof actVal === "number";

        setCell(currentR, 6 + m, {
          t: isActNum ? "n" : "s",
          v: actVal,
          s: styleActualRowCenter,
        });
      }

      // Realisasi Tahunan Actual (Col S) Formula
      let actualFormula = "";
      if (isSum) {
        actualFormula = `IF(COUNT(G${actualRowExcel}:R${actualRowExcel})>0, SUM(G${actualRowExcel}:R${actualRowExcel}), "")`;
      } else if (isLastValue) {
        actualFormula = `IFERROR(LOOKUP(2, 1/(G${actualRowExcel}:R${actualRowExcel}<>""), G${actualRowExcel}:R${actualRowExcel}), "")`;
      } else if (isRatio) {
        actualFormula = `IF(SUM(G${targetRowExcel}:R${targetRowExcel})>0, SUM(G${actualRowExcel}:R${actualRowExcel})/SUM(G${targetRowExcel}:R${targetRowExcel}), "")`;
      } else {
        // Default AVERAGE (only calculate if at least 1 month is filled)
        actualFormula = `IF(COUNT(G${actualRowExcel}:R${actualRowExcel})>0, AVERAGE(G${actualRowExcel}:R${actualRowExcel}), "")`;
      }

      setCell(currentR, 18, {
        t: ind.realization !== null && ind.realization !== undefined ? (typeof ind.realization === "number" ? "n" : "s") : "s",
        f: actualFormula,
        v: ind.realization !== null && ind.realization !== undefined ? ind.realization : "",
        s: styleActualHighlightCenter,
      });

      // Merge cols 0..4 between Target and Actual row
      for (let c = 0; c <= 4; c++) {
        merges.push({ s: { r: targetRowExcel - 1, c }, e: { r: actualRowExcel - 1, c } });
      }

      rowsHeight[currentR] = { hpt: 20 };
      currentR++;
    });
  });

  // Freeze Panes: freeze rows 1..8, and freeze cols A..F so indicator names stay pinned
  ws["!freeze"] = { xSplit: "6", ySplit: "8", topLeftCell: "G9", activePane: "bottomRight", state: "frozen" };
  ws["!views"] = [{ state: "frozen", xSplit: 6, ySplit: 8, activeCell: "G9", sqref: "G9" }];

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentR, c: 18 },
  });
  ws["!merges"] = merges;
  ws["!rows"] = rowsHeight;

  ws["!cols"] = [
    { wch: 8 },  // A: No
    { wch: 32 }, // B: Indikator
    { wch: 18 }, // C: Bobot Indikator (%)
    { wch: 16 }, // D: Target Tahunan
    { wch: 12 }, // E: Satuan
    { wch: 12 }, // F: Type
    { wch: 10 }, // G: Januari
    { wch: 10 }, // H: Februari
    { wch: 10 }, // I: Maret
    { wch: 10 }, // J: April
    { wch: 10 }, // K: Mei
    { wch: 10 }, // L: Juni
    { wch: 10 }, // M: Juli
    { wch: 10 }, // N: Agustus
    { wch: 10 }, // O: September
    { wch: 10 }, // P: Oktober
    { wch: 10 }, // Q: November
    { wch: 10 }, // R: Desember
    { wch: 18 }, // S: Realisasi Tahunan
  ];

  return { ws, indicatorActualRowMap };
}

// =============================================================================
// SHEET 1 BUILDER: FORM PENILAIAN (12 Kolom, Terhubung Dinamis ke Sheet 2)
// =============================================================================

export function buildFormPenilaianWorksheet(
  data: KpiMatrixSheetData,
  actualSheetName: string,
  indicatorActualRowMap: Map<number | string, number>
) {
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};
  const nilaiAkhirCellRefs: string[] = [];

  const setCell = (r: number, c: number, cell: any) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    ws[cellRef] = cell;
  };

  const fillEmptyRange = (r: number, startC: number, endC: number, style: any) => {
    for (let col = startC; col <= endC; col++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  // 1. Employee Header (Cols A..L, total 12 cols)
  renderEmployeeIdentityHeader(
    ws,
    merges,
    rowsHeight,
    "FORM PENILAIAN KPI KARYAWAN",
    12,
    data,
    setCell,
    fillEmptyRange
  );

  // 2. Table Headers (Row 6, Excel 7)
  const headers = [
    "No",
    "Parameter",
    "Bobot Parameter (%)",
    "Indikator",
    "Bobot Indikator (%)",
    "Target Tahunan",
    "Satuan",
    "Realisasi Tahunan",
    "Kriteria Penilaian",
    "Skor",
    "Nilai Akhir",
    "Deskripsi",
  ];

  headers.forEach((h, colIdx) => {
    setCell(6, colIdx, { t: "s", v: h, s: styleNavyHeader });
  });
  rowsHeight[6] = { hpt: 26 };

  // 3. Data Rows (Starts Row 7, Excel 8)
  let currentR = 7;
  const sortedCategories = [...data.categories].sort(
    (a, b) => a.number - b.number || a.name.localeCompare(b.name)
  );

  sortedCategories.forEach((cat) => {
    const catWeightFrac = cat.weight > 1 ? cat.weight / 100 : cat.weight;
    const catWeightPct = Math.round(catWeightFrac * 100);

    // Category Separator Bar
    const catTitle = `${cat.number}. ${cat.name.toUpperCase()} (${catWeightPct}%)`;
    setCell(currentR, 0, { t: "s", v: catTitle, s: styleCategoryBar });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 11 } });
    fillEmptyRange(currentR, 0, 11, styleCategoryBar);
    rowsHeight[currentR] = { hpt: 20 };
    currentR++;

    cat.indicators.forEach((ind, indIdx) => {
      const noStr = `${cat.number}.${indIdx + 1}`;
      const indKey = ind.id ?? `${cat.number}_${indIdx}`;
      const indWeightFrac = ind.weight > 1 ? ind.weight / 100 : ind.weight;
      const targetVal = ind.target !== null && ind.target !== undefined ? ind.target : "100";
      const unitVal = ind.unit || "%";
      const numTarget = Number(targetVal);
      const isTargetNumeric = !isNaN(numTarget);

      // Find the row number of this indicator's Actual row in Form Realisasi Actual
      const actRowExcel = indicatorActualRowMap.get(indKey) || currentR + 1;
      const indStartRow = currentR;

      // Bands sorted descending by score (25, 15, 5, 0)
      const bands = [...(ind.scoringRules || [])].sort(
        (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      );
      if (bands.length === 0) {
        bands.push(
          { label: "Tercapai", score: 25 },
          { label: "Cukup", score: 15 },
          { label: "Kurang", score: 5 }
        );
      }

      const b1 = bands[0];
      const maxScoreVal = ind.maxScore || 25;
      const scoreVal = ind.score !== null && ind.score !== undefined ? Number(ind.score) : Number(b1.score);

      // --- ROW 1 (Band 1) ---
      setCell(currentR, 0, { t: "s", v: noStr, s: styleCellCenter });
      setCell(currentR, 1, { t: "s", v: cat.name, s: styleCellLeft });
      setCell(currentR, 2, { t: "n", v: catWeightFrac, z: "0%", s: styleCellBoldCenter });
      setCell(currentR, 3, { t: "s", v: ind.name, s: styleCellLeft });
      setCell(currentR, 4, { t: "n", v: indWeightFrac, z: "0%", s: styleCellBoldCenter });
      setCell(currentR, 5, {
        t: isTargetNumeric ? "n" : "s",
        v: isTargetNumeric ? numTarget : targetVal,
        s: styleCellCenter,
      });
      setCell(currentR, 6, { t: "s", v: unitVal, s: styleCellCenter });

      const excelR1 = currentR + 1; // 1-indexed row number
      const rawScoreExpr = buildIndicatorScoreExpression(
        `H${excelR1}`,
        bands,
        unitVal,
        targetVal
      );

      // Col H: Realisasi Tahunan (FORMULA LINK KE SHEET FORM REALISASI ACTUAL!)
      const escapedSheetName = actualSheetName.includes(" ") ? `'${actualSheetName}'` : actualSheetName;
      setCell(currentR, 7, {
        t: ind.realization !== null && ind.realization !== undefined ? (typeof ind.realization === "number" ? "n" : "s") : "s",
        f: `IF(${escapedSheetName}!S${actRowExcel}="","",${escapedSheetName}!S${actRowExcel})`,
        v: ind.realization !== null && ind.realization !== undefined ? ind.realization : "",
        s: styleActualHighlightCenter,
      });

      // Col I: Kriteria Penilaian Band 1
      const b1Text = formatCriteriaExcel(b1.label, b1.operator || "TEXT", b1.minValue, b1.maxValue, unitVal);
      const b1Display = b1Text.toLowerCase().includes("skor") ? b1Text : `${b1Text} (Skor: ${b1.score})`;
      setCell(currentR, 8, {
        t: "s",
        v: b1Display,
        s: styleCellLeft,
      });

      // Col J: Skor Band 1 (Format Integer Number 0, sejajar dengan kriteria baris 1)
      setCell(currentR, 9, {
        t: "n",
        v: Number(b1.score),
        z: "0",
        s: styleScoreCell,
      });

      // Col K: Nilai Akhir = (Skor / MaxScore) * BobotIndikator * BobotParameter (Merged vertikal)
      nilaiAkhirCellRefs.push(`K${excelR1}`);
      const hasInitialScore = typeof ind.score === "number" && !isNaN(ind.score);
      const precalcNilaiAkhir =
        hasInitialScore
          ? (Number(ind.score) / maxScoreVal) * indWeightFrac * catWeightFrac
          : "";

      setCell(currentR, 10, {
        t: hasInitialScore && precalcNilaiAkhir !== "" ? "n" : "s",
        f: `IF(OR(H${excelR1}="",ISBLANK(H${excelR1})),"",(${rawScoreExpr}/${maxScoreVal})*E${excelR1}*C${excelR1})`,
        v: hasInitialScore ? precalcNilaiAkhir : "",
        z: "0.0%",
        s: styleCellBoldCenter,
      });

      // Col L: Deskripsi
      setCell(currentR, 11, {
        t: "s",
        v: ind.description || "",
        s: styleCellLeft,
      });

      rowsHeight[currentR] = { hpt: 20 };
      currentR++;

      // --- SUBSEQUENT BANDS (Band 2..n) ---
      for (let bIdx = 1; bIdx < bands.length; bIdx++) {
        const b = bands[bIdx];
        setCell(currentR, 0, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 1, { t: "s", v: "", s: styleCellLeft });
        setCell(currentR, 2, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 3, { t: "s", v: "", s: styleCellLeft });
        setCell(currentR, 4, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 5, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 6, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 7, { t: "s", v: "", s: styleCellCenter });

        // Criteria Label & Score Description
        const bText = formatCriteriaExcel(b.label, b.operator || "TEXT", b.minValue, b.maxValue, unitVal);
        const bDisplay = bText.toLowerCase().includes("skor") ? bText : `${bText} (Skor: ${b.score})`;
        setCell(currentR, 8, {
          t: "s",
          v: bDisplay,
          s: styleCellLeft,
        });

        // Col J: Skor Band masing-masing baris (Format Integer Number 0, sejajar dengan kriteria, TIDAK dimerge)
        setCell(currentR, 9, {
          t: "n",
          v: Number(b.score),
          z: "0",
          s: styleScoreCell,
        });

        setCell(currentR, 10, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 11, { t: "s", v: "", s: styleCellLeft });

        rowsHeight[currentR] = { hpt: 19 };
        currentR++;
      }

      // Vertical Merging for indicator rows across bands (Cols 0..7, 10, 11)
      // Catatan: Col 8 (Kriteria Penilaian) dan Col 9 (Skor) sengaja TIDAK digabung secara vertikal
      // agar setiap baris kriteria menampilkan skor masing-masing secara sejajar.
      if (bands.length > 1) {
        const endRow = currentR - 1;
        const mergeCols = [0, 1, 2, 3, 4, 5, 6, 7, 10, 11];
        mergeCols.forEach((col) => {
          merges.push({ s: { r: indStartRow, c: col }, e: { r: endRow, c: col } });
        });
      }
    });
  });

  // 4. TOTAL ROW AT BOTTOM
  setCell(currentR, 0, { t: "s", v: "TOTAL", s: styleTableHeaderTotal });
  setCell(currentR, 1, { t: "s", v: "", s: styleTableHeaderTotal });
  merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 1 } });

  // Total Target Weight (e.g. 115%)
  const totalTargetWeightFrac = data.totalTargetWeight || 1.15;
  setCell(currentR, 2, {
    t: "n",
    v: totalTargetWeightFrac,
    z: "0%",
    s: styleTableHeaderTotal,
  });

  fillEmptyRange(currentR, 3, 9, styleTableHeaderTotal);

  // Total Nilai Akhir Formula: SUM of all Nilai Akhir (blank if no indicators are filled)
  const sumFormula =
    nilaiAkhirCellRefs.length > 0
      ? `IF(COUNT(${nilaiAkhirCellRefs.join(",")})=0,"",SUM(${nilaiAkhirCellRefs.join(",")}))`
      : '""';
  const overallPrecalc = data.summary?.overallScoreDisplay
    ? parseFloat(data.summary.overallScoreDisplay) / 100
    : "";

  setCell(currentR, 10, {
    t: overallPrecalc !== "" ? "n" : "s",
    f: sumFormula,
    v: overallPrecalc,
    z: "0.0%",
    s: styleTableHeaderTotal,
  });

  setCell(currentR, 11, { t: "s", v: "", s: styleTableHeaderTotal });
  rowsHeight[currentR] = { hpt: 24 };
  currentR++;

  // 5. SIGNATURES BLOCK (Optional)
  if (data.approvalLine) {
    currentR += 2;
    const sigHeaders = ["Karyawan Yang Dinilai", "Penilai (Supervisor)", "Head Department"];

    setCell(currentR, 0, { t: "s", v: sigHeaders[0], s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 3 } });
    fillEmptyRange(currentR, 0, 3, styleCellBoldCenter);

    setCell(currentR, 4, { t: "s", v: sigHeaders[1], s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 4 }, e: { r: currentR, c: 7 } });
    fillEmptyRange(currentR, 4, 7, styleCellBoldCenter);

    setCell(currentR, 8, { t: "s", v: sigHeaders[2], s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 8 }, e: { r: currentR, c: 11 } });
    fillEmptyRange(currentR, 8, 11, styleCellBoldCenter);
    rowsHeight[currentR] = { hpt: 20 };
    currentR++;

    currentR += 3; // Space for signature

    const empName = `( ${data.employee.name} )`;
    const appraiserName = `( ${data.approvalLine.appraiser?.name || "Atasan Langsung"} )`;
    const headDeptName = `( ${data.approvalLine.headDept?.name || "Head Department"} )`;

    setCell(currentR, 0, { t: "s", v: empName, s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 3 } });

    setCell(currentR, 4, { t: "s", v: appraiserName, s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 4 }, e: { r: currentR, c: 7 } });

    setCell(currentR, 8, { t: "s", v: headDeptName, s: styleCellBoldCenter });
    merges.push({ s: { r: currentR, c: 8 }, e: { r: currentR, c: 11 } });
    rowsHeight[currentR] = { hpt: 20 };
  }

  // Freeze Panes: freeze rows 1..7 so table headers stay pinned
  ws["!freeze"] = { xSplit: "0", ySplit: "7", topLeftCell: "A8", activePane: "bottomLeft", state: "frozen" };
  ws["!views"] = [{ state: "frozen", xSplit: 0, ySplit: 7, activeCell: "A8", sqref: "A8" }];

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentR, c: 11 },
  });
  ws["!merges"] = merges;
  ws["!rows"] = rowsHeight;

  ws["!cols"] = [
    { wch: 8 },  // A: No
    { wch: 28 }, // B: Parameter
    { wch: 18 }, // C: Bobot Parameter (%)
    { wch: 32 }, // D: Indikator
    { wch: 18 }, // E: Bobot Indikator (%)
    { wch: 16 }, // F: Target Tahunan
    { wch: 12 }, // G: Satuan
    { wch: 18 }, // H: Realisasi Tahunan
    { wch: 35 }, // I: Kriteria Penilaian
    { wch: 10 }, // J: Skor
    { wch: 14 }, // K: Nilai Akhir
    { wch: 30 }, // L: Deskripsi
  ];

  return ws;
}

// =============================================================================
// SYSTEM MAPPING BUILDER (For Excel Re-import Compatibility)
// =============================================================================

export function buildSystemMappingRows(data: KpiMatrixSheetData) {
  const mappingHeaders = [
    "row_index",
    "template_id",
    "parameter_id",
    "parameter_name",
    "indicator_id",
    "indicator_name",
    "criteria_id",
    "criteria_label",
    "criteria_score",
    "row_type",
  ];
  const mappingRows: (string | number | null)[][] = [mappingHeaders];
  let globalRowCounter = 0;

  for (const cat of data.categories) {
    for (const ind of cat.indicators) {
      // 1. Target row
      globalRowCounter++;
      const b1 = ind.scoringRules[0];
      mappingRows.push([
        globalRowCounter,
        data.templateId || null,
        cat.id || null,
        cat.name,
        ind.id || null,
        ind.name,
        b1?.id || null,
        b1?.label || "",
        b1 ? Number(b1.score) : null,
        "Target",
      ]);

      // 2. Actual row
      globalRowCounter++;
      const b2 = ind.scoringRules[1];
      mappingRows.push([
        globalRowCounter,
        data.templateId || null,
        cat.id || null,
        cat.name,
        ind.id || null,
        ind.name,
        b2?.id || null,
        b2?.label || "",
        b2 ? Number(b2.score) : null,
        "Actual",
      ]);

      // Extra criteria bands
      for (let bIdx = 2; bIdx < ind.scoringRules.length; bIdx++) {
        const bExtra = ind.scoringRules[bIdx];
        globalRowCounter++;
        mappingRows.push([
          globalRowCounter,
          data.templateId || null,
          cat.id || null,
          cat.name,
          ind.id || null,
          ind.name,
          bExtra.id || null,
          bExtra.label,
          Number(bExtra.score),
          "Criteria",
        ]);
      }
    }
  }

  return mappingRows;
}

// Backward compatibility helper if needed
export function buildCorporateKpiMatrixWorksheet(data: KpiMatrixSheetData) {
  const { ws: wsActual, indicatorActualRowMap } = buildFormRealisasiActualWorksheet(data);
  return buildFormPenilaianWorksheet(data, "Form Realisasi Actual", indicatorActualRowMap);
}

// =============================================================================
// CONVERTER HELPERS: FROM TEMPLATE TO MATRIX DATA & EVALUATION TO MATRIX DATA
// =============================================================================

export function convertTemplateToMatrixData({
  template,
  departmentName,
  jobLevelName,
  periodYear = "2026",
  employee,
  categories,
  parameters,
  bands,
}: {
  template: {
    id?: number;
    name: string;
    totalWeight?: string | number | null;
    departmentId?: number | null;
    jobLevelId?: number | null;
  };
  departmentName?: string;
  jobLevelName?: string;
  periodYear?: string | number;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentName?: string | null;
  } | null;
  categories: Array<{
    id?: number;
    name: string;
    weight: string | number;
    categoryNumber?: number;
  }>;
  parameters: Array<{
    id?: number;
    categoryId?: number;
    name: string;
    target?: string | number | null;
    unit?: string | null;
    weight: string | number;
    code?: string | null;
    maxScore?: string | number | null;
    monthlyTargets?: (number | null)[] | null;
    monthlyActuals?: (number | null)[] | null;
    aggregation?: string | null;
    description?: string | null;
  }>;
  bands: Array<{
    id?: number;
    parameterId?: number;
    label: string;
    operator?: string | null;
    minValue?: string | number | null;
    maxValue?: string | number | null;
    score: string | number;
    sortOrder?: number | null;
  }>;
}): KpiMatrixSheetData {
  let empName = employee?.name || "";
  let empNik = employee?.nik || "";
  let empJobPosition = employee?.jobPosition || "";
  const empDept = employee?.departmentName || departmentName || "Semua Departemen";

  if (!empName && template.name.includes("[Personal]")) {
    const raw = template.name.replace("[Personal]", "").trim();
    const parts = raw.split("-").map((s) => s.trim());
    if (parts.length >= 2) {
      empName = parts[0];
      if (!empJobPosition) empJobPosition = parts.slice(1).join(" - ");
    } else if (parts.length === 1) {
      empName = parts[0];
    }
  }
  if (!empName || empName.startsWith("Template KPI") || empName.startsWith("[Personal]")) {
    empName = cleanTemplateEmployeeName(empName || template.name) || template.name;
  }
  if (!empJobPosition || empJobPosition === "-") {
    empJobPosition = jobLevelName || "-";
  }

  const sortedCats = [...categories].sort((a, b) => (a.id || 0) - (b.id || 0));

  const matrixCategories: KpiMatrixCategory[] = sortedCats.map((cat, catIdx) => {
    const cParams = parameters.filter((p) => p.categoryId === cat.id);
    const indicators: KpiMatrixIndicator[] = cParams.map((p) => {
      const pBands = bands
        .filter((b) => b.parameterId === p.id)
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); // DESC

      return {
        id: p.id,
        code: p.code || undefined,
        name: p.name,
        description: p.description || "",
        target: p.target || "100",
        unit: p.unit || "%",
        weight: Number(p.weight) || 1,
        maxScore: Number(p.maxScore) || 25,
        realization: null,
        score: null,
        aggregation: p.aggregation || "AVERAGE",
        scoringRules: pBands.map((b) => ({
          id: b.id,
          label: b.label,
          operator: b.operator || "TEXT",
          minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
          maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
          score: Number(b.score) || 0,
        })),
        monthlyTargets: p.monthlyTargets || Array(12).fill(Number(p.target) || 100),
        monthlyActuals: p.monthlyActuals || Array(12).fill(null),
      };
    });

    return {
      id: cat.id,
      number: cat.categoryNumber || catIdx + 1,
      name: cat.name,
      weight: Number(cat.weight) || 0,
      indicators,
    };
  });

  return {
    templateId: template.id,
    employee: {
      id: employee?.id,
      name: empName,
      nik: empNik,
      jobPosition: empJobPosition,
      departmentName: empDept,
    },
    jobLevelName: jobLevelName || "-",
    periodYear: periodYear || "2026",
    totalTargetWeight: Number(template.totalWeight) || 1.15,
    categories: matrixCategories,
  };
}

export function convertEvaluationToMatrixData(params: {
  employee: {
    name: string;
    nik: string;
    jobPosition: string;
    departmentName: string;
    templateName?: string;
  };
  period: {
    year: number;
    name?: string;
  };
  summary: {
    overallScoreDisplay: string;
    grade: string;
  };
  categories: Array<{
    categoryId?: number;
    categoryNumber: number;
    categoryName: string;
    categoryWeight: number;
    scorePercentage?: number;
    annualScorePercentage?: number;
    indicators: any[];
  }>;
  approvalLine?: {
    appraiser?: { name?: string | null; jobPosition?: string | null } | null;
    headDept?: { name?: string | null; jobPosition?: string | null } | null;
    manager?: { name?: string | null; jobPosition?: string | null } | null;
  } | null;
}): KpiMatrixSheetData {
  const { employee, period, summary, categories, approvalLine } = params;

  const matrixCategories: KpiMatrixCategory[] = categories.map((cat, catIdx) => {
    const indicators: KpiMatrixIndicator[] = (cat.indicators || []).map((ind: any) => {
      const scoringRules = (ind.scoringRules || []).map((r: any) => ({
        id: r.id,
        label: r.label,
        operator: r.operator || "TEXT",
        minValue: r.minValue !== null && r.minValue !== undefined ? Number(r.minValue) : null,
        maxValue: r.maxValue !== null && r.maxValue !== undefined ? Number(r.maxValue) : null,
        score: Number(r.score) || 0,
      }));

      // Extract 12 months targets & actuals
      const monthlyTargets = Array.from({ length: 12 }, (_, i) => {
        const md = (ind.monthlyDetails || []).find((m: any) => m.month === i + 1);
        if (md?.target !== undefined && md?.target !== null && md?.target !== "") {
          return Number(md.target);
        }
        return ind.target !== null && ind.target !== undefined && ind.target !== ""
          ? Number(ind.target)
          : 100;
      });

      const monthlyActuals = Array.from({ length: 12 }, (_, i) => {
        const md = (ind.monthlyDetails || []).find((m: any) => m.month === i + 1);
        if (md?.actual !== undefined && md?.actual !== null && md?.actual !== "") {
          return Number(md.actual);
        }
        return null;
      });

      const weightVal = Number(ind.indicatorWeight || ind.weight) || 1;
      const finalWeightFrac = weightVal > 1 ? weightVal / 100 : weightVal;

      return {
        id: ind.id,
        code: ind.code || undefined,
        name: ind.indicatorName || ind.name,
        description: ind.description || "",
        target: ind.target !== undefined && ind.target !== null ? ind.target : 100,
        unit: ind.unit || "%",
        weight: finalWeightFrac,
        maxScore: Number(ind.maxScore) || 25,
        realization: ind.annualActual !== undefined && ind.annualActual !== null ? ind.annualActual : null,
        score: ind.annualScore !== undefined && ind.annualScore !== null ? Number(ind.annualScore) : null,
        finalScorePercentage:
          ind.annualScorePercentage !== undefined && ind.annualScorePercentage !== null
            ? Number(ind.annualScorePercentage)
            : null,
        scoringRules,
        monthlyTargets,
        monthlyActuals,
        aggregation: ind.aggregation || "AVERAGE",
      };
    });

    const catWeightVal = Number(cat.categoryWeight) || 0;
    const catWeightFrac = catWeightVal > 1 ? catWeightVal / 100 : catWeightVal;

    return {
      id: cat.categoryId,
      number: cat.categoryNumber || catIdx + 1,
      name: cat.categoryName,
      weight: catWeightFrac,
      indicators,
    };
  });

  return {
    employee,
    periodYear: period.year,
    categories: matrixCategories,
    summary,
    approvalLine,
  };
}

// =============================================================================
// EXPORT SINGLE EMPLOYEE / TEMPLATE WORKBOOK (2 FORMS: Form Penilaian & Form Realisasi Actual)
// =============================================================================

export function exportCorporateKpiMatrixExcel(
  data: KpiMatrixSheetData,
  customFilename?: string
) {
  const wb = XLSXStyle.utils.book_new();

  const sheet1Name = "Form Penilaian";
  const sheet2Name = "Form Realisasi Actual";

  // 1. Build Sheet 2 first to capture row indices for Actual rows
  const { ws: wsActual, indicatorActualRowMap } = buildFormRealisasiActualWorksheet(data);

  // 2. Build Sheet 1 with dynamic formula references to Sheet 2
  const wsPenilaian = buildFormPenilaianWorksheet(data, sheet2Name, indicatorActualRowMap);

  // 3. Append Sheet 1 and Sheet 2 as primary visible sheets
  XLSXStyle.utils.book_append_sheet(wb, wsPenilaian, sheet1Name);
  XLSXStyle.utils.book_append_sheet(wb, wsActual, sheet2Name);

  // 4. Sheet 3: Hidden System Mapping for re-import compatibility
  const mappingRows = buildSystemMappingRows(data);
  const wsMapping = XLSXStyle.utils.aoa_to_sheet(mappingRows);
  wsMapping["!cols"] = [
    { wch: 12 }, // row_index
    { wch: 14 }, // template_id
    { wch: 14 }, // parameter_id
    { wch: 28 }, // parameter_name
    { wch: 14 }, // indicator_id
    { wch: 32 }, // indicator_name
    { wch: 14 }, // criteria_id
    { wch: 28 }, // criteria_label
    { wch: 14 }, // criteria_score
    { wch: 12 }, // row_type
  ];
  XLSXStyle.utils.book_append_sheet(wb, wsMapping, "_SYSTEM_MAPPING");

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
  const mapIdx = wb.SheetNames.indexOf("_SYSTEM_MAPPING");
  if (mapIdx >= 0) {
    wb.Workbook.Sheets[mapIdx] = { Hidden: 1 };
  }

  // 5. Sheet 4: Panduan & Ketentuan Lengkap
  const wsGuide = XLSXStyle.utils.aoa_to_sheet(
    createGuideRows({
      name: data.employee.name,
      departmentName: data.employee.departmentName || "Semua Departemen",
      jobLevelName: data.jobLevelName || data.employee.jobPosition || "-",
      totalWeightPct: Math.round((data.totalTargetWeight || 1.15) * 100),
    })
  );
  wsGuide["!cols"] = [{ wch: 32 }, { wch: 80 }];
  XLSXStyle.utils.book_append_sheet(wb, wsGuide, "Panduan & Ketentuan");

  // Safe Filename
  const safeName = (data.employee.name || "KPI").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = customFilename || `Template_KPI_${safeName}_${data.periodYear}.xlsx`;

  saveStyledWorkbook(wb, filename);
}

// =============================================================================
// EXPORT BATCH EMPLOYEES WORKBOOK (Multi-Sheet Pairs: Form Penilaian & Form Actual per Employee)
// =============================================================================

export function exportBatchCorporateKpiMatrixExcel(
  items: KpiMatrixSheetData[],
  filename?: string
) {
  if (items.length === 0) return;
  const wb = XLSXStyle.utils.book_new();

  if (items.length === 1) {
    exportCorporateKpiMatrixExcel(items[0], filename);
    return;
  }

  const usedSheetNames = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rawName = (item.employee.name || `Karyawan_${i + 1}`).replace(/[:\\/?*\[\]]/g, " ").trim();
    const shortName = rawName.slice(0, 16);

    let penName = `Penilaian - ${shortName}`;
    let actName = `Actual - ${shortName}`;

    if (usedSheetNames.has(penName.toLowerCase())) {
      penName = `Penilaian - ${shortName.slice(0, 13)}_${i + 1}`;
    }
    usedSheetNames.add(penName.toLowerCase());

    if (usedSheetNames.has(actName.toLowerCase())) {
      actName = `Actual - ${shortName.slice(0, 13)}_${i + 1}`;
    }
    usedSheetNames.add(actName.toLowerCase());

    const { ws: wsActual, indicatorActualRowMap } = buildFormRealisasiActualWorksheet(item);
    const wsPenilaian = buildFormPenilaianWorksheet(item, actName, indicatorActualRowMap);

    XLSXStyle.utils.book_append_sheet(wb, wsPenilaian, penName);
    XLSXStyle.utils.book_append_sheet(wb, wsActual, actName);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const outFilename = filename || `Batch_KPI_${items.length}_Karyawan_${dateStr}.xlsx`;

  saveStyledWorkbook(wb, outFilename);
}

// =============================================================================
// UNIVERSAL BROWSER & SERVER SAFE WORKBOOK DOWNLOAD (xlsx-js-style)
// =============================================================================

export function saveStyledWorkbook(wb: any, filename: string) {
  try {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const wbout = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    } else {
      XLSXStyle.writeFile(wb, filename);
    }
  } catch (err) {
    console.warn("Styled workbook write fallback:", err);
    XLSXStyle.writeFile(wb, filename);
  }
}
