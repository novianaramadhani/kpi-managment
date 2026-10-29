"use client";

import React, { useState, useMemo, useTransition, useRef, useEffect } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Plus,
  Download,
  Upload,
  Layers,
  Building2,
  Globe2,
  Edit2,
  Trash2,
  X,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sliders,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
} from "lucide-react";
import type { Department } from "@/db/schema";
import { type BandDraftItem, cleanDisplayNum } from "./template-editor/scoring-bands-editor";
import {
  exportMasterParametersToExcel,
  parseMasterParametersFromExcel,
  type MasterParamItem,
  type ParsedMasterParamImportItem,
} from "@/lib/excel-template-kpi";

interface MasterParametersTableClientProps {
  parameters: MasterParamItem[];
  departments: Department[];
  createAction: (fd: FormData) => Promise<any>;
  updateAction: (fd: FormData) => Promise<any>;
  deleteAction: (fd: FormData) => Promise<any>;
  deleteBulkAction?: (ids: number[]) => Promise<any>;
  importBulkAction: (
    items: any[],
    options?: { duplicateMode?: "UPDATE" | "SKIP" | "RENAME" }
  ) => Promise<{ createdCount: number; updatedCount: number; skippedCount?: number }>;
  resetAndSyncFromTemplatesAction?: () => Promise<{ success: boolean; count: number }>;
  selectedDeptFilter?: string;
  onDeptFilterChange?: (dept: string) => void;
}

interface DeptGroup {
  key: string; // "GENERAL" or String(dept.id)
  id: number | null;
  name: string;
  code: string;
  prefix: string;
  totalCount: number;
  items: MasterParamItem[];
  codeRange: string;
}

function getDeptPrefix(deptName?: string | null, deptCode?: string | null): string {
  if (!deptName && !deptCode) return "Corp";
  const code = (deptCode || "").trim();
  if (code) {
    return code;
  }
  const name = (deptName || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  if (name) {
    return name.slice(0, 4).toUpperCase();
  }
  return "Dept";
}

function resolveParamDept(
  p: MasterParamItem,
  departments: Department[]
): { isGeneral: boolean; deptId: number | null; deptName: string } {
  if (p.departmentId !== null && p.departmentId !== undefined && p.departmentId !== 0) {
    const dept = departments.find((d) => String(d.id) === String(p.departmentId));
    return {
      isGeneral: false,
      deptId: typeof p.departmentId === "number" ? p.departmentId : Number(p.departmentId),
      deptName: dept?.name || p.departmentName || "Departemen",
    };
  }

  // Fallback: check code prefix or category if departmentId is null
  if (p.code) {
    const rawPrefix = p.code.split("-")[0]?.toLowerCase().trim();
    const cleanPrefix = rawPrefix?.replace(/[^a-z0-9]/g, "");
    if (cleanPrefix && cleanPrefix !== "corp" && cleanPrefix !== "mp" && cleanPrefix !== "gen") {
      const dept = departments.find((d) => {
        const dCode = (d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        const dName = (d.name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        if (!dCode && !dName) return false;
        return (
          dCode === cleanPrefix ||
          dName === cleanPrefix ||
          (dName.length >= 3 && dName.includes(cleanPrefix)) ||
          (cleanPrefix.length >= 3 && cleanPrefix.includes(dName)) ||
          (dCode.length >= 2 && cleanPrefix.includes(dCode))
        );
      });
      if (dept) {
        return {
          isGeneral: false,
          deptId: dept.id,
          deptName: dept.name,
        };
      }
    }
  }

  return {
    isGeneral: true,
    deptId: null,
    deptName: "General",
  };
}

function computeCodeRange(items: MasterParamItem[], fallbackPrefix: string): string {
  if (items.length === 0) return "Belum ada";
  const first = items[0].code || `${fallbackPrefix}-01`;
  const last = items[items.length - 1].code || `${fallbackPrefix}-${String(items.length).padStart(2, "0")}`;
  if (first === last) return first;
  return `${first} s/d ${last}`;
}

function matchesSearch(p: MasterParamItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    p.name.toLowerCase().includes(q) ||
    (p.code || "").toLowerCase().includes(q) ||
    (p.categoryName || "").toLowerCase().includes(q) ||
    (p.description || "").toLowerCase().includes(q) ||
    (p.departmentName || "").toLowerCase().includes(q)
  );
}

function getPaginationRange(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function MasterParametersTableClient({
  parameters,
  departments,
  createAction,
  updateAction,
  deleteAction,
  deleteBulkAction,
  importBulkAction,
  resetAndSyncFromTemplatesAction,
  selectedDeptFilter: controlledDeptFilter,
  onDeptFilterChange,
}: MasterParametersTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [internalDeptFilter, setInternalDeptFilter] = useState<string>(() => {
    if (controlledDeptFilter && controlledDeptFilter !== "ALL") {
      return controlledDeptFilter;
    }
    return "ALL";
  });
  const selectedDeptFilter =
    controlledDeptFilter && controlledDeptFilter !== "" ? controlledDeptFilter : internalDeptFilter;
  const setSelectedDeptFilter = (dept: string) => {
    setInternalDeptFilter(dept);
    onDeptFilterChange?.(dept === "ALL" ? "" : dept);
  };

  useEffect(() => {
    if (controlledDeptFilter && controlledDeptFilter !== "") {
      setInternalDeptFilter(controlledDeptFilter);
    } else {
      setInternalDeptFilter("ALL");
    }
  }, [controlledDeptFilter]);

  // Actions dropdown menu state
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActionsOpen(false);
      }
    };
    if (isActionsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionsOpen]);
  const [isPending, startTransition] = useTransition();

  // Checklist Selection state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<MasterParamItem | null>(null);
  const [targetDeptIdForAdd, setTargetDeptIdForAdd] = useState<string>("GENERAL");

  // Import modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsedItems, setImportParsedItems] = useState<ParsedMasterParamImportItem[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [batchDeptVal, setBatchDeptVal] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<"UPDATE" | "SKIP" | "RENAME">("UPDATE");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Grouped by department for dropdown options
  const deptGroups = useMemo<DeptGroup[]>(() => {
    // 1. Corporate / General
    const corpAll = parameters.filter((p) => resolveParamDept(p, departments).isGeneral);
    const corpFiltered = corpAll.filter((p) => matchesSearch(p, searchQuery));
    const corpRange = computeCodeRange(corpAll, "Corp");

    const groups: DeptGroup[] = [
      {
        key: "GENERAL",
        id: null,
        name: "General",
        code: "CORP",
        prefix: "Corp",
        totalCount: corpAll.length,
        items: corpFiltered,
        codeRange: corpRange,
      },
    ];

    // 2. Specific departments
    for (const d of departments) {
      const dAll = parameters.filter((p) => resolveParamDept(p, departments).deptId === d.id);
      const dFiltered = dAll.filter((p) => matchesSearch(p, searchQuery));
      const prefix = getDeptPrefix(d.name, d.code);
      const range = computeCodeRange(dAll, prefix);

      groups.push({
        key: String(d.id),
        id: d.id,
        name: d.name,
        code: d.code || prefix.toUpperCase(),
        prefix,
        totalCount: dAll.length,
        items: dFiltered,
        codeRange: range,
      });
    }

    return groups;
  }, [parameters, departments, searchQuery]);

  // Filtered parameters directly for the unified table
  const filteredParameters = useMemo(() => {
    return parameters.filter((p) => {
      // 1. Department filter
      if (selectedDeptFilter && selectedDeptFilter !== "ALL") {
        const dInfo = resolveParamDept(p, departments);
        if (selectedDeptFilter === "GENERAL") {
          if (!dInfo.isGeneral) return false;
        } else {
          if (String(dInfo.deptId) !== selectedDeptFilter) return false;
        }
      }

      // 2. Search query (kode, nama indikator, dan deskripsi)
      return matchesSearch(p, searchQuery);
    });
  }, [parameters, selectedDeptFilter, searchQuery, departments]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    (Boolean(selectedDeptFilter) && selectedDeptFilter !== "ALL");

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedDeptFilter("ALL");
  };

  // Pagination logic (limit to 15 items per page)
  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDeptFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredParameters.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredParameters.length);

  const paginatedParameters = useMemo(() => {
    return filteredParameters.slice(startIndex, endIndex);
  }, [filteredParameters, startIndex, endIndex]);

  // Checkbox logic (scoped to active page)
  const isAllSelected =
    paginatedParameters.length > 0 && paginatedParameters.every((p) => selectedIds.includes(p.id));
  const isSomeSelected =
    paginatedParameters.some((p) => selectedIds.includes(p.id)) && !isAllSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const toggleSelectAll = () => {
    const pageIds = paginatedParameters.map((p) => p.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const res = await Swal.fire({
      title: "Hapus Indikator Terpilih?",
      html: `Apakah Anda yakin ingin menghapus <b>${selectedIds.length}</b> indikator terpilih dari Kamus Master?<br/><span class="text-xs text-slate-500">Catatan: Template yang telah menggunakan indikator ini tidak akan terhapus nilainya.</span>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Ya, Hapus (${selectedIds.length})`,
      cancelButtonText: "Batal",
    });

    if (res.isConfirmed) {
      startTransition(async () => {
        try {
          if (deleteBulkAction) {
            await deleteBulkAction(selectedIds);
          } else {
            for (const id of selectedIds) {
              const fd = new FormData();
              fd.append("id", String(id));
              await deleteAction(fd);
            }
          }
          const count = selectedIds.length;
          setSelectedIds([]);
          void Swal.fire({
            icon: "success",
            title: "Berhasil Dihapus",
            text: `${count} indikator berhasil dihapus dari Kamus Master.`,
            timer: 1500,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Gagal menghapus indikator";
          void Swal.fire({ icon: "error", title: "Gagal", text: msg });
        }
      });
    }
  };

  const handleExportSelected = () => {
    if (selectedIds.length === 0) return;
    const itemsToExport = parameters.filter((p) => selectedIds.includes(p.id));
    exportMasterParametersToExcel(
      itemsToExport,
      `Kamus_KPI_Terpilih_${selectedIds.length}_Item.xlsx`
    );
  };

  const handleOpenAddModal = (deptKey?: string) => {
    setEditingParam(null);
    if (deptKey && deptKey !== "ALL") {
      setTargetDeptIdForAdd(deptKey);
    } else if (selectedDeptFilter && selectedDeptFilter !== "ALL") {
      setTargetDeptIdForAdd(selectedDeptFilter);
    } else {
      setTargetDeptIdForAdd("GENERAL");
    }
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (p: MasterParamItem) => {
    setEditingParam(p);
    setIsFormModalOpen(true);
  };

  const handleDelete = (p: MasterParamItem) => {
    void Swal.fire({
      title: "Hapus Indikator dari Kamus?",
      html: `Apakah Anda yakin ingin menghapus <strong>"${p.name}"</strong> (${p.code || ""})?<br/><span class="text-xs text-slate-500">Catatan: Template yang telah menggunakan indikator ini tidak akan terhapus nilainya.</span>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        startTransition(async () => {
          try {
            const fd = new FormData();
            fd.append("id", String(p.id));
            await deleteAction(fd);
            void Swal.fire({
              icon: "success",
              title: "Terhapus",
              text: "Indikator berhasil dihapus dari Kamus Master.",
              timer: 1500,
              showConfirmButton: false,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Gagal menghapus indikator";
            void Swal.fire({ icon: "error", title: "Gagal", text: msg });
          }
        });
      }
    });
  };


  const handleExportAll = () => {
    exportMasterParametersToExcel(
      parameters,
      "Kamus_Master_Parameter_KPI_Seluruh_Departemen.xlsx"
    );
  };

  const handleFileSelectForImport = async (file: File) => {
    setImportFile(file);
    setIsParsingImport(true);
    setBatchDeptVal("");
    try {
      const res = await parseMasterParametersFromExcel(file, departments, parameters);
      setImportParsedItems(res.items);
      setImportErrors(res.errors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file Excel";
      setImportErrors([msg]);
    } finally {
      setIsParsingImport(false);
    }
  };

  const handleUpdateItemDept = (index: number, val: string) => {
    setImportParsedItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (val === "GENERAL") {
        item.departmentId = null;
        item.isUnmapped = false;
      } else if (val === "UNMAPPED" || val === "") {
        item.departmentId = null;
        item.isUnmapped = true;
      } else {
        item.departmentId = Number(val);
        item.isUnmapped = false;
      }
      next[index] = item;
      return next;
    });
  };

  const handleApplyBatchDept = () => {
    if (!batchDeptVal) return;
    setImportParsedItems((prev) =>
      prev.map((item) => {
        if (batchDeptVal === "GENERAL") {
          return { ...item, departmentId: null, isUnmapped: false };
        }
        return { ...item, departmentId: Number(batchDeptVal), isUnmapped: false };
      })
    );
  };

  const handleExecuteImport = () => {
    if (importParsedItems.length === 0) return;
    const unmappedItems = importParsedItems.filter((it) => it.isUnmapped);
    if (unmappedItems.length > 0) {
      void Swal.fire({
        icon: "warning",
        title: "Departemen Belum Dipetakan",
        text: `Terdapat ${unmappedItems.length} indikator yang belum dipetakan ke departemen master. Silakan pilih departemen yang sesuai pada kolom Master Departemen terlebih dahulu.`,
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    startTransition(async () => {
      try {
        const payload = importParsedItems.map((it) => ({
          code: it.code,
          name: it.name,
          description: it.description,
          departmentId: it.departmentId ?? null,
          categoryName: it.categoryName,
          unit: it.unit,
          inputType: it.inputType,
          aggregation: it.aggregation,
          compareBasis: it.compareBasis,
          picRole: it.picRole,
        }));
        const res = await importBulkAction(payload, { duplicateMode });
        setIsImportModalOpen(false);
        setImportFile(null);
        setImportParsedItems([]);
        setImportErrors([]);
        setBatchDeptVal("");

        const skippedMsg = res.skippedCount ? `, dan ${res.skippedCount} dilewati` : "";
        void Swal.fire({
          icon: "success",
          title: "Import Kamus Berhasil!",
          text: `Berhasil memproses indikator: ${res.createdCount} dibuat baru, ${res.updatedCount} diperbarui${skippedMsg} di Kamus Master.`,
          confirmButtonColor: "#0284c7",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal import Kamus Master";
        void Swal.fire({ icon: "error", title: "Gagal Import", text: msg });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* 1. FILTER & GLOBAL ACTIONS TOOLBAR                        */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
        {/* Left: Search, Filter Departemen, Reset */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Live Search */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode, nama, deskripsi..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-900 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Departemen */}
          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:border-slate-900 focus:outline-none cursor-pointer transition shadow-2xs"
            title="Filter Departemen"
          >
            <option value="ALL">Semua Departemen ({parameters.length})</option>
            <option value="GENERAL">
              Umum / Corporate ({deptGroups.find((g) => g.key === "GENERAL")?.totalCount ?? 0})
            </option>
            {departments.map((d) => {
              const group = deptGroups.find((g) => g.key === String(d.id));
              const count = group?.totalCount ?? 0;
              return (
                <option key={d.id} value={String(d.id)}>
                  {d.name} {count > 0 ? `(${count})` : "(0)"}
                </option>
              );
            })}
          </select>

          {/* Tombol Reset */}
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!hasActiveFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition shadow-2xs ${
              hasActiveFilters
                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                : "border-slate-200/60 bg-slate-50 text-slate-400 cursor-not-allowed opacity-50"
            }`}
            title="Reset filter"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Right: Actions Dropdown & + Tambah Indikator */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Tombol Actions (Gabungan Export & Import) */}
          <div className="relative" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setIsActionsOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
              title="Menu aksi import dan export"
              aria-expanded={isActionsOpen}
            >
              <span>Actions</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                  isActionsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isActionsOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg z-30 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    handleExportAll();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer text-left"
                >
                  <Download className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Export Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    setImportFile(null);
                    setImportParsedItems([]);
                    setImportErrors([]);
                    setIsImportModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer text-left"
                >
                  <Upload className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Import Excel</span>
                </button>

                {resetAndSyncFromTemplatesAction && (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsActionsOpen(false);
                      const confirmRes = await Swal.fire({
                        icon: "warning",
                        title: "Reset & Sinkronkan Kamus?",
                        text: "Seluruh Kamus Parameter akan di-reset dan dibuat ulang sesuai dengan seluruh indikator di Template KPI yang aktif saat ini.",
                        showCancelButton: true,
                        confirmButtonText: "Ya, Reset & Sinkronkan",
                        cancelButtonText: "Batal",
                        confirmButtonColor: "#2563eb",
                        cancelButtonColor: "#64748b",
                      });

                      if (!confirmRes.isConfirmed) return;

                      try {
                        const res = await resetAndSyncFromTemplatesAction();
                        await Swal.fire({
                          icon: "success",
                          title: "Berhasil Disinkronkan!",
                          text: `Kamus Parameter berhasil di-reset dan disinkronkan (${res.count} indikator dibuat sesuai template KPI aktif).`,
                          confirmButtonColor: "#2563eb",
                        });
                        window.location.reload();
                      } catch (err: any) {
                        await Swal.fire({
                          icon: "error",
                          title: "Gagal Sinkronisasi",
                          text: err?.message || "Terjadi kesalahan saat menyinkronkan data.",
                          confirmButtonColor: "#2563eb",
                        });
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 hover:text-amber-800 transition cursor-pointer text-left"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Reset dari Template</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* + Tambah Indikator */}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Tambah Indikator</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. CHECKLIST BULK ACTIONS BAR (When items selected)       */}
      {/* ========================================================= */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 font-bold text-emerald-700 text-[11px]">
              ✓
            </span>
            <span className="font-medium text-slate-600">
              <strong className="text-slate-900 text-sm font-semibold">{selectedIds.length}</strong> indikator dipilih
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 font-medium text-slate-700 transition cursor-pointer shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export Terpilih ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 px-3 py-1.5 font-medium transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Hapus Terpilih ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer font-medium"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. UNIFIED MASTER PARAMETERS TABLE                        */}
      {/* ========================================================= */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                    title="Pilih Semua"
                  />
                </th>
                <th className="px-4 py-3 w-24">Kode</th>
                <th className="px-4 py-3 min-w-[260px]">Nama Indikator KPI</th>
                <th className="px-4 py-3 w-36">Departemen</th>
                <th className="px-4 py-3 w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParameters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center text-slate-400">
                    <Search className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">
                      {hasActiveFilters
                        ? "Tidak ada indikator yang cocok dengan pencarian atau filter departemen"
                        : "Belum ada indikator terdaftar"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {hasActiveFilters
                        ? "Coba sesuaikan kata kunci pencarian atau ganti filter departemen."
                        : "Mulai tambahkan indikator baru ke Kamus Master Parameter."}
                    </p>
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset Filter</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>+ Tambah Indikator Baru</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedParameters.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const deptInfo = resolveParamDept(p, departments);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-slate-50/90" : ""
                        }`}
                    >
                      {/* Checkbox Column */}
                      <td className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                      </td>

                      {/* Kode */}
                      <td className="px-4 py-3 font-mono font-semibold text-[11px] text-slate-700 whitespace-nowrap">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {p.code || `MP-${String(p.id).padStart(2, "0")}`}
                        </span>
                      </td>

                      {/* Nama & Deskripsi */}
                      <td
                        className="px-4 py-3 cursor-pointer"
                        onClick={() => handleOpenEditModal(p)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 hover:text-blue-700 hover:underline transition-colors leading-snug cursor-pointer">
                            {p.name}
                          </span>
                          {p.categoryName && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              {p.categoryName}
                            </span>
                          )}
                          {p.isActive === false && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                              Nonaktif
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </td>

                      {/* Departemen */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {deptInfo.isGeneral ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            General
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {deptInfo.deptName}
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            title="Edit Indikator"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            title="Hapus Indikator"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Unified Table Footer with Clean Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <span>
              Menampilkan{" "}
              <strong>{filteredParameters.length === 0 ? 0 : startIndex + 1}</strong>
              {" - "}
              <strong>{endIndex}</strong> dari total{" "}
              <strong>{filteredParameters.length}</strong> indikator
            </span>
            {selectedIds.length > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-700 font-semibold bg-slate-200/70 px-2 py-0.5 rounded-md text-[11px]">
                  {selectedIds.length} dipilih
                </span>
              </>
            )}
          </div>

          {/* Clean Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 self-center sm:self-auto">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                title="Halaman Sebelumnya"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>

              <div className="flex items-center gap-1 mx-0.5">
                {getPaginationRange(safeCurrentPage, totalPages).map((p, idx) => {
                  if (p === "...") {
                    return (
                      <span key={`dots-${idx}`} className="px-1 text-slate-400 select-none">
                        ...
                      </span>
                    );
                  }
                  const pageNum = Number(p);
                  const isActive = pageNum === safeCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-7 min-w-7 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                title="Halaman Selanjutnya"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
              >
                <span className="hidden sm:inline">Selanjutnya</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. MODAL TAMBAH / EDIT MASTER PARAMETER                   */}
      {/* ========================================================= */}
      {isFormModalOpen && (
        <MasterParameterFormModal
          isOpen={isFormModalOpen}
          initialData={editingParam}
          departments={departments}
          defaultDeptId={targetDeptIdForAdd}
          allParameters={parameters}
          onClose={() => setIsFormModalOpen(false)}
          createAction={createAction}
          updateAction={updateAction}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL BULK IMPORT EXCEL */}
      {/* ========================================================= */}
      {isImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            if (!isPending) setIsImportModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Import Kamus Parameter dari Excel</h3>
                  <p className="text-[11px] text-slate-500">
                    Upload file Excel dan petakan indikator ke departemen master sebelum disimpan ke sistem.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isPending}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {!importFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 text-center hover:bg-slate-50 hover:border-emerald-500 transition cursor-pointer"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        void handleFileSelectForImport(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 mb-3 text-emerald-600">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="font-bold text-slate-800 text-sm">
                    Klik untuk memilih file Excel (.xlsx) Kamus Parameter
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-md">
                    Format yang didukung mencakup kolom: Kode, Nama Indikator, Departemen, Kategori Default, Deskripsi, Satuan, Tipe Input, Penilai.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* File Info Bar */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{importFile.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {importParsedItems.length} indikator terbaca dari berkas Excel
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportFile(null);
                        setImportParsedItems([]);
                        setImportErrors([]);
                        setBatchDeptVal("");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                      <span>Ganti File</span>
                    </button>
                  </div>

                  {/* Warning banner jika ada error parsing */}
                  {importErrors.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Peringatan Pembacaan Excel</span>
                      </div>
                      {importErrors.map((err, idx) => (
                        <p key={idx} className="text-[11px]">
                          • {err}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Summary Counters & Batch Mapping Toolbar */}
                  {importParsedItems.length > 0 && (
                    (() => {
                      const unmappedCount = importParsedItems.filter((it) => it.isUnmapped).length;
                      const generalCount = importParsedItems.filter((it) => !it.isUnmapped && it.departmentId === null).length;
                      const mappedDeptCount = importParsedItems.filter((it) => !it.isUnmapped && it.departmentId !== null).length;
                      const duplicateInFileCount = importParsedItems.filter((it) => it.duplicateInFile).length;
                      const duplicateInDbCount = importParsedItems.filter((it) => it.duplicateInDb).length;
                      const newCount = importParsedItems.filter((it) => !it.duplicateInDb && !it.duplicateInFile).length;

                      return (
                        <div className="space-y-3">
                          {/* Alert jika ada kode ganda di dalam file Excel */}
                          {duplicateInFileCount > 0 && (
                            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-rose-950 flex items-start gap-2.5">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <div className="text-xs">
                                <p className="font-bold">
                                  Terdeteksi {duplicateInFileCount} baris dengan kode duplikat di dalam file Excel
                                </p>
                                <p className="text-[11px] text-rose-800 mt-0.5">
                                  Sistem akan secara otomatis menambahkan nomor urut unik pada kode yang sama saat disimpan agar tidak terjadi bentrok data.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Alert jika ada departemen yang belum dipetakan */}
                          {unmappedCount > 0 && (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 flex items-start gap-2.5">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div className="text-xs">
                                <p className="font-bold">
                                  Terdapat {unmappedCount} indikator dengan departemen yang belum dipetakan
                                </p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                  Nama departemen pada Excel tidak cocok dengan master sistem. Silakan pilih departemen master yang sesuai pada kolom dropdown sebelum melakukan import.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Toolbar Validasi Duplikasi Kode DB */}
                          {duplicateInDbCount > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-sky-200 bg-sky-50/80 text-slate-900">
                              <div className="flex items-start sm:items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white text-xs font-bold shrink-0">
                                  <Sliders className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                    <span>Validasi Duplikasi Kode</span>
                                    <span className="rounded-full bg-sky-100 text-sky-800 text-[10px] font-extrabold px-2 py-0.5 border border-sky-300">
                                      {duplicateInDbCount} Kode Sudah di Sistem
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 mt-0.5">
                                    Pilih tindakan saat kode indikator dari Excel sudah ada di sistem.
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <label className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Aksi Kode Sama:</label>
                                <select
                                  value={duplicateMode}
                                  onChange={(e) => setDuplicateMode(e.target.value as "UPDATE" | "SKIP" | "RENAME")}
                                  className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-950 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-2xs cursor-pointer"
                                >
                                  <option value="UPDATE">Perbarui Data Sistem (Update)</option>
                                  <option value="SKIP">Lewati Data Terdaftar (Skip)</option>
                                  <option value="RENAME">Buat Kode Baru Otomatis (Auto-Rename)</option>
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Toolbar Status & Batch Mapping */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                            {/* Summary Pills */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700">
                                Total: <strong className="ml-1 text-slate-900">{importParsedItems.length}</strong>
                              </span>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
                                Baru: <strong className="ml-1">{newCount}</strong>
                              </span>
                              {duplicateInDbCount > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 border border-sky-200 text-sky-800">
                                  Kode di DB: <strong className="ml-1">{duplicateInDbCount}</strong>
                                </span>
                              )}
                              {duplicateInFileCount > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 border border-rose-200 text-rose-800">
                                  Duplikat File: <strong className="ml-1">{duplicateInFileCount}</strong>
                                </span>
                              )}
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 border border-purple-200 text-purple-800">
                                Umum: <strong className="ml-1">{generalCount}</strong>
                              </span>
                              {unmappedCount > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 border border-amber-300 text-amber-900 animate-pulse">
                                  Belum Dipetakan: <strong className="ml-1">{unmappedCount}</strong>
                                </span>
                              )}
                            </div>

                            {/* Batch Set Dept */}
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                Set Semua ke:
                              </span>
                              <select
                                value={batchDeptVal}
                                onChange={(e) => setBatchDeptVal(e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
                              >
                                <option value="">Pilih Departemen...</option>
                                <option value="GENERAL">Umum / Corporate (Semua Dept)</option>
                                <optgroup label="Spesifik Departemen">
                                  {departments.map((d) => (
                                    <option key={d.id} value={String(d.id)}>
                                      {d.name} ({d.code})
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                              <button
                                type="button"
                                onClick={handleApplyBatchDept}
                                disabled={!batchDeptVal}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition disabled:opacity-40 cursor-pointer"
                              >
                                Terapkan
                              </button>
                            </div>
                          </div>

                          {/* Preview Table */}
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                            <div className="max-h-[380px] overflow-y-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold text-slate-700 border-b border-slate-200">
                                  <tr>
                                    <th className="py-2.5 px-3 w-12 text-center border-r border-slate-200">No</th>
                                    <th className="py-2.5 px-3 w-28 text-center border-r border-slate-200">Kode</th>
                                    <th className="py-2.5 px-3 min-w-[200px] border-r border-slate-200">Nama Indikator KPI</th>
                                    <th className="py-2.5 px-3 w-20 text-center border-r border-slate-200">Satuan</th>
                                    <th className="py-2.5 px-3 w-36 border-r border-slate-200">Departemen di Excel</th>
                                    <th className="py-2.5 px-3 min-w-[230px] border-r border-slate-200">Master Departemen</th>
                                    <th className="py-2.5 px-3 w-28 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                  {importParsedItems.map((it, idx) => {
                                    const isRowUnmapped = it.isUnmapped;
                                    const rowSelectVal = isRowUnmapped
                                      ? "UNMAPPED"
                                      : it.departmentId === null
                                      ? "GENERAL"
                                      : String(it.departmentId);

                                    return (
                                      <tr
                                        key={idx}
                                        className={`transition-colors ${
                                          isRowUnmapped
                                            ? "bg-amber-50/50 hover:bg-amber-50"
                                            : it.duplicateInFile
                                            ? "bg-rose-50/30 hover:bg-rose-50/50"
                                            : "hover:bg-slate-50/60"
                                        }`}
                                      >
                                        {/* No */}
                                        <td className="py-2 px-3 text-center font-bold text-slate-500 border-r border-slate-100 align-top">
                                          {idx + 1}
                                        </td>

                                        {/* Kode & Validasi Duplikat */}
                                        <td className="py-2 px-3 font-mono text-[11px] text-center font-semibold text-slate-700 border-r border-slate-100 align-top">
                                          {it.code ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <span className="rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200">
                                                {it.code}
                                              </span>
                                              {it.duplicateInFile && (
                                                <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 border border-rose-200 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 whitespace-nowrap">
                                                  Duplikat File
                                                </span>
                                              )}
                                              {it.duplicateInDb && (
                                                <span
                                                  className="inline-flex items-center gap-0.5 rounded bg-sky-100 border border-sky-200 px-1.5 py-0.2 text-[9px] font-medium text-sky-800 whitespace-nowrap"
                                                  title={`Sudah ada di sistem: "${it.existingParamName || it.name}"`}
                                                >
                                                  Ada di DB
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 italic text-[10px]">Auto</span>
                                          )}
                                        </td>

                                        {/* Nama Indikator */}
                                        <td className="py-2 px-3 border-r border-slate-100 align-top">
                                          <div className="font-semibold text-slate-900 leading-snug">
                                            {it.name}
                                          </div>
                                          {it.categoryName && (
                                            <span className="inline-block mt-0.5 text-[10px] text-slate-500">
                                              Kategori: {it.categoryName}
                                            </span>
                                          )}
                                          {it.description && (
                                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                              {it.description}
                                            </p>
                                          )}
                                        </td>

                                        {/* Satuan */}
                                        <td className="py-2 px-3 text-center font-mono font-medium text-slate-600 border-r border-slate-100 align-top">
                                          {it.unit || "%"}
                                        </td>

                                        {/* Departemen di Excel */}
                                        <td className="py-2 px-3 text-slate-600 border-r border-slate-100 align-top">
                                          {it.rawDepartmentName ? (
                                            <span className="font-medium text-slate-800">
                                              {it.rawDepartmentName}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400 italic text-[11px]">
                                              (Kosong)
                                            </span>
                                          )}
                                        </td>

                                        {/* Master Departemen (Dropdown yang bisa diubah user) */}
                                        <td className="py-2 px-3 border-r border-slate-100 align-top">
                                          <select
                                            value={rowSelectVal}
                                            onChange={(e) => handleUpdateItemDept(idx, e.target.value)}
                                            className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none transition cursor-pointer ${
                                              isRowUnmapped
                                                ? "border-amber-400 bg-white text-amber-900 font-bold focus:border-amber-600 focus:ring-1 focus:ring-amber-500"
                                                : it.departmentId === null
                                                ? "border-purple-200 bg-purple-50/30 text-purple-900 focus:border-purple-600"
                                                : "border-slate-200 bg-white text-slate-900 focus:border-slate-900"
                                            }`}
                                            aria-label={`Pilih departemen untuk indikator ${it.name}`}
                                          >
                                            {isRowUnmapped && (
                                              <option value="UNMAPPED">-- Belum Dipetakan --</option>
                                            )}
                                            <option value="GENERAL">Umum / Corporate (Semua Dept)</option>
                                            <optgroup label="Spesifik Departemen">
                                              {departments.map((d) => (
                                                <option key={d.id} value={String(d.id)}>
                                                  {d.name} ({d.code})
                                                </option>
                                              ))}
                                            </optgroup>
                                          </select>
                                        </td>

                                        {/* Status */}
                                        <td className="py-2 px-3 text-center whitespace-nowrap align-top">
                                          {isRowUnmapped ? (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                              <span>Perlu Dept</span>
                                            </span>
                                          ) : it.duplicateInDb ? (
                                            duplicateMode === "UPDATE" ? (
                                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                                                <RotateCcw className="w-3 h-3 text-sky-600 shrink-0" />
                                                <span>Update</span>
                                              </span>
                                            ) : duplicateMode === "SKIP" ? (
                                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                                <X className="w-3 h-3 text-slate-500 shrink-0" />
                                                <span>Lewati</span>
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                                                <Plus className="w-3 h-3 text-purple-600 shrink-0" />
                                                <span>Kode Baru</span>
                                              </span>
                                            )
                                          ) : (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                              <span>Baru</span>
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 shrink-0">
              <div className="text-[11px] text-slate-500 font-medium">
                {importParsedItems.length > 0 && (
                  (() => {
                    const unmappedCount = importParsedItems.filter((it) => it.isUnmapped).length;
                    const duplicateInDbCount = importParsedItems.filter((it) => it.duplicateInDb).length;
                    if (unmappedCount > 0) {
                      return (
                        <span className="text-amber-700 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline" />
                          Harap petakan {unmappedCount} departemen sebelum melanjutkan.
                        </span>
                      );
                    }
                    return (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                        Seluruh {importParsedItems.length} indikator siap diproses (
                        {duplicateMode === "UPDATE"
                          ? "mode perbarui kode terdaftar"
                          : duplicateMode === "SKIP"
                          ? "mode lewati kode terdaftar"
                          : "mode buat kode baru"}
                        ).
                      </span>
                    );
                  })()
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isPending}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={
                    isPending ||
                    importParsedItems.length === 0 ||
                    importParsedItems.some((it) => it.isUnmapped)
                  }
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer shadow-xs"
                >
                  {isPending
                    ? "Mengimpor..."
                    : duplicateMode === "SKIP" && importParsedItems.filter((it) => it.duplicateInDb).length > 0
                    ? `Import ${importParsedItems.length - importParsedItems.filter((it) => it.duplicateInDb).length} Indikator Baru`
                    : `Import ${importParsedItems.length} Indikator`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MODAL TAMBAH / EDIT MASTER PARAMETER
// =============================================================================
interface MasterParameterFormModalProps {
  isOpen: boolean;
  initialData: MasterParamItem | null;
  departments: Department[];
  defaultDeptId?: string;
  allParameters: MasterParamItem[];
  onClose: () => void;
  createAction: (fd: FormData) => Promise<any>;
  updateAction: (fd: FormData) => Promise<any>;
}

export function computeRunningParamCode(
  deptId: string,
  departments: Department[],
  allParameters: MasterParamItem[],
  excludeParamId?: number
): string {
  const activeDept = departments.find((d) => String(d.id) === String(deptId));
  const prefix = !deptId || deptId === "GENERAL" ? "Corp" : getDeptPrefix(activeDept?.name, activeDept?.code);
  let maxNum = 0;
  for (const p of allParameters) {
    if (excludeParamId && p.id === excludeParamId) continue;
    if (!p.code) continue;
    const match = p.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(2, "0")}`;
}

export function getUnitDisplay(unitStr: string | null | undefined, inputType?: string) {
  const u = (unitStr || "").trim();
  const lower = u.toLowerCase();

  // If currency or mentions Rp
  if (inputType === "CURRENCY" || lower.includes("rp") || lower.includes("rupiah")) {
    if (lower === "juta rp" || lower === "juta rupiah" || lower === "rp juta" || lower === "jt rp" || lower === "rp jt") {
      return { prefix: "Rp", suffix: "Juta" };
    }
    if (lower === "miliar rp" || lower === "miliar rupiah" || lower === "rp miliar" || lower === "m rp") {
      return { prefix: "Rp", suffix: "Miliar" };
    }
    if (lower === "rp/bcm" || lower === "rp / bcm") {
      return { prefix: "Rp", suffix: "/Bcm" };
    }
    if (lower === "rp" || lower === "rupiah") {
      return { prefix: "Rp", suffix: "" };
    }
    const cleanedSuffix = u.replace(/rp\.?/gi, "").trim();
    return { prefix: "Rp", suffix: cleanedSuffix };
  }

  return { prefix: "", suffix: u };
}

function formatThousandInput(raw: string): string {
  if (!raw) return "";
  // Remove existing dots
  const unformatted = raw.replace(/\./g, "");
  if (!unformatted || unformatted === "-") return unformatted;

  // Handle decimal with comma if user entered comma
  const parts = unformatted.split(",");
  const intPart = parts[0].replace(/[^0-9-]/g, "");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (parts.length > 1) {
    const decPart = parts[1].replace(/[^0-9]/g, "").slice(0, 4);
    return `${formattedInt},${decPart}`;
  }

  return formattedInt;
}

function formatInitialNumber(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return String(val);

  if (Number.isInteger(num)) {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  const str = String(num);
  const parts = str.split(".");
  const intFormatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFormatted},${parts[1]}`;
}

function parseFormattedNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).trim();
  if (!str) return null;
  // Remove thousand dots, convert comma to dot for decimal
  const clean = str.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(clean);
  return isNaN(n) ? null : n;
}

function MasterParameterFormModal({
  isOpen,
  initialData,
  departments,
  defaultDeptId,
  allParameters,
  onClose,
  createAction,
  updateAction,
}: MasterParameterFormModalProps) {
  const [isPending, startTransition] = useTransition();

  const isEditing = Boolean(initialData);

  const deptInfo = initialData ? resolveParamDept(initialData, departments) : null;
  const initialDeptId =
    initialData?.departmentId !== null && initialData?.departmentId !== undefined && initialData?.departmentId !== 0
      ? String(initialData.departmentId)
      : deptInfo && !deptInfo.isGeneral && deptInfo.deptId !== null
        ? String(deptInfo.deptId)
        : defaultDeptId && defaultDeptId !== "ALL"
          ? defaultDeptId
          : "GENERAL";

  const [departmentId, setDepartmentId] = useState<string>(initialDeptId);
  const [code, setCode] = useState(() => {
    if (initialData?.code) return initialData.code;
    return computeRunningParamCode(initialDeptId, departments, allParameters);
  });
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [categoryName, setCategoryName] = useState(initialData?.categoryName || "Target Kerja");
  const [unit, setUnit] = useState(initialData?.unit || "%");
  const [inputType, setInputType] = useState(initialData?.inputType || "PERCENTAGE");
  const [aggregation, setAggregation] = useState(initialData?.aggregation || "AVERAGE");
  const [compareBasis, setCompareBasis] = useState(initialData?.compareBasis || "ACTUAL");
  const [picRole, setPicRole] = useState(initialData?.picRole || "HEAD_DEPT");

  const { prefix: unitPrefix, suffix: unitSuffix } = getUnitDisplay(unit, inputType);

  // Accordion state: dasar open by default, others clean and collapsible
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    dasar: true,
    penilaian: false,
    kriteria: false,
  });

  const toggleSection = (key: "dasar" | "penilaian" | "kriteria") => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDepartmentChange = (newDeptId: string) => {
    setDepartmentId(newDeptId);
    if (isEditing && initialData?.code && newDeptId === initialDeptId) {
      setCode(initialData.code);
    } else {
      setCode(computeRunningParamCode(newDeptId, departments, allParameters, isEditing ? initialData?.id : undefined));
    }
  };

  // Scoring Bands State — structured with operator/minValue/maxValue for scoring engine
  const [bands, setBands] = useState<BandDraftItem[]>(() => {
    if (initialData?.defaultBands && Array.isArray(initialData.defaultBands) && initialData.defaultBands.length > 0) {
      return (initialData.defaultBands as any[]).map((b: any, idx: number) => ({
        id: b.id,
        label: b.label ? String(b.label).replace(/(\d+),(\d{3})/g, "$1.$2") : "",
        operator: (b.operator || "GTE") as BandDraftItem["operator"],
        minValue: formatInitialNumber(b.minValue),
        maxValue: formatInitialNumber(b.maxValue),
        score: cleanDisplayNum(b.score) || String(b.score ?? 0),
        sortOrder: b.sortOrder ?? idx + 1,
      }));
    }
    return [
      { label: "Kurang", operator: "LT" as const, minValue: "", maxValue: "95", score: "5", sortOrder: 1 },
      { label: "Baik", operator: "GTE" as const, minValue: "95", maxValue: "", score: "15", sortOrder: 2 },
      { label: "Sangat Baik", operator: "GTE" as const, minValue: "98", maxValue: "", score: "25", sortOrder: 3 },
    ];
  });

  const handleUpdateBand = (index: number, field: keyof BandDraftItem, value: string) => {
    setBands((prev) => {
      const copy = [...prev];
      const current = { ...copy[index] };
      (current as any)[field] = value;

      if (field === "operator") {
        if (value === "GTE" || value === "GT") {
          if (!current.minValue && current.maxValue) current.minValue = current.maxValue;
          current.maxValue = "";
        } else if (value === "LTE" || value === "LT") {
          if (!current.maxValue && current.minValue) current.maxValue = current.minValue;
          current.minValue = "";
        }
      }

      copy[index] = current;
      return copy;
    });
  };

  const handleNumericBandChange = (index: number, field: "minValue" | "maxValue", rawVal: string) => {
    const formatted = formatThousandInput(rawVal);
    handleUpdateBand(index, field, formatted);
  };

  const handleAddBand = () => {
    setBands((prev) => [
      ...prev,
      {
        label: "",
        operator: "GTE",
        minValue: "",
        maxValue: "",
        score: "0",
        sortOrder: prev.length + 1,
      },
    ]);
  };

  const handleRemoveBand = (indexToRemove: number) => {
    setBands((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setOpenSections((prev) => ({ ...prev, dasar: true }));
      void Swal.fire({
        icon: "error",
        title: "Validasi Gagal",
        text: "Nama indikator KPI wajib diisi pada bagian Informasi Dasar!",
      });
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        if (isEditing && initialData) {
          fd.append("id", String(initialData.id));
        }
        if (code.trim()) fd.append("code", code.trim());
        fd.append("name", name.trim());
        fd.append("description", description.trim());
        fd.append("departmentId", departmentId === "GENERAL" ? "" : departmentId);
        fd.append("categoryName", categoryName.trim());
        fd.append("unit", unit.trim() || "%");
        fd.append("inputType", inputType);
        fd.append("aggregation", aggregation);
        fd.append("compareBasis", compareBasis);
        fd.append("picRole", picRole);
        // Serialize bands with proper numeric data for scoring engine
        const serializedBands = bands.map((b, idx) => ({
          label: b.label || "",
          operator: b.operator || "GTE",
          minValue: b.minValue !== "" && b.minValue !== undefined ? parseFormattedNumber(b.minValue) : null,
          maxValue: b.maxValue !== "" && b.maxValue !== undefined ? parseFormattedNumber(b.maxValue) : null,
          score: Number(b.score) || 0,
          sortOrder: b.sortOrder ?? idx + 1,
        }));
        fd.append("bands", JSON.stringify(serializedBands));

        if (isEditing) {
          await updateAction(fd);
        } else {
          await createAction(fd);
        }

        onClose();
        void Swal.fire({
          icon: "success",
          title: isEditing ? "Indikator Diperbarui" : "Indikator Ditambahkan",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan indikator";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - Bersih tanpa subtitle redundan */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-slate-900">
              {isEditing ? "Edit Indikator Parameter" : "Tambah Indikator Parameter"}
            </h3>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 border border-blue-200">
              {code}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body & Sticky Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-3.5 text-xs">
            {/* SEKSI 1: INFORMASI DASAR */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleSection("dasar")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-xs font-bold text-slate-900">1. Informasi Dasar</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    openSections.dasar ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.dasar && (
                <div className="p-4 pt-1 border-t border-slate-100 space-y-3 bg-white">
                  {/* Nama Indikator */}
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5">
                      Nama Indikator KPI <span className="text-rose-600 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Inventory Value (SOH) atau Tingkat Kehadiran"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Kode Parameter (Auto Running Number - Uneditable) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Kode Parameter
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={code}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold text-slate-800 select-none cursor-not-allowed shadow-2xs"
                      />
                    </div>

                    {/* Cakupan / Departemen */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Cakupan Departemen <span className="text-rose-600 font-bold">*</span>
                      </label>
                      <select
                        value={departmentId}
                        onChange={(e) => handleDepartmentChange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 focus:border-slate-900 focus:outline-none cursor-pointer shadow-2xs"
                      >
                        <option value="GENERAL">General (Seluruh Dept)</option>
                        <optgroup label="Spesifik Departemen">
                          {departments.map((d) => (
                            <option key={d.id} value={String(d.id)}>
                              {d.name} ({d.code})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  {/* Deskripsi */}
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5">
                      Deskripsi / Petunjuk Pengukuran
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Petunjuk pengukuran, target acuan, atau rumus..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-normal text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none resize-none shadow-2xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SEKSI 2: PENGATURAN PENILAIAN */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleSection("penilaian")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-xs font-bold text-slate-900">2. Pengaturan Penilaian</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    openSections.penilaian ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.penilaian && (
                <div className="p-4 pt-1 border-t border-slate-100 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Satuan */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Satuan Pengukuran
                      </label>
                      <input
                        type="text"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="%, Hari, Dokumen, Rp, dll"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 focus:border-slate-900 focus:outline-none shadow-2xs"
                      />
                    </div>

                    {/* Tipe Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Tipe Input Nilai
                      </label>
                      <select
                        value={inputType}
                        onChange={(e) => setInputType(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 focus:border-slate-900 focus:outline-none cursor-pointer shadow-2xs"
                      >
                        <option value="PERCENTAGE">PERCENTAGE (%)</option>
                        <option value="MONTHLY_ACTUAL">MONTHLY_ACTUAL (Input Bulanan)</option>
                        <option value="NUMBER">NUMBER (Angka Bulat / Desimal)</option>
                        <option value="CURRENCY">CURRENCY (Rupiah / Uang)</option>
                        <option value="QUALITATIVE">QUALITATIVE (Deskriptif)</option>
                      </select>
                    </div>

                    {/* Metode Agregasi */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Metode Agregasi
                      </label>
                      <select
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 focus:border-slate-900 focus:outline-none cursor-pointer shadow-2xs"
                      >
                        <option value="AVERAGE">AVERAGE (Rata-rata)</option>
                        <option value="SUM">SUM (Total)</option>
                        <option value="LAST_VALUE">LAST_VALUE (Bulan Terakhir)</option>
                        <option value="RATIO">RATIO (Rasio)</option>
                      </select>
                    </div>

                    {/* Basis Perbandingan */}
                    <div>
                      <label className="block text-xs font-bold text-slate-900 mb-1.5">
                        Basis Perbandingan
                      </label>
                      <select
                        value={compareBasis}
                        onChange={(e) => setCompareBasis(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 focus:border-slate-900 focus:outline-none cursor-pointer shadow-2xs"
                      >
                        <option value="ACTUAL">ACTUAL (Nilai Real)</option>
                        <option value="ACHIEVEMENT">ACHIEVEMENT (% Target)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEKSI 3: KRITERIA SKOR */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => toggleSection("kriteria")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">3. Kriteria Skor</span>
                  <span className="text-[11px] font-medium text-slate-500">({bands.length} kriteria)</span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    openSections.kriteria ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.kriteria && (
                <div className="p-4 pt-1 border-t border-slate-100 space-y-3 bg-slate-50/30">
                  {/* Tabel Kriteria Skor */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold w-36">Kondisi</th>
                          <th className="py-2.5 px-3 font-semibold">Nilai Batasan</th>
                          <th className="py-2.5 px-3 font-semibold w-24 text-center">Skor</th>
                          <th className="py-2.5 px-3 font-semibold w-48">Label</th>
                          <th className="py-2.5 px-2 font-semibold w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {bands.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition">
                            {/* 1. Kondisi (Operator) */}
                            <td className="p-2 px-3">
                              <select
                                value={b.operator}
                                onChange={(e) => handleUpdateBand(idx, "operator", e.target.value as BandDraftItem["operator"])}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-none cursor-pointer"
                              >
                                <option value="LT">&lt; (Kurang dari)</option>
                                <option value="LTE">≤ (Kurang dari sama dengan)</option>
                                <option value="GTE">≥ (Lebih dari sama dengan)</option>
                                <option value="GT">&gt; (Lebih dari)</option>
                                <option value="BETWEEN">Antara (Rentang)</option>
                                <option value="EQ">= (Sama dengan)</option>
                              </select>
                            </td>

                            {/* 2. Nilai Batasan */}
                            <td className="p-2 px-3">
                              {b.operator === "BETWEEN" ? (
                                <div className="flex items-center gap-1.5">
                                  {unitPrefix && (
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitPrefix}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={b.minValue}
                                    onChange={(e) => handleNumericBandChange(idx, "minValue", e.target.value)}
                                    placeholder="Min"
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                                  />
                                  <span className="text-[11px] text-slate-400 font-medium">s/d</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={b.maxValue}
                                    onChange={(e) => handleNumericBandChange(idx, "maxValue", e.target.value)}
                                    placeholder="Max"
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                                  />
                                  {unitSuffix && (
                                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100/80 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitSuffix}
                                    </span>
                                  )}
                                </div>
                              ) : b.operator === "LTE" || b.operator === "LT" ? (
                                <div className="flex items-center gap-1.5">
                                  {unitPrefix && (
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitPrefix}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={b.maxValue}
                                    onChange={(e) => handleNumericBandChange(idx, "maxValue", e.target.value)}
                                    placeholder="Batas Maksimal"
                                    className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                                  />
                                  {unitSuffix && (
                                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100/80 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitSuffix}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {unitPrefix && (
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitPrefix}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={b.minValue}
                                    onChange={(e) => {
                                      handleNumericBandChange(idx, "minValue", e.target.value);
                                      if (b.operator === "EQ") {
                                        handleNumericBandChange(idx, "maxValue", e.target.value);
                                      }
                                    }}
                                    placeholder="Batas Minimal"
                                    className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                                  />
                                  {unitSuffix && (
                                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100/80 px-2 py-1.5 rounded-lg border border-slate-200 shrink-0">
                                      {unitSuffix}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 3. Skor */}
                            <td className="p-2 px-3 text-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={b.score}
                                onChange={(e) => handleUpdateBand(idx, "score", e.target.value)}
                                placeholder="25"
                                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                              />
                            </td>

                            {/* 4. Label */}
                            <td className="p-2 px-3">
                              <input
                                type="text"
                                value={b.label}
                                onChange={(e) => handleUpdateBand(idx, "label", e.target.value)}
                                placeholder="Contoh: Kurang, Baik, Sangat Baik"
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 focus:border-slate-900 focus:outline-none"
                              />
                            </td>

                            {/* 5. Action */}
                            <td className="p-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveBand(idx)}
                                disabled={bands.length <= 1}
                                title={bands.length <= 1 ? "Minimal 1 kriteria" : "Hapus kriteria"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Tombol + Tambah Kriteria */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleAddBand}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-500" />
                      <span>+ Tambah Kriteria</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Modal Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Simpan ke Kamus"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
