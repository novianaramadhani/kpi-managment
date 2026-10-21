import * as XLSX from "xlsx";

// =========================================================================
// 1. DEPARTMENT EXPORT & IMPORT UTILITIES
// =========================================================================

export function exportDepartmentsToExcel(
  departments: { code: string; name: string }[],
  filename = "master_departemen.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name"];
  const rows = departments.map((d) => [d.code, d.name]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Departemen");
  XLSX.writeFile(wb, filename);
}

export function downloadDepartmentTemplate(filename = "template_departemen.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name"];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, "Departemen");
  XLSX.writeFile(wb, filename);
}

export async function parseDepartmentExcelFile(
  file: File
): Promise<{ code: string; name: string; site?: string }[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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
      const code = getVal("code", "kode", "kode departemen");
      const name = getVal("name", "nama", "nama departemen");
      const rawSite = getVal("site", "operating_unit", "unit", "cabang");
      const site = rawSite ? rawSite.toUpperCase() : "ALL";
      return { code, name, site };
    })
    .filter((r) => r.code || r.name);
}

// =========================================================================
// 2. JOB LEVEL EXPORT & IMPORT UTILITIES
// =========================================================================

export function exportJobLevelsToExcel(
  jobLevels: { code: string; name: string; rank: number }[],
  filename = "master_job_level.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name", "rank"];
  const rows = jobLevels.map((l) => [l.code, l.name, l.rank]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Job Level");
  XLSX.writeFile(wb, filename);
}

export function downloadJobLevelTemplate(filename = "template_job_level.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name", "rank"];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, "Job Level");
  XLSX.writeFile(wb, filename);
}

export async function parseJobLevelExcelFile(
  file: File
): Promise<{ code: string; name: string; rank: number }[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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
      const code = getVal("code", "kode", "kode level", "kode job level");
      const name = getVal("name", "nama", "nama level", "nama job level");
      const rankStr = getVal("rank", "tingkat", "level", "urutan");
      const rank = Number(rankStr) || 0;
      return { code, name, rank };
    })
    .filter((r) => r.code || r.name);
}

// =========================================================================
// 3. OPERATING UNIT EXPORT & IMPORT UTILITIES
// =========================================================================

export function exportOperatingUnitsToExcel(
  units: { id: string; name: string }[],
  filename = "master_operating_unit.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = ["id", "name"];
  const rows = units.map((u) => [u.id, u.name]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Operating Unit");
  XLSX.writeFile(wb, filename);
}

export function downloadOperatingUnitTemplate(filename = "template_operating_unit.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = ["id", "name"];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, "Operating Unit");
  XLSX.writeFile(wb, filename);
}

export async function parseOperatingUnitExcelFile(
  file: File
): Promise<{ id: string; name: string }[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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
      let id = getVal("id", "kode", "kode unit");
      const name = getVal("name", "nama", "nama unit", "operating unit").toUpperCase();
      if (!id && name) {
        id = `ou-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      }
      return { id, name };
    })
    .filter((r) => r.name);
}

// =========================================================================
// 4. JOB POSITION (JABATAN) EXPORT & IMPORT UTILITIES
// =========================================================================

// =========================================================================
// 4. JOB POSITION EXPORT & IMPORT UTILITIES
// =========================================================================

export function exportJobPositionsToExcel(
  positions: {
    code: string | null;
    name: string;
    departmentName?: string;
    jobLevelName?: string;
  }[],
  filename = "master_job_position.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name", "departemen", "job_level"];
  const rows = positions.map((p) => [
    p.code || "",
    p.name,
    p.departmentName || "Umum",
    p.jobLevelName || "Staff",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Master Job Position");
  XLSX.writeFile(wb, filename);
}

export function downloadJobPositionTemplate(filename = "template_job_position.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = ["code", "name", "kode_departemen", "kode_job_level"];
  const sampleRows = [
    ["HRGA-001", "Staff Administrasi", "HRGA", "STAFF"],
    ["PLT-001", "Supervisor Produksi", "PLT", "SPV"],
    ["IT-001", "IT Support", "IT", "STAFF"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, ws, "Master Job Position");
  XLSX.writeFile(wb, filename);
}

export async function parseJobPositionExcelFile(
  file: File
): Promise<{ code: string; name: string; departmentCode: string; jobLevelCode: string }[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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
      const code = getVal("code", "kode", "kode jabatan", "kode pos", "kode position");
      const name = getVal("name", "nama", "nama jabatan", "jabatan", "job position", "title");
      const departmentCode = getVal("kode_departemen", "departemen", "department", "dept", "kode dept");
      const jobLevelCode = getVal("kode_job_level", "job_level", "job level", "level", "kode level", "status", "status (staff/non staff)");
      return { code, name, departmentCode, jobLevelCode };
    })
    .filter((r) => r.name);
}

// =========================================================================
// 5. HEAD DEPARTMENT EXPORT UTILITIES
// =========================================================================

export function exportHeadDepartmentsToExcel(
  headDepts: {
    deptCode: string;
    deptName: string;
    operatingUnit: string;
    nik: string;
    name: string;
    jobPosition: string;
    status: string;
  }[],
  filename = "master_head_department.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Kode Departemen",
    "Nama Departemen",
    "Operating Unit",
    "NIK Head Dept",
    "Nama Head Dept",
    "Jabatan",
    "Status",
  ];
  const rows = headDepts.map((h) => [
    h.deptCode,
    h.deptName,
    h.operatingUnit,
    h.nik,
    h.name,
    h.jobPosition,
    h.status,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Head Department");
  XLSX.writeFile(wb, filename);
}

export function downloadHeadDepartmentTemplate(filename = "template_head_department.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Kode Departemen",
    "Nama Departemen",
    "Operating Unit",
    "NIK Head Dept",
    "Nama Head Dept",
    "Status",
  ];
  const sampleRows = [
    ["ACC", "Accounting", "HO", "1.1025.001", "Budi Santoso", "Active"],
    ["ENG", "Engineering", "AKP", "1.1025.002", "Siti Aminah", "Active"],
    ["HRD", "Human Resources", "GAM", "1.1025.003", "Ahmad Fauzi", "Active"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, ws, "Head Department");
  XLSX.writeFile(wb, filename);
}

export interface ParsedHeadDepartmentRow extends Record<string, unknown> {
  deptCode: string;
  deptName: string;
  operatingUnit: string;
  nik: string;
  employeeName: string;
  status: string;
}

export async function parseHeadDepartmentExcelFile(
  file: File
): Promise<ParsedHeadDepartmentRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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

      const deptCode = getVal(
        "kode departemen",
        "kode_departemen",
        "kode dept",
        "kode_dept",
        "dept_code",
        "department_code",
        "kode",
        "code"
      );
      const deptName = getVal(
        "nama departemen",
        "nama_departemen",
        "nama dept",
        "nama_dept",
        "dept_name",
        "department",
        "departemen",
        "name"
      );
      const operatingUnit = getVal(
        "operating unit",
        "operating_unit",
        "ou",
        "unit",
        "kode unit"
      );
      const nik = getVal(
        "nik head dept",
        "nik_head_dept",
        "nik head",
        "nik",
        "nik karyawan",
        "employee_nik"
      );
      const employeeName = getVal(
        "nama head dept",
        "nama_head_dept",
        "nama",
        "nama karyawan",
        "head dept",
        "head department",
        "nama lengkap"
      );
      const rawStatus = getVal("status", "status head dept", "status_head_dept");
      const status =
        rawStatus.toLowerCase() === "inactive" || rawStatus.toLowerCase() === "nonaktif"
          ? "Inactive"
          : "Active";

      return {
        deptCode,
        deptName,
        operatingUnit: operatingUnit ? operatingUnit.toUpperCase() : "",
        nik,
        employeeName,
        status,
      };
    })
    .filter(
      (r) =>
        r.deptCode ||
        r.deptName ||
        r.operatingUnit ||
        r.nik ||
        r.employeeName
    );
}

// =========================================================================
// 6. DEPARTMENT MAPPING EXPORT & IMPORT UTILITIES
// =========================================================================

export interface DepartmentMappingExportRow {
  site: string;
  rawDepartmentName: string;
  standardDepartmentCode?: string;
  standardDepartmentName?: string;
  pitName?: string | null;
  pitCode?: string | null;
  originalUnitDetail?: string;
  status: string;
  totalEmployees?: number;
  notes?: string;
}

export function exportDepartmentMappingsToExcel(
  mappings: DepartmentMappingExportRow[],
  filename = "master_mapping_departemen.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Site",
    "Nama Departemen Asli",
    "Kode Departemen Standar",
    "Nama Departemen Standar",
    "PIT",
    "Detail Unit",
    "Status Mapping",
    "Total Karyawan",
    "Catatan",
  ];
  const rows = mappings.map((m) => [
    m.site,
    m.rawDepartmentName,
    m.standardDepartmentCode || "",
    m.standardDepartmentName || "",
    m.pitName ? `${m.pitName} (${m.pitCode || ""})`.trim() : "",
    m.originalUnitDetail || "",
    m.status,
    m.totalEmployees || 0,
    m.notes || "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Mapping Departemen");
  XLSX.writeFile(wb, filename);
}

export function downloadDepartmentMappingTemplate(filename = "template_mapping_departemen.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Site",
    "Nama Departemen Asli",
    "Kode Departemen Standar",
    "PIT",
    "Detail Unit",
    "Catatan",
  ];
  const sampleRows = [
    ["GAM", "HRGA-JO", "HRGA", "", "", "Pemetaan Site GAM non-PIT"],
    ["GAM", "Produksi BCM Selatan", "PROD", "BCM Selatan", "", "Unit BCM Selatan dipetakan ke Produksi"],
    ["GAM", "Produksi BCM Utara", "PROD", "BCM Utara", "", "Unit BCM Utara dipetakan ke Produksi"],
    ["AKP", "Logistik", "LOGISTIC", "", "", "Site AKP logistik"],
    ["ALL", "TC", "TC", "", "", "Training Center"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, ws, "Template Mapping");
  XLSX.writeFile(wb, filename);
}

export interface ParsedDepartmentMappingExcelRow {
  site: string;
  rawDepartmentName: string;
  standardDepartmentCodeOrName?: string;
  pitCodeOrName?: string;
  originalUnitDetail?: string;
  notes?: string;
}

export async function parseDepartmentMappingExcelFile(
  file: File
): Promise<ParsedDepartmentMappingExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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

      const site = getVal("site", "operating unit", "unit", "kode site", "lokasi");
      const rawDepartmentName = getVal(
        "nama departemen asli",
        "departemen asli",
        "departemen asal",
        "raw department",
        "nama asli",
        "departemen",
        "department"
      );
      const standardDepartmentCodeOrName = getVal(
        "kode departemen standar",
        "departemen standar",
        "standard department",
        "nama standar",
        "kode standar",
        "standar"
      );
      const pitCodeOrName = getVal("pit", "nama pit", "kode pit", "master pit");
      const originalUnitDetail = getVal(
        "detail unit",
        "unit detail",
        "sub unit",
        "keterangan unit",
        "detail"
      );
      const notes = getVal("catatan", "notes", "keterangan");

      return {
        site: site ? site.toUpperCase() : "ALL",
        rawDepartmentName,
        standardDepartmentCodeOrName,
        pitCodeOrName,
        originalUnitDetail,
        notes,
      };
    })
    .filter((r) => r.rawDepartmentName);
}

export interface PitExportRow {
  code: string;
  name: string;
  site: string;
  departments?: string;
  description?: string | null;
  isActive: boolean;
  mappedDepartmentCount?: number;
  templateCount?: number;
}

export function exportPitsToExcel(pitsList: PitExportRow[], filename = "master_pit.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Kode PIT",
    "Nama PIT",
    "Site",
    "Departemen",
    "Keterangan",
    "Status",
    "Jumlah Mapping",
    "Jumlah Template",
  ];
  const rows = pitsList.map((p) => [
    p.code,
    p.name,
    p.site,
    p.departments || "-",
    p.description || "",
    p.isActive ? "Aktif" : "Nonaktif",
    p.mappedDepartmentCount || 0,
    p.templateCount || 0,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Master PIT");
  XLSX.writeFile(wb, filename);
}

export function downloadPitTemplate(filename = "template_master_pit.xlsx") {
  const wb = XLSX.utils.book_new();
  const headers = ["Kode PIT", "Nama PIT", "Site", "Departemen", "Keterangan"];
  const sampleRows = [
    ["BCM-S", "BCM Selatan", "GAM", "Produksi", "Pit penambangan BCM sektor selatan"],
    ["BCM-U", "BCM Utara", "GAM", "Produksi, HSE", "Pit penambangan BCM sektor utara"],
    ["BCM-B", "BCM Barat", "GAM", "Plant", "Pit penambangan BCM sektor barat"],
    ["PIT-AKP-1", "Pit AKP 1", "AKP", "Produksi", "Pit penambangan sektor 1 AKP"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, ws, "Template PIT");
  XLSX.writeFile(wb, filename);
}

export interface ParsedPitExcelRow {
  code: string;
  name: string;
  site?: string;
  departments?: string;
  description?: string;
}

export async function parsePitExcelFile(file: File): Promise<ParsedPitExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
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

      const code = getVal("kode pit", "kode", "code", "pit code");
      const name = getVal("nama pit", "nama", "name", "pit name", "pit");
      const site = getVal("site", "operating unit", "lokasi");
      const departments = getVal("departemen", "department", "dept");
      const description = getVal("keterangan", "deskripsi", "description", "catatan");

      return {
        code,
        name,
        site: site ? site.toUpperCase() : "GAM",
        departments,
        description,
      };
    })
    .filter((r) => r.code && r.name);
}
