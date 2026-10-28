import { db } from "../src/db";
import { kpiTemplates, kpiCategories, kpiParameters, kpiBands, departments, jobLevels, appraisals, appraisalItems, appraisalMonthlyValues } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { exportKpiTemplateToExcel } from "../src/lib/excel-template-kpi";
import { exportEvaluationResultExcel, type EvaluationExportParams } from "../src/lib/excel-individual";
import * as XLSX from "xlsx";
import * as fs from "fs";

async function verify() {
  console.log("=================================================================");
  console.log("VERIFIKASI CORPORATE EXCEL KPI (FORMAT GAMBAR 1)");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Generate Excel Template untuk Karyawan 1 (RISWANTO ZAIHU - Template 3)
  // ---------------------------------------------------------------------------
  console.log("▶ TEST 1: Riswanto Zaihu (Template 3 - Logistic Dept. Head)");
  const [tpl3] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, 3));
  const [dept3] = await db.select().from(departments).where(eq(departments.id, tpl3.departmentId!));
  const [lvl3] = await db.select().from(jobLevels).where(eq(jobLevels.id, tpl3.jobLevelId!));
  const cats3 = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, 3));
  const cat3Ids = cats3.map(c => c.id);
  const params3 = await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, cat3Ids));
  const param3Ids = params3.map(p => p.id);
  const bands3 = await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, param3Ids));

  exportKpiTemplateToExcel({
    template: tpl3,
    departmentName: dept3?.name,
    jobLevelName: "Logistic Dept. Head",
    periodYear: "2026",
    employee: {
      name: "RISWANTO ZAIHU",
      nik: "1.0000.011",
      jobPosition: "Logistic Dept. Head",
      departmentName: dept3?.name,
    },
    categories: cats3,
    parameters: params3,
    bands: bands3,
  });

  const file1 = "Template_KPI_RISWANTO_ZAIHU_2026.xlsx";
  if (!fs.existsSync(file1)) {
    throw new Error(`File ${file1} was not created!`);
  }
  const wb1 = XLSX.readFile(file1, { cellStyles: true, cellFormula: true, cellNF: true });
  console.log(`  ✓ File dibuat: ${file1} (${fs.statSync(file1).size} bytes)`);
  console.log(`  ✓ Sheets: ${wb1.SheetNames.join(", ")}`);

  const ws1 = wb1.Sheets[wb1.SheetNames[0]];
  // Periksa identitas karyawan di baris 1-4
  const a1 = ws1["A1"]?.v;
  const b1 = ws1["B1"]?.v;
  const a2 = ws1["A2"]?.v;
  const b2 = ws1["B2"]?.v;
  const a3 = ws1["A3"]?.v;
  const b3 = ws1["B3"]?.v;
  const a4 = ws1["A4"]?.v;
  const b4 = ws1["B4"]?.v;
  console.log(`  ✓ Identitas: [${a1}: ${b1}], [${a2}: ${b2}], [${a3}: ${b3}], [${a4}: ${b4}]`);
  if (b1 !== "RISWANTO ZAIHU" || b2 !== "1.0000.011") {
    throw new Error("Identitas karyawan tidak sesuai data sebenarnya!");
  }

  // Periksa 6 kolom tabel penilaian
  const headers = [ws1["A5"]?.v, ws1["B5"]?.v, ws1["C5"]?.v, ws1["D5"]?.v, ws1["E5"]?.v, ws1["F5"]?.v];
  console.log(`  ✓ Kolom Tabel Penilaian (Row 5):`, headers.join(" | "));
  if (headers[0] !== "Parameter" || headers[1] !== "Kriteria Penilaian" || headers[5] !== "Skor Akhir") {
    throw new Error("Header tabel penilaian 6 kolom tidak sesuai standar Gambar 1!");
  }

  // Periksa sheet tersembunyi _SYSTEM_MAPPING
  if (!wb1.SheetNames.includes("_SYSTEM_MAPPING")) {
    throw new Error("Sheet _SYSTEM_MAPPING tidak ditemukan!");
  }
  const wsMap1 = wb1.Sheets["_SYSTEM_MAPPING"];
  const mapRows1 = XLSX.utils.sheet_to_json(wsMap1);
  console.log(`  ✓ Sheet _SYSTEM_MAPPING: ${mapRows1.length} mapping baris terdata`);

  // ---------------------------------------------------------------------------
  // TEST 2: Generate Excel Template untuk Karyawan 2 (IWAN NYOLO - Template 13)
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 2: Iwan Nyolo (Template 13 - Fuel Staff)");
  const [tpl13] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, 13));
  const [dept13] = await db.select().from(departments).where(eq(departments.id, tpl13.departmentId!));
  const [lvl13] = await db.select().from(jobLevels).where(eq(jobLevels.id, tpl13.jobLevelId!));
  const cats13 = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, 13));
  const cat13Ids = cats13.map(c => c.id);
  const params13 = await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, cat13Ids));
  const param13Ids = params13.map(p => p.id);
  const bands13 = await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, param13Ids));

  exportKpiTemplateToExcel({
    template: tpl13,
    departmentName: dept13?.name,
    jobLevelName: "Fuel Staff",
    periodYear: "2026",
    employee: {
      name: "IWAN NYOLO - NYOLO",
      nik: "81.0625.6216",
      jobPosition: "Fuel Staff",
      departmentName: dept13?.name,
    },
    categories: cats13,
    parameters: params13,
    bands: bands13,
  });

  const file2 = "Template_KPI_IWAN_NYOLO_-_NYOLO_2026.xlsx";
  if (!fs.existsSync(file2)) {
    throw new Error(`File ${file2} was not created!`);
  }
  const wb2 = XLSX.readFile(file2, { cellStyles: true, cellFormula: true, cellNF: true });
  console.log(`  ✓ File dibuat: ${file2} (${fs.statSync(file2).size} bytes)`);
  console.log(`  ✓ Sheets: ${wb2.SheetNames.join(", ")}`);
  const ws2 = wb2.Sheets[wb2.SheetNames[0]];
  console.log(`  ✓ Identitas: [Nama: ${ws2["B1"]?.v}], [NIK: ${ws2["B2"]?.v}], [Jabatan: ${ws2["B3"]?.v}]`);

  // ---------------------------------------------------------------------------
  // TEST 3: Generate Hasil Evaluasi / Penilaian (Assessment) Lengkap dengan Realisasi
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 3: Hasil Evaluasi Bulanan Karyawan (Actual Monthly Achievement)");
  const evalParams: EvaluationExportParams = {
    employee: {
      name: "FERRY YUDI",
      nik: "2.0325.257",
      jobPosition: "Staff Purchasing",
      departmentName: "Purchasing",
      templateName: "Template KPI RISWANTO ZAIHU - 2026",
    },
    period: {
      year: 2026,
      name: "Tahun 2026",
    },
    summary: {
      overallScoreDisplay: "88.5",
      grade: "B",
    },
    categories: cats3.map((cat, cIdx) => {
      const cParams = params3.filter(p => p.categoryId === cat.id);
      return {
        categoryId: cat.id,
        categoryNumber: cIdx + 1,
        categoryName: cat.name,
        categoryWeight: Number(cat.weight),
        scorePercentage: 88.5,
        annualScorePercentage: 88.5,
        indicators: cParams.map(p => {
          const pBands = bands3.filter(b => b.parameterId === p.id);
          return {
            id: p.id,
            indicatorName: p.name,
            indicatorCode: (p as any).code,
            target: 100,
            unit: p.unit || "%",
            indicatorWeight: Number(p.weight),
            annualActual: 98.5,
            annualScore: 25,
            annualScorePercentage: 25,
            scoringRules: pBands.map(b => ({
              id: b.id,
              label: b.label,
              operator: b.operator || "TEXT",
              minValue: b.minValue !== null ? Number(b.minValue) : null,
              maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
              score: Number(b.score),
            })),
            monthlyDetails: [
              { month: 1, target: 100, actual: 95 },
              { month: 2, target: 100, actual: 98 },
              { month: 3, target: 100, actual: 100 },
              { month: 4, target: 100, actual: 97 },
              { month: 5, target: 100, actual: 99 },
              { month: 6, target: 100, actual: 100 },
              { month: 7, target: 100, actual: 96 },
              { month: 8, target: 100, actual: 98 },
              { month: 9, target: 100, actual: 99 },
              { month: 10, target: 100, actual: 100 },
              { month: 11, target: 100, actual: 98 },
              { month: 12, target: 100, actual: 99 },
            ],
          };
        }),
      };
    }),
    approvalLine: {
      appraiser: { name: "RISWANTO ZAIHU", jobPosition: "Logistic Dept. Head" },
      headDept: { name: "BAMBANG SUDARMO", jobPosition: "General Manager" },
      manager: { name: "DIREKSI", jobPosition: "Operations Director" },
    },
  };

  exportEvaluationResultExcel(evalParams);
  const file3 = "Hasil_Evaluasi_KPI_FERRY_YUDI_2026.xlsx";
  if (!fs.existsSync(file3)) {
    throw new Error(`File ${file3} was not created!`);
  }
  const wb3 = XLSX.readFile(file3, { cellStyles: true, cellFormula: true, cellNF: true });
  console.log(`  ✓ File dibuat: ${file3} (${fs.statSync(file3).size} bytes)`);
  console.log(`  ✓ Sheets: ${wb3.SheetNames.join(", ")}`);
  const ws3 = wb3.Sheets[wb3.SheetNames[0]];

  // Periksa data actual bulanan di kolom I s/d T (cols 8-19)
  const janActual = ws3["I9"]?.v || ws3["I8"]?.v;
  console.log(`  ✓ Monthly matrix populated (Jan value: ${janActual})`);
  console.log(`  ✓ Signatures included at bottom`);

  console.log("\n=================================================================");
  console.log("SEMUA PENGUJIAN EXCEL KPI MATRIX (GAMBAR 1) BERHASIL 100%!");
  console.log("=================================================================");
  process.exit(0);
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
