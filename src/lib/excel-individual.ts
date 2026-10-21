import * as XLSX from "xlsx";
import type { MonthlyAssessmentDetailResult, GenericScoringRule } from "@/types/monthly-assessment";

function formatRuleLabel(rule: GenericScoringRule, unit?: string | null): string {
  const u = (unit || "").trim();
  const formatVal = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    const str = String(v).replace(/\.0000$/, "").replace(/\.00$/, "");
    if (u === "%") return `${str}%`;
    if (u.toLowerCase() === "rp") {
      const num = Number(str);
      return !isNaN(num) ? `Rp ${num.toLocaleString("id-ID")}` : `Rp ${str}`;
    }
    if (u) return `${str} ${u}`;
    return str;
  };

  const min = rule.minValue !== null && rule.minValue !== undefined ? String(rule.minValue) : "";
  const max = rule.maxValue !== null && rule.maxValue !== undefined ? String(rule.maxValue) : "";
  const op = (rule.operator || "").toUpperCase();

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
  const wb = XLSX.utils.book_new();
  const { employee, period, summary, categories, approvalLine } = params;

  const normalizeWeight = (w: number | string | null | undefined): number => {
    if (w === null || w === undefined) return 0;
    const numVal = typeof w === "number" ? w : parseFloat(String(w).replace(/,/g, "."));
    if (isNaN(numVal)) return 0;
    return numVal > 1 ? numVal / 100 : numVal;
  };

  // SHEET 1: Rekap Hasil KPI
  const summaryRows: any[][] = [];
  summaryRows.push(["FORMULIR HASIL EVALUASI KINERJA (KPI)"]);
  summaryRows.push([`Rekapitulasi lengkap capaian indikator dan perhitungan skor akhir tahun ${period.year}`]);
  summaryRows.push([]);
  summaryRows.push(["Nama Karyawan", employee.name, "", "", "Posisi / Jabatan", employee.jobPosition]);
  summaryRows.push(["NIK", employee.nik, "", "", "Departemen", employee.departmentName]);
  summaryRows.push(["Master Template", employee.templateName, "", "", "Periode", `Tahun ${period.year}`]);

  // Row 7 (index 6): placeholder for top summary score and grade (will reference total row)
  const overallFrac = (parseFloat(summary.overallScoreDisplay) || 0) / 100;
  summaryRows.push([
    "Total Skor Akhir",
    { t: "n", v: overallFrac, z: "0.0%" },
    "",
    "",
    "Grade",
    { t: "s", v: `Grade ${summary.grade}` },
  ]);
  summaryRows.push([]); // Row 8 (index 7)

  // Row 9 (index 8): Table Headers (dengan kolom terpisah: Realisasi Aktual & Skor pt)
  summaryRows.push([
    "Kode",
    "Parameter / Indikator KPI",
    "Target",
    "Realisasi Aktual",
    "Skor (pt)",
    "Bobot",
    "Skor Akhir",
  ]);

  let currentRowNumber = 10;
  const categorySubtotalRowNumbers: number[] = [];

  for (const cat of categories) {
    const isTargetKerja =
      cat.categoryNumber === 1 ||
      cat.categoryName.toLowerCase().includes("target kerja");

    const catWeightFrac = normalizeWeight(cat.categoryWeight);
    const catPrecalcFraction = (cat.annualScorePercentage ?? cat.scorePercentage ?? 0) / 100;

    if (isTargetKerja) {
      // 1. Target Kerja: Struktur Parameter Utama -> Sub-Parameter
      const catRowNumber = currentRowNumber;
      categorySubtotalRowNumbers.push(catRowNumber);
      currentRowNumber++;

      const firstIndRow = currentRowNumber;
      const lastIndRow = firstIndRow + cat.indicators.length - 1;
      const catSubtotalFormula = cat.indicators.length > 0 ? `SUM(G${firstIndRow}:G${lastIndRow})` : "0";

      // Push Category Header Row
      summaryRows.push([
        String(cat.categoryNumber),
        cat.categoryName.toUpperCase(),
        "-",
        "-",
        "-",
        { t: "n", v: catWeightFrac, z: "0.0%" },
        { t: "n", f: catSubtotalFormula, v: catPrecalcFraction, z: "0.0%" },
      ]);

      // Push Sub-Parameters (Menampilkan Bobot Internal)
      for (let pIdx = 0; pIdx < cat.indicators.length; pIdx++) {
        const ind = cat.indicators[pIdx];
        const indRowNumber = currentRowNumber;
        currentRowNumber++;

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

        const scoreNum = Number(ind.annualScore ?? ind.score ?? 0);
        const indWeightFrac = normalizeWeight(ind.indicatorWeight);
        const precalcScoreFrac = (scoreNum / 25) * indWeightFrac * catWeightFrac;
        const codeStr = ind.indicatorCode || `1.${pIdx + 1}`;

        summaryRows.push([
          codeStr,
          ind.indicatorName,
          targetStr,
          actualStr,
          { t: "n", v: scoreNum, z: "0" },
          { t: "n", v: indWeightFrac, z: "0.0%" },
          {
            t: "n",
            f: `IF(E${indRowNumber}>0,(E${indRowNumber}/25)*F${indRowNumber}*$F$${catRowNumber},0)`,
            v: precalcScoreFrac,
            z: "0.0%",
          },
        ]);
      }
    } else {
      // 2. Parameter General (Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement):
      // Satu baris untuk masing-masing parameter utama, tanpa baris turunan (2.1, 3.1, dsb.)
      // Langsung menggunakan Bobot Utama (tidak menampilkan Bobot Internal).
      const ind = cat.indicators[0];
      const catRowNumber = currentRowNumber;
      categorySubtotalRowNumbers.push(catRowNumber);
      currentRowNumber++;

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

      const scoreNum = Number(ind?.annualScore ?? ind?.score ?? 0);
      const precalcScoreFrac = (scoreNum / 25) * catWeightFrac;

      summaryRows.push([
        String(cat.categoryNumber),
        cat.categoryName,
        targetStr,
        actualStr,
        { t: "n", v: scoreNum, z: "0" },
        { t: "n", v: catWeightFrac, z: "0.0%" },
        {
          t: "n",
          f: `IF(E${catRowNumber}>0,(E${catRowNumber}/25)*F${catRowNumber},0)`,
          v: precalcScoreFrac,
          z: "0.0%",
        },
      ]);
    }
  }

  // Row Blank before total
  summaryRows.push([]);
  currentRowNumber++;

  const totalRowNumber = currentRowNumber;
  const gradeFormula = `IF(G${totalRowNumber}>=0.9,"Grade A",IF(G${totalRowNumber}>=0.8,"Grade B",IF(G${totalRowNumber}>=0.7,"Grade C",IF(G${totalRowNumber}>=0.6,"Grade D","Grade E"))))`;
  const totalWeightFormula = `SUM(${categorySubtotalRowNumbers.map((r) => `F${r}`).join(",")})`;
  const totalScoreFormula = `SUM(${categorySubtotalRowNumbers.map((r) => `G${r}`).join(",")})`;

  summaryRows.push([
    "TOTAL",
    "TOTAL HASIL PENILAIAN AKHIR KPI",
    "",
    { t: "s", f: gradeFormula, v: `Grade ${summary.grade}` },
    "",
    { t: "n", f: totalWeightFormula, v: 1.0, z: "0.0%" },
    { t: "n", f: totalScoreFormula, v: overallFrac, z: "0.0%" },
  ]);

  // Update Top Row 7 (index 6) to dynamically reference totalRowNumber
  summaryRows[6][1] = { t: "n", f: `G${totalRowNumber}`, v: overallFrac, z: "0.0%" };
  summaryRows[6][5] = { t: "s", f: `D${totalRowNumber}`, v: `Grade ${summary.grade}` };

  // Signatures
  summaryRows.push([]);
  summaryRows.push([]);
  summaryRows.push([
    "Karyawan Yang Dinilai",
    "",
    "Penilai (Supervisor)",
    "",
    "Head Department",
    "",
    "Manager Divisi",
  ]);
  summaryRows.push([]);
  summaryRows.push([]);
  summaryRows.push([
    employee.name || "-",
    "",
    approvalLine?.appraiser?.name || "Atasan Langsung",
    "",
    approvalLine?.headDept?.name || "Head Department",
    "",
    approvalLine?.manager?.name || "Manager",
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 10 }, // Kode
    { wch: 44 }, // Indikator
    { wch: 14 }, // Target
    { wch: 18 }, // Realisasi Aktual
    { wch: 12 }, // Skor (pt)
    { wch: 14 }, // Bobot
    { wch: 16 }, // Skor Akhir
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Rekap Hasil KPI");

  // SHEET 2: Rekap 12 Bulan dengan Formula Agregasi Dinamis
  const monthlyRows: any[][] = [];
  monthlyRows.push(["REKAPITULASI CAPAIAN BULANAN (12 BULAN)"]);
  monthlyRows.push(["Nama Karyawan", employee.name, "", "Tahun", String(period.year)]);
  monthlyRows.push([]);

  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  monthlyRows.push([
    "Kode",
    "Indikator KPI",
    "Target",
    ...SHORT_MONTHS,
    "Capaian Akhir (Rata-rata/Total)",
  ]);

  let currentMonthlyRow = 5;
  for (const cat of categories) {
    for (const ind of cat.indicators) {
      const mRow = currentMonthlyRow;
      currentMonthlyRow++;

      const targetStr =
        ind.target !== null && ind.target !== undefined
          ? ind.unit
            ? `${ind.target} ${ind.unit}`
            : String(ind.target)
          : "-";

      const mValues = SHORT_MONTHS.map((_, idx) => {
        const mDetail = (ind.monthlyDetails || []).find((m: any) => m.month === idx + 1);
        if (mDetail?.actual !== null && mDetail?.actual !== undefined) {
          return { t: "n", v: Number(mDetail.actual) };
        }
        return "-";
      });

      const aggType = String(ind.aggregation || "AVERAGE").toUpperCase();
      let formulaStr = `AVERAGE(D${mRow}:O${mRow})`;
      if (aggType === "SUM") {
        formulaStr = `SUM(D${mRow}:O${mRow})`;
      } else if (aggType === "MAX") {
        formulaStr = `MAX(D${mRow}:O${mRow})`;
      } else if (aggType === "MIN") {
        formulaStr = `MIN(D${mRow}:O${mRow})`;
      }

      const precalcAnnual =
        ind.annualActual !== null && ind.annualActual !== undefined ? Number(ind.annualActual) : 0;

      monthlyRows.push([
        ind.indicatorCode,
        ind.indicatorName,
        targetStr,
        ...mValues,
        { t: "n", f: formulaStr, v: precalcAnnual },
      ]);
    }
  }

  const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyRows);
  wsMonthly["!cols"] = [
    { wch: 10 },
    { wch: 38 },
    { wch: 14 },
    ...SHORT_MONTHS.map(() => ({ wch: 10 })),
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMonthly, "Rekap Bulanan");

  const safeName = (employee.name || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Hasil_Evaluasi_KPI_${safeName}_${period.year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
