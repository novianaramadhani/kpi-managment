"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import type { Department, Employee, KpiPeriod, KpiParameter } from "@/db/schema";
import Swal from "sweetalert2";
import { Plus, Trash2, Calendar, UserCheck, AlertTriangle, ShieldCheck } from "lucide-react";
import { Table, td, th } from "./ui";

interface DelegationRow {
  id: number;
  periodId: number;
  delegatorId: number;
  delegatorNik: string;
  delegatorName: string;
  delegatorPosition: string;
  delegatorDepartment: string | null;
  delegateeId: number;
  delegateeNik: string;
  delegateeName: string;
  delegateePosition: string;
  delegateeDepartment: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  scopeType: "ALL" | "DEPARTMENT" | "PARAMETER" | string;
  departmentId: number | null;
  departmentName: string | null;
  parameterId: number | null;
  parameterName: string | null;
  isActive: boolean;
  createdAt: string | Date;
}

interface AssessorDelegationManagerProps {
  periods: KpiPeriod[];
  departments: Department[];
  employees: Employee[];
  parameters: Array<{
    id: number;
    name: string;
  }>;
}

export function AssessorDelegationManager({
  periods,
  departments,
  employees,
  parameters,
}: AssessorDelegationManagerProps) {
  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod ? activePeriod.id : 0);

  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [delegatorId, setDelegatorId] = useState<number | "">("");
  const [delegateeId, setDelegateeId] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [scopeType, setScopeType] = useState<"ALL" | "DEPARTMENT" | "PARAMETER">("ALL");
  const [targetDeptId, setTargetDeptId] = useState<number | "">("");
  const [targetParamId, setTargetParamId] = useState<number | "">("");

  // Search states inside modal
  const [delegatorSearch, setDelegatorSearch] = useState("");
  const [delegateeSearch, setDelegateeSearch] = useState("");

  const loadDelegations = async () => {
    if (!selectedPeriodId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/assessor-delegations?periodId=${selectedPeriodId}`);
      const data = await res.json();
      if (data.success) {
        setDelegations(data.delegations);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDelegations();
  }, [selectedPeriodId]);

  const candidateDelegators = useMemo(() => {
    const q = delegatorSearch.toLowerCase().trim();
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        emp.jobPosition.toLowerCase().includes(q)
      );
    });
  }, [employees, delegatorSearch]);

  const candidateDelegatees = useMemo(() => {
    const q = delegateeSearch.toLowerCase().trim();
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      if (delegatorId && emp.id === Number(delegatorId)) return false; // Cannot delegate to self
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        emp.jobPosition.toLowerCase().includes(q)
      );
    });
  }, [employees, delegateeSearch, delegatorId]);

  const handleOpenModal = () => {
    setDelegatorId("");
    setDelegateeId("");
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
    setReason("");
    setScopeType("ALL");
    setTargetDeptId("");
    setTargetParamId("");
    setDelegatorSearch("");
    setDelegateeSearch("");
    setIsModalOpen(true);
  };

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!delegatorId || !delegateeId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Pemberi delegasi dan penerima delegasi wajib dipilih.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (delegatorId === delegateeId) {
      void Swal.fire({
        icon: "error",
        title: "Karyawan Sama",
        text: "Pemberi dan penerima delegasi tidak boleh karyawan yang sama.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      void Swal.fire({
        icon: "warning",
        title: "Rentang Tanggal Tidak Valid",
        text: "Pastikan tanggal mulai dan tanggal selesai diisi dengan benar.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (!reason.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Alasan Wajib Diisi",
        text: "Mohon isi alasan pendelegasian wewenang.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/assessor-delegations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: selectedPeriodId,
            delegatorEmployeeId: delegatorId,
            delegateeEmployeeId: delegateeId,
            startDate,
            endDate,
            reason,
            scopeType,
            departmentId: targetDeptId || undefined,
            parameterId: targetParamId || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat delegasi.");

        void Swal.fire({
          icon: "success",
          title: "Delegasi Dibuat!",
          text: "Surat tugas delegasi penilai telah aktif.",
          confirmButtonColor: "#0f766e",
          timer: 2000,
        });

        setIsModalOpen(false);
        loadDelegations();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#0f766e" });
      }
    });
  };

  const handleRevoke = async (id: number, delegatorName: string, delegateeName: string) => {
    const confirm = await Swal.fire({
      title: "Batalkan Delegasi?",
      text: `Wewenang delegasi dari ${delegatorName} ke ${delegateeName} akan segera dicabut.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Cabut",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/assessor-delegations?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencabut delegasi.");

      void Swal.fire({
        icon: "success",
        title: "Dicabut",
        text: "Delegasi penilai telah dibatalkan.",
        confirmButtonColor: "#0f766e",
        timer: 1500,
      });

      loadDelegations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal";
      void Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#0f766e" });
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Periode KPI
          </label>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.year} {p.status === "ACTIVE" ? "(Aktif)" : `(${p.status})`}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-1"
        >
          <Plus className="h-4 w-4" />
          Tambah Delegasi Penilai
        </button>
      </div>

      {/* Table: Active & Historical Delegations */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={th}>Pemberi Delegasi (Delegator)</th>
              <th className={th}>Penerima Delegasi (Delegatee)</th>
              <th className={th}>Rentang Waktu</th>
              <th className={th}>Lingkup & Alasan</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  Memuat data delegasi penilai...
                </td>
              </tr>
            ) : delegations.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  Belum ada catatan delegasi penilai pada periode ini.
                </td>
              </tr>
            ) : (
              delegations.map((del) => {
                const isCurrentlyActive =
                  del.isActive && del.startDate <= todayStr && del.endDate >= todayStr;
                const isExpired = del.endDate < todayStr;

                return (
                  <tr key={del.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Delegator */}
                    <td className={`${td} align-top`}>
                      <div className="font-semibold text-slate-900">{del.delegatorName}</div>
                      <div className="text-xs text-slate-500">
                        {del.delegatorNik} • {del.delegatorPosition}
                      </div>
                    </td>

                    {/* Delegatee */}
                    <td className={`${td} align-top`}>
                      <div className="font-semibold text-teal-900">{del.delegateeName}</div>
                      <div className="text-xs text-slate-500">
                        {del.delegateeNik} • {del.delegateePosition}
                      </div>
                    </td>

                    {/* Date Range */}
                    <td className={`${td} align-top text-xs`}>
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {del.startDate} s/d {del.endDate}
                        </span>
                      </div>
                    </td>

                    {/* Scope & Reason */}
                    <td className={`${td} align-top text-xs`}>
                      <div className="font-medium text-slate-800">
                        {del.scopeType === "ALL"
                          ? "Semua Parameter Penilai"
                          : del.scopeType === "DEPARTMENT"
                          ? `Dept: ${del.departmentName}`
                          : `Param: ${del.parameterName}`}
                      </div>
                      <div className="text-slate-500 mt-0.5 italic">"{del.reason}"</div>
                    </td>

                    {/* Status */}
                    <td className={`${td} align-top`}>
                      {isCurrentlyActive ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          Aktif Bertugas
                        </span>
                      ) : !del.isActive ? (
                        <span className="inline-flex items-center rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                          Dibatalkan
                        </span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                          Berakhir
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                          Mendatang
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className={`${td} align-top text-right`}>
                      {del.isActive && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(del.id, del.delegatorName, del.delegateeName)}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Cabut
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Tambah Delegasi */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Surat Tugas Delegasi Penilai
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Berikan wewenang penilaian sementara ke rekan penilai pengganti saat berhalangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="mt-4 space-y-4 text-xs">
              {/* Delegator (Pemberi Kuasa) */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  1. Penilai Utama yang Berhalangan (Delegator)
                </label>
                <input
                  type="text"
                  value={delegatorSearch}
                  onChange={(e) => setDelegatorSearch(e.target.value)}
                  placeholder="Cari NIK / Nama penilai utama..."
                  className="w-full mb-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />
                <select
                  value={delegatorId}
                  onChange={(e) => setDelegatorId(Number(e.target.value))}
                  required
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                >
                  <option value="">-- Pilih Penilai Utama --</option>
                  {candidateDelegators.slice(0, 50).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.nik} - {emp.jobPosition})
                    </option>
                  ))}
                </select>
              </div>

              {/* Delegatee (Penerima Kuasa) */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  2. Penilai Pengganti (Delegatee)
                </label>
                <input
                  type="text"
                  value={delegateeSearch}
                  onChange={(e) => setDelegateeSearch(e.target.value)}
                  placeholder="Cari NIK / Nama penilai pengganti..."
                  className="w-full mb-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />
                <select
                  value={delegateeId}
                  onChange={(e) => setDelegateeId(Number(e.target.value))}
                  required
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                >
                  <option value="">-- Pilih Penilai Pengganti --</option>
                  {candidateDelegatees.slice(0, 50).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.nik} - {emp.jobPosition})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cakupan Delegasi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label
                    className={`flex items-center gap-1.5 p-2 rounded border cursor-pointer ${
                      scopeType === "ALL"
                        ? "border-teal-600 bg-teal-50 font-semibold text-teal-900"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scopeType"
                      value="ALL"
                      checked={scopeType === "ALL"}
                      onChange={() => setScopeType("ALL")}
                      className="text-teal-600"
                    />
                    <span>Semua Tugas</span>
                  </label>
                  <label
                    className={`flex items-center gap-1.5 p-2 rounded border cursor-pointer ${
                      scopeType === "DEPARTMENT"
                        ? "border-teal-600 bg-teal-50 font-semibold text-teal-900"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scopeType"
                      value="DEPARTMENT"
                      checked={scopeType === "DEPARTMENT"}
                      onChange={() => setScopeType("DEPARTMENT")}
                      className="text-teal-600"
                    />
                    <span>Departemen</span>
                  </label>
                  <label
                    className={`flex items-center gap-1.5 p-2 rounded border cursor-pointer ${
                      scopeType === "PARAMETER"
                        ? "border-teal-600 bg-teal-50 font-semibold text-teal-900"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scopeType"
                      value="PARAMETER"
                      checked={scopeType === "PARAMETER"}
                      onChange={() => setScopeType("PARAMETER")}
                      className="text-teal-600"
                    />
                    <span>Parameter</span>
                  </label>
                </div>
              </div>

              {scopeType === "DEPARTMENT" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Departemen Spesifik
                  </label>
                  <select
                    value={targetDeptId}
                    onChange={(e) => setTargetDeptId(Number(e.target.value))}
                    required
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Departemen --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scopeType === "PARAMETER" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Parameter Spesifik
                  </label>
                  <select
                    value={targetParamId}
                    onChange={(e) => setTargetParamId(Number(e.target.value))}
                    required
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Parameter --</option>
                    {parameters.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alasan Pendelegasian (Wajib)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  placeholder="Contoh: Cuti Tahunan / Dinas Lapangan Site GAM"
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-teal-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
                >
                  {isPending ? "Memproses..." : "Aktifkan Delegasi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
