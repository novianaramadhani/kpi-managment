"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Department, Employee, DepartmentHead } from "@/db/schema";
import { UserCheck, X, Search, Check, AlertCircle, Building2, MapPin, User, Shield, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

interface HeadDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  employees: Employee[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  initialData?: DepartmentHead | null;
  defaultDepartmentId?: number | null;
  createAction: (fd: FormData) => Promise<{ success: boolean; id?: number }>;
  updateAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteAction?: (fd: FormData) => Promise<{ success: boolean }>;
}

export function HeadDepartmentModal({
  isOpen,
  onClose,
  departments,
  employees,
  operatingUnits,
  initialData,
  defaultDepartmentId,
  createAction,
  updateAction,
  deleteAction,
}: HeadDepartmentModalProps) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState<string>("");
  const [operatingUnit, setOperatingUnit] = useState<string>("HO");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  // Search employee state
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Operating units list
  const ouOptions = useMemo(() => {
    if (operatingUnits && operatingUnits.length > 0) {
      return operatingUnits.map((u) => u.name);
    }
    const base = ["HO", "AKP", "GAM"];
    const fromEmps = new Set<string>();
    employees.forEach((e) => {
      const ou = (e.operatingUnit || "").trim().toUpperCase();
      if (ou && !base.includes(ou)) {
        fromEmps.add(ou);
      }
    });
    return [...base, ...Array.from(fromEmps)];
  }, [operatingUnits, employees]);

  // Sync state when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setEmployeeSearchQuery("");
      setIsEmployeeDropdownOpen(false);

      if (initialData) {
        setDepartmentId(String(initialData.departmentId));
        setOperatingUnit(initialData.operatingUnit || "HO");
        setSelectedEmployeeId(initialData.employeeId);
        setStatus(initialData.status === "Inactive" ? "Inactive" : "Active");
      } else {
        setDepartmentId(defaultDepartmentId ? String(defaultDepartmentId) : departments[0] ? String(departments[0].id) : "");
        setOperatingUnit("HO");
        setSelectedEmployeeId(null);
        setStatus("Active");
      }
    }
  }, [isOpen, initialData, defaultDepartmentId, departments]);

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
    const q = employeeSearchQuery.toLowerCase().trim();
    const activeEmployees = employees.filter((e) => e.isActive !== false);

    if (!q) {
      // Prioritaskan karyawan yang memiliki role HEAD_DEPT atau satu departemen
      return activeEmployees.slice(0, 20);
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

  // Selected employee detail
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  // Selected department detail
  const selectedDepartment = useMemo(() => {
    if (!departmentId) return null;
    return departments.find((d) => String(d.id) === String(departmentId)) || null;
  }, [departments, departmentId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!departmentId) {
      setErrorMessage("Silakan pilih Departemen terlebih dahulu.");
      return;
    }
    if (!selectedEmployeeId) {
      setErrorMessage("Silakan pilih Karyawan sebagai Head Department.");
      return;
    }
    if (!operatingUnit) {
      setErrorMessage("Silakan pilih Operating Unit.");
      return;
    }

    const fd = new FormData();
    if (initialData) {
      fd.append("id", String(initialData.id));
    }
    fd.append("departmentId", departmentId);
    fd.append("employeeId", String(selectedEmployeeId));
    fd.append("operatingUnit", operatingUnit);
    fd.append("status", status);

    startTransition(async () => {
      try {
        if (initialData) {
          await updateAction(fd);
          await Swal.fire({
            icon: "success",
            title: "Head Department Diperbarui",
            text: `Data Head Department untuk ${selectedDepartment?.name || "Departemen"} berhasil diperbarui.`,
            timer: 1800,
            showConfirmButton: false,
          });
        } else {
          await createAction(fd);
          await Swal.fire({
            icon: "success",
            title: "Head Department Ditambahkan",
            text: `Head Department untuk ${selectedDepartment?.name || "Departemen"} (${operatingUnit}) berhasil disimpan.`,
            timer: 1800,
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
    if (!initialData || !deleteAction) return;

    const confirm = await Swal.fire({
      title: "Hapus Penugasan Head Department?",
      text: `Penugasan untuk ${selectedDepartment?.name || "Departemen"} di unit ${operatingUnit} akan dihapus.`,
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
        fd.append("id", String(initialData.id));
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
      aria-labelledby="head-dept-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <UserCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 id="head-dept-modal-title" className="text-sm font-bold text-slate-900">
                {initialData ? "Edit Penugasan Head Department" : "Tambah Penugasan Head Department"}
              </h2>
              <p className="text-[11px] text-slate-500">
                Hubungkan Master Departemen dengan Karyawan penanggung jawab operasional.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-4.5 text-xs">
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">
                <span className="font-bold">Gagal Menyimpan:</span> {errorMessage}
              </div>
            </div>
          )}

          {/* 1. Field Department (Relasi Master Department) */}
          <div className="space-y-1.5">
            <label htmlFor="dept-select" className="flex items-center gap-1.5 font-bold text-slate-800">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Departemen <span className="text-rose-500">*</span></span>
              {initialData ? (
                <span className="ml-auto text-[10px] font-normal text-slate-400">Read-only</span>
              ) : (
                <span className="ml-auto text-[10px] font-normal text-slate-400">Dari Master Departemen</span>
              )}
            </label>
            {initialData ? (
              <div className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-800 flex items-center justify-between">
                <span>{selectedDepartment ? `${selectedDepartment.name} (${selectedDepartment.code})` : "Departemen"}</span>
                <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                  ID: {selectedDepartment?.id}
                </span>
              </div>
            ) : (
              <div className="relative">
                <select
                  id="dept-select"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition cursor-pointer font-medium"
                  required
                >
                  <option value="" disabled>Pilih Departemen...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.code}] {d.name} (ID: {d.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 2. Field Operating Unit (OU) */}
          <div className="space-y-1.5">
            <label htmlFor="ou-select" className="flex items-center gap-1.5 font-bold text-slate-800">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Site <span className="text-rose-500">*</span></span>
              {initialData ? (
                <span className="ml-auto text-[10px] font-normal text-slate-400">Read-only</span>
              ) : (
                <span className="ml-auto text-[10px] font-normal text-slate-400">Site Operasional</span>
              )}
            </label>
            {initialData ? (
              <div className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-700" />
                <span>{operatingUnit}</span>
              </div>
            ) : (
              <select
                id="ou-select"
                value={operatingUnit}
                onChange={(e) => setOperatingUnit(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition cursor-pointer font-medium"
                required
              >
                {ouOptions.map((ou) => (
                  <option key={ou} value={ou}>
                    {ou}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 3. Field Head Department (Relasi Master Employee NIK / Nama) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 font-bold text-slate-800">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Pilih Head Department (Karyawan) <span className="text-rose-500">*</span></span>
              <span className="ml-auto text-[10px] font-normal text-slate-400">Berdasarkan NIK atau Nama</span>
            </label>

            {/* Selected Employee Card */}
            {selectedEmployee ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-xs shadow-2xs">
                    {selectedEmployee.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{selectedEmployee.name}</span>
                      <span className="font-mono font-bold text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                        {selectedEmployee.nik}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {selectedEmployee.jobPosition || "Karyawan"} · Unit: {selectedEmployee.operatingUnit || "HO"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeId(null);
                    setIsEmployeeDropdownOpen(true);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Ganti
                </button>
              </div>
            ) : (
              /* Searchable Employee Selector */
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
                    placeholder="Ketik NIK atau nama karyawan untuk mencari..."
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
                  />
                  {employeeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setEmployeeSearchQuery("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      aria-label="Hapus pencarian karyawan"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Dropdown Options List */}
                {isEmployeeDropdownOpen && (
                  <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-lg max-h-48 overflow-y-auto space-y-0.5">
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map((emp) => {
                        const isMatchRole = emp.role === "HEAD_DEPT" || emp.role === "MANAGER";
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setIsEmployeeDropdownOpen(false);
                              setEmployeeSearchQuery("");
                              setErrorMessage("");
                            }}
                            className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 transition cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px]">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-900 text-xs truncate">{emp.name}</span>
                                  <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1 py-0.2 rounded font-bold">
                                    {emp.nik}
                                  </span>
                                  {isMatchRole && (
                                    <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1 py-0.2 rounded">
                                      {emp.role}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {emp.jobPosition || "Karyawan"} · Unit: {emp.operatingUnit || "HO"}
                                </div>
                              </div>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition">
                              Pilih
                            </span>
                          </button>
                        );
                      })
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
            <label className="flex items-center gap-1.5 font-bold text-slate-800">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>Status Penugasan <span className="text-rose-500">*</span></span>
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
                  <span>Aktif (Menjabat)</span>
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
                  <span>Non-Aktif (Riwayat)</span>
                </div>
                {status === "Inactive" && <Check className="w-3.5 h-3.5 text-slate-900" />}
              </label>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
            {initialData && deleteAction ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
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
                  <span>{initialData ? "Simpan Perubahan" : "Simpan Head Department"}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
