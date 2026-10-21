"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, KpiTemplate, Pit } from "@/db/schema";
import type { EmployeeBatchInput } from "@/lib/actions";
import { Table, td, th, inputCls } from "./ui";
import { formatTenureYears } from "@/lib/scoring";
import { EmployeeModal } from "./employee-modal";
import { ExcelImportCard } from "./excel-import-modal";
import type { DepartmentMappingWithDetails } from "@/lib/department-mapping-utils";
import { downloadEmployeeTemplate, exportEmployeesToExcel } from "@/lib/excel-template";
import {
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Upload,
  Download,
  Users,
} from "lucide-react";

export function EmployeeListTable({
  employees,
  departments,
  jobLevels,
  jobPositions = [],
  templates,
  systemDate,
  initialUnit = "ALL",
  mappings = [],
  pits = [],
  assignAppraiserAction,
  deleteEmployeeAction,
  reactivateEmployeeAction,
  permanentDeleteEmployeeAction,
  upsertEmployeeAction,
  importEmployeesAction,
  syncOdooAction,
  resetOdooSyncAction,
  syncExistingEmployeesPitAction,
}: {
  employees: Employee[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  templates: KpiTemplate[];
  systemDate: string;
  initialUnit?: string;
  mappings?: DepartmentMappingWithDetails[];
  pits?: Pit[];
  assignAppraiserAction: (fd: FormData) => Promise<void>;
  deleteEmployeeAction: (fd: FormData) => Promise<void>;
  reactivateEmployeeAction?: (fd: FormData) => Promise<void>;
  permanentDeleteEmployeeAction?: (fd: FormData) => Promise<void>;
  upsertEmployeeAction?: (fd: FormData) => Promise<void>;
  importEmployeesAction?: (items: EmployeeBatchInput[]) => Promise<{ count: number }>;
  syncOdooAction?: (fd?: FormData) => Promise<{
    success: boolean;
    count: {
      departmentsSynced: number;
      totalOdooEmployees: number;
      employeesSynced: number;
      newEmployees: number;
      updatedEmployees: number;
    };
  }>;
  resetOdooSyncAction?: () => Promise<{ success: boolean; count: number }>;
  syncExistingEmployeesPitAction?: () => Promise<{
    success: boolean;
    totalUpdated: number;
    details: Record<string, number>;
  }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeUnitFromUrl = searchParams.get("unit")?.toUpperCase() || initialUnit || "ALL";

  // Status View: "ACTIVE" vs "INACTIVE"
  const [statusView, setStatusView] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedUnit, setSelectedUnit] = useState<string>(activeUnitFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const pitMap = useMemo(() => new Map(pits.map((p) => [p.id, p])), [pits]);

  // Sync with URL query parameter when navigating from Operating Units card
  useEffect(() => {
    const qUnit = searchParams.get("unit")?.toUpperCase();
    if (qUnit && ["GAM", "AKP", "HO", "ALL"].includes(qUnit)) {
      setSelectedUnit(qUnit);
    } else if (initialUnit && initialUnit !== "ALL") {
      setSelectedUnit(initialUnit.toUpperCase());
    }
  }, [searchParams, initialUnit]);

  // Modal State
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showOnlyMissingHireDate, setShowOnlyMissingHireDate] = useState(false);

  const depName = (id: number) => departments.find((d) => d.id === id)?.name ?? "-";
  const lvlName = (id: number) => jobLevels.find((l) => l.id === id)?.name ?? "-";

  // Total counts for badge display
  const totalActive = employees.filter((e) => e.isActive !== false).length;
  const totalInactive = employees.filter((e) => e.isActive === false).length;
  const missingHireDateCount = employees.filter(
    (e) => (statusView === "ACTIVE" ? e.isActive !== false : e.isActive === false) && (!e.dateOfHire || e.dateOfHire.trim() === "" || e.dateOfHire === "1970-01-01")
  ).length;

  // Filter logika
  const filteredEmployees = employees.filter((e) => {
    // Filter Missing Date of Hire
    if (showOnlyMissingHireDate) {
      const isMissing = !e.dateOfHire || e.dateOfHire.trim() === "" || e.dateOfHire === "1970-01-01";
      if (!isMissing) return false;
    }

    // 0. Filter Status Aktif vs Nonaktif
    if (statusView === "ACTIVE" && e.isActive === false) {
      return false;
    }
    if (statusView === "INACTIVE" && e.isActive !== false) {
      return false;
    }

    // 1. Filter Departemen
    if (selectedDeptId !== "ALL" && e.departmentId !== Number(selectedDeptId)) {
      return false;
    }
    // 2. Filter Operating Unit
    if (selectedUnit !== "ALL" && (e.operatingUnit || "HO").toUpperCase() !== selectedUnit) {
      return false;
    }
    // 3. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNik = e.nik.toLowerCase().includes(q);
      const matchName = e.name.toLowerCase().includes(q);
      const matchPos = e.jobPosition.toLowerCase().includes(q);
      const matchPola = (e.polaPenggajian || "").toLowerCase().includes(q);
      if (!matchNik && !matchName && !matchPos && !matchPola) return false;
    }
    return true;
  });

  // Pagination State (15 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Reset page and selection when filter or view changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [selectedDeptId, selectedUnit, searchQuery, statusView, showOnlyMissingHireDate]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredEmployees.length);
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // State Checkbox Selection & Actions Menu
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close actions dropdown on outside click or Escape key
  useEffect(() => {
    if (!isActionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionsOpen]);

  const isAllSelected =
    paginatedEmployees.length > 0 &&
    paginatedEmployees.every((e) => selectedIds.includes(e.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(paginatedEmployees.map((e) => e.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const pageIds = paginatedEmployees.map((e) => e.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Download Template Excel
  const handleDownloadTemplate = () => {
    try {
      downloadEmployeeTemplate(departments, jobLevels, employees, jobPositions, undefined, pits);
      void Swal.fire({
        icon: "success",
        title: "Template Diunduh",
        text: "File template_import_karyawan.xlsx siap digunakan.",
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengunduh template Excel";
      void Swal.fire({
        icon: "error",
        title: "Gagal Mengunduh",
        text: msg,
        confirmButtonColor: "#f59e0b",
      });
    }
  };

  // Export Data Karyawan ke Excel
  const handleExportExcel = () => {
    const toExport = selectedIds.length > 0
      ? employees.filter((e) => selectedIds.includes(e.id))
      : filteredEmployees;

    if (toExport.length === 0) {
      void Swal.fire({
        icon: "info",
        title: "Tidak Ada Data",
        text: "Tidak ada data karyawan yang sesuai dengan kriteria filter saat ini untuk diekspor.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    try {
      const unitLabel = selectedUnit !== "ALL" ? `_${selectedUnit}` : "";
      const fname = `data_master_karyawan${unitLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportEmployeesToExcel(toExport, departments, jobLevels, systemDate, fname, pits);
      void Swal.fire({
        icon: "success",
        title: "Ekspor Berhasil",
        text: `${toExport.length} data karyawan berhasil diekspor ke file Excel.`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengekspor data karyawan";
      void Swal.fire({
        icon: "error",
        title: "Gagal Ekspor",
        text: msg,
        confirmButtonColor: "#0284c7",
      });
    }
  };

  // Sinkronisasi otomatis PIT untuk data karyawan yang sudah ada
  const handleSyncPit = async () => {
    if (!syncExistingEmployeesPitAction) return;

    const confirm = await Swal.fire({
      title: "Sinkronkan PIT Karyawan?",
      html: `
        <div class="text-left text-xs space-y-2">
          <p>Sistem akan memetakan otomatis penugasan PIT untuk seluruh karyawan yang ada di database berdasarkan riwayat departemen asal (<code>original_department</code>) dan Master Mapping Departemen.</p>
          <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
            💡 <b>Tidak perlu upload ulang Excel!</b> Karyawan yang departemennya mengarah ke PIT (seperti JO, BCM-S, BCM-U, Mining Service) akan langsung terhubung secara otomatis. Karyawan non-PIT (seperti HO) akan tetap tanpa PIT.
          </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Sinkronkan PIT",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const res = await syncExistingEmployeesPitAction();
        const detailsList = Object.entries(res.details)
          .map(([name, count]) => `<li><b>${name}</b>: ${count} karyawan</li>`)
          .join("");

        await Swal.fire({
          icon: "success",
          title: "Sinkronisasi PIT Berhasil",
          html: `
            <div class="text-left text-xs space-y-2">
              <p>Sebanyak <b>${res.totalUpdated} karyawan</b> berhasil ditautkan ke Master PIT masing-masing:</p>
              <ul class="list-disc pl-4 space-y-1 text-slate-600">
                ${detailsList || "<li>Semua data karyawan sudah terhubung dengan benar.</li>"}
              </ul>
            </div>
          `,
          confirmButtonColor: "#0284c7",
        });
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyinkronkan PIT karyawan";
        void Swal.fire({
          icon: "error",
          title: "Gagal Sinkronisasi",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  // 1. Batch Deactivate (dari view Karyawan Aktif)
  const handleBatchDeactivate = async () => {
    if (selectedIds.length === 0) return;
    const confirm = await Swal.fire({
      title: `Nonaktifkan ${selectedIds.length} Karyawan?`,
      text: "Karyawan terpilih akan dinonaktifkan dan dipindahkan ke tampilan Karyawan Nonaktif.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Nonaktifkan",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await deleteEmployeeAction(fd);
        }
        setSelectedIds([]);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Berhasil Dinonaktifkan",
          text: `${selectedIds.length} karyawan berhasil dinonaktifkan.`,
          timer: 1600,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menonaktifkan massal";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // 2. Batch Reactivate (dari view Karyawan Nonaktif)
  const handleBatchReactivate = async () => {
    if (selectedIds.length === 0 || !reactivateEmployeeAction) return;
    const confirm = await Swal.fire({
      title: `Aktifkan Kembali ${selectedIds.length} Karyawan?`,
      text: "Karyawan terpilih akan dikembalikan ke status aktif.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Aktifkan Kembali",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await reactivateEmployeeAction(fd);
        }
        setSelectedIds([]);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Berhasil Diaktifkan",
          text: `${selectedIds.length} karyawan berhasil diaktifkan kembali.`,
          timer: 1600,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengaktifkan massal";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // 3. Batch Permanent Delete
  const handleBatchPermanentDelete = async () => {
    if (selectedIds.length === 0 || !permanentDeleteEmployeeAction) return;
    const confirm = await Swal.fire({
      title: `Hapus Permanen ${selectedIds.length} Karyawan?`,
      text: "PERINGATAN: Data karyawan terpilih akan dihapus permanen dari database dan tidak dapat dikembalikan!",
      icon: "error",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Permanen",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await permanentDeleteEmployeeAction(fd);
        }
        setSelectedIds([]);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Dihapus Permanen",
          text: `${selectedIds.length} data karyawan telah dihapus permanen.`,
          timer: 1600,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus permanen";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // Single Deactivate
  const handleDeactivate = async (emp: Employee) => {
    const confirm = await Swal.fire({
      title: "Nonaktifkan Karyawan?",
      text: `Karyawan ${emp.name} (${emp.nik}) akan dipindahkan ke daftar Karyawan Nonaktif.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Nonaktifkan",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(emp.id));

    startTransition(async () => {
      try {
        await deleteEmployeeAction(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Karyawan Dinonaktifkan",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menonaktifkan";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // Single Reactivate
  const handleReactivate = async (emp: Employee) => {
    if (!reactivateEmployeeAction) return;
    const confirm = await Swal.fire({
      title: "Aktifkan Kembali Karyawan?",
      text: `Karyawan ${emp.name} (${emp.nik}) akan dikembalikan ke daftar Karyawan Aktif.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Aktifkan Kembali",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(emp.id));

    startTransition(async () => {
      try {
        await reactivateEmployeeAction(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Karyawan Diaktifkan",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengaktifkan kembali";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // Single Permanent Delete
  const handlePermanentDelete = async (emp: Employee) => {
    if (!permanentDeleteEmployeeAction) return;
    const confirm = await Swal.fire({
      title: "Hapus Permanen Data Karyawan?",
      text: `PERINGATAN: Data ${emp.name} (${emp.nik}) akan dihapus permanen dari database.`,
      icon: "error",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Hapus Permanen",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(emp.id));

    startTransition(async () => {
      try {
        await permanentDeleteEmployeeAction(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Dihapus Permanen",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus permanen";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // Sinkronisasi Odoo
  const handleSyncOdoo = async () => {
    if (!syncOdooAction) return;
    const confirm = await Swal.fire({
      title: "Sinkronisasi Data dari Odoo?",
      text: "Sistem akan menarik data karyawan dan departemen terbaru dari Odoo ERP secara langsung.",
      icon: "info",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Mulai Sinkronisasi",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        Swal.fire({
          title: "Sedang Sinkronisasi...",
          text: "Menghubungi server Odoo ERP. Mohon tunggu beberapa saat.",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        const res = await syncOdooAction();
        router.refresh();

        if (res.success) {
          const c = res.count;
          await Swal.fire({
            icon: "success",
            title: "Sinkronisasi Odoo Selesai!",
            html: `
              <div class="text-left text-xs space-y-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
                <p><b>Total Karyawan di Odoo:</b> ${c.totalOdooEmployees}</p>
                <p><b>Karyawan Baru Ditambahkan:</b> ${c.newEmployees}</p>
                <p><b>Karyawan Diperbarui:</b> ${c.updatedEmployees}</p>
                <p><b>Departemen Tersinkron:</b> ${c.departmentsSynced}</p>
              </div>
            `,
            confirmButtonColor: "#0284c7",
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal melakukan sinkronisasi Odoo.";
        await Swal.fire({
          icon: "error",
          title: "Sinkronisasi Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  // Reset Semua Data Sync Odoo
  const handleResetOdooSync = async () => {
    if (!resetOdooSyncAction) return;
    const confirm = await Swal.fire({
      title: "Reset Semua Data Sync Odoo?",
      text: "PERINGATAN: Seluruh data karyawan hasil sinkronisasi Odoo akan dihapus dari database. Akun Superadmin tetap aman.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Semua Data Sync",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        Swal.fire({
          title: "Sedang Menghapus...",
          text: "Membersihkan data karyawan dari database.",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        const res = await resetOdooSyncAction();
        router.refresh();

        if (res.success) {
          await Swal.fire({
            icon: "success",
            title: "Berhasil Direset",
            text: `${res.count} data karyawan hasil sync Odoo telah dibersihkan.`,
            timer: 1800,
            timerProgressBar: true,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mereset data Odoo";
        await Swal.fire({
          icon: "error",
          title: "Gagal Reset",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Control Card & Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              <span>Manajemen Karyawan</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola data master karyawan, jabatan, unit operasional, dan sinkronisasi Odoo ERP.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Actions Counter Button */}
            {selectedIds.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-3 py-2 text-xs font-bold shadow-xs">
                <span>{selectedIds.length} Terpilih</span>
              </span>
            )}

            {/* Dropdown Actions (•••) */}
            <div className="relative" ref={actionsRef}>
              <button
                type="button"
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
                aria-expanded={isActionsOpen}
                aria-haspopup="menu"
              >
                <span>••• Actions</span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionsOpen && (
                <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50 space-y-1" role="menu">
                  {/* Export Excel (Dropdown Item) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsOpen(false);
                      handleExportExcel();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <Download className="w-4 h-4 text-sky-600" />
                    <span>Export Excel {selectedIds.length > 0 ? `(${selectedIds.length})` : "Semua"}</span>
                  </button>

                  {/* Toggle Import Excel (Dropdown Item) */}
                  {importEmployeesAction && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        setShowExcelImport(!showExcelImport);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                    >
                      <Upload className="w-4 h-4 text-emerald-600" />
                      <span>{showExcelImport ? "Tutup Import Excel" : "Import Data Excel"}</span>
                    </button>
                  )}

                  {/* Download Template (Dropdown Item) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsOpen(false);
                      handleDownloadTemplate();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <Download className="w-4 h-4 text-amber-600" />
                    <span>Download Template Excel</span>
                  </button>

                  {/* Sinkronkan PIT Karyawan dari Mapping */}
                  {syncExistingEmployeesPitAction && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        handleSyncPit();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2.5 cursor-pointer transition border-t border-slate-100"
                    >
                      <RotateCcw className="w-4 h-4 text-emerald-600" />
                      <span>Sinkronkan PIT dari Mapping</span>
                    </button>
                  )}

                  {/* Reset Sync Odoo Option */}
                  {resetOdooSyncAction && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        handleResetOdooSync();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border-t border-slate-100 flex items-center gap-2.5 cursor-pointer transition"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Reset / Hapus Data Sync Odoo</span>
                    </button>
                  )}

                  {/* Batch Actions inside dropdown */}
                  {selectedIds.length > 0 && statusView === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        handleBatchDeactivate();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border-t border-slate-100 flex items-center gap-2.5 cursor-pointer transition"
                    >
                      <UserX className="w-4 h-4 text-rose-600" />
                      <span>Nonaktifkan Terpilih ({selectedIds.length})</span>
                    </button>
                  )}

                  {selectedIds.length > 0 && statusView === "INACTIVE" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsOpen(false);
                          handleBatchReactivate();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg border-t border-slate-100 flex items-center gap-2.5 cursor-pointer transition"
                      >
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span>Aktifkan Terpilih ({selectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsOpen(false);
                          handleBatchPermanentDelete();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>Hapus Permanen ({selectedIds.length})</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tombol Sinkronisasi Odoo */}
            {syncOdooAction && (
              <button
                type="button"
                onClick={handleSyncOdoo}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3.5 py-2 text-xs font-bold shadow-2xs transition cursor-pointer active:scale-98"
                title="Tarik data karyawan dan departemen dari Odoo ERP"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
                <span>Sinkron Odoo</span>
              </button>
            )}

            {/* Primary Tambah Karyawan Button */}
            {upsertEmployeeAction && (
              <button
                type="button"
                onClick={() => {
                  setEditingEmployee(null);
                  setIsEmployeeModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition cursor-pointer active:scale-98"
              >
                <span>+ Tambah Karyawan</span>
              </button>
            )}
          </div>
        </div>

        {/* Bar Search & Filter */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Input Search */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Cari nama, NIK, jabatan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputCls} pl-9 bg-slate-50/60 text-xs`}
              />
            </div>

            {/* Filter Status (Aktif vs Nonaktif) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600">Status:</span>
              <select
                value={statusView}
                onChange={(e) => setStatusView(e.target.value as "ACTIVE" | "INACTIVE")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs focus:outline-none cursor-pointer transition ${
                  statusView === "INACTIVE"
                    ? "border-rose-300 bg-rose-50 text-rose-700 focus:border-rose-500"
                    : "border-slate-300 bg-white text-slate-700 focus:border-sky-500"
                }`}
              >
                <option value="ACTIVE">Aktif ({totalActive})</option>
                <option value="INACTIVE">Nonaktif ({totalInactive})</option>
              </select>
            </div>

            {/* Filter Site */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600">Site:</span>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs focus:border-sky-500 focus:outline-none"
              >
                <option value="ALL">Semua Site</option>
                <option value="HO">HO</option>
                <option value="GAM">GAM</option>
                <option value="AKP">AKP</option>
              </select>
            </div>

            {/* Filter Departemen */}
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">Semua Departemen ({departments.length})</option>
              {departments.map((d) => {
                const count = employees.filter(
                  (e) =>
                    e.departmentId === d.id &&
                    (statusView === "ACTIVE" ? e.isActive !== false : e.isActive === false)
                ).length;
                return (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="text-xs text-slate-500 font-semibold shrink-0">
            {filteredEmployees.length} dari {statusView === "ACTIVE" ? totalActive : totalInactive} Karyawan{" "}
            {statusView === "ACTIVE" ? "Aktif" : "Nonaktif"}
          </div>
        </div>
      </div>

      {/* Panel Import Excel (Collapsible) */}
      {showExcelImport && importEmployeesAction && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <ExcelImportCard
            departments={departments}
            jobLevels={jobLevels}
            jobPositions={jobPositions}
            existingEmployees={employees}
            mappings={mappings}
            pits={pits}
            onImportBatch={importEmployeesAction}
            onClose={() => setShowExcelImport(false)}
          />
        </div>
      )}

      {/* Alert Karyawan Belum Memiliki Date of Hire */}
      {missingHireDateCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 font-medium">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-xs">
              ⚠
            </span>
            <div>
              <span>
                <strong className="font-bold">{missingHireDateCount} employee</strong> belum memiliki Date of Hire.
              </span>
              <span className="text-amber-700 text-[11px] ml-1.5 hidden sm:inline">
                Data tanggal masuk belum tersedia dari Odoo.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOnlyMissingHireDate(!showOnlyMissingHireDate)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
              showOnlyMissingHireDate
                ? "bg-amber-800 text-white shadow-xs hover:bg-amber-900"
                : "bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/70 shadow-2xs"
            }`}
          >
            <span>{showOnlyMissingHireDate ? "Tampilkan Semua Data" : "Lihat Data"}</span>
            <span className="text-[10px]">{showOnlyMissingHireDate ? "✕" : "→"}</span>
          </button>
        </div>
      )}

      {/* Tabel Karyawan */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {showOnlyMissingHireDate
              ? "Semua data karyawan sudah memiliki Date of Hire."
              : statusView === "ACTIVE"
              ? "Tidak ada data karyawan aktif yang sesuai dengan kriteria filter."
              : "Tidak ada data karyawan non-aktif."}
          </div>
        ) : (
          <>
            <Table
              head={
                <tr>
                  <th className={`${th} w-10 text-center`}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-400 cursor-pointer h-4 w-4"
                    />
                  </th>
                  <th className={th}>NIK</th>
                  <th className={th}>Nama</th>
                  <th className={th}>Site</th>
                  <th className={th}>Pola</th>
                  <th className={th}>Departemen</th>
                  <th className={th}>Job Level</th>
                  <th className={th}>Job Position</th>
                  <th className={th}>Arrival</th>
                  <th className={th}>Masa Kerja</th>
                  <th className={`${th} text-right`}>Aksi</th>
                </tr>
              }
            >
              {paginatedEmployees.map((e) => {
                const opUnit = (e.operatingUnit || "HO").toUpperCase();
                const isSelected = selectedIds.includes(e.id);
                const hasNoHireDate = !e.dateOfHire || e.dateOfHire.trim() === "" || e.dateOfHire === "1970-01-01";

                return (
                  <tr
                    key={e.id}
                    className={`hover:bg-slate-50 transition ${isSelected ? "bg-sky-50/60" : ""} ${
                      !e.isActive ? "bg-slate-50/80" : ""
                    }`}
                  >
                    <td className={`${td} text-center`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(e.id)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-400 cursor-pointer h-4 w-4"
                      />
                    </td>
                    <td className={`${td} font-mono font-bold text-slate-900`}>
                      <Link href={`/setup/karyawan/${e.id}`} className="hover:text-sky-600 hover:underline">
                        {e.nik}
                      </Link>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/setup/karyawan/${e.id}`}
                          className="font-bold text-sky-700 hover:text-sky-900 hover:underline"
                        >
                          {e.name}
                        </Link>
                        {!e.isActive && (
                          <span className="inline-block rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold text-rose-600">
                            Nonaktif
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={td}>
                      <div className="text-xs font-medium text-slate-700">{opUnit}</div>
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                          e.polaPenggajian === "OT" || e.polaPenggajian === "Non All In"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-sky-50 text-sky-700 border-sky-200"
                        }`}
                      >
                        {e.polaPenggajian || "All In"}
                      </span>
                    </td>
                    <td className={td}>
                      <div className="font-semibold text-slate-800">{depName(e.departmentId)}</div>
                      {e.pitId && pitMap.get(e.pitId) && (
                        <div className="mt-1">
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-medium"
                            title={`Master PIT: ${pitMap.get(e.pitId)?.name} (${pitMap.get(e.pitId)?.code})`}
                          >
                            <span className="font-semibold text-amber-900">PIT:</span> {pitMap.get(e.pitId)?.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className={td}>
                      <div className="text-xs text-slate-700">{lvlName(e.jobLevelId)}</div>
                    </td>
                    <td className={td}>
                      <div className="text-xs text-slate-700">{e.jobPosition}</div>
                    </td>
                    <td className={td}>
                      {hasNoHireDate ? (
                        <div className="space-y-0.5">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
                            title="Data tanggal masuk belum tersedia dari Odoo"
                          >
                            <span className="text-amber-600 font-bold">⚠</span>
                            <span>Belum tersedia</span>
                          </span>
                          <div className="text-[10px] text-slate-400">Belum ada di Odoo</div>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-700">{e.dateOfHire}</span>
                      )}
                    </td>
                    <td className={td}>
                      {hasNoHireDate ? (
                        <span className="text-slate-400 font-semibold">—</span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {formatTenureYears(e.dateOfHire, systemDate)}
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        {upsertEmployeeAction && (
                          <Link
                            href={`/setup/karyawan/${e.id}`}
                            title="Edit karyawan"
                            className="p-1 text-slate-400 hover:text-sky-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Active view: Nonaktifkan Button */}
                        {e.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(e)}
                            disabled={isPending}
                            title="Nonaktifkan Karyawan"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          /* Inactive view: Aktifkan Kembali + Hapus Permanen */
                          <>
                            <button
                              type="button"
                              onClick={() => handleReactivate(e)}
                              disabled={isPending}
                              title="Aktifkan Kembali"
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePermanentDelete(e)}
                              disabled={isPending}
                              title="Hapus Permanen"
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>

            {/* Pagination Footer */}
            {filteredEmployees.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600">
                <div>
                  Menampilkan{" "}
                  <span className="font-semibold text-slate-800">
                    {startIndex + 1}
                  </span>{" "}
                  –{" "}
                  <span className="font-semibold text-slate-800">
                    {endIndex}
                  </span>{" "}
                  dari{" "}
                  <span className="font-semibold text-slate-800">
                    {filteredEmployees.length}
                  </span>{" "}
                  karyawan
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={validCurrentPage <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                    title="Halaman sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <span className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    {validCurrentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={validCurrentPage >= totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                    title="Halaman berikutnya"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Tambah / Edit Karyawan */}
      {upsertEmployeeAction && (
        <EmployeeModal
          isOpen={isEmployeeModalOpen}
          onClose={() => {
            setIsEmployeeModalOpen(false);
            setEditingEmployee(null);
          }}
          departments={departments}
          jobLevels={jobLevels}
          jobPositions={jobPositions}
          employees={employees}
          pits={pits}
          mappings={mappings}
          action={upsertEmployeeAction}
          initialEmployee={editingEmployee}
        />
      )}
    </div>
  );
}
