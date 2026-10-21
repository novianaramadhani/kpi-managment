"use client";

import React, { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Department, Employee, DepartmentHead } from "@/db/schema";
import {
  exportHeadDepartmentsToExcel,
  downloadHeadDepartmentTemplate,
  parseHeadDepartmentExcelFile,
  type ParsedHeadDepartmentRow,
} from "@/lib/excel-master";
import { MasterImportModal } from "./master-import-modal";
import {
  Search,
  Download,
  Upload,
  Building2,
  CheckCircle2,
  XCircle,
  Pencil,
  Plus,
  X,
  ArrowLeft,
  MapPin,
  User,
  Shield,
  Trash2,
  AlertCircle,
  Check,
} from "lucide-react";
import Swal from "sweetalert2";

interface HeadDepartmentTableClientProps {
  departmentHeads: DepartmentHead[];
  departments: Department[];
  employees: Employee[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  createAction: (fd: FormData) => Promise<{ success: boolean; id?: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteAction: (fd: FormData) => Promise<{ success: boolean }>;
  toggleStatusAction: (id: number, status: string) => Promise<{ success: boolean }>;
  importAction?: (items: ParsedHeadDepartmentRow[]) => Promise<{ count: number }>;
  initialDepartmentFilter?: number | null;
  onSwitchToDepartmentTab?: () => void;
}

export function HeadDepartmentTableClient({
  departmentHeads,
  departments,
  employees,
  operatingUnits,
  createAction,
  updateAction,
  deleteAction,
  toggleStatusAction,
  importAction,
}: HeadDepartmentTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Modal Detail State
  const [selectedDeptForModal, setSelectedDeptForModal] = useState<Department | null>(null);
  const [modalMode, setModalMode] = useState<"table" | "form">("table");

  // Form State inside Modal
  const [activeOU, setActiveOU] = useState<string>("HO");
  const [editingAssignment, setEditingAssignment] = useState<DepartmentHead | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [isSaving, startSavingTransition] = useTransition();

  // Distinct Operating Units list
  const allOUs = useMemo(() => {
    const set = new Set<string>();
    set.add("HO");
    set.add("AKP");
    set.add("GAM");

    if (operatingUnits && operatingUnits.length > 0) {
      operatingUnits
        .filter((u) => u.status !== "Inactive")
        .forEach((u) => set.add(u.name.trim().toUpperCase()));
    }

    departmentHeads.forEach((h) => {
      if (h.operatingUnit) set.add(h.operatingUnit.trim().toUpperCase());
    });

    return Array.from(set);
  }, [operatingUnits, departmentHeads]);

  // Filter departments for main table
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return departments;
    return departments.filter(
      (d) => d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
    );
  }, [departments, searchQuery]);

  // Filtered employees for dropdown search
  const filteredEmployees = useMemo(() => {
    const q = employeeSearchQuery.toLowerCase().trim();
    const activeEmployees = employees.filter((e) => e.isActive !== false);

    if (!q) {
      return activeEmployees.slice(0, 25);
    }

    return activeEmployees
      .filter((e) => {
        const nameMatch = (e.name || "").toLowerCase().includes(q);
        const nikMatch = (e.nik || "").toLowerCase().includes(q);
        const posMatch = (e.jobPosition || "").toLowerCase().includes(q);
        return nameMatch || nikMatch || posMatch;
      })
      .slice(0, 30);
  }, [employees, employeeSearchQuery]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedDeptForModal) {
        if (modalMode === "form") {
          setModalMode("table");
        } else {
          setSelectedDeptForModal(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDeptForModal, modalMode]);

  const handleOpenDetailModal = (dept: Department) => {
    setSelectedDeptForModal(dept);
    setModalMode("table");
    setFormErrorMessage("");
  };

  const handleCloseModal = () => {
    setSelectedDeptForModal(null);
    setModalMode("table");
    setEditingAssignment(null);
    setSelectedEmployeeId(null);
    setFormErrorMessage("");
  };

  const handleOpenAssign = (ou: string) => {
    setActiveOU(ou);
    setEditingAssignment(null);
    setSelectedEmployeeId(null);
    setStatus("Active");
    setEmployeeSearchQuery("");
    setIsEmployeeDropdownOpen(false);
    setFormErrorMessage("");
    setModalMode("form");
  };

  const handleOpenEdit = (ou: string, assignment: DepartmentHead) => {
    setActiveOU(ou);
    setEditingAssignment(assignment);
    setSelectedEmployeeId(assignment.employeeId);
    setStatus(assignment.status === "Inactive" ? "Inactive" : "Active");
    setEmployeeSearchQuery("");
    setIsEmployeeDropdownOpen(false);
    setFormErrorMessage("");
    setModalMode("form");
  };

  const handleToggleStatus = (assignment: DepartmentHead, currentOU: string) => {
    const nextStatus = assignment.status === "Active" ? "Inactive" : "Active";

    startTransition(async () => {
      try {
        await toggleStatusAction(assignment.id, nextStatus);
        const Toast = Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 1400,
          timerProgressBar: true,
        });
        Toast.fire({
          icon: "success",
          title: `Status unit ${currentOU} diubah ke ${nextStatus === "Active" ? "Aktif" : "Non-Aktif"}`,
        });
      } catch (err: unknown) {
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

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorMessage("");

    if (!selectedDeptForModal) {
      setFormErrorMessage("Data Departemen tidak valid.");
      return;
    }
    if (!activeOU) {
      setFormErrorMessage("Operating Unit tidak valid.");
      return;
    }
    if (!selectedEmployeeId) {
      setFormErrorMessage("Silakan pilih Karyawan sebagai Head Department.");
      return;
    }

    const fd = new FormData();
    if (editingAssignment) {
      fd.append("id", String(editingAssignment.id));
    }
    fd.append("departmentId", String(selectedDeptForModal.id));
    fd.append("operatingUnit", activeOU);
    fd.append("employeeId", String(selectedEmployeeId));
    fd.append("status", status);

    startSavingTransition(async () => {
      try {
        if (editingAssignment) {
          await updateAction(fd);
          const Toast = Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true,
          });
          Toast.fire({
            icon: "success",
            title: `Head Department ${selectedDeptForModal.name} (${activeOU}) berhasil diperbarui`,
          });
        } else {
          await createAction(fd);
          const Toast = Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true,
          });
          Toast.fire({
            icon: "success",
            title: `Head Department ${selectedDeptForModal.name} (${activeOU}) berhasil ditugaskan`,
          });
        }
        setModalMode("table");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.";
        setFormErrorMessage(msg);
      }
    });
  };

  const handleDeleteAssignment = async () => {
    if (!editingAssignment) return;

    const confirm = await Swal.fire({
      title: "Hapus Penugasan Head Department?",
      text: `Penugasan untuk ${selectedDeptForModal?.name || "Departemen"} di unit ${activeOU} akan dihapus.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startSavingTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(editingAssignment.id));
        await deleteAction(fd);
        const Toast = Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 1400,
          timerProgressBar: true,
        });
        Toast.fire({
          icon: "success",
          title: `Penugasan unit ${activeOU} telah dihapus`,
        });
        setModalMode("table");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus penugasan.";
        setFormErrorMessage(msg);
      }
    });
  };

  const handleExport = () => {
    const deptMap = new Map<number, Department>();
    departments.forEach((d) => deptMap.set(d.id, d));

    const empMap = new Map<number, Employee>();
    employees.forEach((e) => empMap.set(e.id, e));

    const dataToExport = departmentHeads.map((h) => {
      const d = deptMap.get(h.departmentId);
      const e = empMap.get(h.employeeId);
      return {
        deptCode: d?.code || "",
        deptName: d?.name || `ID ${h.departmentId}`,
        operatingUnit: h.operatingUnit,
        nik: e?.nik || "",
        name: e?.name || `ID ${h.employeeId}`,
        jobPosition: e?.jobPosition || "",
        status: h.status,
      };
    });

    exportHeadDepartmentsToExcel(dataToExport);
  };

  return (
    <div className="space-y-4">
      {/* 1. Main Toolbar (Search & Export) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        {/* Search bar */}
        <div className="relative flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <Search className="h-3.5 w-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode atau nama departemen..."
            className="w-full rounded-lg border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
              aria-label="Hapus pencarian"
            >
              ✕
            </button>
          )}
        </div>

        {/* Actions: Reset, Import, Export */}
        <div className="flex items-center gap-2">
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-slate-700 font-semibold hover:underline cursor-pointer px-1 py-1"
            >
              Reset
            </button>
          )}
          {importAction && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              title="Import data penugasan Head Department dari file Excel"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import Head Dept</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
            title="Export data penugasan Head Department ke file Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Head Dept</span>
          </button>
        </div>
      </div>

      {/* 2. Main Clean Table: Kode | Department | Lihat Head Dept */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="w-24 px-3 py-2.5 whitespace-nowrap">Kode</th>
                <th className="w-5/12 px-4 py-2.5">Department</th>
                <th className="w-1/4 px-4 py-2.5 whitespace-nowrap">Lihat Head Dept</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredDepartments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition">
                  <td className="w-24 px-3 py-2.5 font-mono text-xs font-bold text-slate-900 border-b border-slate-100 whitespace-nowrap">
                    <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold border border-slate-200/80 text-slate-800">
                      {d.code}
                    </span>
                  </td>
                  <td className="w-5/12 px-4 py-2.5 text-xs font-semibold text-slate-900 border-b border-slate-100 truncate" title={d.name}>
                    {d.name}
                  </td>
                  <td className="w-1/4 px-4 py-2.5 border-b border-slate-100 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleOpenDetailModal(d)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs transition cursor-pointer group"
                    >
                      <span>Lihat →</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 border-b border-slate-100"></td>
                </tr>
              ))}

              {filteredDepartments.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3 shadow-2xs">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <p className="font-bold text-slate-800 text-sm">Tidak ada departemen ditemukan</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {searchQuery
                        ? "Coba ubah kata kunci pencarian departemen."
                        : "Data departemen belum tersedia di sistem."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Modal Detail Department (Operating Unit | Head Department | Status | Aksi) */}
      {selectedDeptForModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dept-head-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
              {modalMode === "table" ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs shrink-0">
                    {selectedDeptForModal.code}
                  </span>
                  <div className="min-w-0">
                    <h2 id="dept-head-modal-title" className="text-sm font-bold text-slate-900 truncate">
                      Head Department · {selectedDeptForModal.name}
                    </h2>
                    <p className="text-[11px] text-slate-500 truncate">
                      Daftar pejabat Head Department per Operating Unit (OU).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setModalMode("table")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Daftar Site</span>
                  </button>
                  <div className="min-w-0">
                    <h2 id="dept-head-modal-title" className="text-sm font-bold text-slate-900 truncate">
                      {editingAssignment ? "Edit Head Department" : "Assign Head Department"}
                    </h2>
                    <p className="text-[11px] text-slate-500 truncate">
                      {selectedDeptForModal.name} · Unit {activeOU}
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleCloseModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer shrink-0 ml-2"
                aria-label="Tutup modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            {modalMode === "table" ? (
              /* VIEW MODE: Tabel Operating Unit | Head Department | Status | Aksi */
              <div className="overflow-y-auto p-4 sm:p-5">
                <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          <th className="w-32 px-3 py-2 whitespace-nowrap">Site</th>
                          <th className="w-full min-w-[180px] px-3 py-2">Head Department</th>
                          <th className="w-24 px-3 py-2 text-center whitespace-nowrap">Status</th>
                          <th className="w-24 px-3 py-2 text-right whitespace-nowrap">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {allOUs.map((ou) => {
                          const assignment = departmentHeads.find(
                            (h) =>
                              h.departmentId === selectedDeptForModal.id &&
                              h.operatingUnit.trim().toUpperCase() === ou.toUpperCase()
                          );
                          const hasHead = !!assignment;
                          const isActive = assignment?.status === "Active";
                          const emp = hasHead
                            ? employees.find((e) => e.id === assignment.employeeId) || null
                            : null;

                          return (
                            <tr key={ou} className="hover:bg-slate-50/70 transition">
                              {/* 1. Operating Unit */}
                              <td className="w-32 px-3 py-2 whitespace-nowrap align-middle">
                                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      hasHead
                                        ? ou === "HO"
                                          ? "bg-blue-600"
                                          : ou === "AKP"
                                          ? "bg-emerald-600"
                                          : "bg-amber-600"
                                        : "bg-slate-300"
                                    }`}
                                  />
                                  <span>{ou}</span>
                                </span>
                              </td>

                              {/* 2. Head Department */}
                              <td className="w-full min-w-[180px] px-3 py-2 align-middle">
                                {hasHead ? (
                                  emp ? (
                                    <div className="space-y-0.5">
                                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                        <span>{emp.name}</span>
                                        {emp.nik && (
                                          <span className="font-mono text-[10px] text-slate-600 bg-slate-100 border border-slate-200/80 px-1.5 py-0.2 rounded font-semibold">
                                            {emp.nik}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        {emp.jobPosition || "Jabatan belum ditentukan"}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span className="font-semibold text-slate-800 text-xs">
                                        Karyawan ID #{assignment.employeeId}
                                      </span>
                                      <div className="text-[11px] text-slate-400 italic">
                                        Data karyawan tidak ditemukan
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-slate-400 italic text-xs">
                                    Belum ditentukan
                                  </span>
                                )}
                              </td>

                              {/* 3. Status */}
                              <td className="w-24 px-3 py-2 text-center whitespace-nowrap align-middle">
                                {hasHead && assignment ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(assignment, ou)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-bold border transition cursor-pointer shadow-2xs ${
                                      isActive
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                                    }`}
                                    title="Klik untuk mengubah status aktif atau non-aktif"
                                  >
                                    {isActive ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Aktif</span>
                                      </>
                                    ) : (
                                      <>
                                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Non-Aktif</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-slate-400 font-mono text-xs font-semibold">-</span>
                                )}
                              </td>

                              {/* 4. Aksi (Edit / Assign) */}
                              <td className="w-24 px-3 py-2 text-right whitespace-nowrap align-middle">
                                {hasHead && assignment ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(ou, assignment)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 text-xs font-semibold shadow-2xs transition cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3 text-slate-500" />
                                    <span>Edit</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssign(ou)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-800 px-2.5 py-1 text-xs font-semibold shadow-2xs transition cursor-pointer group"
                                  >
                                    <Plus className="w-3 h-3 text-slate-500 group-hover:text-white" />
                                    <span>Assign</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Modal Info */}
                <div className="flex items-center justify-end mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              /* FORM MODE: Tambah / Edit Head Department */
              <form onSubmit={handleSubmitForm} className="overflow-y-auto p-5 space-y-4 text-xs">
                {formErrorMessage && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <div className="flex-1 text-[11px] leading-relaxed">
                      <span className="font-bold">Gagal:</span> {formErrorMessage}
                    </div>
                  </div>
                )}

                {/* 1. Field Department (Read-Only) */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Department</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-normal">Read-only</span>
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>{selectedDeptForModal.name} ({selectedDeptForModal.code})</span>
                    <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                      ID: {selectedDeptForModal.id}
                    </span>
                  </div>
                </div>

                {/* 2. Field Operating Unit (Read-Only) */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Site</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-normal">Read-only</span>
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-700" />
                    <span>{activeOU}</span>
                  </div>
                </div>

                {/* 3. Field Head Department (Select from Master Employee) */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Head Department <span className="text-rose-500">*</span></span>
                    <span className="ml-auto text-[10px] text-slate-400 font-normal">Dari Master Employee</span>
                  </label>

                  {selectedEmployee ? (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-xs">
                          {selectedEmployee.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs truncate">{selectedEmployee.name}</span>
                            <span className="font-mono text-[10px] bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                              {selectedEmployee.nik}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {selectedEmployee.jobPosition || "Jabatan tidak diset"} · Unit: {selectedEmployee.operatingUnit || "HO"}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployeeId(null);
                          setIsEmployeeDropdownOpen(true);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 ml-2"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1 relative">
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <Search className="h-3.5 w-3.5" />
                        </div>
                        <input
                          type="text"
                          value={employeeSearchQuery}
                          onChange={(e) => {
                            setEmployeeSearchQuery(e.target.value);
                            setIsEmployeeDropdownOpen(true);
                          }}
                          onFocus={() => setIsEmployeeDropdownOpen(true)}
                          placeholder="Ketik NIK atau Nama karyawan untuk memilih..."
                          className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
                        />
                        {employeeSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setEmployeeSearchQuery("")}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                            aria-label="Hapus teks pencarian"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {isEmployeeDropdownOpen && (
                        <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-lg max-h-48 overflow-y-auto space-y-0.5">
                          {filteredEmployees.length > 0 ? (
                            filteredEmployees.map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEmployeeId(emp.id);
                                  setIsEmployeeDropdownOpen(false);
                                  setEmployeeSearchQuery("");
                                  setFormErrorMessage("");
                                }}
                                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 transition cursor-pointer group"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-900 text-xs truncate">{emp.name}</span>
                                    <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1 py-0.2 rounded font-bold">
                                      {emp.nik}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {emp.jobPosition || "Karyawan"} · Unit: {emp.operatingUnit || "HO"}
                                  </div>
                                </div>
                                <span className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-900 transition shrink-0 ml-2">
                                  Pilih
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="p-3 text-center text-slate-400 text-[11px]">
                              Tidak ada karyawan ditemukan dengan kata kunci "{employeeSearchQuery}".
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Field Status */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>Status</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex items-center justify-between rounded-xl border p-2.5 cursor-pointer transition ${
                        status === "Active"
                          ? "border-slate-900 bg-slate-50 font-bold text-slate-900 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="form-status"
                          value="Active"
                          checked={status === "Active"}
                          onChange={() => setStatus("Active")}
                          className="h-3.5 w-3.5 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                        <span>Aktif</span>
                      </div>
                      {status === "Active" && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </label>

                    <label
                      className={`flex items-center justify-between rounded-xl border p-2.5 cursor-pointer transition ${
                        status === "Inactive"
                          ? "border-slate-900 bg-slate-50 font-bold text-slate-900 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="form-status"
                          value="Inactive"
                          checked={status === "Inactive"}
                          onChange={() => setStatus("Inactive")}
                          className="h-3.5 w-3.5 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                        <span>Non-Aktif</span>
                      </div>
                      {status === "Inactive" && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </label>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-5">
                  {editingAssignment ? (
                    <button
                      type="button"
                      onClick={handleDeleteAssignment}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Penugasan</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalMode("table")}
                      disabled={isSaving}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !selectedEmployeeId}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                    >
                      {isSaving ? (
                        <>
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <span>Simpan</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Modal Import Excel Head Department */}
      {importAction && (
        <MasterImportModal<ParsedHeadDepartmentRow>
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import Penugasan Head Department"
          entityName="Head Department"
          fieldNames={["Kode Departemen", "Site", "NIK Head Dept", "Status"]}
          columns={[
            { key: "deptCode", label: "Kode Dept" },
            { key: "deptName", label: "Nama Dept" },
            { key: "operatingUnit", label: "Site" },
            { key: "nik", label: "NIK Head" },
            { key: "employeeName", label: "Nama Karyawan" },
            { key: "status", label: "Status" },
          ]}
          onDownloadTemplate={() => downloadHeadDepartmentTemplate()}
          onParseFile={parseHeadDepartmentExcelFile}
          validateItem={(item) => {
            const rawDeptCode = (item.deptCode || "").trim().toUpperCase();
            const rawDeptName = (item.deptName || "").trim().toLowerCase();
            const dept = departments.find(
              (d) =>
                (rawDeptCode && d.code.toUpperCase() === rawDeptCode) ||
                (rawDeptName && d.name.toLowerCase() === rawDeptName)
            );
            if (!dept) {
              return {
                isValid: false,
                error: rawDeptCode
                  ? `Departemen '${item.deptCode}' tidak terdaftar di sistem`
                  : "Kode Departemen wajib diisi",
              };
            }

            if (!item.operatingUnit || !item.operatingUnit.trim()) {
              return { isValid: false, error: "Operating Unit wajib diisi" };
            }

            const rawNik = (item.nik || "").trim().toLowerCase();
            const rawEmpName = (item.employeeName || "").trim().toLowerCase();
            const emp = employees.find(
              (e) =>
                (rawNik && (e.nik || "").toLowerCase() === rawNik) ||
                (rawEmpName && (e.name || "").toLowerCase() === rawEmpName)
            );
            if (!emp) {
              return {
                isValid: false,
                error: rawNik
                  ? `Karyawan NIK '${item.nik}' tidak ditemukan di sistem`
                  : "NIK / Nama Head Dept wajib diisi",
              };
            }

            return { isValid: true };
          }}
          onImport={async (items) => {
            const res = await importAction(items);
            router.refresh();
            await Swal.fire({
              icon: "success",
              title: "Import Berhasil",
              text: `${res.count} data Head Department berhasil diproses dan disimpan.`,
              timer: 1800,
              timerProgressBar: true,
            });
          }}
        />
      )}
    </div>
  );
}
