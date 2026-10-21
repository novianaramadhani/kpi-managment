import * as XLSX from "xlsx";
import type { KpiParameter } from "@/db/schema";
import { MONTHS } from "./scoring";

export interface ParsedEvidenceResult {
  extractedValue: number | null;
  extractedData: {
    monthlyActuals?: (number | null)[];
    monthlyTargets?: (number | null)[];
    totalActual?: number | null;
    totalTarget?: number | null;
    achievementPct?: number | null;
    unit?: string | null;
    itemCount?: number;
    rows?: Record<string, any>[];
  };
  summaryText: string;
}

export interface ComparisonResult {
  status: "MATCH" | "MISMATCH" | "NEW";
  diffMessage: string;
  fieldDiffs: {
    field: string;
    inputValue: string | number;
    excelValue: string | number;
    match: boolean;
  }[];
}

/**
 * Generate Excel workbook template tailored specifically to parameter inputType and aggregation.
 */
export function generateEvidenceTemplate(
  param: KpiParameter,
  context?: { employeeName?: string; periodName?: string; deptName?: string }
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const isMonthly = param.inputType === "MONTHLY_ACTUAL" || param.isMonthly;
  const isAttendance =
    param.name.toLowerCase().includes("hadir") ||
    param.name.toLowerCase().includes("kehadiran") ||
    param.unit?.toLowerCase().includes("hari");

  // Sheet 1: Input Data
  if (isAttendance) {
    // Template Khusus Kehadiran (Hari Kerja vs Hari Hadir)
    const headers = [
      "Bulan",
      "Hari Kerja (Target)",
      "Aktual Hadir",
      "Sakit (Hari)",
      "Izin (Hari)",
      "Alpha / Mangkir (Hari)",
      "Keterangan",
    ];

    const rows: any[][] = [
      ["TEMPLATE BUKTI DATA KEHADIRAN KARYAWAN"],
      [`Parameter: ${param.name}`, `Departemen: ${context?.deptName ?? "-"}`, `Periode: ${context?.periodName ?? "-"}`],
      [`Karyawan: ${context?.employeeName ?? "-"}`, `Satuan: ${param.unit ?? "hari"}`, `Agregasi: ${param.aggregation}`],
      [""],
      headers,
    ];

    MONTHS.forEach((m) => {
      rows.push([m, 22, 22, 0, 0, 0, ""]);
    });

    // Summary row
    rows.push([""]);
    rows.push(["TOTAL TAHUNAN", "=SUM(B6:B17)", "=SUM(C6:C17)", "=SUM(D6:D17)", "=SUM(E6:E17)", "=SUM(F6:F17)", "Akumulasi"]);
    rows.push(["% KEHADIRAN", "", "=C19/B19*100", "", "", "", "Persentase"]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Data Kehadiran");
  } else if (isMonthly) {
    // Template Input Bulanan (Umum, e.g. Pemenuhan User per bulan)
    const isPct = param.inputType === "PERCENTAGE" || param.unit === "%";
    const headers = [
      "Bulan",
      isPct ? "Target (%)" : `Target (${param.unit ?? "Unit"})`,
      isPct ? "Aktual Realisasi (%)" : `Aktual Realisasi (${param.unit ?? "Unit"})`,
      "Catatan / Bukti Referensi",
    ];

    const rows: any[][] = [
      [`TEMPLATE BUKTI CAPAIAN BULANAN: ${param.name.toUpperCase()}`],
      [`Karyawan: ${context?.employeeName ?? "-"}`, `Departemen: ${context?.deptName ?? "-"}`, `Periode: ${context?.periodName ?? "-"}`],
      [`Satuan: ${param.unit ?? "-"}`, `Basis Band: ${param.compareBasis}`, `Agregasi: ${param.aggregation}`],
      [""],
      headers,
    ];

    MONTHS.forEach((m) => {
      rows.push([m, isPct ? 100 : 0, isPct ? 95 : 0, ""]);
    });

    rows.push([""]);
    if (param.aggregation === "AVERAGE") {
      rows.push(["RATA-RATA TAHUNAN", "=AVERAGE(B6:B17)", "=AVERAGE(C6:C17)", "Nilai YTD"]);
    } else {
      rows.push(["TOTAL TAHUNAN", "=SUM(B6:B17)", "=SUM(C6:C17)", "Akumulasi"]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws, "Input Bulanan");
  } else if (param.inputType === "CURRENCY") {
    // Template Nilai Keuangan / Rupiah (e.g. Stock On Hand, Cost, Sales)
    const rows: any[][] = [
      [`TEMPLATE BUKTI DATA REALISASI: ${param.name.toUpperCase()}`],
      [`Karyawan: ${context?.employeeName ?? "-"}`, `Departemen: ${context?.deptName ?? "-"}`],
      [`Satuan: Rupiah (Rp)`, `Basis Perbandingan: ${param.compareBasis}`],
      [""],
      ["RINGKASAN UTAMA", "NILAI RUPIAH (RP)", "KETERANGAN"],
      ["TARGET", 500000000, "Target nominal tahunan"],
      ["AKTUAL REALISASI", 485000000, "Nilai akhir yang dicapai (masuk ke penilaian)"],
      ["DEVIASI / SELISIH", "=B6-B7", "Target - Realisasi"],
      ["% PENCAPAIAN", "=B7/B6*100", "% terhadap target"],
      [""],
      ["RINCIAN TRANSAKSI / ITEM PENDUKUNG (OPSIONAL)"],
      ["No", "Kode Item / Akun", "Deskripsi / Nama Barang", "Qty", "Harga Satuan (Rp)", "Subtotal (Rp)", "Keterangan"],
      [1, "ITM-001", "Contoh Item Logistik A", 100, 2500000, 250000000, "Stock Gudang GAM"],
      [2, "ITM-002", "Contoh Item Logistik B", 50, 4700000, 235000000, "Stock Gudang AKP"],
      ["TOTAL RINCIAN", "", "", "", "", "=SUM(F13:F14)", "Sesuai Aktual"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 32 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Data Nominal Rp");
  } else if (param.inputType === "PERCENTAGE") {
    // Template Rasio / Persentase (e.g. Rasio Deadstock, Pemenuhan Kebutuhan)
    const rows: any[][] = [
      [`TEMPLATE BUKTI DATA PERSENTASE: ${param.name.toUpperCase()}`],
      [`Karyawan: ${context?.employeeName ?? "-"}`, `Departemen: ${context?.deptName ?? "-"}`],
      [`Satuan: % (Persen)`, `Basis: ${param.compareBasis}`],
      [""],
      ["FORMULA UTAMA", "NILAI", "SATUAN", "KETERANGAN"],
      ["TARGET", 98, "%", "Target indikator"],
      ["AKTUAL REALISASI", 96.5, "%", "Nilai riil yang dicapai (masuk ke penilaian)"],
      ["PENCAPAIAN", "=B6/B5*100", "%", "Persentase capaian"],
      [""],
      ["DETAIL PERHITUNGAN / PENDUKUNG FORMULA"],
      ["No", "Komponen Pembilang (Numerator)", "Komponen Penyebut (Denominator)", "Hasil (%)", "Catatan"],
      [1, 193, 200, "=B11/C11*100", "Contoh: 193 order terpenuhi dari 200 total order"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 32 }, { wch: 16 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws, "Data Persentase");
  } else {
    // Template Angka / Kuantitas Standar (e.g. Coaching & Counseling)
    const rows: any[][] = [
      [`TEMPLATE BUKTI PENCAPAIAN: ${param.name.toUpperCase()}`],
      [`Karyawan: ${context?.employeeName ?? "-"}`, `Departemen: ${context?.deptName ?? "-"}`],
      [`Satuan: ${param.unit ?? "Unit"}`, `Basis: ${param.compareBasis}`],
      [""],
      ["RINGKASAN", "NILAI", "SATUAN"],
      ["TARGET", 12, param.unit ?? "kali"],
      ["AKTUAL REALISASI", 12, param.unit ?? "kali"],
      [""],
      ["LOG KEGIATAN / RINCIAN BUKTI"],
      ["No", "Tanggal", "Nama Subjek / Karyawan", "Topik / Deskripsi Kegiatan", "Hasil / Status", "Paraf/Bukti"],
      [1, "2024-02-15", "Karyawan A", "Review Kinerja Q1", "Selesai", "Ada Form"],
      [2, "2024-05-20", "Karyawan B", "Counseling Disiplin", "Selesai", "Ada Form"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 32 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Data Pencapaian");
  }

  // Sheet 2: Panduan Pengisian
  const guideRows = [
    ["PANDUAN PENGISIAN FILE BUKTI / EVIDENCE EXCEL"],
    [""],
    ["1. Jangan mengubah struktur baris utama atau nama bulan yang telah disediakan."],
    ["2. Kolom 'Aktual Realisasi' atau 'Aktual Hadir' akan dibaca otomatis oleh sistem"],
    ["   dan langsung mengisi form penilaian KPI."],
    ["3. Sistem akan membandingkan angka yang Anda input manual di form dengan angka di Excel ini."],
    ["4. Jika angka cocok, status bukti akan bertanda 'MATCH' (Hijau)."],
    ["   Jika berbeda, sistem akan menampilkan rincian selisih untuk verifikasi."],
    ["5. Anda juga dapat melampirkan file pendukung lain (PDF / Foto / Memo) di tab Bukti."],
    [""],
    ["INFORMASI PARAMETER:"],
    ["- Nama Parameter", param.name],
    ["- Tipe Input", param.inputType],
    ["- Basis Perbandingan", param.compareBasis],
    ["- Agregasi", param.aggregation ?? "-"],
    ["- Satuan", param.unit ?? "-"],
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide["!cols"] = [{ wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan & Verifikasi");

  return wb;
}

/**
 * Helper to normalize string for header detection
 */
function cleanKey(val: any): string {
  return String(val ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parse uploaded Excel file to extract actual values and monthly breakdown.
 */
export function parseEvidenceExcel(
  buffer: ArrayBuffer | Buffer,
  param: KpiParameter
): ParsedEvidenceResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];

  if (!ws) {
    return {
      extractedValue: null,
      extractedData: {},
      summaryText: "Sheet kosong atau tidak dapat dibaca.",
    };
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const isMonthly = param.inputType === "MONTHLY_ACTUAL" || param.isMonthly;
  const isAttendance =
    param.name.toLowerCase().includes("hadir") ||
    param.name.toLowerCase().includes("kehadiran") ||
    param.unit?.toLowerCase().includes("hari");

  if (isMonthly) {
    // Cari baris-baris bulan Jan s/d Des
    const monthlyActuals: (number | null)[] = Array(12).fill(null);
    const monthlyTargets: (number | null)[] = Array(12).fill(null);

    // Cari header baris yang memuat 'bulan'
    let monthColIdx = 0;
    let targetColIdx = 1;
    let actualColIdx = 2;

    for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
      const row = rawRows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const text = cleanKey(row[c]);
        if (text.includes("bulan")) monthColIdx = c;
        if (text.includes("target") || text.includes("harushadir")) targetColIdx = c;
        if (text.includes("aktual") || text.includes("actual") || text.includes("realisasi")) actualColIdx = c;
      }
    }

    // Ekstrak nilai per bulan
    const monthNamesClean = MONTHS.map((m) => cleanKey(m));

    rawRows.forEach((row) => {
      if (!row || row.length === 0) return;
      const colMonthVal = cleanKey(row[monthColIdx]);

      // Cek apakah kolom ini nama bulan (jan, jan-, januari, etc)
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const shortName = monthNamesClean[mIdx];
        if (colMonthVal.startsWith(shortName) || colMonthVal === shortName) {
          const actVal = row[actualColIdx];
          const tgtVal = row[targetColIdx];

          if (typeof actVal === "number" && !isNaN(actVal)) {
            monthlyActuals[mIdx] = actVal;
          } else if (typeof actVal === "string" && !isNaN(Number(actVal))) {
            monthlyActuals[mIdx] = Number(actVal);
          }

          if (typeof tgtVal === "number" && !isNaN(tgtVal)) {
            monthlyTargets[mIdx] = tgtVal;
          } else if (typeof tgtVal === "string" && !isNaN(Number(tgtVal))) {
            monthlyTargets[mIdx] = Number(tgtVal);
          }
          break;
        }
      }
    });

    // Hitung akumulasi
    const validActuals = monthlyActuals.filter((v): v is number => typeof v === "number");
    let extractedValue: number | null = null;

    if (validActuals.length > 0) {
      if (param.aggregation === "SUM" || isAttendance) {
        extractedValue = validActuals.reduce((a, b) => a + b, 0);
      } else if (param.aggregation === "LAST_VALUE") {
        extractedValue = validActuals[validActuals.length - 1];
      } else {
        // Default AVERAGE
        extractedValue = validActuals.reduce((a, b) => a + b, 0) / validActuals.length;
      }
    }

    const filledCount = validActuals.length;
    return {
      extractedValue,
      extractedData: {
        monthlyActuals,
        monthlyTargets,
        totalActual: extractedValue,
        itemCount: filledCount,
      },
      summaryText: `Berhasil membaca ${filledCount} bulan data. Nilai agregasi (${param.aggregation}): ${
        extractedValue !== null ? extractedValue.toFixed(2) : "-"
      } ${param.unit ?? ""}`,
    };
  }

  // Non-monthly: Cari sel 'aktual' / 'realisasi' / 'actual'
  let extractedValue: number | null = null;
  let targetValue: number | null = null;

  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellText = cleanKey(row[c]);
      if (cellText === "aktual" || cellText === "actual" || cellText === "aktualrealisasi" || cellText === "realisasi") {
        // Cek sel di sebelahnya (c+1)
        const nextVal = row[c + 1];
        if (typeof nextVal === "number" && !isNaN(nextVal)) {
          extractedValue = nextVal;
        } else if (typeof nextVal === "string" && !isNaN(Number(nextVal))) {
          extractedValue = Number(nextVal);
        }
      }
      if (cellText === "target") {
        const nextVal = row[c + 1];
        if (typeof nextVal === "number" && !isNaN(nextVal)) {
          targetValue = nextVal;
        } else if (typeof nextVal === "string" && !isNaN(Number(nextVal))) {
          targetValue = Number(nextVal);
        }
      }
    }
  }

  // Jika belum dapat, cari baris pertama yang memuat angka setelah header
  if (extractedValue === null) {
    for (const row of rawRows) {
      if (!row) continue;
      for (const cell of row) {
        if (typeof cell === "number" && !isNaN(cell)) {
          extractedValue = cell;
          break;
        }
      }
      if (extractedValue !== null) break;
    }
  }

  return {
    extractedValue,
    extractedData: {
      totalActual: extractedValue,
      totalTarget: targetValue,
    },
    summaryText: `Ekstraksi nilai aktual: ${extractedValue !== null ? extractedValue : "-"} ${param.unit ?? ""}`,
  };
}

/**
 * Cross-validate current inputs in the web form against parsed Excel evidence.
 */
export function compareEvidence(
  currentInput: {
    actual?: number | null;
    target?: number | null;
    monthlyActuals?: (number | null)[];
  },
  extractedData: ParsedEvidenceResult["extractedData"],
  param: KpiParameter
): ComparisonResult {
  const isMonthly = param.inputType === "MONTHLY_ACTUAL" || param.isMonthly;
  const fieldDiffs: ComparisonResult["fieldDiffs"] = [];

  if (isMonthly && extractedData.monthlyActuals) {
    let allMatched = true;
    let filledInExcel = 0;

    for (let i = 0; i < 12; i++) {
      const excelVal = extractedData.monthlyActuals[i];
      const inputVal = currentInput.monthlyActuals ? currentInput.monthlyActuals[i] : null;

      if (excelVal !== null && excelVal !== undefined) {
        filledInExcel++;
        const match =
          inputVal !== null &&
          inputVal !== undefined &&
          Math.abs(Number(inputVal) - Number(excelVal)) < 0.001;

        if (!match) allMatched = false;

        fieldDiffs.push({
          field: MONTHS[i],
          inputValue: inputVal ?? "-",
          excelValue: excelVal,
          match,
        });
      }
    }

    if (filledInExcel === 0) {
      return {
        status: "NEW",
        diffMessage: "File Excel belum berisi data bulanan yang valid.",
        fieldDiffs,
      };
    }

    if (allMatched) {
      return {
        status: "MATCH",
        diffMessage: `Semua data (${filledInExcel} bulan) cocok sempurna antara Form dan Excel.`,
        fieldDiffs,
      };
    }

    const mismatchCount = fieldDiffs.filter((f) => !f.match).length;
    return {
      status: "MISMATCH",
      diffMessage: `Ditemukan ${mismatchCount} bulan dengan perbedaan angka antara Form dan Excel.`,
      fieldDiffs,
    };
  }

  // Non-monthly
  const excelVal = extractedData.totalActual ?? null;
  const inputVal = currentInput.actual ?? null;

  if (excelVal === null) {
    return {
      status: "NEW",
      diffMessage: "Nilai belum dapat diekstrak dari file Excel.",
      fieldDiffs: [],
    };
  }

  const match =
    inputVal !== null &&
    inputVal !== undefined &&
    Math.abs(Number(inputVal) - Number(excelVal)) < 0.001;

  fieldDiffs.push({
    field: "Aktual Realisasi",
    inputValue: inputVal ?? "-",
    excelValue: excelVal,
    match,
  });

  if (match) {
    return {
      status: "MATCH",
      diffMessage: `Nilai aktual Form (${inputVal}) cocok dengan file Excel (${excelVal}).`,
      fieldDiffs,
    };
  }

  return {
    status: "MISMATCH",
    diffMessage: `Selisih nilai: Form = ${inputVal ?? "-"} vs Excel = ${excelVal}`,
    fieldDiffs,
  };
}
