"use client";

import React, { useState, useMemo, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import {
  Eye,
  Edit3,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  RotateCcw,
  Building2,
  UserCheck,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  FileSpreadsheet,
  X,
  Sparkles,
  User,
} from "lucide-react";
import {
  exportKpiTemplateToExcel,
  exportBatchKpiTemplatesToCombinedExcel,
} from "@/lib/excel-template-kpi";
import { findMasterEmployeeForTemplate } from "@/lib/master-employee-matcher";
import type {
  Appraisal,
  Department,
  Employee,
  JobLevel,
  JobPosition,
  KpiBand,
  KpiCategory,
  KpiParameter,
  KpiPeriod,
  KpiTemplate,
  Pit,
  DepartmentMapping,
} from "@/db/schema";
import type { TemplateAssignmentStatus } from "@/lib/template-assignment-service";
import { TemplateModal } from "./template-modal";
import { TemplateViewModal } from "./template-view-modal";
import { TemplateAssignmentDrawer, prefetchTemplateAssignment } from "./template-assignment-drawer";
import { TemplateImportExcelModal } from "./template-import-excel-modal";
import { TemplateUploadModal } from "./template-upload-modal";
import { PersonalTemplateModal } from "./personal-template-modal";

interface TemplateListClientProps {
  templates: KpiTemplate[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  categories: KpiCategory[];
  parameters?: KpiParameter[];
  bands?: KpiBand[];
  employees?: Employee[];
  activePeriod?: KpiPeriod;
  periods?: KpiPeriod[];
  existingAppraisals?: Appraisal[];
  templateUsageMap?: Record<number, number>;
  assignmentOverview?: Record<number, TemplateAssignmentStatus>;
  createAction: (fd: FormData) => Promise<void>;
  deleteAction?: (fd: FormData) => Promise<void>;
  deleteBulkAction?: (ids: number[]) => Promise<void>;
  updateAction?: (fd: FormData) => Promise<void>;
  assignAction?: (fd: FormData) => Promise<void>;
  duplicateAction?: (fd: FormData) => Promise<void>;
  selectedDept?: string;
  onDeptChange?: (dept: string) => void;
  pits?: Pit[];
  departmentMappings?: DepartmentMapping[];
}

export function TemplateListClient({
  templates,
  departments,
  jobLevels,
  jobPositions = [],
  categories,
  parameters = [],
  bands = [],
  employees = [],
  activePeriod,
  periods = [],
  existingAppraisals = [],
  templateUsageMap = {},
  assignmentOverview = {},
  createAction,
  deleteAction,
  deleteBulkAction,
  duplicateAction,
  selectedDept: controlledDept,
  onDeptChange,
  pits = [],
  departmentMappings = [],
}: TemplateListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Prefetch active templates on mount to eliminate drawer loading latency
  React.useEffect(() => {
    const published = templates.filter((t) => t.isActive);
    for (const t of published) {
      prefetchTemplateAssignment(t.id, activePeriod?.id);
    }
  }, [templates, activePeriod?.id]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [internalDept, setInternalDept] = useState("");
  const selectedDept = controlledDept !== undefined ? controlledDept : internalDept;
  const setSelectedDept = (dept: string) => {
    setInternalDept(dept);
    onDeptChange?.(dept);
  };


  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Modals & Drawer state
  const [isStandardModalOpen, setIsStandardModalOpen] = useState(false);
  const [isPersonalModalOpen, setIsPersonalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const actionsDropdownRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [viewingTemplate, setViewingTemplate] = useState<KpiTemplate | null>(null);
  const [assigningTemplate, setAssigningTemplate] = useState<KpiTemplate | null>(null);
  const [assigningInitialTab, setAssigningInitialTab] = useState<"PENILAI" | "KARYAWAN">("PENILAI");



  // Click outside listener for Actions & Add Menu dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        actionsDropdownRef.current &&
        !actionsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsActionsOpen(false);
      }
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setIsAddMenuOpen(false);
      }
    }
    if (isActionsOpen || isAddMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isActionsOpen, isAddMenuOpen]);

  // Lookup dictionaries
  const deptMap = useMemo(() => {
    const map = new Map<number, Department>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const levelMap = useMemo(() => {
    const map = new Map<number, JobLevel>();
    jobLevels.forEach((l) => map.set(l.id, l));
    return map;
  }, [jobLevels]);

  const pitMap = useMemo(() => {
    const map = new Map<number, Pit>();
    pits.forEach((p) => map.set(p.id, p));
    return map;
  }, [pits]);

  const employeeMap = useMemo(() => {
    const map = new Map<number, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return templates.filter((t) => {
      const dep = deptMap.get(t.departmentId);
      const lvl = levelMap.get(t.jobLevelId);
      const emp = t.employeeId ? employeeMap.get(t.employeeId) : null;

      if (q) {
        const matchName = t.name.toLowerCase().includes(q);
        const matchEmp = emp
          ? emp.name.toLowerCase().includes(q) || emp.nik.toLowerCase().includes(q)
          : false;
        const matchDept = dep
          ? dep.name.toLowerCase().includes(q) || dep.code.toLowerCase().includes(q)
          : false;
        const matchLevel = lvl
          ? lvl.name.toLowerCase().includes(q) || (lvl.code && lvl.code.toLowerCase().includes(q))
          : false;
        if (!matchName && !matchEmp && !matchDept && !matchLevel) return false;
      }

      if (
        selectedDept &&
        selectedDept !== "ALL" &&
        selectedDept !== "GENERAL" &&
        String(t.departmentId) !== selectedDept
      ) {
        return false;
      }

      return true;
    });
  }, [templates, searchQuery, selectedDept, deptMap, levelMap, employeeMap]);

  // Pagination calculations
  const totalItems = filteredTemplates.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTemplates.slice(start, start + pageSize);
  }, [filteredTemplates, currentPage, pageSize]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    (selectedDept && selectedDept !== "ALL" && selectedDept !== "GENERAL")
  );

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedDept("");
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  // Selection handlers
  const isAllPageSelected =
    paginatedTemplates.length > 0 &&
    paginatedTemplates.every((t) => selectedIds.has(t.id));

  const isSomePageSelected =
    paginatedTemplates.some((t) => selectedIds.has(t.id)) && !isAllPageSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomePageSelected;
    }
  }, [isSomePageSelected]);

  const toggleSelectTemplate = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        paginatedTemplates.forEach((t) => next.delete(t.id));
      } else {
        paginatedTemplates.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredTemplates.map((t) => t.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedTemplates = useMemo(() => {
    return templates.filter((t) => selectedIds.has(t.id));
  }, [templates, selectedIds]);

  // Actions
  const handleDuplicate = async (t: KpiTemplate) => {
    if (!duplicateAction) return;
    const confirm = await Swal.fire({
      title: "Duplikat Template KPI?",
      text: `Buat salinan baru dari template "${t.name}"?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Duplikat",
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      const fd = new FormData();
      fd.append("id", String(t.id));
      startTransition(async () => {
        try {
          await duplicateAction(fd);
          router.refresh();
          await Swal.fire({
            icon: "success",
            title: "Template Diduplikat",
            timer: 1200,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "digest" in err &&
            String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
          ) {
            throw err;
          }
          const msg = err instanceof Error ? err.message : "Gagal menduplikat template.";
          Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#2563eb" });
        }
      });
    }
  };

  const handleDeleteSingle = async (t: KpiTemplate) => {
    if (!deleteAction) return;

    const confirm = await Swal.fire({
      title: `Hapus Template "${t.name}"?`,
      text: "Template ini akan dihapus langsung secara permanen dari database.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Permanen",
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      const fd = new FormData();
      fd.append("id", String(t.id));
      startTransition(async () => {
        try {
          await deleteAction(fd);
          router.refresh();
          await Swal.fire({
            icon: "success",
            title: "Template Dihapus",
            timer: 1200,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Gagal menghapus template";
          Swal.fire({ icon: "error", title: "Gagal Menghapus", text: msg, confirmButtonColor: "#2563eb" });
        }
      });
    }
  };

  // Protected Edit handler for templates with active assignments
  const handleEditProtected = (e: React.MouseEvent, t: KpiTemplate) => {
    const assignedCount = assignmentOverview[t.id]?.assignedCount ?? (templateUsageMap[t.id] || 0);
    if (assignedCount > 0) {
      e.preventDefault();
      void Swal.fire({
        title: "Template Sedang Aktif Digunakan",
        text: `Template "${t.name}" sudah ditugaskan ke ${assignedCount} karyawan aktif. Mengubah struktur dapat mempengaruhi penilaian berjalan. Disarankan membuat versi baru (duplikat).`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Buat Versi Baru (Duplikat)",
        cancelButtonText: "Tetap Edit Langsung",
      }).then((result) => {
        if (result.isConfirmed) {
          handleDuplicate(t);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
          router.push(`/setup/templates/${t.id}`);
        }
      });
    }
  };

  // Export templates list to Excel
  const handleExportTemplates = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredTemplates.map((t, idx) => {
      const dep = deptMap.get(t.departmentId);
      const lvl = levelMap.get(t.jobLevelId);
      const tplCats = categories.filter((c) => c.templateId === t.id);
      const catIds = new Set(tplCats.map((c) => c.id));
      const tplParams = (parameters || []).filter((p) => catIds.has(p.categoryId));
      const usage = assignmentOverview[t.id]?.assignedCount ?? (templateUsageMap[t.id] || 0);

      return {
        "No": idx + 1,
        "Nama Template": t.name,
        "Departemen": dep?.name || "Semua Departemen",
        "Kode Dept": dep?.code || "-",
        "Job Level": lvl?.name || "Semua Level",
        "Kode Level": lvl?.code || "-",
        "Status": t.isActive ? "Published" : "Draft",
        "Versi": `v${t.version || 1}.0`,
        "Jumlah Parameter": tplCats.length,
        "Jumlah Indikator": tplParams.length,
        "Karyawan Ditugaskan": usage,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 22 },
      { wch: 12 },
      { wch: 20 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Master Template KPI");
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Master_Template_KPI_${dateStr}.xlsx`);
  };

  // Export single template to Excel (Full Structure: Parameter, Indikator, Kriteria, Bobot)
  const handleExportSingle = (t: KpiTemplate) => {
    const dep = deptMap.get(t.departmentId);
    const lvl = levelMap.get(t.jobLevelId);
    const tplCats = categories.filter((c) => c.templateId === t.id);
    const catIds = new Set(tplCats.map((c) => c.id));
    const tplParams = (parameters || []).filter((p) => catIds.has(p.categoryId));
    const paramIds = new Set(tplParams.map((p) => p.id));
    const tplBands = (bands || []).filter((b) => paramIds.has(b.parameterId));

    const emp = findMasterEmployeeForTemplate({
      template: t,
      employees,
      existingAppraisals,
      departments,
    });

    exportKpiTemplateToExcel({
      template: t,
      departmentName: emp?.departmentName || dep?.name,
      jobLevelName: lvl?.name,
      employee: emp,
      categories: tplCats,
      parameters: tplParams,
      bands: tplBands,
    });
  };

  // Batch Export: Download file Excel terpisah untuk setiap template yang diceklis
  const handleExportBatchPerTemplate = async () => {
    if (selectedTemplates.length === 0) return;
    const count = selectedTemplates.length;

    Swal.fire({
      title: "Mendownload Template...",
      html: `<div class="text-xs text-slate-600 mt-2">Sedang menyiapkan dan mendownload <b>${count}</b> file Excel template...</div>`,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      for (let i = 0; i < selectedTemplates.length; i++) {
        const t = selectedTemplates[i];
        handleExportSingle(t);
        if (i < selectedTemplates.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      await Swal.fire({
        icon: "success",
        title: "Batch Download Selesai",
        text: `${count} file template Excel berhasil didownload ke folder Downloads.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error("Batch download error:", err);
      Swal.fire({
        icon: "error",
        title: "Gagal Download",
        text: "Terjadi kesalahan saat memproses file Excel.",
        confirmButtonColor: "#2563eb",
      });
    }
  };

  // Batch Export: Download seluruh template terpilih dalam 1 file Excel gabungan (multi-sheet)
  const handleExportBatchCombined = () => {
    if (selectedTemplates.length === 0) return;

    const items = selectedTemplates.map((t) => {
      const dep = deptMap.get(t.departmentId);
      const lvl = levelMap.get(t.jobLevelId);
      const tplCats = categories.filter((c) => c.templateId === t.id);
      const catIds = new Set(tplCats.map((c) => c.id));
      const tplParams = (parameters || []).filter((p) => catIds.has(p.categoryId));
      const paramIds = new Set(tplParams.map((p) => p.id));
      const tplBands = (bands || []).filter((b) => paramIds.has(b.parameterId));
      const emp = findMasterEmployeeForTemplate({
        template: t,
        employees,
        existingAppraisals,
        departments,
      });

      return {
        template: t,
        departmentName: emp?.departmentName || dep?.name,
        jobLevelName: lvl?.name,
        employee: emp,
        categories: tplCats,
        parameters: tplParams,
        bands: tplBands,
      };
    });

    exportBatchKpiTemplatesToCombinedExcel(items);
  };

  // Bulk delete selected templates
  const handleDeleteBatchSelected = async () => {
    if (!deleteBulkAction || selectedTemplates.length === 0) return;
    const count = selectedTemplates.length;

    const confirm = await Swal.fire({
      title: `Hapus ${count} Template Terpilih?`,
      text: `Seluruh data dari ${count} template terpilih akan dihapus langsung secara permanen dari database.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Ya, Hapus ${count} Template`,
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      startTransition(async () => {
        try {
          await deleteBulkAction(Array.from(selectedIds));
          clearSelection();
          router.refresh();
          await Swal.fire({
            icon: "success",
            title: "Template Dihapus",
            timer: 1200,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Gagal menghapus template";
          Swal.fire({ icon: "error", title: "Gagal Menghapus", text: msg, confirmButtonColor: "#2563eb" });
        }
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. FILTER & ACTION TOOLBAR */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Search & Dropdown Filters */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari template, karyawan, NIK..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Department Filter */}
            <select
              value={selectedDept === "ALL" || selectedDept === "GENERAL" ? "" : selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value || "ALL");
                setCurrentPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-medium focus:border-blue-600 focus:outline-none transition cursor-pointer shrink-0 max-w-[240px]"
            >
              <option value="">Semua Departemen ({departments.length})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer text-xs shrink-0"
                title="Reset Filter"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Right: Actions, Import Excel, Tambah Template */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Actions Dropdown */}
            <div className="relative" ref={actionsDropdownRef}>
              <button
                type="button"
                onClick={() => setIsActionsOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition cursor-pointer"
                aria-expanded={isActionsOpen}
                aria-haspopup="true"
              >
                <span>Actions</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                    isActionsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isActionsOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                  {/* 1. Import Excel Wizard */}
                  <Link
                    href="/setup/templates/import"
                    onClick={() => setIsActionsOpen(false)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-100 transition">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-emerald-600">
                        Import Excel Master KPI
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Upload Excel bertingkat, mapping kamus &amp; validasi
                      </div>
                    </div>
                  </Link>

                  {/* 2. Format & Unduh Template */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-100 transition">
                      <Download className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-600">
                        Format Excel Siap Pakai
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Review struktur 6 kolom &amp; unduh template Excel
                      </div>
                    </div>
                  </button>

                  {/* 3. Upload Template Cepat */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsOpen(false);
                      setIsUploadModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-slate-200 transition">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                        Upload Template Cepat
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Upload ringkas dengan tabel baris inline
                      </div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  {/* 4. Export Batch if selected */}
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        handleExportBatchPerTemplate();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 flex items-start gap-2.5 transition group cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-200 transition">
                        <Download className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-emerald-900 group-hover:text-emerald-700">
                          Download Batch Terpilih ({selectedIds.size})
                        </div>
                        <div className="text-[11px] text-emerald-700/80 leading-tight">
                          Download file Excel untuk {selectedIds.size} template yang diceklis
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Export Summary */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsOpen(false);
                      handleExportTemplates();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-slate-200 transition">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                        Export Ringkasan Excel
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Download daftar seluruh master template KPI
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Import Excel Button */}
            <Link
              href="/setup/templates/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 shadow-2xs transition cursor-pointer"
              title="Import Master Template KPI dari berkas Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import Excel</span>
            </Link>

            {/* Tambah Template Menu Dropdown */}
            <div className="relative" ref={addMenuRef}>
              <button
                type="button"
                onClick={() => setIsAddMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition active:scale-95 cursor-pointer"
                title="Pilih jenis template yang ingin dibuat"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Template</span>
                <ChevronDown
                  className={`w-3 h-3 text-white/80 transition-transform ${
                    isAddMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isAddMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      setIsStandardModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50/70 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-200 transition">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                        Template Standar Jabatan
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Acuan departemen &amp; jenjang jabatan
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      setIsPersonalModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50/70 flex items-start gap-2.5 transition group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-amber-200 transition">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-700">
                        Template Personal Karyawan
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        Template khusus individu seorang karyawan
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. FLAT ENTERPRISE TABLE VIEW */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Selection Banner if any items are selected */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50/90 border-b border-blue-200 px-4 py-2 flex items-center justify-between gap-3 text-xs flex-wrap animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-900">
                {selectedIds.size} template dipilih
              </span>
              {selectedIds.size < filteredTemplates.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-blue-700 hover:text-blue-900 underline font-medium ml-1 cursor-pointer"
                >
                  Pilih semua ({filteredTemplates.length}) hasil filter
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportBatchPerTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs transition active:scale-95 cursor-pointer text-xs"
                title="Download setiap template terpilih sebagai file Excel terpisah"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel Batch ({selectedIds.size} File)</span>
              </button>

              <button
                type="button"
                onClick={handleExportBatchCombined}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition cursor-pointer text-xs"
                title="Download 1 file Excel multi-sheet berisi seluruh template terpilih"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>1 File Gabungan</span>
              </button>

              {deleteBulkAction && (
                <button
                  type="button"
                  onClick={handleDeleteBatchSelected}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer text-xs font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}

              <button
                type="button"
                onClick={clearSelection}
                className="text-slate-500 hover:text-slate-700 px-2 py-1 cursor-pointer font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200/80">
              <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={isAllPageSelected}
                    onChange={toggleSelectAllPage}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer align-middle"
                    title={isAllPageSelected ? "Batalkan pilihan semua" : "Pilih semua di halaman ini"}
                  />
                </th>
                <th className="py-3 px-2 w-10 text-center font-mono text-slate-400">No</th>
                <th className="py-3 px-4 min-w-[240px]">Nama Template</th>
                <th className="py-3 px-4 w-44">Departemen</th>
                <th className="py-3 px-4 w-36">Job Level</th>
                <th className="py-3 px-3 w-28">Status</th>
                <th className="py-3 px-3 w-24 text-center">Total Bobot</th>
                <th className="py-3 px-4 w-52">Penugasan</th>
                <th className="py-3 px-4 w-36 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTemplates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">
                      {hasActiveFilters
                        ? "Tidak ada template yang cocok"
                        : "Belum ada template KPI"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {hasActiveFilters
                        ? "Silakan sesuaikan filter pencarian Anda."
                        : "Klik Tambah Template untuk membuat template baru."}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedTemplates.map((t, idx) => {
                  const dep = deptMap.get(t.departmentId);
                  const lvl = levelMap.get(t.jobLevelId);
                  const emp = t.employeeId ? employeeMap.get(t.employeeId) : null;
                  const baseTpl = t.baseTemplateId ? templates.find((b) => b.id === t.baseTemplateId) : null;
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const assignInfo = assignmentOverview[t.id];
                  const isSelected = selectedIds.has(t.id);

                  return (
                    <tr
                      key={t.id}
                      className={`transition group ${
                        isSelected ? "bg-blue-50/50 hover:bg-blue-50/70" : "hover:bg-slate-50/60"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectTemplate(t.id)}
                          className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer align-middle"
                          title={`Pilih ${t.name}`}
                        />
                      </td>

                      {/* No */}
                      <td className="py-3 px-2 text-center font-mono text-slate-400 text-[11px]">
                        {rowNumber}
                      </td>

                      {/* Nama Template & Metadata */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/setup/templates/${t.id}`}
                          onClick={(e) => handleEditProtected(e, t)}
                          className="font-bold text-xs text-slate-900 hover:text-blue-600 transition block leading-snug"
                        >
                          {t.name.replace(/^\[Personal\]\s*/i, "")}
                        </Link>

                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className="text-[10px] font-mono text-slate-400">
                            v{t.version || 1}.0
                          </span>

                          {t.site && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
                              Site: {t.site}
                            </span>
                          )}

                          {t.pitId && pitMap.get(t.pitId) ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                              PIT: {pitMap.get(t.pitId)?.name}
                            </span>
                          ) : t.site ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-normal text-slate-500 bg-slate-100 border border-slate-200/80">
                              Non-PIT
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Departemen */}
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {dep?.name ?? "Semua Departemen"}
                      </td>

                      {/* Job Level */}
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {t.isCustom
                          ? emp?.jobPosition || lvl?.name || "-"
                          : lvl?.name ?? "Semua Level"}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            t.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              t.isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          <span>{t.isActive ? "Published" : "Draft"}</span>
                        </span>
                      </td>

                      {/* Total Bobot */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 text-center">
                        115%
                      </td>

                      {/* Penugasan Column */}
                      <td className="py-3 px-4">
                        {t.isCustom && emp ? (
                          <button
                            type="button"
                            onMouseEnter={() => t.isActive && prefetchTemplateAssignment(t.id, activePeriod?.id)}
                            onClick={() => {
                              if (t.isActive) {
                                setAssigningInitialTab("PENILAI");
                                setAssigningTemplate(t);
                              } else {
                                void Swal.fire({
                                  icon: "info",
                                  title: "Template Belum Published",
                                  text: "Publish template terlebih dahulu sebelum dapat menugaskannya ke penilai.",
                                  confirmButtonColor: "#2563eb",
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer select-none active:scale-95 text-left"
                            title={t.isActive ? "Klik untuk melihat & atur penilai karyawan ini" : "Publish template terlebih dahulu"}
                          >
                            <User className="w-3 h-3 text-amber-600" />
                            <span>1 Karyawan (Personal)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onMouseEnter={() => t.isActive && prefetchTemplateAssignment(t.id, activePeriod?.id)}
                            onClick={() => {
                              if (t.isActive) {
                                setAssigningInitialTab("KARYAWAN");
                                setAssigningTemplate(t);
                              } else {
                                void Swal.fire({
                                  icon: "info",
                                  title: "Template Belum Published",
                                  text: "Publish template terlebih dahulu sebelum dapat menugaskannya ke karyawan.",
                                  confirmButtonColor: "#2563eb",
                                });
                              }
                            }}
                            className={`text-left transition cursor-pointer group/btn select-none active:scale-95 ${
                              t.isActive ? "hover:opacity-90" : "opacity-80 cursor-not-allowed"
                            }`}
                            title={
                              t.isActive
                                ? "Klik untuk melihat & mengelola daftar karyawan yang ditugaskan template ini"
                                : "Publish template terlebih dahulu"
                            }
                          >
                            {!assignInfo || assignInfo.assignedCount === 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 group-hover/btn:bg-slate-200 group-hover/btn:border-slate-300 transition">
                                <UserPlus className="w-3 h-3 text-slate-400 group-hover/btn:text-slate-600" />
                                <span>Belum ada penugasan</span>
                              </span>
                            ) : assignInfo.isAssessorComplete ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover/btn:bg-emerald-100 group-hover/btn:border-emerald-300 transition">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{assignInfo.assignedCount} karyawan · Penilai lengkap</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 group-hover/btn:bg-amber-100 group-hover/btn:border-amber-300 transition">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>{assignInfo.assignedCount} karyawan · Penilai belum lengkap</span>
                              </span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {/* View */}
                          <button
                            type="button"
                            onClick={() => setViewingTemplate(t)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Preview Template"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Download Excel Template (Per Template) */}
                          <button
                            type="button"
                            onClick={() => handleExportSingle(t)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            title="Download Excel Template (Struktur KPI)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <Link
                            href={`/setup/templates/${t.id}`}
                            onClick={(e) => handleEditProtected(e, t)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Edit Struktur KPI"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Link>

                          {/* Assign Penilai (UserCheck) */}
                          <button
                            type="button"
                            onMouseEnter={() => t.isActive && prefetchTemplateAssignment(t.id, activePeriod?.id)}
                            onClick={() => {
                              if (t.isActive) {
                                setAssigningInitialTab("PENILAI");
                                setAssigningTemplate(t);
                              } else {
                                void Swal.fire({
                                  icon: "info",
                                  title: "Template Belum Published",
                                  text: "Publish template terlebih dahulu sebelum dapat menugaskannya ke penilai.",
                                  confirmButtonColor: "#2563eb",
                                });
                              }
                            }}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              t.isActive
                                ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                : "text-slate-300 hover:bg-slate-100 cursor-not-allowed"
                            }`}
                            title={t.isActive ? "Assign Penilai" : "Publish template terlebih dahulu"}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          {deleteAction && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(t)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Hapus Template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 3. PAGINATION BAR */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Menampilkan {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, totalItems)} dari {totalItems} data
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`w-7 h-7 rounded-lg font-semibold text-xs transition ${
                  currentPage === pageNum
                    ? "bg-blue-600 text-white shadow-xs"
                    : "border border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DRAWER TUGASKAN TEMPLATE & PENILAI */}
      {assigningTemplate && (
        <TemplateAssignmentDrawer
          isOpen={!!assigningTemplate}
          onClose={() => setAssigningTemplate(null)}
          templateId={assigningTemplate.id}
          periodId={activePeriod?.id}
          initialTab={assigningInitialTab}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}



      {/* MODAL PREVIEW */}
      {viewingTemplate && (
        <TemplateViewModal
          isOpen={!!viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          template={viewingTemplate}
          department={deptMap.get(viewingTemplate.departmentId)}
          jobLevel={levelMap.get(viewingTemplate.jobLevelId)}
          employee={findMasterEmployeeForTemplate({
            template: viewingTemplate,
            employees,
            existingAppraisals,
            departments,
          })}
          categories={categories.filter((c) => c.templateId === viewingTemplate.id)}
          parameters={parameters}
          bands={bands}
        />
      )}
      {/* MODAL IMPORT TEMPLATE DARI EXCEL (2 TAHAP) */}
      <TemplateImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        departments={departments}
        jobLevels={jobLevels}
        jobPositions={jobPositions}
        employees={employees}
        templates={templates}
        periods={periods}
        activePeriod={activePeriod}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* MODAL UPLOAD TEMPLATE LANGSUNG (1 STAGING) */}
      <TemplateUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        departments={departments}
        jobLevels={jobLevels}
        jobPositions={jobPositions}
        employees={employees}
        periods={periods}
        activePeriod={activePeriod}
        categories={categories}
        parameters={parameters}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* MODAL BUAT TEMPLATE STANDAR JABATAN */}
      <TemplateModal
        isOpen={isStandardModalOpen}
        onClose={() => setIsStandardModalOpen(false)}
        departments={departments}
        jobLevels={jobLevels}
        positions={jobPositions}
        periods={periods}
        pits={pits}
        departmentMappings={departmentMappings}
        action={createAction}
      />

      {/* MODAL BUAT TEMPLATE PERSONAL KARYAWAN */}
      <PersonalTemplateModal
        isOpen={isPersonalModalOpen}
        onClose={() => setIsPersonalModalOpen(false)}
        employees={employees}
        templates={templates}
        departments={departments}
        jobLevels={jobLevels}
        jobPositions={jobPositions}
        categories={categories}
        parameters={parameters}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
