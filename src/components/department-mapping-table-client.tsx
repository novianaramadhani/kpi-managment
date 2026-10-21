"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type { Department, Employee, Pit } from "@/db/schema";
import type { DepartmentMappingWithDetails, ParsedDepartmentMappingItem } from "@/lib/department-mapping-utils";
import { Badge, Table, td, th, btnPrimary, btnSecondary, btnDanger, inputCls } from "./ui";
import {
  exportDepartmentMappingsToExcel,
  downloadDepartmentMappingTemplate,
  parseDepartmentMappingExcelFile,
} from "@/lib/excel-master";
import {
  Download,
  Upload,
  Plus,
  Pencil,
  Trash2,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  FileSpreadsheet,
  ArrowRightLeft,
  X,
  Building2,
  Mountain,
} from "lucide-react";

interface DepartmentMappingTableClientProps {
  mappings: DepartmentMappingWithDetails[];
  departments: Department[];
  employees: Employee[];
  pits?: Pit[];
  sites?: { id: number; code: string; name: string }[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  createAction: (fd: FormData) => Promise<{ success: boolean; id: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteAction: (fd: FormData) => Promise<{ success: boolean }>;
  batchDeleteAction: (ids: number[]) => Promise<{ count: number }>;
  batchAssignAction: (mappingIds: number[], departmentId: number, pitId?: number | null) => Promise<{ count: number }>;
  importAction: (
    items: ParsedDepartmentMappingItem[]
  ) => Promise<{ count: number; updatedCount: number; errors: string[] }>;
}

export function DepartmentMappingTableClient({
  mappings,
  departments,
  employees,
  pits = [],
  sites = [],
  operatingUnits = [],
  createAction,
  updateAction,
  deleteAction,
  batchDeleteAction,
  batchAssignAction,
  importAction,
}: DepartmentMappingTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSite, setSelectedSite] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("ALL");
  const [selectedPitFilter, setSelectedPitFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<DepartmentMappingWithDetails | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedMappingForEmployees, setSelectedMappingForEmployees] = useState<DepartmentMappingWithDetails | null>(null);

  // Quick Assign Batch modal state
  const [isBatchAssignModalOpen, setIsBatchAssignModalOpen] = useState(false);
  const [batchTargetDeptId, setBatchTargetDeptId] = useState<string>("");
  const [batchTargetPitId, setBatchTargetPitId] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  // Daftar Site dari database secara dinamis tanpa hardcode
  const [siteList, setSiteList] = useState<{ id: number; code: string; name: string }[]>(sites);

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

  // Daftar opsi Site murni dari database tanpa hardcode
  const availableSites = useMemo(() => {
    const list: string[] = ["ALL"];
    const seen = new Set<string>(["ALL"]);

    siteList.forEach((s) => {
      const codeUpper = s.code.toUpperCase();
      if (!seen.has(codeUpper)) {
        seen.add(codeUpper);
        list.push(codeUpper);
      }
    });

    operatingUnits.forEach((u) => {
      if (u.name) {
        const codeUpper = u.name.trim().toUpperCase();
        if (!seen.has(codeUpper)) {
          seen.add(codeUpper);
          list.push(codeUpper);
        }
      }
    });

    mappings.forEach((m) => {
      if (m.site) {
        const codeUpper = m.site.trim().toUpperCase();
        if (!seen.has(codeUpper)) {
          seen.add(codeUpper);
          list.push(codeUpper);
        }
      }
    });

    return list;
  }, [siteList, operatingUnits, mappings]);

  // PIT options untuk filter toolbar yang mengikuti filter Site terpilih
  const toolbarPits = useMemo(() => {
    if (selectedSite === "ALL") return pits;
    return pits.filter((p) => p.site.toUpperCase() === selectedSite.toUpperCase());
  }, [pits, selectedSite]);

  // Filter Data Mapping
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      // 1. Site
      if (selectedSite !== "ALL" && m.site.toUpperCase() !== selectedSite.toUpperCase()) {
        return false;
      }
      // 2. Status
      if (selectedStatus !== "ALL" && m.status !== selectedStatus) {
        return false;
      }
      // 3. Department
      if (selectedDeptFilter !== "ALL") {
        if (selectedDeptFilter === "UNASSIGNED") {
          if (m.departmentId !== null) return false;
        } else {
          const deptId = Number(selectedDeptFilter);
          if (m.departmentId !== deptId) return false;
        }
      }
      // 4. PIT
      if (selectedPitFilter !== "ALL") {
        if (selectedPitFilter === "NO_PIT") {
          if (m.pitId !== null && m.pitId !== undefined) return false;
        } else {
          const pId = Number(selectedPitFilter);
          if (m.pitId !== pId) return false;
        }
      }
      // 5. Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRaw = m.rawDepartmentName.toLowerCase().includes(q);
        const matchStd = (m.standardDepartmentName || "").toLowerCase().includes(q);
        const matchCode = (m.standardDepartmentCode || "").toLowerCase().includes(q);
        const matchPit = (m.pitName || "").toLowerCase().includes(q) || (m.pitCode || "").toLowerCase().includes(q);
        const matchUnit = (m.originalUnitDetail || "").toLowerCase().includes(q);
        const matchNotes = (m.notes || "").toLowerCase().includes(q);
        if (!matchRaw && !matchStd && !matchCode && !matchPit && !matchUnit && !matchNotes) {
          return false;
        }
      }
      return true;
    });
  }, [mappings, selectedSite, selectedStatus, selectedDeptFilter, selectedPitFilter, searchQuery]);

  // Checkbox Selection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredMappings.length && filteredMappings.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMappings.map((m) => m.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Handlers CRUD
  const handleOpenAdd = () => {
    setEditingMapping(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (m: DepartmentMappingWithDetails) => {
    setEditingMapping(m);
    setIsFormModalOpen(true);
  };

  const handleDeleteSingle = async (m: DepartmentMappingWithDetails) => {
    const confirm = await Swal.fire({
      title: "Hapus Aturan Mapping?",
      text: `Mapping Site "${m.site}" untuk "${m.rawDepartmentName}" akan dihapus.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(m.id));
        await deleteAction(fd);
        setSelectedIds((prev) => prev.filter((id) => id !== m.id));
        void Swal.fire({
          icon: "success",
          title: "Mapping Dihapus",
          text: `Aturan mapping "${m.rawDepartmentName}" berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus mapping.";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Aturan Mapping?`,
      text: "Aturan pemetaan yang dipilih akan dihapus secara permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Batch",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const res = await batchDeleteAction(selectedIds);
        setSelectedIds([]);
        void Swal.fire({
          icon: "success",
          title: "Berhasil",
          text: `${res.count} aturan mapping telah dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus batch.";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  const handleExecuteBatchAssign = async () => {
    if (!batchTargetDeptId || selectedIds.length === 0) return;
    const deptId = Number(batchTargetDeptId);
    if (!deptId) return;

    const pitParam =
      batchTargetPitId === "CLEAR" ? null : batchTargetPitId ? Number(batchTargetPitId) : undefined;

    startTransition(async () => {
      try {
        const res = await batchAssignAction(selectedIds, deptId, pitParam);
        setIsBatchAssignModalOpen(false);
        setBatchTargetPitId("");
        setSelectedIds([]);
        void Swal.fire({
          icon: "success",
          title: "Departemen Ditetapkan",
          text: `${res.count} aturan mapping berhasil diperbarui ke departemen standar.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menetapkan departemen.";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  const handleExport = () => {
    const toExport =
      selectedIds.length > 0 ? mappings.filter((m) => selectedIds.includes(m.id)) : filteredMappings;

    exportDepartmentMappingsToExcel(
      toExport.map((m) => ({
        site: m.site,
        rawDepartmentName: m.rawDepartmentName,
        standardDepartmentCode: m.standardDepartmentCode,
        standardDepartmentName: m.standardDepartmentName,
        pitName: m.pitName,
        pitCode: m.pitCode,
        originalUnitDetail: m.originalUnitDetail || undefined,
        status: m.status,
        totalEmployees: m.totalEmployees,
        notes: m.notes || undefined,
      }))
    );
  };

  return (
    <div className="space-y-4">
      {/* TOOLBAR FILTER & SEARCH */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Input Search */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-3.5 w-3.5" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama asli, standar, atau detail unit..."
              className="w-full rounded-xl border border-slate-300 pl-8.5 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus kata kunci pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  type="button"
                  onClick={() => setIsBatchAssignModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition shadow-2xs cursor-pointer"
                  title="Tetapkan departemen standar untuk mapping terpilih"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-sky-700" />
                  <span>Set Standar ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                  title="Hapus aturan mapping terpilih"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                  <span>Hapus ({selectedIds.length})</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Export data mapping ke Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Import data mapping dari Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Mapping</span>
            </button>
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* Filter Site */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Site:</span>
            <select
              value={selectedSite}
              onChange={(e) => {
                const nextSite = e.target.value;
                setSelectedSite(nextSite);
                if (selectedPitFilter !== "ALL" && selectedPitFilter !== "NO_PIT" && nextSite !== "ALL") {
                  const currPit = pits.find((p) => String(p.id) === selectedPitFilter);
                  if (currPit && currPit.site.toUpperCase() !== nextSite.toUpperCase()) {
                    setSelectedPitFilter("ALL");
                  }
                }
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Site ({mappings.length})</option>
              {availableSites
                .filter((s) => s !== "ALL")
                .map((s) => (
                  <option key={s} value={s}>
                    Site {s} ({mappings.filter((m) => m.site === s).length})
                  </option>
                ))}
            </select>
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value="MAPPED">Mapped ({mappings.filter((m) => m.status === "MAPPED").length})</option>
              <option value="UNMAPPED">
                Belum Dipetakan ({mappings.filter((m) => m.status === "UNMAPPED").length})
              </option>
              <option value="PENDING_VALIDATION">
                Perlu Validasi ({mappings.filter((m) => m.status === "PENDING_VALIDATION").length})
              </option>
            </select>
          </div>

          {/* Filter Departemen Standar */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Standar:</span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer max-w-[200px]"
            >
              <option value="ALL">Semua Departemen Standar</option>
              <option value="UNASSIGNED">Belum Ditentukan (Kosong)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Filter PIT Lapangan (Saling Terhubung dengan Site) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">PIT:</span>
            <select
              value={selectedPitFilter}
              onChange={(e) => setSelectedPitFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer max-w-[180px]"
            >
              <option value="ALL">Semua PIT ({toolbarPits.length})</option>
              <option value="NO_PIT">Tanpa PIT (Non-PIT)</option>
              {toolbarPits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) {selectedSite === "ALL" ? `· Site ${p.site}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters button if active */}
          {(selectedSite !== "ALL" ||
            selectedStatus !== "ALL" ||
            selectedDeptFilter !== "ALL" ||
            selectedPitFilter !== "ALL" ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedSite("ALL");
                setSelectedStatus("ALL");
                setSelectedDeptFilter("ALL");
                setSelectedPitFilter("ALL");
                setSearchQuery("");
              }}
              className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 underline ml-auto cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* TABEL DATA MAPPING */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <Table
          head={
            <tr>
              <th className={`${th} w-10 text-center`}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredMappings.length && filteredMappings.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  aria-label="Pilih semua aturan mapping"
                />
              </th>
              <th className={`${th} w-24`}>Site</th>
              <th className={th}>Nama Departemen Asli</th>
              <th className={th}>Departemen Standar</th>
              <th className={th}>PIT Lapangan</th>
              <th className={`${th} w-32 text-center`}>Total Karyawan</th>
              <th className={`${th} w-36 text-center`}>Status Mapping</th>
              <th className={`${th} w-28 text-center`}>Aksi</th>
            </tr>
          }
        >
          {filteredMappings.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center">
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <ArrowRightLeft className="w-10 h-10 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-slate-700">Belum ada data mapping departemen</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {searchQuery || selectedSite !== "ALL" || selectedStatus !== "ALL"
                      ? "Tidak ada mapping yang sesuai dengan filter yang dipilih."
                      : "Tambahkan mapping departemen baru atau lakukan import Excel untuk menghubungkan variasi nama antar-Site."}
                  </p>
                  {!searchQuery && selectedSite === "ALL" && selectedStatus === "ALL" && (
                    <button
                      type="button"
                      onClick={handleOpenAdd}
                      className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Mapping Pertama</span>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            filteredMappings.map((m) => {
              const isSelected = selectedIds.includes(m.id);

              return (
                <tr
                  key={m.id}
                  className={`hover:bg-slate-50/70 transition ${isSelected ? "bg-slate-50/90" : ""}`}
                >
                  {/* Checkbox */}
                  <td className={`${td} text-center`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      aria-label={`Pilih mapping ${m.rawDepartmentName}`}
                    />
                  </td>

                  {/* Site */}
                  <td className={td}>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${
                        m.site === "GAM"
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : m.site === "AKP"
                          ? "bg-sky-100 text-sky-900 border border-sky-200"
                          : m.site === "HO"
                          ? "bg-purple-100 text-purple-900 border border-purple-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {m.site}
                    </span>
                  </td>

                  {/* Nama Departemen Asli */}
                  <td className={td}>
                    <div className="font-bold text-slate-900 text-xs">{m.rawDepartmentName}</div>
                    {m.originalUnitDetail && (
                      <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-semibold text-slate-600">Unit:</span> {m.originalUnitDetail}
                      </div>
                    )}
                    {m.notes && (
                      <div className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-xs">{m.notes}</div>
                    )}
                  </td>

                  {/* Departemen Standar */}
                  <td className={td}>
                    {m.departmentId && m.standardDepartmentName ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-xs">
                          {m.standardDepartmentName}
                        </span>
                        {m.standardDepartmentCode && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 border border-slate-200">
                            {m.standardDepartmentCode}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(m)}
                        className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-semibold underline cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>Belum Ditentukan (Petakan)</span>
                      </button>
                    )}
                  </td>

                  {/* PIT Lapangan */}
                  <td className={td}>
                    {m.pitName ? (
                      <div className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                          <Mountain className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>{m.pitName}</span>
                        </span>
                        {m.pitCode && (
                          <span className="font-mono text-[10px] text-slate-500 font-bold">
                            ({m.pitCode})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">-</span>
                    )}
                  </td>

                  {/* Total Karyawan */}
                  <td className={`${td} text-center`}>
                    <button
                      type="button"
                      onClick={() => setSelectedMappingForEmployees(m)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        m.totalEmployees > 0
                          ? "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      title="Klik untuk melihat daftar karyawan"
                    >
                      <Users className="w-3 h-3 text-slate-500" />
                      <span>{m.totalEmployees}</span>
                    </button>
                  </td>

                  {/* Status Mapping */}
                  <td className={`${td} text-center`}>
                    {m.status === "MAPPED" ? (
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Mapped</span>
                      </span>
                    ) : m.status === "PENDING_VALIDATION" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 cursor-pointer"
                        title={
                          m.hasCrossSiteConflict
                            ? "Peringatan: Nama asli ini dipetakan ke departemen berbeda di Site lain."
                            : "Perlu validasi konfirmasi admin."
                        }
                        onClick={() => handleOpenEdit(m)}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>Perlu Validasi</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        <HelpCircle className="w-3 h-3 text-slate-500" />
                        <span>Belum Dipetakan</span>
                      </span>
                    )}
                  </td>

                  {/* Aksi */}
                  <td className={`${td} text-center`}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(m)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                        title="Edit aturan mapping"
                        aria-label="Edit mapping"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(m)}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                        title="Hapus aturan mapping"
                        aria-label="Hapus mapping"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </Table>
      </div>

      {/* MODAL INPUT / EDIT MAPPING */}
      {isFormModalOpen && (
        <DepartmentMappingFormModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          editingMapping={editingMapping}
          departments={departments}
          pits={pits}
          sites={siteList}
          availableSites={availableSites}
          createAction={createAction}
          updateAction={updateAction}
        />
      )}

      {/* MODAL IMPORT EXCEL MAPPING */}
      {isImportModalOpen && (
        <DepartmentMappingImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          importAction={importAction}
        />
      )}

      {/* MODAL LIST KARYAWAN TERKAIT MAPPING */}
      {selectedMappingForEmployees && (
        <DepartmentMappingEmployeesModal
          isOpen={Boolean(selectedMappingForEmployees)}
          onClose={() => setSelectedMappingForEmployees(null)}
          mapping={selectedMappingForEmployees}
          employees={employees}
        />
      )}

      {/* MODAL BATCH ASSIGN STANDAR */}
      {isBatchAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Tetapkan Departemen Standar ({selectedIds.length} Aturan)
              </h3>
              <button
                type="button"
                onClick={() => setIsBatchAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Pilih departemen resmi yang akan digunakan sebagai standar untuk{" "}
              <span className="font-bold text-slate-900">{selectedIds.length}</span> mapping terpilih:
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Departemen Standar:
              </label>
              <select
                value={batchTargetDeptId}
                onChange={(e) => setBatchTargetDeptId(e.target.value)}
                className={inputCls}
              >
                <option value="">Pilih Departemen Standar...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PIT Lapangan (Opsional):
              </label>
              <select
                value={batchTargetPitId}
                onChange={(e) => setBatchTargetPitId(e.target.value)}
                className={inputCls}
              >
                <option value="">-- Tetap Gunakan PIT Saat Ini --</option>
                <option value="CLEAR">Kosongkan PIT (Non-PIT)</option>
                {pits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code}) · Site {p.site}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBatchAssignModalOpen(false)}
                className={btnSecondary}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!batchTargetDeptId || isPending}
                onClick={handleExecuteBatchAssign}
                className={btnPrimary}
              >
                {isPending ? "Menyimpan..." : "Terapkan Standar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// =========================================================================
// SUB-KOMPONEN 1: MODAL TAMBAH & EDIT MAPPING
// =========================================================================

function DepartmentMappingFormModal({
  isOpen,
  onClose,
  editingMapping,
  departments,
  pits = [],
  sites = [],
  availableSites,
  createAction,
  updateAction,
}: {
  isOpen: boolean;
  onClose: () => void;
  editingMapping: DepartmentMappingWithDetails | null;
  departments: Department[];
  pits?: Pit[];
  sites?: { id: number; code: string; name: string }[];
  availableSites: string[];
  createAction: (fd: FormData) => Promise<{ success: boolean; id: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
}) {
  const [site, setSite] = useState(editingMapping?.site || "ALL");
  const [rawDepartmentName, setRawDepartmentName] = useState(editingMapping?.rawDepartmentName || "");
  const [departmentId, setDepartmentId] = useState(
    editingMapping?.departmentId ? String(editingMapping.departmentId) : ""
  );
  const [pitId, setPitId] = useState(editingMapping?.pitId ? String(editingMapping.pitId) : "");
  const [originalUnitDetail, setOriginalUnitDetail] = useState(editingMapping?.originalUnitDetail || "");
  const [notes, setNotes] = useState(editingMapping?.notes || "");
  const [status, setStatus] = useState<"MAPPED" | "UNMAPPED" | "PENDING_VALIDATION">(
    editingMapping?.status || "MAPPED"
  );
  const [confirmDifferentSiteMapping, setConfirmDifferentSiteMapping] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Connected PIT: PIT harus mengikuti Site yang dipilih dan boleh kosong jika tidak relevan
  const connectedPits = useMemo(() => {
    if (!site || site === "ALL") {
      return pits;
    }
    return pits.filter((p) => p.site.toUpperCase() === site.toUpperCase());
  }, [pits, site]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!rawDepartmentName.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Departemen Asli Wajib Diisi",
        text: "Silakan masukkan nama departemen asli yang tertera pada file Excel lapangan.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    if (editingMapping) {
      fd.append("id", String(editingMapping.id));
    }
    const cleanSite = site.trim().toUpperCase();
    fd.append("site", cleanSite);

    // Cari siteId jika site bukan ALL
    const matchedSite = (sites || []).find((s) => s.code.toUpperCase() === cleanSite);
    if (matchedSite) {
      fd.append("siteId", String(matchedSite.id));
    }

    fd.append("rawDepartmentName", rawDepartmentName.trim());
    if (departmentId) {
      fd.append("departmentId", departmentId);
    }
    if (pitId) {
      fd.append("pitId", pitId);
    }
    if (originalUnitDetail.trim()) {
      fd.append("originalUnitDetail", originalUnitDetail.trim());
    }
    fd.append("status", departmentId ? status : "UNMAPPED");
    if (notes.trim()) {
      fd.append("notes", notes.trim());
    }
    if (confirmDifferentSiteMapping) {
      fd.append("confirmDifferentSiteMapping", "true");
    }

    startTransition(async () => {
      try {
        if (editingMapping) {
          await updateAction(fd);
        } else {
          await createAction(fd);
        }
        onClose();
        void Swal.fire({
          icon: "success",
          title: "Berhasil Disimpan",
          text: `Aturan mapping untuk "${rawDepartmentName}" telah disimpan.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan mapping.";
        void Swal.fire({ icon: "error", title: "Gagal Menyimpan", text: msg });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {editingMapping ? "Edit Aturan Mapping Departemen" : "Tambah Aturan Mapping Baru"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Petakan nama departemen dari file Excel lapangan ke departemen standar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Site Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Site / Operating Unit <span className="text-rose-500">*</span>
            </label>
            <select
              value={site}
              onChange={(e) => {
                const newSite = e.target.value;
                setSite(newSite);
                // Reset PIT jika pit yang dipilih tidak termasuk dalam Site yang baru dipilih
                if (pitId && newSite !== "ALL") {
                  const currPit = pits.find((p) => String(p.id) === String(pitId));
                  if (currPit && currPit.site.toUpperCase() !== newSite.toUpperCase()) {
                    setPitId("");
                  }
                }
              }}
              className={inputCls}
              required
            >
              <option value="ALL">ALL (Semua Site)</option>
              {availableSites
                .filter((s) => s !== "ALL")
                .map((s) => (
                  <option key={s} value={s}>
                    Site {s}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Pilih Site tempat aturan ini berlaku (data diambil dinamis dari Master Site).
            </p>
          </div>

          {/* Nama Departemen Asli */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Nama Departemen Asli (di Excel) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={rawDepartmentName}
              onChange={(e) => setRawDepartmentName(e.target.value)}
              placeholder="Contoh: HRGA-JO, Produksi BCM Selatan, Logistik, TC"
              className={inputCls}
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Teks nama departemen persis seperti yang tertulis di file Excel karyawan lapangan.
            </p>
          </div>

          {/* Departemen Standar */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Departemen Standar (Tujuan Pemetaan)
            </label>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                if (e.target.value) {
                  setStatus("MAPPED");
                } else {
                  setStatus("UNMAPPED");
                }
              }}
              className={inputCls}
            >
              <option value="">Belum Ditentukan (Status: Belum Dipetakan)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Pilih dari Master Departemen resmi perusahaan untuk menentukan hasil mapping.
            </p>
          </div>

          {/* PIT Lapangan (Terkoneksi dengan Site, Boleh Kosong Jika Non-PIT) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">
                PIT Lapangan (Opsional)
              </label>
              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-semibold border border-amber-200/60">
                Terhubung Site {site !== "ALL" ? site : "Semua"}
              </span>
            </div>
            <select
              value={pitId}
              onChange={(e) => setPitId(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Tanpa PIT (Boleh kosong jika tidak relevan) --</option>
              {connectedPits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) {site === "ALL" ? `· Site ${p.site}` : ""}
                </option>
              ))}
            </select>
            {site !== "ALL" && connectedPits.length === 0 ? (
              <p className="text-[11px] text-amber-600 mt-1">
                Tidak ada Master PIT untuk Site {site}. PIT boleh dikosongkan untuk departemen non-PIT.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-1">
                Pilihan PIT mengikuti Site yang dipilih. Kosongkan jika departemen ini tidak terkait operasional PIT.
              </p>
            )}
          </div>

          {/* Detail Unit (Opsional) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Detail Unit Lapangan (Opsional)
            </label>
            <input
              type="text"
              value={originalUnitDetail}
              onChange={(e) => setOriginalUnitDetail(e.target.value)}
              placeholder="Contoh: BCM Selatan, BCM Utara, Mining Service"
              className={inputCls}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Catatan spesifikasi unit tetap tersimpan di database agar identitas unit lapangan tidak hilang.
            </p>
          </div>

          {/* Status Mapping */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">Status Mapping</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION")}
              className={inputCls}
            >
              <option value="MAPPED">Mapped (Aktif & Siap Digunakan)</option>
              <option value="UNMAPPED">Belum Dipetakan</option>
              <option value="PENDING_VALIDATION">Perlu Validasi</option>
            </select>
          </div>

          {/* Konfirmasi Variasi Antar-Site (Jika Ada) */}
          {editingMapping?.hasCrossSiteConflict && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-900 font-medium">
                  Perhatian: Nama departemen asli ini dipetakan ke target berbeda pada Site lain.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-950 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDifferentSiteMapping}
                  onChange={(e) => setConfirmDifferentSiteMapping(e.target.checked)}
                  className="rounded border-amber-400 text-amber-700 focus:ring-amber-500"
                />
                <span>Saya mengonfirmasi bahwa variasi mapping antar-site ini disengaja.</span>
              </label>
            </div>
          )}

          {/* Catatan / Keterangan */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">Catatan / Keterangan</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan untuk mapping ini..."
              className={inputCls}
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={isPending} className={btnSecondary}>
              Batal
            </button>
            <button type="submit" disabled={isPending} className={btnPrimary}>
              {isPending ? "Menyimpan..." : editingMapping ? "Perbarui Mapping" : "Simpan Mapping"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-KOMPONEN 2: MODAL IMPORT EXCEL MAPPING
// =========================================================================

function DepartmentMappingImportModal({
  isOpen,
  onClose,
  importAction,
}: {
  isOpen: boolean;
  onClose: () => void;
  importAction: (
    items: ParsedDepartmentMappingItem[]
  ) => Promise<{ count: number; updatedCount: number; errors: string[] }>;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedDepartmentMappingItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setIsParsing(true);
    try {
      const items = await parseDepartmentMappingExcelFile(f);
      setParsedRows(items);
    } catch {
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: "File Excel tidak dapat dibaca. Pastikan format file sesuai template.",
      });
      setFile(null);
      setParsedRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpload = () => {
    if (parsedRows.length === 0) return;

    startTransition(async () => {
      try {
        const res = await importAction(parsedRows);
        onClose();
        router.refresh();
        if (res.errors.length > 0) {
          void Swal.fire({
            icon: "warning",
            title: "Import Selesai dengan Catatan",
            html: `
              <p>Ditambahkan: <b>${res.count}</b>, Diperbarui: <b>${res.updatedCount}</b></p>
              <div style="max-height: 150px; overflow-y: auto; text-align: left; font-size: 12px; margin-top: 10px; padding: 8px; background: #f8fafc; border-radius: 8px;">
                ${res.errors.map((e) => `<p style="color: #b91c1c;">• ${e}</p>`).join("")}
              </div>
            `,
          });
        } else {
          void Swal.fire({
            icon: "success",
            title: "Import Berhasil",
            text: `${res.count} data mapping baru ditambahkan, ${res.updatedCount} data diperbarui.`,
            timer: 2000,
            showConfirmButton: false,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal melakukan import.";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Import Aturan Mapping Departemen</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Unggah file Excel yang memuat kolom <b>Site</b>, <b>Nama Departemen Asli</b>, dan{" "}
          <b>Kode Departemen Standar</b>.
        </p>

        {/* Download Template Link */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Belum memiliki format file? Gunakan template resmi:
          </div>
          <button
            type="button"
            onClick={() => downloadDepartmentMappingTemplate()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Template</span>
          </button>
        </div>

        {/* File Picker */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">Pilih File Excel (.xlsx)</label>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
          />
        </div>

        {/* Preview Ringkasan */}
        {isParsing && <p className="text-xs text-slate-500 italic">Membaca file Excel...</p>}
        {parsedRows.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900">
            <p className="font-bold">
              ✓ Terdeteksi {parsedRows.length} baris aturan mapping pada file.
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Klik &quot;Mulai Import&quot; untuk memproses dan menyimpan ke database.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={isPending} className={btnSecondary}>
            Batal
          </button>
          <button
            type="button"
            disabled={parsedRows.length === 0 || isPending}
            onClick={handleUpload}
            className={btnPrimary}
          >
            {isPending ? "Memproses Import..." : "Mulai Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUB-KOMPONEN 3: MODAL DAFTAR KARYAWAN TERKAIT MAPPING
// =========================================================================

function DepartmentMappingEmployeesModal({
  isOpen,
  onClose,
  mapping,
  employees,
}: {
  isOpen: boolean;
  onClose: () => void;
  mapping: DepartmentMappingWithDetails;
  employees: Employee[];
}) {
  const [search, setSearch] = useState("");

  const matchedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      const matchSite =
        mapping.site === "ALL" || (emp.operatingUnit || "").toUpperCase() === mapping.site.toUpperCase();
      if (!matchSite) return false;

      const empOrigClean = emp.originalDepartment
        ? emp.originalDepartment.trim().replace(/\s+/g, " ").toUpperCase()
        : "";

      if (empOrigClean && empOrigClean === mapping.cleanRawName) {
        return true;
      }
      if (!emp.originalDepartment && mapping.departmentId && emp.departmentId === mapping.departmentId) {
        return true;
      }
      return false;
    });
  }, [mapping, employees]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return matchedEmployees;
    const q = search.toLowerCase().trim();
    return matchedEmployees.filter(
      (e) =>
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.jobPosition || "").toLowerCase().includes(q)
    );
  }, [matchedEmployees, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white font-mono font-bold text-xs shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Karyawan Terdaftar: {mapping.rawDepartmentName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Site: <span className="font-semibold text-slate-700">{mapping.site}</span> · Standar:{" "}
                <span className="font-semibold text-slate-700">
                  {mapping.standardDepartmentName || "Belum dipetakan"}
                </span>{" "}
                · Total: <span className="font-semibold text-slate-700">{matchedEmployees.length} Karyawan</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIK, nama, atau jabatan karyawan..."
            className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
          />
        </div>

        {/* Tabel Karyawan */}
        <div className="overflow-y-auto flex-1 p-2">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">NIK</th>
                <th className="px-3 py-2">Nama Karyawan</th>
                <th className="px-3 py-2">Jabatan</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Dept Asli Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada karyawan yang cocok dengan kriteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{e.nik}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{e.name}</td>
                    <td className="px-3 py-2 text-slate-600">{e.jobPosition || "-"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {e.operatingUnit || "HO"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {e.originalDepartment || mapping.rawDepartmentName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-white flex justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
