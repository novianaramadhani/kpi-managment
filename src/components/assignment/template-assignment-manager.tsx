"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Filter,
  Layers,
  Building2,
  Briefcase,
  UserCheck,
  UserX,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";

interface Department {
  id: number;
  name: string;
  code: string;
}

interface JobLevel {
  id: number;
  name: string;
  rank: number;
}

interface JobPosition {
  id: number;
  name: string;
}

interface KpiPeriod {
  id: number;
  name: string;
  year: number;
  status: string;
}

interface KpiTemplate {
  id: number;
  name: string;
  code?: string;
  targetRole?: string | null;
}

interface TemplateAssignmentRow {
  employeeId: number;
  nik: string;
  name: string;
  email: string | null;
  departmentId: number | null;
  departmentName: string;
  departmentCode: string;
  jobLevelId: number | null;
  jobLevelName: string;
  jobPositionId: number | null;
  jobPositionName: string;
  appraisalId: number | null;
  templateId: number | null;
  templateName: string | null;
  appraisalStatus: string | null;
  appraiserName: string | null;
  updatedAt: string | null;
}

interface Props {
  periods: KpiPeriod[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions: JobPosition[];
  templates: KpiTemplate[];
}

export function TemplateAssignmentManager({
  periods,
  departments,
  jobLevels,
  jobPositions,
  templates,
}: Props) {
  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(
    periods.find((p) => p.status === "ACTIVE")?.id || periods[0]?.id || 0
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedJobLevelId, setSelectedJobLevelId] = useState<string>("ALL");
  const [selectedJobPositionId, setSelectedJobPositionId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data & State
  const [rows, setRows] = useState<TemplateAssignmentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [assignedCount, setAssignedCount] = useState<number>(0);
  const limit = 50;

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalTemplateId, setModalTemplateId] = useState<number>(templates[0]?.id || 0);
  const [modalTargetMode, setModalTargetMode] = useState<"DEPT" | "POSITION" | "INDIVIDUAL">("DEPT");
  const [modalDeptId, setModalDeptId] = useState<number | "ALL">("ALL");
  const [modalJobLevelId, setModalJobLevelId] = useState<number | "ALL">("ALL");
  const [modalJobPositionId, setModalJobPositionId] = useState<number | "ALL">("ALL");
  const [modalSelectedEmpIds, setModalSelectedEmpIds] = useState<number[]>([]);
  const [modalEmpSearch, setModalEmpSearch] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        periodId: String(selectedPeriodId),
        page: String(page),
        limit: String(limit),
      });
      if (selectedDeptId !== "ALL") params.append("departmentId", selectedDeptId);
      if (selectedJobLevelId !== "ALL") params.append("jobLevelId", selectedJobLevelId);
      if (selectedJobPositionId !== "ALL") params.append("jobPositionId", selectedJobPositionId);
      if (selectedStatus !== "ALL") params.append("status", selectedStatus);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/admin/template-assignments?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat data penugasan template.");
      }

      setRows(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
      setAssignedCount(data.pagination?.assignedCount || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, selectedDeptId, selectedJobLevelId, selectedJobPositionId, selectedStatus, searchQuery, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Unassign template from employee
  const handleUnassign = async (row: TemplateAssignmentRow) => {
    const result = await Swal.fire({
      title: "Lepas Template KPI?",
      html: `Apakah Anda yakin ingin melepas template dari <b>${row.name}</b> (${row.nik}) untuk periode ini?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Lepas Template",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(
        `/api/admin/template-assignments?periodId=${selectedPeriodId}&employeeId=${row.employeeId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal melepas template.");

      Swal.fire({
        icon: "success",
        title: "Berhasil",
        text: `Template KPI untuk ${row.name} telah dilepas.`,
        timer: 1500,
        showConfirmButton: false,
      });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal melepas template.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  // Quick Assign Single Employee
  const handleQuickAssign = async (employeeId: number, templateId: number) => {
    if (!templateId) return;
    try {
      const res = await fetch("/api/admin/template-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: selectedPeriodId,
          templateId,
          employeeIds: [employeeId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memasang template.");

      Swal.fire({
        icon: "success",
        title: "Tersimpan",
        text: "Template KPI berhasil dipasang ke karyawan.",
        timer: 1200,
        showConfirmButton: false,
      });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memasang template.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  // Submit Modal Penugasan
  const handleSubmitAssignment = async () => {
    if (!modalTemplateId) {
      Swal.fire({ icon: "warning", title: "Pilih Template", text: "Silakan pilih Template KPI terlebih dahulu." });
      return;
    }

    let targetIds: number[] = [];
    if (modalTargetMode === "INDIVIDUAL") {
      if (modalSelectedEmpIds.length === 0) {
        Swal.fire({ icon: "warning", title: "Pilih Karyawan", text: "Centang minimal 1 karyawan untuk dipasangi template." });
        return;
      }
      targetIds = modalSelectedEmpIds;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        periodId: selectedPeriodId,
        templateId: modalTemplateId,
        targetMode: modalTargetMode,
      };

      if (modalTargetMode === "DEPT") {
        if (modalDeptId !== "ALL") payload.departmentId = Number(modalDeptId);
        if (modalJobLevelId !== "ALL") payload.jobLevelId = Number(modalJobLevelId);
        if (modalJobPositionId !== "ALL") payload.jobPositionId = Number(modalJobPositionId);
      } else if (modalTargetMode === "POSITION") {
        if (modalJobPositionId === "ALL") {
          Swal.fire({ icon: "warning", title: "Pilih Jabatan", text: "Silakan pilih jabatan target." });
          setIsSubmitting(false);
          return;
        }
        payload.jobPositionId = Number(modalJobPositionId);
      } else {
        payload.employeeIds = targetIds;
      }

      const res = await fetch("/api/admin/template-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menerapkan penugasan template.");

      Swal.fire({
        icon: "success",
        title: "Penugasan Berhasil",
        text: `Berhasil menugaskan template ke ${data.updatedCount || 0} karyawan.`,
      });
      setIsAddModalOpen(false);
      setModalSelectedEmpIds([]);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Candidates for modal individual picker
  const modalCandidateRows = useMemo(() => {
    return rows.filter((r) => {
      if (!modalEmpSearch.trim()) return true;
      const q = modalEmpSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.nik.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q) ||
        r.jobPositionName.toLowerCase().includes(q)
      );
    });
  }, [rows, modalEmpSearch]);

  const unassignedCount = totalCount - assignedCount;
  const coveragePercent = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Karyawan</span>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
              <Briefcase className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}</div>
          <p className="mt-1 text-xs text-slate-500">Karyawan aktif dalam basis data</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Sudah Ber-Template</span>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{assignedCount.toLocaleString()}</div>
          <p className="mt-1 text-xs text-emerald-600">Siap dinilai pada periode terpilih</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Belum Ber-Template</span>
            <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <UserX className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{unassignedCount.toLocaleString()}</div>
          <p className="mt-1 text-xs text-amber-600">Perlu penugasan template KPI</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Cakupan Penugasan</span>
            <span className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-700">{coveragePercent}%</div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-blue-200 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Filter Penugasan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData()}
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
              Tambah Penugasan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          {/* Periode */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => {
                setSelectedPeriodId(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.year}) {p.status === "ACTIVE" ? "[Aktif]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Departemen</label>
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Departemen</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Job Level */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Job Level</label>
            <select
              value={selectedJobLevelId}
              onChange={(e) => {
                setSelectedJobLevelId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Job Level</option>
              {jobLevels.map((jl) => (
                <option key={jl.id} value={jl.id}>
                  {jl.name} (Rank {jl.rank})
                </option>
              ))}
            </select>
          </div>

          {/* Jabatan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Jabatan</label>
            <select
              value={selectedJobPositionId}
              onChange={(e) => {
                setSelectedJobPositionId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Jabatan</option>
              {jobPositions.map((jp) => (
                <option key={jp.id} value={jp.id}>
                  {jp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Penugasan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Status</option>
              <option value="ASSIGNED">Sudah Terpasang</option>
              <option value="UNASSIGNED">Belum Terpasang</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Pencarian</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Nama / NIK..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Relation Banner (Department → Jabatan / Job Level → Template → Employee) */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Relasi Penugasan:</span>
        <span className="font-medium text-blue-700">Departemen</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-indigo-700">Jabatan / Job Level</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-emerald-700">Template KPI</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-900">Karyawan (Appraisal Target)</span>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Memuat data penugasan template...</p>
            <p className="text-xs text-slate-400">Sinkronisasi data karyawan dan status appraisal</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => fetchData()}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FileSpreadsheet className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-700">Tidak ada data penugasan template yang cocok</p>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Sesuaikan filter pencarian atau gunakan tombol &quot;Tambah Penugasan&quot; untuk memasang template ke karyawan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Karyawan</th>
                  <th className="py-2.5 px-3">Departemen</th>
                  <th className="py-2.5 px-3">Jabatan & Level</th>
                  <th className="py-2.5 px-3">Template Terpasang</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const hasTemplate = !!row.templateId;
                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-50/80 transition-colors">
                      {/* Karyawan */}
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{row.nik}</div>
                      </td>

                      {/* Departemen */}
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-700">{row.departmentName}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Kode: {row.departmentCode}
                        </div>
                      </td>

                      {/* Jabatan & Level */}
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-700">{row.jobPositionName}</div>
                        <div className="text-[11px] text-slate-500">{row.jobLevelName}</div>
                      </td>

                      {/* Template Terpasang */}
                      <td className="py-2 px-3">
                        {hasTemplate ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              {row.templateName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400 italic">
                            <span>Belum ada template</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3">
                        {hasTemplate ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            {row.appraisalStatus || "ASSIGNED"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                            UNASSIGNED
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasTemplate ? (
                            <>
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleQuickAssign(row.employeeId, Number(e.target.value));
                                    e.target.value = "";
                                  }
                                }}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-hidden"
                              >
                                <option value="" disabled>
                                  Ganti Template...
                                </option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleUnassign(row)}
                                title="Lepas Template"
                                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                              >
                                Lepas
                              </button>
                            </>
                          ) : (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleQuickAssign(row.employeeId, Number(e.target.value));
                                  e.target.value = "";
                                }
                              }}
                              className="rounded-md border border-blue-300 bg-blue-50/50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition focus:outline-hidden"
                            >
                              <option value="" disabled>
                                + Pasang Template...
                              </option>
                              {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
            <div>
              Menampilkan {((page - 1) * limit + 1).toLocaleString()} -{" "}
              {Math.min(page * limit, totalCount).toLocaleString()} dari {totalCount.toLocaleString()} data
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-semibold text-slate-800">
                Halaman {page} dari {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah Penugasan Template */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tambah Penugasan Template KPI</h3>
                <p className="text-xs text-slate-500">
                  Pasang template KPI secara massal berdasarkan Departemen, Jabatan, atau Karyawan terpilih.
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
              {/* Template Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Template KPI <span className="text-rose-500">*</span>
                </label>
                <select
                  value={modalTemplateId}
                  onChange={(e) => setModalTemplateId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.targetRole ? `(Role: ${tpl.targetRole})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Target */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Metode Penugasan</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalTargetMode("DEPT")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalTargetMode === "DEPT"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Berdasarkan Departemen
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTargetMode("POSITION")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalTargetMode === "POSITION"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Berdasarkan Jabatan
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTargetMode("INDIVIDUAL")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalTargetMode === "INDIVIDUAL"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Pilih Karyawan Spesifik
                  </button>
                </div>
              </div>

              {/* Form Mode DEPT */}
              {modalTargetMode === "DEPT" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Departemen</label>
                    <select
                      value={modalDeptId}
                      onChange={(e) => setModalDeptId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                    >
                      <option value="ALL">Semua Departemen</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Job Level (Opsional)</label>
                    <select
                      value={modalJobLevelId}
                      onChange={(e) => setModalJobLevelId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                    >
                      <option value="ALL">Semua Job Level</option>
                      {jobLevels.map((jl) => (
                        <option key={jl.id} value={jl.id}>
                          {jl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Jabatan (Opsional)</label>
                    <select
                      value={modalJobPositionId}
                      onChange={(e) => setModalJobPositionId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                    >
                      <option value="ALL">Semua Jabatan</option>
                      {jobPositions.map((jp) => (
                        <option key={jp.id} value={jp.id}>
                          {jp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Form Mode POSITION */}
              {modalTargetMode === "POSITION" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Pilih Jabatan Target <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalJobPositionId}
                    onChange={(e) => setModalJobPositionId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                  >
                    <option value="ALL" disabled>
                      Pilih salah satu jabatan...
                    </option>
                    {jobPositions.map((jp) => (
                      <option key={jp.id} value={jp.id}>
                        {jp.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Template akan dipasangkan ke seluruh karyawan yang memegang jabatan ini.
                  </p>
                </div>
              )}

              {/* Form Mode INDIVIDUAL */}
              {modalTargetMode === "INDIVIDUAL" && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Pilih Karyawan ({modalSelectedEmpIds.length} dipilih)
                    </span>
                    <input
                      type="text"
                      placeholder="Cari nama/NIK..."
                      value={modalEmpSearch}
                      onChange={(e) => setModalEmpSearch(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-hidden w-48"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                    {modalCandidateRows.map((r) => {
                      const isChecked = modalSelectedEmpIds.includes(r.employeeId);
                      return (
                        <label
                          key={r.employeeId}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setModalSelectedEmpIds((prev) => [...prev, r.employeeId]);
                              } else {
                                setModalSelectedEmpIds((prev) => prev.filter((id) => id !== r.employeeId));
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <span className="font-semibold text-slate-900">{r.name}</span>
                            <span className="ml-1 text-[11px] text-slate-500 font-mono">({r.nik})</span>
                            <span className="ml-2 text-[11px] text-slate-400">
                              - {r.departmentName} / {r.jobPositionName}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
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
                onClick={handleSubmitAssignment}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs"
              >
                {isSubmitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Terapkan Penugasan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
