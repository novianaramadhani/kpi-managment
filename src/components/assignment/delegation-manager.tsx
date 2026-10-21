"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Filter,
  UserCheck,
  Plus,
  RefreshCw,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  ShieldAlert,
  FileText,
  UserX,
  Search,
} from "lucide-react";

interface Department {
  id: number;
  name: string;
  code: string;
}

interface KpiPeriod {
  id: number;
  name: string;
  year: number;
  status: string;
}

interface EmployeeOption {
  id: number;
  nik: string;
  name: string;
  jobPosition: string | null;
  departmentId: number | null;
}

interface ParameterOption {
  id: number;
  name: string;
  templateId: number;
  templateName: string;
}

interface AssessorDelegationRow {
  id: number;
  periodId: number;
  delegatorId: number;
  delegatorNik: string;
  delegatorName: string;
  delegatorPosition: string | null;
  delegatorDepartment: string | null;
  delegateeId: number;
  delegateeNik: string;
  delegateeName: string;
  delegateePosition: string | null;
  delegateeDepartment: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  scopeType: "ALL" | "DEPARTMENT" | "PARAMETER";
  stage: string | null;
  departmentId: number | null;
  departmentName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  periods: KpiPeriod[];
  departments: Department[];
  employees: EmployeeOption[];
  parameters: ParameterOption[];
}

const STAGE_LABELS: Record<string, string> = {
  MONTHLY: "Bulanan",
  SEMESTER: "Semester",
  ANNUAL: "Tahunan",
};

export function DelegationManager({
  periods,
  departments,
  employees,
  parameters,
}: Props) {
  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(
    periods.find((p) => p.status === "ACTIVE")?.id || periods[0]?.id || 0
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedDelegatorId, setSelectedDelegatorId] = useState<string>("ALL");
  const [selectedDelegateeId, setSelectedDelegateeId] = useState<string>("ALL");
  const [selectedStage, setSelectedStage] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data State
  const [delegations, setDelegations] = useState<AssessorDelegationRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalDelegatorId, setModalDelegatorId] = useState<number>(employees[0]?.id || 0);
  const [modalDelegateeId, setModalDelegateeId] = useState<number>(employees[1]?.id || 0);
  const [modalScopeType, setModalScopeType] = useState<"ALL" | "DEPARTMENT" | "PARAMETER">("ALL");
  const [modalStage, setModalStage] = useState<string>("MONTHLY");
  const [modalDeptId, setModalDeptId] = useState<number | null>(null);
  const [modalCategoryId, setModalCategoryId] = useState<number | null>(null);
  const [modalStartDate, setModalStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [modalEndDate, setModalEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // default 2 weeks
    return d.toISOString().split("T")[0];
  });
  const [modalReason, setModalReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch Delegations
  const fetchDelegations = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        periodId: String(selectedPeriodId),
      });
      if (selectedDeptId !== "ALL") params.append("departmentId", selectedDeptId);
      if (selectedDelegatorId !== "ALL") params.append("delegatorEmployeeId", selectedDelegatorId);
      if (selectedDelegateeId !== "ALL") params.append("delegateeEmployeeId", selectedDelegateeId);
      if (selectedStage !== "ALL") params.append("stage", selectedStage);
      if (selectedStatus !== "ALL") params.append("status", selectedStatus);

      const res = await fetch(`/api/admin/assessor-delegations?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat data delegasi.");
      }

      setDelegations(data.delegations || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, selectedDeptId, selectedDelegatorId, selectedDelegateeId, selectedStage, selectedStatus]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  // Revoke Delegation
  const handleRevoke = async (row: AssessorDelegationRow) => {
    const result = await Swal.fire({
      title: "Cabut Surat Delegasi?",
      html: `Apakah Anda yakin ingin mencabut delegasi wewenang dari <b>${row.delegatorName}</b> kepada <b>${row.delegateeName}</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Cabut Wewenang",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/assessor-delegations?id=${row.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencabut delegasi.");

      Swal.fire({
        icon: "success",
        title: "Wewenang Dicabut",
        text: "Kewenangan delegasi telah dinonaktifkan.",
        timer: 1500,
        showConfirmButton: false,
      });
      fetchDelegations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mencabut wewenang.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  // Submit Modal Tambah Delegasi
  const handleSubmitAdd = async () => {
    if (!modalDelegatorId || !modalDelegateeId) {
      Swal.fire({ icon: "warning", title: "Data Tidak Lengkap", text: "Pilih pemberi dan penerima delegasi." });
      return;
    }
    if (modalDelegatorId === modalDelegateeId) {
      Swal.fire({ icon: "warning", title: "Tidak Valid", text: "Pemberi dan penerima delegasi tidak boleh karyawan yang sama." });
      return;
    }
    if (!modalStartDate || !modalEndDate) {
      Swal.fire({ icon: "warning", title: "Tanggal Wajib", text: "Tanggal mulai dan berakhir delegasi wajib diisi." });
      return;
    }
    if (modalStartDate > modalEndDate) {
      Swal.fire({ icon: "warning", title: "Tanggal Tidak Valid", text: "Tanggal mulai tidak boleh melebihi tanggal selesai." });
      return;
    }
    if (!modalReason.trim()) {
      Swal.fire({ icon: "warning", title: "Alasan Wajib", text: "Silakan isi alasan pendelegasian wewenang." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        periodId: selectedPeriodId,
        delegatorEmployeeId: modalDelegatorId,
        delegateeEmployeeId: modalDelegateeId,
        startDate: modalStartDate,
        endDate: modalEndDate,
        reason: modalReason.trim(),
        scopeType: modalScopeType,
        stage: modalStage,
        departmentId: modalScopeType === "DEPARTMENT" ? modalDeptId : null,
        categoryId: modalScopeType === "PARAMETER" ? modalCategoryId : null,
      };

      const res = await fetch("/api/admin/assessor-delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan delegasi.");

      Swal.fire({
        icon: "success",
        title: "Delegasi Diterbitkan",
        text: "Pelimpahan kewenangan sementara berhasil disimpan.",
        timer: 1500,
        showConfirmButton: false,
      });

      setIsAddModalOpen(false);
      setModalReason("");
      fetchDelegations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compute status for each row
  const today = new Date().toISOString().split("T")[0];

  const processedRows = useMemo(() => {
    return delegations.map((r) => {
      let statusKey: "ACTIVE" | "EXPIRED" | "REVOKED" = "ACTIVE";
      if (!r.isActive) {
        statusKey = "REVOKED";
      } else if (r.endDate < today) {
        statusKey = "EXPIRED";
      } else {
        statusKey = "ACTIVE";
      }
      return { ...r, statusKey };
    }).filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.delegatorName.toLowerCase().includes(q) ||
        r.delegatorNik.toLowerCase().includes(q) ||
        r.delegateeName.toLowerCase().includes(q) ||
        r.delegateeNik.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [delegations, today, searchQuery]);

  const activeCount = delegations.filter((d) => d.isActive && d.endDate >= today).length;
  const expiredCount = delegations.filter((d) => d.isActive && d.endDate < today).length;
  const revokedCount = delegations.filter((d) => !d.isActive).length;

  return (
    <div className="space-y-5">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Surat Tugas</span>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
              <FileText className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{delegations.length}</div>
          <p className="mt-1 text-xs text-slate-500">Seluruh riwayat pendelegasian wewenang</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Wewenang Aktif</span>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCount}</div>
          <p className="mt-1 text-xs text-emerald-600">Delegate sah menilai penilaian KPI saat ini</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Otomatis Expired</span>
            <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{expiredCount}</div>
          <p className="mt-1 text-xs text-amber-600">Masa penugasan delegasi telah usai</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Dicabut / Dibatalkan</span>
            <span className="rounded-lg bg-slate-200 p-2 text-slate-600">
              <Ban className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-700">{revokedCount}</div>
          <p className="mt-1 text-xs text-slate-500">Wewenang dikembalikan sebelum batas waktu</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Filter Delegasi Penilaian
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchDelegations()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Segarkan
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Delegasi
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          {/* Periode */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.year})
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Departemen</label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Departemen</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Delegator */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Pemberi (Delegator)</label>
            <select
              value={selectedDelegatorId}
              onChange={(e) => setSelectedDelegatorId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Delegator</option>
              {employees.slice(0, 100).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.nik})
                </option>
              ))}
            </select>
          </div>

          {/* Delegate */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Penerima (Delegate)</label>
            <select
              value={selectedDelegateeId}
              onChange={(e) => setSelectedDelegateeId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Penerima</option>
              {employees.slice(0, 100).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.nik})
                </option>
              ))}
            </select>
          </div>

          {/* Tahap Penilaian */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tahap Penilaian</label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Tahap</option>
              <option value="MONTHLY">Bulanan (Monthly)</option>
              <option value="SEMESTER">Semester</option>
              <option value="ANNUAL">Tahunan (Annual)</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="EXPIRED">Kedaluwarsa (Expired)</option>
              <option value="REVOKED">Dicabut (Revoked)</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Pencarian</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Nama / NIK / Alasan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Relasi Banner */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Relasi Delegasi:</span>
        <span className="font-medium text-slate-900">Delegator (Asesor Utama)</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-blue-700">Delegate (Penerima Tugas)</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-indigo-700">Cakupan & Tahap</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-emerald-700">Rentang Waktu</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-800">Status Kedaluwarsa Otomatis</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Memuat data delegasi penilaian...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => fetchDelegations()}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : processedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FileText className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-700">Tidak ada delegasi penilaian terdaftar</p>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Surat tugas pelimpahan kewenangan sementara dari asesor kepada delegate akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Pemberi (Delegator)</th>
                  <th className="py-2.5 px-3">Penerima (Delegate)</th>
                  <th className="py-2.5 px-3">Cakupan & Tahap</th>
                  <th className="py-2.5 px-3">Masa Berlaku</th>
                  <th className="py-2.5 px-3">Alasan Delegasi</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Delegator */}
                    <td className="py-2 px-3">
                      <div className="font-semibold text-slate-900">{row.delegatorName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.delegatorNik}</div>
                      <div className="text-[10px] text-slate-400">
                        {row.delegatorPosition} • {row.delegatorDepartment}
                      </div>
                    </td>

                    {/* Delegate */}
                    <td className="py-2 px-3">
                      <div className="font-semibold text-blue-900">{row.delegateeName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.delegateeNik}</div>
                      <div className="text-[10px] text-slate-400">
                        {row.delegateePosition} • {row.delegateeDepartment}
                      </div>
                    </td>

                    {/* Cakupan & Tahap */}
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-800">
                        {row.scopeType === "ALL" && "Semua Penilaian"}
                        {row.scopeType === "DEPARTMENT" && `Dept: ${row.departmentName}`}
                        {row.scopeType === "PARAMETER" && `Parameter: ${row.categoryName}`}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Tahap: {STAGE_LABELS[row.stage || ""] || row.stage || "Bulanan"}
                      </div>
                    </td>

                    {/* Masa Berlaku */}
                    <td className="py-2 px-3">
                      <div className="font-mono text-slate-800 text-[11px]">
                        {row.startDate} s/d {row.endDate}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {row.statusKey === "ACTIVE"
                          ? "Berlaku saat ini"
                          : row.statusKey === "EXPIRED"
                          ? "Otomatis kedaluwarsa"
                          : "Telah dibatalkan"}
                      </div>
                    </td>

                    {/* Alasan */}
                    <td className="py-2 px-3 max-w-xs">
                      <div className="text-slate-700 italic truncate" title={row.reason}>
                        &ldquo;{row.reason}&rdquo;
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3">
                      {row.statusKey === "ACTIVE" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Aktif
                        </span>
                      )}
                      {row.statusKey === "EXPIRED" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          <Clock className="h-3 w-3" />
                          Expired
                        </span>
                      )}
                      {row.statusKey === "REVOKED" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                          <Ban className="h-3 w-3" />
                          Dicabut
                        </span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-2 px-3 text-right">
                      {row.statusKey === "ACTIVE" && (
                        <button
                          onClick={() => handleRevoke(row)}
                          title="Cabut Delegasi Sekarang"
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          Cabut
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah Delegasi */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tambah Surat Delegasi Penilaian</h3>
                <p className="text-xs text-slate-500">
                  Pelimpahan kewenangan sementara dari Asesor kepada Delegate (tidak menggantikan asesor utama).
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Delegator & Delegate */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pemberi Wewenang (Delegator) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalDelegatorId}
                    onChange={(e) => setModalDelegatorId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.nik}) - {emp.jobPosition || "Karyawan"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Penerima Wewenang (Delegate) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalDelegateeId}
                    onChange={(e) => setModalDelegateeId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    {employees
                      .filter((e) => e.id !== modalDelegatorId)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.nik}) - {emp.jobPosition || "Karyawan"}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Scope & Tahap */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cakupan Wewenang (Scope) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalScopeType}
                    onChange={(e) => setModalScopeType(e.target.value as "ALL" | "DEPARTMENT" | "PARAMETER")}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="ALL">Semua Penilaian (Seluruh Tim)</option>
                    <option value="DEPARTMENT">Satu Departemen Tertentu</option>
                    <option value="PARAMETER">Parameter KPI Tertentu</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tahap Penilaian <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalStage}
                    onChange={(e) => setModalStage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="MONTHLY">Bulanan (Monthly KPI)</option>
                    <option value="SEMESTER">Semester</option>
                    <option value="ANNUAL">Tahunan (Annual KPI)</option>
                  </select>
                </div>
              </div>

              {/* Conditional Scope Inputs */}
              {modalScopeType === "DEPARTMENT" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Pilih Departemen <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalDeptId || ""}
                    onChange={(e) => setModalDeptId(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                  >
                    <option value="" disabled>
                      Pilih departemen...
                    </option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {modalScopeType === "PARAMETER" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Pilih Parameter KPI <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalCategoryId || ""}
                    onChange={(e) => setModalCategoryId(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                  >
                    <option value="" disabled>
                      Pilih parameter...
                    </option>
                    {parameters.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.templateName})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start Date & End Date */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Mulai (Start Date) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Selesai (End Date) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={modalEndDate}
                    onChange={(e) => setModalEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Wewenang otomatis berakhir setelah tanggal ini.
                  </span>
                </div>
              </div>

              {/* Alasan / Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Alasan Pendelegasian (Reason) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Misal: Cuti tahunan, penugasan proyek luar kota, atau kendala medis sementara..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitAdd}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs"
              >
                {isSubmitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Terbitkan Delegasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
