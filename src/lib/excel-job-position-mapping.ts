import * as XLSX from "xlsx";
import type {
  JobPositionMappingWithDetails,
  ParsedJobPositionMappingRow,
  CategoryEmployeeDetail,
} from "./job-position-mapping-actions";

/**
 * Export data mapping Job Position ke Excel (.xlsx)
 */
export function exportJobPositionMappingsToExcel(
  items: JobPositionMappingWithDetails[],
  filename = "mapping_job_position.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    "No",
    "Kode Departemen",
    "Nama Departemen",
    "Kode Job Position",
    "Nama Job Position",
    "Job Level (Staff / Non Staff)",
    "Job Category",
    "Status Mapping",
    "Jumlah Karyawan",
    "Catatan",
  ];

  const rows = items.map((item, idx) => [
    idx + 1,
    item.departmentCode || "",
    item.departmentName || "",
    item.positionCode || "",
    item.positionName || "",
    item.jobLevelName || "Belum Dipetakan",
    item.jobCategoryName || "Belum Dipetakan",
    item.isMapped ? "Lengkap" : item.isPartiallyMapped ? "Belum Lengkap" : "Belum Dimapping",
    item.employeeCount,
    item.notes || "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws["!cols"] = [
    { wch: 6 },  // No
    { wch: 16 }, // Kode Dept
    { wch: 28 }, // Nama Dept
    { wch: 18 }, // Kode Posisi
    { wch: 34 }, // Nama Posisi
    { wch: 24 }, // Job Level
    { wch: 20 }, // Job Category
    { wch: 18 }, // Status
    { wch: 16 }, // Jumlah Karyawan
    { wch: 30 }, // Catatan
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Mapping Job Position");
  XLSX.writeFile(wb, filename);
}

/**
 * Download Template Excel untuk Import Mapping Job Position
 */
export function downloadJobPositionMappingTemplate(
  existingPositions: Array<{
    departmentCode: string;
    departmentName: string;
    positionCode: string | null;
    positionName: string;
    jobLevelName?: string | null;
    jobCategoryName?: string | null;
  }> = [],
  availableCategories: string[] = ["Manager", "Superintendent", "SPV", "Foreman", "Engineer", "Admin", "Mekanik", "Operator", "Staff", "Others"],
  filename = "template_mapping_job_position.xlsx"
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data Input
  const headers = [
    "Kode Departemen",
    "Nama Departemen",
    "Kode Job Position",
    "Nama Job Position",
    "Job Level (Staff / Non Staff)",
    "Job Category",
    "Catatan",
  ];

  const sampleRows =
    existingPositions.length > 0
      ? existingPositions.map((p) => [
          p.departmentCode,
          p.departmentName,
          p.positionCode || "",
          p.positionName,
          p.jobLevelName || "",
          p.jobCategoryName || "",
          "",
        ])
      : [
          ["HSEC", "Health Safety Environment & Community", "HSEC-001", "Supervisor Security", "Staff", "SPV", "Contoh data"],
          ["PLT", "Plant", "PLT-002", "Mekanik Alat Berat", "Non Staff", "Mekanik", "Contoh data"],
          ["ENG", "Engineering", "ENG-003", "Mine Plan Engineer", "Staff", "Engineer", "Contoh data"],
        ];

  const wsData = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  wsData["!cols"] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
    { wch: 34 },
    { wch: 26 },
    { wch: 20 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsData, "Mapping");

  // Sheet 2: Petunjuk & Referensi
  const refHeaders = ["Klasifikasi", "Nilai Valid", "Keterangan"];
  const refRows = [
    ["Job Level", "Staff", "Hanya bernilai Staff atau Non Staff (dari Master Job Level)"],
    ["Job Level", "Non Staff", "Hanya bernilai Staff atau Non Staff (dari Master Job Level)"],
    ...availableCategories.map((c) => ["Job Category", c, "Kategori master. Jika mengisi kategori baru, sistem otomatis mendaftarkannya"]),
  ];

  const wsRef = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
  wsRef["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsRef, "Referensi Klasifikasi");

  XLSX.writeFile(wb, filename);
}

/**
 * Parse file Excel yang diunggah untuk mapping
 */
export async function parseJobPositionMappingExcelFile(file: File): Promise<ParsedJobPositionMappingRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return rawRows
    .map((row) => {
      const keys = Object.keys(row);
      const getVal = (...names: string[]) => {
        for (const n of names) {
          const foundKey = keys.find((k) => k.trim().toLowerCase() === n.toLowerCase());
          if (foundKey && row[foundKey] !== undefined) return String(row[foundKey]).trim();
        }
        return "";
      };

      const departmentCode = getVal("kode departemen", "kode dept", "department code", "dept code");
      const departmentName = getVal("nama departemen", "departemen", "department name", "dept name");
      const positionCode = getVal("kode job position", "kode jabatan", "kode posisi", "position code", "job code");
      const positionName = getVal(
        "nama job position",
        "job position",
        "nama jabatan",
        "jabatan",
        "position name",
        "posisi"
      );
      const jobLevelName = getVal("job level (staff / non staff)", "job level", "level", "klasifikasi level");
      const jobCategoryName = getVal("job category", "kategori job", "kategori jabatan", "category");
      const notes = getVal("catatan", "notes", "keterangan");

      return {
        departmentCode,
        departmentName,
        positionCode,
        positionName,
        jobLevelName,
        jobCategoryName,
        notes,
      };
    })
    .filter((r) => r.positionName);
}

/**
 * Export daftar karyawan dalam kategori tertentu ke file Excel (.xlsx)
 */
export function exportCategoryEmployeesToExcel(
  categoryName: string,
  categoryCode: string,
  employees: CategoryEmployeeDetail[],
  filename?: string
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    "No",
    "NIK",
    "Nama Karyawan",
    "Kode Dept",
    "Nama Departemen",
    "Job Position (Jabatan)",
    "Job Level",
    "Job Category",
    "Status Karyawan",
  ];

  const rows = employees.map((emp, idx) => [
    idx + 1,
    emp.nik,
    emp.name,
    emp.departmentCode,
    emp.departmentName,
    emp.jobPositionName,
    emp.jobLevelName || "-",
    `${categoryName} (${categoryCode})`,
    emp.isActive ? "Aktif" : "Non-Aktif",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 6 },  // No
    { wch: 16 }, // NIK
    { wch: 30 }, // Nama Karyawan
    { wch: 12 }, // Kode Dept
    { wch: 26 }, // Nama Dept
    { wch: 32 }, // Job Position
    { wch: 16 }, // Job Level
    { wch: 22 }, // Job Category
    { wch: 16 }, // Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Daftar Karyawan");
  const finalName =
    filename ||
    `karyawan_kategori_${(categoryCode || categoryName).toLowerCase().replace(/\s+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, finalName);
}


