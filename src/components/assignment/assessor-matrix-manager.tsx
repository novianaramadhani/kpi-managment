"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import { Search, RefreshCw } from "lucide-react";

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

interface TemplateOption {
  id: number;
  name: string;
  code?: string | null;
  departmentId?: number;
  jobLevelId?: number;
  jobPositionId?: number | null;
  employeeId?: number | null;
  isCustom?: boolean;
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

interface GroupedTemplateAssessorRow extends AssessorAssignmentRow {
  assignmentIds: number[];
  categoryCount: number;
}

interface Props {
  periods: KpiPeriod[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions: JobPosition[];
  employees: EmployeeOption[];
  templates: TemplateOption[];
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
  employees,
  templates,
  parameters,
}: Props) {
  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(
    periods.find((p) => p.status === "ACTIVE")?.id || periods[0]?.id || 0
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ASSIGNED" | "UNASSIGNED">("ALL");
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
  const [modalTemplateId, setModalTemplateId] = useState<number | "ALL">(
    templates.length > 0 ? templates[0].id : "ALL"
  );
  const [modalScopeType, setModalScopeType] = useState<"INDIVIDUAL" | "DEPARTMENT" | "GLOBAL">(
    "INDIVIDUAL"
  );
  const [modalDeptId, setModalDeptId] = useState<number | null>(null);
  const [modalSelectedTargetEmpIds, setModalSelectedTargetEmpIds] = useState<number[]>([]);
  const [modalTargetEmpSearch, setModalTargetEmpSearch] = useState<string>("");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Lookup maps
  const deptMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments]
  );
  const levelMap = useMemo(
    () => new Map(jobLevels.map((l) => [l.id, l])),
    [jobLevels]
  );
  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  );

  // Group raw category-level rows into 1 row per Template KPI assignment
  const groupedAssignments = useMemo<GroupedTemplateAssessorRow[]>(() => {
    const map = new Map<string, GroupedTemplateAssessorRow>();
    for (const row of assignments) {
      const key = `${row.periodId}|${row.templateId}|${row.assessorId}|${row.scopeType}|${
        row.targetEmployeeId ?? "NULL"
      }|${row.targetDepartmentId ?? "NULL"}|${row.roleAssessor ?? ""}|${row.stage ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.assignmentIds.push(row.id);
        existing.categoryCount += 1;
      } else {
        map.set(key, {
          ...row,
          assignmentIds: [row.id],
          categoryCount: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [assignments]);

  // Map templateId -> list of grouped assessor assignments
  const assessorsByTemplateMap = useMemo(() => {
    const map = new Map<number, GroupedTemplateAssessorRow[]>();
    for (const grp of groupedAssignments) {
      const arr = map.get(grp.templateId) || [];
      arr.push(grp);
      map.set(grp.templateId, arr);
    }
    return map;
  }, [groupedAssignments]);

  // Fetch Assessor Assignments for selected period
  const fetchAssignments = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        periodId: String(selectedPeriodId),
      });
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
  }, [selectedPeriodId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Enrich templates with owner employee, department, and assigned assessors
  const enrichedTemplateRows = useMemo(() => {
    return templates.map((tpl) => {
      const dept = tpl.departmentId ? deptMap.get(tpl.departmentId) || null : null;
      const jobLevel = tpl.jobLevelId ? levelMap.get(tpl.jobLevelId) || null : null;
      const ownerEmp = tpl.employeeId ? employeeMap.get(tpl.employeeId) || null : null;
      const tplAssessors = assessorsByTemplateMap.get(tpl.id) || [];

      return {
        tpl,
        dept,
        jobLevel,
        ownerEmp,
        tplAssessors,
        hasAssessor: tplAssessors.length > 0,
      };
    });
  }, [templates, deptMap, levelMap, employeeMap, assessorsByTemplateMap]);

  const counts = useMemo(() => {
    let assigned = 0;
    let unassigned = 0;
    for (const item of enrichedTemplateRows) {
      if (item.hasAssessor) assigned++;
      else unassigned++;
    }
    return {
      total: enrichedTemplateRows.length,
      assigned,
      unassigned,
    };
  }, [enrichedTemplateRows]);

  // Filter template rows
  const filteredTemplateRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedTemplateRows.filter((item) => {
      if (selectedDeptId !== "ALL" && String(item.tpl.departmentId) !== selectedDeptId) {
        return false;
      }
      if (statusFilter === "ASSIGNED" && !item.hasAssessor) return false;
      if (statusFilter === "UNASSIGNED" && item.hasAssessor) return false;

      if (q) {
        const matchTpl = item.tpl.name.toLowerCase().includes(q);
        const matchDept = item.dept
          ? item.dept.name.toLowerCase().includes(q) || item.dept.code.toLowerCase().includes(q)
          : false;
        const matchOwner = item.ownerEmp
          ? item.ownerEmp.name.toLowerCase().includes(q) ||
            item.ownerEmp.nik.toLowerCase().includes(q)
          : false;
        const matchAssessor = item.tplAssessors.some(
          (a) =>
            a.assessorName.toLowerCase().includes(q) ||
            a.assessorNik.toLowerCase().includes(q) ||
            (a.targetEmployeeName && a.targetEmployeeName.toLowerCase().includes(q))
        );
        if (!matchTpl && !matchDept && !matchOwner && !matchAssessor) return false;
      }

      return true;
    });
  }, [enrichedTemplateRows, selectedDeptId, statusFilter, searchQuery]);

  // Open Assign Modal for a specific Template KPI row
  const handleOpenAssignForTemplate = (tpl: TemplateOption) => {
    setModalTemplateId(tpl.id);
    if (tpl.employeeId) {
      setModalScopeType("INDIVIDUAL");
      setModalSelectedTargetEmpIds([tpl.employeeId]);
    } else if (tpl.departmentId) {
      setModalScopeType("DEPARTMENT");
      setModalDeptId(tpl.departmentId);
      setModalSelectedTargetEmpIds([]);
    } else {
      setModalScopeType("GLOBAL");
      setModalSelectedTargetEmpIds([]);
    }
    setModalTargetEmpSearch("");
    setModalNotes("");
    setIsAddModalOpen(true);
  };

  // Delete Template Assignment (deletes all category rows belonging to this template assignment)
  const handleDelete = async (row: GroupedTemplateAssessorRow) => {
    const result = await Swal.fire({
      title: "Hapus Penugasan Penilai?",
      html: `Apakah Anda yakin ingin menghapus penugasan penilai <b>${row.assessorName}</b> pada template <b>${row.templateName}</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const idsParam = row.assignmentIds.join(",");
      const res = await fetch(`/api/admin/assessor-assignments?ids=${idsParam}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus penugasan asesor.");

      Swal.fire({
        icon: "success",
        title: "Terhapus",
        text: "Penugasan penilai berhasil dihapus.",
        timer: 1400,
        showConfirmButton: false,
      });
      fetchAssignments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  // Submit Modal Assign Penilai (per Template KPI)
  const handleSubmitAdd = async () => {
    if (!modalAssessorId) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Asesor Penilai",
        text: "Silakan pilih karyawan yang bertindak sebagai penilai.",
      });
      return;
    }

    const resolvedCategoryIds =
      modalTemplateId === "ALL"
        ? parameters.map((p) => p.id)
        : parameters.filter((p) => p.templateId === modalTemplateId).map((p) => p.id);

    if (resolvedCategoryIds.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Template Belum Memiliki Parameter",
        text: "Template KPI yang dipilih belum memiliki parameter/kategori aktif.",
      });
      return;
    }
    if (modalScopeType === "INDIVIDUAL" && modalSelectedTargetEmpIds.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan Dinilai",
        text: "Pilih minimal satu karyawan yang akan dinilai.",
      });
      return;
    }
    if (modalScopeType === "DEPARTMENT" && !modalDeptId) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Departemen",
        text: "Pilih departemen target yang akan dinilai.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        periodId: selectedPeriodId,
        categoryIds: resolvedCategoryIds,
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
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan penugasan penilai.");

      Swal.fire({
        icon: "success",
        title: "Penilai Berhasil Ditugaskan",
        text: "Penugasan penilai pada Template KPI berhasil disimpan.",
        timer: 1400,
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
      if (e.id === modalAssessorId) return false;
      if (!modalTargetEmpSearch.trim()) return true;
      const q = modalTargetEmpSearch.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        (e.jobPosition && e.jobPosition.toLowerCase().includes(q))
      );
    });
  }, [employees, modalAssessorId, modalTargetEmpSearch]);

  return (
    <div className="space-y-4">
      {/* Compact Single-Row Toolbar */}
      <div
        data-tour="step-4-assign-toolbar"
        className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
      >
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama template, karyawan, atau penilai..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden"
            />
          </div>

          {/* Periode */}
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.year})
              </option>
            ))}
          </select>

          {/* Department */}
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="ALL">Semua Departemen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "ALL" | "ASSIGNED" | "UNASSIGNED")
            }
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="ALL">Semua Template ({counts.total})</option>
            <option value="ASSIGNED">Sudah Ada Penilai ({counts.assigned})</option>
            <option value="UNASSIGNED">Belum Ada Penilai ({counts.unassigned})</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            data-tour="step-4-assign-btn"
            onClick={() => {
              if (templates.length > 0) {
                handleOpenAssignForTemplate(templates[0]);
              } else {
                setIsAddModalOpen(true);
              }
            }}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs cursor-pointer"
          >
            + Assign Penilai
          </button>
        </div>
      </div>

      {/* Table of All Existing Templates & Their Assigned Assessors */}
      <div
        data-tour="step-4-assign-table"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Memuat daftar template &amp; penugasan penilai...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-xs font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => fetchAssignments()}
              className="mt-3 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredTemplateRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Tidak ada Template KPI yang sesuai filter
            </p>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Silakan sesuaikan filter departemen atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3.5">Template KPI &amp; Karyawan Dinilai</th>
                  <th className="py-2.5 px-3.5">Departemen</th>
                  <th className="py-2.5 px-3.5">Asesor Penilai</th>
                  <th className="py-2.5 px-3.5">Role &amp; Tahap</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTemplateRows.map(({ tpl, dept, jobLevel, ownerEmp, tplAssessors }) => (
                  <tr key={tpl.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Template KPI & Owner Employee */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900">{tpl.name}</div>
                      {ownerEmp ? (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-700">{ownerEmp.name}</span>{" "}
                          <span className="font-mono text-slate-400">({ownerEmp.nik})</span>
                          {ownerEmp.jobPosition ? ` • ${ownerEmp.jobPosition}` : ""}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Template Standar Departemen
                        </div>
                      )}
                    </td>

                    {/* Departemen */}
                    <td className="py-3 px-3.5">
                      <div className="font-medium text-slate-800">{dept?.name || "-"}</div>
                      <div className="text-[11px] text-slate-400">{jobLevel?.name || "-"}</div>
                    </td>

                    {/* Asesor Penilai */}
                    <td className="py-3 px-3.5">
                      {tplAssessors.length === 0 ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <div className="space-y-2">
                          {tplAssessors.map((a) => (
                            <div key={a.id}>
                              <div className="font-semibold text-slate-900">
                                {a.assessorName}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                <span className="font-mono">{a.assessorNik}</span>
                                {a.assessorPosition ? ` • ${a.assessorPosition}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Role & Tahap */}
                    <td className="py-3 px-3.5">
                      {tplAssessors.length === 0 ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <div className="space-y-2">
                          {tplAssessors.map((a) => (
                            <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                                {ROLE_LABELS[a.roleAssessor || ""] ||
                                  a.roleAssessor ||
                                  "Penilai"}
                              </span>
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {STAGE_LABELS[a.stage || ""] || a.stage || "Bulanan"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3.5">
                      {tplAssessors.length > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                          ASSIGNED ({tplAssessors.length})
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                          BELUM ADA PENILAI
                        </span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-3 px-3.5 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenAssignForTemplate(tpl)}
                          className="rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                        >
                          + Assign Penilai
                        </button>
                        {tplAssessors.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleDelete(a)}
                            title={`Hapus penilai ${a.assessorName}`}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                          >
                            Hapus
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Assign Penilai */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Assign Penilai (Asesor KPI)
                </h3>
                <p className="text-xs text-slate-500">
                  Tentukan asesor penilai untuk Template KPI yang dipilih.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Template KPI */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Template KPI <span className="text-rose-500">*</span>
                </label>
                <select
                  value={modalTemplateId}
                  onChange={(e) => {
                    if (e.target.value === "ALL") {
                      setModalTemplateId("ALL");
                    } else {
                      const tplId = Number(e.target.value);
                      setModalTemplateId(tplId);
                      const found = templates.find((t) => t.id === tplId);
                      if (found?.employeeId) {
                        setModalScopeType("INDIVIDUAL");
                        setModalSelectedTargetEmpIds([found.employeeId]);
                      } else if (found?.departmentId) {
                        setModalScopeType("DEPARTMENT");
                        setModalDeptId(found.departmentId);
                      }
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="ALL">Semua Template KPI</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Asesor & Role */}
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

              {/* Tahap Penilaian & Cakupan */}
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
                    Cakupan Penilaian
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModalScopeType("INDIVIDUAL")}
                      className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold text-center transition cursor-pointer ${
                        modalScopeType === "INDIVIDUAL"
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Individu
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalScopeType("DEPARTMENT")}
                      className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold text-center transition cursor-pointer ${
                        modalScopeType === "DEPARTMENT"
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Departemen
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalScopeType("GLOBAL")}
                      className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold text-center transition cursor-pointer ${
                        modalScopeType === "GLOBAL"
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Global
                    </button>
                  </div>
                </div>
              </div>

              {/* Target Karyawan (jika INDIVIDUAL) */}
              {modalScopeType === "INDIVIDUAL" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Karyawan Dinilai ({modalSelectedTargetEmpIds.length} dipilih)
                    </label>
                    <input
                      type="text"
                      placeholder="Cari karyawan..."
                      value={modalTargetEmpSearch}
                      onChange={(e) => setModalTargetEmpSearch(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 p-1">
                    {modalTargetCandidates.slice(0, 60).map((emp) => {
                      const checked = modalSelectedTargetEmpIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer rounded ${
                            checked ? "bg-blue-50 font-semibold" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setModalSelectedTargetEmpIds((prev) => [...prev, emp.id]);
                                } else {
                                  setModalSelectedTargetEmpIds((prev) =>
                                    prev.filter((id) => id !== emp.id)
                                  );
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600"
                            />
                            <span>
                              {emp.name} ({emp.nik})
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {emp.jobPosition || "-"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Departemen (jika DEPARTMENT) */}
              {modalScopeType === "DEPARTMENT" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Departemen Dinilai <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={modalDeptId ?? ""}
                    onChange={(e) => setModalDeptId(Number(e.target.value) || null)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">-- Pilih Departemen --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitAdd}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Penilai"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
