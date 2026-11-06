import * as XLSX from "xlsx";
import type { MonthlyAssessmentDetailResult, GenericScoringRule } from "@/types/monthly-assessment";
import { convertEvaluationToMatrixData, exportCorporateKpiMatrixExcel } from "./excel-kpi-matrix";
import { exportSingleEmployeeKpiExcel } from "./excel-batch-export";

function formatRuleLabel(rule: GenericScoringRule, unit?: string | null): string {
  const u = (unit || "").trim().toLowerCase();
  const isRp = u === "rp" || u === "idr" || u === "rupiah";

  const rawLabel = (rule.label || "").trim();
  const op = (rule.operator || "").toUpperCase();
  const minNum = rule.minValue !== null && rule.minValue !== undefined ? Number(rule.minValue) : null;
  const maxNum = rule.maxValue !== null && rule.maxValue !== undefined ? Number(rule.maxValue) : null;

  if (isRp) {
    let mult = 1;
    if (/(?:miliar|milyar|[0-9]\s*m\b)/i.test(rawLabel)) mult = 1_000_000_000;
    else if (/(?:juta|million|[0-9]\s*jt\b)/i.test(rawLabel)) mult = 1_000_000;
    else if (/(?:ribu|thousand|[0-9]\s*k\b)/i.test(rawLabel)) mult = 1_000;
    else if ((minNum !== null && minNum > 0 && minNum <= 1000) || (maxNum !== null && maxNum > 0 && maxNum <= 1000)) {
      mult = 1_000_000_000;
    }

    const effMin = minNum !== null ? (minNum <= 1000 && mult > 1 ? minNum * mult : minNum) : null;
    const effMax = maxNum !== null ? (maxNum <= 1000 && mult > 1 ? maxNum * mult : maxNum) : null;
    const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

    if (op === "EQ" || op === "=") return effMin !== null ? `= ${formatRp(effMin)}` : (effMax !== null ? `= ${formatRp(effMax)}` : "");
    if (op === "LT" || op === "<") return effMax !== null ? `< ${formatRp(effMax)}` : (effMin !== null ? `< ${formatRp(effMin)}` : "");
    if (op === "LTE" || op === "<=") return effMax !== null ? `≤ ${formatRp(effMax)}` : (effMin !== null ? `≤ ${formatRp(effMin)}` : "");
    if (op === "GT" || op === ">") return effMin !== null ? `> ${formatRp(effMin)}` : (effMax !== null ? `> ${formatRp(effMax)}` : "");
    if (op === "GTE" || op === ">=") return effMin !== null ? `≥ ${formatRp(effMin)}` : (effMax !== null ? `≥ ${formatRp(effMax)}` : "");
    if (op === "BETWEEN" || op === "RANGE") return effMin !== null && effMax !== null ? `${formatRp(effMin)} – ${formatRp(effMax)}` : "";
  }

  const formatVal = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    const str = String(v).replace(/\.0000$/, "").replace(/\.00$/, "");
    if (u === "%") return `${str}%`;
    if (u) return `${str} ${unit}`;
    return str;
  };

  const min = rule.minValue !== null && rule.minValue !== undefined ? String(rule.minValue) : "";
  const max = rule.maxValue !== null && rule.maxValue !== undefined ? String(rule.maxValue) : "";

  let condStr = "";
  if (op === "EQ" || op === "=") condStr = min ? `= ${formatVal(min)}` : "";
  else if (op === "LT" || op === "<") condStr = (max || min) ? `< ${formatVal(max || min)}` : "";
  else if (op === "LTE" || op === "<=") condStr = (max || min) ? `≤ ${formatVal(max || min)}` : "";
  else if (op === "GT" || op === ">") condStr = (min || max) ? `> ${formatVal(min || max)}` : "";
  else if (op === "GTE" || op === ">=") condStr = (min || max) ? `≥ ${formatVal(min || max)}` : "";
  else if (op === "BETWEEN") condStr = min && max ? `${formatVal(min)} – ${formatVal(max)}` : "";

  if (rule.label && rule.label.trim().length > 0) {
    const trimmed = rule.label.trim();
    if (/^[><=≥≤]/.test(trimmed) || /^\d/.test(trimmed)) {
      return condStr || trimmed;
    }
    return condStr ? `${condStr} (${trimmed})` : trimmed;
  }

  return condStr || `Kriteria (${rule.score} poin)`;
}

export async function exportIndividualAppraisal(detail: MonthlyAssessmentDetailResult) {
  const safeName = (detail.employee?.name || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Hasil_Evaluasi_KPI_${safeName}_${detail.period?.year || new Date().getFullYear()}.xlsx`;
  await exportSingleEmployeeKpiExcel(detail, fileName);
}

export interface EvaluationExportParams {
  employee: {
    name: string;
    nik: string;
    jobPosition: string;
    departmentName: string;
    templateName: string;
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
}

export async function exportEvaluationResultExcel(params: EvaluationExportParams) {
  const safeName = (params.employee.name || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Hasil_Evaluasi_KPI_${safeName}_${params.period.year}.xlsx`;
  await exportSingleEmployeeKpiExcel(params, fileName);
}
