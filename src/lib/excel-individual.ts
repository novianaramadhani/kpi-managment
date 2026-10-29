import * as XLSX from "xlsx";
import type { MonthlyAssessmentDetailResult, GenericScoringRule } from "@/types/monthly-assessment";
import { convertEvaluationToMatrixData, exportCorporateKpiMatrixExcel } from "./excel-kpi-matrix";

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

export function exportIndividualAppraisal(detail: MonthlyAssessmentDetailResult) {
  const wb = XLSX.utils.book_new();

  // ==========================================
  // SHEET 1: Summary KPI
  // Ringkas: Parameter, Indikator, Target, Realisasi, Skor, Bobot, Skor Akhir
  // ==========================================
  const summaryRows: any[][] = [];

  // 1. Header Information
  summaryRows.push(["REKAPITULASI HASIL PENILAIAN KPI (SUMMARY)"]);
  summaryRows.push(["Nama Karyawan", detail.employee.name]);
  summaryRows.push(["NIK", detail.employee.nik]);
  summaryRows.push(["Departemen", detail.employee.departmentName]);
  summaryRows.push(["Jabatan", detail.employee.jobPosition]);
  summaryRows.push(["Master Template", detail.employee.templateName || detail.templateName || "-"]);
  summaryRows.push(["Periode", `${detail.period.name} (${detail.period.year})`]);
  summaryRows.push(["Total Skor Akhir", detail.summary.overallScoreDisplay]);
  summaryRows.push(["Grade", detail.summary.grade]);
  summaryRows.push([]);

  // 2. Table Headers
  const summaryHeaders = [
    "Parameter",
    "Indikator",
    "Target",
    "Realisasi",
    "Skor",
    "Bobot",
    "Skor Akhir",
  ];
  summaryRows.push(summaryHeaders);

  // 3. Table Data (Parameter as Group/Header)
  for (const cat of detail.categories) {
    const isTargetKerja =
      cat.categoryNumber === 1 ||
      cat.categoryName.toLowerCase().includes("target kerja");

    if (isTargetKerja) {
      // Parameter Header Row
      summaryRows.push([
        cat.categoryName,
        "",
        "",
        "",
        "",
        `${Math.round(cat.categoryWeight * 100)}%`,
        `${(cat.scorePercentage ?? 0).toFixed(1)}%`,
      ]);

      // Indicator Rows (Sub-parameters)
      for (const ind of cat.indicators) {
        const targetStr =
          ind.target !== null && ind.target !== undefined
            ? ind.unit
              ? `${ind.target} ${ind.unit}`
              : String(ind.target)
            : "-";

        const actualStr =
          ind.annualActual !== null && ind.annualActual !== undefined
            ? ind.unit
              ? `${ind.annualActual} ${ind.unit}`
              : String(ind.annualActual)
            : "-";

        const scoreVal =
          ind.annualScore !== null && ind.annualScore !== undefined
            ? ind.annualScore
            : ind.score ?? "-";

        const weightStr = `${Math.round(ind.indicatorWeight * 100)}%`;
        const finalScoreStr = ind.finalScoreDisplay || `${(ind.finalScorePercentage ?? 0).toFixed(1)}%`;

        summaryRows.push([
          "",
          ind.indicatorName,
          targetStr,
          actualStr,
          scoreVal,
          weightStr,
          finalScoreStr,
        ]);
      }
    } else {
      // General Parameter: 1 baris untuk masing-masing parameter utama, tanpa baris turunan
      const ind = cat.indicators[0];
      const targetStr =
        ind?.target !== null && ind?.target !== undefined
          ? ind.unit
            ? `${ind.target} ${ind.unit}`
            : String(ind.target)
          : "-";

      const actualStr =
        ind?.annualActual !== null && ind?.annualActual !== undefined
          ? ind.unit
            ? `${ind.annualActual} ${ind.unit}`
            : String(ind.annualActual)
          : "-";

      const scoreVal =
        ind?.annualScore !== null && ind?.annualScore !== undefined
          ? ind.annualScore
          : ind?.score ?? "-";

      summaryRows.push([
        cat.categoryName,
        "",
        targetStr,
        actualStr,
        scoreVal,
        `${Math.round(cat.categoryWeight * 100)}%`,
        `${(cat.scorePercentage ?? 0).toFixed(1)}%`,
      ]);
    }
  }

  // Summary Total Row
  summaryRows.push([]);
  summaryRows.push([
    "TOTAL HASIL PENILAIAN AKHIR KPI",
    "",
    "",
    "",
    `Grade ${detail.summary.grade}`,
    "100%",
    detail.summary.overallScoreDisplay,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 28 }, // Parameter
    { wch: 38 }, // Indikator
    { wch: 16 }, // Target
    { wch: 16 }, // Realisasi
    { wch: 12 }, // Skor
    { wch: 14 }, // Bobot
    { wch: 16 }, // Skor Akhir
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary KPI");

  // ==========================================
  // SHEET 2: Kriteria Penilaian
  // Detail scoring rules untuk seluruh indikator
  // ==========================================
  const kriteriaRows: any[][] = [];
  kriteriaRows.push(["DETAIL KRITERIA PENILAIAN (SCORING RULES)"]);
  kriteriaRows.push(["Nama Karyawan", detail.employee.name]);
  kriteriaRows.push(["Master Template", detail.employee.templateName || detail.templateName || "-"]);
  kriteriaRows.push(["Periode", `${detail.period.name} (${detail.period.year})`]);
  kriteriaRows.push([]);

  const kriteriaHeaders = [
    "No",
    "Parameter",
    "Indikator",
    "Kondisi / Batasan Nilai",
    "Skor Poin",
    "Keterangan / Predikat",
    "Realisasi Karyawan",
    "Status Terpenuhi",
  ];
  kriteriaRows.push(kriteriaHeaders);

  let ruleIndex = 1;
  for (const cat of detail.categories) {
    for (const ind of cat.indicators) {
      const actualStr =
        ind.annualActual !== null && ind.annualActual !== undefined
          ? ind.unit
            ? `${ind.annualActual} ${ind.unit}`
            : String(ind.annualActual)
          : "-";

      if (ind.scoringRules && ind.scoringRules.length > 0) {
        for (const rule of ind.scoringRules) {
          const isMatched =
            ind.annualScore !== null &&
            ind.annualScore !== undefined &&
            Number(rule.score) === Number(ind.annualScore);

          kriteriaRows.push([
            ruleIndex++,
            cat.categoryName,
            ind.indicatorName,
            formatRuleLabel(rule, ind.unit),
            rule.score,
            rule.label || "-",
            actualStr,
            isMatched ? "TERPENUHI (AKTIF)" : "",
          ]);
        }
      } else {
        kriteriaRows.push([
          ruleIndex++,
          cat.categoryName,
          ind.indicatorName,
          "Standar Evaluasi",
          25,
          "-",
          actualStr,
          "",
        ]);
      }
    }
  }

  const wsKriteria = XLSX.utils.aoa_to_sheet(kriteriaRows);
  wsKriteria["!cols"] = [
    { wch: 6 },  // No
    { wch: 25 }, // Parameter
    { wch: 36 }, // Indikator
    { wch: 28 }, // Kondisi / Batasan Nilai
    { wch: 12 }, // Skor Poin
    { wch: 25 }, // Keterangan / Predikat
    { wch: 18 }, // Realisasi Karyawan
    { wch: 20 }, // Status Terpenuhi
  ];
  XLSX.utils.book_append_sheet(wb, wsKriteria, "Kriteria Penilaian");

  // Generate File
  XLSX.writeFile(wb, `Appraisal_${detail.employee.nik}_${detail.period.year}.xlsx`);
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

export function exportEvaluationResultExcel(params: EvaluationExportParams) {
  const matrixData = convertEvaluationToMatrixData(params);
  const safeName = (params.employee.name || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Hasil_Evaluasi_KPI_${safeName}_${params.period.year}.xlsx`;
  exportCorporateKpiMatrixExcel(matrixData, fileName);
}
