import * as XLSXStyle from "xlsx-js-style";
import { getReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// =============================================================================
// STYLES DEFINITION (xlsx-js-style)
// =============================================================================

const borderThin = {
  top: { style: "thin", color: { rgb: "CBD5E1" } },
  bottom: { style: "thin", color: { rgb: "CBD5E1" } },
  left: { style: "thin", color: { rgb: "CBD5E1" } },
  right: { style: "thin", color: { rgb: "CBD5E1" } },
};

const borderHeader = {
  top: { style: "medium", color: { rgb: "0F2C59" } },
  bottom: { style: "medium", color: { rgb: "0F2C59" } },
  left: { style: "thin", color: { rgb: "334155" } },
  right: { style: "thin", color: { rgb: "334155" } },
};

const borderSummary = {
  top: { style: "thin", color: { rgb: "0F2C59" } },
  bottom: { style: "double", color: { rgb: "0F2C59" } },
  left: { style: "thin", color: { rgb: "CBD5E1" } },
  right: { style: "thin", color: { rgb: "CBD5E1" } },
};

// 1. Title Banner: Dark Navy (#0F2C59), White Bold 13pt
const styleTitle = {
  fill: { fgColor: { rgb: "0F2C59" } },
  font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: borderHeader,
};

// 2. Subtitle Banner: Soft Slate (#F8FAFC), Italic 9.5pt
const styleSubtitle = {
  fill: { fgColor: { rgb: "F1F5F9" } },
  font: { name: "Calibri", sz: 9.5, italic: true, bold: false, color: { rgb: "475569" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: borderThin,
};

// 3. Table Column Headers: Corporate Navy (#0F2C59), White Bold 10pt, Wrapped
const styleColumnHeader = {
  fill: { fgColor: { rgb: "0F2C59" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: borderHeader,
};

// 4. Data Cells Generator (Zebra Striping: White vs #F8FAFC)
const styleCellCenter = (isEven: boolean) => ({
  fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
  font: { name: "Calibri", sz: 9.5, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
});

const styleCellLeft = (isEven: boolean, isBold = false) => ({
  fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
  font: { name: "Calibri", sz: 9.5, bold: isBold, color: { rgb: "0F172A" } },
  border: borderThin,
  alignment: { horizontal: "left", vertical: "center" },
});

const styleScoreCell = (isEven: boolean) => ({
  fill: { fgColor: { rgb: isEven ? "F0FDF4" : "DCFCE7" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "15803D" } },
  border: borderThin,
  alignment: { horizontal: "center", vertical: "center" },
});

const styleStatusCell = (statusText: string, isEven: boolean) => {
  const isFinal =
    statusText.toUpperCase().includes("FINAL") ||
    statusText.toUpperCase().includes("SELESAI") ||
    statusText.toUpperCase().includes("PUBLISHED");
  return {
    fill: { fgColor: { rgb: isFinal ? (isEven ? "ECFDF5" : "D1FAE5") : (isEven ? "FFFBEB" : "FEF3C7") } },
    font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: isFinal ? "047857" : "B45309" } },
    border: borderThin,
    alignment: { horizontal: "center", vertical: "center" },
  };
};

const styleSummaryLabel = {
  fill: { fgColor: { rgb: "E2E8F0" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
  border: borderSummary,
  alignment: { horizontal: "right", vertical: "center" },
};

const styleSummaryScore = {
  fill: { fgColor: { rgb: "DCFCE7" } },
  font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: "15803D" } },
  border: borderSummary,
  alignment: { horizontal: "center", vertical: "center" },
};

const styleSummaryEmpty = {
  fill: { fgColor: { rgb: "F1F5F9" } },
  border: borderSummary,
  alignment: { horizontal: "center", vertical: "center" },
};

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
  }

  if (
    currentUser.role !== "ADMIN" &&
    currentUser.role !== "HR" &&
    currentUser.role !== "MANAGER" &&
    currentUser.role !== "HEAD_DEPT"
  ) {
    return Response.json({ error: "Forbidden: Anda tidak memiliki akses untuk mengekspor laporan rekapitulasi." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const periodId = searchParams.get("periodId");
  const targetOu = (searchParams.get("ou") || "ALL").toUpperCase();

  const r = await getReport(periodId ? Number(periodId) : undefined);
  const periodName = r.period?.name || (r.period?.year ? String(r.period?.year) : "All_Period");

  // Filter baris sesuai Operating Unit (data dari getReport adalah data final)
  const filteredRows = r.rows.filter((row) => {
    if (targetOu !== "ALL" && row.operatingUnit !== targetOu) {
      return false;
    }
    return true;
  });

  const ouDisplay = targetOu === "ALL" ? "SELURUH OPERATING UNIT" : targetOu;
  const ouSubtitle =
    targetOu === "HO"
      ? "Head Office"
      : targetOu === "GAM"
      ? "Site GAM"
      : targetOu === "AKP"
      ? "Site AKP"
      : "Seluruh Unit Operasional";

  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Konstruksi sheet dengan styling profesional (xlsx-js-style)
  const ws: any = {};
  const merges: any[] = [];
  const rowsHeight: Record<number, { hpt: number }> = {};

  const setCell = (rIdx: number, cIdx: number, cell: any) => {
    const ref = XLSXStyle.utils.encode_cell({ r: rIdx, c: cIdx });
    ws[ref] = cell;
  };

  const fillRowRange = (rIdx: number, startC: number, endC: number, style: any) => {
    for (let c = startC; c <= endC; c++) {
      const ref = XLSXStyle.utils.encode_cell({ r: rIdx, c });
      if (!ws[ref]) {
        ws[ref] = { t: "s", v: "", s: style };
      }
    }
  };

  const TOTAL_COLS = 17; // Index 0..16

  // Row 0: Title Banner
  setCell(0, 0, {
    t: "s",
    v: `REKAPITULASI PENILAIAN KINERJA (KPI) - ${ouDisplay}`,
    s: styleTitle,
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: TOTAL_COLS - 1 } });
  fillRowRange(0, 0, TOTAL_COLS - 1, styleTitle);
  rowsHeight[0] = { hpt: 30 };

  // Row 1: Subtitle
  setCell(1, 0, {
    t: "s",
    v: `Dokumen Rekapitulasi Progres & Hasil Penilaian • ${ouSubtitle} • Periode: ${periodName} • Dicetak pada: ${printDate} • Total: ${filteredRows.length} Karyawan`,
    s: styleSubtitle,
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: TOTAL_COLS - 1 } });
  fillRowRange(1, 0, TOTAL_COLS - 1, styleSubtitle);
  rowsHeight[1] = { hpt: 20 };

  // Row 2: Spacer baris kosong
  rowsHeight[2] = { hpt: 8 };

  // Row 3: Table Column Headers (17 Kolom Lengkap & Bold)
  const headers = [
    "NO",
    "NAMA KARYAWAN",
    "POLA PENGGAJIAN",
    "NIK KARYAWAN",
    "JABATAN",
    "UNIT",
    "DEPARTEMEN",
    "TGL MASUK",
    "MASA KERJA",
    "PENILAI",
    "STATUS",
    "SKOR AKHIR",
    "GAJI POKOK",
    "T. JABATAN",
    "TOTAL",
    "JLH BULAN",
    "JLH HARI",
  ];

  headers.forEach((h, colIdx) => {
    setCell(3, colIdx, {
      t: "s",
      v: h,
      s: styleColumnHeader,
    });
  });
  rowsHeight[3] = { hpt: 26 };

  // Row 4..N: Data Karyawan
  let scoreSum = 0;
  let scoredCount = 0;

  filteredRows.forEach((row, idx) => {
    const rIdx = 4 + idx;
    const isEven = idx % 2 === 0;
    rowsHeight[rIdx] = { hpt: 21 };

    if (row.finalScore !== null && row.finalScore !== undefined) {
      const num = Number(row.finalScore);
      if (!isNaN(num)) {
        scoreSum += num * 100;
        scoredCount++;
      }
    }

    setCell(rIdx, 0, { t: "n", v: idx + 1, s: styleCellCenter(isEven) });
    setCell(rIdx, 1, { t: "s", v: row.name || "-", s: styleCellLeft(isEven, true) });
    setCell(rIdx, 2, { t: "s", v: row.polaPenggajian || "All In", s: styleCellCenter(isEven) });
    setCell(rIdx, 3, { t: "s", v: row.nik || "-", s: styleCellCenter(isEven) });
    setCell(rIdx, 4, { t: "s", v: row.jobPosition || "-", s: styleCellLeft(isEven) });
    setCell(rIdx, 5, { t: "s", v: row.operatingUnit || "-", s: styleCellCenter(isEven) });
    setCell(rIdx, 6, { t: "s", v: row.dept || "-", s: styleCellLeft(isEven) });
    setCell(rIdx, 7, { t: "s", v: row.hireDateFormatted || "-", s: styleCellCenter(isEven) });
    setCell(rIdx, 8, { t: "s", v: row.tenureFormatted || "-", s: styleCellLeft(isEven) });
    setCell(rIdx, 9, { t: "s", v: row.appraiserName || "-", s: styleCellLeft(isEven) });
    setCell(rIdx, 10, {
      t: "s",
      v: row.statusLabel || "Final",
      s: styleStatusCell(row.statusLabel || "Final", isEven),
    });
    const hasNumericScore =
      row.finalScore !== null &&
      row.finalScore !== undefined &&
      !isNaN(Number(row.finalScore));
    const scoreFracVal = hasNumericScore ? parseFloat(Number(row.finalScore).toFixed(4)) : null;

    setCell(rIdx, 11, {
      t: scoreFracVal !== null ? "n" : "s",
      v: scoreFracVal !== null ? scoreFracVal : "-",
      z: scoreFracVal !== null ? "0.0%" : undefined,
      s: styleScoreCell(isEven),
    });
    setCell(rIdx, 12, { t: "s", v: "", s: styleCellCenter(isEven) });
    setCell(rIdx, 13, { t: "s", v: "", s: styleCellCenter(isEven) });
    setCell(rIdx, 14, { t: "s", v: "", s: styleCellCenter(isEven) });
    setCell(rIdx, 15, { t: "s", v: "", s: styleCellCenter(isEven) });
    setCell(rIdx, 16, { t: "s", v: "", s: styleCellCenter(isEven) });
  });

  // Summary Row (Rata-rata Skor Keseluruhan)
  const summaryRowIdx = 4 + filteredRows.length;
  rowsHeight[summaryRowIdx] = { hpt: 24 };

  const avgScoreFrac =
    scoredCount > 0 ? parseFloat((scoreSum / scoredCount / 100).toFixed(4)) : null;
  const lastDataRowExcel = 4 + filteredRows.length;
  const avgFormula =
    filteredRows.length > 0
      ? `IF(COUNT(L5:L${lastDataRowExcel})=0,"",AVERAGE(L5:L${lastDataRowExcel}))`
      : undefined;

  setCell(summaryRowIdx, 0, {
    t: "s",
    v: "RATA-RATA / REKAPITULASI KESELURUHAN",
    s: styleSummaryLabel,
  });
  merges.push({ s: { r: summaryRowIdx, c: 0 }, e: { r: summaryRowIdx, c: 10 } });
  fillRowRange(summaryRowIdx, 0, 10, styleSummaryLabel);

  setCell(summaryRowIdx, 11, {
    t: avgScoreFrac !== null ? "n" : "s",
    ...(avgFormula ? { f: avgFormula } : {}),
    v: avgScoreFrac !== null ? avgScoreFrac : "-",
    z: "0.0%",
    s: styleSummaryScore,
  });

  const summaryScoreCellRef = `L${summaryRowIdx + 1}`;
  setCell(summaryRowIdx, 12, {
    t: "s",
    f: `IF(OR(${summaryScoreCellRef}="",ISBLANK(${summaryScoreCellRef}),${summaryScoreCellRef}="-"),"",IF(ROUND(${summaryScoreCellRef},4)>=0.9,"Grade A (Outstanding)",IF(ROUND(${summaryScoreCellRef},4)>=0.8,"Grade B (Exceeds Expectations)",IF(ROUND(${summaryScoreCellRef},4)>=0.7,"Grade C (Meets Expectations)",IF(ROUND(${summaryScoreCellRef},4)>=0.6,"Grade D (Needs Improvement)","Grade E (Unsatisfactory)")))))`,
    v: "",
    s: styleSummaryScore,
  });

  fillRowRange(summaryRowIdx, 13, TOTAL_COLS - 1, styleSummaryEmpty);

  // Pasang metadata spreadsheet
  ws["!ref"] = XLSXStyle.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: summaryRowIdx, c: TOTAL_COLS - 1 },
  });
  ws["!merges"] = merges;
  ws["!rows"] = rowsHeight;
  ws["!cols"] = [
    { wch: 6 },  // NO
    { wch: 32 }, // NAMA KARYAWAN
    { wch: 18 }, // POLA PENGGAJIAN
    { wch: 16 }, // NIK KARYAWAN
    { wch: 30 }, // JABATAN
    { wch: 10 }, // UNIT
    { wch: 24 }, // DEPARTEMEN
    { wch: 16 }, // TGL MASUK
    { wch: 26 }, // MASA KERJA
    { wch: 26 }, // PENILAI
    { wch: 16 }, // STATUS
    { wch: 14 }, // SKOR AKHIR
    { wch: 18 }, // GAJI POKOK
    { wch: 16 }, // T. JABATAN
    { wch: 18 }, // TOTAL
    { wch: 14 }, // JLH BULAN
    { wch: 14 }, // JLH HARI
  ];

  const wb = XLSXStyle.utils.book_new();
  const sheetTitle = `Summary KPI ${targetOu === "ALL" ? "All" : targetOu}`;
  XLSXStyle.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));

  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeFilename = `Summary_KPI_${targetOu === "ALL" ? "All_Units" : targetOu}_${periodName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
