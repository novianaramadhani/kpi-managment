import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import JSZip from "jszip";
import type { KpiBand, KpiCategory, KpiParameter, KpiTemplate } from "@/db/schema";
import { saveWorkbook } from "./excel-template";
import {
  convertTemplateToMatrixData,
  exportCorporateKpiMatrixExcel,
  exportBatchCorporateKpiMatrixExcel,
} from "./excel-kpi-matrix";
import { cleanTemplateEmployeeName } from "./master-employee-matcher";
import {
  validateStructuredCriteria,
  parseRangeValues,
  autoHarmonizeCriteriaBands,
  detectIndicatorUnit,
  type CriteriaItem,
} from "./kpi-criteria-helper";
import type {
  WizardCategoryStructure,
  WizardTemplateStructureResult,
  WizardSubParameter,
} from "./actions";

export interface ParsedBand {
  id?: number | null;
  action?: "CREATE" | "UPDATE" | "UNCHANGED";
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  minValue: number | null;
  maxValue: number | null;
  score: number;
  sortOrder: number;
  operatorSymbol?: string;
  criteriaValue?: string;
  isUnrecognizedOperator?: boolean;
  minInclusive?: boolean;
  maxInclusive?: boolean;
  needsManualReview?: boolean;
  manualReviewReason?: string;
}

export interface ParsedParam {
  id?: number | null;
  masterParameterId?: number | null;
  action?: "CREATE" | "UPDATE" | "UNCHANGED";
  name: string;
  description: string;
  target?: string;
  unit: string;
  weight: number; // 0 to 1 (e.g. 0.20 for 20%)
  maxScore: number;
  inputType: "MONTHLY_ACTUAL" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "QUALITATIVE";
  aggregation: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
  compareBasis: "ACTUAL" | "ACHIEVEMENT";
  picRole: "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
  sortOrder: number;
  bands: ParsedBand[];
  // Metadata hirarki: Indikator & Sub Parameter
  indicatorName?: string;
  indicatorNumber?: string;
  subParamNumber?: string;
  indicatorWeight?: number;
}

export interface ParsedCategory {
  id?: number | null;
  masterParameterId?: number | null;
  action?: "CREATE" | "UPDATE" | "UNCHANGED";
  name: string;
  weight: number; // 0 to 1 (e.g. 0.65 for 65%)
  categoryType: "DIRECT" | "SUB_ITEMS";
  sortOrder: number;
  params: ParsedParam[];
}

export interface ParseResult {
  categories: ParsedCategory[];
  totalWeight: number; // e.g. 1.15
  totalParams: number;
  totalBands: number;
  updateCount: number;
  createCount: number;
  hasSystemMapping: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// 1. SMART CONDITION PARSER & FORMATTER
// =============================================================================
export function formatCriteriaExcel(
  label: string,
  operator: string,
  minValue: number | string | null | undefined,
  maxValue: number | string | null | undefined,
  unit?: string | null
): string {
  const min =
    minValue !== null && minValue !== undefined && minValue !== ""
      ? String(minValue).replace(/\.0000$/, "").replace(/\.00$/, "")
      : "";
  const max =
    maxValue !== null && maxValue !== undefined && maxValue !== ""
      ? String(maxValue).replace(/\.0000$/, "").replace(/\.00$/, "")
      : "";
  const u = (unit || "").trim();

  const formatVal = (v: string) => {
    if (!v) return "";
    if (u === "%") return `${v}%`;
    if (u.toLowerCase() === "rp") {
      const n = Number(v);
      return !isNaN(n) ? `Rp ${n.toLocaleString("id-ID")}` : `Rp ${v}`;
    }
    if (u) return `${v} ${u}`;
    return v;
  };

  let cond = "";
  switch (operator) {
    case "GT":
      cond = min ? `> ${formatVal(min)}` : "";
      break;
    case "GTE":
      cond = min ? `≥ ${formatVal(min)}` : "";
      break;
    case "LT":
      cond = (max || min) ? `< ${formatVal(max || min)}` : "";
      break;
    case "LTE":
      cond = (max || min) ? `≤ ${formatVal(max || min)}` : "";
      break;
    case "EQ":
      cond = min ? `= ${formatVal(min)}` : "";
      break;
    case "BETWEEN":
      cond = min && max ? `${formatVal(min)} - ${formatVal(max)}` : "";
      break;
    case "TEXT":
      cond = label || "";
      break;
    default:
      cond = label || "";
  }

  if (label && cond) {
    const cleanL = label.trim();
    const cleanC = cond.trim();
    if (cleanL.toLowerCase() === cleanC.toLowerCase()) {
      return cleanL;
    }
    if (/^[><=≥≤]/.test(cleanL) || /^\d/.test(cleanL)) {
      if (/[a-zA-Z]/.test(cleanL) && !cleanC.toLowerCase().includes(cleanL.toLowerCase())) {
        return cleanL;
      }
      return cleanC || cleanL;
    }
    return `${cleanL} (${cleanC})`;
  }
  return cond || label || "-";
}

export interface ParsedConditionResult {
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  minValue: number | null;
  maxValue: number | null;
  cleanLabel: string;
  operatorSymbol: string;
  criteriaValue: string;
  isUnrecognizedOperator: boolean;
}

export function extractCriteriaValue(label: string, operator: string): string {
  if (!label) return "";
  const trimmed = label.trim();
  const parenMatch = trimmed.match(/^([^(]+)\(([^)]+)\)$/);
  const targetStr = parenMatch ? parenMatch[2].trim() : trimmed;

  switch (operator) {
    case "GTE":
      return targetStr.replace(/^(?:>=|≥|=>)\s*/, "").trim();
    case "GT":
      return targetStr.replace(/^>\s*/, "").trim();
    case "LTE":
      return targetStr.replace(/^(?:<=|≤|=<)\s*/, "").trim();
    case "LT":
      return targetStr.replace(/^<\s*/, "").trim();
    case "EQ":
      return targetStr.replace(/^(?:=|==)\s*/, "").trim();
    case "BETWEEN":
      return targetStr.replace(/^[><=≥≤\s]+/, "").trim();
    default:
      return targetStr;
  }
}

export function formatCriteriaString(operatorSymbol: string, criteriaValue: string): string {
  const cleanVal = (criteriaValue || "").trim();
  if (!cleanVal) return "";
  switch (operatorSymbol) {
    case ">=":
      return cleanVal.startsWith(">=") || cleanVal.startsWith("≥") ? cleanVal : `>= ${cleanVal.replace(/^[>=≥\s]+/, "")}`;
    case ">":
      return cleanVal.startsWith(">") && !cleanVal.startsWith(">=") ? cleanVal : `> ${cleanVal.replace(/^[>\s]+/, "")}`;
    case "<=":
      return cleanVal.startsWith("<=") || cleanVal.startsWith("≤") ? cleanVal : `<= ${cleanVal.replace(/^[<=≤\s]+/, "")}`;
    case "<":
      return cleanVal.startsWith("<") && !cleanVal.startsWith("<=") ? cleanVal : `< ${cleanVal.replace(/^[<\s]+/, "")}`;
    case "=":
      return cleanVal.startsWith("=") ? cleanVal : `= ${cleanVal.replace(/^[=\s]+/, "")}`;
    case "Rentang":
      return cleanVal;
    case "Teks":
      return cleanVal;
    case "?":
      return cleanVal;
    default:
      return cleanVal;
  }
}

export function parseConditionString(raw: string): ParsedConditionResult {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return {
      operator: "TEXT",
      minValue: null,
      maxValue: null,
      cleanLabel: "",
      operatorSymbol: "Teks",
      criteriaValue: "",
      isUnrecognizedOperator: false,
    };
  }

  // Cek apakah ada predikat di luar kurung dan rumus di dalam kurung, e.g. "Sangat Baik (≤ 3%)"
  const parenMatch = trimmed.match(/^([^(]+)\(([^)]+)\)$/);
  const targetStr = parenMatch ? parenMatch[2].trim() : trimmed;
  const labelFallback = parenMatch ? parenMatch[1].trim() : trimmed;

  // Cek jika diawali simbol perbandingan yang tidak dikenali
  const hasUnrecognizedPrefix =
    /^[~±!#$^&?*]/.test(targetStr) ||
    targetStr.toLowerCase().startsWith("approx") ||
    targetStr.startsWith("+/-");

  if (hasUnrecognizedPrefix) {
    return {
      operator: "TEXT",
      minValue: null,
      maxValue: null,
      cleanLabel: labelFallback,
      operatorSymbol: "?",
      criteriaValue: targetStr,
      isUnrecognizedOperator: true,
    };
  }

  // 1. Between (Rentang): "95% - 97%", "90–95%", "95 s/d 97", ">3 % s/d 6%", ">90 % <95 %"
  const rangeParsed = parseRangeValues(targetStr);
  if (rangeParsed) {
    const cleanVal = targetStr.replace(/^[><=≥≤\s]+/, "").trim();
    return {
      operator: "BETWEEN",
      minValue: rangeParsed.min,
      maxValue: rangeParsed.max,
      cleanLabel: labelFallback,
      operatorSymbol: "Rentang",
      criteriaValue: cleanVal || `${rangeParsed.min} - ${rangeParsed.max}`,
      isUnrecognizedOperator: false,
    };
  }

  // 2. GTE: ">= 98%", "≥ 98%", "=> 98"
  const gteMatch = targetStr.match(/^(?:>=|≥|=>)\s*(.+)$/);
  if (gteMatch) {
    const rest = gteMatch[1].trim();
    const numM = rest.match(/^([0-9.]+)/);
    if (numM) {
      return {
        operator: "GTE",
        minValue: parseFloat(numM[1]),
        maxValue: null,
        cleanLabel: labelFallback,
        operatorSymbol: ">=",
        criteriaValue: rest,
        isUnrecognizedOperator: false,
      };
    }
  }

  // 3. GT: "> 95%", ">95"
  const gtMatch = targetStr.match(/^>\s*(.+)$/);
  if (gtMatch) {
    const rest = gtMatch[1].trim();
    const numM = rest.match(/^([0-9.]+)/);
    if (numM) {
      return {
        operator: "GT",
        minValue: parseFloat(numM[1]),
        maxValue: null,
        cleanLabel: labelFallback,
        operatorSymbol: ">",
        criteriaValue: rest,
        isUnrecognizedOperator: false,
      };
    }
  }

  // 4. LTE: "<= 3%", "≤ 3%", "=< 3"
  const lteMatch = targetStr.match(/^(?:<=|≤|=<)\s*(.+)$/);
  if (lteMatch) {
    const rest = lteMatch[1].trim();
    const numM = rest.match(/^([0-9.]+)/);
    if (numM) {
      return {
        operator: "LTE",
        minValue: null,
        maxValue: parseFloat(numM[1]),
        cleanLabel: labelFallback,
        operatorSymbol: "<=",
        criteriaValue: rest,
        isUnrecognizedOperator: false,
      };
    }
  }

  // 5. LT: "< 95%", "<95", "<25 M"
  const ltMatch = targetStr.match(/^<\s*(.+)$/);
  if (ltMatch) {
    const rest = ltMatch[1].trim();
    const numM = rest.match(/^([0-9.]+)/);
    if (numM) {
      return {
        operator: "LT",
        minValue: null,
        maxValue: parseFloat(numM[1]),
        cleanLabel: labelFallback,
        operatorSymbol: "<",
        criteriaValue: rest,
        isUnrecognizedOperator: false,
      };
    }
  }

  // 6. EQ: "= 95", "== 95"
  const eqMatch = targetStr.match(/^(?:=|==)\s*(.+)$/);
  if (eqMatch) {
    const rest = eqMatch[1].trim();
    const numM = rest.match(/^([0-9.]+)/);
    if (numM) {
      return {
        operator: "EQ",
        minValue: parseFloat(numM[1]),
        maxValue: null,
        cleanLabel: labelFallback,
        operatorSymbol: "=",
        criteriaValue: rest,
        isUnrecognizedOperator: false,
      };
    }
  }

  // 7. Standalone number without operator symbol: "95", "100%", "25"
  const numOnlyMatch = targetStr.match(/^([0-9.]+)\s*(%|[a-zA-Z]+)?$/);
  if (numOnlyMatch) {
    return {
      operator: "EQ",
      minValue: parseFloat(numOnlyMatch[1]),
      maxValue: null,
      cleanLabel: labelFallback,
      operatorSymbol: "=",
      criteriaValue: targetStr,
      isUnrecognizedOperator: false,
    };
  }

  // 8. Qualitative / Binary Text (e.g. "Ya", "Tidak", "Nol Insiden", "SP 1 Aktif", "Tidak ada SP")
  const hasAmbiguousSymbols = /[^a-zA-Z0-9\s()%/.,_-]/.test(targetStr);
  if (hasAmbiguousSymbols) {
    return {
      operator: "TEXT",
      minValue: null,
      maxValue: null,
      cleanLabel: labelFallback,
      operatorSymbol: "?",
      criteriaValue: targetStr,
      isUnrecognizedOperator: true,
    };
  }

  return {
    operator: "TEXT",
    minValue: null,
    maxValue: null,
    cleanLabel: labelFallback,
    operatorSymbol: "Teks",
    criteriaValue: targetStr,
    isUnrecognizedOperator: false,
  };
}

// =============================================================================
// 2. EXPORT KPI TEMPLATE TO EXCEL (Sesuai Struktur Master Template)
// Parameter -> Indikator -> Kriteria Penilaian -> Skor -> Bobot
// Ditambah Hidden Sheet _SYSTEM_MAPPING
// =============================================================================
// Helper untuk membangun baris data sheet Struktur Master KPI & System Mapping
// =============================================================================
export function buildKpiTemplateSheetRows({
  template,
  departmentName,
  jobLevelName,
  periodYear = "2026",
  employee,
  categories,
  parameters,
  bands,
}: {
  template: KpiTemplate;
  departmentName?: string;
  jobLevelName?: string;
  periodYear?: string;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentName?: string | null;
  } | null;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
}) {
  let empName = employee?.name || "";
  let empNik = employee?.nik || "";
  let empJobPosition = employee?.jobPosition || "";
  const empDept = employee?.departmentName || departmentName || "Semua Departemen";

  // Fallback nama & jabatan jika template personal tapi employee record belum ter-link langsung
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

  const rows: (string | number | null | { f?: string; v?: any })[][] = [];

  // Baris 1-6: Metadata Header Karyawan & Template KPI
  rows.push(["FORMULIR TARGET & PENILAIAN KPI (TEMPLATE BULANAN)"]);
  rows.push([]);
  rows.push([
    "Nama Karyawan:",
    empName,
    "",
    "",
    "Departemen:",
    empDept,
  ]);
  rows.push([
    "NIK:",
    empNik || "-",
    "",
    "",
    "Job Position:",
    empJobPosition || "-",
  ]);
  rows.push([
    "Tahun Periode:",
    periodYear || "2026",
    "",
    "",
    "Job Level:",
    jobLevelName || "-",
  ]);
  rows.push([]);

  const MONTH_NAMES = [
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
  ];

  // Baris 7: Header Kolom Tabel (24 Kolom Standar Korporat)
  const headers = [
    "No",
    "Parameter",
    "Bobot Parameter (%)",
    "Indikator",
    "Bobot Indikator (%)",
    "Target Tahunan",
    "Satuan",
    "Type",
    ...MONTH_NAMES,
    "Realisasi",
    "Kriteria Penilaian",
    "Skor",
    "Deskripsi",
  ];
  rows.push(headers);

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

  const sortedCats = [...categories].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
  );

  let globalRowCounter = 0;

  for (let catIdx = 0; catIdx < sortedCats.length; catIdx++) {
    const cat = sortedCats[catIdx];
    const catWeightPct = Math.round(Number(cat.weight) * 100);
    const catParams = parameters
      .filter((p) => p.categoryId === cat.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

    if (catParams.length === 0) {
      globalRowCounter++;
      rows.push([
        String(catIdx + 1),
        cat.name,
        catWeightPct,
        "-",
        100,
        "-",
        "-",
        "Target",
        ...MONTH_NAMES.map(() => "-"),
        "-",
        "-",
        25,
        "",
      ]);
      mappingRows.push([
        globalRowCounter,
        template.id,
        cat.id,
        cat.name,
        null,
        "",
        null,
        "",
        null,
        "Target",
      ]);
      continue;
    }

    const isTargetKerja =
      catIdx === 0 || cat.name.toLowerCase().includes("target kerja");

    for (let pIdx = 0; pIdx < catParams.length; pIdx++) {
      const p = catParams[pIdx];
      const pWeightPct = Math.round(Number(p.weight) * 100);
      const noLabel = isTargetKerja
        ? `${catIdx + 1}.${pIdx + 1}`
        : String(catIdx + 1);
      const paramDisplayName = isTargetKerja ? p.name : cat.name;
      const displayIndWeight = isTargetKerja ? pWeightPct : 100;

      const pBands = bands
        .filter((b) => b.parameterId === p.id)
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            Number(b.score ?? 0) - Number(a.score ?? 0)
        );

      const targetVal = p.target || "100";
      const unitVal = p.unit || "%";
      const b1 = pBands[0];
      const b2 = pBands[1];

      // Baris 1: Target
      globalRowCounter++;
      const monthlyTargetCols = MONTH_NAMES.map(() => {
        const num = Number(targetVal);
        return isNaN(num) ? targetVal : num;
      });

      rows.push([
        noLabel,
        cat.name,
        catWeightPct,
        paramDisplayName,
        displayIndWeight,
        isNaN(Number(targetVal)) ? targetVal : Number(targetVal),
        unitVal,
        "Target",
        ...monthlyTargetCols,
        isNaN(Number(targetVal)) ? targetVal : Number(targetVal),
        b1
          ? formatCriteriaExcel(b1.label, b1.operator, b1.minValue, b1.maxValue, unitVal)
          : "-",
        b1 ? Number(b1.score) : 25,
        p.description || "",
      ]);
      mappingRows.push([
        globalRowCounter,
        template.id,
        cat.id,
        cat.name,
        p.id,
        p.name,
        b1?.id || null,
        b1?.label || "",
        b1 ? Number(b1.score) : null,
        "Target",
      ]);

      // Baris 2: Actual (Kolom input actual bulanan untuk user!)
      globalRowCounter++;
      const actualExcelRowNum = rows.length + 1; // 1-indexed row number di Excel
      const monthlyActualCols = MONTH_NAMES.map(() => null);

      const isSum = String(p.aggregation || "").toUpperCase() === "SUM";
      const realizationFormula = isSum
        ? `SUM(I${actualExcelRowNum}:T${actualExcelRowNum})`
        : `IFERROR(AVERAGE(I${actualExcelRowNum}:T${actualExcelRowNum}), "")`;

      rows.push([
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Actual",
        ...monthlyActualCols,
        { f: realizationFormula },
        b2
          ? formatCriteriaExcel(b2.label, b2.operator, b2.minValue, b2.maxValue, unitVal)
          : "",
        b2 ? Number(b2.score) : "",
        "",
      ]);
      mappingRows.push([
        globalRowCounter,
        template.id,
        cat.id,
        cat.name,
        p.id,
        p.name,
        b2?.id || null,
        b2?.label || "",
        b2 ? Number(b2.score) : null,
        "Actual",
      ]);

      // Baris 3..n: Kriteria penilaian tambahan (jika ada lebih dari 2 kriteria)
      for (let bIdx = 2; bIdx < pBands.length; bIdx++) {
        const bExtra = pBands[bIdx];
        globalRowCounter++;
        rows.push([
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          ...Array(12).fill(""),
          "",
          formatCriteriaExcel(
            bExtra.label,
            bExtra.operator,
            bExtra.minValue,
            bExtra.maxValue,
            unitVal
          ),
          Number(bExtra.score),
          "",
        ]);
        mappingRows.push([
          globalRowCounter,
          template.id,
          cat.id,
          cat.name,
          p.id,
          p.name,
          bExtra.id,
          bExtra.label,
          Number(bExtra.score),
          "Criteria",
        ]);
      }
    }
  }

  // Baris Total Ringkasan Bobot di bagian bawah tabel
  const totalWeightPct = categories.reduce(
    (sum, c) => sum + Math.round(Number(c.weight) * 100),
    0
  );
  rows.push([
    "",
    "TOTAL BOBOT",
    totalWeightPct,
    "",
    "",
    "",
    "",
    "",
    ...Array(12).fill(""),
    "",
    "",
    "",
    "",
  ]);

  return { rows, mappingRows };
}

// =============================================================================
// Export Single Template KPI to Excel (Format Gambar 1: Matrix Dua Sisi + Styled)
// =============================================================================
export function exportKpiTemplateToExcel({
  template,
  departmentName,
  jobLevelName,
  periodYear = "2026",
  employee,
  categories,
  parameters,
  bands,
}: {
  template: KpiTemplate;
  departmentName?: string;
  jobLevelName?: string;
  periodYear?: string;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentName?: string | null;
  } | null;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
}) {
  const matrixData = convertTemplateToMatrixData({
    template,
    departmentName,
    jobLevelName,
    periodYear,
    employee,
    categories,
    parameters,
    bands,
  });

  exportCorporateKpiMatrixExcel(matrixData);
}

// =============================================================================
// Export Batch Beberapa Template KPI ke 1 File Excel Multi-Sheet (Format Gambar 1)
// =============================================================================
export function exportBatchKpiTemplatesToCombinedExcel(
  items: {
    template: KpiTemplate;
    departmentName?: string;
    jobLevelName?: string;
    categories: KpiCategory[];
    parameters: KpiParameter[];
    bands: KpiBand[];
    employee?: {
      id?: number;
      nik?: string | null;
      name?: string | null;
      jobPosition?: string | null;
      departmentName?: string | null;
    } | null;
  }[]
) {
  if (items.length === 0) return;
  const matrixItems = items.map((item) =>
    convertTemplateToMatrixData({
      template: item.template,
      departmentName: item.departmentName,
      jobLevelName: item.jobLevelName,
      employee: item.employee,
      categories: item.categories,
      parameters: item.parameters,
      bands: item.bands,
    })
  );

  exportBatchCorporateKpiMatrixExcel(matrixItems);
}

// =============================================================================
// 3. DOWNLOAD BLANK TEMPLATE KPI (Template Kosong Murni Hanya Nama 12 Field)
// =============================================================================
export function createGuideRows(templateInfo?: {
  name?: string;
  departmentName?: string;
  jobLevelName?: string;
  totalWeightPct?: number;
}): (string | number)[][] {
  return [
    ["PANDUAN LENGKAP STRUKTUR MASTER TEMPLATE KPI EXCEL"],
    [""],
    ...(templateInfo?.name
      ? [
          ["Informasi Template:", templateInfo.name],
          ["Departemen:", templateInfo.departmentName || "Semua Departemen"],
          ["Job Level:", templateInfo.jobLevelName || "-"],
          ["Target Total Bobot Template:", `${templateInfo.totalWeightPct || 115}%`],
          [""],
        ]
      : []),
    ["1. PENJELASAN 10 KOLOM STANDAR TEMPLATE KPI:"],
    [
      "1. Parameter",
      "Nama parameter penilaian level 1 (contoh: 'Target Kerja', 'Kehadiran & Disiplin', 'Keselamatan Kerja / HSE', 'Continuous Improvement').",
    ],
    [
      "2. Bobot Parameter (%)",
      "Bobot persentase parameter terhadap total KPI (contoh: 65, 20, 15). Standar total bobot seluruh parameter adalah 115%.",
    ],
    [
      "3. Indikator",
      "Nama indikator atau sub-poin KPI (contoh: '1.1 Pemenuhan KPI Operasional Bulanan'). Untuk parameter langsung (Direct), kolom ini dapat dikosongkan.",
    ],
    [
      "4. Deskripsi / Target",
      "Penjelasan detail tugas acuan kerja atau deskripsi target yang diharapkan.",
    ],
    [
      "5. Satuan",
      "Satuan pengukuran penilaian (contoh: '%', 'Rp', 'Kegiatan', 'Hari', 'Insiden', 'Dokumen', 'Inisiatif').",
    ],
    [
      "6. Kriteria Penilaian",
      "Kondisi batasan skor (contoh: '≥ 98%', '95% – 97%', '< 95%', '≤ 100%', atau kualitatif 'Nol Insiden').",
    ],
    [
      "7. Skor",
      "Nilai skor pencapaian kriteria (standar: 25 untuk tercapai, 15 cukup, 5 di bawah target).",
    ],
    [
      "8. Bobot Indikator (%)",
      "Bobot internal indikator di dalam parameter. Untuk parameter bersub-indikator, total seluruh indikator harus tepat 100%. Untuk parameter langsung (Direct), bobot otomatis 100%.",
    ],
    [
      "9. Tipe Input",
      "Tipe input realisasi bulanan: MONTHLY_ACTUAL (persentase/angka bulanan), NUMBER (angka bulat), CURRENCY (nominal rupiah), PERCENTAGE (persen), atau QUALITATIVE (pilihan teks/kondisi). Default: MONTHLY_ACTUAL.",
    ],
    [""],
    ["2. ATURAN BOBOT TEMPLATE:"],
    ["- Total Bobot Seluruh Parameter", "Harus berjumlah tepat 115% (atau sesuai target total template)."],
    [
      "- Parameter Langsung (Direct)",
      "Cukup isi nama Parameter dan kriteria. Bobot indikator otomatis 100%.",
    ],
    [
      "- Parameter dengan Sub-Indikator",
      "Total bobot internal seluruh sub-indikator di dalam satu parameter harus berjumlah tepat 100%.",
    ],
    [""],
    ["3. CARA PENGISIAN MULTI-BARIS KRITERIA PENILAIAN (SCORING BANDS):"],
    [
      "- Baris Pertama Indikator",
      "Isi lengkap: Parameter, Bobot Parameter, Indikator, Target, Satuan, Kriteria pertama, Skor, Bobot Indikator, Tipe Input, dan Deskripsi.",
    ],
    [
      "- Baris Kriteria Ke-2, Ke-3, dst.",
      "Kosongkan kolom Parameter, Indikator, dan Bobot. Cukup isi kolom Kriteria Penilaian dan Skor.",
    ],
    [
      "- Otomasi Sistem",
      "Sistem parser cerdas akan otomatis mengaitkan baris kriteria tambahan ke indikator di atasnya.",
    ],
    [""],
    ["4. CONTOH FORMAT PENULISAN OPERATOR KRITERIA:"],
    ["- Lebih besar atau sama (≥)", "≥ 98% atau >= 98%"],
    ["- Lebih besar (>)", "> 95% atau > 95"],
    ["- Rentang nilai (Between)", "95% – 97%, 95 s/d 97, atau >3 % s/d 6%"],
    ["- Lebih kecil atau sama (≤)", "≤ 3% atau <= 3%"],
    ["- Lebih kecil (<)", "< 95% atau < 25 M"],
    ["- Teks Kualitatif", "Nol Insiden (Zero Accident), SP 1, Tidak Ada SP, atau 1 Inovasi Diterapkan"],
  ];
}

export function downloadBlankKpiTemplate(options?: {
  filename?: string;
  templateName?: string;
  departmentName?: string;
  jobLevelName?: string;
  totalWeightPct?: number;
}) {
  const wb = XLSX.utils.book_new();

  const headers = [
    "No",
    "Parameter",
    "Bobot Parameter (%)",
    "Indikator",
    "Target",
    "Satuan",
    "Kriteria Penilaian",
    "Skor",
    "Bobot Indikator (%)",
    "Tipe Input",
    "Deskripsi",
  ];

  // Baris contoh standar 115% yang siap diedit atau langsung diimport
  const sampleRows: (string | number)[][] = [
    headers,
    ["1.1", "Target Kerja", 65, "Pemenuhan KPI Operasional Bulanan", "100", "%", "≥ 98%", 25, 60, "MONTHLY_ACTUAL", "Pencapaian target operasional departemen"],
    ["", "", "", "", "", "", "95% – 97%", 15, "", "", ""],
    ["", "", "", "", "", "", "< 95%", 5, "", "", ""],
    ["1.2", "", "", "Efisiensi Anggaran & Biaya", "100", "%", "≤ 100%", 25, 40, "CURRENCY", "Realisasi biaya vs budget operasional"],
    ["", "", "", "", "", "", "> 100% s/d 105%", 15, "", "", ""],
    ["", "", "", "", "", "", "> 105%", 5, "", "", ""],
    ["2.1", "Kehadiran & Disiplin", 20, "Tingkat Kehadiran Kerja", "100", "%", "≥ 98%", 25, 50, "PERCENTAGE", "Persentase kehadiran fisik & presensi karyawan"],
    ["", "", "", "", "", "", "95% – 97%", 15, "", "", ""],
    ["", "", "", "", "", "", "< 95%", 5, "", "", ""],
    ["2.2", "", "", "Kepatuhan Jam Kerja (Tanpa Keterlambatan)", "0", "Hari", "0 Hari Terlambat", 25, 50, "NUMBER", "Kedisiplinan jam datang dan pulang kerja"],
    ["", "", "", "", "", "", "1 – 2 Hari Terlambat", 15, "", "", ""],
    ["", "", "", "", "", "", "> 2 Hari Terlambat", 5, "", "", ""],
    ["3.1", "Keselamatan Kerja (K3 / HSE)", 15, "Insiden Keselamatan Kerja", "0", "Insiden", "Nol Insiden (Zero Accident)", 25, 100, "QUALITATIVE", "Insiden keselamatan kerja di area operasional"],
    ["", "", "", "", "", "", "Insiden Ringan (First Aid)", 15, "", "", ""],
    ["", "", "", "", "", "", "Insiden Berat / Fatality", 0, "", "", ""],
    ["4.1", "Continuous Improvement", 15, "Inisiatif Perbaikan Proses", "1", "Inisiatif", "≥ 1 Inovasi Tervalidasi", 25, 100, "QUALITATIVE", "Inisiatif perbaikan proses kerja atau efisiensi yang tervalidasi"],
    ["", "", "", "", "", "", "Sedang Dalam Pengusulan", 15, "", "", ""],
    ["", "", "", "", "", "", "Tidak Ada Inovasi", 5, "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws["!cols"] = [
    { wch: 8 },  // No
    { wch: 28 }, // Parameter
    { wch: 22 }, // Bobot Parameter (%)
    { wch: 34 }, // Indikator
    { wch: 14 }, // Target
    { wch: 12 }, // Satuan
    { wch: 28 }, // Kriteria Penilaian
    { wch: 10 }, // Skor
    { wch: 22 }, // Bobot Indikator (%)
    { wch: 20 }, // Tipe Input
    { wch: 40 }, // Deskripsi
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Struktur Master KPI");

  // Sheet 2: Panduan & Ketentuan Lengkap
  const wsGuide = XLSX.utils.aoa_to_sheet(
    createGuideRows({
      name: options?.templateName,
      departmentName: options?.departmentName,
      jobLevelName: options?.jobLevelName,
      totalWeightPct: options?.totalWeightPct || 115,
    })
  );
  wsGuide["!cols"] = [{ wch: 32 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan & Ketentuan");

  const fname = options?.filename || "Template_Master_KPI.xlsx";
  saveWorkbook(wb, fname);
}

/**
 * Backward compatibility alias for downloadBlankKpiTemplate
 */
export const downloadSampleKpiTemplate = downloadBlankKpiTemplate;

export interface DepartmentJobLevelParameter {
  id: number;
  code?: string | null;
  name: string;
  unit?: string;
  categoryName?: string | null;
  description?: string | null;
  weight: number;
  weightPct?: number;
  inputType?: string;
  defaultBands?: Array<{
    score: number;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
  }> | null;
}

/**
 * Download format Excel KPI yang sudah otomatis terisi Parameter, Satuan, dan Bobot
 * berdasarkan Kamus Parameter Departemen dan konfigurasi Job Level.
 * Excel hanya perlu diisi Indikator, Target, Kriteria Penilaian, dan Skor.
 */
export function downloadDepartmentJobLevelKpiTemplate({
  departmentName,
  jobLevelName,
  periodYear,
  templateName,
  parameters,
  totalWeightPct = 115,
  filename,
}: {
  departmentName: string;
  jobLevelName: string;
  periodYear: string;
  templateName: string;
  parameters: DepartmentJobLevelParameter[];
  totalWeightPct?: number;
  filename?: string;
}) {
  const wb = XLSX.utils.book_new();

  const headers = [
    "No",
    "Parameter",
    "Bobot Parameter (%)",
    "Satuan",
    "Indikator",
    "Target",
    "Kriteria Penilaian",
    "Skor",
    "Bobot Indikator (%)",
    "Tipe Input",
    "Deskripsi",
  ];

  const rows: (string | number | null)[][] = [headers];

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
  ];
  const mappingRows: (string | number | null)[][] = [mappingHeaders];

  let globalRowCounter = 0;

  for (let idx = 0; idx < parameters.length; idx++) {
    const p = parameters[idx];
    const pWeightPct = p.weightPct ?? Math.round(Number(p.weight) * 100);

    const bands =
      p.defaultBands && p.defaultBands.length > 0
        ? p.defaultBands
        : [
            { label: "Target Tercapai (>= 98%)", score: 25 },
            { label: "Cukup (95% - 97%)", score: 15 },
            { label: "Kurang (< 95%)", score: 5 },
          ];

    for (let bIdx = 0; bIdx < bands.length; bIdx++) {
      const b = bands[bIdx];
      globalRowCounter++;
      rows.push([
        bIdx === 0 ? String(idx + 1) : "",
        bIdx === 0 ? p.name : "",
        bIdx === 0 ? pWeightPct : "",
        bIdx === 0 ? (p.unit || "%") : "",
        bIdx === 0 ? p.name : "",
        bIdx === 0 ? "100" : "",
        b.label,
        Number(b.score),
        bIdx === 0 ? 100 : "",
        bIdx === 0 ? (p.inputType || "MONTHLY_ACTUAL") : "",
        bIdx === 0 ? (p.description || "") : "",
      ]);

      mappingRows.push([
        globalRowCounter,
        null,
        p.id,
        p.name,
        null,
        p.name,
        null,
        b.label,
        Number(b.score),
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 },  // No
    { wch: 32 }, // Parameter
    { wch: 22 }, // Bobot Parameter (%)
    { wch: 12 }, // Satuan
    { wch: 36 }, // Indikator
    { wch: 14 }, // Target
    { wch: 32 }, // Kriteria Penilaian
    { wch: 10 }, // Skor
    { wch: 22 }, // Bobot Indikator (%)
    { wch: 20 }, // Tipe Input
    { wch: 40 }, // Deskripsi
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Struktur Master KPI");

  const wsMapping = XLSX.utils.aoa_to_sheet(mappingRows);
  XLSX.utils.book_append_sheet(wb, wsMapping, "_SYSTEM_MAPPING");

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
  const mapSheetIdx = wb.SheetNames.indexOf("_SYSTEM_MAPPING");
  if (mapSheetIdx >= 0) {
    wb.Workbook.Sheets[mapSheetIdx] = {
      Hidden: 1,
    };
  }

  const guideRows = [
    ["PANDUAN PENGISIAN MASTER TEMPLATE KPI BERDASARKAN KAMUS PARAMETER"],
    [""],
    ["Informasi Template:", templateName],
    ["Departemen:", departmentName],
    ["Job Level:", jobLevelName],
    ["Periode:", periodYear],
    ["Target Total Bobot Template:", `${totalWeightPct}%`],
    [""],
    ["KETENTUAN PENGISIAN EXCEL:"],
    [
      "1. Parameter, Satuan, dan Bobot Terkunci",
      "Parameter, Satuan, dan Bobot Parameter otomatis dimuat dari Kamus Parameter dan konfigurasi Job Level. Tidak perlu diubah.",
    ],
    [
      "2. Kolom yang Perlu Diisi / Disesuaikan",
      "Anda hanya perlu mengisi atau menyesuaikan: Indikator, Target, Kriteria Penilaian, dan Skor.",
    ],
    [
      "3. Indikator dan Sub-Indikator",
      "Untuk parameter tunggal, nama Indikator dapat disamakan dengan Parameter. Untuk beberapa sub-indikator, tambahkan baris dengan Bobot Indikator internal total 100%.",
    ],
    [
      "4. Multi-Baris Kriteria Penilaian (Scoring Bands)",
      "Kriteria tingkat skor 25, 15, dan 5 ditulis menurun baris per baris di bawah indikator yang sama.",
    ],
    [""],
    ["CONTOH FORMAT KRITERIA PENILAIAN:"],
    ["- Lebih besar atau sama (>=)", ">= 98% atau >= 100"],
    ["- Rentang nilai (Between)", "95% - 97% atau 90 s/d 94%"],
    ["- Lebih kecil (<)", "< 95% atau < 80"],
    ["- Kualitatif", "Nol Insiden (Zero Accident), Tanpa SP, 1 Inisiatif"],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide["!cols"] = [{ wch: 36 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan & Ketentuan");

  const safeTitle = (
    filename || `Format_KPI_${departmentName}_${jobLevelName}_${periodYear}.xlsx`
  ).replace(/[^a-zA-Z0-9_.-]/g, "_");
  saveWorkbook(wb, safeTitle);
}

// =============================================================================
// 4. SMART EXCEL PARSER (Mendukung Format Master Template & Hidden Mapping)
// =============================================================================
export async function parseKpiTemplateExcel(
  file: File,
  expectedTotalWeightPct: number = 115,
  dbParameters?: DepartmentJobLevelParameter[]
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // 1. Baca Sheet _SYSTEM_MAPPING jika tersedia
  const mappingMap = new Map<
    number,
    {
      templateId?: number | null;
      parameterId?: number | null;
      parameterName?: string;
      indicatorId?: number | null;
      indicatorName?: string;
      criteriaId?: number | null;
      criteriaLabel?: string;
      criteriaScore?: number | null;
    }
  >();

  let hasSystemMapping = false;
  if (wb.SheetNames.includes("_SYSTEM_MAPPING")) {
    try {
      const mapWs = wb.Sheets["_SYSTEM_MAPPING"];
      const mapRawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(mapWs, { defval: "" });
      if (mapRawRows.length > 0) {
        hasSystemMapping = true;
        mapRawRows.forEach((mr, idx) => {
          const rowIdx = Number(mr.row_index) || idx + 1;
          mappingMap.set(rowIdx, {
            templateId: mr.template_id ? Number(mr.template_id) : null,
            parameterId: mr.parameter_id ? Number(mr.parameter_id) : null,
            parameterName: String(mr.parameter_name || ""),
            indicatorId: mr.indicator_id ? Number(mr.indicator_id) : null,
            indicatorName: String(mr.indicator_name || ""),
            criteriaId: mr.criteria_id ? Number(mr.criteria_id) : null,
            criteriaLabel: String(mr.criteria_label || ""),
            criteriaScore:
              mr.criteria_score !== undefined && mr.criteria_score !== ""
                ? Number(mr.criteria_score)
                : null,
          });
        });
      }
    } catch (e) {
      console.warn("Gagal membaca sheet _SYSTEM_MAPPING:", e);
    }
  }

  // 2. Tentukan sheet data utama (bukan _SYSTEM_MAPPING dan bukan Panduan)
  const targetSheetName =
    wb.SheetNames.find((s) => {
      const low = s.toLowerCase();
      return (
        !low.includes("mapping") &&
        !low.includes("panduan") &&
        (low.includes("struktur") || low.includes("kpi") || low.includes("template") || low.includes("data"))
      );
    }) || (wb.SheetNames[0] !== "_SYSTEM_MAPPING" ? wb.SheetNames[0] : wb.SheetNames[1]);

  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      updateCount: 0,
      createCount: 0,
      hasSystemMapping: false,
      errors: ["File Excel tidak memiliki sheet data KPI yang dapat dibaca."],
      warnings: [],
    };
  }

  const ws = wb.Sheets[targetSheetName];
  const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  if (!rows || rows.length === 0) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      updateCount: 0,
      createCount: 0,
      hasSystemMapping: false,
      errors: ["Sheet data KPI kosong atau tidak memiliki baris data."],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const catList: ParsedCategory[] = [];
  let currentCat: ParsedCategory | null = null;
  let currentIndicator: {
    number: string;
    name: string;
    weight: number;
  } | null = null;
  let currentParam: ParsedParam | null = null;

  // Cari baris header tabel (jika ada)
  const headerColIndexMap: Record<string, number> = {};
  let headerRowIndex = -1;

  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const row = rows[r] || [];
    const lowerRow = row.map((cell) => String(cell || "").toLowerCase().trim());
    if (
      lowerRow.some(
        (c) =>
          c.includes("parameter") ||
          c.includes("sub-poin") ||
          c.includes("kategori") ||
          c.includes("indikator") ||
          c.includes("kriteria")
      )
    ) {
      headerRowIndex = r;
      lowerRow.forEach((c, cIdx) => {
        const clean = c.replace(/[^a-z0-9]/g, "");
        headerColIndexMap[clean] = cIdx;
      });
      break;
    }
  }

  const hasIndikatorHeader = Object.keys(headerColIndexMap).some(
    (k) => k.includes("indikator") || k.includes("subpoin")
  );

  const getCol = (row: (string | number | null | undefined)[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      const colIdx = headerColIndexMap[cleanAlias];
      if (colIdx !== undefined && row[colIdx] !== undefined) {
        return String(row[colIdx]).trim();
      }
    }
    return "";
  };

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  let dataRowCounter = 0;

  for (let rIdx = startRow; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    if (row.length === 0 || row.every((c) => c === "" || c === null || c === undefined)) {
      continue;
    }

    dataRowCounter++;
    const mapInfo = mappingMap.get(dataRowCounter);

    const firstCellText = String(row[0] || "").trim();

    // -------------------------------------------------------------------------
    // DETEKSI 1: Section Header Row (e.g. "1. Target Kerja (65% dari 115%)")
    // -------------------------------------------------------------------------
    const sectionMatch = firstCellText.match(
      /^(?:[0-9]+[.)]\s*)?([^(]+)\s*\(([0-9.]+)\s*%\s*(?:dari|of)?\s*[0-9.]*%\)/i
    );

    const isLevel1Header =
      Boolean(sectionMatch) ||
      (/^([0-9]+|[IVXLCDM]+)[.)]\s*([^.]+.*)$/i.test(firstCellText) &&
        !/^[0-9]+\.[0-9]+/i.test(firstCellText) &&
        !getCol(row, "kriteriapenilaian", "kriteria", "kondisi", "skalapenilaian", "labelkriteria"));

    if (isLevel1Header) {
      let catName = "";
      let weightNum = 0;
      if (sectionMatch) {
        catName = sectionMatch[1].trim();
        weightNum = parseFloat(sectionMatch[2]) / 100;
      } else {
        const m = firstCellText.match(/^([0-9]+|[IVXLCDM]+)[.)]\s*(.*)$/i);
        catName = m ? m[2].trim() : firstCellText;
        const wVal = parseFloat(getCol(row, "bobotparameter", "bobotkategori", "bobotk", "bobot"));
        weightNum = !isNaN(wVal) ? (wVal > 1 ? wVal / 100 : wVal) : 0;
      }

      const cleanCatName =
        catName
          .replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "")
          .replace(/^[IVXLCDM]+\.\s*/i, "")
          .replace(/\s*\([0-9.]+%.*\)$/i, "")
          .trim() || catName;

      currentCat = {
        id: mapInfo?.parameterId ?? null,
        action: mapInfo?.parameterId ? "UPDATE" : "CREATE",
        name: cleanCatName,
        weight: weightNum || 0.2,
        categoryType: "SUB_ITEMS",
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
      currentIndicator = null;
      currentParam = null;
      continue;
    }

    // -------------------------------------------------------------------------
    // DETEKSI 2: Tabular Column Parsing
    // -------------------------------------------------------------------------
    let catNameCol = "";
    let catWeightRaw = "";
    let catTypeRaw = "";
    let paramNameCol = "";
    let paramWeightRaw = "";

    if (hasIndikatorHeader) {
      catNameCol = getCol(row, "parameter", "kategori", "category", "namaparameter");
      catWeightRaw = getCol(row, "bobotparameter", "bobotkategori", "bobotkategoripct", "bobotk");
      catTypeRaw = getCol(row, "tipeparameter", "tipekategori", "categorytype", "tipe");

      paramNameCol = getCol(row, "indikator", "subpoin", "namaindikator", "subindikator");
      paramWeightRaw = getCol(row, "bobotindikator", "bobotinternal", "bobot");
    } else {
      catNameCol = getCol(row, "kategori", "category", "namakategori");
      catWeightRaw = getCol(row, "bobotkategori", "bobotkategoripct", "bobotk");
      catTypeRaw = getCol(row, "tipekategori", "categorytype", "tipe");

      paramNameCol = getCol(row, "parameter", "subpoin", "namaparameter", "indikator");
      paramWeightRaw = getCol(row, "bobotparameter", "bobot", "bobotinternal");
    }

    const targetCol = getCol(row, "target", "nilaitarget", "sasaran", "targetkerja");
    const unitCol = getCol(row, "satuan", "unit");
    const paramDescCol = getCol(row, "deskripsi", "description", "keterangan", "deskripsitarget");
    const criteriaCol = getCol(
      row,
      "kriteriapenilaian",
      "kriteria",
      "kondisi",
      "skalapenilaian",
      "labelkriteria"
    );
    const scoreCol = getCol(row, "skor", "score", "poin", "nilaipoin");
    const inputTypeCol = getCol(row, "tipeinput", "inputtype", "tipe");
    const picCol = getCol(row, "rolepenilai", "penilai", "pic", "picinput", "picrole");

    // Jika ada nama parameter (Level 1) baru di baris ini
    if (catNameCol && (!currentCat || currentCat.name !== catNameCol)) {
      let matchedDbParam: DepartmentJobLevelParameter | undefined;
      if (dbParameters && dbParameters.length > 0) {
        if (mapInfo?.parameterId) {
          matchedDbParam = dbParameters.find((p) => p.id === mapInfo.parameterId);
        }
        if (!matchedDbParam) {
          const cleanCat = catNameCol.toLowerCase().replace(/^[0-9]+[.)]\s*/, "").trim();
          matchedDbParam = dbParameters.find((p) => {
            const pName = p.name.toLowerCase().trim();
            return pName === cleanCat || pName === catNameCol.toLowerCase().trim();
          });
        }
      }

      const numWeight = parseFloat(catWeightRaw) || 0;
      const parsedWeight = matchedDbParam
        ? matchedDbParam.weight
        : numWeight > 1
        ? numWeight / 100
        : numWeight;

      const isDirect =
        catTypeRaw.toUpperCase().includes("DIRECT") ||
        catTypeRaw.toUpperCase().includes("LANGSUNG");

      currentCat = {
        id: mapInfo?.parameterId ?? null,
        masterParameterId: matchedDbParam?.id ?? mapInfo?.parameterId ?? null,
        action: mapInfo?.parameterId ? "UPDATE" : "CREATE",
        name: matchedDbParam ? matchedDbParam.name : catNameCol,
        weight: parsedWeight || 0.2,
        categoryType: isDirect ? "DIRECT" : "SUB_ITEMS",
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
      currentParam = null;
    }

    // Jika belum ada parameter aktif, buat parameter default
    if (!currentCat) {
      const fallbackDbParam = dbParameters && dbParameters.length > 0 ? dbParameters[0] : null;
      currentCat = {
        id: mapInfo?.parameterId ?? null,
        masterParameterId: fallbackDbParam?.id ?? mapInfo?.parameterId ?? null,
        action: mapInfo?.parameterId ? "UPDATE" : "CREATE",
        name: fallbackDbParam ? fallbackDbParam.name : "Target Kerja",
        weight: fallbackDbParam ? fallbackDbParam.weight : 0.65,
        categoryType: "SUB_ITEMS",
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
    }

    // Resolusi Tipe Input
    let inputType: ParsedParam["inputType"] = "MONTHLY_ACTUAL";
    const cleanInputType = inputTypeCol.toUpperCase().replace(/[^A-Z_]/g, "");
    if (
      cleanInputType.includes("CURRENCY") ||
      cleanInputType.includes("RUPIAH") ||
      cleanInputType.includes("RP")
    ) {
      inputType = "CURRENCY";
    } else if (cleanInputType.includes("PERCENT") || cleanInputType.includes("PERSEN")) {
      inputType = "PERCENTAGE";
    } else if (
      cleanInputType.includes("QUALITATIVE") ||
      cleanInputType.includes("KUALITATIF") ||
      cleanInputType.includes("TEKS")
    ) {
      inputType = "QUALITATIVE";
    } else if (
      cleanInputType.includes("NUMBER") ||
      cleanInputType.includes("ANGKA") ||
      cleanInputType.includes("JUMLAH")
    ) {
      inputType = "NUMBER";
    } else if (cleanInputType.includes("MONTHLY") || cleanInputType.includes("ACTUAL")) {
      inputType = "MONTHLY_ACTUAL";
    } else if (unitCol === "%") {
      inputType = "MONTHLY_ACTUAL";
    } else if (unitCol.toLowerCase() === "rp") {
      inputType = "CURRENCY";
    }

    // Role penilai
    let picRole: ParsedParam["picRole"] = "HEAD_DEPT";
    const cleanPic = picCol.toUpperCase();
    if (cleanPic.includes("HR")) picRole = "HR";
    else if (cleanPic.includes("HSE")) picRole = "HSE";
    else if (cleanPic.includes("SUPERINTENDENT")) picRole = "SUPERINTENDENT";

    // CEK HIERARKI PENOMORAN: Level 3 (Sub Parameter) vs Level 2 (Indikator)
    const level3Match = firstCellText.match(/^([0-9]+\.[0-9]+\.[0-9]+)\s*(.*)$/);
    const level2Match = firstCellText.match(/^([0-9]+\.[0-9]+)\s*(.*)$/);

    const numPWeight = parseFloat(paramWeightRaw || catWeightRaw) || 0;
    const parsedPWeight = numPWeight > 1 ? numPWeight / 100 : numPWeight;

    if (level3Match) {
      // INI ADALAH SUB PARAMETER (Level 3)
      const subNum = level3Match[1];
      const subName = level3Match[2].trim() || firstCellText;

      if (currentIndicator && parsedPWeight > 0 && currentIndicator.weight === 0) {
        currentIndicator.weight = parsedPWeight;
      }

      const matchedDbParam = dbParameters?.find((p) => {
        const pName = p.name.toLowerCase().trim();
        return pName === subName.toLowerCase().trim() || pName === firstCellText.toLowerCase().trim();
      });

      currentParam = {
        id: mapInfo?.indicatorId ?? null,
        masterParameterId: matchedDbParam?.id ?? currentCat.masterParameterId ?? null,
        action: mapInfo?.indicatorId ? "UPDATE" : "CREATE",
        name: subName,
        description: paramDescCol || matchedDbParam?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedDbParam?.unit || "%",
        weight: parsedPWeight || (currentIndicator && currentIndicator.weight > 0 ? currentIndicator.weight : 0.2),
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
        indicatorName: currentIndicator ? currentIndicator.name : undefined,
        indicatorNumber: currentIndicator ? currentIndicator.number : undefined,
        subParamNumber: subNum,
        indicatorWeight: currentIndicator ? currentIndicator.weight : parsedPWeight,
      };
      currentCat.params.push(currentParam);
    } else if (level2Match) {
      // INI ADALAH INDIKATOR (Level 2)
      const indNum = level2Match[1];
      const indName = level2Match[2].trim() || firstCellText;

      currentIndicator = {
        number: indNum,
        name: indName,
        weight: parsedPWeight,
      };

      if (criteriaCol) {
        const matchedDbParam = dbParameters?.find((p) => p.name.toLowerCase().trim() === indName.toLowerCase().trim());
        currentParam = {
          id: mapInfo?.indicatorId ?? null,
          masterParameterId: matchedDbParam?.id ?? currentCat.masterParameterId ?? null,
          action: mapInfo?.indicatorId ? "UPDATE" : "CREATE",
          name: indName,
          description: paramDescCol || matchedDbParam?.description || "",
          target: targetCol || "100",
          unit: unitCol || matchedDbParam?.unit || "%",
          weight: parsedPWeight || 0.2,
          maxScore: 25,
          inputType,
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          picRole,
          sortOrder: currentCat.params.length,
          bands: [],
          indicatorName: indName,
          indicatorNumber: indNum,
          indicatorWeight: parsedPWeight,
        };
        currentCat.params.push(currentParam);
      } else {
        currentParam = null;
      }
    } else if (firstCellText === "" && currentIndicator && !currentParam && criteriaCol) {
      if (parsedPWeight > 0 && currentIndicator.weight === 0) {
        currentIndicator.weight = parsedPWeight;
      }

      const matchedDbParam = dbParameters?.find((p) => p.name.toLowerCase().trim() === currentIndicator!.name.toLowerCase().trim());
      currentParam = {
        id: mapInfo?.indicatorId ?? null,
        masterParameterId: matchedDbParam?.id ?? currentCat.masterParameterId ?? null,
        action: mapInfo?.indicatorId ? "UPDATE" : "CREATE",
        name: currentIndicator.name,
        description: paramDescCol || matchedDbParam?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedDbParam?.unit || "%",
        weight: currentIndicator.weight || parsedPWeight || 0.2,
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
        indicatorName: currentIndicator.name,
        indicatorNumber: currentIndicator.number,
        indicatorWeight: currentIndicator.weight || parsedPWeight,
      };
      currentCat.params.push(currentParam);
    } else if (paramNameCol) {
      const cleanParamName =
        paramNameCol.replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "").trim() || paramNameCol;
      const matchedDbParam = dbParameters?.find((p) => p.id === currentCat?.masterParameterId);

      currentParam = {
        id: mapInfo?.indicatorId ?? null,
        masterParameterId: currentCat.masterParameterId ?? null,
        action: mapInfo?.indicatorId ? "UPDATE" : "CREATE",
        name: cleanParamName,
        description: paramDescCol || matchedDbParam?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedDbParam?.unit || "%",
        weight: parsedPWeight || 0.25,
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
      };
      currentCat.params.push(currentParam);
    } else if (criteriaCol && (!currentParam || currentCat.params.length === 0)) {
      // Kasus DIRECT Parameter: Baris memiliki kriteria tanpa sub-indikator tersendiri
      const matchedDbParam = dbParameters?.find((p) => p.id === currentCat?.masterParameterId);
      currentCat.categoryType = "DIRECT";
      currentParam = {
        id: mapInfo?.indicatorId ?? null,
        masterParameterId: currentCat.masterParameterId ?? null,
        action: mapInfo?.indicatorId ? "UPDATE" : "CREATE",
        name: currentCat.name,
        description: paramDescCol || matchedDbParam?.description || "Penilaian langsung parameter",
        target: targetCol || "100",
        unit: unitCol || matchedDbParam?.unit || "%",
        weight: 1.0,
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: 0,
        bands: [],
      };
      currentCat.params.push(currentParam);
    }

    // Parsing kriteria & skor (Bands)
    if (criteriaCol && currentParam) {
      const parsedCond = parseConditionString(criteriaCol);
      const scoreNum = parseFloat(scoreCol);
      const finalScore = !isNaN(scoreNum)
        ? scoreNum
        : currentParam.bands.length === 0
        ? 25
        : currentParam.bands.length === 1
        ? 15
        : 5;

      const bandId = mapInfo?.criteriaId ?? null;

      currentParam.bands.push({
        id: bandId,
        action: bandId ? "UPDATE" : "CREATE",
        label: criteriaCol,
        operator: parsedCond.operator,
        operatorSymbol: parsedCond.operatorSymbol,
        criteriaValue: parsedCond.criteriaValue,
        isUnrecognizedOperator: parsedCond.isUnrecognizedOperator,
        minValue: parsedCond.minValue,
        maxValue: parsedCond.maxValue,
        score: finalScore,
        sortOrder: currentParam.bands.length,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // PASCA-PROSES & VALIDASI
  // ---------------------------------------------------------------------------
  // Lengkapi parameter dari database jika belum tercantum di file Excel
  if (dbParameters && dbParameters.length > 0) {
    const existingMasterIds = new Set(
      catList.map((c) => c.masterParameterId).filter(Boolean)
    );
    for (const dp of dbParameters) {
      if (!existingMasterIds.has(dp.id)) {
        const defaultBands =
          dp.defaultBands && dp.defaultBands.length > 0
            ? dp.defaultBands.map((b, bIdx) => {
                const parsedCond = parseConditionString(b.label);
                return {
                  id: null,
                  action: "CREATE" as const,
                  label: b.label,
                  operator: (b.operator || parsedCond.operator) as any,
                  minValue: b.minValue ?? parsedCond.minValue,
                  maxValue: b.maxValue ?? parsedCond.maxValue,
                  score: Number(b.score),
                  sortOrder: bIdx,
                };
              })
            : [
                {
                  id: null,
                  action: "CREATE" as const,
                  label: "Target Tercapai (>= 98%)",
                  operator: "GTE" as const,
                  minValue: 98,
                  maxValue: null,
                  score: 25,
                  sortOrder: 0,
                },
                {
                  id: null,
                  action: "CREATE" as const,
                  label: "Cukup (95% - 97%)",
                  operator: "BETWEEN" as const,
                  minValue: 95,
                  maxValue: 97,
                  score: 15,
                  sortOrder: 1,
                },
                {
                  id: null,
                  action: "CREATE" as const,
                  label: "Kurang (< 95%)",
                  operator: "LT" as const,
                  minValue: null,
                  maxValue: 95,
                  score: 5,
                  sortOrder: 2,
                },
              ];

        catList.push({
          id: null,
          masterParameterId: dp.id,
          action: "CREATE",
          name: dp.name,
          weight: dp.weight,
          categoryType: "DIRECT",
          sortOrder: catList.length,
          params: [
            {
              id: null,
              masterParameterId: dp.id,
              action: "CREATE",
              name: dp.name,
              description: dp.description || "Penilaian langsung parameter",
              target: "100",
              unit: dp.unit || "%",
              weight: 1.0,
              maxScore: 25,
              inputType: (dp.inputType as any) || "MONTHLY_ACTUAL",
              aggregation: "AVERAGE",
              compareBasis: "ACTUAL",
              picRole: "HEAD_DEPT",
              sortOrder: 0,
              bands: defaultBands,
            },
          ],
        });
        warnings.push(
          `Parameter "${dp.name}" tidak ada di file Excel, otomatis ditambahkan dari database dengan bobot ${Math.round(
            dp.weight * 100
          )}%.`
        );
      }
    }
  }

  // Distribusikan bobot indikator secara proporsional ke sub-parameternya
  for (const cat of catList) {
    const indicatorGroups = new Map<string, ParsedParam[]>();
    for (const p of cat.params) {
      const groupKey = p.indicatorNumber || p.indicatorName || p.name;
      if (!indicatorGroups.has(groupKey)) {
        indicatorGroups.set(groupKey, []);
      }
      indicatorGroups.get(groupKey)!.push(p);
    }

    for (const [_, groupParams] of indicatorGroups.entries()) {
      if (groupParams.length > 1) {
        const indW = groupParams[0].indicatorWeight || groupParams.reduce((sum, gp) => sum + gp.weight, 0);
        const subWeight = indW / groupParams.length;
        groupParams.forEach((gp) => {
          gp.weight = parseFloat(subWeight.toFixed(4));
          gp.indicatorWeight = indW;
        });
      }
    }
  }

  let totalWeight = 0;
  let totalParams = 0;
  let totalBands = 0;
  let updateCount = 0;
  let createCount = 0;

  for (const cat of catList) {
    totalWeight += cat.weight;
    totalParams += cat.params.length;

    if (cat.action === "UPDATE") updateCount++;
    else createCount++;

    // Jika parameter tidak punya sub-indikator, buat 1 default direct parameter
    if (cat.params.length === 0) {
      cat.categoryType = "DIRECT";
      cat.params.push({
        name: cat.name,
        description: "Penilaian langsung parameter",
        target: "100",
        unit: "%",
        weight: 1.0,
        maxScore: 25,
        inputType: "MONTHLY_ACTUAL",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole: "HEAD_DEPT",
        sortOrder: 0,
        bands: [
          { label: "Target Tercapai", operator: "GTE", minValue: 98, maxValue: null, score: 25, sortOrder: 0 },
          { label: "Cukup", operator: "BETWEEN", minValue: 95, maxValue: 97, score: 15, sortOrder: 1 },
          { label: "Di Bawah Target", operator: "LT", minValue: null, maxValue: 95, score: 5, sortOrder: 2 },
        ],
      });
      totalParams++;
      totalBands += 3;
      createCount++;
      continue;
    }

    const isTargetKerja = cat.sortOrder === 0 || cat.name.toLowerCase().includes("target kerja");
    if (!isTargetKerja) {
      cat.categoryType = "DIRECT";
      if (cat.params.length > 1) {
        const allBands = cat.params.flatMap((p) => p.bands);
        cat.params[0].bands = allBands;
        cat.params[0].weight = 1.0;
        cat.params = [cat.params[0]];
      } else if (cat.params.length === 1) {
        cat.params[0].weight = 1.0;
      }
    } else {
      cat.categoryType = "SUB_ITEMS";
    }

    let sumInternalWeight = 0;
    for (const p of cat.params) {
      sumInternalWeight += p.weight;
      totalBands += p.bands.length;

      if (p.action === "UPDATE") updateCount++;
      else createCount++;

      for (const b of p.bands) {
        if (b.action === "UPDATE") updateCount++;
        else createCount++;
      }

      if (p.bands.length === 0) {
        p.bands.push(
          { label: "≥ Target", operator: "GTE", operatorSymbol: ">=", criteriaValue: "Target", isUnrecognizedOperator: false, minValue: 98, maxValue: null, score: 25, sortOrder: 0 },
          { label: "Cukup", operator: "BETWEEN", operatorSymbol: "Rentang", criteriaValue: "95 - 97", isUnrecognizedOperator: false, minValue: 95, maxValue: 97, score: 15, sortOrder: 1 },
          { label: "< Standar", operator: "LT", operatorSymbol: "<", criteriaValue: "Standar", isUnrecognizedOperator: false, minValue: null, maxValue: 95, score: 5, sortOrder: 2 }
        );
        totalBands += 3;
      }
    }

    // Validasi bobot internal indikator dalam parameter
    if (cat.categoryType === "SUB_ITEMS" && Math.abs(sumInternalWeight - 1.0) > 0.05) {
      warnings.push(
        `Parameter "${cat.name}": Total bobot internal indikator adalah ${Math.round(
          sumInternalWeight * 100
        )}% (seharusnya 100%).`
      );
    }
  }

  // Validasi total bobot template
  const totalWeightPct = Math.round(totalWeight * 100);
  if (Math.abs(totalWeightPct - expectedTotalWeightPct) > 1) {
    warnings.push(
      `Total bobot seluruh parameter adalah ${totalWeightPct}% (target standar adalah ${expectedTotalWeightPct}%).`
    );
  }

  if (catList.length === 0) {
    errors.push("Tidak ada parameter dan indikator KPI yang berhasil terbaca dari file Excel.");
  }

  return {
    categories: catList,
    totalWeight,
    totalParams,
    totalBands,
    updateCount,
    createCount,
    hasSystemMapping,
    errors,
    warnings,
  };
}

// =============================================================================
// 5. MASTER PARAMETERS EXCEL DOWNLOAD & EXPORT & PARSE
// =============================================================================
export interface MasterParamItem {
  id: number;
  code?: string | null;
  name: string;
  description?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  categoryName?: string | null;
  unit?: string | null;
  inputType?: string | null;
  aggregation?: string | null;
  compareBasis?: string | null;
  picRole?: string | null;
  defaultBands?: Array<{
    score: number;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
  }> | null;
  isActive?: boolean | null;
}

export function downloadMasterParameterTemplate(options: {
  filename?: string;
  templateName?: string;
  departmentName?: string;
  jobLevelName?: string;
  totalWeightPct?: number;
  masterParams: MasterParamItem[];
}) {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Parameter",
    "Bobot Parameter (%)",
    "Indikator",
    "Deskripsi / Target",
    "Satuan",
    "Kriteria Penilaian",
    "Skor",
    "Bobot Indikator (%)",
    "Tipe Input",
  ];

  const rows: (string | number)[][] = [headers];

  // Group master parameters by categoryName (or default)
  const grouped = new Map<string, MasterParamItem[]>();
  for (const mp of options.masterParams) {
    const cat = mp.categoryName?.trim() || (mp.departmentId ? "Target Kerja" : "Kehadiran & Disiplin");
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(mp);
  }

  // Generate pre-populated rows
  for (const [catName, params] of grouped.entries()) {
    for (let pIdx = 0; pIdx < params.length; pIdx++) {
      const p = params[pIdx];
      const bands =
        p.defaultBands && p.defaultBands.length > 0
          ? p.defaultBands
          : [
              { label: "Target Tercapai / Sesuai Standar", score: 25 },
              { label: "Cukup / Sebagian Tercapai", score: 15 },
              { label: "Di Bawah Standar", score: 5 },
            ];

      for (let bIdx = 0; bIdx < bands.length; bIdx++) {
        const b = bands[bIdx];
        rows.push([
          bIdx === 0 ? catName : "",
          "", // Bobot Parameter (kosongkan untuk diisi pengguna)
          bIdx === 0 ? p.name : "",
          bIdx === 0 ? p.description || "" : "",
          bIdx === 0 ? p.unit || "%" : "",
          formatCriteriaExcel(b.label, (b as any).operator || "GTE", (b as any).minValue, (b as any).maxValue, p.unit),
          Number(b.score ?? 25),
          "", // Bobot Indikator (kosongkan untuk diisi pengguna)
          bIdx === 0 ? p.inputType || "MONTHLY_ACTUAL" : "",
        ]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 28 }, // 1. Parameter
    { wch: 22 }, // 2. Bobot Parameter (%)
    { wch: 34 }, // 3. Indikator
    { wch: 42 }, // 4. Deskripsi / Target
    { wch: 14 }, // 5. Satuan
    { wch: 28 }, // 6. Kriteria Penilaian
    { wch: 10 }, // 7. Skor
    { wch: 22 }, // 8. Bobot Indikator (%)
    { wch: 20 }, // 9. Tipe Input
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Struktur KPI");

  // Guide sheet
  const wsGuide = XLSX.utils.aoa_to_sheet(
    createGuideRows({
      name: options.templateName,
      departmentName: options.departmentName,
      jobLevelName: options.jobLevelName,
      totalWeightPct: options.totalWeightPct || 115,
    })
  );
  wsGuide["!cols"] = [{ wch: 32 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan & Ketentuan");

  const fileName =
    options.filename ||
    `Format_Master_Parameter_${(options.templateName || "KPI").replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportMasterParametersToExcel(masterParams: MasterParamItem[], filename?: string) {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Kode",
    "Nama Indikator",
    "Departemen",
    "Parameter Default",
    "Deskripsi",
    "Satuan",
    "Tipe Input",
    "Metode Agregasi",
    "Basis Perbandingan",
    "Penilai (PIC)",
  ];

  const rows: (string | number)[][] = [headers];
  for (const mp of masterParams) {
    rows.push([
      mp.code || "",
      mp.name,
      mp.departmentName || (mp.departmentId ? `Dept ID ${mp.departmentId}` : "General"),
      mp.categoryName || "",
      mp.description || "",
      mp.unit || "%",
      mp.inputType || "PERCENTAGE",
      mp.aggregation || "AVERAGE",
      mp.compareBasis || "ACTUAL",
      mp.picRole || "HEAD_DEPT",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 }, // Kode
    { wch: 36 }, // Nama Indikator
    { wch: 24 }, // Departemen
    { wch: 24 }, // Parameter Default
    { wch: 40 }, // Deskripsi
    { wch: 12 }, // Satuan
    { wch: 16 }, // Tipe Input
    { wch: 18 }, // Metode Agregasi
    { wch: 20 }, // Basis Perbandingan
    { wch: 18 }, // Penilai
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Kamus Parameter");
  XLSX.writeFile(wb, filename || "Kamus_Master_Parameter_KPI.xlsx");
}

export interface ParsedMasterParamImportItem {
  code?: string;
  name: string;
  description?: string;
  departmentId?: number | null;
  rawDepartmentName?: string;
  isUnmapped?: boolean;
  categoryName?: string;
  unit?: string;
  inputType?: string;
  aggregation?: string;
  compareBasis?: string;
  picRole?: string;
}

export async function parseMasterParametersFromExcel(
  file: File,
  departments: Array<{ id: number; name: string; code: string }>
): Promise<{
  items: ParsedMasterParamImportItem[];
  errors: string[];
}> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { items: [], errors: ["File Excel kosong atau tidak terbaca."] };

  const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  if (rows.length <= 1) return { items: [], errors: ["Sheet tidak memiliki baris data."] };

  const items: ParsedMasterParamImportItem[] = [];
  const errors: string[] = [];

  // find header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i] || [];
    if (
      r.some(
        (c) =>
          String(c).toLowerCase().includes("nama") ||
          String(c).toLowerCase().includes("indikator")
      )
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const header = (rows[headerRowIdx] || []).map((c) =>
    String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  const getIdx = (...aliases: string[]) => {
    for (const a of aliases) {
      const clean = a.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = header.indexOf(clean);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const codeIdx = getIdx("kode", "code");
  const nameIdx = getIdx("namaindikator", "nama", "name", "parameter", "indikator");
  const deptIdx = getIdx("departemen", "dept", "department", "namadepartemen");
  const catIdx = getIdx("parameterdefault", "parameter", "kategoridefault", "kategori", "category");
  const descIdx = getIdx("deskripsi", "description", "target");
  const unitIdx = getIdx("satuan", "unit");
  const inputTypeIdx = getIdx("tipeinput", "inputtype");
  const aggIdx = getIdx("metodeagregasi", "aggregation");
  const basisIdx = getIdx("basisperbandingan", "comparebasis");
  const picIdx = getIdx("penilai", "pic", "picrole");

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";
    if (!name) continue;

    const rawDeptStr = deptIdx !== -1 && row[deptIdx] !== undefined ? String(row[deptIdx]).trim() : "";
    const cleanDept = rawDeptStr.toLowerCase().replace(/[^a-z0-9]/g, "");

    let deptId: number | null = null;
    let isUnmapped = false;

    if (rawDeptStr) {
      if (
        cleanDept.includes("umum") ||
        cleanDept.includes("corporate") ||
        cleanDept.includes("corp") ||
        cleanDept.includes("general") ||
        cleanDept.includes("semuadept") ||
        cleanDept.includes("seluruhdept")
      ) {
        deptId = null;
        isUnmapped = false;
      } else {
        // Cocokkan secara dinamis dengan nama/kode master departemen yang ada di DB
        const matched = departments.find((d) => {
          const dCodeClean = (d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const dNameClean = (d.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!dCodeClean && !dNameClean) return false;
          return (
            cleanDept === dCodeClean ||
            cleanDept === dNameClean ||
            (dNameClean.length >= 3 && cleanDept.includes(dNameClean)) ||
            (cleanDept.length >= 3 && dNameClean.includes(cleanDept)) ||
            (dCodeClean.length >= 2 && cleanDept.includes(dCodeClean))
          );
        });

        if (matched) {
          deptId = matched.id;
          isUnmapped = false;
        } else {
          // Departemen diisi di Excel tapi tidak cocok dengan master mana pun di DB
          deptId = null;
          isUnmapped = true;
        }
      }
    }

    const rowCode = codeIdx !== -1 && row[codeIdx] ? String(row[codeIdx]).trim() : undefined;
    // Jika belum terpetakan dan ada kode dengan prefiks, coba bantu infer secara dinamis dari kode
    if (deptId === null && isUnmapped && rowCode) {
      const prefix = rowCode.split("-")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (prefix && prefix !== "corp" && prefix !== "mp" && prefix !== "gen") {
        for (const d of departments) {
          const dCode = (d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const dName = (d.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            (dCode && prefix === dCode) ||
            (dName && (dName === prefix || dName.includes(prefix) || prefix.includes(dName)))
          ) {
            deptId = d.id;
            isUnmapped = false;
            break;
          }
        }
      }
    } else if (!rawDeptStr && rowCode) {
      // Jika kolom departemen tidak diisi di Excel, cek apakah kodenya mengindikasikan departemen tertentu
      const prefix = rowCode.split("-")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (prefix === "corp" || prefix === "gen") {
        deptId = null;
        isUnmapped = false;
      } else if (prefix && prefix !== "mp") {
        for (const d of departments) {
          const dCode = (d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const dName = (d.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            (dCode && prefix === dCode) ||
            (dName && (dName === prefix || dName.includes(prefix) || prefix.includes(dName)))
          ) {
            deptId = d.id;
            isUnmapped = false;
            break;
          }
        }
      }
    }

    items.push({
      code: rowCode,
      name,
      description: descIdx !== -1 && row[descIdx] ? String(row[descIdx]).trim() : undefined,
      departmentId: deptId,
      rawDepartmentName: rawDeptStr || undefined,
      isUnmapped,
      categoryName: catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : undefined,
      unit: unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : "%",
      inputType: inputTypeIdx !== -1 && row[inputTypeIdx] ? String(row[inputTypeIdx]).trim() : "PERCENTAGE",
      aggregation: aggIdx !== -1 && row[aggIdx] ? String(row[aggIdx]).trim() : "AVERAGE",
      compareBasis: basisIdx !== -1 && row[basisIdx] ? String(row[basisIdx]).trim() : "ACTUAL",
      picRole: picIdx !== -1 && row[picIdx] ? String(row[picIdx]).trim() : "HEAD_DEPT",
    });
  }

  return { items, errors };
}

// -----------------------------------------------------------------------------
// 6. WIZARD 3 TAHAP: DOWNLOAD TEMPLATE & VALIDASI KOMPARATIF
// -----------------------------------------------------------------------------
export interface WizardValidationItem {
  component: string;
  label: string;
  status: "PASS" | "FAIL";
  message: string;
  details?: string[];
}

export interface WizardParseResult {
  isValid: boolean;
  validations: WizardValidationItem[];
  categories: ParsedCategory[];
  totalWeight: number;
  totalParams: number;
  totalBands: number;
  employeeHeader?: {
    nik?: string;
    name?: string;
    jobPosition?: string;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Membentuk workbook Excel Master Template untuk Wizard 3 Tahap.
 */
export function buildWizardKpiWorkbook({
  templateName,
  departmentName,
  jobLevelName,
  periodYear,
  employeeInfo,
  categories,
  totalWeightPct = 115,
}: {
  templateName: string;
  departmentName: string;
  jobLevelName: string;
  periodYear: string;
  employeeInfo?: {
    nik: string;
    name: string;
    jobPosition: string;
  } | null;
  categories: WizardCategoryStructure[];
  totalWeightPct?: number;
}): XLSXStyle.WorkBook {
  const wb = XLSXStyle.utils.book_new();

  // 1. Baris 1: Header Employee (HANYA 3 kolom: NIK, Nama Employee, Jabatan)
  // 2. Baris 2: Data Employee (HANYA 3 kolom, tanpa field tambahan lainnya)
  // 3. Baris 3: Pemisah kosong
  // 4. Baris 4: Header Tabel KPI (6 kolom)
  // 5. Baris 5+: Data KPI
  const rows: (string | number | null)[][] = [
    ["NIK", "Nama Employee", "Jabatan"],
    [
      employeeInfo?.nik || "-",
      employeeInfo?.name || "-",
      employeeInfo?.jobPosition || "-",
    ],
    [""], // Baris kosong pemisah
    [
      "No",
      "Parameter",
      "Bobot Parameter (%)",
      "Kriteria Penilaian",
      "Skor",
      "Bobot Indikator (%)",
    ],
  ];

  // Hidden Sheet _SYSTEM_MAPPING
  const mappingHeaders = [
    "row_index",
    "category_name",
    "category_order",
    "category_weight_pct",
    "parameter_id",
    "parameter_code",
    "sub_parameter_name",
    "unit",
    "criteria_label",
    "criteria_score",
    "employee_nik",
    "employee_name",
  ];
  const mappingRows: (string | number | null)[][] = [mappingHeaders];

  let globalRowCounter = 0;

  // Pastikan urutan kategori rapi berdasarkan order (1: Target Kerja, 2-5: General)
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  for (let cIdx = 0; cIdx < sortedCategories.length; cIdx++) {
    const cat = sortedCategories[cIdx];

    if (cat.categoryType === "DIRECT") {
      // 4 Parameter General: Parameter Utama mandiri No. 2, 3, 4, dan 5 tanpa Sub-Parameter
      const pNo = `${cat.order}`;
      const bands =
        cat.defaultBands && cat.defaultBands.length > 0
          ? cat.defaultBands
          : [
              { label: "Target Tercapai (>= 98%)", score: 25 },
              { label: "Cukup (95% - 97%)", score: 15 },
              { label: "Kurang (< 95%)", score: 5 },
            ];

      for (let bIdx = 0; bIdx < bands.length; bIdx++) {
        const b = bands[bIdx];
        globalRowCounter++;

        rows.push([
          bIdx === 0 ? pNo : "",
          bIdx === 0 ? cat.name : "",
          bIdx === 0 ? cat.weightPct : "",
          b.label,
          Number(b.score),
          bIdx === 0 ? 100 : "", // Parameter General tanpa sub-parameter memiliki Bobot Indikator 100%
        ]);

        mappingRows.push([
          globalRowCounter,
          cat.name,
          cat.order,
          cat.weightPct,
          cat.parameterId ?? null,
          cat.parameterCode || "",
          cat.name,
          cat.unit || "%",
          b.label,
          Number(b.score),
          employeeInfo?.nik || "",
          employeeInfo?.name || "",
        ]);
      }
    } else {
      // 1. Target Kerja (SUB_ITEMS): Parameter Utama No. 1
      globalRowCounter++;
      rows.push([
        "1",
        "Target Kerja",
        cat.weightPct,
        "-",
        "-",
        100,
      ]);

      mappingRows.push([
        globalRowCounter,
        "Target Kerja",
        1,
        cat.weightPct,
        null,
        "ROOT-TARGET-KERJA",
        "Target Kerja",
        "%",
        "-",
        null,
        employeeInfo?.nik || "",
        employeeInfo?.name || "",
      ]);

      // 2. Sub-Parameter dari Kamus Parameter Departemen: 1.1, 1.2, dst (nama asli tanpa prefix "Target Kerja -")
      for (let pIdx = 0; pIdx < cat.subParameters.length; pIdx++) {
        const p = cat.subParameters[pIdx];
        const pNo = `1.${pIdx + 1}`;

        const bands =
          p.defaultBands && p.defaultBands.length > 0
            ? p.defaultBands
            : [
                { label: "Target Tercapai (>= 98%)", score: 25 },
                { label: "Cukup (95% - 97%)", score: 15 },
                { label: "Kurang (< 95%)", score: 5 },
              ];

        for (let bIdx = 0; bIdx < bands.length; bIdx++) {
          const b = bands[bIdx];
          globalRowCounter++;

          rows.push([
            bIdx === 0 ? pNo : "",
            bIdx === 0 ? p.name : "", // Nama parameter asli dari Kamus Parameter tanpa prefix "Target Kerja -"
            "", // Bobot Parameter dikosongkan pada baris sub-parameter
            b.label,
            Number(b.score),
            bIdx === 0 ? p.weightPct : "",
          ]);

          mappingRows.push([
            globalRowCounter,
            "Target Kerja",
            1,
            cat.weightPct,
            p.id,
            p.code || "",
            p.name,
            p.unit || "%",
            b.label,
            Number(b.score),
            employeeInfo?.nik || "",
            employeeInfo?.name || "",
          ]);
        }
      }
    }
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(rows);

  // Border konsisten tipis slate
  const borderThin = {
    top: { style: "thin", color: { rgb: "CBD5E1" } },
    bottom: { style: "thin", color: { rgb: "CBD5E1" } },
    left: { style: "thin", color: { rgb: "CBD5E1" } },
    right: { style: "thin", color: { rgb: "CBD5E1" } },
  };

  const fontHeader = { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } };
  const fontData = { name: "Calibri", sz: 10, color: { rgb: "1E293B" } };
  const fontBoldData = { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } };

  const styleHeaderEmp = {
    font: fontHeader,
    fill: { fgColor: { rgb: "E2E8F0" } }, // Slate 200 formal
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };

  const styleDataEmp = {
    font: fontData,
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };

  const styleHeaderKpi = {
    font: fontHeader,
    fill: { fgColor: { rgb: "E2E8F0" } }, // Slate 200 formal
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const styleCellLeft = {
    font: fontData,
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };

  const styleCellCenter = {
    font: fontData,
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };

  const styleCellBoldCenter = {
    font: fontBoldData,
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };

  // Terapkan styling ke seluruh sel tabel
  const range = XLSXStyle.utils.decode_range(ws["!ref"] || "A1:F1");
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      // Baris pemisah (R=2) dan sel di luar 3 kolom employee (R < 2 dan C > 2) dilewati
      if (R === 2 || (R < 2 && C > 2)) {
        continue;
      }

      const addr = XLSXStyle.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) {
        ws[addr] = { t: "s", v: "" };
      }
      const cell = ws[addr];
      if (!cell) continue;

      // 1. Header Employee (Baris 1 / R=0, Kolom A-C)
      if (R === 0 && C <= 2) {
        cell.s = styleHeaderEmp;
      }
      // 2. Data Employee (Baris 2 / R=1, Kolom A-C)
      else if (R === 1 && C <= 2) {
        cell.s = C === 0 ? styleCellCenter : styleDataEmp;
      }
      // 3. Baris Pemisah (Baris 3 / R=2)
      else if (R === 2) {
        // pemisah
      }
      // 4. Header KPI (Baris 4 / R=3, Kolom A-F)
      else if (R === 3) {
        cell.s = styleHeaderKpi;
      }
      // 5. Data KPI (Baris 5+ / R>=4)
      else if (R >= 4) {
        const cellNo = ws[XLSXStyle.utils.encode_cell({ r: R, c: 0 })]?.v;
        const cellParam = ws[XLSXStyle.utils.encode_cell({ r: R, c: 1 })]?.v;
        const isRootTargetKerjaRow =
          cellNo === "1" && String(cellParam || "").toLowerCase().includes("target kerja");

        if (isRootTargetKerjaRow) {
          // Highlight baris Parameter Utama No. 1 Target Kerja (formal subtle slate)
          cell.s = {
            font: fontBoldData,
            fill: { fgColor: { rgb: "F1F5F9" } },
            alignment:
              C === 1
                ? { horizontal: "left", vertical: "center" }
                : { horizontal: "center", vertical: "center" },
            border: borderThin,
          };
        } else if (C === 0 || C === 4) {
          cell.s = styleCellCenter; // No & Skor
        } else if (C === 2 || C === 5) {
          cell.s = styleCellBoldCenter; // Bobot Parameter & Bobot Indikator
        } else {
          cell.s = styleCellLeft; // Parameter & Kriteria Penilaian
        }
      }
    }
  }

  // Lebar kolom rapi
  ws["!cols"] = [
    { wch: 14 }, // A: NIK / No
    { wch: 45 }, // B: Nama Employee / Parameter
    { wch: 25 }, // C: Jabatan / Bobot Parameter (%)
    { wch: 38 }, // D: Kriteria Penilaian
    { wch: 10 }, // E: Skor
    { wch: 22 }, // F: Bobot Indikator (%)
  ];

  // Tinggi baris proporsional
  ws["!rows"] = [
    { hpt: 24 }, // Header Employee
    { hpt: 20 }, // Data Employee
    { hpt: 10 }, // Spacer
    { hpt: 24 }, // Header KPI
  ];

  XLSXStyle.utils.book_append_sheet(wb, ws, "Struktur Master KPI");

  const wsMapping = XLSXStyle.utils.aoa_to_sheet(mappingRows);
  XLSXStyle.utils.book_append_sheet(wb, wsMapping, "_SYSTEM_MAPPING");

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
  const mapSheetIdx = wb.SheetNames.indexOf("_SYSTEM_MAPPING");
  if (mapSheetIdx >= 0) {
    wb.Workbook.Sheets[mapSheetIdx] = {
      Hidden: 1,
    };
  }

  const guideRows = [
    ["PANDUAN PENGISIAN MASTER TEMPLATE KPI - FORMAL"],
    [""],
    ["1. DATA EMPLOYEE (3 KOLOM):"],
    ["- NIK:", employeeInfo?.nik || "-"],
    ["- Nama Employee:", employeeInfo?.name || "-"],
    ["- Jabatan:", employeeInfo?.jobPosition || "-"],
    [""],
    ["2. STRUKTUR KPI (6 KOLOM):"],
    [
      "Format tabel KPI terdiri dari 6 kolom: No, Parameter, Bobot Parameter (%), Kriteria Penilaian, Skor, dan Bobot Indikator (%).",
    ],
    [
      "No. 1 adalah Parameter Utama 'Target Kerja' dengan sub-parameter 1.1, 1.2, dst mengambil nama asli dari Kamus Parameter Departemen.",
    ],
    [
      "No. 2, 3, 4, dan 5 adalah Parameter Utama mandiri General (Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement) tanpa sub-parameter (Bobot Indikator 100%).",
    ],
    [
      "Total Bobot Parameter keseluruhan adalah 115%.",
    ],
  ];
  const wsGuide = XLSXStyle.utils.aoa_to_sheet(guideRows);
  wsGuide["!cols"] = [{ wch: 36 }, { wch: 80 }];
  XLSXStyle.utils.book_append_sheet(wb, wsGuide, "Panduan & Ketentuan");

  return wb;
}

/**
 * Universal browser-safe workbook download helper with xlsx-js-style styling support
 */
export function saveStyledWorkbook(wb: any, filename: string) {
  try {
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
  } catch (err) {
    console.warn("Direct blob download failed, falling back to XLSXStyle.writeFile:", err);
    XLSXStyle.writeFile(wb, filename);
  }
}

/**
 * Download Excel Master Template Formal.
 * Memuat header data Employee (3 kolom: NIK, Nama Employee, Jabatan) dan 6 Kolom KPI
 * dengan nama kolom bold, header rapi, border tabel konsisten, dan tanpa field tambahan.
 */
export function downloadWizardKpiTemplate(options: {
  templateName: string;
  departmentName: string;
  jobLevelName: string;
  periodYear: string;
  employeeInfo?: {
    nik: string;
    name: string;
    jobPosition: string;
  } | null;
  categories: WizardCategoryStructure[];
  totalWeightPct?: number;
  filename?: string;
}) {
  const wb = buildWizardKpiWorkbook(options);
  const safeTitle = (
    options.filename || `Master_KPI_${options.departmentName}_${options.jobLevelName}_${options.periodYear}.xlsx`
  ).replace(/[^a-zA-Z0-9_.-]/g, "_");
  saveStyledWorkbook(wb, safeTitle);
}

/**
 * Download Batch Master Template KPI untuk banyak employee sekaligus (Many-to-Many).
 * Satu konfigurasi Departemen + Job Level + Periode + Jabatan diterapkan ke banyak employee
 * dan menghasilkan template masing-masing berdasarkan NIK.
 * - Jika 1 employee (atau tanpa employee): diunduh langsung sebagai file .xlsx.
 * - Jika > 1 employee: dipaketkan ke dalam .zip dengan file masing-masing per NIK & Nama.
 */
export async function downloadBatchWizardKpiTemplates(options: {
  templateName: string;
  departmentName: string;
  jobLevelName: string;
  periodYear: string;
  employees: Array<{
    nik: string;
    name: string;
    jobPosition: string;
  }>;
  categories: WizardCategoryStructure[];
  totalWeightPct?: number;
}) {
  const { employees, departmentName, jobLevelName, periodYear, categories, totalWeightPct } = options;

  // 1. Jika 0 atau 1 employee, unduh langsung file .xlsx tunggal
  if (!employees || employees.length <= 1) {
    const singleEmp = employees && employees.length === 1 ? employees[0] : null;
    const filename = singleEmp
      ? `Template_KPI_${singleEmp.nik}_${singleEmp.name}_${periodYear}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, "_")
      : `Master_KPI_${departmentName}_${jobLevelName}_${periodYear}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, "_");

    downloadWizardKpiTemplate({
      templateName: options.templateName,
      departmentName,
      jobLevelName,
      periodYear,
      employeeInfo: singleEmp,
      categories,
      totalWeightPct,
      filename,
    });
    return;
  }

  // 2. Jika banyak employee, paketkan ke ZIP dengan file individual per NIK
  const zip = new JSZip();

  for (const emp of employees) {
    const safeEmpName = (emp.name || "Employee").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeNik = (emp.nik || "NIK").trim().replace(/[^a-zA-Z0-9_-]/g, "_");

    const wb = buildWizardKpiWorkbook({
      templateName: `Template KPI ${departmentName} - ${jobLevelName} - ${emp.name} - ${periodYear}`,
      departmentName,
      jobLevelName,
      periodYear,
      employeeInfo: emp,
      categories,
      totalWeightPct,
    });

    const wbout = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" });
    const fileInZip = `Template_KPI_${safeNik}_${safeEmpName}.xlsx`;
    zip.file(fileInZip, wbout);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const zipFilename = `Batch_Template_KPI_${departmentName}_${jobLevelName}_${periodYear}_(${employees.length}_Employee).zip`.replace(
    /[^a-zA-Z0-9_.-]/g,
    "_"
  );

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

/**
 * Validasi komparatif file Excel hasil pengisian terhadap konfigurasi Wizard 3 Tahap.
 * Menghasilkan checklist validasi untuk:
 * - Identitas Employee
 * - 5 Parameter Utama
 * - Kode Parameter
 * - Sub-Parameter
 * - Satuan
 * - Bobot
 * - Kelengkapan data (Target, Kriteria, Skor)
 */
export async function validateAndParseWizardExcel(
  file: File | ArrayBuffer,
  config: WizardTemplateStructureResult,
  expectedTotalWeightPct: number = 115
): Promise<WizardParseResult> {
  const buffer = file instanceof ArrayBuffer ? file : await (file as any).arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const mappingMap = new Map<
    number,
    {
      categoryName?: string;
      parameterId?: number | null;
      parameterCode?: string;
      subParameterName?: string;
      unit?: string;
      criteriaLabel?: string;
      criteriaScore?: number | null;
      employeeNik?: string;
      employeeName?: string;
    }
  >();

  if (wb.SheetNames.includes("_SYSTEM_MAPPING")) {
    try {
      const mapWs = wb.Sheets["_SYSTEM_MAPPING"];
      const mapRawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(mapWs, { defval: "" });
      mapRawRows.forEach((mr, idx) => {
        const rowIdx = Number(mr.row_index) || idx + 1;
        mappingMap.set(rowIdx, {
          categoryName: String(mr.category_name || ""),
          parameterId: mr.parameter_id ? Number(mr.parameter_id) : null,
          parameterCode: String(mr.parameter_code || ""),
          subParameterName: String(mr.sub_parameter_name || ""),
          unit: String(mr.unit || ""),
          criteriaLabel: String(mr.criteria_label || ""),
          criteriaScore:
            mr.criteria_score !== undefined && mr.criteria_score !== ""
              ? Number(mr.criteria_score)
              : null,
          employeeNik: String(mr.employee_nik || ""),
          employeeName: String(mr.employee_name || ""),
        });
      });
    } catch (e) {
      console.warn("Gagal membaca sheet _SYSTEM_MAPPING:", e);
    }
  }

  const targetSheetName =
    wb.SheetNames.find((s) => {
      const low = s.toLowerCase();
      return (
        !low.includes("mapping") &&
        !low.includes("panduan") &&
        (low.includes("struktur") || low.includes("kpi") || low.includes("template") || low.includes("data"))
      );
    }) || (wb.SheetNames[0] !== "_SYSTEM_MAPPING" ? wb.SheetNames[0] : wb.SheetNames[1]);

  const ws = targetSheetName ? wb.Sheets[targetSheetName] : null;
  if (!ws) {
    return {
      isValid: false,
      validations: [
        {
          component: "File",
          label: "Format File Excel",
          status: "FAIL",
          message: "Sheet data KPI tidak ditemukan pada file Excel.",
        },
      ],
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      errors: ["File Excel tidak memiliki sheet data KPI."],
      warnings: [],
    };
  }

  const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  const employeeHeader: { nik?: string; name?: string; jobPosition?: string } = {};
  for (let r = 0; r < Math.min(rawRows.length, 6); r++) {
    const row = rawRows[r] || [];
    const lowerRow = row.map((cell) => String(cell || "").toLowerCase().trim());

    // 1. Format 3 Kolom Formal: NIK, Nama Employee, Jabatan
    const nikIdx = lowerRow.indexOf("nik");
    const nameIdx = lowerRow.findIndex(
      (c) => c === "nama employee" || c === "nama karyawan" || c === "nama"
    );
    const posIdx = lowerRow.findIndex((c) => c === "jabatan" || c === "position");

    if (nikIdx !== -1 && (nameIdx !== -1 || posIdx !== -1) && rawRows[r + 1]) {
      const nextRow = rawRows[r + 1] || [];
      if (nikIdx !== -1 && nextRow[nikIdx] !== undefined)
        employeeHeader.nik = String(nextRow[nikIdx] || "").trim();
      if (nameIdx !== -1 && nextRow[nameIdx] !== undefined)
        employeeHeader.name = String(nextRow[nameIdx] || "").trim();
      if (posIdx !== -1 && nextRow[posIdx] !== undefined)
        employeeHeader.jobPosition = String(nextRow[posIdx] || "").trim();
      break;
    }

    // 2. Format Key-Value ("NIK: [value]")
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").toLowerCase().trim();
      if (cellText.includes("nama employee:") || cellText.includes("nama karyawan:")) {
        employeeHeader.name = String(row[c + 1] || "").trim();
      } else if (cellText.includes("nik:")) {
        employeeHeader.nik = String(row[c + 1] || "").trim();
      } else if (cellText.includes("jabatan:")) {
        employeeHeader.jobPosition = String(row[c + 1] || "").trim();
      }
    }
  }

  let headerRowIndex = -1;
  const headerColIndexMap: Record<string, number> = {};
  for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
    const row = rawRows[r] || [];
    const lowerRow = row.map((cell) => String(cell || "").toLowerCase().trim());
    if (
      lowerRow.some(
        (c) =>
          c.includes("parameter") ||
          c.includes("sub-parameter") ||
          c.includes("kriteria") ||
          c.includes("indikator")
      )
    ) {
      headerRowIndex = r;
      lowerRow.forEach((c, cIdx) => {
        const clean = c.replace(/[^a-z0-9]/g, "");
        headerColIndexMap[clean] = cIdx;
      });
      break;
    }
  }

  const getCol = (row: (string | number | null | undefined)[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      const colIdx = headerColIndexMap[cleanAlias];
      if (colIdx !== undefined && row[colIdx] !== undefined) {
        return String(row[colIdx]).trim();
      }
    }
    return "";
  };

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  const catList: ParsedCategory[] = [];
  let currentCat: ParsedCategory | null = null;
  let currentParam: ParsedParam | null = null;
  let rowDataCounter = 0;

  const foundCategoryNames = new Set<string>();
  const foundParameterCodes = new Set<string>();
  const missingTargets: string[] = [];
  const missingCriteria: string[] = [];

  for (let rIdx = startRow; rIdx < rawRows.length; rIdx++) {
    const row = rawRows[rIdx] || [];
    if (row.length === 0 || row.every((c) => c === "" || c === null || c === undefined)) {
      continue;
    }

    rowDataCounter++;
    const mapInfo = mappingMap.get(rowDataCounter);

    const noCol = getCol(row, "no", "nomor");
    const catNameCol = getCol(row, "parameterutama", "parameter", "kategori", "namaparameter");
    const catWeightRaw = getCol(row, "bobotparameter", "bobotkategori", "bobotk");
    const paramCodeCol = getCol(row, "kodeparameter", "kode", "kodesubparameter");
    const paramNameCol = getCol(row, "subparameter", "indikator", "namaindikator", "subpoin");
    const unitCol = getCol(row, "satuan", "unit");
    const targetCol = getCol(row, "target", "targettahunan", "sasaran", "nilaitarget");
    const criteriaCol = getCol(row, "kriteriapenilaian", "kriteria", "kondisi", "skalapenilaian");
    const scoreCol = getCol(row, "skor", "score", "poin");
    const paramWeightRaw = getCol(row, "bobotsubparameter", "bobotindikator", "bobot");
    const descCol = getCol(row, "deskripsi", "description", "keterangan");

    // Pada format formal 6-kolom:
    // 1. Parameter Utama No. 1: Target Kerja (Baris Header Root)
    // 2. Sub-Parameter 1.1, 1.2, dst: Nama asli dari Kamus Parameter Departemen
    // 3. Parameter Utama No. 2, 3, 4, 5: Parameter General mandiri tanpa sub-parameter
    let cleanCatName = (catNameCol || "").trim();
    let cleanSubName = (paramNameCol || "").trim();

    const isRootTargetKerja =
      (noCol === "1" && cleanCatName.toLowerCase().includes("target kerja")) ||
      mapInfo?.parameterCode === "ROOT-TARGET-KERJA";

    const isSubTargetKerja =
      noCol.startsWith("1.") ||
      (currentCat !== null &&
        currentCat.name.toLowerCase().includes("target kerja") &&
        !["2", "3", "4", "5"].includes(noCol) &&
        !cleanCatName.toLowerCase().includes("kehadiran") &&
        !cleanCatName.toLowerCase().includes("keselamatan") &&
        !cleanCatName.toLowerCase().includes("kepatuhan") &&
        !cleanCatName.toLowerCase().includes("inovasi"));

    if (mapInfo?.categoryName) {
      cleanCatName = mapInfo.categoryName;
      if (mapInfo.parameterCode !== "ROOT-TARGET-KERJA") {
        cleanSubName = mapInfo.subParameterName || "";
      }
    } else if (isRootTargetKerja) {
      cleanCatName = "Target Kerja";
      cleanSubName = "";
    } else if (isSubTargetKerja) {
      cleanCatName = "Target Kerja";
      if (cleanCatName.toLowerCase().startsWith("target kerja - ")) {
        cleanSubName = cleanCatName.substring(15).trim();
      } else if (catNameCol) {
        cleanSubName = catNameCol.trim();
      }
    } else if (cleanCatName.toLowerCase().startsWith("target kerja - ")) {
      cleanSubName = cleanCatName.substring(15).trim();
      cleanCatName = "Target Kerja";
    }

    if (isRootTargetKerja) {
      foundCategoryNames.add("target kerja");
      const configCat = config.categories.find(
        (c) => c.name.toLowerCase().trim().includes("target kerja")
      );
      const parsedWeight =
        configCat?.weight !== undefined
          ? configCat.weight
          : configCat?.weightPct !== undefined
          ? configCat.weightPct / 100
          : parseFloat(catWeightRaw) > 1
          ? parseFloat(catWeightRaw) / 100
          : parseFloat(catWeightRaw) || 0.65;

      if (!currentCat || !currentCat.name.toLowerCase().includes("target kerja")) {
        currentCat = {
          id: null,
          masterParameterId: null,
          action: "CREATE",
          name: "Target Kerja",
          weight: parsedWeight,
          categoryType: "SUB_ITEMS",
          sortOrder: catList.length,
          params: [],
        };
        catList.push(currentCat);
      }
      currentParam = null;
      continue; // Baris root Parameter Utama No. 1 Target Kerja tidak memuat kriteria/skor
    }

    if (mapInfo?.subParameterName) {
      cleanSubName = mapInfo.subParameterName;
    }

    if (cleanCatName && (!currentCat || currentCat.name.toLowerCase() !== cleanCatName.toLowerCase())) {
      foundCategoryNames.add(cleanCatName.toLowerCase());

      const configCat = config.categories.find(
        (c) => c.name.toLowerCase().trim() === cleanCatName.toLowerCase()
      );

      const parsedWeight =
        configCat?.weight !== undefined
          ? configCat.weight
          : configCat?.weightPct !== undefined
          ? configCat.weightPct / 100
          : parseFloat(catWeightRaw) > 1
          ? parseFloat(catWeightRaw) / 100
          : parseFloat(catWeightRaw) || 0.2;

      currentCat = {
        id: null,
        masterParameterId: null,
        action: "CREATE",
        name: cleanCatName,
        weight: parsedWeight,
        categoryType: configCat
          ? configCat.categoryType
          : cleanCatName.toLowerCase().includes("target kerja")
          ? "SUB_ITEMS"
          : "DIRECT",
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
      currentParam = null;
    }

    if (!currentCat) {
      const defaultCat = config.categories[0] || {
        name: "Target Kerja",
        weight: 0.65,
        categoryType: "SUB_ITEMS",
      };
      currentCat = {
        id: null,
        masterParameterId: null,
        action: "CREATE",
        name: defaultCat.name,
        weight: defaultCat.weight,
        categoryType: defaultCat.categoryType,
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
      foundCategoryNames.add(defaultCat.name.toLowerCase());
    }

    const effectiveCode = paramCodeCol || mapInfo?.parameterCode || "";
    if (effectiveCode) {
      foundParameterCodes.add(effectiveCode.toUpperCase().trim());
    }

    // 1. Kategori DIRECT (4 Parameter General): Langsung menjadi 1 parameter pengukuran tanpa sub-parameter
    if (currentCat.categoryType === "DIRECT" && currentCat.params.length === 0) {
      const configCat = config.categories.find(
        (c) => c.name.toLowerCase().trim() === currentCat!.name.toLowerCase()
      );
      const directCode = effectiveCode || configCat?.parameterCode || "";
      if (directCode) foundParameterCodes.add(directCode.toUpperCase().trim());

      const finalTarget = targetCol || configCat?.target || "100";
      if (!finalTarget) {
        missingTargets.push(currentCat.name);
      }

      currentParam = {
        id: mapInfo?.parameterId ?? configCat?.parameterId ?? null,
        masterParameterId: configCat?.parameterId ?? mapInfo?.parameterId ?? null,
        action: "CREATE",
        name: currentCat.name,
        description: descCol || configCat?.description || "",
        target: finalTarget,
        unit: unitCol || mapInfo?.unit || configCat?.unit || "%",
        weight: 1.0,
        maxScore: 25,
        inputType: (configCat?.inputType as any) || "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole: "HEAD_DEPT",
        sortOrder: 0,
        bands: [],
      };
      currentCat.params.push(currentParam);
    }

    // 2. Kategori SUB_ITEMS (Target Kerja): Memiliki sub-parameter dari Kamus Departemen
    if (currentCat.categoryType === "SUB_ITEMS" && cleanSubName) {
      const cleanParamName =
        cleanSubName.replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "").trim() || cleanSubName;

      let existingParam = currentCat.params.find(
        (p) => p.name.toLowerCase() === cleanParamName.toLowerCase()
      );

      if (existingParam) {
        currentParam = existingParam;
      } else {
        let matchedConfigSub = config.categories
          .flatMap((c) => c.subParameters)
          .find(
            (sp) =>
              (effectiveCode && sp.code && sp.code.toUpperCase() === effectiveCode.toUpperCase()) ||
              sp.name.toLowerCase() === cleanParamName.toLowerCase()
          );

        if (!matchedConfigSub && mapInfo?.parameterId) {
          matchedConfigSub = config.categories
            .flatMap((c) => c.subParameters)
            .find((sp) => sp.id === mapInfo.parameterId);
        }

        if (matchedConfigSub?.code) {
          foundParameterCodes.add(matchedConfigSub.code.toUpperCase().trim());
        }

        const effectiveUnit = unitCol || mapInfo?.unit || matchedConfigSub?.unit || "%";
        const effectiveTarget = targetCol || matchedConfigSub?.target || "100";

        currentParam = {
          id: mapInfo?.parameterId ?? matchedConfigSub?.id ?? null,
          masterParameterId: matchedConfigSub?.id ?? mapInfo?.parameterId ?? null,
          action: "CREATE",
          name: cleanParamName,
          description: descCol || matchedConfigSub?.description || "",
          target: effectiveTarget,
          unit: effectiveUnit,
          weight:
            matchedConfigSub?.weight !== undefined
              ? matchedConfigSub.weight
              : matchedConfigSub?.weightPct !== undefined
              ? matchedConfigSub.weightPct / 100
              : parseFloat(paramWeightRaw) > 1
              ? parseFloat(paramWeightRaw) / 100
              : parseFloat(paramWeightRaw) || 0.25,
          maxScore: 25,
          inputType: (matchedConfigSub?.inputType as any) || "PERCENTAGE",
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          picRole: "HEAD_DEPT",
          sortOrder: currentCat.params.length,
          bands: [],
        };
        currentCat.params.push(currentParam);
      }
    }

    if (criteriaCol && currentParam) {
      const parsedCond = parseConditionString(criteriaCol);
      const scoreNum = parseFloat(scoreCol);
      const finalScore = !isNaN(scoreNum) ? scoreNum : 25;

      currentParam.bands.push({
        id: null,
        action: "CREATE",
        label: criteriaCol,
        operator: parsedCond.operator,
        operatorSymbol: parsedCond.operatorSymbol,
        criteriaValue: parsedCond.criteriaValue,
        isUnrecognizedOperator: parsedCond.isUnrecognizedOperator,
        minValue: parsedCond.minValue,
        maxValue: parsedCond.maxValue,
        score: finalScore,
        sortOrder: currentParam.bands.length,
      });
    } else if (currentParam && currentParam.bands.length === 0 && !criteriaCol) {
      missingCriteria.push(currentParam.name);
    }
  }

  // ---------------------------------------------------------------------------
  // KOMPARASI & VALIDASI CHECKLIST
  // ---------------------------------------------------------------------------
  const validations: WizardValidationItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validasi 1: Identitas Employee
  let empPass = true;
  let empMsg = "Identitas Karyawan dan Jabatan sesuai konfigurasi.";
  const empDetails: string[] = [];

  if (config.employeeInfo) {
    if (employeeHeader.nik && employeeHeader.nik !== config.employeeInfo.nik) {
      empPass = false;
      empDetails.push(
        `NIK di Excel (${employeeHeader.nik}) tidak cocok dengan konfigurasi (${config.employeeInfo.nik}).`
      );
    }
    if (
      employeeHeader.name &&
      !employeeHeader.name.toLowerCase().includes(config.employeeInfo.name.toLowerCase())
    ) {
      empPass = false;
      empDetails.push(
        `Nama di Excel (${employeeHeader.name}) tidak cocok dengan konfigurasi (${config.employeeInfo.name}).`
      );
    }
    if (!empPass) {
      empMsg = "Identitas Karyawan pada file Excel tidak sesuai dengan konfigurasi template.";
    }
  } else {
    empMsg = "Template umum (berlaku untuk seluruh karyawan pada Departemen & Job Level terkait).";
  }

  validations.push({
    component: "Identitas Employee",
    label: "Identitas Karyawan & Jabatan",
    status: empPass ? "PASS" : "FAIL",
    message: empMsg,
    details: empDetails.length > 0 ? empDetails : undefined,
  });

  // Validasi 2: Kelengkapan 5 Parameter Utama
  const requiredFive = [
    "Target Kerja",
    "Kehadiran & Disiplin",
    "Keselamatan Kerja",
    "Kepatuhan & SP",
    "Inovasi & Improvement",
  ];
  const missingCategories = requiredFive.filter(
    (req) => !Array.from(foundCategoryNames).some((fc) => fc.includes(req.toLowerCase()))
  );

  validations.push({
    component: "5 Parameter Utama",
    label: "Kelengkapan 5 Parameter Utama",
    status: missingCategories.length === 0 ? "PASS" : "FAIL",
    message:
      missingCategories.length === 0
        ? "Seluruh 5 Parameter Utama terdeteksi lengkap (5/5)."
        : `Terdapat ${missingCategories.length} Parameter Utama yang hilang: ${missingCategories.join(", ")}.`,
    details:
      missingCategories.length > 0
        ? missingCategories.map((m) => `Parameter '${m}' tidak ditemukan di Excel.`)
        : undefined,
  });

  // Validasi 3: Kode Parameter (baik Target Kerja maupun 4 Parameter General)
  const missingCodes: string[] = [];
  for (const c of config.categories) {
    if (c.categoryType === "DIRECT" && c.parameterCode) {
      if (!foundParameterCodes.has(c.parameterCode.toUpperCase())) {
        missingCodes.push(`${c.parameterCode} (${c.name})`);
      }
    } else {
      for (const sp of c.subParameters) {
        if (sp.code && !foundParameterCodes.has(sp.code.toUpperCase())) {
          missingCodes.push(`${sp.code} (${sp.name})`);
        }
      }
    }
  }

  validations.push({
    component: "Kode Parameter",
    label: "Kesesuaian Kode Parameter",
    status: missingCodes.length === 0 ? "PASS" : "FAIL",
    message:
      missingCodes.length === 0
        ? "Seluruh kode parameter cocok dengan Kamus Parameter database."
        : `Terdapat ${missingCodes.length} kode parameter yang tidak sesuai atau hilang.`,
    details:
      missingCodes.length > 0
        ? missingCodes.map((c) => `Kode '${c}' belum tercantum di Excel.`)
        : undefined,
  });

  // Validasi 4: Sub-Parameter Target Kerja
  const targetKerjaCat = catList.find(
    (c) => c.name.toLowerCase().includes("target kerja") || c.categoryType === "SUB_ITEMS"
  );
  const targetKerjaSubCount = targetKerjaCat ? targetKerjaCat.params.length : 0;
  const directParamCount = catList.filter((c) => c.categoryType === "DIRECT").length;
  const subPass = targetKerjaSubCount > 0;
  validations.push({
    component: "Sub-Parameter",
    label: "Daftar Sub-Parameter Target Kerja",
    status: subPass ? "PASS" : "FAIL",
    message: subPass
      ? `${targetKerjaSubCount} sub-parameter Target Kerja dan ${directParamCount} Parameter Utama General berhasil dipetakan.`
      : "Sub-parameter Target Kerja tidak ditemukan dalam file Excel.",
  });

  // Validasi 5: Satuan
  const invalidUnits: string[] = [];
  for (const c of catList) {
    for (const p of c.params) {
      if (!p.unit || p.unit.trim() === "") {
        invalidUnits.push(p.name);
      }
    }
  }

  validations.push({
    component: "Satuan",
    label: "Satuan / Unit Pengukuran",
    status: invalidUnits.length === 0 ? "PASS" : "FAIL",
    message:
      invalidUnits.length === 0
        ? "Seluruh sub-parameter memiliki satuan pengukuran yang valid."
        : `Terdapat ${invalidUnits.length} sub-parameter tanpa satuan pengukuran.`,
    details:
      invalidUnits.length > 0
        ? invalidUnits.map((u) => `Sub-parameter '${u}' belum memiliki satuan.`)
        : undefined,
  });

  // Validasi 6: Bobot
  const totalWeight = catList.reduce((sum, c) => sum + c.weight, 0);
  const totalWeightPct = Math.round(totalWeight * 100);
  const weightPass = Math.abs(totalWeightPct - expectedTotalWeightPct) <= 1;

  validations.push({
    component: "Bobot",
    label: "Kesesuaian Total Bobot",
    status: weightPass ? "PASS" : "FAIL",
    message: weightPass
      ? `Total bobot parameter tepat ${totalWeightPct}% (sesuai target ${expectedTotalWeightPct}%).`
      : `Total bobot adalah ${totalWeightPct}% (seharusnya tepat ${expectedTotalWeightPct}%).`,
  });

  // Validasi 7: Kelengkapan Data Nilai (Target, Kriteria, Skor)
  const dataCompletePass = missingTargets.length === 0 && missingCriteria.length === 0;
  const completeDetails: string[] = [];
  if (missingTargets.length > 0) {
    completeDetails.push(
      `${missingTargets.length} sub-parameter belum mengisi Target: ${missingTargets
        .slice(0, 3)
        .join(", ")}${missingTargets.length > 3 ? "..." : ""}`
    );
  }
  if (missingCriteria.length > 0) {
    completeDetails.push(
      `${missingCriteria.length} sub-parameter belum memiliki Kriteria Penilaian: ${missingCriteria
        .slice(0, 3)
        .join(", ")}`
    );
  }

  validations.push({
    component: "Kelengkapan Data",
    label: "Kelengkapan Target, Kriteria & Skor",
    status: dataCompletePass ? "PASS" : "FAIL",
    message: dataCompletePass
      ? "Target, Kriteria Penilaian, dan Skor terisi lengkap."
      : "Beberapa Target atau Kriteria Penilaian masih kosong di Excel.",
    details: completeDetails.length > 0 ? completeDetails : undefined,
  });

  const isValid = validations.every((v) => v.status === "PASS");
  const totalParamsCount = catList.reduce((acc, c) => acc + c.params.length, 0);
  const totalBands = catList.reduce(
    (acc, c) => acc + c.params.reduce((pAcc, p) => pAcc + p.bands.length, 0),
    0
  );

  return {
    isValid,
    validations,
    categories: catList,
    totalWeight,
    totalParams: totalParamsCount,
    totalBands,
    employeeHeader,
    errors,
    warnings,
  };
}

export interface ExtractedHeaderEmployeeInfo {
  name?: string;
  nik?: string;
  jobPosition?: string;
  department?: string;
  periodYear?: string;
}

export function extractExcelHeaderMetadata(
  rows: (string | number | null | undefined)[][]
): ExtractedHeaderEmployeeInfo {
  const info: ExtractedHeaderEmployeeInfo = {};
  const topRows = rows.slice(0, 16);

  const cleanVal = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/^[\s:=-]+/, "")
      .replace(/[\s:=-]+$/, "")
      .trim();
  };

  const isNameHeader = (s: string) =>
    /^(nama|nama\s*karyawan|nama\s*employee|employee\s*name|nama\s*lengkap|employee|name)$/i.test(s) ||
    /^(nama\s*(karyawan|pegawai|employee))/i.test(s);
  const isNikHeader = (s: string) =>
    /^(nik|no\.?\s*karyawan|nomor\s*induk|employee\s*id|nrp|id\s*karyawan|nip|no\s*karyawan)$/i.test(s);
  const isPosHeader = (s: string) =>
    /^(job\s*position|posisi|jabatan|position|nama\s*jabatan|posisi\s*jabatan|role|job\s*title)$/i.test(s) ||
    /^(job\s*position|jabatan|posisi)/i.test(s);
  const isDeptHeader = (s: string) =>
    /^(departemen|departmen|departement|department|dept|divisi|division|unit\s*kerja|bagian|unit)$/i.test(s) ||
    /^(depart[em]+n|department|divisi)/i.test(s);
  const isPeriodHeader = (s: string) =>
    /^(periode|period|tahun|year|tahun\s*penilaian|tahun\s*kpi)$/i.test(s);

  // 1. Pola Tabel Horisontal (Header Kolom di baris r, Data di baris r+1)
  for (let r = 0; r < Math.min(topRows.length - 1, 10); r++) {
    const row = topRows[r] || [];
    const lowerRow = row.map((cell) => cleanVal(cell).toLowerCase());

    const nameIdx = lowerRow.findIndex(isNameHeader);
    const nikIdx = lowerRow.findIndex(isNikHeader);
    const posIdx = lowerRow.findIndex(isPosHeader);
    const deptIdx = lowerRow.findIndex(isDeptHeader);
    const periodIdx = lowerRow.findIndex(isPeriodHeader);

    const matchesCount = [nameIdx, nikIdx, posIdx, deptIdx].filter((idx) => idx !== -1).length;
    if (matchesCount >= 2) {
      const nextRow = topRows[r + 1] || [];
      if (nameIdx !== -1 && !info.name) info.name = cleanVal(nextRow[nameIdx]);
      if (nikIdx !== -1 && !info.nik) info.nik = cleanVal(nextRow[nikIdx]);
      if (posIdx !== -1 && !info.jobPosition) info.jobPosition = cleanVal(nextRow[posIdx]);
      if (deptIdx !== -1 && !info.department) info.department = cleanVal(nextRow[deptIdx]);
      if (periodIdx !== -1 && !info.periodYear) info.periodYear = cleanVal(nextRow[periodIdx]);
      break;
    }
  }

  // 2. Pola Vertikal / Key-Value (Label dan Nilai dalam satu sel atau kolom berdampingan)
  for (let r = 0; r < topRows.length; r++) {
    const row = topRows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const rawCell = String(row[c] || "").trim();
      if (!rawCell) continue;

      // Cek satu sel dengan pemisah ":" (contoh "Nama : Riswanto", "NIK: 1.0000.011")
      const inlineColonMatch = rawCell.match(/^([^:\n\r]+)[:=-]\s*(.+)$/);
      if (inlineColonMatch) {
        const labelPart = cleanVal(inlineColonMatch[1]).toLowerCase();
        const valuePart = cleanVal(inlineColonMatch[2]);

        if (isNameHeader(labelPart) && !info.name) info.name = valuePart;
        else if (isNikHeader(labelPart) && !info.nik) info.nik = valuePart;
        else if (isPosHeader(labelPart) && !info.jobPosition) info.jobPosition = valuePart;
        else if (isDeptHeader(labelPart) && !info.department) info.department = valuePart;
        else if (isPeriodHeader(labelPart) && !info.periodYear) {
          const yMatch = valuePart.match(/\b(20\d{2})\b/);
          if (yMatch) info.periodYear = yMatch[1];
        }
        continue;
      }

      // Cek jika sel saat ini adalah label terpisah
      const cleanLabel = cleanVal(rawCell).toLowerCase();
      let foundType: "name" | "nik" | "pos" | "dept" | "period" | null = null;
      if (isNameHeader(cleanLabel)) foundType = "name";
      else if (isNikHeader(cleanLabel)) foundType = "nik";
      else if (isPosHeader(cleanLabel)) foundType = "pos";
      else if (isDeptHeader(cleanLabel)) foundType = "dept";
      else if (isPeriodHeader(cleanLabel)) foundType = "period";

      if (foundType) {
        let val = "";
        for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
          const cand = cleanVal(row[nextC]);
          if (cand && cand !== ":" && cand !== "-" && cand !== "=") {
            val = cand;
            break;
          }
        }

        if (!val && r + 1 < topRows.length) {
          const candBelow = cleanVal(topRows[r + 1]?.[c]);
          if (candBelow && candBelow !== ":" && candBelow !== "-" && candBelow !== "=") {
            val = candBelow;
          }
        }

        if (val) {
          if (foundType === "name" && !info.name) info.name = val;
          else if (foundType === "nik" && !info.nik) info.nik = val;
          else if (foundType === "pos" && !info.jobPosition) info.jobPosition = val;
          else if (foundType === "dept" && !info.department) info.department = val;
          else if (foundType === "period" && !info.periodYear) {
            const yMatch = val.match(/\b(20\d{2})\b/);
            if (yMatch) info.periodYear = yMatch[1];
          }
        }
      }
    }
  }

  return info;
}

export interface DetectedTargetMetadata {
  departmentId?: number;
  departmentName?: string;
  departmentSource?: "CELL" | "SHEET_NAME" | "FILE_NAME";
  jobLevelId?: number;
  jobLevelName?: string;
  jobLevelSource?: "CELL" | "SHEET_NAME" | "FILE_NAME";
  periodYear?: string;
  periodSource?: "CELL" | "SHEET_NAME" | "FILE_NAME";
  extractedHeader?: ExtractedHeaderEmployeeInfo;
}

export function detectWorkbookTargetMetadata(
  wb: XLSX.WorkBook,
  fileName: string,
  targetSheetName: string,
  departments: Array<{ id: number; name: string; code?: string | null }>,
  jobLevels: Array<{ id: number; name: string; code?: string | null }>,
  periods: Array<{ id: number; year: number }>
): DetectedTargetMetadata {
  const result: DetectedTargetMetadata = {};

  // Helper pencocokan departemen yang aman dari bug substring pendek (seperti "IT")
  const matchDepartment = (candidate: string) => {
    const cleanCand = candidate.trim().toLowerCase();
    if (!cleanCand) return undefined;

    // 1. Exact match nama atau kode
    for (const d of departments) {
      const dName = d.name.toLowerCase();
      const dCode = d.code ? d.code.toLowerCase() : "";
      if (cleanCand === dName || (dCode && cleanCand === dCode)) return d;
    }

    // 2. Alias departemen umum
    if (cleanCand.includes("procure") || cleanCand.includes("purchas")) {
      const found = departments.find(
        (d) =>
          d.name.toLowerCase().includes("purchas") ||
          d.name.toLowerCase().includes("procure") ||
          (d.code && d.code.toLowerCase() === "pur")
      );
      if (found) return found;
    }

    if (cleanCand.includes("logis") || cleanCand.includes("gudang") || cleanCand.includes("wareh")) {
      const found = departments.find(
        (d) => d.name.toLowerCase().includes("logis") || (d.code && d.code.toLowerCase() === "log")
      );
      if (found) return found;
    }

    if (cleanCand.includes("finan") || cleanCand.includes("keuangan")) {
      const found = departments.find(
        (d) => d.name.toLowerCase().includes("keuangan") || d.name.toLowerCase().includes("finance")
      );
      if (found) return found;
    }

    if (cleanCand.includes("prod") || cleanCand.includes("mining")) {
      const found = departments.find(
        (d) => d.name.toLowerCase().includes("prod") || (d.code && d.code.toLowerCase() === "prod")
      );
      if (found) return found;
    }

    // 3. Whole-word regex match (hindari substring acak)
    for (const d of departments) {
      const dName = d.name.toLowerCase();
      const dCode = d.code ? d.code.toLowerCase() : "";
      if (dName.length >= 4 && cleanCand.includes(dName)) return d;
      if (dCode && dCode.length >= 3) {
        const wordReg = new RegExp(`(^|[^a-zA-Z0-9])${dCode}([^a-zA-Z0-9]|$)`, "i");
        if (wordReg.test(cleanCand)) return d;
      }
    }

    return undefined;
  };

  // Helper pencocokan Job Level
  const matchJobLevel = (candidate: string) => {
    const cleanCand = candidate.trim().toLowerCase();
    if (!cleanCand) return undefined;

    for (const l of jobLevels) {
      const lName = l.name.toLowerCase();
      const lCode = l.code ? l.code.toLowerCase() : "";
      if (cleanCand === lName || (lCode && cleanCand === lCode)) return l;
    }

    // Cek kata kunci jabatan umum
    if (cleanCand.includes("non-staff") || cleanCand.includes("non staff")) {
      const found = jobLevels.find((l) => l.name.toLowerCase().includes("non"));
      if (found) return found;
    }
    if (cleanCand.includes("staff") && !cleanCand.includes("non")) {
      const found = jobLevels.find(
        (l) => l.name.toLowerCase() === "staff" || (l.code && l.code.toLowerCase() === "stf")
      );
      if (found) return found;
    }
    if (cleanCand.includes("supervisor") || cleanCand.includes("spv")) {
      const found = jobLevels.find((l) => l.name.toLowerCase().includes("supervisor"));
      if (found) return found;
    }
    if (cleanCand.includes("superintendent") || cleanCand.includes("supt")) {
      const found = jobLevels.find((l) => l.name.toLowerCase().includes("superintendent"));
      if (found) return found;
    }
    if (cleanCand.includes("manager") || cleanCand.includes("mgr")) {
      const found = jobLevels.find(
        (l) => l.name.toLowerCase() === "manager" || (l.code && l.code.toLowerCase() === "mgr")
      );
      if (found) return found;
    }

    return undefined;
  };

  // 1. Periksa sel pada lembar kerja (top 20 baris)
  const ws = targetSheetName ? wb.Sheets[targetSheetName] : undefined;
  if (ws) {
    const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });

    // Ekstrak metadata header (nama, nik, job position, departemen)
    const headerInfo = extractExcelHeaderMetadata(rows);
    result.extractedHeader = headerInfo;

    // 1a. Resolusi Departemen dari header sel
    if (headerInfo.department) {
      const matchedDept = matchDepartment(headerInfo.department);
      if (matchedDept) {
        result.departmentId = matchedDept.id;
        result.departmentName = matchedDept.name;
        result.departmentSource = "CELL";
      }
    }

    // 1b. Resolusi Job Level dari header posisi/jabatan
    if (headerInfo.jobPosition) {
      const matchedLvl = matchJobLevel(headerInfo.jobPosition);
      if (matchedLvl) {
        result.jobLevelId = matchedLvl.id;
        result.jobLevelName = matchedLvl.name;
        result.jobLevelSource = "CELL";
      }
    }

    // 1c. Resolusi Periode Tahun dari header
    if (headerInfo.periodYear) {
      result.periodYear = headerInfo.periodYear;
      result.periodSource = "CELL";
    }

    // Fallback scan sel baris teratas jika departemen belum terdeteksi dari header khusus
    if (!result.departmentId) {
      const topRows = rows.slice(0, 20);
      for (const row of topRows) {
        for (const cell of row) {
          const cellStr = String(cell ?? "").trim();
          if (!cellStr) continue;

          const deptMatch = cellStr.match(/(?:departemen|department|dept)[\s:=-]+([^\n\r;,]+)/i);
          if (deptMatch && deptMatch[1]) {
            const matchedDept = matchDepartment(deptMatch[1]);
            if (matchedDept) {
              result.departmentId = matchedDept.id;
              result.departmentName = matchedDept.name;
              result.departmentSource = "CELL";
              break;
            }
          }
        }
        if (result.departmentId) break;
      }
    }
  }

  // 2. Jika belum ditemukan, periksa nama sheet
  if (targetSheetName) {
    if (!result.departmentId) {
      const matched = matchDepartment(targetSheetName);
      if (matched) {
        result.departmentId = matched.id;
        result.departmentName = matched.name;
        result.departmentSource = "SHEET_NAME";
      }
    }

    if (!result.jobLevelId) {
      const matched = matchJobLevel(targetSheetName);
      if (matched) {
        result.jobLevelId = matched.id;
        result.jobLevelName = matched.name;
        result.jobLevelSource = "SHEET_NAME";
      }
    }

    if (!result.periodYear) {
      const yearMatch = targetSheetName.match(/\b(20\d{2})\b/);
      if (yearMatch && yearMatch[1]) {
        result.periodYear = yearMatch[1];
        result.periodSource = "SHEET_NAME";
      }
    }
  }

  // 3. Jika belum ditemukan, periksa nama file
  if (fileName) {
    if (!result.departmentId) {
      const matched = matchDepartment(fileName);
      if (matched) {
        result.departmentId = matched.id;
        result.departmentName = matched.name;
        result.departmentSource = "FILE_NAME";
      }
    }

    if (!result.jobLevelId) {
      const matched = matchJobLevel(fileName);
      if (matched) {
        result.jobLevelId = matched.id;
        result.jobLevelName = matched.name;
        result.jobLevelSource = "FILE_NAME";
      }
    }

    if (!result.periodYear) {
      const yearMatch = fileName.match(/\b(20\d{2})\b/);
      if (yearMatch && yearMatch[1]) {
        result.periodYear = yearMatch[1];
        result.periodSource = "FILE_NAME";
      }
    }
  }

  return result;
}

export async function detectSheetTargetMetadata(
  file: File,
  sheetName: string,
  departments: Array<{ id: number; name: string; code?: string | null }>,
  jobLevels: Array<{ id: number; name: string; code?: string | null }>,
  periods: Array<{ id: number; year: number }>
): Promise<DetectedTargetMetadata> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  return detectWorkbookTargetMetadata(wb, file.name, sheetName, departments, jobLevels, periods);
}

export interface WorkbookInfo {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  defaultSheetName: string;
  detectedMetadata?: DetectedTargetMetadata;
}

export async function getExcelWorkbookInfo(
  file: File,
  metadataContext?: {
    departments?: Array<{ id: number; name: string; code?: string | null }>;
    jobLevels?: Array<{ id: number; name: string; code?: string | null }>;
    periods?: Array<{ id: number; year: number }>;
  }
): Promise<WorkbookInfo> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetNames = wb.SheetNames || [];
  const defaultSheetName =
    sheetNames.find((s) => {
      const low = s.toLowerCase();
      return (
        !low.includes("mapping") &&
        !low.includes("panduan") &&
        (low.includes("struktur") || low.includes("kpi") || low.includes("template") || low.includes("data"))
      );
    }) ||
    (sheetNames.find((s) => !s.toLowerCase().includes("mapping")) || sheetNames[0] || "");

  let detectedMetadata: DetectedTargetMetadata | undefined;
  if (
    metadataContext &&
    metadataContext.departments &&
    metadataContext.jobLevels &&
    metadataContext.periods
  ) {
    detectedMetadata = detectWorkbookTargetMetadata(
      wb,
      file.name,
      defaultSheetName,
      metadataContext.departments,
      metadataContext.jobLevels,
      metadataContext.periods
    );
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    sheetNames,
    defaultSheetName,
    detectedMetadata,
  };
}

export interface ParsedMasterTemplateResult {
  categories: ParsedCategory[];
  totalWeight: number;
  totalParams: number;
  totalBands: number;
  sheetName: string;
  hasSystemMapping: boolean;
  errors: string[];
  warnings: string[];
}

export async function parseMasterTemplateExcelSheet(
  file: File | ArrayBuffer,
  options?: {
    sheetName?: string;
    expectedTotalWeightPct?: number;
    masterParameters?: MasterParamItem[];
    departmentId?: number | null;
  }
): Promise<ParsedMasterTemplateResult> {
  const buffer = file instanceof ArrayBuffer ? file : await (file as any).arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      sheetName: "",
      hasSystemMapping: false,
      errors: ["File Excel tidak memiliki sheet yang dapat dibaca."],
      warnings: [],
    };
  }

  const targetSheetName =
    options?.sheetName && wb.Sheets[options.sheetName]
      ? options.sheetName
      : sheetNames.find((s) => {
          const low = s.toLowerCase();
          return (
            !low.includes("mapping") &&
            !low.includes("panduan") &&
            (low.includes("struktur") || low.includes("kpi") || low.includes("template") || low.includes("data"))
          );
        }) || (sheetNames[0] !== "_SYSTEM_MAPPING" ? sheetNames[0] : sheetNames[1] || sheetNames[0]);

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      sheetName: targetSheetName || "",
      hasSystemMapping: false,
      errors: [`Sheet "${targetSheetName}" tidak ditemukan dalam workbook.`],
      warnings: [],
    };
  }

  const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  if (!rows || rows.length === 0) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      sheetName: targetSheetName,
      hasSystemMapping: false,
      errors: [`Sheet "${targetSheetName}" kosong atau tidak memiliki baris data.`],
      warnings: [],
    };
  }

  const headerColMap: Record<string, number> = {};
  let headerRowIdx = -1;

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    const lowerRow = row.map((cell) => String(cell || "").toLowerCase().trim());
    if (
      lowerRow.some(
        (c) =>
          c.includes("parameter") ||
          c.includes("kategori") ||
          c.includes("indikator") ||
          c.includes("kriteria")
      )
    ) {
      headerRowIdx = r;
      lowerRow.forEach((c, cIdx) => {
        const clean = c.replace(/[^a-z0-9]/g, "");
        headerColMap[clean] = cIdx;
      });
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      categories: [],
      totalWeight: 0,
      totalParams: 0,
      totalBands: 0,
      sheetName: targetSheetName,
      hasSystemMapping: false,
      errors: [
        `Header kolom tidak ditemukan pada sheet "${targetSheetName}". Pastikan terdapat kolom Parameter, Indikator, dan Kriteria Penilaian.`,
      ],
      warnings: [],
    };
  }

  const getColVal = (row: (string | number | null | undefined)[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      const colIdx = headerColMap[cleanAlias];
      if (colIdx !== undefined && row[colIdx] !== undefined) {
        return String(row[colIdx]).trim();
      }
    }
    return "";
  };

  const masterParams = options?.masterParameters || [];
  const deptId = options?.departmentId;

  const hasIndicatorCol = Object.keys(headerColMap).some(
    (k) =>
      k.includes("indikator") ||
      k.includes("subpoin") ||
      k.includes("subparameter") ||
      k.includes("subindikator")
  );

  const findMasterMatch = (name: string): MasterParamItem | undefined => {
    const clean = name.toLowerCase().replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "").trim();
    if (!clean) return undefined;

    // 1. Prioritas utama: parameter spesifik departemen
    if (deptId) {
      const deptMatch = masterParams.find((mp) => {
        if (mp.departmentId !== deptId) return false;
        const mpName = mp.name.toLowerCase().trim();
        return mpName === clean || mpName === name.toLowerCase().trim();
      });
      if (deptMatch) return deptMatch;
    }

    // 2. Prioritas kedua: parameter umum / corporate (departmentId === null)
    const corpMatch = masterParams.find((mp) => {
      if (mp.departmentId !== null && mp.departmentId !== undefined) return false;
      const mpName = mp.name.toLowerCase().trim();
      return mpName === clean || mpName === name.toLowerCase().trim();
    });
    if (corpMatch) return corpMatch;

    // 3. Fallback: jika tidak ada deptId, cari nama yang cocok
    if (!deptId) {
      return masterParams.find((mp) => {
        const mpName = mp.name.toLowerCase().trim();
        return mpName === clean || mpName === name.toLowerCase().trim();
      });
    }

    return undefined;
  };

  const catList: ParsedCategory[] = [];
  let currentCat: ParsedCategory | null = null;
  let currentIndicator: {
    number: string;
    name: string;
    weight: number;
  } | null = null;
  let currentParam: ParsedParam | null = null;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let rIdx = headerRowIdx + 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    if (row.length === 0 || row.every((c) => c === "" || c === null || c === undefined)) {
      continue;
    }

    const firstCellText = String(row[0] || "").trim();
    const criteriaCol = getColVal(
      row,
      "kriteriapenilaian",
      "kriteria",
      "kondisi",
      "skalapenilaian",
      "labelkriteria"
    );
    const scoreCol = getColVal(row, "skor", "score", "poin", "nilaipoin");
    const weightCol = getColVal(
      row,
      "bobot",
      "bobotparameter",
      "bobotindikator",
      "bobotinternal",
      "bobotkategori"
    );
    const targetCol = getColVal(row, "target", "nilaitarget", "sasaran", "targetkerja");
    const unitCol = getColVal(row, "satuan", "unit");
    const paramDescCol = getColVal(row, "deskripsi", "description", "keterangan", "deskripsitarget");
    const inputTypeCol = getColVal(row, "tipeinput", "inputtype", "tipe");
    const picCol = getColVal(row, "rolepenilai", "penilai", "pic", "picinput", "picrole");

    // Resolusi Tipe Input & PIC
    let inputType: ParsedParam["inputType"] = "MONTHLY_ACTUAL";
    const cleanInputType = inputTypeCol.toUpperCase().replace(/[^A-Z_]/g, "");
    if (cleanInputType.includes("CURRENCY") || cleanInputType.includes("RP")) inputType = "CURRENCY";
    else if (cleanInputType.includes("PERCENT") || cleanInputType.includes("PERSEN")) inputType = "PERCENTAGE";
    else if (cleanInputType.includes("QUALITATIVE") || cleanInputType.includes("KUALITATIF") || cleanInputType.includes("TEKS")) inputType = "QUALITATIVE";
    else if (cleanInputType.includes("NUMBER") || cleanInputType.includes("ANGKA")) inputType = "NUMBER";
    else if (unitCol === "%") inputType = "PERCENTAGE";
    else if (unitCol.toLowerCase() === "rp") inputType = "CURRENCY";

    let picRole: ParsedParam["picRole"] = "HEAD_DEPT";
    const cleanPic = picCol.toUpperCase();
    if (cleanPic.includes("HR")) picRole = "HR";
    else if (cleanPic.includes("HSE")) picRole = "HSE";
    else if (cleanPic.includes("SUPERINTENDENT")) picRole = "SUPERINTENDENT";

    // 1. CEK: Apakah baris ini adalah Header Parameter Utama / Kategori (Level 1)?
    // Misal: "1. Target Kerja (65% dari 115%)" atau "1. Target Kerja" atau "I. Target Kerja"
    const sectionMatch = firstCellText.match(
      /^(?:[0-9]+[.)]\s*)?([^(]+)\s*\(([0-9.]+)\s*%\s*(?:dari|of)?\s*[0-9.]*%\)/i
    );

    const isLevel1Header =
      Boolean(sectionMatch) ||
      (/^([0-9]+|[IVXLCDM]+)[.)]\s*([^.]+.*)$/i.test(firstCellText) &&
        !/^[0-9]+\.[0-9]+/i.test(firstCellText) &&
        !criteriaCol);

    if (isLevel1Header) {
      let catName = "";
      let weightNum = 0;
      if (sectionMatch) {
        catName = sectionMatch[1].trim();
        weightNum = parseFloat(sectionMatch[2]) / 100;
      } else {
        const m = firstCellText.match(/^([0-9]+|[IVXLCDM]+)[.)]\s*(.*)$/i);
        catName = m ? m[2].trim() : firstCellText;
        const wVal = parseFloat(weightCol);
        weightNum = !isNaN(wVal) ? (wVal > 1 ? wVal / 100 : wVal) : 0;
      }

      const cleanCatName = catName
        .replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "")
        .replace(/^[IVXLCDM]+\.\s*/i, "")
        .replace(/\s*\([0-9.]+%.*\)$/i, "")
        .trim() || catName;

      const isTargetKerja = catList.length === 0 || cleanCatName.toLowerCase().includes("target kerja");
      currentCat = {
        name: cleanCatName,
        weight: weightNum || (isTargetKerja ? 0.65 : 0.10),
        categoryType: isTargetKerja ? "SUB_ITEMS" : "DIRECT",
        sortOrder: catList.length,
        params: [],
      };
      catList.push(currentCat);
      currentIndicator = null;
      currentParam = null;
      continue;
    }

    if (!currentCat) {
      currentCat = {
        name: "Target Kerja",
        weight: 0.65,
        categoryType: "SUB_ITEMS",
        sortOrder: 0,
        params: [],
      };
      catList.push(currentCat);
    }

    // 2. Jika kategori saat ini adalah DIRECT (Indikator 2 s/d 5): Tidak memiliki sub-parameter
    if (currentCat.categoryType === "DIRECT") {
      if (!currentParam || currentCat.params.length === 0) {
        const matchedMaster = findMasterMatch(currentCat.name);
        currentParam = {
          masterParameterId: matchedMaster?.id ?? null,
          name: currentCat.name,
          description: paramDescCol || matchedMaster?.description || "Penilaian langsung indikator",
          target: targetCol || "100",
          unit: unitCol || matchedMaster?.unit || "%",
          weight: 1.0,
          maxScore: 25,
          inputType,
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          picRole,
          sortOrder: 0,
          bands: [],
        };
        currentCat.params.push(currentParam);
      } else {
        currentParam = currentCat.params[0];
      }

      if (criteriaCol && currentParam) {
        const parsedCond = parseConditionString(criteriaCol);
        const scoreNum = parseFloat(scoreCol);
        const finalScore = !isNaN(scoreNum)
          ? scoreNum
          : currentParam.bands.length === 0
          ? 25
          : currentParam.bands.length === 1
          ? 15
          : 5;

        currentParam.bands.push({
          label: criteriaCol,
          operator: parsedCond.operator,
          operatorSymbol: parsedCond.operatorSymbol,
          criteriaValue: parsedCond.criteriaValue,
          isUnrecognizedOperator: parsedCond.isUnrecognizedOperator,
          minValue: parsedCond.minValue,
          maxValue: parsedCond.maxValue,
          score: finalScore,
          sortOrder: currentParam.bands.length,
        });
      }
      continue;
    }

    // 3. Khusus Indikator 1 (Target Kerja): Memiliki Sub Parameter (Level 3 & Level 2)
    const separateIndikatorCol = getColVal(row, "indikator", "subpoin", "namaindikator", "indikatorkpi");
    const separateSubParamCol = getColVal(row, "subparameter", "subindikator", "namasubparameter");

    const level3Match = firstCellText.match(/^([0-9]+\.[0-9]+\.[0-9]+)\s*(.*)$/);
    const level2Match = firstCellText.match(/^([0-9]+\.[0-9]+)\s*(.*)$/);

    const numW = parseFloat(weightCol);
    const parsedW = !isNaN(numW) ? (numW > 1 ? numW / 100 : numW) : 0;

    if (separateSubParamCol || level3Match) {
      // INI ADALAH SUB PARAMETER (Level 3)
      const subNum = level3Match ? level3Match[1] : undefined;
      const subName = separateSubParamCol || (level3Match ? level3Match[2].trim() : firstCellText);

      // Jika indikator induk belum memiliki bobot dan di baris ini ada bobot (misal 60%), catat ke indikator induk
      if (currentIndicator && parsedW > 0 && currentIndicator.weight === 0) {
        currentIndicator.weight = parsedW;
      }

      const matchedMaster = findMasterMatch(subName);

      currentParam = {
        masterParameterId: matchedMaster?.id ?? null,
        name: subName,
        description: paramDescCol || matchedMaster?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedMaster?.unit || "%",
        weight: parsedW || (currentIndicator && currentIndicator.weight > 0 ? currentIndicator.weight : 0.2),
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
        indicatorName: currentIndicator ? currentIndicator.name : undefined,
        indicatorNumber: currentIndicator ? currentIndicator.number : undefined,
        subParamNumber: subNum,
        indicatorWeight: currentIndicator ? currentIndicator.weight : parsedW,
      };
      currentCat.params.push(currentParam);
    } else if (separateIndikatorCol || level2Match) {
      // INI ADALAH INDIKATOR (Level 2)
      const indNum = level2Match ? level2Match[1] : `${currentCat.sortOrder + 1}.${currentCat.params.length + 1}`;
      const indName = separateIndikatorCol || (level2Match ? level2Match[2].trim() : firstCellText);

      currentIndicator = {
        number: indNum,
        name: indName,
        weight: parsedW,
      };

      // Jika baris indikator ini langsung memiliki kriteria penilaian, berarti sub-parameter langsung
      if (criteriaCol) {
        const matchedMaster = findMasterMatch(indName);
        currentParam = {
          masterParameterId: matchedMaster?.id ?? null,
          name: indName,
          description: paramDescCol || matchedMaster?.description || "",
          target: targetCol || "100",
          unit: unitCol || matchedMaster?.unit || "%",
          weight: parsedW || 0.2,
          maxScore: 25,
          inputType,
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          picRole,
          sortOrder: currentCat.params.length,
          bands: [],
          indicatorName: indName,
          indicatorNumber: indNum,
          indicatorWeight: parsedW,
        };
        currentCat.params.push(currentParam);
      } else {
        // Menunggu baris sub-parameter berikutnya (misal 1.1.1)
        currentParam = null;
      }
    } else if (firstCellText === "" && currentIndicator && !currentParam && criteriaCol) {
      // Kasus di mana nama indikator ada di baris sebelumnya (misal 1.2 Nilai Stock On Hand)
      // dan kriteria dimulai di baris ini dengan firstCellText kosong
      if (parsedW > 0 && currentIndicator.weight === 0) {
        currentIndicator.weight = parsedW;
      }

      const matchedMaster = findMasterMatch(currentIndicator.name);
      currentParam = {
        masterParameterId: matchedMaster?.id ?? null,
        name: currentIndicator.name,
        description: paramDescCol || matchedMaster?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedMaster?.unit || "%",
        weight: currentIndicator.weight || parsedW || 0.2,
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
        indicatorName: currentIndicator.name,
        indicatorNumber: currentIndicator.number,
        indicatorWeight: currentIndicator.weight || parsedW,
      };
      currentCat.params.push(currentParam);
    } else if (firstCellText && !level2Match && !level3Match && !criteriaCol) {
      // Fallback untuk sub-parameter teks biasa tanpa nomor
      const cleanName = firstCellText.replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "").trim();
      const matchedMaster = findMasterMatch(cleanName);
      currentParam = {
        masterParameterId: matchedMaster?.id ?? null,
        name: cleanName,
        description: paramDescCol || matchedMaster?.description || "",
        target: targetCol || "100",
        unit: unitCol || matchedMaster?.unit || "%",
        weight: parsedW || 0.2,
        maxScore: 25,
        inputType,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole,
        sortOrder: currentCat.params.length,
        bands: [],
        indicatorName: cleanName,
      };
      currentCat.params.push(currentParam);
    }

    // Tambahkan Baris Kriteria ke currentParam yang aktif
    if (criteriaCol && currentParam) {
      const parsedCond = parseConditionString(criteriaCol);
      const scoreNum = parseFloat(scoreCol);
      const finalScore = !isNaN(scoreNum)
        ? scoreNum
        : currentParam.bands.length === 0
        ? 25
        : currentParam.bands.length === 1
        ? 15
        : 5;

      currentParam.bands.push({
        label: criteriaCol,
        operator: parsedCond.operator,
        operatorSymbol: parsedCond.operatorSymbol,
        criteriaValue: parsedCond.criteriaValue,
        isUnrecognizedOperator: parsedCond.isUnrecognizedOperator,
        minValue: parsedCond.minValue,
        maxValue: parsedCond.maxValue,
        score: finalScore,
        sortOrder: currentParam.bands.length,
      });
    }
  }

  // 4. Pasca-proses: Distribusikan bobot indikator secara proporsional ke sub-parameternya
  for (const cat of catList) {
    if (cat.categoryType === "SUB_ITEMS") {
      const indicatorGroups = new Map<string, ParsedParam[]>();
      for (const p of cat.params) {
        const groupKey = p.indicatorNumber || p.indicatorName || p.name;
        if (!indicatorGroups.has(groupKey)) {
          indicatorGroups.set(groupKey, []);
        }
        indicatorGroups.get(groupKey)!.push(p);
      }

      for (const [_, groupParams] of indicatorGroups.entries()) {
        if (groupParams.length > 1) {
          // Ambil bobot indikator induk
          const indW = groupParams[0].indicatorWeight || groupParams.reduce((sum, gp) => sum + gp.weight, 0);
          // Bagi rata bobot indikator ke sub-parameter
          const subWeight = indW / groupParams.length;
          groupParams.forEach((gp) => {
            gp.weight = parseFloat(subWeight.toFixed(4));
            gp.indicatorWeight = indW;
          });
        }
      }
    }
  }

  // 5. Pastikan struktur standar 5 Indikator terpenuhi (Hanya Indikator 1 yang memiliki sub-parameter)
  const standardGeneralIndicators = [
    {
      name: "Kehadiran & Disiplin",
      code: "GEN-KD-01",
      weight: 0.20,
      target: "100",
      unit: "%",
      inputType: "PERCENTAGE" as const,
      description: "Persentase tingkat kehadiran fisik dan ketepatan presensi kerja harian tanpa mangkir.",
      defaultBands: [
        { label: ">= 98% (Disiplin Sempurna)", score: 25, minValue: 98, maxValue: null, operator: "GTE" as const },
        { label: "95% - 98% (Disiplin Cukup)", score: 15, minValue: 95, maxValue: 98, operator: "BETWEEN" as const },
        { label: "< 95% (Sering Mangkir / Terlambat)", score: 5, minValue: null, maxValue: 95, operator: "LT" as const },
      ],
    },
    {
      name: "Keselamatan Kerja",
      code: "GEN-K3-01",
      weight: 0.10,
      target: "0",
      unit: "Insiden",
      inputType: "NUMBER" as const,
      description: "Tingkat keselamatan kerja dan ketiadaan insiden kecelakaan kerja di area operasional.",
      defaultBands: [
        { label: "0 Insiden (Zero Accident)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" as const },
        { label: "1 Insiden Ringan", score: 15, minValue: 1, maxValue: 1, operator: "EQ" as const },
        { label: "> 1 Insiden", score: 5, minValue: 1, maxValue: null, operator: "GT" as const },
      ],
    },
    {
      name: "Kepatuhan & SP",
      code: "GEN-SP-01",
      weight: 0.10,
      target: "0",
      unit: "SP",
      inputType: "NUMBER" as const,
      description: "Tingkat kepatuhan terhadap peraturan perusahaan dan ketiadaan sanksi Surat Peringatan.",
      defaultBands: [
        { label: "Tidak Ada SP (0 SP)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" as const },
        { label: "Terdapat SP 1", score: 15, minValue: 1, maxValue: 1, operator: "EQ" as const },
        { label: "Terdapat SP 2 atau lebih", score: 0, minValue: 1, maxValue: null, operator: "GT" as const },
      ],
    },
    {
      name: "Inovasi & Improvement",
      code: "GEN-INV-01",
      weight: 0.10,
      target: "0",
      unit: "Ide",
      inputType: "NUMBER" as const,
      description: "Inisiatif perbaikan proses, efisiensi kerja, atau inovasi yang terimplementasi.",
      defaultBands: [
        { label: ">= 2 Inisiatif Tervalidasi", score: 25, minValue: 2, maxValue: null, operator: "GTE" as const },
        { label: "1 Inisiatif Tervalidasi", score: 15, minValue: 1, maxValue: 1, operator: "EQ" as const },
        { label: "Tidak Ada Inisiatif", score: 5, minValue: 0, maxValue: 0, operator: "EQ" as const },
      ],
    },
  ];

  let addedGeneralCount = 0;
  for (const std of standardGeneralIndicators) {
    const exists = catList.some((c) => {
      const low = c.name.toLowerCase();
      return (
        low.includes(std.name.toLowerCase().split(" ")[0]) ||
        (std.name.includes("Kehadiran") && (low.includes("presensi") || low.includes("disiplin"))) ||
        (std.name.includes("Keselamatan") && (low.includes("k3") || low.includes("safety"))) ||
        (std.name.includes("SP") && (low.includes("sp") || low.includes("kepatuhan"))) ||
        (std.name.includes("Inovasi") && (low.includes("inovasi") || low.includes("improvement")))
      );
    });

    if (!exists) {
      const matchedMp = masterParams.find(
        (mp) =>
          mp.code === std.code ||
          mp.name.toLowerCase().includes(std.name.toLowerCase().split(" ")[0])
      );

      const bandsToUse =
        matchedMp?.defaultBands && matchedMp.defaultBands.length > 0
          ? matchedMp.defaultBands.map((b, bIdx) => ({
              label: b.label,
              operator: (b.operator as any) || "EQ",
              minValue: b.minValue ?? null,
              maxValue: b.maxValue ?? null,
              score: Number(b.score),
              sortOrder: bIdx,
            }))
          : std.defaultBands.map((b, bIdx) => ({
              ...b,
              sortOrder: bIdx,
            }));

      catList.push({
        masterParameterId: matchedMp?.id ?? null,
        name: matchedMp?.name ?? std.name,
        weight: std.weight,
        categoryType: "DIRECT",
        sortOrder: catList.length,
        params: [
          {
            masterParameterId: matchedMp?.id ?? null,
            name: matchedMp?.name ?? std.name,
            description: matchedMp?.description || std.description,
            target: std.target,
            unit: matchedMp?.unit || std.unit,
            weight: 1.0,
            maxScore: 25,
            inputType: (matchedMp?.inputType as any) || std.inputType,
            aggregation: "AVERAGE",
            compareBasis: "ACTUAL",
            picRole: "HEAD_DEPT",
            sortOrder: 0,
            bands: bandsToUse,
          },
        ],
      });
      addedGeneralCount++;
    }
  }

  if (addedGeneralCount > 0) {
    warnings.push(
      `Indikator 2 s/d 5 (Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement) otomatis dilengkapi agar memenuhi standar 5 Indikator Utama (total bobot 115%).`
    );
  }

  // Enforce: Hanya Indikator 1 (Target Kerja) yang bertipe SUB_ITEMS. Indikator 2-5 selalu DIRECT dengan bobot 1.0
  catList.forEach((c, idx) => {
    if (idx === 0) {
      c.categoryType = "SUB_ITEMS";
    } else {
      c.categoryType = "DIRECT";
      if (c.params.length > 1) {
        // Gabungkan seluruh bands ke param pertama
        const allBands = c.params.flatMap((p) => p.bands);
        c.params[0].bands = allBands;
        c.params[0].weight = 1.0;
        c.params = [c.params[0]];
      } else if (c.params.length === 1) {
        c.params[0].weight = 1.0;
      }
    }
  });

  let totalWeight = 0;
  let totalParams = 0;
  let totalBands = 0;

  for (const cat of catList) {
    totalWeight += cat.weight;
    totalParams += cat.params.length;

    for (const p of cat.params) {
      if (p.bands.length === 0) {
        p.bands.push(
          { label: "Target Tercapai", operator: "GTE", operatorSymbol: ">=", criteriaValue: "Target Tercapai", isUnrecognizedOperator: false, minValue: 98, maxValue: null, score: 25, sortOrder: 0 },
          { label: "Cukup", operator: "BETWEEN", operatorSymbol: "Rentang", criteriaValue: "95 - 98", isUnrecognizedOperator: false, minValue: 95, maxValue: 98, score: 15, sortOrder: 1 },
          { label: "Kurang", operator: "LT", operatorSymbol: "<", criteriaValue: "95", isUnrecognizedOperator: false, minValue: null, maxValue: 95, score: 5, sortOrder: 2 }
        );
      } else {
        const detectedU = detectIndicatorUnit(p.unit, p.bands);
        if (p.unit === "%" && detectedU !== "%") {
          p.unit = detectedU;
        }
        p.bands = autoHarmonizeCriteriaBands(p.bands, p.unit || "%");
      }
      totalBands += p.bands.length;
    }
  }

  return {
    categories: catList,
    totalWeight,
    totalParams,
    totalBands,
    sheetName: targetSheetName,
    hasSystemMapping: false,
    errors,
    warnings,
  };
}

export type ValidationCategory =
  | "COMPLETENESS"
  | "DUPLICATION"
  | "CRITERIA"
  | "SCORE"
  | "WEIGHT"
  | "MASTER_MAPPING";

export interface KpiValidationFinding {
  type: "ERROR" | "WARNING";
  category?: ValidationCategory;
  code: string;
  paramIndex?: number;
  indicatorIndex?: number;
  paramName?: string;
  indicatorName?: string;
  message: string;
}

export interface ValidationChecklist {
  completeness: { isValid: boolean; message: string; errorCount: number };
  duplication: { isValid: boolean; message: string; errorCount: number };
  criteria: { isValid: boolean; message: string; errorCount: number };
  score: { isValid: boolean; message: string; errorCount: number };
  weight: { isValid: boolean; message: string; totalPct: number; expectedPct: number };
  mapping: { isValid: boolean; message: string; matchedCount: number; totalCount: number };
}

export function validateMasterTemplateParsedData(
  categories: ParsedCategory[],
  masterParameters: MasterParamItem[],
  options?: {
    expectedTotalWeightPct?: number;
    departmentId?: number;
    departmentName?: string;
    jobLevelName?: string;
  }
): {
  isValid: boolean;
  errors: KpiValidationFinding[];
  warnings: KpiValidationFinding[];
  checklist: ValidationChecklist;
  totalWeightPct: number;
  paramCount: number;
  indicatorCount: number;
  matchedCount: number;
  unmatchedCount: number;
} {
  const errors: KpiValidationFinding[] = [];
  const warnings: KpiValidationFinding[] = [];
  const expectedTotalPct = options?.expectedTotalWeightPct ?? 115;

  const emptyChecklist: ValidationChecklist = {
    completeness: { isValid: false, message: "Data kosong", errorCount: 1 },
    duplication: { isValid: true, message: "Tidak ada duplikasi", errorCount: 0 },
    criteria: { isValid: false, message: "Belum ada kriteria", errorCount: 1 },
    score: { isValid: false, message: "Belum ada skor", errorCount: 1 },
    weight: { isValid: false, message: "Bobot belum terisi", totalPct: 0, expectedPct: expectedTotalPct },
    mapping: { isValid: false, message: "Belum terpetakan", matchedCount: 0, totalCount: 0 },
  };

  if (categories.length === 0) {
    errors.push({
      type: "ERROR",
      category: "COMPLETENESS",
      code: "VAL-01",
      message: "Tidak ada parameter atau indikator KPI yang berhasil terbaca dari sheet Excel.",
    });
    return {
      isValid: false,
      errors,
      warnings,
      checklist: emptyChecklist,
      totalWeightPct: 0,
      paramCount: 0,
      indicatorCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
    };
  }

  let totalWeight = 0;
  let paramCount = categories.length;
  let indicatorCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  const seenIndicatorNames = new Set<string>();
  const seenCategoryNames = new Set<string>();

  let completenessErrors = 0;
  let duplicationErrors = 0;
  let criteriaErrors = 0;
  let scoreErrors = 0;
  let weightErrors = 0;

  for (let cIdx = 0; cIdx < categories.length; cIdx++) {
    const cat = categories[cIdx];
    const catNo = cIdx + 1;
    totalWeight += cat.weight;

    const normCatName = cat.name.trim().toLowerCase();
    if (!normCatName) {
      completenessErrors++;
      errors.push({
        type: "ERROR",
        category: "COMPLETENESS",
        code: "VAL-02",
        paramIndex: catNo,
        message: `Parameter No. ${catNo}: Nama parameter wajib diisi.`,
      });
    } else if (seenCategoryNames.has(normCatName)) {
      duplicationErrors++;
      errors.push({
        type: "ERROR",
        category: "DUPLICATION",
        code: "VAL-04",
        paramIndex: catNo,
        paramName: cat.name,
        message: `Duplikasi parameter: "${cat.name}" sudah ada sebelumnya pada template ini.`,
      });
    } else {
      seenCategoryNames.add(normCatName);
    }

    if (isNaN(cat.weight) || cat.weight <= 0) {
      weightErrors++;
      errors.push({
        type: "ERROR",
        category: "WEIGHT",
        code: "VAL-05",
        paramIndex: catNo,
        paramName: cat.name,
        message: `Parameter No. ${catNo} (${cat.name}): Bobot parameter harus lebih besar dari 0%.`,
      });
    }

    if (cat.params.length === 0) {
      completenessErrors++;
      errors.push({
        type: "ERROR",
        category: "COMPLETENESS",
        code: "VAL-02",
        paramIndex: catNo,
        paramName: cat.name,
        message: `Parameter No. ${catNo} (${cat.name}): Belum memiliki indikator penilaian.`,
      });
      continue;
    }

    let sumInternalWeight = 0;

    for (let pIdx = 0; pIdx < cat.params.length; pIdx++) {
      const p = cat.params[pIdx];
      const indNo = `${catNo}.${pIdx + 1}`;
      indicatorCount++;
      sumInternalWeight += p.weight;

      if (!p.name.trim()) {
        completenessErrors++;
        errors.push({
          type: "ERROR",
          category: "COMPLETENESS",
          code: "VAL-02",
          paramIndex: catNo,
          indicatorIndex: pIdx + 1,
          paramName: cat.name,
          message: `Indikator No. ${indNo}: Nama indikator tidak boleh kosong.`,
        });
      }

      // Validasi kelengkapan target & satuan
      if (!p.target || !p.target.trim()) {
        warnings.push({
          type: "WARNING",
          category: "COMPLETENESS",
          code: "VAL-08",
          paramIndex: catNo,
          indicatorIndex: pIdx + 1,
          paramName: cat.name,
          indicatorName: p.name,
          message: `Indikator "${p.name}" (No. ${indNo}): Target sasaran masih kosong (disarankan diisi).`,
        });
      }

      const normName = p.name.trim().toLowerCase();
      if (seenIndicatorNames.has(normName)) {
        duplicationErrors++;
        errors.push({
          type: "ERROR",
          category: "DUPLICATION",
          code: "VAL-04",
          paramIndex: catNo,
          indicatorIndex: pIdx + 1,
          paramName: cat.name,
          indicatorName: p.name,
          message: `Duplikasi indikator: "${p.name}" (No. ${indNo}) sudah terdaftar pada baris sebelumnya.`,
        });
      } else if (normName) {
        seenIndicatorNames.add(normName);
      }

      let isMatched = false;
      if (p.masterParameterId) {
        const found = masterParameters.some(
          (mp) =>
            mp.id === p.masterParameterId &&
            (!options?.departmentId ||
              mp.departmentId === options.departmentId ||
              mp.departmentId === null ||
              mp.departmentId === undefined)
        );
        if (found) isMatched = true;
      }

      if (!isMatched && normName) {
        // Prioritas 1: cocokkan dengan parameter spesifik departemen
        const foundDept = masterParameters.find(
          (mp) =>
            mp.name.trim().toLowerCase() === normName &&
            options?.departmentId &&
            mp.departmentId === options.departmentId
        );
        if (foundDept) {
          p.masterParameterId = foundDept.id;
          isMatched = true;
        } else {
          // Prioritas 2: cocokkan dengan parameter umum / corporate
          const foundCorp = masterParameters.find(
            (mp) =>
              mp.name.trim().toLowerCase() === normName &&
              (mp.departmentId === null || mp.departmentId === undefined)
          );
          if (foundCorp) {
            p.masterParameterId = foundCorp.id;
            isMatched = true;
          }
        }
      }

      if (isMatched) {
        matchedCount++;
      } else {
        unmatchedCount++;
        errors.push({
          type: "ERROR",
          category: "MASTER_MAPPING",
          code: "VAL-03",
          paramIndex: catNo,
          indicatorIndex: pIdx + 1,
          paramName: cat.name,
          indicatorName: p.name,
          message: `Indikator "${p.name}" (No. ${indNo}) tidak ditemukan dalam Kamus Parameter. Silakan pilih padanan pada tabel mapping.`,
        });
      }

      if (p.bands.length === 0) {
        criteriaErrors++;
        errors.push({
          type: "ERROR",
          category: "CRITERIA",
          code: "VAL-07",
          paramIndex: catNo,
          indicatorIndex: pIdx + 1,
          paramName: cat.name,
          indicatorName: p.name,
          message: `Indikator "${p.name}" (No. ${indNo}): Belum memiliki kriteria penilaian dan skor.`,
        });
      } else {
        // Periksa validitas skor dan operator kriteria
        for (const band of p.bands) {
          if (isNaN(Number(band.score))) {
            scoreErrors++;
            errors.push({
              type: "ERROR",
              category: "SCORE",
              code: "VAL-11",
              paramIndex: catNo,
              indicatorIndex: pIdx + 1,
              paramName: cat.name,
              indicatorName: p.name,
              message: `Indikator "${p.name}" (No. ${indNo}): Terdapat nilai skor yang bukan angka numerik.`,
            });
            break;
          }

          if (band.isUnrecognizedOperator || band.operatorSymbol === "?") {
            warnings.push({
              type: "WARNING",
              category: "CRITERIA",
              code: "VAL-12",
              paramIndex: catNo,
              indicatorIndex: pIdx + 1,
              paramName: cat.name,
              indicatorName: p.name,
              message: `Indikator "${p.name}" (No. ${indNo}): Operator kriteria "${band.label}" tidak dikenali. Ditandai untuk pemeriksaan manual.`,
            });
          }

          if (band.needsManualReview) {
            warnings.push({
              type: "WARNING",
              category: "CRITERIA",
              code: "VAL-13",
              paramIndex: catNo,
              indicatorIndex: pIdx + 1,
              paramName: cat.name,
              indicatorName: p.name,
              message: `Indikator "${p.name}" (No. ${indNo}): Batas nilai kriteria "${band.label}" ${band.manualReviewReason || "belum dapat ditentukan otomatis"}. Ditandai untuk pemeriksaan manual.`,
            });
          }
        }

        // Validasi gap dan overlap kriteria penilaian
        const effectiveUnit = detectIndicatorUnit(p.unit, p.bands);
        if (p.unit === "%" && effectiveUnit !== "%") {
          p.unit = effectiveUnit;
        }
        const criteriaItems: CriteriaItem[] = p.bands.map((b, idx) => ({
          id: b.id ? String(b.id) : `band-${idx}`,
          label: b.label,
          score: String(b.score ?? 0),
          operator: b.operator,
          minValue: b.minValue != null ? String(b.minValue) : "",
          maxValue: b.maxValue != null ? String(b.maxValue) : "",
        }));
        const structVal = validateStructuredCriteria(
          criteriaItems,
          "HIGHER_IS_BETTER",
          effectiveUnit,
          p.inputType || "PERCENTAGE"
        );

        if (structVal.hasErrors) {
          criteriaErrors++;
          for (const err of structVal.errors) {
            errors.push({
              type: "ERROR",
              category: "CRITERIA",
              code: "VAL-09",
              paramIndex: catNo,
              indicatorIndex: pIdx + 1,
              paramName: cat.name,
              indicatorName: p.name,
              message: `Indikator "${p.name}" (No. ${indNo}): ${err}`,
            });
          }
        }

        if (structVal.hasWarnings) {
          for (const w of structVal.warnings) {
            warnings.push({
              type: "WARNING",
              category: "CRITERIA",
              code: "VAL-10",
              paramIndex: catNo,
              indicatorIndex: pIdx + 1,
              paramName: cat.name,
              indicatorName: p.name,
              message: `Indikator "${p.name}" (No. ${indNo}): ${w}`,
            });
          }
        }
      }
    }

    if (cat.categoryType === "SUB_ITEMS") {
      const sumPct = Math.round(sumInternalWeight * 100);
      if (Math.abs(sumPct - 100) > 1) {
        weightErrors++;
        errors.push({
          type: "ERROR",
          category: "WEIGHT",
          code: "VAL-06",
          paramIndex: catNo,
          paramName: cat.name,
          message: `Indikator No. ${catNo} (${cat.name}): Total bobot internal sub-parameter adalah ${sumPct}%, wajib berjumlah tepat 100%.`,
        });
      }
    }
  }

  const totalWeightPct = Math.round(totalWeight * 100);
  if (Math.abs(totalWeightPct - expectedTotalPct) > 1) {
    weightErrors++;
    errors.push({
      type: "ERROR",
      category: "WEIGHT",
      code: "VAL-05",
      message: `Total bobot seluruh indikator utama adalah ${totalWeightPct}%, target standar template adalah tepat ${expectedTotalPct}%.`,
    });
  }

  const checklist: ValidationChecklist = {
    completeness: {
      isValid: completenessErrors === 0,
      message:
        completenessErrors === 0
          ? "Seluruh nama parameter dan indikator lengkap terisi"
          : `${completenessErrors} data wajib belum terisi lengkap`,
      errorCount: completenessErrors,
    },
    duplication: {
      isValid: duplicationErrors === 0,
      message:
        duplicationErrors === 0
          ? "Tidak ada nama parameter atau indikator yang duplikat"
          : `${duplicationErrors} duplikasi data terdeteksi`,
      errorCount: duplicationErrors,
    },
    criteria: {
      isValid: criteriaErrors === 0,
      message:
        criteriaErrors === 0
          ? "Semua indikator telah dilengkapi kriteria penilaian"
          : `${criteriaErrors} indikator belum memiliki kriteria penilaian`,
      errorCount: criteriaErrors,
    },
    score: {
      isValid: scoreErrors === 0,
      message:
        scoreErrors === 0
          ? "Skala skor (1 s/d 5) valid dan terdefinisi dengan benar"
          : `${scoreErrors} masalah format skala skor ditemukan`,
      errorCount: scoreErrors,
    },
    weight: {
      isValid: weightErrors === 0,
      message:
        weightErrors === 0
          ? `Total bobot seimbang ${totalWeightPct}% (sesuai target ${expectedTotalPct}%)`
          : `Total bobot ${totalWeightPct}% (belum sesuai target ${expectedTotalPct}%)`,
      totalPct: totalWeightPct,
      expectedPct: expectedTotalPct,
    },
    mapping: {
      isValid: unmatchedCount === 0,
      message:
        unmatchedCount === 0
          ? "Seluruh indikator telah terpetakan ke Kamus Parameter"
          : `${unmatchedCount} dari ${indicatorCount} indikator belum terdaftar di Kamus`,
      matchedCount,
      totalCount: indicatorCount,
    },
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checklist,
    totalWeightPct,
    paramCount,
    indicatorCount,
    matchedCount,
    unmatchedCount,
  };
}
