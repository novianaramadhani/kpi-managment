import * as XLSX from "xlsx";
import {
  parseKpiExcelWorkbook,
  type IndicatorMatchingTarget,
} from "../src/lib/excel-batch-assessment";

function runTest() {
  console.log("=== UNIT TEST: EXCEL BATCH TARGET & REALIZATION LOGIC ===");

  const wb = XLSX.utils.book_new();

  // Test sheet with 4 indicators:
  // 1. Rasio Deadstock (Target 5%, Actual 4.2%)
  // 2. Nilai Stock On Hand (Target 25 M, Actual 24 M)
  // 3. Waktu Proses (Target 3 hari, Actual 2 hari)
  // 4. Target Kosong (Target empty in Col U, Actual 95%)
  const wsData = [
    ["LAPORAN PENILAIAN KINERJA TAHUN 2026"],
    ["Nama Karyawan", "Iwan Nyolo", "", "NIK", "6409"],
    ["Departemen", "Logistic", "", "Periode", "2026"],
    [],
    // Parameter 1: Rasio Deadstock
    ["", "", "", "", "", "", "", "Rasio Deadstock"],
    ["", "", "", "", "", "", "", "Type", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Realisasi", "Persentase"],
    ["", "", "", "", "", "", "", "Target", 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, ""],
    ["", "", "", "", "", "", "", "Actual", 4.2, 4.5, 4.0, 4.1, 4.3, 4.2, 4.0, 4.1, 4.2, 4.3, 4.1, 4.2, 4.2, "84%"],
    [],
    // Parameter 2: Nilai Stock On Hand
    ["", "", "", "", "", "", "", "Nilai Stock On Hand"],
    ["", "", "", "", "", "", "", "Type", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Realisasi", "Persentase"],
    ["", "", "", "", "", "", "", "Target", 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, "25 M", ""],
    ["", "", "", "", "", "", "", "Actual", 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, "24.5 M", "98%"],
    [],
    // Parameter 3: Waktu Proses
    ["", "", "", "", "", "", "", "Waktu Proses"],
    ["", "", "", "", "", "", "", "Type", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Realisasi", "Persentase"],
    ["", "", "", "", "", "", "", "Target", 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, "3 hari", ""],
    ["", "", "", "", "", "", "", "Actual", 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, "2 hari", "100%"],
    [],
    // Parameter 4: Parameter dengan Target Kosong di Col U
    ["", "", "", "", "", "", "", "Pemenuhan Kebutuhan User"],
    ["", "", "", "", "", "", "", "Type", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Realisasi", "Persentase"],
    ["", "", "", "", "", "", "", "Target", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "Actual", 95, 95, 95, 95, 95, 95, 95, 95, 95, 95, 95, 95, "96%", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Iwan Nyolo");

  const availableIndicators: IndicatorMatchingTarget[] = [
    {
      appraisalItemId: 1,
      parameterId: 196,
      name: "Rasio Deadstock",
      categoryName: "Target Kerja",
      target: "100", // Master KPI had old default "100"
      unit: "%",
      inputType: "NUMERIC",
      aggregation: "AVERAGE",
      compareBasis: "ACTUAL",
      direction: "LOWER_IS_BETTER",
      indicatorWeight: 0.15,
      parameterWeight: 0.65,
      maxScore: 25,
      scoringRules: [
        { id: 1, operator: "LT", maxValue: 6, score: 25, label: "< 6%" },
        { id: 2, operator: "BETWEEN", minValue: 6, maxValue: 95, score: 15, label: "6% - 95%" },
        { id: 3, operator: "GT", minValue: 95, score: 5, label: "> 95%" },
      ],
    },
    {
      appraisalItemId: 2,
      parameterId: 197,
      name: "Nilai Stock On Hand",
      categoryName: "Target Kerja",
      target: "100", // Master KPI had old default "100"
      unit: "M",
      inputType: "NUMERIC",
      aggregation: "AVERAGE",
      compareBasis: "ACTUAL",
      direction: "LOWER_IS_BETTER",
      indicatorWeight: 0.15,
      parameterWeight: 0.65,
      maxScore: 25,
      scoringRules: [
        { id: 4, operator: "LT", maxValue: 25, score: 25, label: "<25 M" },
        { id: 5, operator: "EQ", minValue: 25, maxValue: 25, score: 15, label: "25" },
        { id: 6, operator: "GT", minValue: 25, score: 5, label: ">25 M" },
      ],
    },
    {
      appraisalItemId: 3,
      parameterId: 198,
      name: "Waktu Proses",
      categoryName: "Target Kerja",
      target: "5",
      unit: "hari",
      inputType: "NUMERIC",
      aggregation: "AVERAGE",
      compareBasis: "ACTUAL",
      direction: "LOWER_IS_BETTER",
      indicatorWeight: 0.15,
      parameterWeight: 0.65,
      maxScore: 25,
      scoringRules: [
        { id: 7, operator: "LTE", maxValue: 3, score: 25, label: "≤ 3 hari" },
        { id: 8, operator: "GT", minValue: 3, score: 10, label: "> 3 hari" },
      ],
    },
    {
      appraisalItemId: 4,
      parameterId: 195,
      name: "Pemenuhan Kebutuhan User",
      categoryName: "Target Kerja",
      target: "95",
      unit: "%",
      inputType: "NUMERIC",
      aggregation: "AVERAGE",
      compareBasis: "ACTUAL",
      direction: "HIGHER_IS_BETTER",
      indicatorWeight: 0.20,
      parameterWeight: 0.65,
      maxScore: 25,
      scoringRules: [
        { id: 9, operator: "GT", minValue: 95, score: 15, label: "> 95%" },
        { id: 10, operator: "EQ", minValue: 95, maxValue: 95, score: 5, label: "= 95%" },
        { id: 11, operator: "LT", maxValue: 95, score: 10, label: "< 95%" },
      ],
    },
  ];

  const result = parseKpiExcelWorkbook(wb, availableIndicators, "test_upload.xlsx", {
    nik: "6409",
    name: "Iwan Nyolo",
    department: "Logistic",
    periodYear: 2026,
  });

  console.log("Total sheets:", result.totalSheets);
  const sheet = result.sheets[0];
  console.log("Sheet name:", sheet.sheetName);
  console.log("Employee match:", sheet.employeeInfo.isCurrentEmployeeMatch);
  console.log("Total items:", sheet.items.length);

  for (const it of sheet.items) {
    console.log("\n------------------------------------------------");
    console.log(`Param: ${it.rawTitle} (Row ${it.excelRowNumber})`);
    console.log(`Matched with: ${it.matchedIndicator?.name} (Type: ${it.matchType})`);
    console.log(`Excel Annual Target: ${it.excelAnnualTarget}`);
    console.log(`Effective Target: ${it.effectiveTarget}`);
    console.log(`Target Display: ${it.targetDisplay}`);
    console.log(`Excel Annual Actual: ${it.excelAnnualActual}`);
    console.log(`Effective Realization: ${it.effectiveRealization}`);
    console.log(`Realization Display: ${it.realizationDisplay}`);
    console.log(`Score: ${it.score} (Band: ${it.bandLabel})`);
    console.log(`Final Weighted Score: ${it.weightedScoreDisplay}`);
    console.log(`Warnings: ${it.warningNotes.join("; ") || "None"}`);

    if (it.rawTitle === "Rasio Deadstock") {
      // Must NOT be 100 (Master target was 100), MUST be 5 from Excel
      if (it.effectiveTarget === 5 && it.targetDisplay === "5%") {
        console.log(">>> [PASS] Rasio Deadstock target reads 5% from Excel, NOT 100%!");
      } else {
        console.error(">>> [FAIL] Rasio Deadstock target failed!");
      }
    }

    if (it.rawTitle === "Nilai Stock On Hand") {
      // Must be 25 M from Excel
      if (it.effectiveTarget === 25 && it.targetDisplay === "25 M") {
        console.log(">>> [PASS] Nilai SOH target reads 25 M directly from Excel!");
      } else {
        console.error(">>> [FAIL] Nilai SOH target failed!");
      }
    }

    if (it.rawTitle === "Waktu Proses") {
      // Must be 3 hari from Excel
      if (it.effectiveTarget === 3 && it.targetDisplay === "3 hari") {
        console.log(">>> [PASS] Waktu Proses target reads 3 hari directly from Excel!");
      } else {
        console.error(">>> [FAIL] Waktu Proses target failed!");
      }
    }

    if (it.rawTitle === "Pemenuhan Kebutuhan User") {
      // Must be null, NOT default 100%, and have warning
      if (it.effectiveTarget === null && it.warningNotes.some(w => w.includes("Target pada Excel kosong"))) {
        console.log(">>> [PASS] Empty target in Excel correctly remains null and has warning!");
      } else {
        console.error(">>> [FAIL] Empty target failed!");
      }
    }
  }
}

runTest();
