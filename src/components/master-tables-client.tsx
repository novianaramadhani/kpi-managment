"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, KpiPeriod, DepartmentHead, Pit } from "@/db/schema";
import { Badge, Table, btnDanger, statusTone, td, th } from "./ui";
import { PeriodModal, DepartmentModal, JobLevelModal, OperatingUnitModal, JobPositionModal } from "./master-modals";
import { JobLevelEmployeeModal } from "./job-level-employee-modal";
import { OperatingUnitEmployeeModal } from "./operating-unit-employee-modal";
import { DepartmentEmployeeModal } from "./department-employee-modal";
import { DepartmentDetailModal } from "./department-detail-modal";
import { JobPositionEmployeeModal } from "./job-position-employee-modal";
import { MasterImportModal } from "./master-import-modal";
import { DepartmentImportModal } from "./department-import-modal";
import {
  type DepartmentMappingWithDetails,
  type SmartDepartmentImportPayload,
  type SmartDepartmentImportResult,
  matchesSite,
  matchesDeptName,
} from "@/lib/department-mapping-utils";
import {
  exportDepartmentsToExcel,
  downloadDepartmentTemplate,
  parseDepartmentExcelFile,
  exportJobLevelsToExcel,
  downloadJobLevelTemplate,
  parseJobLevelExcelFile,
  exportOperatingUnitsToExcel,
  downloadOperatingUnitTemplate,
  parseOperatingUnitExcelFile,
  exportJobPositionsToExcel,
  downloadJobPositionTemplate,
  parseJobPositionExcelFile,
} from "@/lib/excel-master";
import { Download, Upload, Pencil, Trash2, Users, ChevronLeft, ChevronRight, ArrowRightLeft, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";


// =========================================================================
// 1. PERIOD TABLE CLIENT (FULL-WIDTH + MODAL + SEARCH + FILTER)
// =========================================================================

interface PeriodTableClientProps {
  periods: KpiPeriod[];
  createAction: (fd: FormData) => Promise<void>;
  setStatusAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}

export function PeriodTableClient({
  periods,
  createAction,
  setStatusAction,
  deleteAction,
}: PeriodTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [, startTransition] = useTransition();

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPeriods.length && filteredPeriods.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPeriods.map((p) => p.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchStatus = (newStatus: "ACTIVE" | "CLOSED") => {
    setIsActionsOpen(false);
    if (selectedIds.length === 0) return;

    Swal.fire({
      title: `Set Status ${newStatus === "ACTIVE" ? "Aktif" : "Ditutup"} untuk ${selectedIds.length} Periode?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: newStatus === "ACTIVE" ? "#0284c7" : "#e11d48",
      confirmButtonText: "Ya, Ubah Status",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        startTransition(async () => {
          try {
            for (const id of selectedIds) {
              const fd = new FormData();
              fd.append("id", String(id));
              fd.append("status", newStatus);
              await setStatusAction(fd);
            }
            setSelectedIds([]);
            Swal.fire({ icon: "success", title: "Status Diperbarui", timer: 1500, showConfirmButton: false });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Gagal mengupdate status";
            Swal.fire({ icon: "error", title: "Gagal", text: msg });
          }
        });
      }
    });
  };

  const handleBatchDelete = async () => {
    setIsActionsOpen(false);
    if (selectedIds.length === 0) return;

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Periode KPI?`,
      text: "Periode terpilih akan dihapus.",
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
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await deleteAction(fd);
        }
        setSelectedIds([]);
        Swal.fire({ icon: "success", title: "Periode Dihapus", timer: 1500, showConfirmButton: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        Swal.fire({ icon: "error", title: "Gagal", text: msg });
      }
    });
  };

  // Filter periods based on search & status
  const filteredPeriods = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return periods.filter((p) => {
      if (selectedStatus !== "ALL" && p.status !== selectedStatus) {
        return false;
      }
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchYear = String(p.year).includes(q);
        if (!matchName && !matchYear) return false;
      }
      return true;
    });
  }, [periods, searchQuery, selectedStatus]);

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama periode atau tahun..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Controls: Status filter & Add button */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {(["ALL", "ACTIVE", "DRAFT", "CLOSED"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    selectedStatus === st
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {st === "ALL" ? "Semua Status" : st}
                </button>
              ))}
            </div>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
              >
                <span>Batch ({selectedIds.length} Terpilih)</span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <span>••• Actions</span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsActionsOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 space-y-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => handleBatchStatus("ACTIVE")}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-emerald-700 hover:bg-emerald-50 transition text-left cursor-pointer disabled:opacity-40"
                    >
                      <span>Set Status Aktif</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStatus("CLOSED")}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 transition text-left cursor-pointer disabled:opacity-40"
                    >
                      <span>Set Status Closed</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer disabled:opacity-40"
                    >
                      <span>Hapus Terpilih ({selectedIds.length})</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* "+ Tambah Periode" button */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition cursor-pointer whitespace-nowrap"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              + Tambah Periode KPI
            </button>
          </div>
        </div>

        {/* Status Counter */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <span>
            Menampilkan <b>{filteredPeriods.length}</b> dari {periods.length} periode KPI
          </span>
          {(searchQuery || selectedStatus !== "ALL") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedStatus("ALL");
              }}
              className="text-xs text-slate-700 font-bold hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Full-width Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table
          head={
            <tr>
              <th className="w-10 px-3.5 py-3 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredPeriods.length && filteredPeriods.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                />
              </th>
              <th className={th}>Nama Periode</th>
              <th className={th}>Tahun</th>
              <th className={th}>Rentang Waktu</th>
              <th className={th}>Tgl Evaluasi</th>
              <th className={th}>Jendela Input</th>
              <th className={th}>Min Masa Kerja</th>
              <th className={th}>Status</th>
            </tr>
          }
        >
          {filteredPeriods.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <tr key={p.id} className={`hover:bg-slate-50 transition ${isSelected ? "bg-slate-50" : ""}`}>
                <td className="w-10 px-3.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                  />
                </td>
                <td className={`${td} font-bold text-slate-900`}>{p.name}</td>
                <td className={td}>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {p.year}
                  </span>
                </td>
                <td className={td}>
                  <div className="text-xs text-slate-700">
                    {new Date(p.startDate).toLocaleDateString("id-ID")} - {new Date(p.endDate).toLocaleDateString("id-ID")}
                  </div>
                </td>
                <td className={td}>
                  <div className="text-xs text-slate-700 font-medium">
                    {new Date(p.evaluationDate).toLocaleDateString("id-ID")}
                  </div>
                </td>
                <td className={td}>
                  <div className="text-xs text-slate-600">
                    Bulan {p.inputStartMonth} s/d {p.cutoffMonth}
                  </div>
                </td>
                <td className={td}>
                  <span className="text-xs text-slate-600 font-medium">
                    {p.minTenureMonths} Bulan
                  </span>
                </td>
                <td className={td}>
                  <Badge tone={p.status === "ACTIVE" ? "green" : p.status === "DRAFT" ? "amber" : "slate"}>
                    {p.status}
                  </Badge>
                </td>
              </tr>
            );
          })}

          {filteredPeriods.length === 0 && (
            <tr>
              <td colSpan={8} className="p-12 text-center text-slate-500">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-700">Tidak ada periode KPI ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery || selectedStatus !== "ALL"
                    ? "Coba ubah kata kunci pencarian atau reset filter."
                    : "Silakan buat periode KPI baru dengan klik tombol + Tambah Periode KPI di atas."}
                </p>
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* Modal Dialog */}
      <PeriodModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        action={createAction}
      />
    </div>
  );
}

function PeriodTableRow({
  period: p,
  setStatusAction,
  deleteAction,
}: {
  period: KpiPeriod;
  setStatusAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [status, setStatus] = useState(p.status);
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleStatusChange = (newStatus: "DRAFT" | "ACTIVE" | "CLOSED") => {
    setStatus(newStatus);
    const fd = new FormData();
    fd.append("id", String(p.id));
    fd.append("status", newStatus);

    startStatusTransition(async () => {
      try {
        await setStatusAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Status Diperbarui",
          text: `Periode "${p.name}" sekarang berstatus ${newStatus}.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        setStatus(p.status);
        const msg = err instanceof Error ? err.message : "Gagal mengubah status.";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  const handleDelete = async () => {
    const confirm = await Swal.fire({
      title: "Hapus Periode KPI?",
      text: `Periode "${p.name}" akan dihapus. Data penilaian yang terikat mungkin akan terpengaruh.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(p.id));

    startDeleteTransition(async () => {
      try {
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Periode Dihapus",
          text: `Periode "${p.name}" berhasil dihapus.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus periode.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <tr className="hover:bg-slate-50/80 transition">
      <td className={`${td} font-bold text-slate-900`}>
        <div className="flex items-center gap-2">
          <span>{p.name}</span>
        </div>
      </td>
      <td className={td}>
        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
          {p.year}
        </span>
      </td>
      <td className={`${td} text-xs text-slate-600`}>
        {p.startDate} s/d {p.endDate}
      </td>
      <td className={`${td} text-xs font-medium text-slate-700`}>{p.evaluationDate}</td>
      <td className={`${td} text-xs`}>
        <span className="text-slate-700">
          Bulan <b>{p.inputStartMonth}</b> – <b>{p.cutoffMonth}</b>
        </span>
      </td>
      <td className={`${td} text-xs font-semibold text-slate-700`}>
        {p.minTenureMonths} bulan
      </td>
      <td className={td}>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </td>
      <td className={`${td} text-right`}>
        <div className="flex items-center justify-end gap-2">
          {/* Status selector */}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as "DRAFT" | "ACTIVE" | "CLOSED")}
            disabled={isUpdatingStatus || isDeleting}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="DRAFT">DRAFT</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isUpdatingStatus}
            className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer disabled:opacity-30"
            title="Hapus periode KPI"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// =========================================================================
// 2. DEPARTMENT TABLE CLIENT (FULL-WIDTH + MODAL + SEARCH)
// =========================================================================

interface DepartmentTableClientProps {
  departments: Department[];
  employees: Employee[];
  departmentHeads?: DepartmentHead[];
  mappings?: DepartmentMappingWithDetails[];
  pits?: Pit[];
  sites?: { id: number; code: string; name: string }[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  createAction: (fd: FormData) => Promise<void>;
  updateAction?: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  batchDeleteAction?: (ids: number[]) => Promise<{ count: number; skipped?: number; errors?: string[] }>;
  importAction?: (items: { code: string; name: string }[]) => Promise<{ count: number }>;
  smartImportAction?: (payload: SmartDepartmentImportPayload) => Promise<SmartDepartmentImportResult>;
  onManageHeadDept?: (departmentId: number) => void;
  onSelectDepartment?: (dept: Department) => void;
  onSwitchToMappingTab?: () => void;
  createMappingAction?: (fd: FormData) => Promise<{ success: boolean; id: number; error?: string }>;
  updateMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
  deleteMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}

export function DepartmentTableClient({
  departments,
  employees,
  departmentHeads = [],
  mappings = [],
  pits = [],
  sites = [],
  operatingUnits = [],
  createAction,
  updateAction,
  deleteAction,
  batchDeleteAction,
  importAction,
  smartImportAction,
  onManageHeadDept,
  onSelectDepartment,
  onSwitchToMappingTab,
  createMappingAction,
  updateMappingAction,
  deleteMappingAction,
}: DepartmentTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [, startDeleteTransition] = useTransition();

  // Detail modal state (Detail Departemen & Mapping)
  const [selectedDeptForDetail, setSelectedDeptForDetail] = useState<Department | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleOpenDetail = (dept: Department) => {
    setSelectedDeptForDetail(dept);
    setIsDetailModalOpen(true);
  };

  // Employee modal state
  const [selectedDeptForEmployees, setSelectedDeptForEmployees] = useState<Department | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  const handleViewEmployees = (dept: Department) => {
    setSelectedDeptForEmployees(dept);
    setIsEmployeeModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingDepartment(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDepartment(dept);
    setIsModalOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDepartments.length && filteredDepartments.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDepartments.map((d) => d.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSingle = async (d: Department, empCount: number) => {
    if (empCount > 0) {
      void Swal.fire({
        icon: "warning",
        title: "Tidak Dapat Dihapus",
        text: `Departemen "${d.name}" masih memiliki ${empCount} karyawan terdaftar. Pindahkan atau hapus karyawan terlebih dahulu.`,
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Hapus Departemen?",
      text: `Departemen "${d.name}" (${d.code}) akan dihapus permanen.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startDeleteTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(d.id));
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Departemen Dihapus",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus departemen.";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  const handleBatchDelete = async () => {
    setIsActionsOpen(false);
    if (selectedIds.length === 0) return;

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Departemen?`,
      text: "Departemen terpilih yang tidak memiliki karyawan akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startDeleteTransition(async () => {
      try {
        if (batchDeleteAction) {
          const res = await batchDeleteAction(selectedIds);
          setSelectedIds([]);
          if (res.errors && res.errors.length > 0) {
            await Swal.fire({
              icon: "warning",
              title: "Penghapusan Sebagian",
              text: `${res.count} departemen berhasil dihapus. ${res.errors.join(", ")}`,
              confirmButtonColor: "#f59e0b",
            });
          } else if (res.skipped && res.skipped > 0) {
            await Swal.fire({
              icon: "info",
              title: "Sebagian Dilewati",
              text: `${res.count} departemen dihapus. ${res.skipped} departemen dilewati karena masih memiliki karyawan terdaftar atau template.`,
              confirmButtonColor: "#3b82f6",
            });
          } else {
            await Swal.fire({
              icon: "success",
              title: "Departemen Dihapus",
              text: `${res.count} departemen berhasil dihapus.`,
              timer: 1500,
              showConfirmButton: false,
            });
          }
        } else {
          for (const id of selectedIds) {
            const fd = new FormData();
            fd.append("id", String(id));
            await deleteAction(fd);
          }
          setSelectedIds([]);
          await Swal.fire({
            icon: "success",
            title: "Departemen Dihapus",
            timer: 1500,
            showConfirmButton: false,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  // Filter departments based on search
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return departments;
    return departments.filter(
      (d) => d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
    );
  }, [departments, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode atau nama departemen..."
              className="w-full rounded-lg border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
              >
                <span>Batch ({selectedIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const toExport = selectedIds.length > 0
                  ? departments.filter((d) => selectedIds.includes(d.id))
                  : filteredDepartments;
                exportDepartmentsToExcel(toExport);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Export data departemen ke file Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Import data departemen dari file Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                <span>••• Actions</span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsActionsOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-30 space-y-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus Terpilih ({selectedIds.length})</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-95 transition cursor-pointer whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              + Tambah Departemen
            </button>
          </div>
        </div>

        {/* Counter Info saat pencarian */}
        {searchQuery && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>
              Menampilkan <b>{filteredDepartments.length}</b> dari {departments.length} departemen
            </span>
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-slate-700 font-bold hover:underline cursor-pointer"
            >
              Reset Pencarian
            </button>
          </div>
        )}
      </div>

      {/* Full-width Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <Table
          head={
            <tr>
              <th className="w-10 px-3 py-2.5 text-center bg-slate-50/80 border-b border-slate-200">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredDepartments.length && filteredDepartments.length > 0}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                  aria-label="Pilih semua departemen"
                />
              </th>
              <th className="w-24 px-3 py-2.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-slate-50/80 border-b border-slate-200 whitespace-nowrap">
                Kode
              </th>
              <th className="w-5/12 px-4 py-2.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-slate-50/80 border-b border-slate-200">
                Nama Departemen
              </th>
              <th className="w-1/4 px-4 py-2.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-slate-50/80 border-b border-slate-200 whitespace-nowrap">
                Total Karyawan
              </th>
              <th className="px-4 py-2.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right bg-slate-50/80 border-b border-slate-200 whitespace-nowrap">
                Aksi
              </th>
            </tr>
          }
        >
          {filteredDepartments.map((d) => {
            // Hitung total karyawan berdasarkan karyawan terhubung langsung maupun via mapping
            const deptMappings = mappings.filter((m) => m.departmentId === d.id);
            const empCount = employees.filter((e) => {
              if (e.isActive === false) return false;
              if (e.departmentId === d.id) return true;
              if (e.originalDepartment) {
                return deptMappings.some(
                  (m) =>
                    (m.site === "ALL" || matchesSite(m.site, e.operatingUnit)) &&
                    matchesDeptName(m.cleanRawName, e.originalDepartment)
                );
              }
              return false;
            }).length;

            const isSelected = selectedIds.includes(d.id);

            return (
              <tr key={d.id} className={`hover:bg-slate-50/80 transition ${isSelected ? "bg-slate-50" : ""}`}>
                <td className="w-10 px-3 py-2.5 text-center border-b border-slate-100">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(d.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                    aria-label={`Pilih departemen ${d.name}`}
                  />
                </td>
                <td className="w-24 px-3 py-2.5 font-mono text-xs font-bold text-slate-900 border-b border-slate-100 whitespace-nowrap">
                  <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold border border-slate-200/80 text-slate-800">
                    {d.code}
                  </span>
                </td>
                <td className="w-5/12 px-4 py-2.5 text-xs font-semibold text-slate-900 border-b border-slate-100 truncate" title={d.name}>
                  {d.name}
                </td>
                <td className="w-1/4 px-4 py-2.5 text-xs border-b border-slate-100 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleViewEmployees(d)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition cursor-pointer group"
                    title={`Lihat daftar ${empCount} karyawan ${d.name}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${empCount > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <span className="font-bold text-slate-900">{empCount}</span>
                    <span className="text-slate-500 text-[11px]">Karyawan</span>
                    <span className="text-[10px] text-slate-400 group-hover:translate-x-0.5 transition-transform">→</span>
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right border-b border-slate-100 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Tombol Edit */}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(d)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
                      title="Edit Departemen"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>

                    {empCount === 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(d, empCount)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Hapus departemen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredDepartments.length === 0 && (
            <tr>
              <td colSpan={5} className="p-12 text-center text-slate-500">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-700">Tidak ada departemen ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery
                    ? "Coba ubah kata kunci pencarian departemen."
                    : "Silakan tambahkan departemen baru dengan klik tombol + Tambah Departemen di atas."}
                </p>
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* Modal Dialog Add/Edit Departemen */}
      <DepartmentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDepartment(null);
        }}
        createAction={createAction}
        updateAction={updateAction}
        initialDepartment={editingDepartment}
      />

      {/* Modal Detail Departemen & Daftar Mapping Nama Asli (Poin 3, 4, 5, 6, 7) */}
      {isDetailModalOpen && selectedDeptForDetail && (
        <DepartmentDetailModal
          isOpen={isDetailModalOpen}
          department={selectedDeptForDetail}
          departments={departments}
          mappings={mappings}
          employees={employees}
          sites={sites}
          pits={pits}
          operatingUnits={operatingUnits}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedDeptForDetail(null);
          }}
          onEditDepartment={(dept) => {
            setIsDetailModalOpen(false);
            handleOpenEdit(dept);
          }}
          createMappingAction={createMappingAction}
          updateMappingAction={updateMappingAction}
          deleteMappingAction={deleteMappingAction}
        />
      )}

      {/* Modal View Daftar Karyawan Departemen */}
      <DepartmentEmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setSelectedDeptForEmployees(null);
        }}
        department={selectedDeptForEmployees}
        employees={employees}
        mappings={mappings}
      />

      {/* Modal Import Master Departemen */}
      <DepartmentImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingDepartments={departments}
        onImportAction={async (payload) => {
          if (importAction) {
            const res = await importAction(payload.departmentsToCreate);
            return {
              success: true,
              createdDepartmentsCount: res.count,
              savedMappingsCount: 0,
              skippedDuplicatesCount: payload.skippedCount || 0,
              errors: [],
            };
          }
          if (smartImportAction) {
            return await smartImportAction(payload);
          }
          return {
            success: false,
            createdDepartmentsCount: 0,
            savedMappingsCount: 0,
            skippedDuplicatesCount: 0,
            errors: ["Aksi import belum disediakan."],
          };
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

// =========================================================================
// 3. JOB LEVEL TABLE CLIENT (FULL-WIDTH + MODAL + SEARCH)
// =========================================================================

interface JobLevelTableClientProps {
  jobLevels: JobLevel[];
  employees: Employee[];
  departments?: Department[];
  createAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  importAction?: (items: { code: string; name: string; rank?: number }[]) => Promise<{ count: number }>;
}

export function JobLevelTableClient({
  jobLevels,
  employees,
  departments = [],
  createAction,
  deleteAction,
  importAction,
}: JobLevelTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [, startDeleteTransition] = useTransition();

  // Employee modal state
  const [selectedLevelForEmployees, setSelectedLevelForEmployees] = useState<JobLevel | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  const handleViewEmployees = (lvl: JobLevel) => {
    setSelectedLevelForEmployees(lvl);
    setIsEmployeeModalOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredLevels.length && filteredLevels.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLevels.map((l) => l.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchDelete = async () => {
    setIsActionsOpen(false);
    if (selectedIds.length === 0) return;

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Job Level?`,
      text: "Job Level terpilih yang tidak memiliki karyawan akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startDeleteTransition(async () => {
      try {
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await deleteAction(fd);
        }
        setSelectedIds([]);
        await Swal.fire({
          icon: "success",
          title: "Job Level Dihapus",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  const handleDeleteSingle = async (level: JobLevel, empCount: number) => {
    if (empCount > 0) {
      await Swal.fire({
        icon: "warning",
        title: "Tidak Dapat Dihapus",
        text: `Job Level "${level.name}" masih memiliki ${empCount} karyawan.`,
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Hapus Job Level?",
      text: `Job Level "${level.name}" (${level.code}) Rank ${level.rank} akan dihapus permanen.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startDeleteTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(level.id));
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Job Level Dihapus",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
        });
      }
    });
  };

  // Filter job levels based on search
  const filteredLevels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return jobLevels;
    return jobLevels.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        String(l.rank).includes(q)
    );
  }, [jobLevels, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode, nama level, atau rank..."
              className="w-full rounded-lg border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
              >
                <span>Batch ({selectedIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const toExport = selectedIds.length > 0
                  ? jobLevels.filter((l) => selectedIds.includes(l.id))
                  : filteredLevels;
                exportJobLevelsToExcel(toExport);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Export data job level ke file Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Import data job level dari file Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                <span>••• Actions</span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsActionsOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-30 space-y-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        const toExport = selectedIds.length > 0
                          ? jobLevels.filter((l) => selectedIds.includes(l.id))
                          : filteredLevels;
                        exportJobLevelsToExcel(toExport);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export Excel ({selectedIds.length > 0 ? `${selectedIds.length} Terpilih` : "Semua"})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        setIsImportModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>Import Excel (.xlsx)</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus Terpilih ({selectedIds.length})</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-95 transition cursor-pointer whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              + Tambah Job Level
            </button>
          </div>
        </div>

        {/* Counter Info */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Menampilkan <b>{filteredLevels.length}</b> dari {jobLevels.length} master job level
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-slate-700 font-bold hover:underline cursor-pointer"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      </div>

      {/* Full-width Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table
          head={
            <tr>
              <th className="w-10 px-3.5 py-3 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredLevels.length && filteredLevels.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                />
              </th>
              <th className={th}>Kode Level</th>
              <th className={th}>Nama Job Level</th>
              <th className={th}>Total Karyawan</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          }
        >
          {filteredLevels.map((l) => {
            const empCount = employees.filter((e) => e.jobLevelId === l.id && e.isActive !== false).length;
            const isSelected = selectedIds.includes(l.id);

            return (
              <tr key={l.id} className={`hover:bg-slate-50 transition ${isSelected ? "bg-slate-50" : ""}`}>
                <td className="w-10 px-3.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(l.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                  />
                </td>
                <td className={`${td} font-mono font-bold text-slate-900`}>
                  <span className="bg-slate-50 px-2 py-0.5 rounded text-xs border border-slate-200 text-slate-700">
                    {l.code}
                  </span>
                </td>
                <td className={`${td} font-semibold text-slate-900`}>
                  <div>{l.name}</div>
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => handleViewEmployees(l)}
                    className="text-xs text-slate-700 font-semibold hover:text-slate-900 hover:underline cursor-pointer"
                    title={`Klik untuk melihat daftar karyawan pada level ${l.name}`}
                  >
                    {empCount} Karyawan
                  </button>
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewEmployees(l)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                    >
                      Lihat Karyawan
                    </button>
                    {empCount === 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(l, empCount)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Hapus Job Level"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredLevels.length === 0 && (
            <tr>
              <td colSpan={5} className="p-12 text-center text-slate-500">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-700">Tidak ada job level ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery
                    ? "Coba ubah kata kunci pencarian job level."
                    : "Silakan tambahkan job level baru dengan klik tombol + Tambah Job Level di atas."}
                </p>
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* Modal Dialog Add Job Level */}
      <JobLevelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        action={createAction}
      />

      {/* Modal View Daftar Karyawan */}
      <JobLevelEmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setSelectedLevelForEmployees(null);
        }}
        jobLevel={selectedLevelForEmployees}
        employees={employees}
        departments={departments}
      />

      {/* Modal Import Excel Job Level */}
      <MasterImportModal<{ code: string; name: string }>
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Master Job Level"
        entityName="Job Level"
        fieldNames={["code", "name"]}
        columns={[
          { key: "code", label: "Kode" },
          { key: "name", label: "Nama Level" },
        ]}
        onDownloadTemplate={() => downloadJobLevelTemplate()}
        onParseFile={parseJobLevelExcelFile}
        validateItem={(item) => {
          if (!item.code) return { isValid: false, error: "Kode wajib diisi" };
          if (!item.name) return { isValid: false, error: "Nama level wajib diisi" };
          return { isValid: true };
        }}
        onImport={async (items) => {
          if (importAction) {
            await importAction(items);
          }
          router.refresh();
        }}
      />
    </div>
  );
}

function JobLevelTableRow({
  level: l,
  empCount,
  deleteAction,
}: {
  level: JobLevel;
  empCount: number;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = async () => {
    const confirm = await Swal.fire({
      title: "Hapus Job Level?",
      text: `Job Level "${l.name}" (${l.code}) Rank ${l.rank} akan dihapus permanen.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(l.id));

    startDeleteTransition(async () => {
      try {
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Job Level Dihapus",
          text: `Job Level "${l.name}" berhasil dihapus.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus job level.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <tr className="hover:bg-slate-50 transition">
      <td className={td}>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-800 font-extrabold text-xs border border-slate-200">
          {l.rank}
        </span>
      </td>
      <td className={`${td} font-mono font-bold text-slate-900`}>
        <span className="bg-slate-50 px-2 py-0.5 rounded text-xs border border-slate-200 text-slate-700">
          {l.code}
        </span>
      </td>
      <td className={`${td} font-semibold text-slate-900`}>{l.name}</td>
      <td className={td}>
        <span className="text-xs text-slate-600 font-medium">
          {empCount} Karyawan
        </span>
      </td>
      <td className={`${td} text-right`}>
        <button
          type="button"
          onClick={handleDelete}
          disabled={empCount > 0 || isDeleting}
          className={`p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer ${
            empCount > 0 ? "opacity-30 cursor-not-allowed hover:text-slate-400" : ""
          }`}
          title={
            empCount > 0
              ? "Tidak dapat dihapus karena masih ada karyawan pada level ini"
              : "Hapus job level"
          }
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// =========================================================================
// 4. APPROVAL HIERARCHY TABLE CLIENT (JOB LEVEL BASED - MULTIPLE APPRAISERS)
// =========================================================================

interface ApprovalTableClientProps {
  employees: Employee[];
  departments: Department[];
  jobLevels?: JobLevel[];
  updateHierarchyAction?: (fd: FormData) => Promise<void>;
  createHierarchyAction?: (fd: FormData) => Promise<void>;
}

interface HierarchyRule {
  id: number;
  levelName: string;
  code: string;
  appraiser1?: string | null;
  appraiser2?: string | null;
  appraiserLevel: string;
  status: "Active" | "Inactive";
}

/** Helper untuk memecah string penilai tersimpan menjadi array penilai */
function parseAppraisers(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "" || raw === "-") return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  if (raw.includes(",")) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [raw.trim()];
}

export function ApprovalTableClient({
  employees,
  departments,
  jobLevels = [],
  updateHierarchyAction,
  createHierarchyAction,
}: ApprovalTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [, startTransition] = useTransition();

  // Sinkronkan data langsung dari DB Job Level karyawan
  const [hierarchyRules, setHierarchyRules] = useState<HierarchyRule[]>(() => {
    if (jobLevels && jobLevels.length > 0) {
      return jobLevels.map((jl) => {
        const parsed = parseAppraisers(jl.appraiserLevel);
        const appr1 = (jl as unknown as { appraiser1?: string }).appraiser1 ?? parsed[0] ?? "";
        const appr2 = (jl as unknown as { appraiser2?: string }).appraiser2 ?? parsed[1] ?? "";
        return {
          id: jl.id,
          levelName: jl.name,
          code: jl.code,
          appraiser1: appr1,
          appraiser2: appr2,
          appraiserLevel: jl.appraiserLevel || "-",
          status: (jl.hierarchyStatus as "Active" | "Inactive") || "Active",
        };
      });
    }
    return [];
  });

  // Pantau sinkronisasi otomatis bila jobLevels dari DB diperbarui
  React.useEffect(() => {
    if (jobLevels && jobLevels.length > 0) {
      setHierarchyRules(
        jobLevels.map((jl) => {
          const parsed = parseAppraisers(jl.appraiserLevel);
          const appr1 = (jl as unknown as { appraiser1?: string }).appraiser1 ?? parsed[0] ?? "";
          const appr2 = (jl as unknown as { appraiser2?: string }).appraiser2 ?? parsed[1] ?? "";
          return {
            id: jl.id,
            levelName: jl.name,
            code: jl.code,
            appraiser1: appr1,
            appraiser2: appr2,
            appraiserLevel: jl.appraiserLevel || "-",
            status: (jl.hierarchyStatus as "Active" | "Inactive") || "Active",
          };
        })
      );
    }
  }, [jobLevels]);

  // Opsi nama Job Level dari Master Data Job Level
  const availableJobLevelOptions = useMemo(() => {
    const names = jobLevels.map((jl) => jl.name).filter(Boolean);
    const standardLevels = ["Non Staff", "Staff", "Supervisor", "Superintendent", "Manager", "Head Department"];
    return Array.from(new Set([...names, ...standardLevels]));
  }, [jobLevels]);

  // Opsi penilai langsung mengambil dari nama seluruh Job Level di DB + level manajemen
  const availableAppraiserOptions = useMemo(() => {
    const dbJobLevelNames = jobLevels.map((jl) => jl.name).filter(Boolean);
    const managementOptions = [
      "Staff",
      "Supervisor",
      "Superintendent",
      "Manager",
      "Head Department / General Manager",
      "Director / Executive",
    ];
    return Array.from(new Set([...dbJobLevelNames, ...managementOptions]));
  }, [jobLevels]);

  // Summary Metrics
  const totalJobLevels = hierarchyRules.length;
  const totalActiveRules = hierarchyRules.filter(
    (r) => r.status === "Active" && (r.appraiser1 || parseAppraisers(r.appraiserLevel).length > 0)
  ).length;
  const totalUnconfiguredRules = hierarchyRules.filter(
    (r) => (!r.appraiser1 && parseAppraisers(r.appraiserLevel).length === 0) || r.status === "Inactive"
  ).length;

  // Filter Data
  const filteredRules = hierarchyRules.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    const appraiserList = parseAppraisers(r.appraiserLevel);
    const matchesSearch =
      !q ||
      r.levelName.toLowerCase().includes(q) ||
      (r.appraiser1 && r.appraiser1.toLowerCase().includes(q)) ||
      (r.appraiser2 && r.appraiser2.toLowerCase().includes(q)) ||
      appraiserList.some((a) => a.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === "ALL" || r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Modal State untuk Tambah Hirarki Baru
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createLevelName, setCreateLevelName] = useState("");
  const [createAppr1, setCreateAppr1] = useState("");
  const [createAppr2, setCreateAppr2] = useState("");
  const [createStatus, setCreateStatus] = useState<"Active" | "Inactive">("Active");

  const handleOpenCreate = () => {
    setCreateLevelName(availableJobLevelOptions[0] || "");
    setCreateAppr1(availableAppraiserOptions[0] || "");
    setCreateAppr2("");
    setCreateStatus("Active");
    setIsCreateModalOpen(true);
  };

  const handleCloseCreate = () => {
    setIsCreateModalOpen(false);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createLevelName) {
      Swal.fire({ icon: "warning", title: "Pilih Job Level", text: "Silakan pilih Job Level terlebih dahulu." });
      return;
    }

    const p1 = createAppr1.trim();
    const p2 = createAppr2.trim();
    const list = [p1, p2].filter(Boolean);
    const combinedStr = list.join(", ") || "-";

    const newRule: HierarchyRule = {
      id: Date.now(),
      levelName: createLevelName,
      code: `JL${Date.now().toString().slice(-4)}`,
      appraiser1: p1,
      appraiser2: p2,
      appraiserLevel: combinedStr,
      status: createStatus,
    };

    setHierarchyRules((prev) => [newRule, ...prev]);
    setIsCreateModalOpen(false);

    if (createHierarchyAction) {
      const fd = new FormData();
      fd.append("name", createLevelName);
      fd.append("appraiser1", p1);
      fd.append("appraiser2", p2);
      fd.append("hierarchyStatus", createStatus);

      startTransition(async () => {
        try {
          await createHierarchyAction(fd);
        } catch (err) {
          console.error("Gagal menambahkan hirarki:", err);
        }
      });
    }

    Swal.fire({
      icon: "success",
      title: "Hirarki Berhasil Ditambahkan",
      text: `Aturan hirarki penilai untuk "${createLevelName}" berhasil dibuat.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  // Modal State untuk Edit Hirarki Penilai
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<HierarchyRule | null>(null);
  const [modalLevelName, setModalLevelName] = useState("");
  const [modalAppr1, setModalAppr1] = useState("");
  const [modalAppr2, setModalAppr2] = useState("");
  const [modalStatus, setModalStatus] = useState<"Active" | "Inactive">("Active");

  const handleOpenEdit = (rule: HierarchyRule) => {
    setSelectedRule(rule);
    setModalLevelName(rule.levelName);
    setModalAppr1(rule.appraiser1 || "");
    setModalAppr2(rule.appraiser2 || "");
    setModalStatus(rule.status);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRule(null);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule) return;

    const p1 = modalAppr1.trim();
    const p2 = modalAppr2.trim();
    const list = [p1, p2].filter(Boolean);
    const combinedStr = list.join(", ") || "-";
    const newStatus = modalStatus;
    const newLevelName = modalLevelName;

    // Optimistic UI update
    setHierarchyRules((prev) =>
      prev.map((r) =>
        r.id === selectedRule.id
          ? {
              ...r,
              levelName: newLevelName,
              appraiser1: p1,
              appraiser2: p2,
              appraiserLevel: combinedStr,
              status: newStatus,
            }
          : r
      )
    );

    setIsModalOpen(false);

    if (updateHierarchyAction) {
      const fd = new FormData();
      fd.append("id", String(selectedRule.id));
      fd.append("jobLevelName", newLevelName);
      fd.append("appraiser1", p1);
      fd.append("appraiser2", p2);
      fd.append("appraiserLevel", combinedStr !== "-" ? combinedStr : "");
      fd.append("hierarchyStatus", newStatus);

      startTransition(async () => {
        try {
          await updateHierarchyAction(fd);
        } catch (err) {
          console.error("Gagal menyimpan perubahan hirarki:", err);
        }
      });
    }

    Swal.fire({
      icon: "success",
      title: "Hirarki Penilai Disimpan",
      text: `Hubungan penilai untuk "${newLevelName}" berhasil diperbarui.`,
      timer: 1600,
      showConfirmButton: false,
    });

    setSelectedRule(null);
  };

  // Direct In-Table Job Level Change Handler
  const handleDirectJobLevelChange = (
    ruleId: number,
    newLevelName: string,
    p1: string,
    p2: string,
    currentStatus: "Active" | "Inactive"
  ) => {
    setHierarchyRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              levelName: newLevelName,
            }
          : r
      )
    );

    if (updateHierarchyAction) {
      const fd = new FormData();
      fd.append("id", String(ruleId));
      fd.append("jobLevelName", newLevelName);
      fd.append("appraiser1", p1);
      fd.append("appraiser2", p2);
      fd.append("hierarchyStatus", currentStatus);

      startTransition(async () => {
        try {
          await updateHierarchyAction(fd);
        } catch (err) {
          console.error("Gagal memperbarui job level:", err);
        }
      });
    }

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: "success",
      title: `Job Level diubah ke "${newLevelName}"`,
    });
  };

  // Direct In-Table Dropdown Appraiser Change Handler
  const handleDirectAppraiserChange = (
    ruleId: number,
    newP1: string,
    newP2: string,
    currentStatus: "Active" | "Inactive",
    levelName: string
  ) => {
    const p1 = newP1.trim();
    const p2 = newP2.trim();
    const list = [p1, p2].filter(Boolean);
    const combinedStr = list.join(", ") || "-";

    // Optimistic UI update
    setHierarchyRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              appraiser1: p1,
              appraiser2: p2,
              appraiserLevel: combinedStr,
            }
          : r
      )
    );

    if (updateHierarchyAction) {
      const fd = new FormData();
      fd.append("id", String(ruleId));
      fd.append("appraiser1", p1);
      fd.append("appraiser2", p2);
      fd.append("appraiserLevel", combinedStr !== "-" ? combinedStr : "");
      fd.append("hierarchyStatus", currentStatus);

      startTransition(async () => {
        try {
          await updateHierarchyAction(fd);
        } catch (err) {
          console.error("Gagal menyimpan perubahan penilai langsung:", err);
        }
      });
    }

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: "success",
      title: `Penilai "${levelName}" diperbarui`,
    });
  };

  const handleToggleStatus = (rule: HierarchyRule) => {
    const nextStatus: "Active" | "Inactive" = rule.status === "Active" ? "Inactive" : "Active";

    setHierarchyRules((prev) =>
      prev.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              status: nextStatus,
            }
          : r
      )
    );

    if (updateHierarchyAction) {
      const fd = new FormData();
      fd.append("id", String(rule.id));
      fd.append("appraiserLevel", rule.appraiserLevel !== "-" ? rule.appraiserLevel : "");
      fd.append("hierarchyStatus", nextStatus);

      startTransition(async () => {
        try {
          await updateHierarchyAction(fd);
        } catch (err) {
          console.error("Gagal memperbarui status:", err);
        }
      });
    }

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1200,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: "info",
      title: `Status "${rule.levelName}" menjadi ${nextStatus}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Summary Cards (3 Cards) - Compact & Clean */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Card 1: Total Job Level */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:shadow-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Job Level
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">{totalJobLevels}</span>
              <span className="text-[11px] font-medium text-slate-500">Tingkat Jabatan</span>
            </div>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>

        {/* Card 2: Total Aturan Aktif */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:shadow-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Aturan Aktif
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">{totalActiveRules}</span>
              <span className="text-[11px] font-semibold text-emerald-600">Berjalan Normal</span>
            </div>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Total Aturan Belum Diatur */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:shadow-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Belum Diatur
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">{totalUnconfiguredRules}</span>
              <span className="text-[11px] font-medium text-slate-500">Perlu Konfigurasi</span>
            </div>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar (Search & Filter Status) - Compact */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari Job Level atau Penilai..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 transition focus:border-slate-800 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-status" className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
              Status:
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Tombol Tambah Hirarki */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <svg className="h-3.5 w-3.5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Tambah Hirarki</span>
          </button>
        </div>
      </div>

      {/* 3. Main Table - 4 Kolom dengan Dropdown Job Level, Penilai 1 & 2 Bersih, Status & Edit */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <Table
          head={
            <tr>
              <th className="px-4 py-2.5 font-bold text-slate-500 text-[10px] tracking-wider uppercase bg-slate-50/90 border-b border-slate-200">
                JOB LEVEL KARYAWAN
              </th>
              <th className="px-4 py-2.5 font-bold text-slate-500 text-[10px] tracking-wider uppercase bg-slate-50/90 border-b border-slate-200">
                PENILAI LANGSUNG
              </th>
              <th className="px-4 py-2.5 font-bold text-slate-500 text-[10px] tracking-wider uppercase bg-slate-50/90 border-b border-slate-200">
                STATUS
              </th>
              <th className="px-4 py-2.5 font-bold text-slate-500 text-[10px] tracking-wider uppercase bg-slate-50/90 border-b border-slate-200 text-right pr-5">
                AKSI
              </th>
            </tr>
          }
        >
          {filteredRules.map((rule) => {
            const currentAppr1 = rule.appraiser1 || parseAppraisers(rule.appraiserLevel)[0] || "";
            const currentAppr2 = rule.appraiser2 || parseAppraisers(rule.appraiserLevel)[1] || "";

            return (
              <tr key={rule.id} className="hover:bg-slate-50/60 transition">
                {/* Kolom 1: Job Level Karyawan (Dropdown Select) */}
                <td className="px-4 py-2.5 align-middle text-slate-700 text-xs border-b border-slate-100">
                  <div className="relative inline-flex items-center">
                    <select
                      value={rule.levelName}
                      onChange={(e) =>
                        handleDirectJobLevelChange(
                          rule.id,
                          e.target.value,
                          currentAppr1,
                          currentAppr2,
                          rule.status
                        )
                      }
                      className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer min-w-[140px]"
                    >
                      {availableJobLevelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-2 flex items-center text-slate-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </td>

                {/* Kolom 2: Penilai Langsung - Clean White Background Dropdowns (Murni Teks Tanpa Badge P1/P2) */}
                <td className="px-4 py-2.5 align-middle text-slate-700 text-xs border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Dropdown Penilai 1 */}
                    <div className="relative inline-flex items-center">
                      <select
                        value={currentAppr1}
                        onChange={(e) =>
                          handleDirectAppraiserChange(
                            rule.id,
                            e.target.value,
                            currentAppr2,
                            rule.status,
                            rule.levelName
                          )
                        }
                        className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer min-w-[170px]"
                      >
                        <option value="">-- Pilih Penilai 1 --</option>
                        {availableAppraiserOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2 flex items-center text-slate-400">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Dropdown Penilai 2 */}
                    <div className="relative inline-flex items-center">
                      <select
                        value={currentAppr2}
                        onChange={(e) =>
                          handleDirectAppraiserChange(
                            rule.id,
                            currentAppr1,
                            e.target.value,
                            rule.status,
                            rule.levelName
                          )
                        }
                        className={`appearance-none rounded-lg border bg-white py-1.5 pl-3 pr-7 text-xs font-semibold shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer min-w-[170px] ${
                          currentAppr2
                            ? "border-slate-200 text-slate-800"
                            : "border-dashed border-slate-300 text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        <option value="">-- Tanpa Penilai 2 (Opsional) --</option>
                        {availableAppraiserOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2 flex items-center text-slate-400">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Kolom 3: Status (Clean & Compact Pill - Clickable Toggle) */}
                <td className="px-4 py-2.5 align-middle text-slate-700 text-xs border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(rule)}
                    title="Klik untuk ubah status"
                    className="cursor-pointer transition-transform active:scale-95"
                  >
                    {rule.status === "Active" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60 shadow-2xs hover:bg-emerald-100/70 transition">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200/80"></span>
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200 shadow-2xs hover:bg-slate-200/70 transition">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 ring-2 ring-slate-200"></span>
                        <span>Inactive</span>
                      </span>
                    )}
                  </button>
                </td>

                {/* Kolom 4: Aksi (Clean & Refined Edit Button) */}
                <td className="px-4 py-2.5 align-middle text-slate-700 text-xs border-b border-slate-100 text-right pr-5">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(rule)}
                    className="p-1.5 text-slate-400 hover:text-sky-600 transition cursor-pointer"
                    title="Edit Rule"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}

          {filteredRules.length === 0 && (
            <tr>
              <td colSpan={4} className="p-8 text-center text-slate-500">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-800 text-xs">Tidak ada aturan ditemukan</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {searchQuery || statusFilter !== "ALL"
                    ? "Coba sesuaikan kata kunci pencarian atau filter status."
                    : "Belum ada konfigurasi hirarki penilai."}
                </p>
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* 4. Modal Tambah Hirarki Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tambah Hirarki Penilai</h3>
                <p className="text-[11px] text-slate-400">
                  Tentukan hubungan Job Level dengan atasan penilai langsung.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCreate} className="p-5 space-y-3.5">
              {/* Field 1: Job Level Karyawan Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Job Level Karyawan
                </label>
                <select
                  value={createLevelName}
                  onChange={(e) => setCreateLevelName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  {availableJobLevelOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 2: Penilai 1 Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Penilai 1 (Utama)
                </label>
                <select
                  value={createAppr1}
                  onChange={(e) => setCreateAppr1(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="">-- Pilih Penilai 1 --</option>
                  {availableAppraiserOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 3: Penilai 2 Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Penilai 2 (Pendamping - Opsional)
                </label>
                <select
                  value={createAppr2}
                  onChange={(e) => setCreateAppr2(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="">-- Tanpa Penilai 2 (Opsional) --</option>
                  {availableAppraiserOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 4: Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value as "Active" | "Inactive")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-2xs cursor-pointer"
                >
                  Simpan Hirarki
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Edit Hirarki Penilai */}
      {isModalOpen && selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Hirarki Penilai</h3>
                <p className="text-[11px] text-slate-400">
                  Atur atasan penilai langsung untuk level jabatan ini.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModal} className="p-5 space-y-3.5">
              {/* Field 1: Job Level Karyawan Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Job Level Karyawan
                </label>
                <select
                  value={modalLevelName}
                  onChange={(e) => setModalLevelName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  {availableJobLevelOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 2: Penilai 1 (Utama) Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Penilai 1 (Utama)
                </label>
                <select
                  value={modalAppr1}
                  onChange={(e) => setModalAppr1(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="">-- Pilih Penilai 1 (Utama) --</option>
                  {availableAppraiserOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 3: Penilai 2 (Pendamping) Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Penilai 2 (Pendamping - Opsional)
                </label>
                <select
                  value={modalAppr2}
                  onChange={(e) => setModalAppr2(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="">-- Tanpa Penilai 2 (Opsional) --</option>
                  {availableAppraiserOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 4: Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as "Active" | "Inactive")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-slate-800 focus:outline-none transition cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-2xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// =========================================================================
// 5. OPERATING UNITS CLIENT (CLEAN MODAL + TOOLBAR + TABLE)
// =========================================================================

interface OperatingUnitTableClientProps {
  employees: Employee[];
  departments: Department[];
  initialUnits?: { id: string; name: string; status: string }[];
  saveUnitsAction?: (units: { id: string; name: string; status?: string }[]) => Promise<{ count: number }>;
}

export function OperatingUnitTableClient({
  employees,
  departments,
  initialUnits,
  saveUnitsAction,
}: OperatingUnitTableClientProps) {
  const router = useRouter();
  // Master Operating Units List State with dynamic discovery from employees
  const [units, setUnits] = useState(() => {
    if (initialUnits && initialUnits.length > 0) {
      return initialUnits;
    }
    const base = [
      { id: "ou-akp", name: "AKP", status: "Active" },
      { id: "ou-gam", name: "GAM", status: "Active" },
      { id: "ou-ho", name: "HO", status: "Active" },
    ];
    const existing = new Set(base.map((b) => b.name.toUpperCase()));
    employees.forEach((e) => {
      const ou = (e.operatingUnit || "").trim().toUpperCase();
      if (ou && !existing.has(ou)) {
        existing.add(ou);
        base.push({
          id: `ou-${ou.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: ou,
          status: "Active",
        });
      }
    });
    return base;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<{ id: string; name: string } | null>(null);
  const [viewingUnitEmployees, setViewingUnitEmployees] = useState<{ id: string; name: string } | null>(null);


  const toggleSelectAll = () => {
    if (selectedIds.length === filteredUnits.length && filteredUnits.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredUnits.map((u) => u.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSaveUnit = (name: string, editingId?: string | null) => {
    let updated: { id: string; name: string; status: string }[];
    if (editingId) {
      updated = units.map((u) => (u.id === editingId ? { ...u, name } : u));
      setUnits(updated);
      void Swal.fire({
        icon: "success",
        title: "Operating Unit Diperbarui",
        text: `Unit ${name} berhasil disimpan.`,
        timer: 1500,
        showConfirmButton: false,
      });
    } else {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const newUnit = {
        id: `ou-${slug}-${Date.now().toString().slice(-4)}`,
        name,
        status: "Active",
      };
      updated = [...units, newUnit];
      setUnits(updated);
      void Swal.fire({
        icon: "success",
        title: "Operating Unit Ditambahkan",
        text: `Unit ${name} berhasil ditambahkan ke master.`,
        timer: 1500,
        showConfirmButton: false,
      });
    }
    if (saveUnitsAction) {
      void saveUnitsAction(updated);
    }
    setEditingUnit(null);
  };

  const handleOpenAdd = () => {
    setEditingUnit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (unit: { id: string; name: string }) => {
    setEditingUnit(unit);
    setIsModalOpen(true);
  };

  const handleDeleteSingle = async (unit: { id: string; name: string }, empCount: number) => {
    if (empCount > 0) {
      void Swal.fire({
        icon: "warning",
        title: "Tidak Dapat Dihapus",
        text: `Unit "${unit.name}" masih digunakan oleh ${empCount} karyawan.`,
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Hapus Operating Unit?",
      text: `Unit "${unit.name}" akan dihapus dari sistem.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const updated = units.filter((u) => u.id !== unit.id);
    setUnits(updated);
    setSelectedIds((prev) => prev.filter((i) => i !== unit.id));
    if (saveUnitsAction) {
      void saveUnitsAction(updated);
    }
    void Swal.fire({
      icon: "success",
      title: "Unit Dihapus",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const handleBatchDelete = async () => {
    setIsActionsOpen(false);
    if (selectedIds.length === 0) return;

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Operating Unit?`,
      text: "Unit terpilih yang tidak digunakan karyawan akan dihapus.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const updated = units.filter((u) => !selectedIds.includes(u.id));
    setUnits(updated);
    setSelectedIds([]);
    if (saveUnitsAction) {
      void saveUnitsAction(updated);
    }
    void Swal.fire({
      icon: "success",
      title: "Unit Dihapus",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const filteredUnits = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return units;
    return units.filter((u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
  }, [units, searchQuery]);

  return (
    <div className="space-y-4">
      {/* ACTION TOOLBAR */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama operating unit..."
              className="w-full rounded-lg border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Actions toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
              >
                <span>Batch ({selectedIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const toExport = selectedIds.length > 0
                  ? units.filter((u) => selectedIds.includes(u.id))
                  : filteredUnits;
                exportOperatingUnitsToExcel(toExport);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Export data operating unit ke file Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Import data operating unit dari file Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                <span>••• Actions</span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isActionsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsActionsOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-30 space-y-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        const toExport = selectedIds.length > 0
                          ? units.filter((u) => selectedIds.includes(u.id))
                          : filteredUnits;
                        exportOperatingUnitsToExcel(toExport);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export Excel ({selectedIds.length > 0 ? `${selectedIds.length} Terpilih` : "Semua"})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsOpen(false);
                        setIsImportModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>Import Excel (.xlsx)</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={selectedIds.length === 0}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus Terpilih ({selectedIds.length})</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-95 transition cursor-pointer whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              + Tambah Site
            </button>
          </div>
        </div>

        {/* Counter Info */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Menampilkan <b>{filteredUnits.length}</b> dari {units.length} site
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-slate-700 font-bold hover:underline cursor-pointer"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      </div>

      {/* FULL-WIDTH TABLE CARD */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table
          head={
            <tr>
              <th className="w-10 px-3.5 py-3 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredUnits.length && filteredUnits.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                />
              </th>
              <th className={th}>Kode / ID Site</th>
              <th className={th}>Nama Site</th>
              <th className={th}>Total Karyawan</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          }
        >
          {filteredUnits.map((u) => {
            const isSelected = selectedIds.includes(u.id);
            const empCount = employees.filter(
              (e) => e.isActive !== false && (e.operatingUnit || "HO").toUpperCase() === u.name.toUpperCase()
            ).length;

            return (
              <tr key={u.id} className={`hover:bg-slate-50 transition ${isSelected ? "bg-slate-50" : ""}`}>
                <td className="w-10 px-3.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(u.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                  />
                </td>
                <td className={`${td} font-mono text-slate-600 text-xs`}>
                  <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    {u.id}
                  </span>
                </td>
                <td className={`${td} font-bold text-slate-900 text-sm`}>
                  {u.name}
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => setViewingUnitEmployees(u)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                    title="Klik untuk melihat daftar karyawan"
                  >
                    <span>{empCount} Karyawan</span>
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </td>
                <td className={td}>
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {u.status}
                  </span>
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingUnitEmployees(u)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                    >
                      Lihat Karyawan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                    >
                      Edit
                    </button>
                    {empCount === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(u, empCount)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Hapus Unit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Digunakan</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredUnits.length === 0 && (
            <tr>
              <td colSpan={6} className="p-12 text-center text-slate-500 text-xs">
                Tidak ada operating unit ditemukan.
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* OPERATING UNIT MODAL */}
      <OperatingUnitModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingUnit(null);
        }}
        onSave={handleSaveUnit}
        initialUnit={editingUnit}
      />

      {/* EMPLOYEE LIST MODAL FOR OPERATING UNIT */}
      <OperatingUnitEmployeeModal
        isOpen={Boolean(viewingUnitEmployees)}
        onClose={() => setViewingUnitEmployees(null)}
        unit={viewingUnitEmployees}
        employees={employees}
        departments={departments}
      />

      {/* Modal Import Excel Operating Unit */}
      <MasterImportModal<{ id: string; name: string }>
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Master Operating Unit"
        entityName="Operating Unit"
        fieldNames={["id", "name"]}
        columns={[
          { key: "id", label: "ID / Kode Unit" },
          { key: "name", label: "Nama Operating Unit" },
        ]}
        onDownloadTemplate={() => downloadOperatingUnitTemplate()}
        onParseFile={parseOperatingUnitExcelFile}
        validateItem={(item) => {
          if (!item.name) return { isValid: false, error: "Nama operating unit wajib diisi" };
          return { isValid: true };
        }}
        onImport={async (items) => {
          const existingNames = new Set(units.map((u) => u.name.toUpperCase()));
          const newUnits = [...units];
          for (const item of items) {
            const upName = item.name.toUpperCase();
            if (!existingNames.has(upName)) {
              existingNames.add(upName);
              newUnits.push({
                id: item.id || `ou-${item.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
                name: upName,
                status: "Active",
              });
            }
          }
          setUnits(newUnits);
          if (saveUnitsAction) {
            await saveUnitsAction(newUnits);
          }
          router.refresh();
        }}
      />
    </div>
  );
}

// =========================================================================
// 5. JOB POSITION (JABATAN) TABLE CLIENT (FULL-WIDTH + MODAL + SEARCH + FILTER)
// =========================================================================

interface JobPositionTableClientProps {
  jobPositions: JobPosition[];
  departments: Department[];
  jobLevels: JobLevel[];
  employees: Employee[];
  createAction: (fd: FormData) => Promise<void>;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  importAction?: (items: { code?: string; name: string; departmentCode?: string; jobLevelCode?: string; description?: string }[]) => Promise<{ count: number }>;
}

export function JobPositionTableClient({
  jobPositions,
  departments,
  jobLevels,
  employees,
  createAction,
  updateAction,
  deleteAction,
  importAction,
}: JobPositionTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);
  const [viewingPositionEmployees, setViewingPositionEmployees] = useState<JobPosition | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<"code" | "name" | "department" | "jobLevel" | "employees">("code");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const PAGE_SIZE = 15;
  const [, startTransition] = useTransition();

  const handleSort = (field: "code" | "name" | "department" | "jobLevel" | "employees") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Reset pagination when search query or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDeptId, selectedLevelId, sortField, sortOrder]);

  // Mapping department ID to name
  const deptMap = useMemo(() => {
    return new Map(departments.map((d) => [d.id, d]));
  }, [departments]);

  // Mapping job level ID to level
  const levelMap = useMemo(() => {
    return new Map(jobLevels.map((l) => [l.id, l]));
  }, [jobLevels]);

  // Employee count per position ID or name (Active only)
  const empCountByPos = useMemo(() => {
    const counts = new Map<number, number>();
    for (const emp of employees) {
      if (emp.isActive === false) continue;
      if (emp.jobPositionId) {
        counts.set(emp.jobPositionId, (counts.get(emp.jobPositionId) || 0) + 1);
      } else if (emp.jobPosition) {
        // Fallback matching by name
        const matched = jobPositions.find(
          (p) => p.name.toLowerCase().trim() === emp.jobPosition.toLowerCase().trim()
        );
        if (matched) {
          counts.set(matched.id, (counts.get(matched.id) || 0) + 1);
        }
      }
    }
    return counts;
  }, [employees, jobPositions]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = jobPositions.filter((pos) => {
      // 1. Dept Filter
      if (selectedDeptId !== "ALL" && String(pos.departmentId) !== selectedDeptId) {
        return false;
      }

      // 2. Job Level Filter
      if (selectedLevelId !== "ALL" && String(pos.jobLevelId) !== selectedLevelId) {
        return false;
      }

      // 3. Search Query
      if (q) {
        const matchName = pos.name.toLowerCase().includes(q);
        const matchCode = (pos.code || "").toLowerCase().includes(q);
        const dept = pos.departmentId ? deptMap.get(pos.departmentId) : null;
        const matchDept = dept ? dept.name.toLowerCase().includes(q) || dept.code.toLowerCase().includes(q) : false;
        const lvl = pos.jobLevelId ? levelMap.get(pos.jobLevelId) : null;
        const matchLvl = lvl ? lvl.name.toLowerCase().includes(q) || lvl.code.toLowerCase().includes(q) : false;
        const matchDesc = (pos.description || "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDept && !matchLvl && !matchDesc) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "code") {
        const codeA = a.code || "";
        const codeB = b.code || "";
        cmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: "base" });
      } else if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortField === "department") {
        const deptA = a.departmentId ? deptMap.get(a.departmentId)?.name || "" : "";
        const deptB = b.departmentId ? deptMap.get(b.departmentId)?.name || "" : "";
        cmp = deptA.localeCompare(deptB, undefined, { sensitivity: "base" });
      } else if (sortField === "jobLevel") {
        const lvlA = a.jobLevelId ? levelMap.get(a.jobLevelId)?.name || "" : "";
        const lvlB = b.jobLevelId ? levelMap.get(b.jobLevelId)?.name || "" : "";
        cmp = lvlA.localeCompare(lvlB, undefined, { sensitivity: "base" });
      } else if (sortField === "employees") {
        const countA = empCountByPos.get(a.id) || 0;
        const countB = empCountByPos.get(b.id) || 0;
        cmp = countA - countB;
      }

      if (cmp === 0) {
        cmp = (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: "base" });
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [jobPositions, searchQuery, selectedDeptId, selectedLevelId, deptMap, levelMap, sortField, sortOrder, empCountByPos]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredPositions.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPositions = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredPositions.slice(start, start + PAGE_SIZE);
  }, [filteredPositions, safeCurrentPage]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPositions.length && filteredPositions.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPositions.map((p) => p.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleOpenAdd = () => {
    setEditingPosition(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pos: JobPosition) => {
    setEditingPosition(pos);
    setIsModalOpen(true);
  };

  const handleDeleteSingle = async (pos: JobPosition, empCount: number) => {
    if (empCount > 0) {
      void Swal.fire({
        icon: "warning",
        title: "Jabatan Sedang Digunakan",
        text: `Jabatan "${pos.name}" saat ini masih digunakan oleh ${empCount} karyawan. Pindahkan jabatan karyawan terlebih dahulu sebelum menghapus master ini.`,
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Hapus Master Jabatan?",
      text: `Jabatan "${pos.name}" (${pos.code || "Tanpa Kode"}) akan dihapus dari daftar master data.`,
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
        fd.append("id", String(pos.id));
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Jabatan Dihapus",
          text: `Jabatan "${pos.name}" berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus jabatan.";
        await Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#e11d48" });
      }
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    // Check if any selected position has employees
    const usedPositions = selectedIds
      .map((id) => {
        const pos = jobPositions.find((p) => p.id === id);
        const count = empCountByPos.get(id) || 0;
        return { pos, count };
      })
      .filter((item) => item.count > 0);

    if (usedPositions.length > 0) {
      const names = usedPositions.map((u) => `• ${u.pos?.name} (${u.count} karyawan)`).join("\n");
      void Swal.fire({
        icon: "warning",
        title: "Beberapa Jabatan Masih Digunakan",
        text: `Sebanyak ${usedPositions.length} jabatan terpilih masih aktif digunakan oleh karyawan:\n\n${names}`,
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: `Hapus ${selectedIds.length} Jabatan Terpilih?`,
      text: "Seluruh jabatan terpilih yang tidak memiliki karyawan akan dihapus.",
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
        for (const id of selectedIds) {
          const fd = new FormData();
          fd.append("id", String(id));
          await deleteAction(fd);
        }
        setSelectedIds([]);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Dihapus",
          text: `${selectedIds.length} jabatan berhasil dihapus.`,
          timer: 1600,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus batch.";
        await Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#e11d48" });
      }
    });
  };

  const handleExportExcel = () => {
    const exportData = filteredPositions.map((pos) => {
      const dept = pos.departmentId ? deptMap.get(pos.departmentId) : null;
      const lvl = pos.jobLevelId ? levelMap.get(pos.jobLevelId) : null;
      return {
        code: pos.code,
        name: pos.name,
        departmentName: dept ? `${dept.name} (${dept.code})` : "-",
        jobLevelName: lvl ? `${lvl.name} (${lvl.code})` : "-",
        description: pos.description,
      };
    });
    exportJobPositionsToExcel(exportData);
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama job position, kode, departemen, job level..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Controls: Filters & Actions */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Filter Departemen */}
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 focus:border-slate-800 focus:outline-none transition cursor-pointer"
            >
              <option value="ALL">Semua Departemen ({departments.length})</option>
              {departments.map((d) => {
                const count = jobPositions.filter((p) => p.departmentId === d.id).length;
                return (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} ({count})
                  </option>
                );
              })}
            </select>

            {/* Filter Job Level */}
            <select
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 focus:border-slate-800 focus:outline-none transition cursor-pointer"
            >
              <option value="ALL">Semua Level ({jobLevels.length})</option>
              {jobLevels.map((l) => {
                const count = jobPositions.filter((p) => p.jobLevelId === l.id).length;
                return (
                  <option key={l.id} value={String(l.id)}>
                    {l.name} ({count})
                  </option>
                );
              })}
            </select>

            {/* Batch Delete */}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Terpilih ({selectedIds.length})</span>
              </button>
            )}

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Export Master Job Position ke Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            {/* Import Excel */}
            {importAction && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-bold shadow-2xs transition cursor-pointer"
                title="Import Master Job Position dari Excel"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Import Excel</span>
              </button>
            )}

            {/* + Tambah Job Position */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            >
              <span>+ Tambah Job Position</span>
            </button>
          </div>
        </div>

        {/* Counter & Page Info */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Menampilkan <b>{filteredPositions.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1} - {Math.min(safeCurrentPage * PAGE_SIZE, filteredPositions.length)}</b> dari <b>{filteredPositions.length}</b> jabatan master (Total: {jobPositions.length})
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] font-bold text-slate-700 hover:underline cursor-pointer"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <Table
          head={
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <th className={`${th} w-10 text-center`}>
                <input
                  type="checkbox"
                  checked={
                    filteredPositions.length > 0 &&
                    selectedIds.length === filteredPositions.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                />
              </th>
              <th
                onClick={() => handleSort("code")}
                className={`${th} w-28 cursor-pointer select-none hover:bg-slate-100 transition`}
                title="Urutkan berdasarkan Kode"
              >
                <div className="flex items-center gap-1.5">
                  <span>Kode</span>
                  {sortField === "code" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-slate-900" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("name")}
                className={`${th} cursor-pointer select-none hover:bg-slate-100 transition`}
                title="Urutkan berdasarkan Nama Job Position"
              >
                <div className="flex items-center gap-1.5">
                  <span>Nama Job Position</span>
                  {sortField === "name" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-slate-900" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("department")}
                className={`${th} cursor-pointer select-none hover:bg-slate-100 transition`}
                title="Urutkan berdasarkan Departemen"
              >
                <div className="flex items-center gap-1.5">
                  <span>Departemen</span>
                  {sortField === "department" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-slate-900" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("jobLevel")}
                className={`${th} cursor-pointer select-none hover:bg-slate-100 transition`}
                title="Urutkan berdasarkan Job Level"
              >
                <div className="flex items-center gap-1.5">
                  <span>Job Level</span>
                  {sortField === "jobLevel" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-slate-900" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("employees")}
                className={`${th} w-36 text-center cursor-pointer select-none hover:bg-slate-100 transition`}
                title="Urutkan berdasarkan Jumlah Karyawan"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>Karyawan Terkait</span>
                  {sortField === "employees" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-slate-900" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                  )}
                </div>
              </th>
              <th className={`${th} w-24 text-center`}>Status</th>
              <th className={`${th} w-28 text-right`}>Aksi</th>
            </tr>
          }
        >
          {paginatedPositions.map((pos) => {
            const dept = pos.departmentId ? deptMap.get(pos.departmentId) : null;
            const lvl = pos.jobLevelId ? levelMap.get(pos.jobLevelId) : null;
            const empCount = empCountByPos.get(pos.id) || 0;
            const isSelected = selectedIds.includes(pos.id);

            return (
              <tr
                key={pos.id}
                className={`hover:bg-slate-50/80 transition ${
                  isSelected ? "bg-slate-50/90 font-medium" : ""
                }`}
              >
                <td className={`${td} text-center`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(pos.id)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                </td>
                <td className={`${td} font-mono font-bold text-slate-700`}>
                  {pos.code ? (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                      {pos.code}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">-</span>
                  )}
                </td>
                <td className={td}>
                  <span className="font-bold text-slate-900">{pos.name}</span>
                </td>
                <td className={td}>
                  {dept ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                      <span>{dept.name}</span>
                      <span className="text-slate-400 text-[10px]">({dept.code})</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">-</span>
                  )}
                </td>
                <td className={td}>
                  {lvl ? (
                    <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200/80">
                      {lvl.name}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">-</span>
                  )}
                </td>
                <td className={`${td} text-center`}>
                  {empCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setViewingPositionEmployees(pos)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 hover:scale-105 transition cursor-pointer shadow-2xs group"
                      title="Klik untuk melihat daftar karyawan dengan jabatan ini"
                    >
                      <Users className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
                      <span>{empCount} Orang</span>
                      <span className="text-[10px] text-emerald-500 opacity-70 group-hover:opacity-100">↗</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-400">
                      0 Orang
                    </span>
                  )}
                </td>
                <td className={`${td} text-center`}>
                  <Badge tone={pos.isActive !== false ? "green" : "slate"}>
                    {pos.isActive !== false ? "Aktif" : "Nonaktif"}
                  </Badge>
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(pos)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                      title="Edit Job Position"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingle(pos, empCount)}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                      title="Hapus Job Position"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredPositions.length === 0 && (
            <tr>
              <td colSpan={8} className="p-12 text-center text-slate-500 text-xs">
                <div className="flex flex-col items-center justify-center gap-2">
                  <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="font-semibold text-slate-700">Tidak ada job position ditemukan</p>
                  <p className="text-slate-400 text-[11px]">
                    {searchQuery
                      ? `Tidak ada data yang sesuai dengan pencarian "${searchQuery}"`
                      : "Klik tombol + Tambah Job Position untuk menambahkan master data baru."}
                  </p>
                </div>
              </td>
            </tr>
          )}
        </Table>

        {/* PAGINATION BAR (15 items per page) */}
        {filteredPositions.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/80">
            <div className="text-xs text-slate-600 font-medium">
              Halaman <span className="font-bold text-slate-900">{safeCurrentPage}</span> dari <span className="font-bold text-slate-900">{totalPages}</span> ({filteredPositions.length} total jabatan)
            </div>

            <div className="flex items-center gap-1.5">
              {/* Button Previous */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>

              {/* Numbered Page Buttons */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage <= 3) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safeCurrentPage - 2 + i;
                  }

                  const isActive = pageNum === safeCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Button Next */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah / Edit Job Position */}
      <JobPositionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPosition(null);
        }}
        departments={departments}
        jobLevels={jobLevels}
        createAction={createAction}
        updateAction={updateAction}
        initialPosition={editingPosition}
      />

      {/* Modal View Karyawan Terkait Job Position */}
      <JobPositionEmployeeModal
        isOpen={Boolean(viewingPositionEmployees)}
        onClose={() => setViewingPositionEmployees(null)}
        position={viewingPositionEmployees}
        employees={employees}
        departments={departments}
        jobLevels={jobLevels}
      />

      {/* Modal Import Excel Job Position */}
      {importAction && (
        <MasterImportModal<{ code: string; name: string; departmentCode: string; jobLevelCode: string }>
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import Master Job Position"
          entityName="Job Position"
          fieldNames={["code", "name", "departmentCode", "jobLevelCode"]}
          columns={[
            { key: "code", label: "Kode (Opsional)" },
            { key: "name", label: "Nama Job Position (Wajib)" },
            { key: "departmentCode", label: "Kode Dept (Wajib)" },
            { key: "jobLevelCode", label: "Kode Job Level (Wajib)" },
          ]}
          onDownloadTemplate={() => downloadJobPositionTemplate()}
          onParseFile={parseJobPositionExcelFile}
          validateItem={(item) => {
            if (!item.name || !item.name.trim()) return { isValid: false, error: "Nama job position wajib diisi" };
            return { isValid: true };
          }}
          onImport={async (items) => {
            const res = await importAction(items);
            router.refresh();
            await Swal.fire({
              icon: "success",
              title: "Import Berhasil",
              text: `${res.count} data job position berhasil diimpor ke master data.`,
              timer: 1800,
              timerProgressBar: true,
            });
          }}
        />
      )}
    </div>
  );
}
