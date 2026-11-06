import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import type {
  MonthlyAssessmentDetailResult,
  MonthlyCategoryGroup,
  MonthlyIndicatorItem,
} from "@/types/monthly-assessment";
import type { EmployeeProgressItem } from "@/types/monthly-assessment";
import { formatCriteriaExcel } from "./excel-template-kpi";
import {
  saveStyledWorkbook,
  buildIndicatorScoreExpression,
  isNumericUnit,
  normalizeIndicatorUnit,
  getExcelNumberFormatForUnit,
  getMonthlyCellNumberFormat,
  resolveIndicatorTargetAndUnit,
} from "./excel-kpi-matrix";

// =============================================================================
// STYLES DEFINITION (xlsx-js-style)
// =============================================================================

const borderThin = {
  top: { style: "thin", color: { rgb: "D1D5DB" } },
  bottom: { style: "thin", color: { rgb: "D1D5DB" } },
  left: { style: "thin", color: { rgb: "D1D5DB" } },
  right: { style: "thin", color: { rgb: "D1D5DB" } },
};

const borderDarkThin = {
  top: { style: "thin", color: { rgb: "0F2C59" } },
  bottom: { style: "thin", color: { rgb: "0F2C59" } },
  left: { style: "thin", color: { rgb: "0F2C59" } },
  right: { style: "thin", color: { rgb: "0F2C59" } },
};

// 1. Dark Navy Header (#0F2C59)
const styleNavyHeader = {
  fill: { fgColor: { rgb: "0F2C59" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  border: borderDarkThin,
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

// 2. Navy Subheader (#173A70)
const styleNavySubHeader = {
  fill: { fgColor: { rgb: "173A70" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
  border: borderDarkThin,
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
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "334155" } },
  border: borderThin,
  alignment: { vertical: "center" },
};

const styleIdentityValue = {
  font: { name: "Calibri", sz: 9.5, bold: false, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { vertical: "center" },
};

// 5. Standard Cells
const styleCellCenter = {
  font: { name: "Calibri", sz: 9.5, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleCellLeft = {
  font: { name: "Calibri", sz: 9.5, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
};

const styleCellBoldCenter = {
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleScoreCell = {
  fill: { fgColor: { rgb: "F0FDF4" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "166534" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleActualHighlightCenter = {
  fill: { fgColor: { rgb: "FEF3C7" } },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "92400E" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleTotalBar = {
  fill: { fgColor: { rgb: "0F2C59" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  border: borderDarkThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleSectionHeader = {
  fill: { fgColor: { rgb: "1E293B" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  border: borderThin,
  alignment: { horizontal: "left", vertical: "center" },
};

const styleSignatureHeader = {
  fill: { fgColor: { rgb: "F1F5F9" } },
  font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "475569" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleSignatureBox = {
  border: borderThin,
  alignment: { horizontal: "center", vertical: "bottom" },
  font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "0F172A" } },
};

// Helper untuk sanitasi nama sheet Excel (maksimal 31 karakter, tanpa karakter terlarang)
export function safeSheetName(rawName: string, fallbackIdx: number, usedSet: Set<string>): string {
  let clean = (rawName || `Karyawan_${fallbackIdx}`)
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length === 0) {
    clean = `Karyawan_${fallbackIdx}`;
  }

  if (clean.length > 28) {
    clean = clean.slice(0, 28).trim();
  }

  let candidate = clean;
  let counter = 2;
  while (usedSet.has(candidate.toLowerCase())) {
    candidate = `${clean.slice(0, 25)}_${counter++}`;
  }
  usedSet.add(candidate.toLowerCase());
  return candidate;
}

export interface CombinedBatchExportParams {
  year: number;
  activeStaging?: string;
  rekapList: EmployeeProgressItem[];
  employeeDetails: MonthlyAssessmentDetailResult[];
  filename?: string;
}

// =============================================================================
// SHEET 1: REKAPITULASI PROGRES & HASIL KPI SELURUH KARYAWAN TERPILIH
// =============================================================================
function buildRekapSheet(rekapList: EmployeeProgressItem[], currentYear: number) {
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};

  const setCell = (r: number, c: number, cell: any) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = cell;
  };

  const fillEmptyRange = (r: number, startC: number, endC: number, style: any) => {
    for (let col = startC; col <= endC; col++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  // Row 0: Banner Judul
  setCell(0, 0, {
    t: "s",
    v: `REKAPITULASI PENILAIAN KINERJA (KPI) KARYAWAN - TAHUN ${currentYear}`,
    s: {
      fill: { fgColor: { rgb: "0F2C59" } },
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: borderDarkThin,
    },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });
  fillEmptyRange(0, 0, 10, styleNavyHeader);
  rowsHeight[0] = { hpt: 28 };

  // Row 1: Subtitle Tanggal Export
  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  setCell(1, 0, {
    t: "s",
    v: `Dokumen Rekapitulasi Progres & Hasil Penilaian • Dicetak pada: ${printDate} • Total: ${rekapList.length} Karyawan`,
    s: {
      fill: { fgColor: { rgb: "F8FAFC" } },
      font: { name: "Calibri", sz: 9.5, italic: true, color: { rgb: "64748B" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: borderThin,
    },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 10 } });
  fillEmptyRange(1, 0, 10, styleIdentityValue);
  rowsHeight[1] = { hpt: 20 };

  // Row 2: Empty spacer
  rowsHeight[2] = { hpt: 8 };

  // Row 3: Header Kolom
  const headers = [
    "No",
    "NIK",
    "Nama Karyawan",
    "Jabatan",
    "Departemen",
    "Penilai",
    "Template KPI",
    "Status Workflow",
    "Progress Parameter",
    "Skor Akhir (%)",
    "Grade",
  ];

  headers.forEach((h, colIdx) => {
    setCell(3, colIdx, { t: "s", v: h, s: styleNavyHeader });
  });
  rowsHeight[3] = { hpt: 26 };

  // Row 4..N: Data Karyawan
  rekapList.forEach((emp, idx) => {
    const r = 4 + idx;
    rowsHeight[r] = { hpt: 20 };

    const filledP = emp.filledParameters ?? emp.filledCount ?? 0;
    const totalP = emp.totalParameters ?? 5;
    const scoreVal =
      emp.finalScore !== null && emp.finalScore !== undefined
        ? Number(emp.finalScore)
        : null;

    setCell(r, 0, { t: "n", v: idx + 1, s: styleCellCenter });
    setCell(r, 1, { t: "s", v: emp.nik || "-", s: styleCellCenter });
    setCell(r, 2, {
      t: "s",
      v: emp.name || "-",
      s: {
        ...styleCellLeft,
        font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "0F172A" } },
      },
    });
    setCell(r, 3, { t: "s", v: emp.jobPosition || "-", s: styleCellLeft });
    setCell(r, 4, { t: "s", v: emp.departmentName || "-", s: styleCellLeft });
    setCell(r, 5, { t: "s", v: emp.appraiserName || "-", s: styleCellLeft });
    setCell(r, 6, { t: "s", v: emp.templateName || "-", s: styleCellLeft });
    setCell(r, 7, {
      t: "s",
      v: emp.appraisalStatus || emp.monthlyStatus || "Draft",
      s: styleCellBoldCenter,
    });
    setCell(r, 8, { t: "s", v: `${filledP}/${totalP}`, s: styleCellCenter });
    setCell(r, 9, {
      t: scoreVal !== null ? "n" : "s",
      v: scoreVal !== null ? scoreVal / 100 : "-",
      z: scoreVal !== null ? "0.0%" : undefined,
      s: scoreVal !== null ? styleActualHighlightCenter : styleCellCenter,
    });
    setCell(r, 10, {
      t: "s",
      v: emp.grade || "-",
      s: {
        ...styleCellBoldCenter,
        fill: { fgColor: { rgb: "F1F5F9" } },
      },
    });
  });

  const lastR = 4 + rekapList.length;

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastR, c: 10 },
  });
  ws["!merges"] = merges;
  ws["!rows"] = rowsHeight;
  ws["!cols"] = [
    { wch: 6 },  // No
    { wch: 16 }, // NIK
    { wch: 28 }, // Nama Karyawan
    { wch: 24 }, // Jabatan
    { wch: 22 }, // Departemen
    { wch: 24 }, // Penilai
    { wch: 32 }, // Template KPI
    { wch: 18 }, // Status Workflow
    { wch: 18 }, // Progress Parameter
    { wch: 16 }, // Skor Akhir (%)
    { wch: 12 }, // Grade
  ];

  return ws;
}

// =============================================================================
// PRECOMPUTE ROW MAPPINGS FOR TABLE 2 (RINCIAN TARGET & REALISASI BULANAN)
// =============================================================================
function computeTable2RowMaps(categories: MonthlyCategoryGroup[]) {
  let r = 6;
  categories.forEach((cat) => {
    r++; // category header bar
    const inds = cat.indicators || [];
    inds.forEach((ind) => {
      const bands = ind.scoringRules || [];
      const bandCount = bands.length > 0 ? bands.length : 4;
      r += bandCount;
    });
  });
  // Total Row is at r
  // Rows between Total Row and Table 2 target row:
  // r++ (after total row) -> r++ (spacer) -> r++ (banner) -> r++ (monthly headers) -> target row
  const targetStartR = r + 5;

  const targetRowMap = new Map<string | number, number>();
  const actualRowMap = new Map<string | number, number>();

  let curT2 = targetStartR;
  categories.forEach((cat, catIdx) => {
    (cat.indicators || []).forEach((ind, indIdx) => {
      const indKey = ind.appraisalItemId ?? (ind as any).id ?? `${catIdx}_${indIdx}`;
      targetRowMap.set(indKey, curT2 + 1); // 1-based Excel row
      actualRowMap.set(indKey, curT2 + 2); // 1-based Excel row
      curT2 += 2;
    });
  });

  return { targetRowMap, actualRowMap };
}

// =============================================================================
// SHEET REALISASI DEPARTEMEN: INPUT 1X UNTUK SELURUH KARYAWAN DEPARTEMEN
// =============================================================================
export function buildDepartmentRealizationSheet(
  deptParams: Array<{
    departmentName: string;
    indicatorName: string;
    unit?: string | null;
    target?: number | string | null;
    annualActual?: number | null;
    monthlyActuals?: (number | null)[];
  }>,
  currentYear: number
) {
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};

  const setCell = (r: number, c: number, cell: any) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = cell;
  };

  const fillEmptyRange = (r: number, startC: number, endC: number, style: any) => {
    for (let col = startC; col <= endC; col++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  // Row 0: Banner Judul
  setCell(0, 0, {
    t: "s",
    v: `REALISASI DEPARTMENT KPI - PERIODE ${currentYear}`,
    s: {
      fill: { fgColor: { rgb: "0F2C59" } },
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { vertical: "center", indent: 1 },
    },
  });
  fillEmptyRange(0, 1, 19, { fill: { fgColor: { rgb: "0F2C59" } } });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 19 } });
  rowsHeight[0] = { hpt: 28 };

  // Row 1: Subjudul / Petunjuk Pengisian
  setCell(1, 0, {
    t: "s",
    v: "Petunjuk: Masukkan realisasi departemen pada kolom di bawah. Nilai ini otomatis terhubung ke seluruh lembar kerja karyawan departemen terkait melalui formula Excel.",
    s: {
      font: { name: "Calibri", sz: 9.5, italic: true, color: { rgb: "64748B" } },
      alignment: { vertical: "center", indent: 1 },
    },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 19 } });
  rowsHeight[1] = { hpt: 18 };

  // Row 3: Table Header
  const headers = [
    "NO",
    "DEPARTEMEN",
    "KODE",
    "NAMA PARAMETER",
    "SATUAN",
    "TARGET",
    "REALISASI TAHUNAN",
    "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
    "JUL", "AGS", "SEP", "OKT", "NOV", "DES",
    "KETERANGAN",
  ];

  headers.forEach((h, colIdx) => {
    setCell(3, colIdx, {
      t: "s",
      v: h,
      s: {
        fill: { fgColor: { rgb: "0F2C59" } },
        font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: borderDarkThin,
      },
    });
  });
  rowsHeight[3] = { hpt: 26 };

  // Data Rows
  let curRow = 4;
  deptParams.forEach((dp, idx) => {
    rowsHeight[curRow] = { hpt: 22 };

    // Col 0: No
    setCell(curRow, 0, { t: "n", v: idx + 1, s: styleCellCenter });
    // Col 1: Departemen
    setCell(curRow, 1, { t: "s", v: dp.departmentName, s: styleCellCenter });
    // Col 2: Kode
    setCell(curRow, 2, { t: "s", v: `DP-${idx + 1}`, s: styleCellCenter });
    // Col 3: Nama Parameter
    setCell(curRow, 3, { t: "s", v: dp.indicatorName, s: styleCellLeft });
    // Col 4: Satuan
    setCell(curRow, 4, { t: "s", v: dp.unit || "%", s: styleCellCenter });

    const unitStr = (dp.unit || "%").trim();
    const normUnit = normalizeIndicatorUnit(unitStr);
    const isTextInd = !isNumericUnit(normUnit);
    const numFmt = isTextInd ? "0" : getExcelNumberFormatForUnit(normUnit);

    // Col 5: Target
    const numTgt = dp.target !== null && dp.target !== undefined && !isNaN(Number(dp.target)) ? Number(dp.target) : null;
    setCell(curRow, 5, {
      t: numTgt !== null ? "n" : "s",
      v: numTgt !== null ? numTgt : (dp.target || "-"),
      z: numFmt,
      s: styleCellCenter,
    });

    // Col 6: Realisasi Tahunan (Highlight Input / Auto-average dari Jan-Des jika bulan diisi)
    const numAnnual = dp.annualActual !== null && dp.annualActual !== undefined ? Number(dp.annualActual) : null;
    const annualFormula = `IF(COUNT(H${curRow + 1}:S${curRow + 1})>0,ROUND(AVERAGE(H${curRow + 1}:S${curRow + 1}),2),"")`;
    setCell(curRow, 6, {
      t: numAnnual !== null ? "n" : undefined,
      f: annualFormula,
      v: numAnnual !== null ? numAnnual : undefined,
      z: numFmt,
      s: styleActualHighlightCenter,
    });

    // Col 7..18: Jan - Des (Input Realisasi Bulanan Departemen)
    const mActuals = dp.monthlyActuals || [];
    for (let m = 0; m < 12; m++) {
      const val = mActuals[m] !== null && mActuals[m] !== undefined ? Number(mActuals[m]) : null;
      setCell(curRow, 7 + m, {
        t: val !== null ? "n" : undefined,
        v: val !== null ? val : undefined,
        z: numFmt,
        s: {
          fill: { fgColor: { rgb: "FEF9C3" } },
          font: { name: "Calibri", sz: 9, bold: val !== null, color: { rgb: "0F172A" } },
          border: borderThin,
          alignment: { horizontal: "center", vertical: "center" },
        },
      });
    }

    // Col 19: Keterangan
    setCell(curRow, 19, { t: "s", v: "Department KPI (Otomatis)", s: styleCellLeft });

    curRow++;
  });

  const rangeRef = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(4, curRow - 1), c: 19 } });
  ws["!ref"] = rangeRef;
  ws["!merges"] = merges;
  ws["!rows"] = Object.keys(rowsHeight).map((k) => rowsHeight[Number(k)]);

  ws["!cols"] = [
    { wch: 5 },  // No
    { wch: 18 }, // Dept
    { wch: 10 }, // Kode
    { wch: 36 }, // Nama
    { wch: 8 },  // Satuan
    { wch: 10 }, // Target
    { wch: 18 }, // Realisasi Tahunan
    { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 },
    { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 },
    { wch: 25 }, // Keterangan
  ];

  return ws;
}

// =============================================================================
// SHEET INDIVIDUAL: TEMPLATE & FORM PENILAIAN LENGKAP PER NAMA KARYAWAN
// =============================================================================
export function buildIndividualEmployeeSheet(
  emp: EmployeeProgressItem,
  detail: MonthlyAssessmentDetailResult | null,
  currentYear: number,
  deptParamRowIndexMap?: Map<string, number>
) {
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};

  const setCell = (r: number, c: number, cell: any) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = cell;
  };

  const fillEmptyRange = (r: number, startC: number, endC: number, style: any) => {
    for (let col = startC; col <= endC; col++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  const empName = detail?.employee?.name || emp.name;
  const empNik = detail?.employee?.nik || emp.nik;
  const empDept = detail?.employee?.departmentName || emp.departmentName || "-";
  const empJob = detail?.employee?.jobPosition || emp.jobPosition || "-";
  const empTemplate = detail?.employee?.templateName || detail?.templateName || emp.templateName || "-";
  const empStatus = detail?.appraisalStatus || emp.appraisalStatus || "Draft";
  const finalScoreDisplay =
    detail?.summary?.annualScoreDisplay ||
    detail?.summary?.overallScoreDisplay ||
    (emp.finalScore !== null && emp.finalScore !== undefined ? `${emp.finalScore}%` : "0.0%");
  const gradeDisplay = detail?.summary?.annualGrade || detail?.summary?.grade || emp.grade || "E";

  // 1. Title Banner (Cols A..L, 12 Kolom)
  setCell(0, 0, {
    t: "s",
    v: "FORMULIR TARGET & HASIL PENILAIAN KINERJA (KPI) KARYAWAN",
    s: {
      fill: { fgColor: { rgb: "0F2C59" } },
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: borderDarkThin,
    },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } });
  fillEmptyRange(0, 0, 11, styleNavyHeader);
  rowsHeight[0] = { hpt: 28 };

  // 2. Identity Header Block (Rows 1-4)
  // Row 1: Nama, Dept, Periode
  setCell(1, 0, { t: "s", v: "Nama Karyawan", s: styleIdentityLabel });
  setCell(1, 1, {
    t: "s",
    v: empName,
    s: { ...styleIdentityValue, font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } } },
  });
  merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: 3 } });
  fillEmptyRange(1, 1, 3, styleIdentityValue);

  setCell(1, 4, { t: "s", v: "Departemen", s: styleIdentityLabel });
  setCell(1, 5, { t: "s", v: empDept, s: styleIdentityValue });
  merges.push({ s: { r: 1, c: 5 }, e: { r: 1, c: 7 } });
  fillEmptyRange(1, 5, 7, styleIdentityValue);

  setCell(1, 8, { t: "s", v: "Periode Tahun", s: styleIdentityLabel });
  setCell(1, 9, { t: "s", v: `Tahun ${currentYear}`, s: styleCellBoldCenter });
  merges.push({ s: { r: 1, c: 9 }, e: { r: 1, c: 11 } });
  fillEmptyRange(1, 9, 11, styleCellBoldCenter);
  rowsHeight[1] = { hpt: 20 };

  // Row 2: NIK, Jabatan, Status
  setCell(2, 0, { t: "s", v: "NIK", s: styleIdentityLabel });
  setCell(2, 1, { t: "s", v: empNik, s: styleIdentityValue });
  merges.push({ s: { r: 2, c: 1 }, e: { r: 2, c: 3 } });
  fillEmptyRange(2, 1, 3, styleIdentityValue);

  setCell(2, 4, { t: "s", v: "Jabatan", s: styleIdentityLabel });
  setCell(2, 5, { t: "s", v: empJob, s: styleIdentityValue });
  merges.push({ s: { r: 2, c: 5 }, e: { r: 2, c: 7 } });
  fillEmptyRange(2, 5, 7, styleIdentityValue);

  setCell(2, 8, { t: "s", v: "Status Workflow", s: styleIdentityLabel });
  setCell(2, 9, { t: "s", v: empStatus, s: styleCellBoldCenter });
  merges.push({ s: { r: 2, c: 9 }, e: { r: 2, c: 11 } });
  fillEmptyRange(2, 9, 11, styleCellBoldCenter);
  rowsHeight[2] = { hpt: 20 };

  // Row 3: Template KPI, Penilai, Nilai Akhir
  setCell(3, 0, { t: "s", v: "Master Template", s: styleIdentityLabel });
  setCell(3, 1, { t: "s", v: empTemplate, s: styleIdentityValue });
  merges.push({ s: { r: 3, c: 1 }, e: { r: 3, c: 3 } });
  fillEmptyRange(3, 1, 3, styleIdentityValue);

  setCell(3, 4, { t: "s", v: "Atasan Penilai", s: styleIdentityLabel });
  setCell(3, 5, {
    t: "s",
    v: emp.appraiserName || detail?.approvalLine?.appraiser?.name || "-",
    s: styleIdentityValue,
  });
  merges.push({ s: { r: 3, c: 5 }, e: { r: 3, c: 7 } });
  fillEmptyRange(3, 5, 7, styleIdentityValue);

  setCell(3, 8, { t: "s", v: "Skor Akhir / Grade", s: styleIdentityLabel });
  setCell(3, 9, {
    t: "s",
    v: `${finalScoreDisplay} (Grade ${gradeDisplay})`,
    s: {
      ...styleActualHighlightCenter,
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "92400E" } },
    },
  });
  merges.push({ s: { r: 3, c: 9 }, e: { r: 3, c: 11 } });
  fillEmptyRange(3, 9, 11, styleActualHighlightCenter);
  rowsHeight[3] = { hpt: 20 };

  // Row 4: Spacer
  rowsHeight[4] = { hpt: 8 };

  // 3. Table Headers (Row 5)
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
    setCell(5, colIdx, { t: "s", v: h, s: styleNavyHeader });
  });
  rowsHeight[5] = { hpt: 26 };

  // 4. Table Body: Categories & Indicators
  let currentR = 6;
  const categories: MonthlyCategoryGroup[] = detail?.categories || [];
  const nilaiAkhirCellRefs: string[] = [];
  const precalculatedNilaiAkhirList: number[] = [];
  const { targetRowMap, actualRowMap } = computeTable2RowMaps(categories);

  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const cat = categories[catIdx];
    const catWeightFrac = cat.categoryWeight > 1 ? cat.categoryWeight / 100 : cat.categoryWeight;
    const catWeightPct = Math.round(catWeightFrac * 100);

    // Category Separator Bar
    const catTitle = `${cat.categoryNumber || catIdx + 1}. ${cat.categoryName.toUpperCase()} (${catWeightPct}%)`;
    setCell(currentR, 0, { t: "s", v: catTitle, s: styleCategoryBar });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 11 } });
    fillEmptyRange(currentR, 0, 11, styleCategoryBar);
    rowsHeight[currentR] = { hpt: 20 };
    currentR++;

    const indicators: MonthlyIndicatorItem[] = cat.indicators || [];
    const hasSubIndicators = indicators.length > 1;

    for (let indIdx = 0; indIdx < indicators.length; indIdx++) {
      const ind = indicators[indIdx];
      const indKey = ind.appraisalItemId ?? (ind as any).id ?? `${catIdx}_${indIdx}`;
      const targetRowExcel = targetRowMap.get(indKey);
      const actualRowExcel = actualRowMap.get(indKey);

      const noStr = hasSubIndicators
        ? `${cat.categoryNumber || catIdx + 1}.${indIdx + 1}`
        : `${cat.categoryNumber || catIdx + 1}`;

      const indWeightFrac =
        (ind.indicatorWeight || 1) > 1
          ? (ind.indicatorWeight || 1) / 100
          : (ind.indicatorWeight || 1);

      const bands = [...(ind.scoringRules || [])].sort(
        (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      );

      if (bands.length === 0) {
        bands.push(
          { label: "Target Tercapai", score: 25, operator: "TEXT" },
          { label: "Cukup", score: 15, operator: "TEXT" },
          { label: "Kurang", score: 5, operator: "TEXT" },
          { label: "Tidak Tercapai", score: 0, operator: "TEXT" }
        );
      }

      const res = resolveIndicatorTargetAndUnit(ind, bands);
      const {
        resolvedTarget,
        resolvedUnit: unitVal,
        numTarget,
        isTargetNumeric,
        finalTargetVal,
        numFmt,
        topBandScore,
      } = res;
      const hasTarget = Boolean(finalTargetVal);
      const targetVal = finalTargetVal;
      const normUnit = unitVal;
      const isTextInd = !isNumericUnit(normUnit);

      const scoreVal =
        ind.annualScore !== null && ind.annualScore !== undefined
          ? ind.annualScore
          : ind.score !== null && ind.score !== undefined
          ? ind.score
          : null;

      const hasInitialScore = scoreVal !== null && scoreVal !== undefined && !isNaN(Number(scoreVal));
      const initialScoreNum = hasInitialScore ? Number(scoreVal) : null;

      const bandCount = bands.length;
      const startIndRow = currentR;
      const excelR1 = currentR + 1; // 1-based index in Excel

      // Col F (Target Tahunan): link dinamis ke Realisasi Tahunan (Baris Target) Table 2
      const targetFormula = targetRowExcel
        ? `IF(R${targetRowExcel}<>"",R${targetRowExcel},${isTargetNumeric ? numTarget : `"${finalTargetVal}"`})`
        : undefined;

      // Col H (Realisasi Tahunan): link dinamis ke Realisasi Tahunan (Baris Actual) Table 2 via scoring rule
      const actualCellRef = actualRowExcel ? `R${actualRowExcel}` : null;
      const rawScoreExpr = actualCellRef
        ? buildIndicatorScoreExpression(actualCellRef, bands, normUnit, targetVal, excelR1, "J")
        : "25";
      const realScoreFormula = actualCellRef
        ? `IF(OR(${actualCellRef}="",ISBLANK(${actualCellRef})),"",${rawScoreExpr})`
        : undefined;

      // Col K (Nilai Akhir): (Skor Aktual / Skor Maksimal) * Bobot
      // Jika memiliki subindikator -> pakai Bobot Indikator (Col E)
      // Jika parameter tunggal -> pakai Bobot Parameter (Col C)
      const weightCellRef = hasSubIndicators ? `E${excelR1}` : `C${excelR1}`;
      const weightFrac = hasSubIndicators ? indWeightFrac : catWeightFrac;

      nilaiAkhirCellRefs.push(`K${excelR1}`);
      const precalcNilaiAkhir =
        hasInitialScore && initialScoreNum !== null
          ? parseFloat(((initialScoreNum / topBandScore) * weightFrac).toFixed(4))
          : null;
      if (precalcNilaiAkhir !== null) {
        precalculatedNilaiAkhirList.push(precalcNilaiAkhir);
      }
      const nilaiAkhirFormula = `IF(OR(H${excelR1}="",ISBLANK(H${excelR1})),"",(H${excelR1}/${topBandScore})*${weightCellRef})`;

      // Band 1 (Main Row)
      const b1 = bands[0];
      const b1Text = formatCriteriaExcel(
        b1.label,
        b1.operator || "TEXT",
        b1.minValue,
        b1.maxValue,
        unitVal
      );

      setCell(currentR, 0, { t: "s", v: noStr, s: styleCellCenter });
      setCell(currentR, 1, { t: "s", v: cat.categoryName, s: styleCellLeft });
      setCell(currentR, 2, { t: "n", v: catWeightFrac, z: "0%", s: styleCellBoldCenter });
      setCell(currentR, 3, { t: "s", v: ind.indicatorName || "-", s: styleCellLeft });
      setCell(currentR, 4, { t: "n", v: indWeightFrac, z: "0%", s: styleCellBoldCenter });
      setCell(currentR, 5, {
        t: isTargetNumeric ? "n" : "s",
        f: targetFormula,
        v: isTargetNumeric ? numTarget : finalTargetVal,
        z: numFmt,
        s: styleCellCenter,
      });
      setCell(currentR, 6, { t: "s", v: unitVal, s: styleCellCenter });
      setCell(currentR, 7, {
        t: hasInitialScore ? "n" : "s",
        f: realScoreFormula,
        v: hasInitialScore ? initialScoreNum : "",
        z: "0",
        s: styleActualHighlightCenter,
      });
      setCell(currentR, 8, { t: "s", v: b1Text, s: styleCellLeft });
      setCell(currentR, 9, { t: "n", v: Number(b1.score), z: "0", s: styleScoreCell });
      setCell(currentR, 10, {
        t: precalcNilaiAkhir !== null ? "n" : "s",
        f: nilaiAkhirFormula,
        v: precalcNilaiAkhir !== null ? precalcNilaiAkhir : "",
        z: "0.0%",
        s: styleCellBoldCenter,
      });
      setCell(currentR, 11, { t: "s", v: ind.indicatorDescription || "", s: styleCellLeft });
      rowsHeight[currentR] = { hpt: 20 };
      currentR++;

      // Subsequent Bands (Band 2..N)
      for (let bIdx = 1; bIdx < bandCount; bIdx++) {
        const b = bands[bIdx];
        const bText = formatCriteriaExcel(
          b.label,
          b.operator || "TEXT",
          b.minValue,
          b.maxValue,
          unitVal
        );

        setCell(currentR, 0, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 1, { t: "s", v: "", s: styleCellLeft });
        setCell(currentR, 2, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 3, { t: "s", v: "", s: styleCellLeft });
        setCell(currentR, 4, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 5, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 6, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 7, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 8, { t: "s", v: bText, s: styleCellLeft });
        setCell(currentR, 9, { t: "n", v: Number(b.score), z: "0", s: styleScoreCell });
        setCell(currentR, 10, { t: "s", v: "", s: styleCellCenter });
        setCell(currentR, 11, { t: "s", v: "", s: styleCellLeft });

        rowsHeight[currentR] = { hpt: 20 };
        currentR++;
      }

      // Merge vertical cells across bands for this indicator
      if (bandCount > 1) {
        const endIndRow = currentR - 1;
        [0, 1, 2, 3, 4, 5, 6, 7, 10, 11].forEach((colIdx) => {
          merges.push({
            s: { r: startIndRow, c: colIdx },
            e: { r: endIndRow, c: colIdx },
          });
        });
      }
    }
  }

  // 5. Total Row
  const totalNilaiAkhirSum =
    precalculatedNilaiAkhirList.length > 0
      ? parseFloat(precalculatedNilaiAkhirList.reduce((acc, v) => acc + v, 0).toFixed(4))
      : null;

  setCell(currentR, 0, { t: "s", v: "TOTAL HASIL PENILAIAN AKHIR KPI", s: styleTotalBar });
  merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 1 } });
  fillEmptyRange(currentR, 0, 1, styleTotalBar);

  setCell(currentR, 2, { t: "n", v: 1.0, z: "0%", s: styleTotalBar });
  setCell(currentR, 3, { t: "s", v: "", s: styleTotalBar });
  merges.push({ s: { r: currentR, c: 3 }, e: { r: currentR, c: 9 } });
  fillEmptyRange(currentR, 3, 9, styleTotalBar);

  // Nilai Akhir Total Cell
  if (nilaiAkhirCellRefs.length > 0) {
    setCell(currentR, 10, {
      t: totalNilaiAkhirSum !== null ? "n" : "s",
      f: `IF(COUNT(${nilaiAkhirCellRefs.join(",")})=0,"",SUM(${nilaiAkhirCellRefs.join(",")}))`,
      v: totalNilaiAkhirSum !== null ? totalNilaiAkhirSum : "",
      z: "0.0%",
      s: styleTotalBar,
    });
  } else {
    setCell(currentR, 10, {
      t: totalNilaiAkhirSum !== null ? "n" : "s",
      v: totalNilaiAkhirSum !== null ? totalNilaiAkhirSum : "",
      z: "0.0%",
      s: styleTotalBar,
    });
  }

  setCell(currentR, 11, {
    t: "s",
    v: `Grade ${gradeDisplay}`,
    s: styleTotalBar,
  });
  rowsHeight[currentR] = { hpt: 26 };
  currentR++;

  // 6. Section 2: Realisasi & Target Bulanan (Januari - Desember)
  let allIndicators: any[] = [];
  categories.forEach((cat) => {
    (cat.indicators || []).forEach((ind) => {
      allIndicators.push({ ...ind, categoryName: cat.categoryName });
    });
  });

  if (allIndicators.length > 0) {
    currentR++; // Spacer
    rowsHeight[currentR] = { hpt: 12 };
    currentR++;

    // Section Banner (Cols 0..17, 18 Kolom)
    setCell(currentR, 0, {
      t: "s",
      v: "RINCIAN TARGET & REALISASI BULANAN (JANUARI - DESEMBER)",
      s: styleSectionHeader,
    });
    merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 17 } });
    fillEmptyRange(currentR, 0, 17, styleSectionHeader);
    rowsHeight[currentR] = { hpt: 24 };
    currentR++;

    // Monthly Table Headers
    const monthHeaders = [
      "No",
      "Parameter",
      "Indikator",
      "Tipe",
      "Satuan",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Ags",
      "Sep",
      "Okt",
      "Nov",
      "Des",
      "Realisasi Tahunan",
    ];

    monthHeaders.forEach((h, colIdx) => {
      setCell(currentR, colIdx, { t: "s", v: h, s: styleNavySubHeader });
    });
    rowsHeight[currentR] = { hpt: 22 };
    currentR++;

    allIndicators.forEach((ind, indIdx) => {
      const targetR = currentR;
      const actualR = currentR + 1;
      const targetRowExcel = targetR + 1;
      const actualRowExcel = actualR + 1;

      const bands = [...(ind.scoringRules || [])].sort(
        (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      );
      const res = resolveIndicatorTargetAndUnit(ind, bands);
      const {
        resolvedTarget,
        resolvedUnit: unitStr,
        numTarget,
        isTargetNumeric,
        finalTargetVal,
        numFmt,
        topBandScore,
      } = res;
      const hasTarget = Boolean(finalTargetVal);
      const targetVal = finalTargetVal;
      const normUnit = unitStr;
      const isTextInd = !isNumericUnit(normUnit);
      const monthlyFmt = getMonthlyCellNumberFormat(normUnit);

      const agg = String(ind.aggregation || "AVERAGE").toUpperCase();
      const isSum = agg === "SUM";
      const isLastValue = agg === "LAST_VALUE";
      const isRatio = agg === "RATIO";

      // Col 0: No
      setCell(targetR, 0, { t: "n", v: indIdx + 1, s: styleCellCenter });
      setCell(actualR, 0, { t: "s", v: "", s: styleCellCenter });
      merges.push({ s: { r: targetR, c: 0 }, e: { r: actualR, c: 0 } });

      // Col 1: Parameter
      setCell(targetR, 1, { t: "s", v: ind.categoryName || "-", s: styleCellLeft });
      setCell(actualR, 1, { t: "s", v: "", s: styleCellLeft });
      merges.push({ s: { r: targetR, c: 1 }, e: { r: actualR, c: 1 } });

      // Col 2: Indikator
      setCell(targetR, 2, { t: "s", v: ind.indicatorName || (ind as any).name || "-", s: styleCellLeft });
      setCell(actualR, 2, { t: "s", v: "", s: styleCellLeft });
      merges.push({ s: { r: targetR, c: 2 }, e: { r: actualR, c: 2 } });

      // Col 3: Tipe Baris (Target vs Actual)
      setCell(targetR, 3, {
        t: "s",
        v: "Target",
        s: {
          fill: { fgColor: { rgb: "F1F5F9" } },
          font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "334155" } },
          border: borderThin,
          alignment: { horizontal: "center", vertical: "center" },
        },
      });
      setCell(actualR, 3, {
        t: "s",
        v: "Actual",
        s: {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "92400E" } },
          border: borderThin,
          alignment: { horizontal: "center", vertical: "center" },
        },
      });

      // Col 4: Satuan
      setCell(targetR, 4, { t: "s", v: unitStr, s: styleCellCenter });
      setCell(actualR, 4, { t: "s", v: unitStr, s: styleCellCenter });

      // Cols 5..16: Bulan 1 s/d 12 (Jan - Des)
      const normEmpDept = (empDept || "").trim().toLowerCase();
      const normIndName = (ind.indicatorName || (ind as any).name || "").trim().toLowerCase();
      const deptKey = `${normEmpDept}___${normIndName}`;
      const deptRowExcel = deptParamRowIndexMap?.get(deptKey) || deptParamRowIndexMap?.get(normIndName);
      const isDeptParam = (ind.scope === "DEPARTMENT" || Boolean(deptRowExcel)) && Boolean(deptRowExcel);

      const monthlyDetails = ind.monthlyDetails || [];
      for (let m = 1; m <= 12; m++) {
        const cIdx = 4 + m;
        const md = monthlyDetails.find((d: any) => d.month === m);
        const tVal =
          md?.target !== undefined && md?.target !== null && md?.target !== ""
            ? md.target
            : hasTarget
            ? isTargetNumeric
              ? isSum
                ? Math.round((numTarget / 12) * 100) / 100
                : numTarget
              : finalTargetVal
            : "";
        const aVal = md?.actual !== undefined && md?.actual !== null && md?.actual !== "" ? md.actual : "";

        setCell(targetR, cIdx, {
          t: tVal !== "" && !isNaN(Number(tVal)) ? "n" : "s",
          v: tVal !== "" && !isNaN(Number(tVal)) ? Number(tVal) : tVal,
          z: monthlyFmt,
          s: {
            fill: { fgColor: { rgb: "F8FAFC" } },
            font: { name: "Calibri", sz: 9, color: { rgb: "475569" } },
            border: borderThin,
            alignment: { horizontal: "center", vertical: "center" },
          },
        });

        // Kolom bulan di sheet Realisasi Departemen: Jan = Col H (71+1=72='H'), Des = Col S (71+12=83='S')
        const colLetter = String.fromCharCode(71 + m);
        const mCellRef = `'Realisasi Departemen'!${colLetter}${deptRowExcel}`;
        const gCellRef = `'Realisasi Departemen'!G${deptRowExcel}`;
        const isPct = normUnit === "%";

        // Normalisasi format persen: bila user mengetik '101%' di Excel, nilainya disimpan sebagai 1.01.
        // Jika nilai <= 2.5 dan > 0, kalikan 100 agar konsisten dengan skala 0-100 (misal 1.01 -> 101).
        const mExpr = isPct
          ? `IF(AND(${mCellRef}>0,${mCellRef}<=2.5),${mCellRef}*100,${mCellRef})`
          : mCellRef;
        const gExpr = isPct
          ? `IF(AND(${gCellRef}>0,${gCellRef}<=2.5),${gCellRef}*100,${gCellRef})`
          : isSum
          ? `${gCellRef}/12`
          : gCellRef;

        // Dynamic formula: jika bulan diisi di sheet departemen, pakai nilainya. Jika hanya realisasi tahunan yang diisi, gunakan realisasi tahunan.
        const monthFormula = isDeptParam
          ? `IF(${mCellRef}<>"",${mExpr},IF(${gCellRef}<>"",${gExpr},""))`
          : undefined;

        const initNum =
          aVal !== "" && !isNaN(Number(aVal))
            ? Number(aVal)
            : isDeptParam && ind.annualActual !== null && ind.annualActual !== undefined && !isNaN(Number(ind.annualActual))
            ? Number(ind.annualActual)
            : undefined;

        setCell(actualR, cIdx, {
          t: initNum !== undefined ? "n" : isDeptParam ? undefined : "s",
          f: monthFormula,
          v: initNum,
          z: monthlyFmt,
          s: {
            fill: { fgColor: { rgb: "FEF9C3" } },
            font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "0F172A" } },
            border: borderThin,
            alignment: { horizontal: "center", vertical: "center" },
          },
        });
      }

      // Col 17 (R): Realisasi Tahunan
      // Baris Target: Formula perhitungan target tahunan dari Jan..Des
      let targetAnnualFormula = "";
      if (isSum) {
        targetAnnualFormula = `IF(COUNT(F${targetRowExcel}:Q${targetRowExcel})>0,SUM(F${targetRowExcel}:Q${targetRowExcel}),${isTargetNumeric ? numTarget : `"${finalTargetVal}"`})`;
      } else {
        targetAnnualFormula = `IF(COUNT(F${targetRowExcel}:Q${targetRowExcel})>0,AVERAGE(F${targetRowExcel}:Q${targetRowExcel}),${isTargetNumeric ? numTarget : `"${finalTargetVal}"`})`;
      }

      setCell(targetR, 17, {
        t: isTargetNumeric ? "n" : "s",
        f: targetAnnualFormula,
        v: isTargetNumeric ? numTarget : finalTargetVal,
        z: numFmt,
        s: styleCellBoldCenter,
      });

      // Baris Actual: Formula perhitungan agregasi realisasi bulanan
      let actualCoreFormula = "";
      if (isSum) {
        actualCoreFormula = `SUM(F${actualRowExcel}:Q${actualRowExcel})`;
      } else if (isLastValue) {
        actualCoreFormula = `IFERROR(LOOKUP(2,1/(F${actualRowExcel}:Q${actualRowExcel}<>""),F${actualRowExcel}:Q${actualRowExcel}),"")`;
      } else if (isRatio) {
        if (normUnit === "%") {
          actualCoreFormula = `IF(SUM(F${targetRowExcel}:Q${targetRowExcel})>0,(SUM(F${actualRowExcel}:Q${actualRowExcel})/SUM(F${targetRowExcel}:Q${targetRowExcel}))*100,"")`;
        } else {
          actualCoreFormula = `IF(SUM(F${targetRowExcel}:Q${targetRowExcel})>0,SUM(F${actualRowExcel}:Q${actualRowExcel})/SUM(F${targetRowExcel}:Q${targetRowExcel}),"")`;
        }
      } else {
        // Default AVERAGE (hanya hitung jika minimal 1 bulan terisi)
        actualCoreFormula = isTextInd
          ? `ROUND(AVERAGE(F${actualRowExcel}:Q${actualRowExcel}),0)`
          : `AVERAGE(F${actualRowExcel}:Q${actualRowExcel})`;
      }

      const gAnnualCellRef = `'Realisasi Departemen'!G${deptRowExcel}`;
      const isPct = normUnit === "%";
      const gAnnualExpr = isPct
        ? `IF(AND(${gAnnualCellRef}>0,${gAnnualCellRef}<=2.5),${gAnnualCellRef}*100,${gAnnualCellRef})`
        : gAnnualCellRef;

      const actualAnnualFormula = isDeptParam
        ? `IF(COUNT(F${actualRowExcel}:Q${actualRowExcel})>0,${actualCoreFormula},IF(${gAnnualCellRef}<>"",${gAnnualExpr},""))`
        : `IF(COUNT(F${actualRowExcel}:Q${actualRowExcel})>0,${actualCoreFormula},"")`;
      const initialActualVal =
        ind.annualActual !== null && ind.annualActual !== undefined
          ? ind.annualActual
          : ind.actualValue !== null && ind.actualValue !== undefined
          ? ind.actualValue
          : "";

      const isInitActNum =
        initialActualVal !== "" &&
        initialActualVal !== null &&
        initialActualVal !== undefined &&
        !isNaN(Number(initialActualVal));

      setCell(actualR, 17, {
        t: isInitActNum ? "n" : isDeptParam ? undefined : "s",
        f: actualAnnualFormula,
        v: isInitActNum ? Number(initialActualVal) : undefined,
        z: numFmt,
        s: styleActualHighlightCenter,
      });

      rowsHeight[targetR] = { hpt: 19 };
      rowsHeight[actualR] = { hpt: 19 };
      currentR += 2;
    });
  }

  // 7. Approval Signatures Block (Lembar Persetujuan)
  currentR++;
  rowsHeight[currentR] = { hpt: 14 };
  currentR++;

  // Signature Headers
  const sigColPairs = [
    { title: "Disiapkan Oleh (Karyawan)", name: empName, startC: 0, endC: 2 },
    {
      title: "Dinilai Oleh (Atasan Langsung)",
      name: emp.appraiserName || detail?.approvalLine?.appraiser?.name || "(...........................)",
      startC: 3,
      endC: 5,
    },
    {
      title: "Disetujui Oleh (Kepala Departemen)",
      name: detail?.approvalLine?.headDept?.name || "(...........................)",
      startC: 6,
      endC: 8,
    },
    {
      title: "Diketahui Oleh (Direktur / HR)",
      name: detail?.approvalLine?.manager?.name || "(...........................)",
      startC: 9,
      endC: 11,
    },
  ];

  sigColPairs.forEach((sig) => {
    setCell(currentR, sig.startC, { t: "s", v: sig.title, s: styleSignatureHeader });
    merges.push({ s: { r: currentR, c: sig.startC }, e: { r: currentR, c: sig.endC } });
    fillEmptyRange(currentR, sig.startC, sig.endC, styleSignatureHeader);
  });
  rowsHeight[currentR] = { hpt: 20 };
  currentR++;

  // Signature Space (3 baris kosong)
  const sigBoxStart = currentR;
  for (let sRow = 0; sRow < 3; sRow++) {
    rowsHeight[currentR] = { hpt: 18 };
    sigColPairs.forEach((sig) => {
      fillEmptyRange(currentR, sig.startC, sig.endC, { border: borderThin });
    });
    currentR++;
  }

  // Signature Name Row
  sigColPairs.forEach((sig) => {
    setCell(currentR, sig.startC, { t: "s", v: sig.name, s: styleSignatureBox });
    merges.push({ s: { r: sigBoxStart, c: sig.startC }, e: { r: currentR, c: sig.endC } });
  });
  rowsHeight[currentR] = { hpt: 22 };

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentR, c: 17 },
  });
  ws["!merges"] = merges;
  ws["!rows"] = rowsHeight;
  ws["!cols"] = [
    { wch: 6 },  // 0: No
    { wch: 26 }, // 1: Parameter
    { wch: 18 }, // 2: Bobot Parameter
    { wch: 34 }, // 3: Indikator
    { wch: 18 }, // 4: Bobot Indikator
    { wch: 15 }, // 5: Target Tahunan
    { wch: 12 }, // 6: Satuan
    { wch: 16 }, // 7: Realisasi Tahunan
    { wch: 28 }, // 8: Kriteria Penilaian
    { wch: 10 }, // 9: Skor
    { wch: 14 }, // 10: Nilai Akhir
    { wch: 26 }, // 11: Deskripsi
    { wch: 10 }, // 12: Ags (M8)
    { wch: 10 }, // 13: Sep (M9)
    { wch: 10 }, // 14: Okt (M10)
    { wch: 10 }, // 15: Nov (M11)
    { wch: 10 }, // 16: Des (M12)
    { wch: 18 }, // 17: Realisasi Tahunan (Col R)
  ];

  return ws;
}

// =============================================================================
// UNIVERSAL EXPORT COMBINED WORKBOOK (REKAP + SHEET PER NAMA KARYAWAN)
// =============================================================================
export async function exportCombinedBatchKpiExcel(params: CombinedBatchExportParams): Promise<void> {
  const { year, activeStaging, rekapList, employeeDetails, filename } = params;
  if (!rekapList || rekapList.length === 0) return;

  const wb = XLSXStyle.utils.book_new();

  // 1. Build Sheet 1: Rekapitulasi Progres KPI Seluruh Karyawan
  const wsRekap = buildRekapSheet(rekapList, year);
  XLSXStyle.utils.book_append_sheet(wb, wsRekap, "Rekap");

  // Track sheet names to ensure strict uniqueness within Excel limits
  const usedSheetNames = new Set<string>(["rekap"]);

  // Kumpulkan seluruh parameter ber-scope DEPARTMENT dari employeeDetails
  const deptParamsMap = new Map<string, {
    departmentName: string;
    indicatorName: string;
    unit?: string | null;
    target?: number | string | null;
    annualActual?: number | null;
    monthlyActuals?: (number | null)[];
  }>();

  const deptParamRowIndexMap = new Map<string, number>();

  employeeDetails.forEach((d) => {
    if (!d?.categories) return;
    const deptName = d.employee?.departmentName || "-";
    d.categories.forEach((cat) => {
      cat.indicators.forEach((ind) => {
        if (ind.scope === "DEPARTMENT") {
          const key = `${deptName}___${ind.indicatorName.trim().toLowerCase()}`;
          if (!deptParamsMap.has(key)) {
            const bands = [...(ind.scoringRules || [])];
            const res = resolveIndicatorTargetAndUnit(ind, bands);
            const mActs = (ind.monthlyDetails || []).map((md) => md.actual);
            deptParamsMap.set(key, {
              departmentName: deptName,
              indicatorName: ind.indicatorName,
              unit: res.resolvedUnit,
              target: res.finalTargetVal,
              annualActual: ind.annualActual,
              monthlyActuals: mActs,
            });
          }
        }
      });
    });
  });

  const deptParamsList = Array.from(deptParamsMap.values());
  deptParamsList.forEach((dp, idx) => {
    const dName = (dp.departmentName || "").trim().toLowerCase();
    const iName = (dp.indicatorName || "").trim().toLowerCase();
    const excelRow = 5 + idx; // Baris data Excel 5, 6, 7...
    deptParamRowIndexMap.set(`${dName}___${iName}`, excelRow);
    deptParamRowIndexMap.set(`${dp.departmentName}___${dp.indicatorName.trim()}`, excelRow);
    if (!deptParamRowIndexMap.has(iName)) {
      deptParamRowIndexMap.set(iName, excelRow);
    }
  });

  // 2. Build Sheet 2: Realisasi Departemen (jika ada parameter Department KPI)
  if (deptParamsList.length > 0) {
    usedSheetNames.add("realisasi departemen");
    const wsDept = buildDepartmentRealizationSheet(deptParamsList, year);
    XLSXStyle.utils.book_append_sheet(wb, wsDept, "Realisasi Departemen");
  }

  // Map detail by employeeId for instant lookup
  const detailMap = new Map<number, MonthlyAssessmentDetailResult>();
  employeeDetails.forEach((d) => {
    if (d?.employee?.id) {
      detailMap.set(d.employee.id, d);
    }
  });

  // 3. Build Subsequent Sheets: One Sheet per Selected Employee
  rekapList.forEach((emp, idx) => {
    const detail = detailMap.get(emp.employeeId) || null;
    const sheetName = safeSheetName(emp.name, idx + 1, usedSheetNames);
    const wsEmp = buildIndividualEmployeeSheet(emp, detail, year, deptParamRowIndexMap);
    XLSXStyle.utils.book_append_sheet(wb, wsEmp, sheetName);
  });

  // Ensure Excel calculates formulas on open
  if (!wb.Workbook) wb.Workbook = {};
  (wb.Workbook as any).calcPr = { fullCalcOnLoad: 1, forceFullCalculation: 1 };

  const stageSuffix = activeStaging && activeStaging !== "ALL" ? `_${activeStaging}` : "";
  const dateStr = new Date().toISOString().slice(0, 10);
  const outFilename =
    filename || `Rekap_KPI_${year}${stageSuffix}_${rekapList.length}_Karyawan_${dateStr}.xlsx`;

  await saveStyledWorkbook(wb, outFilename);
}

// =============================================================================
// UNIVERSAL EXPORT SINGLE EMPLOYEE WORKBOOK (IDENTIKAL DENGAN FORMAT BATCH)
// =============================================================================
export async function exportSingleEmployeeKpiExcel(
  params: any,
  customFilename?: string
): Promise<void> {
  const empName = params.employee?.name || "Karyawan";
  const year = params.period?.year || new Date().getFullYear();

  const empItem = {
    employeeId: params.employee?.id || 1,
    nik: params.employee?.nik || "-",
    name: empName,
    jobPosition: params.employee?.jobPosition || "-",
    departmentName: params.employee?.departmentName || "-",
    templateName: params.employee?.templateName || params.templateName || "-",
    appraisalStatus: params.appraisalStatus || "Draft",
    finalScore: params.summary?.annualScorePercentage ?? (params.finalScore !== undefined ? params.finalScore : null),
    grade: params.summary?.grade || params.grade || "E",
  } as unknown as EmployeeProgressItem;

  const detail = {
    employee: {
      id: params.employee?.id || 1,
      name: empName,
      nik: params.employee?.nik || "-",
      departmentName: params.employee?.departmentName || "-",
      jobLevelName: params.employee?.jobLevelName || params.employee?.jobPosition || "-",
      jobPosition: params.employee?.jobPosition || "-",
      templateName: params.employee?.templateName || params.templateName || "-",
    },
    period: {
      id: params.period?.id || 1,
      name: params.period?.name || `Tahun ${year}`,
      year: year,
      status: "ACTIVE",
    },
    appraisalId: params.appraisalId || 1,
    appraisalStatus: params.appraisalStatus || "Draft",
    summary: {
      annualScoreDisplay: params.summary?.annualScoreDisplay || params.summary?.overallScoreDisplay || "0.0%",
      overallScoreDisplay: params.summary?.overallScoreDisplay || "0.0%",
      annualGrade: params.summary?.annualGrade || params.summary?.grade || "E",
      grade: params.summary?.grade || "E",
      annualScorePercentage: params.summary?.annualScorePercentage ?? 0,
    },
    categories: (params.categories as any[]) || [],
    approvalLine: params.approvalLine || null,
  } as unknown as MonthlyAssessmentDetailResult;

  const wb = XLSXStyle.utils.book_new();
  const usedSet = new Set<string>();

  // Kumpulkan parameter ber-scope DEPARTMENT jika ada
  const deptParamsMap = new Map<string, {
    departmentName: string;
    indicatorName: string;
    unit?: string | null;
    target?: number | string | null;
    annualActual?: number | null;
    monthlyActuals?: (number | null)[];
  }>();
  const deptParamRowIndexMap = new Map<string, number>();
  const empDept = detail.employee?.departmentName || "-";

  (detail.categories || []).forEach((cat: any) => {
    (cat.indicators || []).forEach((ind: any) => {
      if (ind.scope === "DEPARTMENT") {
        const key = `${empDept}___${(ind.indicatorName || (ind as any).name || "").trim().toLowerCase()}`;
        if (!deptParamsMap.has(key)) {
          const bands = [...(ind.scoringRules || [])];
          const res = resolveIndicatorTargetAndUnit(ind, bands);
          const mActs = (ind.monthlyDetails || []).map((md: any) => md.actual);
          deptParamsMap.set(key, {
            departmentName: empDept,
            indicatorName: ind.indicatorName || (ind as any).name,
            unit: res.resolvedUnit,
            target: res.finalTargetVal,
            annualActual: ind.annualActual,
            monthlyActuals: mActs,
          });
        }
      }
    });
  });

  const deptParamsList = Array.from(deptParamsMap.values());
  if (deptParamsList.length > 0) {
    deptParamsList.forEach((dp, idx) => {
      const dName = (dp.departmentName || "").trim().toLowerCase();
      const iName = (dp.indicatorName || "").trim().toLowerCase();
      const excelRow = 5 + idx;
      deptParamRowIndexMap.set(`${dName}___${iName}`, excelRow);
      deptParamRowIndexMap.set(`${dp.departmentName}___${dp.indicatorName.trim()}`, excelRow);
      if (!deptParamRowIndexMap.has(iName)) {
        deptParamRowIndexMap.set(iName, excelRow);
      }
    });
    usedSet.add("realisasi departemen");
    const wsDept = buildDepartmentRealizationSheet(deptParamsList, year);
    XLSXStyle.utils.book_append_sheet(wb, wsDept, "Realisasi Departemen");
  }

  const sheetName = safeSheetName(empName, 1, usedSet);
  const wsEmp = buildIndividualEmployeeSheet(empItem, detail, year, deptParamRowIndexMap);
  XLSXStyle.utils.book_append_sheet(wb, wsEmp, sheetName);

  if (!wb.Workbook) wb.Workbook = {};
  (wb.Workbook as any).calcPr = { fullCalcOnLoad: 1, forceFullCalculation: 1 };

  const safeFilename =
    customFilename ||
    `Hasil_Evaluasi_KPI_${empName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${year}.xlsx`;

  await saveStyledWorkbook(wb, safeFilename);
}
