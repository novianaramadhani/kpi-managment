import { db } from "../src/db";
import { kpiTemplates, kpiCategories, kpiParameters, kpiBands, employees, departments, jobLevels } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import * as XLSXStyle from "xlsx-js-style";
import {
  buildCorporateKpiMatrixWorksheet,
  saveStyledWorkbook,
  type KpiMatrixSheetData,
  type KpiMatrixCategory,
  type KpiMatrixIndicator,
} from "../src/lib/excel-kpi-matrix";
import * as fs from "fs";

async function run() {
  console.log("=== Testing Corporate KPI Matrix Excel Generation (Gambar 1) ===");

  // Test for Template 3: RISWANTO ZAIHU (Purchasing / Logistic Dept Head)
  // and Template 13: IWAN NYOLO (Logistic / Staff)
  const templateIds = [3, 13];

  for (const tid of templateIds) {
    const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, tid));
    if (!tpl) {
      console.error(`Template ${tid} not found`);
      continue;
    }

    const [dept] = tpl.departmentId
      ? await db.select().from(departments).where(eq(departments.id, tpl.departmentId))
      : [null];
    const [level] = tpl.jobLevelId
      ? await db.select().from(jobLevels).where(eq(jobLevels.id, tpl.jobLevelId))
      : [null];

    const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, tid));
    const catIds = cats.map((c) => c.id);

    const params = catIds.length > 0
      ? await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, catIds))
      : [];
    const paramIds = params.map((p) => p.id);

    const bands = paramIds.length > 0
      ? await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramIds))
      : [];

    console.log(`\nTemplate #${tpl.id}: "${tpl.name}"`);
    console.log(`- Dept: ${dept?.name || "-"}, Level: ${level?.name || "-"}`);
    console.log(`- Categories: ${cats.length}, Parameters: ${params.length}, Bands: ${bands.length}`);

    // Map to KpiMatrixSheetData
    const matrixCategories: KpiMatrixCategory[] = cats
      .sort((a, b) => a.id - b.id)
      .map((cat, catIdx) => {
        const cParams = params.filter((p) => p.categoryId === cat.id);
        const indicators: KpiMatrixIndicator[] = cParams.map((p) => {
          const pBands = bands
            .filter((b) => b.parameterId === p.id)
            .sort((a, b) => (Number(b.score) || 0) < (Number(a.score) || 0) ? 1 : -1);

          return {
            code: (p as any).code || undefined,
            name: p.name,
            target: p.target || "100",
            unit: p.unit || "%",
            weight: Number(p.weight) || 1,
            realization: null,
            score: null,
            scoringRules: pBands.map((b) => ({
              label: b.label,
              operator: b.operator || "TEXT",
              minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
              maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
              score: Number(b.score) || 0,
            })),
            monthlyTargets: Array(12).fill(Number(p.target) || 100),
            monthlyActuals: Array(12).fill(null),
          };
        });

        return {
          number: catIdx + 1,
          name: cat.name,
          weight: Number(cat.weight) || 0,
          indicators,
        };
      });

    // Extract employee identity
    let empName = tpl.name.replace(/^Template KPI\s*/i, "").replace(/\s*-\s*\d{4}$/, "").trim();
    let empNik = "1.0000.011";
    let empJob = level?.name || "Staff";
    if (tid === 3) {
      empName = "RISWANTO ZAIHU";
      empNik = "1.0000.011";
      empJob = "Logistic Dept. Head";
    } else if (tid === 13) {
      empName = "IWAN NYOLO";
      empNik = "81.0625.6216";
      empJob = "Fuel Staff";
    }

    const sheetData: KpiMatrixSheetData = {
      employee: {
        name: empName,
        nik: empNik,
        jobPosition: empJob,
        departmentName: dept?.name || "Purchasing",
      },
      periodYear: 2026,
      totalTargetWeight: Number(tpl.totalWeight) || 1.15,
      categories: matrixCategories,
    };

    const wb = XLSXStyle.utils.book_new();
    const ws = buildCorporateKpiMatrixWorksheet(sheetData);
    XLSXStyle.utils.book_append_sheet(wb, ws, empName.slice(0, 25));

    // Save to disk
    const outFilename = `test_kpi_matrix_${empName.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
    XLSXStyle.writeFile(wb, outFilename);
    console.log(`✓ Successfully generated: ${outFilename} (${fs.statSync(outFilename).size} bytes)`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
