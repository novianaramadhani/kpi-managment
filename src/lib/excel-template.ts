import * as XLSX from "xlsx";
import type { Department, Employee, JobLevel, JobPosition, Pit } from "@/db/schema";
import { formatTenureYears } from "./scoring";

export interface RawEmployeeRow {
  rowIndex: number;
  nik: string;
  name: string;
  department: string;
  pit?: string;
  operatingUnit: string;
  polaPenggajian?: string;
  jobTitle: string;
  jobLevel: string;
  statusStaff?: string;
  arrivalDate: string;
  role?: string;
  appraiserNik?: string;
  headDeptNik?: string;
  workingDuration?: string;
}

/**
 * Universal browser-safe workbook download helper using Blob and URL.createObjectURL
 */
export function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  try {
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (err) {
    console.warn("Direct blob download failed, falling back to XLSX.writeFile:", err);
    XLSX.writeFile(wb, filename);
  }
}

/**
 * Robust date parser supporting Excel serial numbers, DD/MM/YYYY, ISO, and standard dates
 */
export function parseFlexibleDate(val: unknown): string {
  if (!val) return "";

  // 1. Date object from XLSX with cellDates: true
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Numeric Excel date serial (e.g. 44927 -> 2023-01-01)
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    try {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      // Continue to string parsing
    }
  }

  const s = String(val).trim();
  if (!s) return "";

  // 3. String that is a 5-digit number (e.g. "44927")
  if (/^\d{5}$/.test(s)) {
    const num = Number(s);
    try {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      // Continue
    }
  }

  // 4. ISO string with time component (e.g. 2023-05-15T00:00:00.000Z)
  if (s.includes("T")) {
    return s.slice(0, 10);
  }

  // 5. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 6. Indonesian format DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 7. Fallback to standard Date constructor
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  } catch {
    // Keep original string
  }

  return s;
}

/**
 * Normalisasi Operating Unit / Site (GAM, AKP, HO)
 * Mempertahankan nama site sumber (seperti JO IC) tanpa otomatis mengubahnya ke HO
 */
export function normalizeOperatingUnit(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const up = trimmed.toUpperCase();
  if (up === "GAM" || up === "SITE GAM" || up === "SITE-GAM") return "GAM";
  if (up === "AKP" || up === "SITE AKP" || up === "SITE-AKP") return "AKP";
  if (up === "HO" || up === "HEAD OFFICE" || up === "SAMARINDA" || up === "HEAD-OFFICE") return "HO";
  if (
    up === "JO IC" ||
    up === "JO-IC" ||
    up === "SITE JO IC" ||
    up === "SITE JO-IC" ||
    up === "JOIC" ||
    up === "JO - IC"
  ) {
    return "JO-IC";
  }
  if (up === "WS89" || up === "WS-89" || up === "SITE WS89" || up === "SITE WS-89") return "WS89";
  return trimmed;
}

/**
 * Download Template Excel Kosong + Contoh Data + Sheet Panduan Master Data
 */
export function downloadEmployeeTemplate(
  departments: Department[],
  jobLevels: JobLevel[],
  existingEmployees: Employee[] = [],
  jobPositions: JobPosition[] = [],
  filename?: string,
  pits: Pit[] = []
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Template Data Karyawan
  const headers = [
    "NIK",
    "Nama Lengkap",
    "Site",
    "Pola Penggajian (All In / OT)",
    "Departemen",
    "PIT (Opsional)",
    "Job Level",
    "Job Title (Jabatan)",
    "Status (Staff/Non Staff)",
    "Arrival Date (YYYY-MM-DD)",
  ];

  // Siapkan contoh data yang realistis berdasarkan data di database
  const sampleData: (string | number)[][] = [headers];

  const dep1 = departments[0]?.name || "Logistik";
  const dep2 = departments[1]?.name || departments[0]?.name || "Produksi";
  const dep3 = departments[2]?.name || departments[0]?.name || "Human Resources";

  const lvlNonStaff = jobLevels.find((l) => l.code.toUpperCase() === "NON_STAFF" || l.rank === 0)?.name || "Non Staff";
  const lvlStaff = jobLevels.find((l) => l.code.toUpperCase() === "STAFF" || l.rank === 1)?.name || "Staff";
  const lvlSpv = jobLevels.find((l) => l.code.toUpperCase().includes("SPV") || l.code.toUpperCase().includes("SUPERVISOR"))?.name || "Supervisor";

  const pos1 = jobPositions.find((p) => p.departmentId === departments[0]?.id)?.name || "Supervisor Logistik";
  const pos2 = jobPositions.find((p) => p.departmentId === departments[1]?.id)?.name || "Operator Dump Truck";
  const pos3 = jobPositions.find((p) => p.departmentId === departments[2]?.id)?.name || "HR Officer";

  sampleData.push([
    "20101",
    "Ahmad Fauzi",
    "GAM",
    "All In",
    dep1,
    "",
    lvlSpv,
    pos1,
    "Staff",
    "2023-03-01",
  ]);

  sampleData.push([
    "20102",
    "Bambang Setiawan",
    "GAM",
    "OT",
    "Produksi BCM Selatan",
    "BCM Selatan",
    lvlNonStaff,
    pos2,
    "Non Staff",
    "2022-07-15",
  ]);

  sampleData.push([
    "10005",
    "Rian Pratama",
    "HO",
    "All In",
    dep3,
    "",
    lvlStaff,
    pos3,
    "Staff",
    "2024-01-10",
  ]);

  const wsData = XLSX.utils.aoa_to_sheet(sampleData);
  wsData["!cols"] = [
    { wch: 14 }, // NIK
    { wch: 26 }, // Nama
    { wch: 14 }, // Site
    { wch: 24 }, // Pola Penggajian
    { wch: 24 }, // Departemen
    { wch: 18 }, // PIT (Opsional)
    { wch: 18 }, // Job Level
    { wch: 28 }, // Job Title
    { wch: 24 }, // Status (Staff/Non Staff)
    { wch: 24 }, // Arrival Date
  ];
  XLSX.utils.book_append_sheet(wb, wsData, "Template Karyawan");

  // Sheet 2: Petunjuk Pengisian & Referensi Master Data
  const guideRows: (string | number)[][] = [
    ["PANDUAN PENGISIAN TEMPLATE IMPORT KARYAWAN"],
    [""],
    ["1. NIK", "Wajib diisi & unik. Jika NIK sudah terdaftar, data akan otomatis diperbarui (Update)."],
    ["2. Nama Lengkap", "Nama lengkap karyawan."],
    ["3. Site", "Lokasi / operating unit: GAM (Site GAM), AKP (Site AKP), atau HO (Head Office)."],
    ["4. Pola Penggajian", "Pola kompensasi: 'All In' atau 'OT'. Default: 'All In'."],
    ["5. Departemen", "Tuliskan nama atau kode departemen yang terdaftar di sistem (lihat tabel di bawah)."],
    ["6. PIT (Opsional)", "Opsional. Dapat diisi jika karyawan ditempatkan di sektor PIT tertentu (contoh: 'BCM Selatan', 'BCM-S')."],
    ["7. Job Level", "Tingkat jabatan: Non Staff, Staff, Supervisor, Superintendent, Manager. Jika kosong, disesuaikan dari Status."],
    ["8. Job Title", "Jabatan atau spesifikasi posisi kerja karyawan."],
    ["9. Status", "Status kepegawaian: 'Staff' atau 'Non Staff'."],
    ["10. Arrival Date", "Tanggal mulai kerja / kedatangan. Format: YYYY-MM-DD atau DD/MM/YYYY."],
    [""],
    ["DAFTAR OPERATING UNIT VALID:"],
    ["- GAM (Site GAM - PT Ganda Alam Makmur)"],
    ["- AKP (Site AKP - PT Adhi Kartiko Pratama Tbk)"],
    ["- HO (Head Office Samarinda)"],
    [""],
    ["DAFTAR POLA PENGGAJIAN VALID:"],
    ["- All In"],
    ["- OT"],
    [""],
    ["DAFTAR STATUS KEPEGAWAIAN VALID:"],
    ["- Staff"],
    ["- Non Staff"],
    [""],
    ["DAFTAR DEPARTEMEN TERDAFTAR:"],
    ["Kode", "Nama Departemen"],
    ...departments.map((d) => [d.code, d.name]),
    [""],
    ["DAFTAR JOB LEVEL TERDAFTAR:"],
    ["Kode", "Nama Level", "Rank"],
    ...jobLevels.map((l) => [l.code, l.name, l.rank]),
  ];

  if (jobPositions.length > 0) {
    guideRows.push([""]);
    guideRows.push(["DAFTAR CONTOH JABATAN TERDAFTAR:"]);
    guideRows.push(["Kode", "Nama Jabatan"]);
    jobPositions.slice(0, 30).forEach((p) => {
      guideRows.push([p.code || "-", p.name]);
    });
  }

  if (pits.length > 0) {
    guideRows.push([""]);
    guideRows.push(["DAFTAR MASTER PIT VALID (OPSIONAL):"]);
    guideRows.push(["Kode PIT", "Nama PIT", "Site"]);
    pits
      .filter((p) => p.isActive !== false)
      .forEach((p) => {
        guideRows.push([p.code, p.name, p.site || "-"]);
      });
  }

  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide["!cols"] = [{ wch: 25 }, { wch: 45 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan & Master Data");

  // Unduh file template secara aman
  saveWorkbook(wb, filename || "template_import_karyawan.xlsx");
}

/**
 * Export Semua Data Karyawan dari Database ke File Excel (.xlsx)
 */
export function exportEmployeesToExcel(
  employees: Employee[],
  departments: Department[],
  jobLevels: JobLevel[],
  systemDate: string,
  filename?: string,
  pits: Pit[] = []
) {
  const wb = XLSX.utils.book_new();

  const depMap = new Map(departments.map((d) => [d.id, d.name]));
  const lvlMap = new Map(jobLevels.map((l) => [l.id, l]));
  const pitMap = new Map(pits.map((p) => [p.id, p]));

  const headers = [
    "NIK",
    "Nama Lengkap",
    "Site",
    "Pola Penggajian (All In / OT)",
    "Departemen",
    "PIT",
    "Job Level",
    "Job Title (Jabatan)",
    "Status (Staff/Non Staff)",
    "Arrival Date (YYYY-MM-DD)",
    "Masa Kerja",
    "Status Aktif",
  ];

  const rows = employees.map((e) => {
    let masaKerja = "-";
    try {
      if (e.dateOfHire) {
        masaKerja = formatTenureYears(e.dateOfHire, systemDate);
      }
    } catch {
      masaKerja = "-";
    }

    const lvl = lvlMap.get(e.jobLevelId);
    const lvlName = lvl?.name || "-";
    const statusStaff = lvl?.code === "NON_STAFF" || lvl?.rank === 0 ? "Non Staff" : "Staff";
    const pitName = e.pitId ? pitMap.get(e.pitId)?.name || "-" : "-";

    return [
      e.nik,
      e.name,
      e.operatingUnit || "HO",
      e.polaPenggajian || "All In",
      depMap.get(e.departmentId) || "-",
      pitName,
      lvlName,
      e.jobPosition,
      statusStaff,
      e.dateOfHire || "-",
      masaKerja,
      e.isActive !== false ? "Aktif" : "Nonaktif",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 12 }, // NIK
    { wch: 28 }, // Nama
    { wch: 14 }, // Site
    { wch: 24 }, // Pola Penggajian
    { wch: 24 }, // Dept
    { wch: 20 }, // PIT
    { wch: 18 }, // Job Level
    { wch: 30 }, // Job Title
    { wch: 24 }, // Status (Staff/Non Staff)
    { wch: 24 }, // Arrival Date
    { wch: 18 }, // Masa Kerja
    { wch: 14 }, // Status Aktif
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Master Karyawan");
  const actualFilename = filename || `data_master_karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`;
  saveWorkbook(wb, actualFilename);
}

/**
 * Parsing File Excel Karyawan (.xlsx / .xls / .csv)
 * Membaca kolom secara akurat berdasarkan header, bukan indeks tetap.
 */
export async function parseEmployeeExcelFile(file: File): Promise<RawEmployeeRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  // Cari sheet yang berisi data karyawan (prioritaskan Template Karyawan atau sheet pertama)
  const targetSheetName =
    wb.SheetNames.find((s) => {
      const low = s.toLowerCase();
      return low.includes("template") || low.includes("karyawan") || low.includes("employee") || low.includes("data");
    }) || wb.SheetNames[0];

  const ws = wb.Sheets[targetSheetName];
  if (!ws) return [];

  const rawMatrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rawMatrix.length === 0) return [];

  // Cari baris header yang paling sesuai (bisa baris 0, 1, atau 2 jika ada judul di atas)
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawMatrix.length, 10); r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;
    const texts = row.map((c) => String(c ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const score =
      (texts.some((t) => t.includes("nik") || t === "empid" || t === "employeeid") ? 1 : 0) +
      (texts.some((t) => t.includes("nama") || t.includes("name")) ? 1 : 0) +
      (texts.some((t) => t.includes("depart") || t.includes("dept") || t.includes("divisi")) ? 1 : 0) +
      (texts.some((t) => t === "site" || t.includes("operatingunit") || t === "ou" || t === "lokasi") ? 1 : 0) +
      (texts.some((t) => t.includes("jabatan") || t.includes("position") || t.includes("posisi")) ? 1 : 0);

    if (score >= 2) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = (rawMatrix[headerRowIndex] || []) as unknown[];

  let colNik = -1;
  let colName = -1;
  let colSite = -1;
  let colDept = -1;
  let colPit = -1;
  let colPola = -1;
  let colJobTitle = -1;
  let colJobLevel = -1;
  let colStatusStaff = -1;
  let colArrivalDate = -1;
  let colRole = -1;
  let colAppraiserNik = -1;
  let colHeadDeptNik = -1;
  let colDuration = -1;

  headerRow.forEach((val, idx) => {
    const str = String(val ?? "").trim();
    const nk = str.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!nk) return;

    if (
      colAppraiserNik === -1 &&
      (nk.includes("penilai") || nk.includes("appraiser") || (nk.includes("atasan") && !nk.includes("head")))
    ) {
      colAppraiserNik = idx;
    } else if (
      colHeadDeptNik === -1 &&
      (nk.includes("headdept") || nk.includes("hod") || nk.includes("kepaladepartemen") || (nk.includes("head") && !nk.includes("office")))
    ) {
      colHeadDeptNik = idx;
    } else if (
      colNik === -1 &&
      (nk === "nik" ||
        nk === "nikkaryawan" ||
        nk === "nomorinduk" ||
        nk === "nomorindukkaryawan" ||
        nk === "nonik" ||
        nk === "empid" ||
        nk === "employeeid" ||
        nk === "badgeid" ||
        nk === "nopegawai")
    ) {
      colNik = idx;
    } else if (
      colName === -1 &&
      (nk === "nama" ||
        nk === "namalengkap" ||
        nk === "name" ||
        nk === "namakaryawan" ||
        nk === "employeename" ||
        nk === "fullname")
    ) {
      colName = idx;
    } else if (
      colDept === -1 &&
      (nk === "departemen" ||
        nk === "department" ||
        nk === "dept" ||
        nk === "divisi" ||
        nk === "bagian" ||
        nk === "namadepartemen" ||
        nk.startsWith("depart") ||
        nk.startsWith("dept"))
    ) {
      colDept = idx;
    } else if (
      colPit === -1 &&
      (nk === "pit" ||
        nk === "namapit" ||
        nk === "kodepit" ||
        nk === "sektorpit" ||
        nk === "pitname" ||
        nk === "sektor" ||
        (nk.includes("pit") && !nk.includes("hospit")))
    ) {
      colPit = idx;
    } else if (
      colSite === -1 &&
      (nk === "site" ||
        nk === "operatingunit" ||
        nk === "ou" ||
        nk === "lokasi" ||
        nk === "lokasikerja" ||
        nk === "unitkerja" ||
        nk === "proyek" ||
        nk === "siteproyek" ||
        nk.includes("operatingunit") ||
        (nk.includes("site") && !nk.includes("website")))
    ) {
      colSite = idx;
    } else if (colPola === -1 && (nk.includes("pola") || nk.includes("penggajian") || nk.includes("payroll"))) {
      colPola = idx;
    } else if (
      colJobTitle === -1 &&
      (nk.includes("jobtitle") || nk.includes("jabatan") || nk.includes("position") || nk.includes("posisi"))
    ) {
      colJobTitle = idx;
    } else if (
      colJobLevel === -1 &&
      (nk.includes("joblevel") || nk === "level" || nk === "grade" || nk === "golongan" || nk === "jenjang")
    ) {
      colJobLevel = idx;
    } else if (
      colStatusStaff === -1 &&
      (nk.includes("statusstaff") || nk.includes("staffnonstaff") || nk.includes("statuskaryawan") || (nk.includes("status") && !nk.includes("mapping")))
    ) {
      colStatusStaff = idx;
    } else if (
      colArrivalDate === -1 &&
      (nk.includes("arrivaldate") ||
        nk.includes("dateofhire") ||
        nk.includes("tanggalmasuk") ||
        nk.includes("hiredate") ||
        nk.includes("tglmasuk") ||
        nk.includes("arrival") ||
        nk.includes("masuk") ||
        nk.includes("startdate"))
    ) {
      colArrivalDate = idx;
    } else if (colRole === -1 && (nk.includes("role") || nk === "rolesistem" || nk === "hakakses")) {
      colRole = idx;
    } else if (colDuration === -1 && (nk.includes("workingduration") || nk.includes("masakerja") || nk.includes("duration"))) {
      colDuration = idx;
    }
  });

  const result: RawEmployeeRow[] = [];

  for (let rIdx = headerRowIndex + 1; rIdx < rawMatrix.length; rIdx++) {
    const row = rawMatrix[rIdx];
    if (!Array.isArray(row)) continue;

    const getStr = (col: number) => (col >= 0 && col < row.length ? String(row[col] ?? "").trim() : "");

    const nik = getStr(colNik);
    const name = getStr(colName);
    const department = getStr(colDept);
    const pit = getStr(colPit);
    const siteRaw = getStr(colSite);
    const operatingUnit = siteRaw ? normalizeOperatingUnit(siteRaw) : "";
    const polaRaw = getStr(colPola);
    const polaPenggajian =
      polaRaw.toLowerCase().includes("ot") || polaRaw.toLowerCase().includes("overtime") || polaRaw.toLowerCase().includes("non")
        ? "OT"
        : "All In";
    const jobTitle = getStr(colJobTitle);
    let jobLevel = getStr(colJobLevel);
    const statusStaff = getStr(colStatusStaff);
    const arrivalRawVal = colArrivalDate >= 0 && colArrivalDate < row.length ? row[colArrivalDate] : "";
    const arrivalDate = parseFlexibleDate(arrivalRawVal);

    const roleRaw = getStr(colRole).toUpperCase();
    let role = "KARYAWAN";
    if (["ADMIN", "HEAD_DEPT", "PENILAI", "KARYAWAN"].includes(roleRaw)) {
      role = roleRaw;
    } else if (roleRaw.includes("ADMIN")) {
      role = "ADMIN";
    } else if (roleRaw.includes("HEAD") || roleRaw.includes("HOD")) {
      role = "HEAD_DEPT";
    } else if (roleRaw.includes("PENILAI") || roleRaw.includes("SUPERVISOR") || roleRaw.includes("SPV")) {
      role = "PENILAI";
    }

    const appraiserNik = getStr(colAppraiserNik);
    const headDeptNik = getStr(colHeadDeptNik);
    const workingDuration = getStr(colDuration);

    // Penyesuaian level dari status jika diperlukan
    if (
      statusStaff &&
      (statusStaff.toLowerCase().includes("non") ||
        statusStaff.toLowerCase() === "non staff" ||
        statusStaff.toLowerCase() === "non-staff")
    ) {
      if (!jobLevel || jobLevel.toLowerCase() === "staff" || jobLevel.toLowerCase() === "non staff" || jobLevel.toLowerCase() === "non-staff") {
        jobLevel = "Non Staff";
      }
    } else if (statusStaff && statusStaff.toLowerCase() === "staff") {
      if (!jobLevel) {
        jobLevel = "Staff";
      }
    }

    // Hanya baris yang memiliki NIK atau Nama yang diproses
    if (nik || name) {
      result.push({
        rowIndex: rIdx + 1,
        nik,
        name,
        department,
        pit: pit || undefined,
        operatingUnit,
        polaPenggajian,
        jobTitle,
        jobLevel,
        statusStaff,
        arrivalDate,
        role,
        appraiserNik,
        headDeptNik,
        workingDuration,
      });
    }
  }

  return result;
}
