"use client";

import React, { useState, useMemo, useTransition, useEffect, useRef } from "react";
import Swal from "sweetalert2";
import type { PitWithStats } from "@/lib/pit-actions";
import {
  exportPitsToExcel,
  downloadPitTemplate,
  parsePitExcelFile,
} from "@/lib/excel-master";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Mountain,
  FileSpreadsheet,
  X,
  Building2,
  MapPin,
  Layers,
  Info,
  ChevronDown,
  Users,
} from "lucide-react";
import { td, th, btnPrimary, btnSecondary, inputCls } from "./ui";

export interface SiteItem {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface DepartmentItem {
  id: number;
  code: string;
  name: string;
}

export interface PitEmployeeItem {
  id: number;
  nik: string;
  name: string;
  departmentId: number;
  jobPosition?: string | null;
  jobPositionId?: number | null;
  jobLevelId?: number | null;
  operatingUnit?: string | null;
  pitId?: number | null;
  isActive?: boolean;
}

interface MasterPitTableClientProps {
  pits: PitWithStats[];
  sites?: SiteItem[];
  availableSites?: string[];
  departments?: DepartmentItem[];
  employees?: PitEmployeeItem[];
  createAction: (fd: FormData) => Promise<{ success: boolean; id: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteAction: (fd: FormData) => Promise<{ success: boolean }>;
  batchDeleteAction?: (ids: number[]) => Promise<{ count: number; skippedCount: number; errors: string[] }>;
  toggleStatusAction: (id: number) => Promise<{ success: boolean; newStatus: boolean }>;
  importAction: (
    items: {
      code: string;
      name: string;
      site?: string;
      description?: string;
      departments?: string;
      department?: string;
    }[]
  ) => Promise<{ createdCount: number; updatedCount: number; errors: string[] }>;
}

/**
 * Helper untuk menghitung kode angka unik otomatis selanjutnya (contoh: 007, 008)
 */
export function generateNextPitCode(existingPits: { code: string; id: number }[]): string {
  let max = 0;
  for (const p of existingPits) {
    if (/^\d+$/.test(p.code.trim())) {
      const num = parseInt(p.code.trim(), 10);
      if (num > max) max = num;
    } else {
      const match = p.code.match(/\d+/g);
      if (match) {
        for (const m of match) {
          const num = parseInt(m, 10);
          if (num > max) max = num;
        }
      }
    }
    if (p.id > max) max = p.id;
  }
  const next = max + 1;
  let candidate = String(next).padStart(3, "0");
  const existingCodes = new Set(existingPits.map((p) => p.code.toUpperCase()));
  let n = next;
  while (existingCodes.has(candidate)) {
    n++;
    candidate = String(n).padStart(3, "0");
  }
  return candidate;
}

export function MasterPitTableClient({
  pits,
  sites,
  availableSites,
  departments,
  employees,
  createAction,
  updateAction,
  deleteAction,
  batchDeleteAction,
  toggleStatusAction,
  importAction,
}: MasterPitTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // State Modal CRUD PIT (Tambah & Edit)
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePit, setActivePit] = useState<PitWithStats | null>(null);

  // State Modal Karyawan Terhubung PIT
  const [viewEmployeesPit, setViewEmployeesPit] = useState<PitWithStats | null>(null);

  // State Modal Impor Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Group karyawan terdaftar per PIT ID
  const employeesByPitId = useMemo(() => {
    const map = new Map<number, PitEmployeeItem[]>();
    (employees || []).forEach((emp) => {
      if (emp.pitId != null) {
        const list = map.get(emp.pitId) || [];
        list.push(emp);
        map.set(emp.pitId, list);
      }
    });
    return map;
  }, [employees]);

  // Daftar Site dari database secara dinamis
  const [siteList, setSiteList] = useState<SiteItem[]>(sites || []);

  useEffect(() => {
    if (sites && sites.length > 0) {
      setSiteList(sites);
    } else {
      fetch("/api/admin/sites")
        .then((res) => res.json())
        .then((data) => {
          if (data?.sites) setSiteList(data.sites);
        })
        .catch(() => {});
    }
  }, [sites]);

  // Daftar opsi Site dinamis tanpa hardcode
  const dynamicSites = useMemo(() => {
    const list: { id: number; code: string; name: string }[] = [];
    const seen = new Set<string>();

    siteList.forEach((s) => {
      const codeUpper = s.code.toUpperCase();
      if (!seen.has(codeUpper)) {
        seen.add(codeUpper);
        list.push({ id: s.id, code: codeUpper, name: s.name });
      }
    });

    (availableSites || []).forEach((code) => {
      const codeUpper = code.trim().toUpperCase();
      if (codeUpper && !seen.has(codeUpper)) {
        seen.add(codeUpper);
        list.push({
          id: 0,
          code: codeUpper,
          name: codeUpper === "HO" ? "Head Office" : `Site ${codeUpper}`,
        });
      }
    });

    pits.forEach((p) => {
      if (p.site) {
        const codeUpper = p.site.trim().toUpperCase();
        if (!seen.has(codeUpper)) {
          seen.add(codeUpper);
          list.push({
            id: p.siteId || 0,
            code: codeUpper,
            name: p.siteName || `Site ${codeUpper}`,
          });
        }
      }
    });

    return list;
  }, [siteList, availableSites, pits]);

  // Daftar Departemen dinamis dari database dan relasi PIT
  const deptList = useMemo(() => {
    if (departments && departments.length > 0) return departments;
    const map = new Map<number, DepartmentItem>();
    pits.forEach((p) => {
      (p.linkedDepartments || []).forEach((d) => {
        if (!map.has(d.id)) {
          map.set(d.id, { id: d.id, code: d.code, name: d.name });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, pits]);

  // Kode angka unik otomatis untuk penambahan PIT baru
  const nextPitCode = useMemo(() => {
    return generateNextPitCode(pits);
  }, [pits]);

  // Filter Data PIT berdasarkan pencarian (kode / nama) dan status
  const filteredPits = useMemo(() => {
    return pits.filter((p) => {
      // Filter Status
      if (selectedStatus !== "ALL") {
        const isActiveFilter = selectedStatus === "ACTIVE";
        if (p.isActive !== isActiveFilter) return false;
      }

      // Pencarian berdasarkan kode atau nama PIT
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = p.code.toLowerCase().includes(q);
        const matchName = p.name.toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }

      return true;
    });
  }, [pits, selectedStatus, searchQuery]);

  // Buka Modal Tambah
  const handleOpenAdd = () => {
    setActivePit(null);
    setModalMode("add");
    setIsModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEdit = (p: PitWithStats) => {
    setActivePit(p);
    setModalMode("edit");
    setIsModalOpen(true);
  };

  // Buka Modal Karyawan PIT
  const handleOpenEmployees = (p: PitWithStats) => {
    setViewEmployeesPit(p);
  };

  // Hapus Single PIT
  const handleDelete = async (p: PitWithStats) => {
    if (p.mappedDepartmentCount > 0 || p.templateCount > 0) {
      void Swal.fire({
        icon: "warning",
        title: "PIT Sedang Digunakan",
        text: `PIT "${p.name}" terhubung dengan ${p.mappedDepartmentCount} mapping departemen dan ${p.templateCount} template KPI. Nonaktifkan status PIT jika tidak ingin digunakan lagi.`,
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const res = await Swal.fire({
      title: "Hapus Master PIT?",
      text: `Apakah Anda yakin ingin menghapus PIT "${p.name}" (${p.code})? Data yang dihapus tidak dapat dipulihkan.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
    });

    if (!res.isConfirmed) return;

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(p.id));
        await deleteAction(fd);
        setSelectedIds((prev) => prev.filter((id) => id !== p.id));
        void Swal.fire({
          icon: "success",
          title: "Berhasil",
          text: `PIT "${p.name}" berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus PIT.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Multi-select Checkbox
  const isAllSelected = filteredPits.length > 0 && selectedIds.length === filteredPits.length;

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPits.length && filteredPits.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPits.map((p) => p.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Batch Delete Handler
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const selectedPits = pits.filter((p) => selectedIds.includes(p.id));
    const inUsePits = selectedPits.filter(
      (p) => p.mappedDepartmentCount > 0 || p.templateCount > 0
    );
    const deletablePits = selectedPits.filter(
      (p) => p.mappedDepartmentCount === 0 && p.templateCount === 0
    );

    if (deletablePits.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "PIT Sedang Digunakan",
        text: `Semua ${inUsePits.length} PIT terpilih sedang digunakan dalam Mapping Departemen atau Template KPI. Nonaktifkan status PIT jika tidak ingin digunakan lagi.`,
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    let confirmText = `Apakah Anda yakin ingin menghapus ${selectedPits.length} Master PIT terpilih? Data yang dihapus tidak dapat dipulihkan.`;
    if (inUsePits.length > 0) {
      confirmText = `${deletablePits.length} PIT dapat dihapus, namun ${inUsePits.length} PIT sedang digunakan dan akan dilewati otomatis. Lanjutkan penghapusan ${deletablePits.length} PIT?`;
    }

    const res = await Swal.fire({
      title: `Hapus ${deletablePits.length} Master PIT?`,
      text: confirmText,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
    });

    if (!res.isConfirmed) return;

    startTransition(async () => {
      try {
        if (batchDeleteAction) {
          const result = await batchDeleteAction(deletablePits.map((p) => p.id));
          setSelectedIds([]);
          if (result.errors && result.errors.length > 0) {
            void Swal.fire({
              icon: "warning",
              title: "Penghapusan Sebagian",
              text: `${result.count} PIT berhasil dihapus. ${result.errors.join(", ")}`,
              confirmButtonColor: "#0f172a",
            });
          } else if (result.skippedCount > 0 || inUsePits.length > 0) {
            void Swal.fire({
              icon: "info",
              title: "Selesai",
              text: `${result.count} PIT berhasil dihapus. ${result.skippedCount + inUsePits.length} PIT dilewati karena sedang digunakan.`,
              confirmButtonColor: "#0f172a",
            });
          } else {
            void Swal.fire({
              icon: "success",
              title: "Berhasil",
              text: `${result.count} PIT berhasil dihapus.`,
              timer: 1500,
              showConfirmButton: false,
            });
          }
        } else {
          let count = 0;
          for (const p of deletablePits) {
            const fd = new FormData();
            fd.append("id", String(p.id));
            await deleteAction(fd);
            count++;
          }
          setSelectedIds([]);
          void Swal.fire({
            icon: "success",
            title: "Berhasil",
            text: `${count} PIT berhasil dihapus.`,
            timer: 1500,
            showConfirmButton: false,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus PIT.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Toggle Status Aktif / Nonaktif
  const handleToggleStatus = (p: PitWithStats) => {
    startTransition(async () => {
      try {
        const res = await toggleStatusAction(p.id);
        void Swal.fire({
          icon: "success",
          title: "Status Diperbarui",
          text: `PIT "${p.name}" kini ${res.newStatus ? "Aktif" : "Nonaktif"}.`,
          timer: 1300,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengubah status.";
        void Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Ekspor Excel
  const handleExport = (onlySelected = false) => {
    const toExport =
      onlySelected && selectedIds.length > 0
        ? pits.filter((p) => selectedIds.includes(p.id))
        : selectedIds.length > 0
        ? pits.filter((p) => selectedIds.includes(p.id))
        : filteredPits;

    exportPitsToExcel(
      toExport.map((p) => ({
        code: p.code,
        name: p.name,
        site: p.site,
        departments: (p.linkedDepartments || []).map((d) => d.name).join(", ") || "-",
        description: p.description,
        isActive: p.isActive,
        mappedDepartmentCount: p.mappedDepartmentCount,
        templateCount: p.templateCount,
      }))
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Toolbar Pencarian berdasarkan kode/nama, Filter Status, dan Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Pencarian berdasarkan kode atau nama PIT */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode atau nama PIT..."
              className={`${inputCls} pl-9 text-xs`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Status */}
          <div className="w-36">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`${inputCls} text-xs py-2`}
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
          </div>
        </div>

        {/* Tombol Aksi: Hapus Terpilih, Ekspor, Impor, Tambah PIT */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-3 py-2 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
              title="Hapus Master PIT terpilih"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-700" />
              <span>Hapus ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleExport(false)}
            className={`${btnSecondary} text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-1.5`}
            title={selectedIds.length > 0 ? `Ekspor ${selectedIds.length} PIT terpilih ke Excel` : "Ekspor seluruh hasil filter ke Excel"}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {selectedIds.length > 0 ? `Ekspor (${selectedIds.length})` : "Ekspor Excel"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className={`${btnSecondary} text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-1.5`}
            title="Impor dari Excel"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Impor Excel</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className={`${btnPrimary} text-xs px-3.5 py-2 cursor-pointer inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah PIT</span>
          </button>
        </div>
      </div>

      {/* Floating Notification saat baris dicentang */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-2.5 text-xs shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-[10px]">
              ✓
            </span>
            <span className="font-medium text-slate-700">
              <strong className="text-slate-900 font-bold">{selectedIds.length}</strong> Master PIT dipilih
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleExport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
              title="Ekspor data PIT terpilih ke file Excel"
            >
              <Download className="h-3.5 w-3.5 text-slate-600" />
              <span>Ekspor Terpilih ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Hapus data PIT terpilih"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-700" />
              <span>Hapus Terpilih ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-xl px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer font-medium"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* 2. Tabel Master PIT (Tabel biasa tanpa accordion atau card tambahan) */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-left text-xs font-bold text-slate-700">
                <th className="w-10 px-3 py-3 text-center border-b border-slate-200">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                    aria-label="Pilih semua Master PIT"
                  />
                </th>
                <th className={th}>Kode PIT</th>
                <th className={th}>Nama PIT</th>
                <th className={`${th} text-center`}>Penggunaan</th>
                <th className={`${th} text-center`}>Status</th>
                <th className={`${th} text-right w-28`}>Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <Mountain className="h-6 w-6" />
                      </div>
                      <p className="font-semibold text-slate-700">Tidak ada data Master PIT</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {searchQuery || selectedStatus !== "ALL"
                          ? "Tidak ditemukan PIT yang sesuai dengan kriteria pencarian."
                          : "Belum ada master PIT yang didaftarkan. Klik tombol Tambah PIT untuk memulai."}
                      </p>
                      {!searchQuery && selectedStatus === "ALL" && (
                        <button
                          type="button"
                          onClick={handleOpenAdd}
                          className={`${btnPrimary} mt-2 text-xs px-3 py-1.5 inline-flex items-center gap-1.5`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Tambah PIT Pertama
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPits.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`transition ${isSelected ? "bg-slate-50/90 font-medium" : "hover:bg-slate-50/60"}`}
                    >
                      {/* Checkbox Multi-select */}
                      <td className="w-10 px-3 py-3 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                          aria-label={`Pilih PIT ${p.name}`}
                        />
                      </td>

                      {/* Kode PIT (angka unik otomatis) */}
                      <td className={`${td} align-middle`}>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200/80">
                          {p.code}
                        </span>
                      </td>

                      {/* Nama PIT */}
                      <td className={`${td} align-middle`}>
                        <div className="font-bold text-slate-900">{p.name}</div>
                      </td>

                      {/* Penggunaan: jumlah Karyawan, Mapping dan Template */}
                      <td className={`${td} text-center align-middle`}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEmployees(p)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition cursor-pointer"
                            title="Klik untuk melihat karyawan di PIT ini"
                          >
                            {(employeesByPitId.get(p.id) || []).length} Karyawan
                          </button>
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700"
                            title="Jumlah Mapping Departemen yang terhubung"
                          >
                            {p.mappedDepartmentCount} Mapping
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60"
                            title="Jumlah Template KPI yang terhubung"
                          >
                            {p.templateCount} Template
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className={`${td} text-center align-middle`}>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(p)}
                          disabled={isPending}
                          className={`cursor-pointer inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                            p.isActive
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
                          }`}
                          title="Klik untuk mengubah status aktif"
                        >
                          {p.isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-slate-400" />
                              <span>Nonaktif</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Aksi: Lihat Karyawan, Edit PIT, dan Hapus */}
                      <td className={`${td} text-right align-middle`}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEmployees(p)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition cursor-pointer"
                            title="Lihat Karyawan di PIT"
                            aria-label={`Lihat Karyawan di PIT ${p.name}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                            title="Edit Master PIT"
                            aria-label={`Edit PIT ${p.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            disabled={isPending}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                            title="Hapus PIT"
                            aria-label={`Hapus PIT ${p.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Footer info */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500">
          <span>
            Menampilkan {filteredPits.length} dari {pits.length} PIT terdaftar
          </span>
          <span>Data terhubung langsung dengan database Master Site, Mapping Departemen, dan Template KPI</span>
        </div>
      </div>

      {/* 3. Modal Tambah / Edit / Detail PIT */}
      {isModalOpen && (
        <PitModal
          key={activePit ? `${activePit.id}-${modalMode}` : "add"}
          isOpen={isModalOpen}
          mode={modalMode}
          pit={activePit}
          autoGeneratedCode={nextPitCode}
          availableSites={dynamicSites}
          availableDepartments={deptList}
          onClose={() => setIsModalOpen(false)}
          onSwitchToEdit={() => setModalMode("edit")}
          createAction={createAction}
          updateAction={updateAction}
        />
      )}

      {/* 4. Modal Lihat Karyawan Terhubung PIT */}
      {viewEmployeesPit && (
        <PitEmployeesModal
          isOpen={Boolean(viewEmployeesPit)}
          pit={viewEmployeesPit}
          employees={employees || []}
          departments={deptList}
          onClose={() => setViewEmployeesPit(null)}
        />
      )}

      {/* Modal Impor Excel PIT */}
      {isImportModalOpen && (
        <PitImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          importAction={importAction}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUB-KOMPONEN: MODAL TAMBAH / EDIT / DETAIL PIT
// -----------------------------------------------------------------------------
interface PitModalProps {
  isOpen: boolean;
  mode: "add" | "edit" | "detail";
  pit: PitWithStats | null;
  autoGeneratedCode: string;
  availableSites: { id: number; code: string; name: string }[];
  availableDepartments: DepartmentItem[];
  onClose: () => void;
  onSwitchToEdit?: () => void;
  createAction: (fd: FormData) => Promise<{ success: boolean; id: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
}

function PitModal({
  isOpen,
  mode,
  pit,
  autoGeneratedCode,
  availableSites,
  availableDepartments,
  onClose,
  createAction,
  updateAction,
}: PitModalProps) {
  // Field values
  const [code] = useState(mode === "add" ? autoGeneratedCode : pit?.code || "");
  const [name, setName] = useState(pit?.name || "");
  const [site, setSite] = useState(pit?.site || (availableSites[0]?.code ?? ""));
  const [siteId, setSiteId] = useState<number>(
    pit?.siteId || (availableSites.find((s) => s.code === (pit?.site || availableSites[0]?.code))?.id ?? 0)
  );
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>(() => {
    if (pit?.linkedDepartments && pit.linkedDepartments.length > 0) {
      return pit.linkedDepartments.map((d) => d.id);
    }
    return [];
  });
  const [description, setDescription] = useState(pit?.description || "");
  const [isActive, setIsActive] = useState(pit ? pit.isActive : true);

  // State dropdown multi-select departemen
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearchQuery, setDeptSearchQuery] = useState("");
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  const [isPending, startTransition] = useTransition();

  // Lookup map untuk nama dan kode departemen
  const deptLookup = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    for (const d of availableDepartments) {
      map.set(d.id, d);
    }
    if (pit?.linkedDepartments) {
      for (const d of pit.linkedDepartments) {
        if (!map.has(d.id)) {
          map.set(d.id, { id: d.id, code: d.code, name: d.name });
        }
      }
    }
    return map;
  }, [availableDepartments, pit]);

  // Filter daftar departemen berdasarkan pencarian
  const filteredDepartments = useMemo(() => {
    const q = deptSearchQuery.toLowerCase().trim();
    if (!q) return availableDepartments;
    return availableDepartments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q)
    );
  }, [availableDepartments, deptSearchQuery]);

  // Tutup dropdown departemen jika klik di luar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        deptDropdownRef.current &&
        !deptDropdownRef.current.contains(e.target as Node)
      ) {
        setIsDeptDropdownOpen(false);
      }
    };
    if (isDeptDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDeptDropdownOpen]);

  // Escape key listener untuk menutup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleRemoveDept = (idToRemove: number) => {
    setSelectedDeptIds((prev) => prev.filter((id) => id !== idToRemove));
  };

  const handleToggleDept = (idToToggle: number) => {
    setSelectedDeptIds((prev) =>
      prev.includes(idToToggle)
        ? prev.filter((id) => id !== idToToggle)
        : [...prev, idToToggle]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama PIT Wajib Diisi",
        text: "Silakan masukkan nama PIT sebelum menyimpan.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    if (!site) {
      void Swal.fire({
        icon: "warning",
        title: "Site Wajib Dipilih",
        text: "Silakan pilih Site tempat PIT ini beroperasi.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        if (pit && mode !== "add") fd.append("id", String(pit.id));
        fd.append("code", code);
        fd.append("name", name.trim());
        fd.append("site", site);
        if (siteId) fd.append("siteId", String(siteId));
        fd.append("departmentIds", selectedDeptIds.join(","));
        fd.append("description", description.trim());
        fd.append("isActive", String(isActive));

        if (mode === "add" && !pit) {
          await createAction(fd);
        } else {
          await updateAction(fd);
        }

        void Swal.fire({
          icon: "success",
          title: "Berhasil",
          text:
            mode === "add" && !pit
              ? `Master PIT "${name}" berhasil ditambahkan.`
              : `Data PIT "${name}" berhasil diperbarui.`,
          timer: 1500,
          showConfirmButton: false,
        });
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan data PIT.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#2563eb",
        });
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal: Minimalis tanpa ikon dekoratif */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h3 id="pit-modal-title" className="text-sm font-bold text-slate-900">
              {mode === "add" ? "Tambah Master PIT" : "Edit Master PIT"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === "add"
                ? "Daftarkan Master PIT baru yang terhubung ke Site dan Departemen."
                : "Perbarui informasi nama, site, dan relasi Master PIT."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body: Layout Field Dua Kolom */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Kode PIT: Otomatis dan Tidak Dapat Diedit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-800">
                  Kode PIT <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  Otomatis
                </span>
              </div>
              <input
                type="text"
                value={code}
                readOnly
                disabled
                className={`${inputCls} font-mono font-bold uppercase bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed`}
              />
            </div>

            {/* 2. Nama PIT */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Nama PIT <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: BCM Selatan, Pit Barat"
                className={inputCls}
                required
              />
            </div>

            {/* 3. Site */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Site <span className="text-rose-500">*</span>
              </label>
              <select
                value={site}
                onChange={(e) => {
                  const val = e.target.value;
                  setSite(val);
                  const matched = availableSites.find((s) => s.code === val);
                  if (matched) setSiteId(matched.id);
                }}
                className={inputCls}
                required
              >
                {availableSites.length === 0 ? (
                  <option value="">Tidak ada site terdaftar</option>
                ) : (
                  availableSites.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 4. Status Operasional */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Status Operasional
              </label>
              <div className="flex items-center gap-5 h-[38px] px-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="pit-status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Aktif</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="pit-status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Nonaktif</span>
                </label>
              </div>
            </div>

            {/* 5. Departemen: Dropdown Multi-Select */}
            <div className="relative" ref={deptDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-800">
                  Departemen
                </label>
                {selectedDeptIds.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {selectedDeptIds.length} dipilih
                  </span>
                )}
              </div>
              <div
                onClick={() => setIsDeptDropdownOpen((prev) => !prev)}
                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer hover:border-slate-400 focus-within:border-blue-500 transition text-xs"
              >
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  {selectedDeptIds.length === 0 ? (
                    <span className="text-slate-400 select-none">Pilih Departemen...</span>
                  ) : (
                    selectedDeptIds.map((id) => {
                      const d = deptLookup.get(id);
                      const label = d ? d.name : `Dept #${id}`;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-xs font-medium"
                        >
                          <span>{label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveDept(id);
                            }}
                            className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer font-bold leading-none"
                            title={`Hapus ${label}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                    isDeptDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </div>

              {/* Popover Dropdown Multi-Select Departemen */}
              {isDeptDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in duration-100">
                  <div className="p-2 border-b border-slate-100 bg-slate-50">
                    <input
                      type="text"
                      value={deptSearchQuery}
                      onChange={(e) => setDeptSearchQuery(e.target.value)}
                      placeholder="Cari departemen..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {filteredDepartments.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Departemen tidak ditemukan
                      </div>
                    ) : (
                      filteredDepartments.map((d) => {
                        const isChecked = selectedDeptIds.includes(d.id);
                        return (
                          <label
                            key={d.id}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer text-slate-700 select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleDept(d.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="flex-1">
                              {d.name}{" "}
                              <span className="text-slate-400">({d.code})</span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Keterangan */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Keterangan (Opsional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Keterangan atau detail lokasi kerja PIT..."
                className={`${inputCls} min-h-[38px] h-[38px] resize-none focus:h-20 transition-all text-xs`}
              />
            </div>
          </div>

          {/* Ringkasan Penggunaan Database: Ringkas tanpa Card Berlebihan */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Penggunaan Database:</span>
            <div className="flex items-center gap-3 text-xs">
              <span>
                Mapping Departemen:{" "}
                <strong className="text-slate-900 font-bold">
                  {pit?.mappedDepartmentCount ?? 0}
                </strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Template KPI:{" "}
                <strong className="text-slate-900 font-bold">
                  {pit?.templateCount ?? 0}
                </strong>
              </span>
            </div>
          </div>

          {/* Modal Footer: Tombol Tutup Outline Biru & Tombol Edit PIT Biru */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 transition cursor-pointer disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer disabled:opacity-50"
            >
              {isPending
                ? "Menyimpan..."
                : mode === "add" && !pit
                ? "Tambah PIT"
                : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUB-KOMPONEN: MODAL IMPOR EXCEL PIT
// -----------------------------------------------------------------------------
interface PitImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  importAction: (
    items: {
      code: string;
      name: string;
      site?: string;
      description?: string;
      departments?: string;
      department?: string;
    }[]
  ) => Promise<{ createdCount: number; updatedCount: number; errors: string[] }>;
}

function PitImportModal({ isOpen, onClose, importAction }: PitImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewItems, setPreviewItems] = useState<
    { code: string; name: string; site?: string; description?: string; departments?: string }[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    try {
      const items = await parsePitExcelFile(file);
      setPreviewItems(items);
    } catch {
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: "Pastikan format Excel valid (.xlsx).",
        confirmButtonColor: "#0f172a",
      });
    }
  };

  const handleImportSubmit = async () => {
    if (previewItems.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await importAction(previewItems);
      if (res.errors.length > 0) {
        void Swal.fire({
          icon: "warning",
          title: "Impor Sebagian Selesai",
          html: `<p class="mb-2">Berhasil membuat <b>${res.createdCount}</b> dan memperbarui <b>${res.updatedCount}</b> PIT.</p><div class="text-left text-xs text-rose-600 max-h-40 overflow-y-auto">${res.errors.join("<br/>")}</div>`,
          confirmButtonColor: "#0f172a",
        });
      } else {
        void Swal.fire({
          icon: "success",
          title: "Impor Berhasil",
          text: `Berhasil memproses ${res.createdCount + res.updatedCount} data PIT.`,
          confirmButtonColor: "#0f172a",
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengimpor file.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Impor",
        text: msg,
        confirmButtonColor: "#0f172a",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pit-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h3 id="pit-import-title" className="text-sm font-bold text-slate-900">
                Impor Master PIT dari Excel
              </h3>
              <p className="text-xs text-slate-500">
                Unggah template Excel untuk mendaftarkan banyak PIT sekaligus.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Butuh template Excel?</span>
              <p className="text-[11px] text-slate-500">Unduh format template resmi dengan contoh data.</p>
            </div>
            <button
              type="button"
              onClick={() => downloadPitTemplate()}
              className={`${btnSecondary} text-xs px-3 py-1.5 cursor-pointer inline-flex items-center gap-1`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Template</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Pilih File Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 file:cursor-pointer"
            />
          </div>

          {previewItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Pratinjau ({previewItems.length} baris)</span>
                <span className="text-slate-500 text-[11px]">{selectedFile?.name}</span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {previewItems.slice(0, 15).map((item, i) => (
                  <div key={i} className="p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-800">{item.code}</span>
                      <span className="text-slate-700">{item.name}</span>
                      {item.departments && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          {item.departments}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                      Site {item.site || "GAM"}
                    </span>
                  </div>
                ))}
                {previewItems.length > 15 && (
                  <div className="p-2 text-center text-[11px] text-slate-400">
                    ... dan {previewItems.length - 15} data lainnya
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className={`${btnSecondary} text-xs px-4 py-2 cursor-pointer`}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleImportSubmit}
              disabled={isProcessing || previewItems.length === 0}
              className={`${btnPrimary} text-xs px-4 py-2 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50`}
            >
              {isProcessing ? "Memproses..." : `Impor ${previewItems.length} PIT`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUB-KOMPONEN: MODAL LIHAT KARYAWAN TERHUBUNG PIT
// -----------------------------------------------------------------------------
interface PitEmployeesModalProps {
  isOpen: boolean;
  pit: PitWithStats | null;
  employees: PitEmployeeItem[];
  departments: DepartmentItem[];
  onClose: () => void;
}

function PitEmployeesModal({
  isOpen,
  pit,
  employees,
  departments,
  onClose,
}: PitEmployeesModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Escape key listener untuk menutup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Map ID departemen ke nama departemen
  const deptMap = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departments]);

  // Filter seluruh karyawan yang terdaftar di PIT ini
  const pitEmployees = useMemo(() => {
    if (!pit) return [];
    return employees.filter((emp) => emp.pitId === pit.id);
  }, [pit, employees]);

  // Filter pencarian dan status
  const filteredEmployees = useMemo(() => {
    return pitEmployees.filter((emp) => {
      if (statusFilter === "ACTIVE" && emp.isActive === false) return false;
      if (statusFilter === "INACTIVE" && emp.isActive !== false) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNik = emp.nik.toLowerCase().includes(q);
        const matchName = emp.name.toLowerCase().includes(q);
        const matchPos = (emp.jobPosition || "").toLowerCase().includes(q);
        const deptName = deptMap.get(emp.departmentId) || "";
        const matchDept = deptName.toLowerCase().includes(q);
        const matchUnit = (emp.operatingUnit || "").toLowerCase().includes(q);
        if (!matchNik && !matchName && !matchPos && !matchDept && !matchUnit) return false;
      }
      return true;
    });
  }, [pitEmployees, statusFilter, searchQuery, deptMap]);

  if (!isOpen || !pit) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pit-employees-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="pit-employees-modal-title" className="text-sm font-bold text-slate-900">
                  Daftar Karyawan di PIT: {pit.name}
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {pit.code}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Site {pit.site || "-"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Total {pitEmployees.length} karyawan terdaftar di sektor operasional {pit.name}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search & Filter */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIK, nama karyawan, jabatan, departemen..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Semua Status ({pitEmployees.length})</option>
              <option value="ACTIVE">
                Hanya Aktif ({pitEmployees.filter((e) => e.isActive !== false).length})
              </option>
              <option value="INACTIVE">
                Nonaktif ({pitEmployees.filter((e) => e.isActive === false).length})
              </option>
            </select>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-y-auto">
          {filteredEmployees.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Users className="h-6 w-6" />
                </div>
                <p className="font-semibold text-slate-700">
                  {pitEmployees.length === 0
                    ? "Belum ada karyawan yang dimapping ke PIT ini"
                    : "Tidak ada karyawan yang sesuai kriteria pencarian"}
                </p>
                <p className="text-xs text-slate-400 max-w-sm">
                  {pitEmployees.length === 0
                    ? "Mapping karyawan ke PIT dapat dilakukan melalui Master Karyawan atau impor data karyawan."
                    : "Coba ubah kata kunci pencarian atau ubah filter status karyawan."}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-left text-xs font-bold text-slate-700 z-10">
                <tr>
                  <th className="w-12 px-3 py-2.5 text-center">No</th>
                  <th className="px-4 py-2.5">NIK</th>
                  <th className="px-4 py-2.5">Nama Karyawan</th>
                  <th className="px-4 py-2.5">Departemen</th>
                  <th className="px-4 py-2.5">Jabatan</th>
                  <th className="px-4 py-2.5 text-center">Operating Unit</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.map((emp, index) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-3 py-2.5 text-center text-slate-400 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200/80">
                        {emp.nik}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-slate-900">{emp.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {deptMap.get(emp.departmentId) || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {emp.jobPosition || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {emp.operatingUnit || "HO"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.isActive !== false
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {emp.isActive !== false ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500">
            Menampilkan <strong className="font-bold text-slate-800">{filteredEmployees.length}</strong> dari{" "}
            <strong className="font-bold text-slate-800">{pitEmployees.length}</strong> karyawan
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
