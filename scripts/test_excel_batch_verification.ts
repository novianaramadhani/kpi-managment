import {
  sanitizeNumericCell,
  parseKpiExcelMatrix,
  generateBatchPreview,
  IndicatorMatchingTarget,
} from "../src/lib/excel-batch-assessment";
import { calculateKpiScore } from "../src/lib/scoring";

console.log("=== 1. TEST SANITIZE NUMERIC CELL ===");
const testCases: [unknown, number | null][] = [
  ["1:2", 0.5],
  ["Rp 25.000.000", 25000000],
  ["24.96 Miliar", 24.96],
  ["25 M", 25],
  ["10 Jt", 10],
  ["3 hari", 3],
  ["<3 hari", 3],
  [">4 Hari", 4],
  ["91.45%", 91.45],
  ["100%", 100],
  ["25.000.000,50", 25000000.5],
  [0, 0],
  ["0", 0],
  ["", null],
  [null, null],
  [undefined, null],
  ["#DIV/0!", null],
  ["#N/A", null],
];

let allPassed = true;
for (const [input, expected] of testCases) {
  const actual = sanitizeNumericCell(input);
  const pass = actual === expected;
  if (!pass) {
    console.error(`FAIL: input="${input}", expected=${expected}, got=${actual}`);
    allPassed = false;
  }
}
if (allPassed) console.log("✓ All sanitizeNumericCell test cases PASSED!");

console.log("\n=== 2. TEST PARSE KPI EXCEL MATRIX (Kolom H, I-T, U) ===");
// Matrix simulating Excel rows:
// Column H = index 7
// Column I..T = index 8..19
// Column U = index 20 (Realisasi)
// Row 0: Header / blank
// Row 1: Parameter Title in Col H: "Pencapaian Revenue"
// Row 2: "Type" in Col H, month names Jan-Dec in Col I-T, "Realisasi" in Col U
// Row 3: "Target" in Col H, monthly targets in Col I-T, annual target 25 M in Col U
// Row 4: "Actual" in Col H, monthly actuals in Col I-T, annual actual 24.96 M in Col U
const mockMatrix: unknown[][] = [];
mockMatrix[0] = new Array(25).fill(null);

// Row 1: Judul
mockMatrix[1] = new Array(25).fill(null);
mockMatrix[1][7] = "Pencapaian Revenue";

// Row 2: Type
mockMatrix[2] = new Array(25).fill(null);
mockMatrix[2][7] = "Type";
for (let m = 1; m <= 12; m++) {
  mockMatrix[2][7 + m] = `Bulan ${m}`;
}
mockMatrix[2][20] = "Realisasi";

// Row 3: Target
mockMatrix[3] = new Array(25).fill(null);
mockMatrix[3][7] = "Target";
for (let m = 1; m <= 12; m++) {
  mockMatrix[3][7 + m] = "2.08 Miliar";
}
mockMatrix[3][20] = "25 Miliar";

// Row 4: Actual
mockMatrix[4] = new Array(25).fill(null);
mockMatrix[4][7] = "Actual";
for (let m = 1; m <= 12; m++) {
  mockMatrix[4][7 + m] = "2.08 Miliar";
}
mockMatrix[4][20] = "24.96 Miliar";

const parsedBlocks = parseKpiExcelMatrix(mockMatrix);
console.log(`Parsed blocks count: ${parsedBlocks.length}`);
if (parsedBlocks.length === 1) {
  const b = parsedBlocks[0];
  console.log(`- Title: "${b.rawTitle}"`);
  console.log(`- Annual Target (Col U): ${b.annualTarget}`);
  console.log(`- Annual Actual (Col U): ${b.annualActual}`);
  console.log(`- Monthly Targets count: ${b.monthlyTargets.length}`);
  console.log(`- Monthly Actuals count: ${b.monthlyActuals.length}`);
  if (
    b.rawTitle === "Pencapaian Revenue" &&
    b.annualTarget === 25 &&
    b.annualActual === 24.96 &&
    b.monthlyActuals.length === 12
  ) {
    console.log("✓ parseKpiExcelMatrix PASSED!");
  } else {
    console.error("✗ parseKpiExcelMatrix values unexpected!");
  }
} else {
  console.error("✗ parseKpiExcelMatrix failed to find block!");
}

console.log("\n=== 3. TEST ZERO TARGET & DECIMAL CONVERSION ===");
const mockIndicators: IndicatorMatchingTarget[] = [
  {
    appraisalItemId: 101,
    parameterId: 1,
    name: "Pencapaian Revenue",
    categoryName: "Target Kerja",
    indicatorWeight: 0.25,
    parameterWeight: 1.0,
    maxScore: 25,
    unit: "Miliar",
    direction: "HIGHER_IS_BETTER",
    compareBasis: "ACTUAL",
    target: "25",
    currentScore: null,
    scoringRules: [
      { id: 1, label: ">= 25 M", operator: "GTE", minValue: 25, maxValue: null, score: 25, sortOrder: 1 },
      { id: 2, label: "20 - <25 M", operator: "BETWEEN", minValue: 20, maxValue: 24.99, score: 20, sortOrder: 2 },
      { id: 3, label: "< 20 M", operator: "LT", minValue: null, maxValue: 20, score: 10, sortOrder: 3 },
    ],
  },
  {
    appraisalItemId: 102,
    parameterId: 2,
    name: "Incident Rate",
    categoryName: "Keselamatan Kerja",
    indicatorWeight: 0.1,
    parameterWeight: 1.0,
    maxScore: 25,
    unit: "Kasus",
    direction: "LOWER_IS_BETTER",
    compareBasis: "ACTUAL",
    target: "0",
    currentScore: null,
    scoringRules: [
      { id: 4, label: "0 Kasus", operator: "EQ", minValue: 0, maxValue: 0, score: 25, sortOrder: 1 },
      { id: 5, label: "> 0 Kasus", operator: "GT", minValue: 0, maxValue: null, score: 0, sortOrder: 2 },
    ],
  },
];

// Test zero target
const zeroTargetPreview = generateBatchPreview(
  [
    {
      rawTitle: "Incident Rate",
      monthlyTargets: new Array(12).fill(0),
      monthlyActuals: new Array(12).fill(0),
      annualTarget: 0,
      annualActual: 0,
      hasMonthlyData: true,
      warningNotes: [],
      rowNumber: 10,
    },
  ],
  mockIndicators,
  "test.xlsx"
);

const zeroItem = zeroTargetPreview.items[0];
console.log("- Zero Target Test:");
console.log(`  Effective Target: ${zeroItem.effectiveTarget} (should be 0, not 100)`);
console.log(`  Effective Realization: ${zeroItem.effectiveRealization}`);
console.log(`  Score: ${zeroItem.score}`);
if (zeroItem.effectiveTarget === 0 && zeroItem.score === 25) {
  console.log("✓ Zero target correctly preserved and evaluated!");
} else {
  console.error("✗ Zero target test failed!");
}

// Test decimal percentage conversion (0.9145 -> 91.45%)
const percentIndicators: IndicatorMatchingTarget[] = [
  {
    appraisalItemId: 103,
    parameterId: 3,
    name: "Disiplin Kehadiran",
    categoryName: "Kehadiran",
    indicatorWeight: 0.2,
    parameterWeight: 1.0,
    maxScore: 25,
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    compareBasis: "ACTUAL",
    target: "100",
    currentScore: null,
    scoringRules: [
      { id: 6, label: ">= 95%", operator: "GTE", minValue: 95, maxValue: null, score: 25, sortOrder: 1 },
      { id: 7, label: "90% - <95%", operator: "BETWEEN", minValue: 90, maxValue: 94.99, score: 20, sortOrder: 2 },
      { id: 8, label: "< 90%", operator: "LT", minValue: null, maxValue: 90, score: 10, sortOrder: 3 },
    ],
  },
];

const decimalPreview = generateBatchPreview(
  [
    {
      rawTitle: "Disiplin Kehadiran",
      monthlyTargets: new Array(12).fill(1),
      monthlyActuals: new Array(12).fill(0.9145),
      annualTarget: 1,
      annualActual: 0.9145, // Excel stored as raw decimal 0.9145 instead of 91.45
      hasMonthlyData: true,
      warningNotes: [],
      rowNumber: 20,
    },
  ],
  percentIndicators,
  "test.xlsx"
);

const decItem = decimalPreview.items[0];
console.log("- Decimal Percentage Conversion Test:");
console.log(`  Raw Actual in Excel: 0.9145`);
console.log(`  Normalized Realization: ${decItem.effectiveRealization} (should be 91.45)`);
console.log(`  Realization Display: ${decItem.realizationDisplay} (should be 91.45%)`);
console.log(`  Matched Score: ${decItem.score} (should be 20 pt for band 90% - <95%)`);
if (decItem.effectiveRealization === 91.45 && decItem.score === 20) {
  console.log("✓ Decimal percentage conversion PASSED!");
} else {
  console.error("✗ Decimal percentage conversion failed!");
}
