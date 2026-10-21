"use client";

import React, { useState, useMemo, useEffect, useTransition } from "react";
import type { Department, Employee, KpiPeriod, KpiTemplate } from "@/db/schema";
import Swal from "sweetalert2";
import { UserCheck, Plus, Trash2, Search, Filter, ShieldCheck, Users, Layers, AlertCircle, CheckCircle2 } from "lucide-react";
import { Table, td, th } from "./ui";

interface AssignmentRow {
  id: number;
  periodId: number;
  categoryId: number;
  categoryName: string;
  categoryWeight: string | number;
  templateId: number;
  templateName: string;
  assessorId: number;
  assessorNik: string;
  assessorName: string;
  assessorPosition: string;
  assessorDeptId: number | null;
  assessorDepartmentName: string | null;
  scopeType: "INDIVIDUAL" | "DEPARTMENT" | "GLOBAL" | string;
  targetDepartmentId: number | null;
  targetDepartmentName: string | null;
  targetEmployeeId: number | null;
  targetEmployeeNik: string | null;
  targetEmployeeName: string | null;
  notes: string | null;
  createdAt: string | Date;
}

interface ParameterItem {
  id: number; // categoryId
  name: string;
  weight: string | number;
  templateId: number;
  templateName: string;
  indicatorCount?: number;
}

interface AssessorAssignmentManagerProps {
  periods: KpiPeriod[];
  departments: Department[];
  employees: Employee[];
  templates: KpiTemplate[];
  parameters: ParameterItem[];
}

export function AssessorAssignmentManager({
  periods,
  departments,
  employees,
  templates,
  parameters,
}: AssessorAssignmentManagerProps) {
  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod ? activePeriod.id : 0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("ALL");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTemplateId, setModalTemplateId] = useState<number | "">("");
  const [selectedParamIds, setSelectedParamIds] = useState<number[]>([]);
  const [scopeType, setScopeType] = useState<"DEPARTMENT" | "INDIVIDUAL">("DEPARTMENT");
  const [assessorDeptId, setAssessorDeptId] = useState<string>("");
  const [targetEmpIds, setTargetEmpIds] = useState<number[]>([]);
  const [selectedAssessorIds, setSelectedAssessorIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  // Sub-filter inside modal for searching assessors & employees
  const [assessorSearch, setAssessorSearch] = useState("");
  const [empSearch, setEmpSearch] = useState("");

  const loadAssignments = async () => {
    if (!selectedPeriodId) return;
    setIsLoading(true);
    try {
      let url = `/api/admin/assessor-assignments?periodId=${selectedPeriodId}`;
      if (selectedTemplateId !== "ALL") {
        url += `&templateId=${selectedTemplateId}`;
      }
      if (selectedDeptFilter !== "ALL") {
        url += `&departmentId=${selectedDeptFilter}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAssignments(data.assignments);
      }
    } catch {
      // Non-blocking error handling
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [selectedPeriodId, selectedTemplateId, selectedDeptFilter]);

  // Parameters filtered by main template filter
  const filteredParameters = useMemo(() => {
    return parameters.filter((p) => {
      if (selectedTemplateId !== "ALL" && p.templateId !== Number(selectedTemplateId)) return false;
      return true;
    });
  }, [parameters, selectedTemplateId]);

  // Grouped assignments by Parameter (categoryId)
  const groupedByParameter = useMemo(() => {
    const map = new Map<number, AssignmentRow[]>();
    for (const row of assignments) {
      if (!map.has(row.categoryId)) {
        map.set(row.categoryId, []);
      }
      map.get(row.categoryId)!.push(row);
    }
    return map;
  }, [assignments]);

  // Modal parameter choices based on modalTemplateId
  const modalAvailableParameters = useMemo(() => {
    if (!modalTemplateId) return [];
    return parameters.filter((p) => p.templateId === Number(modalTemplateId));
  }, [parameters, modalTemplateId]);

  // Modal available assessors filtered by assessor department & search
  const modalAvailableAssessors = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      if (scopeType === "DEPARTMENT" && assessorDeptId) {
        if (emp.departmentId !== Number(assessorDeptId)) return false;
      }
      const q = assessorSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        (emp.jobPosition && emp.jobPosition.toLowerCase().includes(q))
      );
    });
  }, [employees, scopeType, assessorDeptId, assessorSearch]);

  // Modal target employees for INDIVIDUAL NIK override
  const modalTargetEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      const q = empSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        (emp.jobPosition && emp.jobPosition.toLowerCase().includes(q))
      );
    });
  }, [employees, empSearch]);

  const handleOpenAssignModal = (preselectedParamId?: number) => {
    const defaultTpl = preselectedParamId
      ? parameters.find((p) => p.id === preselectedParamId)?.templateId || templates[0]?.id || ""
      : selectedTemplateId !== "ALL"
      ? Number(selectedTemplateId)
      : templates[0]?.id || "";

    setModalTemplateId(defaultTpl);
    setSelectedParamIds(preselectedParamId ? [preselectedParamId] : []);
    setScopeType("DEPARTMENT");
    setAssessorDeptId(departments[0] ? String(departments[0].id) : "");
    setTargetEmpIds([]);
    setSelectedAssessorIds([]);
    setNotes("");
    setAssessorSearch("");
    setEmpSearch("");
    setIsModalOpen(true);
  };

  const handleToggleParamSelect = (id: number) => {
    setSelectedParamIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleToggleAssessorSelect = (id: number) => {
    setSelectedAssessorIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleToggleTargetEmpSelect = (id: number) => {
    setSelectedTargetEmpIds: setSelectedEmp(id);
  };

  const setSelectedEmp = (id: number) => {
    setTargetEmpIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedParamIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Parameter KPI",
        text: "Pilih minimal satu Parameter KPI yang ingin ditugaskan.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    if (selectedAssessorIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih NIK Asesor",
        text: "Pilih minimal satu user/NIK asesor yang berwenang menilai.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    if (scopeType === "INDIVIDUAL" && targetEmpIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan Target",
        text: "Untuk NIK Override, pilih minimal satu karyawan yang akan dinilai oleh asesor tersebut.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/assessor-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: selectedPeriodId,
            categoryIds: selectedParamIds,
            assessorEmployeeIds: selectedAssessorIds,
            scopeType,
            assessorDeptId: scopeType === "DEPARTMENT" && assessorDeptId ? Number(assessorDeptId) : null,
            targetEmployeeIds: targetEmpIds,
            notes,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan penugasan");

        void Swal.fire({
          icon: "success",
          title: "Penugasan Tersimpan!",
          text: `${data.count ?? 1} penugasan asesor berhasil disimpan ke database.`,
          confirmButtonColor: "#0f172a",
          timer: 2000,
          timerProgressBar: true,
        });

        setIsModalOpen(false);
        loadAssignments();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  const handleDeleteAssignment = async (id: number, desc: string) => {
    const confirm = await Swal.fire({
      title: "Hapus Penugasan Asesor?",
      text: `Penugasan untuk "${desc}" akan dihapus dan kembali ke penilai default/atasan langsung.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/assessor-assignments?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus penugasan");

      void Swal.fire({
        icon: "success",
        title: "Dihapus",
        text: "Penugasan asesor telah dihapus.",
        confirmButtonColor: "#0f172a",
        timer: 1500,
      });

      loadAssignments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      void Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#0f172a" });
    }
  };

  // Filter display parameters based on search query
  const displayParameters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return filteredParameters;

    return filteredParameters.filter((param) => {
      const matchParam =
        param.name.toLowerCase().includes(q) ||
        param.templateName.toLowerCase().includes(q);
      const assigned = groupedByParameter.get(param.id) || [];
      const matchAssessor = assigned.some(
        (a) =>
          a.assessorName.toLowerCase().includes(q) ||
          a.assessorNik.toLowerCase().includes(q) ||
          (a.targetEmployeeName && a.targetEmployeeName.toLowerCase().includes(q))
      );
      return matchParam || matchAssessor;
    });
  }, [filteredParameters, searchQuery, groupedByParameter]);

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Periode KPI
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 cursor-pointer"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year} {p.status === "ACTIVE" ? "(Aktif)" : `(${p.status})`}
                </option>
              ))}
            </select>
          </div>

          {/* Template Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Template KPI
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 cursor-pointer"
            >
              <option value="ALL">Semua Template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="min-w-[240px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Cari Parameter / Asesor
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari parameter, NIK, nama..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenAssignModal()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            + Tugaskan Asesor Parameter
          </button>
        </div>
      </div>

      {/* Main Table: Parameter KPI & Assigned Assessors */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={th}>Parameter KPI & Template</th>
              <th className={th}>Bobot & Indikator</th>
              <th className={th}>Asesor Ditugaskan (Many-to-Many)</th>
              <th className={th}>Cakupan / Prioritas</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                  Memuat data penugasan asesor parameter...
                </td>
              </tr>
            ) : displayParameters.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                  Tidak ada parameter KPI yang cocok dengan kriteria pencarian.
                </td>
              </tr>
            ) : (
              displayParameters.map((param) => {
                const assignedList = groupedByParameter.get(param.id) || [];
                const hasCustomAssignment = assignedList.length > 0;

                return (
                  <tr key={param.id} className="hover:bg-slate-50/80 transition">
                    {/* Column 1: Parameter & Template Details */}
                    <td className={`${td} align-top`}>
                      <div className="font-bold text-slate-900 text-sm">{param.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {param.templateName}
                        </span>
                      </div>
                    </td>

                    {/* Column 2: Weight & Child Indicators */}
                    <td className={`${td} align-top`}>
                      <div className="space-y-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          Bobot: {param.weight}%
                        </span>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {param.indicatorCount !== undefined ? `${param.indicatorCount} Indikator KPI` : "Semua Indikator"}
                        </div>
                      </div>
                    </td>

                    {/* Column 3: Assigned Assessors (Many-to-Many) */}
                    <td className={`${td} align-top`}>
                      {hasCustomAssignment ? (
                        <div className="space-y-2">
                          {assignedList.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200 shrink-0">
                                  {a.assessorName.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900">{a.assessorName}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    NIK: {a.assessorNik} · {a.assessorPosition} {a.assessorDepartmentName ? `[${a.assessorDepartmentName}]` : ""}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteAssignment(a.id, `${param.name} → ${a.assessorName}`)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title="Cabut Penugasan Asesor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="inline-flex items-center rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
                            Default: Atasan Langsung (Appraiser 1)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Column 4: Scope / Target */}
                    <td className={`${td} align-top`}>
                      {hasCustomAssignment ? (
                        <div className="space-y-1.5">
                          {assignedList.map((a) => (
                            <div key={a.id} className="text-[11px]">
                              {a.scopeType === "INDIVIDUAL" ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-0.5 text-purple-700 font-bold border border-purple-200">
                                  <span>NIK Override:</span>
                                  <span className="font-normal">{a.targetEmployeeName} ({a.targetEmployeeNik})</span>
                                </span>
                              ) : a.scopeType === "DEPARTMENT" ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-800 font-bold border border-emerald-200">
                                  <span>Assessor Dept:</span>
                                  <span className="font-normal">{a.assessorDepartmentName || "Semua Karyawan"}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-slate-700 font-semibold border border-slate-200">
                                  Global Template
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Hirarki Bawaan</span>
                      )}
                    </td>

                    {/* Column 5: Action */}
                    <td className={`${td} align-top text-right`}>
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(param.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
                        title="Tambah Penugasan Asesor pada Parameter ini"
                      >
                        <Plus className="h-3 w-3 text-slate-500" />
                        <span>+ Asesor</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog: Tugaskan Asesor Parameter */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Penugasan Asesor Parameter KPI
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign penilai di level parameter; seluruh indikator di dalamnya otomatis mengikuti.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAssignment} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Step 1: Template KPI Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  1. Pilih Template KPI <span className="text-rose-500">*</span>
                </label>
                <select
                  value={modalTemplateId}
                  onChange={(e) => {
                    setModalTemplateId(Number(e.target.value));
                    setSelectedParamIds([]);
                  }}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
                >
                  <option value="">-- Pilih Template KPI --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Parameter KPI Selection */}
              {modalTemplateId && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700">
                      2. Pilih Parameter KPI <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {selectedParamIds.length} Parameter Dipilih
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
                    {modalAvailableParameters.length === 0 ? (
                      <p className="p-3 text-center text-slate-400 text-xs">
                        Belum ada parameter pada template ini.
                      </p>
                    ) : (
                      modalAvailableParameters.map((p) => {
                        const isChecked = selectedParamIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                              isChecked
                                ? "bg-white border-slate-800 shadow-2xs"
                                : "bg-white/60 border-slate-200 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleParamSelect(p.id)}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                              />
                              <div>
                                <span className="font-bold text-slate-900">{p.name}</span>
                                <span className="text-[11px] text-slate-400 ml-2">
                                  ({p.indicatorCount || 0} Indikator)
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500">
                              Bobot: {p.weight}%
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Scope Type */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  3. Cakupan Penugasan (Scope) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScopeType("DEPARTMENT")}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition cursor-pointer ${
                      scopeType === "DEPARTMENT"
                        ? "bg-slate-50 border-slate-900 shadow-2xs ring-1 ring-slate-900"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="mt-0.5">
                      <span className={`w-2 h-2 rounded-full inline-block ${scopeType === "DEPARTMENT" ? "bg-emerald-600" : "bg-slate-300"}`} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Departemen Penilai (Assessor Dept)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Pilih departemen penilai (misal HR/HSE), lalu tentukan NIK yang bertugas menilai seluruh karyawan.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScopeType("INDIVIDUAL")}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition cursor-pointer ${
                      scopeType === "INDIVIDUAL"
                        ? "bg-slate-50 border-slate-900 shadow-2xs ring-1 ring-slate-900"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="mt-0.5">
                      <span className={`w-2 h-2 rounded-full inline-block ${scopeType === "INDIVIDUAL" ? "bg-purple-600" : "bg-slate-300"}`} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">NIK Override (Pengecualian Karyawan)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tugaskan penilai khusus untuk individu karyawan tertentu yang membutuhkan asesor berbeda.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Step 3.1: If Scope is DEPARTMENT -> Filter Assessor Department */}
              {scopeType === "DEPARTMENT" && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Departemen Penilai <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={assessorDeptId}
                    onChange={(e) => setAssessorDeptId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 cursor-pointer"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Memilih departemen penilai akan memfilter daftar NIK pada langkah 4 di bawah.
                  </p>
                </div>
              )}

              {/* Step 3.2: If Scope is INDIVIDUAL -> Select Target Employees */}
              {scopeType === "INDIVIDUAL" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700">
                      Pilih Karyawan yang Dinilai (Target) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {targetEmpIds.length} Karyawan Dipilih
                    </span>
                  </div>
                  <input
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Cari NIK atau nama karyawan target..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 mb-2 focus:border-slate-800 focus:outline-none"
                  />
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1">
                    {modalTargetEmployees.slice(0, 40).map((emp) => {
                      const isChecked = targetEmpIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                            isChecked
                              ? "bg-white border-slate-800 shadow-2xs"
                              : "bg-white/60 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleTargetEmpSelect(emp.id)}
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                            />
                            <span className="font-bold text-slate-900">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({emp.nik})</span>
                          </div>
                          <span className="text-[10px] text-slate-500">{emp.jobPosition}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 4: Select Assessor User/NIK (Many-to-Many) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700">
                    4. Pilih User/NIK Asesor Penilai (Mendukung Multi-Asesor) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {selectedAssessorIds.length} Asesor Dipilih
                  </span>
                </div>
                <input
                  type="text"
                  value={assessorSearch}
                  onChange={(e) => setAssessorSearch(e.target.value)}
                  placeholder="Cari NIK atau nama asesor..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 mb-2 focus:border-slate-800 focus:outline-none"
                />
                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1">
                  {modalAvailableAssessors.length === 0 ? (
                    <p className="p-4 text-center text-slate-400 text-xs">
                      Tidak ada karyawan yang cocok dengan kriteria departemen / pencarian.
                    </p>
                  ) : (
                    modalAvailableAssessors.slice(0, 50).map((emp) => {
                      const isChecked = selectedAssessorIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer ${
                            isChecked
                              ? "bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900"
                              : "bg-white/80 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAssessorSelect(emp.id)}
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{emp.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                NIK: {emp.nik} · {emp.jobPosition} [{emp.operatingUnit || "HO"}]
                              </div>
                            </div>
                          </div>
                          {isChecked && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Ditugaskan
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Step 5: Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan / Keterangan Penugasan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Evaluasi K3 khusus proyek A atau SK Penunjukan HR"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Menyimpan..." : "Simpan Penugasan Asesor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
