/**
 * Utilitas murni untuk normalisasi, deteksi duplikasi, dan tipe data Department Mapping
 * (Bebas dari direktif "use server" agar dapat diekspor sinkron & aman)
 */

export function normalizeDeptName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

export function normalizeDeptNameSync(name: string): string {
  return normalizeDeptName(name);
}

export function cleanSiteCode(site?: string | null): string {
  if (!site) return "";
  let s = site.trim().toUpperCase();

  // Strip leading prefixes like "SITE ", "PT ", "PT. ", "LOKASI ", "PROJECT "
  s = s.replace(/^(SITE|PT\.?|LOKASI|PROJECT|PROYEK)\s+/i, "");

  // Strip trailing company descriptions like " - PT GANDA ALAM MAKMUR" or " (PT ...)"
  s = s.replace(/\s*\(.*?\)/g, "").trim();
  s = s.split(/\s*[-–—]\s*(?:PT|SITE)/i)[0].trim();

  // Check Head Office alias
  if (s === "HO" || s === "HEAD OFFICE" || s === "HEADOFFICE" || s === "SAMARINDA" || s.startsWith("HEAD OFFICE")) {
    return "HO";
  }

  // Strip all non-alphanumeric characters (spaces, hyphens, underscores, dots, slashes)
  return s.replace(/[^A-Z0-9]/g, "");
}

export function normalizeSite(site?: string | null): string {
  if (!site) return "";
  return site.trim().toUpperCase().replace(/\s+/g, " ");
}

export function matchesSite(site1?: string | null, site2?: string | null): boolean {
  if (!site1 || !site2) return false;
  const s1 = normalizeSite(site1);
  const s2 = normalizeSite(site2);
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;

  const c1 = cleanSiteCode(s1);
  const c2 = cleanSiteCode(s2);
  if (c1 && c2 && c1 === c2) return true;

  return false;
}

export function cleanDeptBaseName(name?: string | null): string {
  if (!name) return "";
  let str = normalizeDeptName(name);
  // 1. Strip trailing parenthesized site/location/descriptor e.g. "(GAM)", "(AKP)", "(HO)", "(JO)", "(JO-IC)", "(WS89)"
  str = str.replace(/\s*\([^)]*\)$/, "").trim();
  // 2. Strip trailing dash site e.g. "- GAM", "- AKP", "- HO", "- JO", "- JO-IC", "- JO IC", "- WS89", "- IC"
  str = str.replace(/\s*[-–—]\s*(?:GAM|AKP|HO|JO|JO-IC|JO IC|WS89|IC)$/i, "").trim();
  // 3. Strip trailing site code e.g. "Produksi JO" -> "Produksi"
  str = str.replace(/\s+(?:GAM|AKP|HO|JO|JO-IC|WS89)$/i, "").trim();
  return str;
}

export function matchesDeptName(name1?: string | null, name2?: string | null): boolean {
  if (!name1 || !name2) return false;
  const n1 = normalizeDeptName(name1);
  const n2 = normalizeDeptName(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  const stripSymbols = (s: string) => s.replace(/[^A-Z0-9]/g, "");
  if (stripSymbols(n1) === stripSymbols(n2)) return true;

  const cleanSpaced = (s: string) => s.replace(/[^A-Z0-9]+/g, " ").trim();
  if (cleanSpaced(n1) === cleanSpaced(n2)) return true;

  // Bandingkan setelah membersihkan suffix site/parentesis (e.g. "Produksi Mining Service (GAM)" ↔ "Produksi Mining Service")
  const b1 = cleanDeptBaseName(n1);
  const b2 = cleanDeptBaseName(n2);
  if (b1 && b2) {
    if (b1 === b2) return true;
    if (stripSymbols(b1) === stripSymbols(b2)) return true;
    if (cleanSpaced(b1) === cleanSpaced(b2)) return true;
  }

  return false;
}

/**
 * Menghitung koefisien kesamaan dua string (0 sampai 1) berdasarkan Levenshtein distance
 */
export function calculateStringSimilarity(s1: string, s2: string): number {
  const str1 = normalizeDeptNameSync(s1);
  const str2 = normalizeDeptNameSync(s2);

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // insertion
        track[j - 1][i] + 1, // deletion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = track[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

/**
 * Daftar kamus alias dan variasi nama umum antar bahasa (ID/EN) & singkatan
 */
export const COMMON_DEPARTMENT_ALIASES: Record<string, string[]> = {};

export function extractUnitDetail(rawName: string): { base: string; detail: string | null } {
  if (!rawName) return { base: "", detail: null };
  const trimmed = rawName.trim();

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return { base: parenMatch[1].trim(), detail: parenMatch[2].trim() };
  }

  const dashMatch = trimmed.match(/^([A-Za-z0-9\s]+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { base: dashMatch[1].trim(), detail: dashMatch[2].trim() };
  }

  return { base: trimmed, detail: null };
}

/**
 * Memeriksa apakah dua nama departemen adalah variasi atau berpotensi sama
 */
export function isDepartmentVariation(
  name1: string,
  name2: string
): { isVariation: boolean; reason?: string; similarityScore: number } {
  const clean1 = normalizeDeptNameSync(name1);
  const clean2 = normalizeDeptNameSync(name2);

  if (!clean1 || !clean2) return { isVariation: false, similarityScore: 0 };
  if (clean1 === clean2) {
    return { isVariation: true, reason: "Nama identik (beda spasi/huruf besar-kecil)", similarityScore: 1.0 };
  }

  // Cek kamus alias
  const aliases1 = COMMON_DEPARTMENT_ALIASES[clean1] || [];
  if (aliases1.includes(clean2)) {
    return { isVariation: true, reason: `Variasi istilah / singkatan resmi (${clean1} ↔ ${clean2})`, similarityScore: 0.95 };
  }

  // Cek substring inklusif jika salah satu diawali atau memuat nama lain
  if (clean1.startsWith(clean2) || clean2.startsWith(clean1)) {
    return { isVariation: true, reason: "Nama memuat frasa cabang atau unit tambahan", similarityScore: 0.88 };
  }

  // Cek kesamaan karakter Levenshtein
  const sim = calculateStringSimilarity(clean1, clean2);
  if (sim >= 0.75) {
    return { isVariation: true, reason: `Kemiripan penulisan tinggi (${Math.round(sim * 100)}%)`, similarityScore: sim };
  }

  return { isVariation: false, similarityScore: sim };
}

export interface DepartmentMappingWithDetails {
  id: number;
  site: string;
  rawDepartmentName: string;
  cleanRawName: string;
  departmentId: number | null;
  pitId: number | null;
  originalUnitDetail: string | null;
  status: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  standardDepartmentName?: string;
  standardDepartmentCode?: string;
  pitName?: string | null;
  pitCode?: string | null;
  totalEmployees: number;
  hasCrossSiteConflict?: boolean;
}

export interface ParsedDepartmentMappingItem {
  site: string;
  rawDepartmentName: string;
  standardDepartmentCodeOrName?: string;
  pitCodeOrName?: string;
  originalUnitDetail?: string;
  notes?: string;
}

// -------------------------------------------------------------------------
// TIPE DATA DETEKSI DUPLIKASI DAN ASSIGN MAPPING UNTUK IMPORT DEPARTEMEN
// -------------------------------------------------------------------------

export type DepartmentDetectionStatus =
  | "UNIQUE" // Nama dan kode unik, siap dibuat departemen standar baru
  | "ALREADY_MAPPED" // Sudah ada di tab Mapping Departemen
  | "EXACT_DB" // Duplikat persis di database Master Departemen
  | "NAME_EXISTS_DB" // Nama sudah ada di DB dengan kode berbeda
  | "CODE_CONFLICT" // Kode sudah dipakai di DB dengan nama berbeda
  | "VARIATION" // Mirip atau variasi dari departemen standar yang ada (Perlu Validasi)
  | "DUPLICATE_IN_FILE"; // Duplikat baris dalam file Excel itu sendiri

export type DepartmentImportResolutionAction =
  | "CREATE_NEW" // Buat Master Departemen baru
  | "ASSIGN_MAPPING" // Simpan ke Mapping Departemen (Hubungkan ke standar)
  | "SKIP"; // Abaikan saat import (tidak disimpan)

export interface DepartmentImportPreviewRow {
  id: string; // ID baris unik untuk React state
  rowIndex: number;
  code: string;
  name: string;
  cleanName: string;
  site: string; // 'ALL' | 'GAM' | 'AKP' | 'HO'

  // Hasil Analisis Sistem
  status: DepartmentDetectionStatus;
  statusBadgeText: string;
  isConflict: boolean; // Jika true, wajib diselesaikan sebelum submit import
  detectionReason: string;
  suggestedDepartmentId?: number | null;
  suggestedDepartmentName?: string;
  suggestedDepartmentCode?: string;

  // Resolusi yang Dipilih Admin
  resolutionAction: DepartmentImportResolutionAction;
  targetDepartmentId?: number | null;
  targetDepartmentCode?: string;
  targetDepartmentName?: string;
  mappingSite?: string;
  mappingStatus?: "MAPPED" | "PENDING_VALIDATION";
  originalUnitDetail?: string | null;
  resolutionNotes?: string;
}

export interface DepartmentImportSummaryStats {
  total: number;
  uniqueCount: number;
  mappedCount: number;
  duplicateCount: number;
  pendingCount: number;
  canProceed: boolean;
}

/**
 * Fungsi cerdas untuk mendeteksi duplikasi, variasi, dan penugasan mapping
 * saat file Excel departemen diunggah.
 */
export function analyzeDepartmentExcelRows(
  rows: { code: string; name: string; site?: string }[],
  existingDepartments: { id: number; code: string; name: string }[],
  existingMappings: DepartmentMappingWithDetails[] = []
): { items: DepartmentImportPreviewRow[]; stats: DepartmentImportSummaryStats } {
  const existingDeptByCode = new Map(
    existingDepartments.map((d) => [d.code.trim().toUpperCase(), d])
  );

  const seenCodesInFile = new Map<string, number>();

  const items: DepartmentImportPreviewRow[] = rows.map((row, index) => {
    const rawCode = (row.code || "").trim();
    const rawName = (row.name || "").trim();
    const cleanCode = rawCode.toUpperCase();
    const cleanName = normalizeDeptNameSync(rawName);
    const site = (row.site || "ALL").trim().toUpperCase() || "ALL";

    const { detail: extractedDetail } = extractUnitDetail(rawName);

    const codeCount = (seenCodesInFile.get(cleanCode) || 0) + 1;
    seenCodesInFile.set(cleanCode, codeCount);

    let status: DepartmentDetectionStatus = "UNIQUE";
    let statusBadgeText = "Baru";
    let isConflict = false;
    let detectionReason = "Departemen baru, siap ditambahkan ke Master Departemen.";
    let resolutionAction: DepartmentImportResolutionAction = "CREATE_NEW";

    const deptWithSameCode = existingDeptByCode.get(cleanCode);

    if (codeCount > 1) {
      status = "DUPLICATE_IN_FILE";
      statusBadgeText = "Duplikat di File";
      isConflict = false;
      detectionReason = "Kode muncul lebih dari satu kali di file Excel ini (baris berulang akan dilewati).";
      resolutionAction = "SKIP";
    } else if (deptWithSameCode) {
      status = "EXACT_DB";
      statusBadgeText = "Pembaruan";
      isConflict = false;
      detectionReason = `Kode [${cleanCode}] sudah terdaftar (${deptWithSameCode.name}). Data nama akan diperbarui.`;
      resolutionAction = "CREATE_NEW";
    } else {
      status = "UNIQUE";
      statusBadgeText = "Baru";
      isConflict = false;
      detectionReason = "Departemen baru, siap ditambahkan ke Master Departemen.";
      resolutionAction = "CREATE_NEW";
    }

    return {
      id: `row-${index}-${cleanCode || "nocode"}`,
      rowIndex: index + 1,
      code: rawCode,
      name: rawName,
      cleanName,
      site,
      status,
      statusBadgeText,
      isConflict,
      detectionReason,
      suggestedDepartmentId: null,
      suggestedDepartmentName: "",
      suggestedDepartmentCode: "",
      resolutionAction,
      targetDepartmentId: deptWithSameCode?.id || null,
      targetDepartmentName: rawName,
      targetDepartmentCode: rawCode,
      mappingSite: site,
      mappingStatus: "MAPPED",
      originalUnitDetail: extractedDetail,
      resolutionNotes: `Diimpor dari file Excel Master Departemen (${statusBadgeText})`,
    };
  });

  let uniqueCount = 0;
  let duplicateCount = 0;

  for (const it of items) {
    if (it.resolutionAction === "CREATE_NEW") {
      uniqueCount++;
    } else if (it.resolutionAction === "SKIP") {
      duplicateCount++;
    }
  }

  const canProceed = items.length > 0 && uniqueCount > 0;

  return {
    items,
    stats: {
      total: items.length,
      uniqueCount,
      mappedCount: 0,
      duplicateCount,
      pendingCount: 0,
      canProceed,
    },
  };
}

export interface SmartDepartmentImportPayload {
  departmentsToCreate: {
    code: string;
    name: string;
  }[];
  mappingsToSave: {
    site: string;
    rawDepartmentName: string;
    cleanRawName: string;
    targetDepartmentId?: number | null;
    targetDepartmentCode?: string;
    originalUnitDetail?: string | null;
    status: "MAPPED" | "PENDING_VALIDATION";
    notes?: string | null;
  }[];
  skippedCount?: number;
}

export interface SmartDepartmentImportResult {
  success: boolean;
  createdDepartmentsCount: number;
  savedMappingsCount: number;
  skippedDuplicatesCount: number;
  errors: string[];
}
