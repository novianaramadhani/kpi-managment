import * as XLSX from "xlsx";
import { getReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

  // Filter rows by Operating Unit if specified (data from getReport is strictly FINAL)
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

  // Structure sheet rows matching user spreadsheet template with UNIT and STATUS
  const sheetData: (string | number)[][] = [
    // Row 1: Title Banner
    ["", "", "", "", "", `SUMMARY KPI ${ouDisplay}`, "", "", "", "", "", ""],
    // Row 2: Subtitle
    ["", "", "", "", "", `Rekapitulasi Penilaian Kinerja Final • ${ouSubtitle} (${periodName})`, "", "", "", "", "", ""],
    // Row 3: Blank
    [],
    // Row 4: Column Headers (17 Kolom Lengkap)
    [
      "NO",
      "NAMA",
      "POLA PENGGAJIAN",
      "NIK KARYAWAN",
      "JABATAN",
      "UNIT",
      "DEPARTEMEN",
      "TGL MASUK",
      "MASA KERJA",
      "PENILAI",
      "STATUS",
      "SKOR",
      "GAJI POKOK",
      "T. JABATAN",
      "TOTAL",
      "JLH BULAN",
      "JLH HARI",
    ],
  ];

  // Populate data rows
  filteredRows.forEach((row, idx) => {
    sheetData.push([
      idx + 1,
      row.name,
      row.polaPenggajian || "All In",
      row.nik,
      row.jobPosition,
      row.operatingUnit,
      row.dept,
      row.hireDateFormatted,
      row.tenureFormatted,
      row.appraiserName || "-",
      row.statusLabel,
      row.scoreFormatted,
      "", // GAJI POKOK (diisi di luar sistem)
      "", // T. JABATAN (diisi di luar sistem)
      "", // TOTAL (diisi di luar sistem)
      "", // JLH BULAN (diisi di luar sistem)
      "", // JLH HARI (diisi di luar sistem)
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths for beautiful spreadsheet presentation
  ws["!cols"] = [
    { wch: 6 },  // NO
    { wch: 28 }, // NAMA
    { wch: 18 }, // POLA PENGGAJIAN
    { wch: 18 }, // NIK KARYAWAN
    { wch: 30 }, // JABATAN
    { wch: 10 }, // UNIT
    { wch: 24 }, // DEPARTEMEN
    { wch: 16 }, // TGL MASUK
    { wch: 24 }, // MASA KERJA
    { wch: 26 }, // PENILAI
    { wch: 16 }, // STATUS
    { wch: 12 }, // SKOR
    { wch: 18 }, // GAJI POKOK
    { wch: 16 }, // T. JABATAN
    { wch: 18 }, // TOTAL
    { wch: 14 }, // JLH BULAN
    { wch: 14 }, // JLH HARI
  ];

  const sheetTitle = `Summary KPI ${targetOu === "ALL" ? "All" : targetOu}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeFilename = `Summary_KPI_${targetOu === "ALL" ? "All_Units" : targetOu}_${periodName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
