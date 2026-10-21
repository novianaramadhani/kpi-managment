import {
  parseRangeValues,
  extractSingleNumericValue,
  extractCriteriaUnit,
  detectIndicatorUnit,
  autoDetermineBandValue,
  autoHarmonizeCriteriaBands,
  validateStructuredCriteria,
  type HarmonizableBand,
} from "../src/lib/kpi-criteria-helper";

function runCriteriaAutoFillTests() {
  console.log("================================================================================");
  console.log(" VERIFIKASI PENGISIAN NILAI KRITERIA KPI OTOMATIS & HARMONISASI SATUAN");
  console.log("================================================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Deteksi Satuan Indikator dari Kriteria (Kasus: Screenshot Pengguna)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1] Pengujian deteksi satuan indikator dari teks kriteria...");
  const sampleBands1: HarmonizableBand[] = [
    { label: "< 3 hari", operator: "LT", operatorSymbol: "<", criteriaValue: "3 hari", score: 25, sortOrder: 0 },
    { label: "3 % - 4 %", operator: "BETWEEN", operatorSymbol: "Rentang", criteriaValue: "3 % - 4 %", score: 15, sortOrder: 1 },
    { label: "> 4 Hari", operator: "GT", operatorSymbol: ">", criteriaValue: "4 Hari", score: 5, sortOrder: 2 },
  ];

  const detectedUnit1 = detectIndicatorUnit("%", sampleBands1);
  assert(
    detectedUnit1.toLowerCase() === "hari",
    "Deteksi satuan indikator harus menghasilkan 'hari'",
    `Hasil didapat: '${detectedUnit1}'`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Parsing Rentang dengan Satuan Kata (misal '3 hari - 4 hari', '3 % - 4 %')
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Pengujian parseRangeValues dengan berbagai format satuan...");
  const parsedR1 = parseRangeValues("3 % - 4 %");
  assert(parsedR1 !== null && parsedR1.min === 3 && parsedR1.max === 4, "Parse '3 % - 4 %' min 3 max 4");

  const parsedR2 = parseRangeValues("3 hari - 4 hari");
  assert(parsedR2 !== null && parsedR2.min === 3 && parsedR2.max === 4, "Parse '3 hari - 4 hari' min 3 max 4");

  const parsedR3 = parseRangeValues("3 - 4 hari");
  assert(parsedR3 !== null && parsedR3.min === 3 && parsedR3.max === 4, "Parse '3 - 4 hari' min 3 max 4");

  const parsedR4 = parseRangeValues("3 s/d 4 Hari");
  assert(parsedR4 !== null && parsedR4.min === 3 && parsedR4.max === 4, "Parse '3 s/d 4 Hari' min 3 max 4");

  // ---------------------------------------------------------------------------
  // TEST 3: Harmonisasi Otomatis Kasus Screenshot (< 3 hari, 3 % - 4 %, > 4 Hari)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Pengujian autoHarmonizeCriteriaBands pada kasus screenshot...");
  const harmonized1 = autoHarmonizeCriteriaBands(sampleBands1, "%");

  console.log("  Hasil Harmonisasi:");
  harmonized1.forEach((b, i) => {
    console.log(`    Baris ${i + 1}: ${b.operatorSymbol} [${b.criteriaValue}] (minValue: ${b.minValue}, maxValue: ${b.maxValue})`);
  });

  assert(
    harmonized1[1].criteriaValue === "3 - 4 hari",
    "Baris kedua (Rentang) harus dikoreksi menjadi '3 - 4 hari' (bukan 3 % - 4 %)",
    `Hasil: '${harmonized1[1].criteriaValue}'`
  );
  assert(
    harmonized1[1].minValue === 3 && harmonized1[1].maxValue === 4,
    "Batas numerik rentang harus min: 3 dan max: 4"
  );
  assert(
    !harmonized1[1].criteriaValue?.includes("%"),
    "Baris kedua tidak boleh mengandung simbol '%' yang salah"
  );

  // Verifikasi validator: pastikan 0 error dan 0 gap
  const valResult1 = validateStructuredCriteria(
    harmonized1.map((b, idx) => ({
      id: String(idx),
      label: b.label,
      operator: b.operator,
      minValue: b.minValue != null ? String(b.minValue) : "",
      maxValue: b.maxValue != null ? String(b.maxValue) : "",
      score: String(b.score),
    })),
    "LOWER_IS_BETTER",
    "hari",
    "NUMBER"
  );

  assert(valResult1.isValid, "Kriteria yang diharmonisasi harus 100% valid", valResult1.errors.join(", "));
  assert(valResult1.errors.length === 0, "Harus 0 error");
  assert(valResult1.warnings.length === 0, "Harus 0 warning gap/celah", valResult1.warnings.join(", "));

  // ---------------------------------------------------------------------------
  // TEST 4: Auto-Fill saat Operator Dipilih: Kasus Ascending (<, Rentang, >)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4] Pengujian autoDetermineBandValue saat operator dipilih (Ascending)...");
  // Pengguna mengubah baris tengah menjadi Rentang
  const autoMid = autoDetermineBandValue(sampleBands1, 1, "Rentang", "hari");
  assert(autoMid.isDetermined, "Rentang harus dapat ditentukan secara otomatis");
  assert(autoMid.value === "3 - 4 hari", "Nilai rentang otomatis harus '3 - 4 hari'", `Hasil: '${autoMid.value}'`);
  assert(autoMid.minValue === 3 && autoMid.maxValue === 4, "Rentang numerik harus min: 3 max: 4");
  assert(!autoMid.needsManualReview, "Tidak perlu pemeriksaan manual");

  // Pengguna mengubah baris ketiga menjadi >=
  const autoBottom = autoDetermineBandValue(sampleBands1, 2, ">=", "hari");
  assert(autoBottom.isDetermined, "Operator >= harus dapat ditentukan otomatis");
  assert(autoBottom.value === "4 hari", "Nilai >= otomatis harus '4 hari'", `Hasil: '${autoBottom.value}'`);
  assert(autoBottom.minValue === 4, "minValue harus 4");

  // Pengguna mengubah baris pertama menjadi <=
  const autoTop = autoDetermineBandValue(sampleBands1, 0, "<=", "hari");
  assert(autoTop.isDetermined, "Operator <= harus dapat ditentukan otomatis");
  assert(autoTop.value === "3 hari", "Nilai <= otomatis harus '3 hari'", `Hasil: '${autoTop.value}'`);
  assert(autoTop.maxValue === 3, "maxValue harus 3");

  // ---------------------------------------------------------------------------
  // TEST 5: Auto-Fill saat Operator Dipilih: Kasus Descending (>= 100%, Rentang, < 90%)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5] Pengujian autoDetermineBandValue saat operator dipilih (Descending / Persentase)...");
  const descendingBands: HarmonizableBand[] = [
    { label: ">= 100%", operator: "GTE", operatorSymbol: ">=", criteriaValue: "100%", score: 25, sortOrder: 0 },
    { label: "", operator: "BETWEEN", operatorSymbol: "Rentang", criteriaValue: "", score: 15, sortOrder: 1 },
    { label: "< 90%", operator: "LT", operatorSymbol: "<", criteriaValue: "90%", score: 5, sortOrder: 2 },
  ];

  const autoDescMid = autoDetermineBandValue(descendingBands, 1, "Rentang", "%");
  assert(autoDescMid.isDetermined, "Rentang descending harus ditentukan otomatis");
  assert(autoDescMid.value === "90% - 100%", "Nilai rentang descending harus '90% - 100%'", `Hasil: '${autoDescMid.value}'`);
  assert(autoDescMid.minValue === 90 && autoDescMid.maxValue === 100, "Min 90 Max 100");

  // ---------------------------------------------------------------------------
  // TEST 6: Auto-Fill saat Operator Dipilih: Operator Sama Dengan (=)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Pengujian operator sama dengan (=) untuk target diskrit/kontinu...");
  const eqBands: HarmonizableBand[] = [
    { label: "< 3 hari", operator: "LT", operatorSymbol: "<", criteriaValue: "3 hari", score: 25, sortOrder: 0 },
    { label: "", operator: "EQ", operatorSymbol: "=", criteriaValue: "", score: 15, sortOrder: 1 },
    { label: "> 3 hari", operator: "GT", operatorSymbol: ">", criteriaValue: "3 hari", score: 5, sortOrder: 2 },
  ];

  const autoEq = autoDetermineBandValue(eqBands, 1, "=", "hari");
  assert(autoEq.isDetermined, "Operator = harus dapat ditentukan otomatis");
  assert(autoEq.value === "3 hari", "Nilai operator = harus '3 hari'", `Hasil: '${autoEq.value}'`);
  assert(autoEq.minValue === 3 && autoEq.maxValue === 3, "Min 3 Max 3");

  // ---------------------------------------------------------------------------
  // TEST 7: Penandaan Pemeriksaan Manual saat Nilai Tidak Dapat Ditentukan Pasti
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7] Pengujian penandaan pemeriksaan manual jika nilai belum pasti...");
  const isolatedBands: HarmonizableBand[] = [
    { label: "", operator: "TEXT", operatorSymbol: "?", criteriaValue: "", score: 25, sortOrder: 0 },
  ];

  const autoUnknown = autoDetermineBandValue(isolatedBands, 0, "Rentang", "%");
  assert(
    !autoUnknown.isDetermined,
    "Nilai rentang tanpa konteks kriteria sekitar tidak boleh ditebak sembarangan"
  );
  assert(
    autoUnknown.needsManualReview,
    "Harus ditandai untuk pemeriksaan manual (needsManualReview: true)"
  );

  console.log("\n================================================================================");
  console.log(` HASIL PENGUJIAN: ${passed} dari ${total} pengujian LOLOS SEMPURNA!`);
  console.log("================================================================================\n");
}

runCriteriaAutoFillTests();
