"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Filter,
  Users,
  UserCheck,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  Briefcase,
  Layers,
  ArrowRight,
  ShieldCheck,
  Calendar,
  CheckCircle2,
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

interface AssessorAssignmentRow {
  id: number;
  periodId: number;
  categoryId: number;
  categoryName: string;
  categoryWeight: number | null;
  templateId: number;
  templateName: string;
  assessorId: number;
  assessorNik: string;
  assessorName: string;
  assessorPosition: string;
  assessorDepartmentName: string | null;
  roleAssessor: string | null;
  stage: string | null;
  scopeType: string;
  targetDepartmentId: number | null;
  targetDepartmentName: string | null;
  targetEmployeeId: number | null;
  targetEmployeeNik: string | null;
  targetEmployeeName: string | null;
  targetEmployeePosition: string | null;
  targetEmployeeJobLevelName: string | null;
  notes: string | null;
  createdAt: string;
}

interface Props {
  periods: KpiPeriod[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions: JobPosition[];
  employees: EmployeeOption[];
  parameters: ParameterOption[];
}

const ROLE_LABELS: Record<string, string> = {
  ATASAN_LANGSUNG: "Atasan Langsung",
  PENILAI_1: "Penilai 1",
  PENILAI_2: "Penilai 2",
  REVIEWER: "Reviewer",
  HRD: "HR / Verifikator",
};

const STAGE_LABELS: Record<string, string> = {
  MONTHLY: "Bulanan",
  SEMESTER: "Semester",
  ANNUAL: "Tahunan",
};

export function AssessorMatrixManager({
  periods,
  departments,
  jobLevels,
  jobPositions,
  employees,
  parameters,
}: Props) {
  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(
    periods.find((p) => p.status === "ACTIVE")?.id || periods[0]?.id || 0
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedJobLevelId, setSelectedJobLevelId] = useState<string>("ALL");
  const [selectedJobPositionId, setSelectedJobPositionId] = useState<string>("ALL");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [selectedStage, setSelectedStage] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data State
  const [assignments, setAssignments] = useState<AssessorAssignmentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalAssessorId, setModalAssessorId] = useState<number>(employees[0]?.id || 0);
  const [modalRole, setModalRole] = useState<string>("PENILAI_1");
  const [modalStage, setModalStage] = useState<string>("MONTHLY");
  const [modalCategoryIds, setModalCategoryIds] = useState<number[]>(
    parameters.length > 0 ? [parameters[0].id] : []
  );
  const [modalScopeType, setModalScopeType] = useState<"INDIVIDUAL" | "DEPARTMENT" | "GLOBAL">("INDIVIDUAL");
  const [modalDeptId, setModalDeptId] = useState<number | null>(null);
  const [modalSelectedTargetEmpIds, setModalSelectedTargetEmpIds] = useState<number[]>([]);
  const [modalTargetEmpSearch, setModalTargetEmpSearch] = useState<string>("");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch Assessor Assignments
  const fetchAssignments = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        periodId: String(selectedPeriodId),
      });
      if (selectedDeptId !== "ALL") params.append("departmentId", selectedDeptId);
      if (selectedJobLevelId !== "ALL") params.append("jobLevelId", selectedJobLevelId);
      if (selectedJobPositionId !== "ALL") params.append("jobPositionId", selectedJobPositionId);
      if (selectedRole !== "ALL") params.append("roleAssessor", selectedRole);
      if (selectedStage !== "ALL") params.append("stage", selectedStage);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/admin/assessor-assignments?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat data penugasan asesor.");
      }

      setAssignments(data.assignments || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, selectedDeptId, selectedJobLevelId, selectedJobPositionId, selectedRole, selectedStage, searchQuery]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Delete Assignment
  const handleDelete = async (row: AssessorAssignmentRow) => {
    const result = await Swal.fire({
      title: "Hapus Penugasan Asesor?",
      html: `Apakah Anda yakin ingin menghapus penugasan asesor <b>${row.assessorName}</b> untuk menilai <b>${
        row.targetEmployeeName || row.targetDepartmentName || "Semua Karyawan"
      }</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/assessor-assignments?id=${row.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus penugasan asesor.");

      Swal.fire({
        icon: "success",
        title: "Terhapus",
        text: "Penugasan asesor berhasil dihapus.",
        timer: 1500,
        showConfirmButton: false,
      });
      fetchAssignments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  // Submit Modal Tambah Asesor
  const handleSubmitAdd = async () => {
    if (!modalAssessorId) {
      Swal.fire({ icon: "warning", title: "Pilih Asesor", text: "Silakan pilih karyawan yang bertindak sebagai asesor." });
      return;
    }
    if (modalCategoryIds.length === 0) {
      Swal.fire({ icon: "warning", title: "Pilih Parameter", text: "Pilih minimal satu parameter KPI yang akan dinilai." });
      return;
    }
    if (modalScopeType === "INDIVIDUAL" && modalSelectedTargetEmpIds.length === 0) {
      Swal.fire({ icon: "warning", title: "Pilih Target", text: "Pilih minimal satu karyawan target yang akan dinilai." });
      return;
    }
    if (modalScopeType === "DEPARTMENT" && !modalDeptId) {
      Swal.fire({ icon: "warning", title: "Pilih Departemen", text: "Pilih departemen target yang akan dinilai." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        periodId: selectedPeriodId,
        categoryIds: modalCategoryIds,
        assessorEmployeeIds: [modalAssessorId],
        scopeType: modalScopeType,
        roleAssessor: modalRole,
        stage: modalStage,
        targetEmployeeIds: modalScopeType === "INDIVIDUAL" ? modalSelectedTargetEmpIds : [],
        assessorDeptId: modalScopeType === "DEPARTMENT" ? modalDeptId : null,
        notes: modalNotes,
      };

      const res = await fetch("/api/admin/assessor-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan penugasan asesor.");

      Swal.fire({
        icon: "success",
        title: "Penugasan Berhasil",
        text: `Berhasil menambahkan ${data.count || 1} aturan penugasan asesor.`,
        timer: 1500,
        showConfirmButton: false,
      });

      setIsAddModalOpen(false);
      setModalSelectedTargetEmpIds([]);
      setModalNotes("");
      fetchAssignments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter candidates for target employee in modal
  const modalTargetCandidates = useMemo(() => {
    return employees.filter((e) => {
      if (e.id === modalAssessorId) return false; // cannot assess self
      if (!modalTargetEmpSearch.trim()) return true;
      const q = modalTargetEmpSearch.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        (e.jobPosition && e.jobPosition.toLowerCase().includes(q))
      );
    });
  }, [employees, modalAssessorId, modalTargetEmpSearch]);

  const currentPeriodName = periods.find((p) => p.id === selectedPeriodId)?.name || "Periode";

  return (
    <div className="space-y-5">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Penugasan</span>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{assignments.length}</div>
          <p className="mt-1 text-xs text-slate-500">Aturan penilai aktif pada {currentPeriodName}</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Asesor Unik</span>
            <span className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-700">
            {new Set(assignments.map((a) => a.assessorId)).size}
          </div>
          <p className="mt-1 text-xs text-blue-600">Pejabat/karyawan yang bertindak sebagai asesor</p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">Karyawan Dinilai</span>
            <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
              <Briefcase className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-700">
            {new Set(assignments.map((a) => a.targetEmployeeId).filter(Boolean)).size}
          </div>
          <p className="mt-1 text-xs text-indigo-600">Target penugasan individual terdaftar</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Parameter Terhubung</span>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {new Set(assignments.map((a) => a.categoryId)).size}
          </div>
          <p className="mt-1 text-xs text-emerald-600">Kategori/parameter KPI berpenilai</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Filter Penugasan Asesor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAssignments()}
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
              Tambah Asesor
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

          {/* Job Level */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Job Level</label>
            <select
              value={selectedJobLevelId}
              onChange={(e) => setSelectedJobLevelId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Job Level</option>
              {jobLevels.map((jl) => (
                <option key={jl.id} value={jl.id}>
                  {jl.name}
                </option>
              ))}
            </select>
          </div>

          {/* Jabatan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Jabatan</label>
            <select
              value={selectedJobPositionId}
              onChange={(e) => setSelectedJobPositionId(e.target.value)}
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

          {/* Role Asesor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Role Asesor</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">Semua Role</option>
              <option value="ATASAN_LANGSUNG">Atasan Langsung</option>
              <option value="PENILAI_1">Penilai 1</option>
              <option value="PENILAI_2">Penilai 2</option>
              <option value="REVIEWER">Reviewer</option>
              <option value="HRD">HR / Verifikator</option>
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

          {/* Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Pencarian</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Target / Asesor / NIK..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Relasi Banner: Employee → Asesor → Role → Tahap Penilaian → Periode */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Relasi Asesor:</span>
        <span className="font-medium text-slate-900">Employee (Target)</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-blue-700">Asesor Penilai</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-indigo-700">Role Asesor</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-emerald-700">Tahap Penilaian</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-800">Periode KPI</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Memuat matriks penugasan asesor...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => fetchAssignments()}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-700">Belum ada penugasan asesor yang terdaftar</p>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Gunakan tombol &quot;Tambah Asesor&quot; untuk menetapkan penilai bagi karyawan atau departemen pada periode ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Target (Karyawan / Dept)</th>
                  <th className="py-2.5 px-3">Asesor Penilai</th>
                  <th className="py-2.5 px-3">Role Asesor</th>
                  <th className="py-2.5 px-3">Tahap</th>
                  <th className="py-2.5 px-3">Parameter KPI</th>
                  <th className="py-2.5 px-3">Cakupan</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Target */}
                    <td className="py-2 px-3">
                      {row.scopeType === "INDIVIDUAL" && row.targetEmployeeName ? (
                        <div>
                          <div className="font-semibold text-slate-900">{row.targetEmployeeName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{row.targetEmployeeNik}</div>
                          <div className="text-[10px] text-slate-400">
                            {row.targetEmployeePosition} • {row.targetEmployeeJobLevelName}
                          </div>
                        </div>
                      ) : row.scopeType === "DEPARTMENT" ? (
                        <div>
                          <div className="font-semibold text-slate-900">
                            Departemen: {row.targetDepartmentName || row.assessorDepartmentName || "Semua Departemen"}
                          </div>
                          <div className="text-[10px] text-slate-500">Seluruh karyawan dalam lingkup unit</div>
                        </div>
                      ) : (
                        <div className="font-semibold text-slate-900">Semua Karyawan (Global)</div>
                      )}
                    </td>

                    {/* Asesor */}
                    <td className="py-2 px-3">
                      <div className="font-semibold text-blue-900">{row.assessorName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.assessorNik}</div>
                      <div className="text-[10px] text-slate-400">{row.assessorPosition}</div>
                    </td>

                    {/* Role */}
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
                        <ShieldCheck className="h-3 w-3" />
                        {ROLE_LABELS[row.roleAssessor || ""] || row.roleAssessor || "Penilai"}
                      </span>
                    </td>

                    {/* Tahap */}
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <Calendar className="h-3 w-3" />
                        {STAGE_LABELS[row.stage || ""] || row.stage || "Bulanan"}
                      </span>
                    </td>

                    {/* Parameter */}
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-800">{row.categoryName}</div>
                      <div className="text-[10px] text-slate-400">
                        Template: {row.templateName}
                        {row.categoryWeight ? ` (${row.categoryWeight}%)` : ""}
                      </div>
                    </td>

                    {/* Cakupan */}
                    <td className="py-2 px-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
                        {row.scopeType}
                      </span>
                    </td>

                    {/* Aksi */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleDelete(row)}
                        title="Hapus Penugasan Asesor"
                        className="rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah Asesor */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tambah Penugasan Asesor KPI</h3>
                <p className="text-xs text-slate-500">
                  Tentukan siapa penilai (Asesor) dan siapa karyawan yang dinilai pada tahap evaluasi tertentu.
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
              {/* Periode & Asesor */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Asesor Penilai <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalAssessorId}
                    onChange={(e) => setModalAssessorId(Number(e.target.value))}
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
                    Role Asesor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalRole}
                    onChange={(e) => setModalRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="PENILAI_1">Penilai 1</option>
                    <option value="PENILAI_2">Penilai 2</option>
                    <option value="ATASAN_LANGSUNG">Atasan Langsung</option>
                    <option value="REVIEWER">Reviewer</option>
                    <option value="HRD">HR / Verifikator</option>
                  </select>
                </div>
              </div>

              {/* Tahap Penilaian & Parameter */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Parameter KPI <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalCategoryIds[0] || ""}
                    onChange={(e) => {
                      if (e.target.value === "ALL") {
                        setModalCategoryIds(parameters.map((p) => p.id));
                      } else {
                        setModalCategoryIds([Number(e.target.value)]);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="ALL">Semua Parameter KPI</option>
                    {parameters.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.templateName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scope Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Cakupan Penilaian</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalScopeType("INDIVIDUAL")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalScopeType === "INDIVIDUAL"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Karyawan Tertentu
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalScopeType("DEPARTMENT")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalScopeType === "DEPARTMENT"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Satu Departemen
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalScopeType("GLOBAL")}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition ${
                      modalScopeType === "GLOBAL"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Global (Semua)
                  </button>
                </div>
              </div>

              {/* Scope Specific Inputs */}
              {modalScopeType === "DEPARTMENT" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Pilih Departemen Target <span className="text-rose-500">*</span>
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

              {modalScopeType === "INDIVIDUAL" && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Pilih Karyawan Target ({modalSelectedTargetEmpIds.length} dipilih)
                    </span>
                    <input
                      type="text"
                      placeholder="Cari target..."
                      value={modalTargetEmpSearch}
                      onChange={(e) => setModalTargetEmpSearch(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-hidden w-48"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                    {modalTargetCandidates.slice(0, 100).map((e) => {
                      const isChecked = modalSelectedTargetEmpIds.includes(e.id);
                      return (
                        <label
                          key={e.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(ev) => {
                              if (ev.target.checked) {
                                setModalSelectedTargetEmpIds((prev) => [...prev, e.id]);
                              } else {
                                setModalSelectedTargetEmpIds((prev) => prev.filter((id) => id !== e.id));
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <span className="font-semibold text-slate-900">{e.name}</span>
                            <span className="ml-1 text-[11px] text-slate-500 font-mono">({e.nik})</span>
                            <span className="ml-2 text-[11px] text-slate-400">
                              - {e.jobPosition || "Karyawan"}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Catatan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan / Alasan Penugasan</label>
                <textarea
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Misal: Penugasan atasan langsung untuk evaluasi bulanan 2026..."
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
                Simpan Penugasan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
