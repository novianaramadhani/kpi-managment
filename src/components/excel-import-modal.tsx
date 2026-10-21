"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, Pit } from "@/db/schema";
import type { EmployeeBatchInput } from "@/lib/actions";
import {
  type DepartmentMappingWithDetails,
  normalizeDeptName,
  matchesSite,
  matchesDeptName,
} from "@/lib/department-mapping-utils";
import { getDepartmentMappingsAction } from "@/lib/department-mapping-actions";
import { downloadEmployeeTemplate, parseEmployeeExcelFile, type RawEmployeeRow } from "@/lib/excel-template";
import {
  FileSpreadsheet,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";

interface ValidatedRow {
  raw: RawEmployeeRow;
  isValid: boolean;
  isUpdate: boolean;
  errors: string[];
  matchedDeptId: number;
  matchedDeptName: string;
  matchedDeptCode?: string;
  matchedPitId?: number | null;
  matchedPitName?: string;
  matchedPitCode?: string;
  matchedJobLevelId: number;
  matchedJobLevelName: string;
  operatingUnit: string;
  normalizedDeptName: string;
  polaPenggajian: string;
  calculatedDuration: string;
  mappingStatus: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION";
  mappingSource: "SITE_MAPPING" | "GLOBAL_MAPPING" | "DIRECT_MATCH" | "QUICK_MAPPED" | "NONE";
}

function calculateWorkingDuration(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const start = new Date(dateStr);
  if (isNaN(start.getTime())) return "-";
  const now = new Date();
  const months = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} bulan`;
  if (remMonths === 0) return `${years} tahun`;
  return `${years} tahun ${remMonths} bulan`;
}

function validateEmployeeRows(
  parsed: RawEmployeeRow[],
  mappings: DepartmentMappingWithDetails[],
  departments: Department[],
  jobLevels: JobLevel[],
  existingEmployees: Employee[],
  pits: Pit[] = []
): ValidatedRow[] {
  const existingNikMap = new Map(existingEmployees.map((emp) => [emp.nik.toLowerCase(), emp]));
  const fileNikCount: Record<string, number> = {};
  parsed.forEach((r) => {
    if (r.nik) {
      const k = r.nik.toLowerCase();
      fileNikCount[k] = (fileNikCount[k] || 0) + 1;
    }
  });

  return parsed.map((r) => {
    const errors: string[] = [];

    // 1. NIK
    if (!r.nik) {
      errors.push("NIK wajib diisi");
    } else if (fileNikCount[r.nik.toLowerCase()] > 1) {
      errors.push("NIK duplikat dalam file Excel");
    }
    const isUpdate = Boolean(r.nik && existingNikMap.has(r.nik.toLowerCase()));

    // 2. Nama
    if (!r.name) {
      errors.push("Nama karyawan wajib diisi");
    }

    // 3. Operating Unit / Site (PENTING: Jangan ubah site sumber atau otomatis menggantinya dengan HO)
    const opUnit = (r.operatingUnit ? r.operatingUnit.trim() : "").toUpperCase() || "HO";

    // 4. Normalisasi dan Pencocokan Departemen Bertingkat (Mapping Departemen) & PIT
    const rawDept = r.department ? r.department.trim() : "";
    const normDept = normalizeDeptName(rawDept);

    let matchedDep: Department | undefined = undefined;
    let matchedDeptCode: string | undefined = undefined;
    let matchedDeptName = rawDept;
    let matchedDeptId = 0;
    let matchedPitId: number | null | undefined = undefined;
    let matchedPitName: string | undefined = undefined;
    let matchedPitCode: string | undefined = undefined;
    let mappingStatus: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION" = "UNMAPPED";
    let mappingSource: "SITE_MAPPING" | "GLOBAL_MAPPING" | "DIRECT_MATCH" | "QUICK_MAPPED" | "NONE" = "NONE";

    // Prioritas 1: Cari kandidat mapping spesifik Site
    const siteMappingCandidates = mappings.filter(
      (m) =>
        matchesSite(m.site, opUnit) &&
        (matchesDeptName(m.cleanRawName, rawDept) ||
          matchesDeptName(m.rawDepartmentName, rawDept) ||
          (m.originalUnitDetail && matchesDeptName(m.originalUnitDetail, rawDept)) ||
          (m.pitName && matchesDeptName(m.pitName, rawDept)))
    );

    // Ketentuan 5: Validasi ambiguitas PIT jika kandidat mapping memiliki beberapa target PIT berbeda
    const candidatePitIds = Array.from(
      new Set(
        siteMappingCandidates
          .map((m) => m.pitId)
          .filter((pid): pid is number => pid !== null && pid !== undefined)
      )
    );
    const isPitAmbiguous = candidatePitIds.length > 1;
    if (isPitAmbiguous) {
      errors.push(
        `Mapping PIT ambigu untuk departemen "${rawDept}" (Site ${opUnit}): ditemukan beberapa PIT terkait. Mohon periksa konfigurasi Mapping Departemen.`
      );
    }

    const siteMapping = siteMappingCandidates[0];

    if (siteMapping && siteMapping.departmentId) {
      matchedDep = departments.find((d) => d.id === siteMapping.departmentId);
      matchedDeptId = siteMapping.departmentId;
      matchedDeptName = siteMapping.standardDepartmentName || matchedDep?.name || rawDept;
      matchedDeptCode = siteMapping.standardDepartmentCode || matchedDep?.code;
      mappingSource = "SITE_MAPPING";

      if (!isPitAmbiguous && siteMapping.pitId) {
        matchedPitId = siteMapping.pitId;
        matchedPitName = siteMapping.pitName || pits.find((p) => p.id === siteMapping.pitId)?.name;
        matchedPitCode = siteMapping.pitCode || pits.find((p) => p.id === siteMapping.pitId)?.code;
      }

      if (siteMapping.status === "PENDING_VALIDATION") {
        mappingStatus = "PENDING_VALIDATION";
        errors.push(`Departemen "${rawDept}" (Site ${opUnit}) perlu validasi mapping.`);
      } else if (siteMapping.status === "UNMAPPED") {
        mappingStatus = "UNMAPPED";
        errors.push(
          `Departemen "${rawDept}" (Site ${opUnit}) belum dipetakan. [Diagnostik: Site="${opUnit}", Dept="${rawDept}", Normalisasi="${normDept}"]`
        );
      } else {
        mappingStatus = "MAPPED";
      }
    } else {
      // Prioritas 2: Cari pada mapping global (Site: 'ALL')
      const globalMapping = mappings.find(
        (m) =>
          m.site === "ALL" &&
          (matchesDeptName(m.cleanRawName, rawDept) ||
            matchesDeptName(m.rawDepartmentName, rawDept) ||
            (m.originalUnitDetail && matchesDeptName(m.originalUnitDetail, rawDept)) ||
            (m.pitName && matchesDeptName(m.pitName, rawDept)))
      );

      if (globalMapping && globalMapping.departmentId) {
        matchedDep = departments.find((d) => d.id === globalMapping.departmentId);
        matchedDeptId = globalMapping.departmentId;
        matchedDeptName = globalMapping.standardDepartmentName || matchedDep?.name || rawDept;
        matchedDeptCode = globalMapping.standardDepartmentCode || matchedDep?.code;
        mappingSource = "GLOBAL_MAPPING";

        if (globalMapping.pitId) {
          matchedPitId = globalMapping.pitId;
          matchedPitName = globalMapping.pitName || pits.find((p) => p.id === globalMapping.pitId)?.name;
          matchedPitCode = globalMapping.pitCode || pits.find((p) => p.id === globalMapping.pitId)?.code;
        }

        if (globalMapping.status === "PENDING_VALIDATION") {
          mappingStatus = "PENDING_VALIDATION";
          errors.push(`Departemen "${rawDept}" perlu validasi mapping.`);
        } else if (globalMapping.status === "UNMAPPED") {
          mappingStatus = "UNMAPPED";
          errors.push(
            `Departemen "${rawDept}" belum dipetakan. [Diagnostik: Site="${opUnit}", Dept="${rawDept}", Normalisasi="${normDept}"]`
          );
        } else {
          mappingStatus = "MAPPED";
        }
      } else {
        // Prioritas 2.5: Cari pada mapping apa pun jika nama asli atau PIT cocok
        const fallbackMapping = mappings.find(
          (m) =>
            m.departmentId &&
            (matchesDeptName(m.cleanRawName, rawDept) ||
              matchesDeptName(m.rawDepartmentName, rawDept) ||
              (m.originalUnitDetail && matchesDeptName(m.originalUnitDetail, rawDept)))
        );

        if (fallbackMapping && fallbackMapping.departmentId) {
          matchedDep = departments.find((d) => d.id === fallbackMapping.departmentId);
          matchedDeptId = fallbackMapping.departmentId;
          matchedDeptName = fallbackMapping.standardDepartmentName || matchedDep?.name || rawDept;
          matchedDeptCode = fallbackMapping.standardDepartmentCode || matchedDep?.code;
          mappingSource = "SITE_MAPPING";
          mappingStatus = "MAPPED";

          if (fallbackMapping.pitId) {
            matchedPitId = fallbackMapping.pitId;
            matchedPitName = fallbackMapping.pitName || pits.find((p) => p.id === fallbackMapping.pitId)?.name;
            matchedPitCode = fallbackMapping.pitCode || pits.find((p) => p.id === fallbackMapping.pitId)?.code;
          }
        } else {
          // Prioritas 3: Cari pencocokan eksak pada Master Departemen standar
          const directMatch = departments.find(
            (d) => d.code.toUpperCase() === normDept || matchesDeptName(d.name, rawDept)
          );

          if (directMatch) {
            matchedDep = directMatch;
            matchedDeptId = directMatch.id;
            matchedDeptName = directMatch.name;
            matchedDeptCode = directMatch.code;
            mappingStatus = "MAPPED";
            mappingSource = "DIRECT_MATCH";
          } else {
            // Prioritas 4: Belum terpetakan
            mappingStatus = "UNMAPPED";
            mappingSource = "NONE";
            errors.push(
              `Departemen "${rawDept || "(kosong)"}" pada Site "${opUnit}" belum dipetakan. [Diagnostik: Site="${opUnit}", Dept="${rawDept}", Normalisasi="${normDept}"]`
            );
          }
        }
      }
    }

    // 4.1 Validasi Kolom PIT dari file Excel jika ada (Ketentuan 5)
    if (r.pit && r.pit.trim()) {
      const cleanPit = r.pit.trim().toLowerCase();
      const foundPit =
        pits.find(
          (p) =>
            matchesSite(p.site, opUnit) &&
            (p.code.toLowerCase() === cleanPit ||
              p.name.toLowerCase() === cleanPit ||
              cleanPit.includes(p.name.toLowerCase()) ||
              p.name.toLowerCase().includes(cleanPit))
        ) ||
        pits.find(
          (p) =>
            p.code.toLowerCase() === cleanPit ||
            p.name.toLowerCase() === cleanPit
        );

      if (!foundPit) {
        errors.push(`PIT "${r.pit}" tidak ditemukan pada Master PIT (Site ${opUnit}). Mohon periksa kembali.`);
      } else {
        if (matchedPitId && matchedPitId !== foundPit.id) {
          errors.push(
            `Konflik PIT: Departemen "${rawDept}" terpetakan ke PIT "${matchedPitName || matchedPitId}", namun kolom PIT pada file menyebutkan "${r.pit}".`
          );
        } else {
          matchedPitId = foundPit.id;
          matchedPitName = foundPit.name;
          matchedPitCode = foundPit.code;
        }
      }
    }

    // 4.2 Cek jika nama departemen secara eksplisit mengindikasikan PIT tertentu tetapi mapping tidak menetapkan PIT
    if (!matchedPitId && rawDept && pits.length > 0) {
      const impliedPit = pits.find(
        (p) =>
          matchesSite(p.site, opUnit) &&
          (rawDept.toLowerCase().includes(p.name.toLowerCase()) ||
            rawDept.toLowerCase().includes(p.code.toLowerCase()))
      );
      if (impliedPit) {
        errors.push(
          `Departemen "${rawDept}" mengindikasikan PIT (${impliedPit.name}), namun mapping belum menetapkan PIT standar. Mohon periksa konfigurasi mapping departemen.`
        );
      }
    }

    // 5. Job Title
    if (!r.jobTitle) {
      errors.push("Job Title (Jabatan) wajib diisi");
    }

    // 6. Job Level (dengan pembacaan kolom Job Level & Status Staff/Non Staff)
    const cleanStr = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rawLvlClean = cleanStr(r.jobLevel);
    const statusClean = cleanStr(r.statusStaff);

    let matchedLvl: JobLevel | undefined = undefined;

    // Prioritas 1: Jika status kepegawaian atau job level menyebut Non Staff
    if (statusClean.includes("nonstaff") || rawLvlClean.includes("nonstaff")) {
      matchedLvl = jobLevels.find(
        (l) => cleanStr(l.code) === "nonstaff" || cleanStr(l.name) === "nonstaff" || l.rank === 0
      );
    }

    // Prioritas 2: Pencocokan langsung dari kolom Job Level jika belum matched
    if (!matchedLvl && rawLvlClean) {
      matchedLvl = jobLevels.find(
        (l) => cleanStr(l.code) === rawLvlClean || cleanStr(l.name) === rawLvlClean
      );

      if (!matchedLvl) {
        if (rawLvlClean.includes("mgr") || rawLvlClean.includes("manager")) {
          matchedLvl = jobLevels.find((l) => l.code === "MGR" || l.rank === 4);
        } else if (rawLvlClean.includes("supt") || rawLvlClean.includes("superintendent")) {
          matchedLvl = jobLevels.find((l) => l.code === "SUPT" || l.rank === 3);
        } else if (rawLvlClean.includes("spv") || rawLvlClean.includes("supervisor")) {
          matchedLvl = jobLevels.find((l) => l.code === "SPV" || l.rank === 2);
        } else if (rawLvlClean.includes("staff")) {
          matchedLvl = jobLevels.find((l) => l.code === "STAFF" || l.rank === 1);
        }
      }
    }

    // Prioritas 3: Jika kolom status menyatakan "Staff" (bukan non-staff)
    if (!matchedLvl && statusClean === "staff") {
      matchedLvl = jobLevels.find((l) => l.code === "STAFF" || l.rank === 1);
    }

    // Prioritas 4: Deteksi otomatis berdasarkan kata kunci posisi lapangan
    if (!matchedLvl && r.jobTitle) {
      const jtClean = cleanStr(r.jobTitle);
      if (
        jtClean.includes("operator") ||
        jtClean.includes("driver") ||
        jtClean.includes("mekanik") ||
        jtClean.includes("mechanic") ||
        jtClean.includes("helper") ||
        jtClean.includes("welder") ||
        jtClean.includes("tyreman") ||
        jtClean.includes("cleaner") ||
        jtClean.includes("security") ||
        jtClean.includes("satpam") ||
        jtClean.includes("ojt")
      ) {
        matchedLvl = jobLevels.find(
          (l) => cleanStr(l.code) === "nonstaff" || cleanStr(l.name) === "nonstaff" || l.rank === 0
        );
      }
    }

    // Fallback default: Staff
    if (!matchedLvl) {
      matchedLvl = jobLevels.find((l) => l.code === "STAFF") || jobLevels[0];
    }

    // 7. Arrival Date (Boleh kosong, jika diisi harus valid)
    let dateValid = true;
    let formattedDate = "";
    if (r.arrivalDate && r.arrivalDate.trim() !== "") {
      formattedDate = r.arrivalDate;
      const d = new Date(formattedDate);
      if (isNaN(d.getTime())) {
        errors.push("Format Arrival Date tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)");
        dateValid = false;
      }
    }

    const calculatedDuration = dateValid && formattedDate ? calculateWorkingDuration(formattedDate) : "-";

    return {
      raw: {
        ...r,
        arrivalDate: formattedDate,
      },
      isValid: errors.length === 0,
      isUpdate,
      errors,
      matchedDeptId,
      matchedDeptName,
      matchedDeptCode,
      matchedPitId,
      matchedPitName,
      matchedPitCode,
      matchedJobLevelId: matchedLvl?.id ?? jobLevels[0]?.id,
      matchedJobLevelName: matchedLvl?.name ?? "Staff",
      operatingUnit: opUnit,
      normalizedDeptName: normDept,
      polaPenggajian: r.polaPenggajian || "All In",
      calculatedDuration,
      mappingStatus,
      mappingSource,
    };
  });
}

export function ExcelImportCard({
  departments,
  jobLevels,
  jobPositions = [],
  existingEmployees,
  mappings = [],
  pits = [],
  onImportBatch,
  onSaveQuickMapping,
  onClose,
}: {
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  existingEmployees: Employee[];
  mappings?: DepartmentMappingWithDetails[];
  pits?: Pit[];
  onImportBatch: (items: EmployeeBatchInput[]) => Promise<{ count: number }>;
  onSaveQuickMapping?: (site: string, rawDept: string, deptId: number) => Promise<void>;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawParsedRows, setRawParsedRows] = useState<RawEmployeeRow[]>([]);
  const [activeMappings, setActiveMappings] = useState<DepartmentMappingWithDetails[]>(mappings);
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>(existingEmployees);
  const [previewRows, setPreviewRows] = useState<ValidatedRow[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [resolvedRowIndices, setResolvedRowIndices] = useState<Set<number>>(new Set());
  const [activeFilter, setActiveFilter] = useState<"ALL" | "VALID" | "ERROR">("ALL");
  const [isPending, startTransition] = useTransition();
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [openMenuRowIndex, setOpenMenuRowIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tutup dropdown menu baris ketika klik di luar
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuRowIndex(null);
    if (openMenuRowIndex !== null) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [openMenuRowIndex]);

  // Perbarui activeMappings jika props mappings berubah
  useEffect(() => {
    setActiveMappings(mappings);
  }, [mappings]);

  // Perbarui activeEmployees jika props existingEmployees berubah
  useEffect(() => {
    setActiveEmployees(existingEmployees);
  }, [existingEmployees]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending && !isRevalidating) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, isRevalidating]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setFileName(file.name);
      const parsed = await parseEmployeeExcelFile(file);

      if (parsed.length === 0) {
        void Swal.fire({
          icon: "warning",
          title: "File Kosong",
          text: "Tidak ada data karyawan yang terbaca pada file Excel tersebut. Pastikan sheet pertama memiliki header yang benar.",
          confirmButtonColor: "#f59e0b",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // Ambil mapping departemen terbaru dari database agar sinkron secara realtime
      let currentMappings = activeMappings;
      try {
        const fresh = await getDepartmentMappingsAction();
        if (fresh && fresh.length > 0) {
          currentMappings = fresh;
          setActiveMappings(fresh);
        }
      } catch {
        // Fallback ke activeMappings jika terjadi gangguan koneksi
      }

      setRawParsedRows(parsed);
      setSelectedRowIndices(new Set());
      const validated = validateEmployeeRows(
        parsed,
        currentMappings,
        departments,
        jobLevels,
        activeEmployees,
        pits
      );

      setPreviewRows(validated);
      setIsOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#f59e0b",
      });
    }
  };

  // Validasi Ulang: Ambil mapping terbaru dari database dan hitung ulang seluruh baris
  const handleRevalidate = async () => {
    if (rawParsedRows.length === 0) {
      void Swal.fire({
        icon: "info",
        title: "Tidak Ada Data",
        text: "Silakan pilih file Excel terlebih dahulu untuk divalidasi.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    setIsRevalidating(true);
    try {
      const freshMappings = await getDepartmentMappingsAction();
      setActiveMappings(freshMappings);

      const updated = validateEmployeeRows(
        rawParsedRows,
        freshMappings,
        departments,
        jobLevels,
        activeEmployees,
        pits
      );
      setPreviewRows(updated);

      const newlyValid = updated.filter((r) => r.isValid).length;
      const newlyError = updated.filter((r) => !r.isValid).length;

      void Swal.fire({
        icon: "success",
        title: "Validasi Ulang Selesai",
        text: `Status ${updated.length} baris telah dihitung ulang: ${newlyValid} valid, ${newlyError} belum selesai.`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat mapping terbaru.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Validasi Ulang",
        text: msg,
        confirmButtonColor: "#f59e0b",
      });
    } finally {
      setIsRevalidating(false);
    }
  };

  // Helper untuk menghapus baris dari antrean dan menghitung ulang duplikasi NIK & status DB
  const removeRowsAndRevalidate = (
    indicesToRemove: number[],
    survivingIndicesToKeep: number[] = [],
    updatedEmployeesList?: Employee[]
  ) => {
    const emps = updatedEmployeesList || activeEmployees;
    const remainingRaw = rawParsedRows.filter((r) => !indicesToRemove.includes(r.rowIndex));
    setRawParsedRows(remainingRaw);

    const remainingPreview = previewRows.filter((r) => !indicesToRemove.includes(r.raw.rowIndex));

    // Hitung ulang frekuensi kemunculan NIK di antara baris yang tersisa
    const nikCount: Record<string, number> = {};
    remainingPreview.forEach((r) => {
      if (r.raw.nik) {
        const k = r.raw.nik.toLowerCase().trim();
        nikCount[k] = (nikCount[k] || 0) + 1;
      }
    });

    const empNikMap = new Map(emps.map((e) => [e.nik.toLowerCase().trim(), e]));

    // Hitung ulang status baris yang tersisa
    const recomputed = remainingPreview.map((row) => {
      const k = row.raw.nik ? row.raw.nik.toLowerCase().trim() : "";
      const isDup = k ? (nikCount[k] || 0) > 1 : false;
      const isUpdate = Boolean(k && empNikMap.has(k));

      // Bersihkan error duplikat sebelumnya lalu tentukan ulang
      const cleanErrors = row.errors.filter((e) => !e.toLowerCase().includes("duplikat"));
      if (isDup) {
        cleanErrors.push("NIK duplikat dalam file Excel");
      }

      return {
        ...row,
        isUpdate,
        errors: cleanErrors,
        isValid: cleanErrors.length === 0,
      };
    });

    setPreviewRows(recomputed);
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      indicesToRemove.forEach((idx) => next.delete(idx));
      return next;
    });
    setResolvedRowIndices((prev) => {
      const next = new Set(prev);
      indicesToRemove.forEach((idx) => next.delete(idx));
      survivingIndicesToKeep.forEach((idx) => next.add(idx));
      return next;
    });
  };

  const toggleSelectRow = (rowIndex: number) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredPreview.length === 0) return;
    const allSelected = filteredPreview.every((r) => selectedRowIndices.has(r.raw.rowIndex));
    if (allSelected) {
      setSelectedRowIndices((prev) => {
        const next = new Set(prev);
        filteredPreview.forEach((r) => next.delete(r.raw.rowIndex));
        return next;
      });
    } else {
      setSelectedRowIndices((prev) => {
        const next = new Set(prev);
        filteredPreview.forEach((r) => next.add(r.raw.rowIndex));
        return next;
      });
    }
  };

  // Hapus per baris (per line) dari antrean import
  const handleDeleteRow = async (row: ValidatedRow) => {
    const nik = (row.raw.nik || "").trim();
    const name = row.raw.name || "Karyawan";
    const rowNum = row.raw.rowIndex + 1;
    const site = row.operatingUnit;

    // Deteksi jika ada baris duplikat lain untuk NIK yang sama (misal beda site HO / GAM)
    const otherDups = previewRows.filter(
      (r) =>
        r.raw.rowIndex !== row.raw.rowIndex &&
        r.raw.nik &&
        r.raw.nik.trim().toLowerCase() === nik.toLowerCase()
    );

    const otherSitesInfo = otherDups
      .map((d) => `Baris #${d.raw.rowIndex + 1} (Site: ${d.operatingUnit})`)
      .join(", ");

    const confirm = await Swal.fire({
      title: `Hapus Baris #${rowNum}?`,
      html: `
        <div class="text-left text-xs space-y-2">
          <p>Anda akan menghapus baris data ini dari antrean import:</p>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 space-y-1">
            <div><b>Nama:</b> ${name}</div>
            <div><b>NIK:</b> <code class="font-bold">${nik || "-"}</code></div>
            <div><b>Site:</b> <span class="font-bold text-sky-700">${site}</span></div>
            <div><b>Departemen:</b> ${row.raw.department || "-"}</div>
            <div><b>Jabatan:</b> ${row.raw.jobTitle || "-"}</div>
          </div>
          ${
            otherDups.length > 0
              ? `<div class="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                  💡 <b>Otomatis Valid:</b> Baris pasangannya di <b>${otherSitesInfo}</b> akan dipertahankan dan otomatis menjadi <b>Valid</b> untuk diimpor ke database.
                </div>`
              : `<p class="text-slate-500 text-[11px]">Baris ini akan dihapus dari antrean import dan tidak akan dimasukkan ke database.</p>`
          }
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Baris Ini",
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      const survivingIndices = otherDups.map((d) => d.raw.rowIndex);
      removeRowsAndRevalidate([row.raw.rowIndex], survivingIndices);

      const survivingSitesInfo = otherDups
        .map((d) => `Baris #${d.raw.rowIndex + 1} (${d.operatingUnit})`)
        .join(", ");

      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Baris Berhasil Dihapus",
        text: `Baris #${rowNum} (Site ${site}) telah dihapus. ${
          otherDups.length > 0 ? `${survivingSitesInfo} dipertahankan dan berstatus Valid.` : ""
        }`,
        timer: 3000,
        showConfirmButton: false,
      });
    }
  };

  // Pilih baris ini (pertahankan site ini, otomatis hapus baris duplikat di site lain)
  const handleKeepThisLine = async (row: ValidatedRow) => {
    const nik = (row.raw.nik || "").trim();
    if (!nik) return;

    const rowNum = row.raw.rowIndex + 1;
    const site = row.operatingUnit;

    const otherDups = previewRows.filter(
      (r) =>
        r.raw.rowIndex !== row.raw.rowIndex &&
        r.raw.nik &&
        r.raw.nik.trim().toLowerCase() === nik.toLowerCase()
    );

    if (otherDups.length === 0) return;

    const otherRowIndices = otherDups.map((d) => d.raw.rowIndex);
    const otherSitesInfo = otherDups
      .map((d) => `Baris #${d.raw.rowIndex + 1} (Site: ${d.operatingUnit})`)
      .join(", ");

    const confirm = await Swal.fire({
      title: `Pilih Site ${site}?`,
      html: `
        <div class="text-left text-xs space-y-2">
          <p>Anda memilih <b>${row.raw.name}</b> di <b>Site ${site}</b> (Baris #${rowNum}).</p>
          <div class="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px]">
            Sistem akan mempertahankan baris ini dan <b>menghapus baris duplikat di ${otherSitesInfo}</b> dari antrean import.
          </div>
          <p class="text-slate-500 text-[11px]">
            Ketika data disimpan, database akan otomatis tersinkronisasi menggunakan data dari Site ${site}.
          </p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Gunakan Site ${site}`,
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      removeRowsAndRevalidate(otherRowIndices, [row.raw.rowIndex]);
      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: `Site ${site} Dipilih`,
        text: `Baris #${rowNum} (Site ${site}) dipertahankan dan sekarang Valid.`,
        timer: 3000,
        showConfirmButton: false,
      });
    }
  };

  // Hapus Sekaligus Baris yang Dipilih (per line)
  const handleBulkDelete = async () => {
    if (selectedRowIndices.size === 0) return;

    const rowIndicesArray = Array.from(selectedRowIndices);

    const confirm = await Swal.fire({
      title: `Hapus ${selectedRowIndices.size} Baris Terpilih?`,
      html: `
        <div class="text-left text-xs space-y-2">
          <p>Sebanyak <b>${selectedRowIndices.size} baris</b> data yang dipilih akan dihapus dari antrean import Excel.</p>
          <p class="text-slate-500 text-[11px]">Data karyawan di database tidak akan terhapus. Baris duplikat pasangannya akan otomatis dihitung ulang.</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Semua Terpilih",
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      const survivingDups = previewRows.filter(
        (r) =>
          !selectedRowIndices.has(r.raw.rowIndex) &&
          r.raw.nik &&
          previewRows.some(
            (other) =>
              selectedRowIndices.has(other.raw.rowIndex) &&
              other.raw.nik &&
              other.raw.nik.trim().toLowerCase() === r.raw.nik.trim().toLowerCase()
          )
      );
      const survivingIndices = survivingDups.map((d) => d.raw.rowIndex);
      removeRowsAndRevalidate(rowIndicesArray, survivingIndices);
      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Baris Berhasil Dihapus",
        text: `${selectedRowIndices.size} baris telah dihapus dari antrean import.`,
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  // Quick Map Inline: Koreksi Departemen Langsung di Baris Pratinjau (Otomatis ke seluruh baris serupa)
  const handleInlineDeptChange = (rowIndex: number, newDeptId: number, applyToAllSimilar = true) => {
    const targetDept = departments.find((d) => d.id === newDeptId);
    if (!targetDept) return;

    setPreviewRows((prev) => {
      const currentRow = prev.find((r) => r.raw.rowIndex === rowIndex);
      if (!currentRow) return prev;

      const targetRawDept = currentRow.raw.department.trim().toUpperCase();
      const targetSite = currentRow.operatingUnit;

      const similarCount = prev.filter(
        (row) => row.raw.department.trim().toUpperCase() === targetRawDept && row.operatingUnit === targetSite
      ).length;

      if (applyToAllSimilar && similarCount > 1) {
        void Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Diterapkan Otomatis ke Seluruh Baris",
          text: `Departemen "${targetDept.name}" berhasil diterapkan ke ${similarCount} baris "${currentRow.raw.department}" (${targetSite}).`,
          timer: 2500,
          showConfirmButton: false,
        });
      }

      return prev.map((row) => {
        const isMatch = applyToAllSimilar
          ? row.raw.department.trim().toUpperCase() === targetRawDept && row.operatingUnit === targetSite
          : row.raw.rowIndex === rowIndex;

        if (!isMatch) return row;

        const remainingErrors = row.errors.filter((e) => !e.toLowerCase().includes("departemen"));

        return {
          ...row,
          matchedDeptId: targetDept.id,
          matchedDeptName: targetDept.name,
          matchedDeptCode: targetDept.code,
          mappingStatus: "MAPPED",
          mappingSource: "QUICK_MAPPED",
          errors: remainingErrors,
          isValid: remainingErrors.length === 0,
        };
      });
    });
  };

  const handleCommitImport = async () => {
    const validItems = previewRows.filter((r) => r.isValid);
    if (validItems.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Tidak Ada Data Valid",
        text: "Semua baris data memiliki error atau departemen yang belum dipetakan. Petakan departemen terlebih dahulu.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const invalidCount = previewRows.length - validItems.length;
    const confirm = await Swal.fire({
      title: "Konfirmasi Import Karyawan",
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Anda akan mengimpor <b>${validItems.length}</b> data karyawan ke database.</p>
          ${
            invalidCount > 0
              ? `<p class="text-rose-600 font-medium">⚠️ Sebanyak ${invalidCount} data yang berstatus error / belum dipetakan akan dilewati.</p>`
              : ""
          }
          <p class="text-xs text-slate-500">Departemen akan disimpan sesuai departemen standar hasil pemetaan.</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Simpan Karyawan",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const payload: EmployeeBatchInput[] = validItems.map((r) => ({
          nik: r.raw.nik,
          name: r.raw.name,
          departmentId: r.matchedDeptId,
          pitId: r.matchedPitId,
          originalDepartment: r.raw.department,
          jobLevelId: r.matchedJobLevelId,
          jobPosition: r.raw.jobTitle,
          operatingUnit: r.operatingUnit,
          dateOfHire: r.raw.arrivalDate,
          polaPenggajian: r.polaPenggajian,
          role: r.raw.role,
          appraiserNik: r.raw.appraiserNik,
          headDeptNik: r.raw.headDeptNik,
        }));

        const result = await onImportBatch(payload);

        await Swal.fire({
          icon: "success",
          title: "Import Berhasil!",
          text: `Sebanyak ${result.count} data karyawan berhasil disimpan ke database.`,
          confirmButtonColor: "#0284c7",
          timer: 2000,
          timerProgressBar: true,
        });

        setIsOpen(false);
        setPreviewRows([]);
        setSelectedRowIndices(new Set());
        setResolvedRowIndices(new Set());
        if (fileInputRef.current) fileInputRef.current.value = "";
        onClose?.();
        router.push("/setup/master?tab=karyawan");
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  const validCount = previewRows.filter((r) => r.isValid).length;
  const errorCount = previewRows.filter((r) => !r.isValid).length;
  const unmappedCount = previewRows.filter((r) => r.mappingStatus !== "MAPPED").length;

  const filteredPreview = useMemo(() => {
    if (activeFilter === "VALID") return previewRows.filter((r) => r.isValid);
    if (activeFilter === "ERROR") {
      return previewRows.filter((r) => !r.isValid || resolvedRowIndices.has(r.raw.rowIndex));
    }
    return previewRows;
  }, [previewRows, activeFilter, resolvedRowIndices]);

  return (
    <>
      {/* Container Import Excel di Halaman */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Import Data Karyawan via Excel</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unggah file Excel untuk menambah atau memperbarui data karyawan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                downloadEmployeeTemplate(departments, jobLevels, existingEmployees, jobPositions);
                void Swal.fire({
                  icon: "success",
                  title: "Template Diunduh",
                  text: "File template_import_karyawan.xlsx berhasil diunduh.",
                  timer: 1600,
                  showConfirmButton: false,
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              title="Download template format .xlsx"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download Template</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                title="Tutup Form Import"
                aria-label="Tutup form import"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/20 p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition">
          <input
            ref={fileInputRef}
            type="file"
            id="excel-file-input"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="excel-file-input" className="cursor-pointer block">
            <div className="flex justify-center mb-2">
              <Upload className="w-7 h-7 text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline block">
              Pilih file Excel dari komputer Anda
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Format .xlsx, .xls, atau .csv
            </span>
          </label>
        </div>
      </div>

      {/* Modal Pratinjau & Validasi (Import Preview) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white border border-slate-200 shadow-md overflow-hidden">
            {/* 1. Header: ikon import hijau, judul, nama file Excel, total baris data, dan tombol tutup */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Pratinjau & Validasi Import Karyawan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fileName} · {previewRows.length} total baris
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1.5 rounded-md hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2. Tab Status & Aksi Sekunder */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-2 bg-white text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveFilter("ALL")}
                  className={`px-3 py-1.5 rounded-md text-xs transition cursor-pointer border ${
                    activeFilter === "ALL"
                      ? "bg-slate-800 text-white border-slate-800 font-semibold shadow-xs"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 font-medium"
                  }`}
                >
                  Semua ({previewRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("VALID")}
                  className={`px-3 py-1.5 rounded-md text-xs transition cursor-pointer border ${
                    activeFilter === "VALID"
                      ? "bg-emerald-600 text-white border-emerald-600 font-semibold shadow-xs"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80 font-medium"
                  }`}
                >
                  Siap Diimpor ({validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("ERROR")}
                  className={`px-3 py-1.5 rounded-md text-xs transition cursor-pointer border ${
                    activeFilter === "ERROR"
                      ? "bg-rose-600 text-white border-rose-600 font-semibold shadow-xs"
                      : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/80 font-medium"
                  }`}
                >
                  Bermasalah ({errorCount})
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedRowIndices.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="text-rose-700 hover:text-rose-800 text-xs font-medium px-2.5 py-1.5 rounded-md border border-rose-300 bg-white hover:bg-rose-50 transition cursor-pointer inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Hapus Terpilih ({selectedRowIndices.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRevalidate}
                  disabled={isRevalidating || isPending}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                  title="Validasi ulang data dengan mapping terbaru"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRevalidating ? "animate-spin" : ""}`} />
                  <span>Validasi Ulang</span>
                </button>
              </div>
            </div>

            {/* Banner Penyelesaian Duplikat pada Tab Bermasalah */}
            {activeFilter === "ERROR" && resolvedRowIndices.size > 0 && (
              <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50/70 px-6 py-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {errorCount === 0
                      ? "Semua data bermasalah telah diselesaikan. Baris di bawah dipertahankan dan siap diimpor."
                      : `Tersisa ${errorCount} data bermasalah. ${resolvedRowIndices.size} baris duplikat berhasil diselesaikan dan dipertahankan.`}
                  </span>
                </div>
                {errorCount === 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter("VALID")}
                    className="font-semibold text-emerald-800 hover:text-emerald-900 hover:underline cursor-pointer"
                  >
                    Lihat Siap Diimpor ({validCount})
                  </button>
                )}
              </div>
            )}

            {/* 3. Tabel Data: Checkbox, Baris, NIK, Nama, Site, Departemen, Jabatan & Level, Status, dan Aksi */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua baris"
                        checked={
                          filteredPreview.length > 0 &&
                          filteredPreview.every((r) => selectedRowIndices.has(r.raw.rowIndex))
                        }
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="w-12 px-3 py-2.5 text-center">Baris</th>
                    <th className="w-28 px-3 py-2.5">NIK</th>
                    <th className="px-3 py-2.5">Nama</th>
                    <th className="w-16 px-3 py-2.5">Site</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Departemen</th>
                    <th className="px-3 py-2.5 min-w-[130px]">PIT</th>
                    <th className="px-3 py-2.5 min-w-[160px]">Jabatan & Level</th>
                    <th className="w-36 px-3 py-2.5">Status</th>
                    <th className="w-12 px-3 py-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPreview.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                        Tidak ada data pada tab ini.
                      </td>
                    </tr>
                  ) : (
                    filteredPreview.map((row) => (
                      <tr
                        key={row.raw.rowIndex}
                        className={`transition-colors ${
                          selectedRowIndices.has(row.raw.rowIndex)
                            ? "bg-slate-50"
                            : resolvedRowIndices.has(row.raw.rowIndex)
                            ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                            : "hover:bg-slate-50/70"
                        }`}
                      >
                        {/* 1. Checkbox */}
                        <td className="w-10 px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Pilih baris ${row.raw.rowIndex + 1}`}
                            checked={selectedRowIndices.has(row.raw.rowIndex)}
                            onChange={() => toggleSelectRow(row.raw.rowIndex)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* 2. Baris */}
                        <td className="w-12 px-3 py-2 text-center font-mono text-slate-400">
                          {row.raw.rowIndex + 1}
                        </td>

                        {/* 3. NIK */}
                        <td className="w-28 px-3 py-2 font-mono font-medium text-slate-900">
                          {row.raw.nik || "-"}
                        </td>

                        {/* 4. Nama */}
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.raw.name || "-"}
                        </td>

                        {/* 5. Site */}
                        <td className="w-16 px-3 py-2 text-slate-600">
                          {resolvedRowIndices.has(row.raw.rowIndex) ? (
                            <span className="font-semibold text-emerald-800">{row.operatingUnit || "-"}</span>
                          ) : (
                            row.operatingUnit || "-"
                          )}
                        </td>

                        {/* 6. Departemen: nama standar secara ringkas setelah mapping berhasil */}
                        <td className="px-3 py-2 min-w-[200px]">
                          {row.mappingStatus === "MAPPED" && row.matchedDeptId > 0 ? (
                            <div>
                              <div className="font-medium text-slate-900">{row.matchedDeptName}</div>
                              {row.raw.department &&
                                row.raw.department.toLowerCase() !== row.matchedDeptName.toLowerCase() && (
                                  <div
                                    className="text-[11px] text-slate-400 truncate max-w-[220px]"
                                    title={`Nama asli di Excel: ${row.raw.department}`}
                                  >
                                    Excel: {row.raw.department}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <div>
                              {row.raw.department && (
                                <div className="text-[11px] text-slate-500 mb-1 font-medium truncate max-w-[220px]">
                                  Excel: {row.raw.department}
                                </div>
                              )}
                              <select
                                value={row.matchedDeptId > 0 ? String(row.matchedDeptId) : ""}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (val > 0) handleInlineDeptChange(row.raw.rowIndex, val, true);
                                }}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                              >
                                <option value="">Pilih Departemen...</option>
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} ({d.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>

                        {/* 7. PIT */}
                        <td className="px-3 py-2 min-w-[130px]">
                          {row.matchedPitName ? (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 text-[11px] font-medium">
                                {row.matchedPitName}
                              </span>
                              {row.matchedPitCode && (
                                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                  {row.matchedPitCode}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* 8. Jabatan & Level */}
                        <td className="px-3 py-2 min-w-[160px]">
                          <div className="font-medium text-slate-900">{row.raw.jobTitle || "-"}</div>
                          <div className="text-[11px] text-slate-500">
                            {row.matchedJobLevelName}
                            {row.raw.statusStaff ? ` · ${row.raw.statusStaff}` : ""}
                          </div>
                        </td>

                        {/* 8. Status: label Valid (hijau lembut) atau Error (merah) */}
                        <td className="w-36 px-3 py-2">
                          {row.isValid ? (
                            resolvedRowIndices.has(row.raw.rowIndex) ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                                <Check className="w-3 h-3 text-emerald-700" />
                                Valid (Dipertahankan)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-medium">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Valid
                              </span>
                            )
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-200/80 px-2 py-0.5 text-[11px] font-medium">
                                Error
                              </span>
                              <div className="text-[11px] text-rose-600 mt-1 leading-tight">
                                {row.errors
                                  .map((err) => {
                                    const lower = err.toLowerCase();
                                    if (lower.includes("duplikat")) return "NIK duplikat";
                                    if (lower.includes("belum dipetakan") || lower.includes("mapping"))
                                      return "Departemen belum dipetakan";
                                    if (lower.includes("job title") || lower.includes("jabatan"))
                                      return "Jabatan kosong";
                                    if (lower.includes("nama")) return "Nama kosong";
                                    if (lower.includes("nik wajib")) return "NIK kosong";
                                    return err;
                                  })
                                  .join(", ")}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 9. Aksi: menu tiga titik */}
                        <td className="w-12 px-3 py-2 text-center relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuRowIndex(
                                openMenuRowIndex === row.raw.rowIndex ? null : row.raw.rowIndex
                              );
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            aria-label={`Aksi baris ${row.raw.rowIndex + 1}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {openMenuRowIndex === row.raw.rowIndex && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-2 top-8 z-30 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-md text-left text-xs"
                            >
                              {row.errors.some((err) => err.toLowerCase().includes("duplikat")) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuRowIndex(null);
                                    handleKeepThisLine(row);
                                  }}
                                  className="w-full px-3 py-2 text-left text-emerald-800 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer font-medium"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Pilih Site {row.operatingUnit}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuRowIndex(null);
                                  handleDeleteRow(row);
                                }}
                                className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                <span>Hapus Baris</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 10. Footer: hanya jumlah data siap diimpor serta tombol Tutup dan Simpan Karyawan */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-white text-xs">
              <div className="text-slate-600">
                <span>
                  Siap diimpor: <b className="text-emerald-700 font-semibold">{validCount}</b> dari {previewRows.length} data
                </span>
                {selectedRowIndices.size > 0 && (
                  <span className="text-slate-400 ml-2">
                    ({selectedRowIndices.size} baris dipilih)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={validCount === 0 || isPending}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs transition cursor-pointer disabled:opacity-40 flex items-center gap-2 shadow-xs"
                >
                  {isPending ? "Menyimpan..." : `Simpan Karyawan (${validCount})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
