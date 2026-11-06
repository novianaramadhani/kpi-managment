"use client";

import React, { useState, useMemo, useTransition } from "react";
import type { Department, JobLevel, JobPosition, JobCategory } from "@/db/schema";
import type {
  JobPositionMappingWithDetails,
  CategoryDetailsWithEmployees,
  CategoryEmployeeDetail,
} from "@/lib/job-position-mapping-actions";
import {
  upsertJobPositionMappingAction,
  createPositionAndMappingAction,
  createJobCategoryAction,
  updateJobCategoryAction,
  deleteJobCategoryAction,
  deleteJobPositionMappingAction,
  importJobPositionMappingsBatchAction,
  getEmployeesByJobCategoryAction,
} from "@/lib/job-position-mapping-actions";
import {
  exportJobPositionMappingsToExcel,
  downloadJobPositionMappingTemplate,
  parseJobPositionMappingExcelFile,
  exportCategoryEmployeesToExcel,
} from "@/lib/excel-job-position-mapping";
import Swal from "sweetalert2";
import {
  Search,
  Plus,
  Download,
  Upload,
  Pencil,
  Trash2,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
  Layers,
  ArrowUpDown,
  Loader2,
  Users,
} from "lucide-react";

interface JobPositionMappingTableClientProps {
  initialMappings: JobPositionMappingWithDetails[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobCategories: JobCategory[];
}

export function JobPositionMappingTableClient({
  initialMappings,
  departments,
  jobLevels,
  jobCategories,
}: JobPositionMappingTableClientProps) {
  const [isPending, startTransition] = useTransition();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("ALL");
  const [selectedCatId, setSelectedCatId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "MAPPED" | "UNMAPPED">("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<"dept" | "position" | "level" | "category">("dept");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modals state
  const [editingItem, setEditingItem] = useState<JobPositionMappingWithDetails | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Category Employees Modal state (klik kolom terpakai)
  const [categoryEmployeeModalData, setCategoryEmployeeModalData] = useState<CategoryDetailsWithEmployees | null>(null);
  const [isLoadingCategoryEmployees, setIsLoadingCategoryEmployees] = useState(false);
  const [loadingCategoryId, setLoadingCategoryId] = useState<number | null>(null);
  const [categoryEmpSearch, setCategoryEmpSearch] = useState("");
  const [categoryEmpDeptFilter, setCategoryEmpDeptFilter] = useState("ALL");
  const [categoryEmpStatusFilter, setCategoryEmpStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [categoryEmpTab, setCategoryEmpTab] = useState<"EMPLOYEES" | "POSITIONS">("EMPLOYEES");

  // Form states for Single Mapping Edit/Add
  const [formDeptId, setFormDeptId] = useState<number>(0);
  const [formPosId, setFormPosId] = useState<number>(0);
  const [formPosName, setFormPosName] = useState<string>("");
  const [formPosCode, setFormPosCode] = useState<string>("");
  const [formLevelId, setFormLevelId] = useState<string>("");
  const [formCatId, setFormCatId] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  // Category management form state
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Job Levels specifically for Staff and Non Staff (from master job level)
  const staffNonStaffLevels = useMemo(() => {
    return jobLevels.filter((lvl) => {
      const code = (lvl.code || "").toUpperCase();
      const name = (lvl.name || "").toLowerCase();
      return code === "STAFF" || code === "NON_STAFF" || name.includes("staff");
    });
  }, [jobLevels]);

  // Fallback to all job levels if no staff/non-staff matches
  const usableJobLevels = staffNonStaffLevels.length > 0 ? staffNonStaffLevels : jobLevels;

  // Lookup maps
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const catMap = useMemo(() => new Map(jobCategories.map((c) => [c.id, c])), [jobCategories]);

  // Statistics
  const stats = useMemo(() => {
    const total = initialMappings.length;
    const mapped = initialMappings.filter((m) => m.isMapped).length;
    const unmapped = total - mapped;
    return { total, mapped, unmapped };
  }, [initialMappings]);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return initialMappings
      .filter((item) => {
        if (selectedDeptId !== "ALL" && String(item.departmentId) !== selectedDeptId) return false;
        if (selectedLevelId !== "ALL") {
          if (selectedLevelId === "UNSET") {
            if (item.jobLevelId !== null) return false;
          } else if (String(item.jobLevelId) !== selectedLevelId) {
            return false;
          }
        }
        if (selectedCatId !== "ALL") {
          if (selectedCatId === "UNSET") {
            if (item.jobCategoryId !== null) return false;
          } else if (String(item.jobCategoryId) !== selectedCatId) {
            return false;
          }
        }
        if (selectedStatus === "MAPPED" && !item.isMapped) return false;
        if (selectedStatus === "UNMAPPED" && item.isMapped) return false;

        if (q) {
          const matchPos = item.positionName.toLowerCase().includes(q) || (item.positionCode || "").toLowerCase().includes(q);
          const matchDept = item.departmentName.toLowerCase().includes(q) || item.departmentCode.toLowerCase().includes(q);
          const matchLvl = (item.jobLevelName || "").toLowerCase().includes(q);
          const matchCat = (item.jobCategoryName || "").toLowerCase().includes(q);
          if (!matchPos && !matchDept && !matchLvl && !matchCat) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "dept") {
          cmp = a.departmentName.localeCompare(b.departmentName);
        } else if (sortField === "position") {
          cmp = a.positionName.localeCompare(b.positionName);
        } else if (sortField === "level") {
          cmp = (a.jobLevelName || "").localeCompare(b.jobLevelName || "");
        } else if (sortField === "category") {
          cmp = (a.jobCategoryName || "").localeCompare(b.jobCategoryName || "");
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [initialMappings, searchQuery, selectedDeptId, selectedLevelId, selectedCatId, selectedStatus, sortField, sortAsc]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Filtered employees inside Category Employees Modal
  const filteredCategoryEmployees = useMemo(() => {
    if (!categoryEmployeeModalData) return [];
    const q = categoryEmpSearch.toLowerCase().trim();

    return categoryEmployeeModalData.employees.filter((emp) => {
      if (categoryEmpDeptFilter !== "ALL" && String(emp.departmentId) !== categoryEmpDeptFilter) {
        return false;
      }
      if (categoryEmpStatusFilter === "ACTIVE" && !emp.isActive) return false;
      if (categoryEmpStatusFilter === "INACTIVE" && emp.isActive) return false;

      if (q) {
        const matchName = emp.name.toLowerCase().includes(q);
        const matchNik = emp.nik.toLowerCase().includes(q);
        const matchPos = emp.jobPositionName.toLowerCase().includes(q);
        const matchDept =
          emp.departmentName.toLowerCase().includes(q) ||
          emp.departmentCode.toLowerCase().includes(q);
        if (!matchName && !matchNik && !matchPos && !matchDept) return false;
      }

      return true;
    });
  }, [categoryEmployeeModalData, categoryEmpSearch, categoryEmpDeptFilter, categoryEmpStatusFilter]);

  // Unique departments for filter in modal
  const categoryUniqueDepts = useMemo(() => {
    if (!categoryEmployeeModalData) return [];
    const map = new Map<number, { id: number; code: string; name: string }>();
    for (const emp of categoryEmployeeModalData.employees) {
      if (!map.has(emp.departmentId)) {
        map.set(emp.departmentId, {
          id: emp.departmentId,
          code: emp.departmentCode,
          name: emp.departmentName,
        });
      }
    }
    for (const pos of categoryEmployeeModalData.positions) {
      if (!map.has(pos.departmentId)) {
        map.set(pos.departmentId, {
          id: pos.departmentId,
          code: pos.departmentCode,
          name: pos.departmentName,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryEmployeeModalData]);

  const handleSort = (field: "dept" | "position" | "level" | "category") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Open Edit Modal for a specific mapping
  const handleOpenEdit = (item: JobPositionMappingWithDetails) => {
    setEditingItem(item);
    setFormDeptId(item.departmentId);
    setFormPosId(item.jobPositionId);
    setFormPosName(item.positionName);
    setFormPosCode(item.positionCode || "");
    setFormLevelId(item.jobLevelId ? String(item.jobLevelId) : "");
    setFormCatId(item.jobCategoryId ? String(item.jobCategoryId) : "");
    setFormNotes(item.notes || "");
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormDeptId(departments[0]?.id || 0);
    setFormPosId(0);
    setFormPosName("");
    setFormPosCode("");
    setFormLevelId(usableJobLevels[0]?.id ? String(usableJobLevels[0].id) : "");
    setFormCatId("");
    setFormNotes("");
    setIsAddModalOpen(true);
  };

  // Save Mapping (Edit)
  const handleSaveEditMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("jobPositionId", String(editingItem.jobPositionId));
      fd.append("departmentId", String(editingItem.departmentId));
      if (formLevelId) fd.append("jobLevelId", formLevelId);
      if (formCatId) fd.append("jobCategoryId", formCatId);
      if (formNotes) fd.append("notes", formNotes);

      const res = await upsertJobPositionMappingAction(fd);
      if (res.success) {
        setEditingItem(null);
        void Swal.fire({
          icon: "success",
          title: "Mapping Berhasil Disimpan",
          text: `Mapping untuk Job Position "${editingItem.positionName}" telah diperbarui.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: res.error || "Terjadi kesalahan sistem.",
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Save Mapping (Add New)
  const handleSaveAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDeptId || (!formPosId && !formPosName.trim())) {
      void Swal.fire({
        icon: "warning",
        title: "Data Belum Lengkap",
        text: "Pilih Departemen dan tentukan Job Position.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    startTransition(async () => {
      let res: { success: boolean; error?: string };

      if (formPosId) {
        // Mapping existing position
        const fd = new FormData();
        fd.append("jobPositionId", String(formPosId));
        fd.append("departmentId", String(formDeptId));
        if (formLevelId) fd.append("jobLevelId", formLevelId);
        if (formCatId) fd.append("jobCategoryId", formCatId);
        if (formNotes) fd.append("notes", formNotes);
        res = await upsertJobPositionMappingAction(fd);
      } else {
        // Create new position & mapping
        const fd = new FormData();
        fd.append("departmentId", String(formDeptId));
        fd.append("positionName", formPosName.trim());
        if (formPosCode) fd.append("positionCode", formPosCode.trim());
        if (formLevelId) fd.append("jobLevelId", formLevelId);
        if (formCatId) fd.append("jobCategoryId", formCatId);
        if (formNotes) fd.append("notes", formNotes);
        res = await createPositionAndMappingAction(fd);
      }

      if (res.success) {
        setIsAddModalOpen(false);
        void Swal.fire({
          icon: "success",
          title: "Mapping Berhasil Dibuat",
          text: "Job Position dan mapping klasifikasinya berhasil disimpan.",
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menambah Mapping",
          text: res.error || "Terjadi kesalahan sistem.",
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Add Dynamic Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", newCatName.trim());
      if (newCatCode.trim()) fd.append("code", newCatCode.trim());
      if (newCatDesc.trim()) fd.append("description", newCatDesc.trim());

      const res = await createJobCategoryAction(fd);
      if (res.success) {
        setNewCatCode("");
        setNewCatName("");
        setNewCatDesc("");
        void Swal.fire({
          icon: "success",
          title: "Kategori Berhasil Ditambahkan",
          text: `Job Category "${newCatName}" telah terdaftar.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menambah Kategori",
          text: res.error || "Kode atau nama kategori mungkin sudah ada.",
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Delete Category
  const handleDeleteCategory = async (cat: JobCategory) => {
    const confirm = await Swal.fire({
      title: `Hapus Kategori "${cat.name}"?`,
      text: "Kategori hanya dapat dihapus jika tidak digunakan dalam mapping posisi apapun.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (confirm.isConfirmed) {
      startTransition(async () => {
        const res = await deleteJobCategoryAction(cat.id);
        if (res.success) {
          void Swal.fire({
            icon: "success",
            title: "Kategori Dihapus",
            timer: 1500,
            showConfirmButton: false,
          });
        } else {
          void Swal.fire({
            icon: "error",
            title: "Tidak Dapat Dihapus",
            text: res.error || "Kategori ini masih digunakan pada mapping Job Position.",
            confirmButtonColor: "#0f172a",
          });
        }
      });
    }
  };

  // Open Category Employees Modal (Klik pada kolom Terpakai)
  const handleOpenCategoryEmployees = async (cat: JobCategory) => {
    setIsLoadingCategoryEmployees(true);
    setLoadingCategoryId(cat.id);
    setCategoryEmpSearch("");
    setCategoryEmpDeptFilter("ALL");
    setCategoryEmpStatusFilter("ALL");
    setCategoryEmpTab("EMPLOYEES");

    try {
      const res = await getEmployeesByJobCategoryAction(cat.id);
      if (res.success && res.data) {
        setCategoryEmployeeModalData(res.data);
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Memuat Karyawan",
          text: res.error || "Tidak dapat memuat daftar karyawan untuk kategori ini.",
          confirmButtonColor: "#0f172a",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void Swal.fire({
        icon: "error",
        title: "Terjadi Kesalahan",
        text: msg,
        confirmButtonColor: "#0f172a",
      });
    } finally {
      setIsLoadingCategoryEmployees(false);
      setLoadingCategoryId(null);
    }
  };

  // Handle Excel Import
  const handleExecuteImport = async () => {
    if (!importFile) return;
    setIsImporting(true);

    try {
      const parsedRows = await parseJobPositionMappingExcelFile(importFile);
      if (parsedRows.length === 0) {
        void Swal.fire({
          icon: "warning",
          title: "File Kosong",
          text: "Tidak ditemukan baris data yang valid pada sheet pertama file Excel.",
          confirmButtonColor: "#0f172a",
        });
        setIsImporting(false);
        return;
      }

      const res = await importJobPositionMappingsBatchAction(parsedRows);
      setIsImportModalOpen(false);
      setImportFile(null);

      void Swal.fire({
        icon: res.errors.length > 0 && res.successCount === 0 ? "error" : "success",
        title: "Hasil Import Mapping Excel",
        html: `
          <div class="text-left text-xs space-y-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <div>✓ Berhasil Dimapping: <b>${res.successCount}</b> baris</div>
            ${res.createdPositionsCount > 0 ? `<div>+ Job Position Baru Dibuat: <b>${res.createdPositionsCount}</b></div>` : ""}
            ${res.newCategoriesCount > 0 ? `<div>+ Kategori Baru Otomatis Terdaftar: <b>${res.newCategoriesCount}</b></div>` : ""}
            ${res.skippedCount > 0 ? `<div>- Dilewati (kosong): <b>${res.skippedCount}</b></div>` : ""}
            ${res.errors.length > 0 ? `<div class="text-rose-600 mt-2 font-semibold">Terdapat ${res.errors.length} peringatan/error.</div>` : ""}
          </div>
        `,
        confirmButtonColor: "#0f172a",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File Excel",
        text: msg,
        confirmButtonColor: "#0f172a",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-3.5 text-slate-800">
      {/* 1. SUMMARY STATS & STATUS DETECTION BANNER */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Job Positions */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Total Job Position
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">{stats.total}</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
            {stats.total}
          </div>
        </div>

        {/* Sudah Dimapping */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === "MAPPED" ? "ALL" : "MAPPED")}
          className={`bg-white rounded-xl border p-3.5 shadow-2xs flex items-center justify-between cursor-pointer transition ${
            selectedStatus === "MAPPED" ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide block">
              Sudah Lengkap Dimapping
            </span>
            <span className="text-xl font-bold text-emerald-800 mt-0.5 block">{stats.mapped}</span>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
            {stats.total > 0 ? `${Math.round((stats.mapped / stats.total) * 100)}%` : "0%"}
          </span>
        </div>

        {/* Belum Dimapping (Warning Detection) */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === "UNMAPPED" ? "ALL" : "UNMAPPED")}
          className={`bg-white rounded-xl border p-3.5 shadow-2xs flex items-center justify-between cursor-pointer transition ${
            stats.unmapped > 0
              ? selectedStatus === "UNMAPPED"
                ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30"
                : "border-amber-300 bg-amber-50/20 hover:border-amber-400"
              : "border-slate-200"
          }`}
        >
          <div>
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide block">
              Belum Lengkap Dimapping
            </span>
            <span className="text-xl font-bold text-amber-900 mt-0.5 block">{stats.unmapped}</span>
          </div>
          {stats.unmapped > 0 ? (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-200/80 text-amber-900 animate-pulse">
              Perlu Dipetakan
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
              100% Selesai
            </span>
          )}
        </div>
      </div>

      {/* 2. TOOLBAR FILTER, SEARCH & ACTION BUTTONS */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari Job Position, Departemen, atau Job Category..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action Buttons Right */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Kelola Master Job Category */}
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer"
              title="Kelola Master Kategori Job Dinamis"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Kelola Kategori ({jobCategories.length})</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={() => exportJobPositionMappingsToExcel(filteredItems)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer"
              title="Export data mapping saat ini ke Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            {/* Import Excel */}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer"
              title="Import data mapping massal dari file Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Import Excel</span>
            </button>

            {/* + Tambah Mapping */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Mapping</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* 1. Filter Departemen */}
          <div>
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">Semua Departemen ({departments.length})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  [{d.code}] {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filter Job Level (Staff vs Non Staff) */}
          <div>
            <select
              value={selectedLevelId}
              onChange={(e) => {
                setSelectedLevelId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">Semua Job Level</option>
              {usableJobLevels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  Level: {lvl.name} ({lvl.code})
                </option>
              ))}
              <option value="UNSET">Level Belum Dipetakan</option>
            </select>
          </div>

          {/* 3. Filter Job Category */}
          <div>
            <select
              value={selectedCatId}
              onChange={(e) => {
                setSelectedCatId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">Semua Job Category ({jobCategories.length})</option>
              {jobCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  Kategori: {c.name}
                </option>
              ))}
              <option value="UNSET">Kategori Belum Dipetakan</option>
            </select>
          </div>

          {/* 4. Filter Status Mapping */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as "ALL" | "MAPPED" | "UNMAPPED");
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer font-medium"
            >
              <option value="ALL">Status: Semua ({initialMappings.length})</option>
              <option value="UNMAPPED">Status: Belum Lengkap ({stats.unmapped})</option>
              <option value="MAPPED">Status: Sudah Lengkap ({stats.mapped})</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. TABLE MAPPING JOB POSITION (Clean, High Contrast, 5 Kolom Sesuai Permintaan) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 font-semibold select-none">
                <th className="py-2.5 px-3.5 text-center w-12 border-r border-slate-200/80">No</th>
                <th
                  onClick={() => handleSort("dept")}
                  className="py-2.5 px-3.5 border-r border-slate-200/80 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Departemen</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("position")}
                  className="py-2.5 px-3.5 border-r border-slate-200/80 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Job Position</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("level")}
                  className="py-2.5 px-3.5 border-r border-slate-200/80 cursor-pointer hover:bg-slate-100 transition w-36 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Job Level</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("category")}
                  className="py-2.5 px-3.5 border-r border-slate-200/80 cursor-pointer hover:bg-slate-100 transition w-44 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Job Category</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5 text-center w-28">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-slate-400 italic">
                    Tidak ada data Job Position yang cocok dengan filter atau kata kunci pencarian.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const isUnmapped = !item.isMapped;

                  return (
                    <tr
                      key={item.jobPositionId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isUnmapped ? "bg-amber-50/15" : "bg-white"
                      }`}
                    >
                      {/* No */}
                      <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px] align-middle border-r border-slate-100">
                        {rowNumber}
                      </td>

                      {/* Departemen */}
                      <td className="py-2.5 px-3.5 align-middle border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            {item.departmentCode}
                          </span>
                          <span className="font-medium text-slate-800 text-xs truncate max-w-[200px]" title={item.departmentName}>
                            {item.departmentName}
                          </span>
                        </div>
                      </td>

                      {/* Job Position */}
                      <td className="py-2.5 px-3.5 align-middle border-r border-slate-100">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">
                              {item.positionName}
                            </span>
                            {item.employeeCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title={`${item.employeeCount} karyawan aktif di posisi ini`}>
                                {item.employeeCount} Karyawan
                              </span>
                            )}
                          </div>
                          {item.positionCode && (
                            <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {item.positionCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Job Level (Staff / Non Staff dari Master Job Level) */}
                      <td className="py-2.5 px-3.5 text-center align-middle border-r border-slate-100">
                        {item.jobLevelName ? (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              item.jobLevelName.toLowerCase().includes("non")
                                ? "bg-slate-100 text-slate-700 border-slate-200"
                                : "bg-sky-50 text-sky-800 border-sky-200"
                            }`}
                          >
                            {item.jobLevelName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Belum Dipetakan
                          </span>
                        )}
                      </td>

                      {/* Job Category (Dinamis: SPV, Admin, Foreman, dll.) */}
                      <td className="py-2.5 px-3.5 text-center align-middle border-r border-slate-100">
                        {item.jobCategoryName ? (
                          <button
                            type="button"
                            onClick={() => {
                              const found = jobCategories.find((c) => c.id === item.jobCategoryId);
                              if (found) handleOpenCategoryEmployees(found);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition cursor-pointer"
                            title={`Klik untuk melihat list employee kategori ${item.jobCategoryName}`}
                          >
                            <span>{item.jobCategoryName}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                            Belum Dipetakan
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-2.5 px-3.5 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer active:scale-95"
                          title={`Atur mapping ${item.positionName}`}
                        >
                          <Pencil className="w-3 h-3 text-slate-500" />
                          <span>Atur</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Menampilkan <span className="font-semibold text-slate-800">{paginatedItems.length}</span> dari{" "}
            <span className="font-semibold text-slate-800">{filteredItems.length}</span> Job Position
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 text-xs font-medium text-slate-700">
              Halaman {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. MODAL EDIT MAPPING JOB POSITION                        */}
      {/* ========================================================= */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Atur Mapping Job Position</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Departemen: <span className="font-semibold text-slate-700">{editingItem.departmentName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditMapping} className="p-5 space-y-4 text-xs">
              {/* Info Nama Job Position */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Nama Job Position
                </span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {editingItem.positionName}
                </span>
                {editingItem.positionCode && (
                  <span className="text-[11px] font-mono text-slate-500">
                    Kode: {editingItem.positionCode}
                  </span>
                )}
              </div>

              {/* Klasifikasi 1: Job Level (Staff / Non Staff dari Master Job Level) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Job Level <span className="text-slate-400 font-normal">(Staff / Non Staff)</span>
                </label>
                <select
                  value={formLevelId}
                  onChange={(e) => setFormLevelId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer font-medium"
                >
                  <option value="">-- Pilih Job Level --</option>
                  {usableJobLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name} ({lvl.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ambil data klasifikasi level dari Master Job Level (Staff dan Non Staff).
                </p>
              </div>

              {/* Klasifikasi 2: Job Category (SPV, Admin, Foreman, Manager, Superintendent, dll.) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800">
                    Job Category <span className="text-slate-400 font-normal">(Dinamis)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[11px] text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    + Kelola Kategori
                  </button>
                </div>
                <select
                  value={formCatId}
                  onChange={(e) => setFormCatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer font-medium"
                >
                  <option value="">-- Pilih Job Category --</option>
                  {jobCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Digunakan sebagai dasar penyusunan Template KPI berdasarkan Departemen + Job Category.
                </p>
              </div>

              {/* Catatan / Keterangan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan / Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Keterangan tambahan mapping..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Mapping</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      

      {/* ========================================================= */}
      {/* 8. MODAL LIST EMPLOYEE & DEPARTEMEN PER JOB CATEGORY     */}
      {/* ========================================================= */}
      {categoryEmployeeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Daftar Employee: Kategori {categoryEmployeeModalData.category.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      {categoryEmployeeModalData.category.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar seluruh employee dan departemen yang posisinya dipetakan ke kategori ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Statistics Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Employee
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.employees.length} Orang
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                  Status Aktif
                </span>
                <span className="text-sm font-bold text-emerald-800">
                  {categoryEmployeeModalData.employees.filter((e) => e.isActive).length} Karyawan
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Posisi Terpetakan
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.positions.length} Posisi
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Sebaran Departemen
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryUniqueDepts.length} Departemen
                </span>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Export */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={categoryEmpSearch}
                    onChange={(e) => setCategoryEmpSearch(e.target.value)}
                    placeholder="Cari nama employee, NIK, posisi, atau departemen..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  {categoryEmpSearch && (
                    <button
                      type="button"
                      onClick={() => setCategoryEmpSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Departemen */}
                <div className="min-w-[160px]">
                  <select
                    value={categoryEmpDeptFilter}
                    onChange={(e) => setCategoryEmpDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({categoryUniqueDepts.length})</option>
                    {categoryUniqueDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="min-w-[120px]">
                  <select
                    value={categoryEmpStatusFilter}
                    onChange={(e) =>
                      setCategoryEmpStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                    }
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Hanya Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Export Excel */}
                <button
                  type="button"
                  onClick={() =>
                    exportCategoryEmployeesToExcel(
                      categoryEmployeeModalData.category.name,
                      categoryEmployeeModalData.category.code,
                      filteredCategoryEmployees
                    )
                  }
                  disabled={filteredCategoryEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-40"
                  title="Export daftar employee kategori ini ke Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export</span>
                </button>
              </div>

              {/* Sub-tab Switcher: Karyawan vs Posisi */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("EMPLOYEES")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "EMPLOYEES"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Employee ({categoryEmployeeModalData.employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("POSITIONS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "POSITIONS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Posisi Terpetakan ({categoryEmployeeModalData.positions.length})
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {categoryEmpTab === "EMPLOYEES" ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">NIK</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Employee</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Job Position</th>
                        <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/80">Job Level</th>
                        <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCategoryEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            {categoryEmployeeModalData.employees.length === 0
                              ? "Belum ada employee aktif yang terhubung pada job position dalam kategori ini."
                              : "Tidak ada employee yang cocok dengan filter atau kata kunci pencarian."}
                          </td>
                        </tr>
                      ) : (
                        filteredCategoryEmployees.map((emp, idx) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {emp.departmentCode}
                                </span>
                                <span className="text-slate-700 text-xs truncate max-w-[180px]" title={emp.departmentName}>
                                  {emp.departmentName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-100">
                              {emp.jobPositionName}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  (emp.jobLevelName || "").toLowerCase().includes("non")
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-sky-50 text-sky-800 border-sky-200"
                                }`}
                              >
                                {emp.jobLevelName || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {emp.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Non-Aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">Kode Posisi</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Job Position</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jumlah Karyawan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryEmployeeModalData.positions.map((pos, idx) => (
                        <tr key={pos.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pos.departmentCode}
                              </span>
                              <span className="text-slate-700 text-xs truncate max-w-[180px]">
                                {pos.departmentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-100">
                            {pos.code || "-"}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                            {pos.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                              {pos.employeeCount} Karyawan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-500">
                {categoryEmpTab === "EMPLOYEES"
                  ? `Menampilkan ${filteredCategoryEmployees.length} dari ${categoryEmployeeModalData.employees.length} employee`
                  : `Total ${categoryEmployeeModalData.positions.length} Job Position terpetakan`}
              </span>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODAL TAMBAH MAPPING / POSISI BARU                     */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">Tambah Mapping Job Position Baru</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAddMapping} className="p-5 space-y-4 text-xs">
              {/* Departemen */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Departemen <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formDeptId}
                  onChange={(e) => {
                    setFormDeptId(Number(e.target.value));
                    setFormPosId(0);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value={0}>-- Pilih Departemen --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.code}] {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Job Position Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nama Job Position <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formPosName}
                  onChange={(e) => setFormPosName(e.target.value)}
                  placeholder="Contoh: Supervisor Safety, Mekanik Roda Dua, dll."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Job Position Code (Opsional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Job Position (Opsional)
                </label>
                <input
                  type="text"
                  value={formPosCode}
                  onChange={(e) => setFormPosCode(e.target.value)}
                  placeholder="Contoh: HSEC-004, PLT-012"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 font-mono"
                />
              </div>

              {/* Klasifikasi 1: Job Level */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Job Level <span className="text-slate-400 font-normal">(Staff / Non Staff)</span>
                </label>
                <select
                  value={formLevelId}
                  onChange={(e) => setFormLevelId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer font-medium"
                >
                  <option value="">-- Pilih Job Level --</option>
                  {usableJobLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name} ({lvl.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Klasifikasi 2: Job Category */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Job Category <span className="text-slate-400 font-normal">(Dinamis)</span>
                </label>
                <select
                  value={formCatId}
                  onChange={(e) => setFormCatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer font-medium"
                >
                  <option value="">-- Pilih Job Category --</option>
                  {jobCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Keterangan..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Tambah & Petakan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      

      {/* ========================================================= */}
      {/* 8. MODAL LIST EMPLOYEE & DEPARTEMEN PER JOB CATEGORY     */}
      {/* ========================================================= */}
      {categoryEmployeeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Daftar Employee: Kategori {categoryEmployeeModalData.category.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      {categoryEmployeeModalData.category.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar seluruh employee dan departemen yang posisinya dipetakan ke kategori ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Statistics Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Employee
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.employees.length} Orang
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                  Status Aktif
                </span>
                <span className="text-sm font-bold text-emerald-800">
                  {categoryEmployeeModalData.employees.filter((e) => e.isActive).length} Karyawan
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Posisi Terpetakan
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.positions.length} Posisi
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Sebaran Departemen
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryUniqueDepts.length} Departemen
                </span>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Export */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={categoryEmpSearch}
                    onChange={(e) => setCategoryEmpSearch(e.target.value)}
                    placeholder="Cari nama employee, NIK, posisi, atau departemen..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  {categoryEmpSearch && (
                    <button
                      type="button"
                      onClick={() => setCategoryEmpSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Departemen */}
                <div className="min-w-[160px]">
                  <select
                    value={categoryEmpDeptFilter}
                    onChange={(e) => setCategoryEmpDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({categoryUniqueDepts.length})</option>
                    {categoryUniqueDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="min-w-[120px]">
                  <select
                    value={categoryEmpStatusFilter}
                    onChange={(e) =>
                      setCategoryEmpStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                    }
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Hanya Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Export Excel */}
                <button
                  type="button"
                  onClick={() =>
                    exportCategoryEmployeesToExcel(
                      categoryEmployeeModalData.category.name,
                      categoryEmployeeModalData.category.code,
                      filteredCategoryEmployees
                    )
                  }
                  disabled={filteredCategoryEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-40"
                  title="Export daftar employee kategori ini ke Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export</span>
                </button>
              </div>

              {/* Sub-tab Switcher: Karyawan vs Posisi */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("EMPLOYEES")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "EMPLOYEES"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Employee ({categoryEmployeeModalData.employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("POSITIONS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "POSITIONS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Posisi Terpetakan ({categoryEmployeeModalData.positions.length})
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {categoryEmpTab === "EMPLOYEES" ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">NIK</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Employee</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Job Position</th>
                        <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/80">Job Level</th>
                        <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCategoryEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            {categoryEmployeeModalData.employees.length === 0
                              ? "Belum ada employee aktif yang terhubung pada job position dalam kategori ini."
                              : "Tidak ada employee yang cocok dengan filter atau kata kunci pencarian."}
                          </td>
                        </tr>
                      ) : (
                        filteredCategoryEmployees.map((emp, idx) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {emp.departmentCode}
                                </span>
                                <span className="text-slate-700 text-xs truncate max-w-[180px]" title={emp.departmentName}>
                                  {emp.departmentName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-100">
                              {emp.jobPositionName}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  (emp.jobLevelName || "").toLowerCase().includes("non")
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-sky-50 text-sky-800 border-sky-200"
                                }`}
                              >
                                {emp.jobLevelName || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {emp.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Non-Aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">Kode Posisi</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Job Position</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jumlah Karyawan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryEmployeeModalData.positions.map((pos, idx) => (
                        <tr key={pos.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pos.departmentCode}
                              </span>
                              <span className="text-slate-700 text-xs truncate max-w-[180px]">
                                {pos.departmentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-100">
                            {pos.code || "-"}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                            {pos.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                              {pos.employeeCount} Karyawan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-500">
                {categoryEmpTab === "EMPLOYEES"
                  ? `Menampilkan ${filteredCategoryEmployees.length} dari ${categoryEmployeeModalData.employees.length} employee`
                  : `Total ${categoryEmployeeModalData.positions.length} Job Position terpetakan`}
              </span>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. MODAL KELOLA MASTER JOB CATEGORY (Dinamis)            */}
      {/* ========================================================= */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Kelola Master Job Category</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftar kategori jabatan dinamis (SPV, Admin, Foreman, Manager, Superintendent, Mekanik, Operator, Engineer, dll.)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Form Tambah Kategori + Daftar Tabel */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Form Tambah Kategori Baru */}
              <form onSubmit={handleAddCategory} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <span className="text-xs font-bold text-slate-900 block">+ Tambah Kategori Baru</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nama Kategori <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Contoh: Welder, Planner"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Kode (Opsional)
                    </label>
                    <input
                      type="text"
                      value={newCatCode}
                      onChange={(e) => setNewCatCode(e.target.value)}
                      placeholder="Contoh: WLD, PLN"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Deskripsi
                    </label>
                    <input
                      type="text"
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="Keterangan singkat..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isPending || !newCatName.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Simpan Kategori</span>
                  </button>
                </div>
              </form>

              {/* Tabel Daftar Kategori */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-2 px-3 w-10 text-center">No</th>
                      <th className="py-2 px-3">Nama Kategori</th>
                      <th className="py-2 px-3 font-mono">Kode</th>
                      <th className="py-2 px-3">Terpakai</th>
                      <th className="py-2 px-3 text-center w-16">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobCategories.map((c, i) => {
                      const count = initialMappings.filter((m) => m.jobCategoryId === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{i + 1}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{c.name}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{c.code}</td>
                          <td className="py-2 px-3">
                            {count > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCategoryEmployees(c)}
                                disabled={isLoadingCategoryEmployees}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/80 transition cursor-pointer group shadow-2xs hover:border-slate-300 active:scale-98"
                                title={`Klik untuk melihat list employee & departemen dalam kategori ${c.name}`}
                              >
                                {loadingCategoryId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                                ) : (
                                  <Users className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 transition-colors" />
                                )}
                                <span>{count} Posisi</span>
                                <span className="text-[10px] text-sky-600 group-hover:text-sky-800 font-medium underline underline-offset-2">
                                  Lihat Employee &rarr;
                                </span>
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-slate-50 text-slate-400 border border-slate-200/60">
                                0 Posisi
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {count === 0 ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(c)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                title="Hapus Kategori"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      

      {/* ========================================================= */}
      {/* 8. MODAL LIST EMPLOYEE & DEPARTEMEN PER JOB CATEGORY     */}
      {/* ========================================================= */}
      {categoryEmployeeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Daftar Employee: Kategori {categoryEmployeeModalData.category.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      {categoryEmployeeModalData.category.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar seluruh employee dan departemen yang posisinya dipetakan ke kategori ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Statistics Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Employee
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.employees.length} Orang
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                  Status Aktif
                </span>
                <span className="text-sm font-bold text-emerald-800">
                  {categoryEmployeeModalData.employees.filter((e) => e.isActive).length} Karyawan
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Posisi Terpetakan
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.positions.length} Posisi
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Sebaran Departemen
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryUniqueDepts.length} Departemen
                </span>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Export */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={categoryEmpSearch}
                    onChange={(e) => setCategoryEmpSearch(e.target.value)}
                    placeholder="Cari nama employee, NIK, posisi, atau departemen..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  {categoryEmpSearch && (
                    <button
                      type="button"
                      onClick={() => setCategoryEmpSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Departemen */}
                <div className="min-w-[160px]">
                  <select
                    value={categoryEmpDeptFilter}
                    onChange={(e) => setCategoryEmpDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({categoryUniqueDepts.length})</option>
                    {categoryUniqueDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="min-w-[120px]">
                  <select
                    value={categoryEmpStatusFilter}
                    onChange={(e) =>
                      setCategoryEmpStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                    }
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Hanya Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Export Excel */}
                <button
                  type="button"
                  onClick={() =>
                    exportCategoryEmployeesToExcel(
                      categoryEmployeeModalData.category.name,
                      categoryEmployeeModalData.category.code,
                      filteredCategoryEmployees
                    )
                  }
                  disabled={filteredCategoryEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-40"
                  title="Export daftar employee kategori ini ke Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export</span>
                </button>
              </div>

              {/* Sub-tab Switcher: Karyawan vs Posisi */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("EMPLOYEES")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "EMPLOYEES"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Employee ({categoryEmployeeModalData.employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("POSITIONS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "POSITIONS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Posisi Terpetakan ({categoryEmployeeModalData.positions.length})
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {categoryEmpTab === "EMPLOYEES" ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">NIK</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Employee</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Job Position</th>
                        <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/80">Job Level</th>
                        <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCategoryEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            {categoryEmployeeModalData.employees.length === 0
                              ? "Belum ada employee aktif yang terhubung pada job position dalam kategori ini."
                              : "Tidak ada employee yang cocok dengan filter atau kata kunci pencarian."}
                          </td>
                        </tr>
                      ) : (
                        filteredCategoryEmployees.map((emp, idx) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {emp.departmentCode}
                                </span>
                                <span className="text-slate-700 text-xs truncate max-w-[180px]" title={emp.departmentName}>
                                  {emp.departmentName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-100">
                              {emp.jobPositionName}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  (emp.jobLevelName || "").toLowerCase().includes("non")
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-sky-50 text-sky-800 border-sky-200"
                                }`}
                              >
                                {emp.jobLevelName || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {emp.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Non-Aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">Kode Posisi</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Job Position</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jumlah Karyawan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryEmployeeModalData.positions.map((pos, idx) => (
                        <tr key={pos.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pos.departmentCode}
                              </span>
                              <span className="text-slate-700 text-xs truncate max-w-[180px]">
                                {pos.departmentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-100">
                            {pos.code || "-"}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                            {pos.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                              {pos.employeeCount} Karyawan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-500">
                {categoryEmpTab === "EMPLOYEES"
                  ? `Menampilkan ${filteredCategoryEmployees.length} dari ${categoryEmployeeModalData.employees.length} employee`
                  : `Total ${categoryEmployeeModalData.positions.length} Job Position terpetakan`}
              </span>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. MODAL IMPORT EXCEL MAPPING                             */}
      {/* ========================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Import Mapping Job Position Excel</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Unggah file Excel untuk memetakan Job Level & Job Category secara massal
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Petunjuk & Download Template */}
              <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3.5 space-y-2">
                <span className="font-bold text-sky-950 block">Petunjuk Format File</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  File Excel harus memiliki kolom <b>Kode Departemen</b>, <b>Nama Job Position</b>, <b>Job Level</b> (Staff / Non Staff), dan <b>Job Category</b>. Kategori baru yang belum terdaftar akan otomatis dibuatkan oleh sistem.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      downloadJobPositionMappingTemplate(
                        initialMappings.map((m) => ({
                          departmentCode: m.departmentCode,
                          departmentName: m.departmentName,
                          positionCode: m.positionCode,
                          positionName: m.positionName,
                          jobLevelName: m.jobLevelName,
                          jobCategoryName: m.jobCategoryName,
                        })),
                        jobCategories.map((c) => c.name)
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-900 bg-white border border-sky-200 hover:bg-sky-50 rounded-lg shadow-2xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-700" />
                    <span>Download Template Excel Terisi (353 Posisi)</span>
                  </button>
                </div>
              </div>

              {/* Upload Input */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Pilih File Excel (.xlsx / .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer border border-slate-200 rounded-lg p-1.5"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportFile(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isImporting || !importFile}
                  onClick={handleExecuteImport}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isImporting ? "Memproses Import..." : "Mulai Import"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      

      {/* ========================================================= */}
      {/* 8. MODAL LIST EMPLOYEE & DEPARTEMEN PER JOB CATEGORY     */}
      {/* ========================================================= */}
      {categoryEmployeeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Daftar Employee: Kategori {categoryEmployeeModalData.category.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      {categoryEmployeeModalData.category.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar seluruh employee dan departemen yang posisinya dipetakan ke kategori ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Statistics Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Employee
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.employees.length} Orang
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                  Status Aktif
                </span>
                <span className="text-sm font-bold text-emerald-800">
                  {categoryEmployeeModalData.employees.filter((e) => e.isActive).length} Karyawan
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Posisi Terpetakan
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.positions.length} Posisi
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Sebaran Departemen
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryUniqueDepts.length} Departemen
                </span>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Export */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={categoryEmpSearch}
                    onChange={(e) => setCategoryEmpSearch(e.target.value)}
                    placeholder="Cari nama employee, NIK, posisi, atau departemen..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  {categoryEmpSearch && (
                    <button
                      type="button"
                      onClick={() => setCategoryEmpSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Departemen */}
                <div className="min-w-[160px]">
                  <select
                    value={categoryEmpDeptFilter}
                    onChange={(e) => setCategoryEmpDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({categoryUniqueDepts.length})</option>
                    {categoryUniqueDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="min-w-[120px]">
                  <select
                    value={categoryEmpStatusFilter}
                    onChange={(e) =>
                      setCategoryEmpStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                    }
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Hanya Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Export Excel */}
                <button
                  type="button"
                  onClick={() =>
                    exportCategoryEmployeesToExcel(
                      categoryEmployeeModalData.category.name,
                      categoryEmployeeModalData.category.code,
                      filteredCategoryEmployees
                    )
                  }
                  disabled={filteredCategoryEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-40"
                  title="Export daftar employee kategori ini ke Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export</span>
                </button>
              </div>

              {/* Sub-tab Switcher: Karyawan vs Posisi */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("EMPLOYEES")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "EMPLOYEES"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Employee ({categoryEmployeeModalData.employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("POSITIONS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "POSITIONS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Posisi Terpetakan ({categoryEmployeeModalData.positions.length})
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {categoryEmpTab === "EMPLOYEES" ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">NIK</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Employee</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Job Position</th>
                        <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/80">Job Level</th>
                        <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCategoryEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            {categoryEmployeeModalData.employees.length === 0
                              ? "Belum ada employee aktif yang terhubung pada job position dalam kategori ini."
                              : "Tidak ada employee yang cocok dengan filter atau kata kunci pencarian."}
                          </td>
                        </tr>
                      ) : (
                        filteredCategoryEmployees.map((emp, idx) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {emp.departmentCode}
                                </span>
                                <span className="text-slate-700 text-xs truncate max-w-[180px]" title={emp.departmentName}>
                                  {emp.departmentName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-100">
                              {emp.jobPositionName}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  (emp.jobLevelName || "").toLowerCase().includes("non")
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-sky-50 text-sky-800 border-sky-200"
                                }`}
                              >
                                {emp.jobLevelName || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {emp.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Non-Aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">Kode Posisi</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Job Position</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jumlah Karyawan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryEmployeeModalData.positions.map((pos, idx) => (
                        <tr key={pos.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pos.departmentCode}
                              </span>
                              <span className="text-slate-700 text-xs truncate max-w-[180px]">
                                {pos.departmentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-100">
                            {pos.code || "-"}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                            {pos.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                              {pos.employeeCount} Karyawan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-500">
                {categoryEmpTab === "EMPLOYEES"
                  ? `Menampilkan ${filteredCategoryEmployees.length} dari ${categoryEmployeeModalData.employees.length} employee`
                  : `Total ${categoryEmployeeModalData.positions.length} Job Position terpetakan`}
              </span>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. MODAL LIST EMPLOYEE & DEPARTEMEN PER JOB CATEGORY     */}
      {/* ========================================================= */}
      {categoryEmployeeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Daftar Employee: Kategori {categoryEmployeeModalData.category.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      {categoryEmployeeModalData.category.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar seluruh employee dan departemen yang posisinya dipetakan ke kategori ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Statistics Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Employee
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.employees.length} Orang
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">
                  Status Aktif
                </span>
                <span className="text-sm font-bold text-emerald-800">
                  {categoryEmployeeModalData.employees.filter((e) => e.isActive).length} Karyawan
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Posisi Terpetakan
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryEmployeeModalData.positions.length} Posisi
                </span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Sebaran Departemen
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {categoryUniqueDepts.length} Departemen
                </span>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Export */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={categoryEmpSearch}
                    onChange={(e) => setCategoryEmpSearch(e.target.value)}
                    placeholder="Cari nama employee, NIK, posisi, atau departemen..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  {categoryEmpSearch && (
                    <button
                      type="button"
                      onClick={() => setCategoryEmpSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Departemen */}
                <div className="min-w-[160px]">
                  <select
                    value={categoryEmpDeptFilter}
                    onChange={(e) => setCategoryEmpDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({categoryUniqueDepts.length})</option>
                    {categoryUniqueDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="min-w-[120px]">
                  <select
                    value={categoryEmpStatusFilter}
                    onChange={(e) =>
                      setCategoryEmpStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                    }
                    className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Hanya Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Export Excel */}
                <button
                  type="button"
                  onClick={() =>
                    exportCategoryEmployeesToExcel(
                      categoryEmployeeModalData.category.name,
                      categoryEmployeeModalData.category.code,
                      filteredCategoryEmployees
                    )
                  }
                  disabled={filteredCategoryEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-40"
                  title="Export daftar employee kategori ini ke Excel"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export</span>
                </button>
              </div>

              {/* Sub-tab Switcher: Karyawan vs Posisi */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("EMPLOYEES")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "EMPLOYEES"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Employee ({categoryEmployeeModalData.employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryEmpTab("POSITIONS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    categoryEmpTab === "POSITIONS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Daftar Posisi Terpetakan ({categoryEmployeeModalData.positions.length})
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {categoryEmpTab === "EMPLOYEES" ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">NIK</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Employee</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Job Position</th>
                        <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/80">Job Level</th>
                        <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCategoryEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            {categoryEmployeeModalData.employees.length === 0
                              ? "Belum ada employee aktif yang terhubung pada job position dalam kategori ini."
                              : "Tidak ada employee yang cocok dengan filter atau kata kunci pencarian."}
                          </td>
                        </tr>
                      ) : (
                        filteredCategoryEmployees.map((emp, idx) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {emp.departmentCode}
                                </span>
                                <span className="text-slate-700 text-xs truncate max-w-[180px]" title={emp.departmentName}>
                                  {emp.departmentName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-100">
                              {emp.jobPositionName}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  (emp.jobLevelName || "").toLowerCase().includes("non")
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-sky-50 text-sky-800 border-sky-200"
                                }`}
                              >
                                {emp.jobLevelName || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {emp.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Non-Aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/80">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Departemen</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200/80">Kode Posisi</th>
                        <th className="py-2.5 px-3 border-r border-slate-200/80">Nama Job Position</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jumlah Karyawan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryEmployeeModalData.positions.map((pos, idx) => (
                        <tr key={pos.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pos.departmentCode}
                              </span>
                              <span className="text-slate-700 text-xs truncate max-w-[180px]">
                                {pos.departmentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-100">
                            {pos.code || "-"}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-100">
                            {pos.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                              {pos.employeeCount} Karyawan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-500">
                {categoryEmpTab === "EMPLOYEES"
                  ? `Menampilkan ${filteredCategoryEmployees.length} dari ${categoryEmployeeModalData.employees.length} employee`
                  : `Total ${categoryEmployeeModalData.positions.length} Job Position terpetakan`}
              </span>
              <button
                type="button"
                onClick={() => setCategoryEmployeeModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

