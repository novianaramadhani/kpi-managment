"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Department, Employee, DepartmentHead } from "@/db/schema";
import { X, Search, Check, AlertCircle, Building2, MapPin, User, Shield, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

interface AssignHeadDeptModalProps {
  isOpen: boolean;
  onClose: () => void;
  department: Department | null;
  operatingUnit: string;
  existingAssignment: DepartmentHead | null;
  employees: Employee[];
  createAction: (fd: FormData) => Promise<{ success: boolean; id?: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteAction?: (fd: FormData) => Promise<{ success: boolean }>;
}

export function AssignHeadDeptModal({
  isOpen,
  onClose,
  department,
  operatingUnit,
  existingAssignment,
  employees,
  createAction,
  updateAction,
  deleteAction,
}: AssignHeadDeptModalProps) {
  const router = useRouter();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  // Search employee state
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Sync state on open or assignment change
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setSearchQuery("");
      setIsDropdownOpen(false);

      if (existingAssignment) {
        setSelectedEmployeeId(existingAssignment.employeeId);
        setStatus(existingAssignment.status === "Inactive" ? "Inactive" : "Active");
      } else {
        setSelectedEmployeeId(null);
        setStatus("Active");
      }
    }
  }, [isOpen, existingAssignment]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered employees for search
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const activeEmployees = employees.filter((e) => e.isActive !== false);

    if (!q) {
      // Tampilkan daftar default karyawan aktif
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
  }, [employees, searchQuery]);

  // Detail karyawan terpilih
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!department) {
      setErrorMessage("Data Departemen tidak valid.");
      return;
    }
    if (!operatingUnit) {
      setErrorMessage("Operating Unit tidak valid.");
      return;
    }
    if (!selectedEmployeeId) {
      setErrorMessage("Silakan pilih Karyawan sebagai Head Department.");
      return;
    }

    const fd = new FormData();
    if (existingAssignment) {
      fd.append("id", String(existingAssignment.id));
    }
    fd.append("departmentId", String(department.id));
    fd.append("operatingUnit", operatingUnit);
    fd.append("employeeId", String(selectedEmployeeId));
    fd.append("status", status);

    startTransition(async () => {
      try {
        if (existingAssignment) {
          await updateAction(fd);
          await Swal.fire({
            icon: "success",
            title: "Head Department Diperbarui",
            text: `Head Department untuk ${department.name} (${operatingUnit}) berhasil diperbarui.`,
            timer: 1600,
            showConfirmButton: false,
          });
        } else {
          await createAction(fd);
          await Swal.fire({
            icon: "success",
            title: "Head Department Ditugaskan",
            text: `${selectedEmployee?.name || "Karyawan"} berhasil ditugaskan sebagai Head Department ${department.name} (${operatingUnit}).`,
            timer: 1600,
            showConfirmButton: false,
          });
        }
        onClose();
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.";
        setErrorMessage(msg);
      }
    });
  };

  const handleDelete = async () => {
    if (!existingAssignment || !deleteAction) return;

    const confirm = await Swal.fire({
      title: "Hapus Penugasan Head Department?",
      text: `Penugasan untuk ${department?.name || "Departemen"} di unit ${operatingUnit} akan dihapus.`,
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
        fd.append("id", String(existingAssignment.id));
        await deleteAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Penugasan Dihapus",
          text: `Penugasan Head Department untuk ${operatingUnit} telah dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
        onClose();
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus penugasan.";
        setErrorMessage(msg);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-head-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div>
            <h2 id="assign-head-modal-title" className="text-sm font-bold text-slate-900">
              {existingAssignment ? "Edit Head Department" : "Assign Head Department"}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tentukan pejabat Head Department untuk unit operasional ini.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">
                <span className="font-bold">Gagal:</span> {errorMessage}
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
              <span>{department ? `${department.name} (${department.code})` : "Departemen"}</span>
              <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                ID: {department?.id}
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
              <span>{operatingUnit}</span>
            </div>
          </div>

          {/* 3. Field Head Department (Select from Master Employee by NIK/Nama) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 font-bold text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Head Department <span className="text-rose-500">*</span></span>
              <span className="ml-auto text-[10px] text-slate-400 font-normal">Dari Master Employee</span>
            </label>

            {/* Selected Employee Card */}
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
                    setIsDropdownOpen(true);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 ml-2"
                >
                  Ganti
                </button>
              </div>
            ) : (
              /* Searchable Select Dropdown */
              <div className="space-y-1 relative">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Search className="h-3.5 w-3.5" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Ketik NIK atau Nama karyawan untuk memilih..."
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      aria-label="Hapus teks pencarian"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {isDropdownOpen && (
                  <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-lg max-h-48 overflow-y-auto space-y-0.5">
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmployeeId(emp.id);
                            setIsDropdownOpen(false);
                            setSearchQuery("");
                            setErrorMessage("");
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
                        Tidak ada karyawan ditemukan dengan kata kunci "{searchQuery}".
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
                    name="status"
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
                    name="status"
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

          {/* Modal Footer: Simpan dan Batal */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-5">
            {existingAssignment && deleteAction ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                title="Hapus penugasan ini"
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
                onClick={onClose}
                disabled={isPending}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isPending || !selectedEmployeeId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending ? (
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
      </div>
    </div>
  );
}
