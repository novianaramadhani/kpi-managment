"use client";

import React, { useState, useMemo, useTransition } from "react";
import type { Department, Employee, JobLevel, KpiPeriod, KpiTemplate } from "@/db/schema";
import Swal from "sweetalert2";
import { CheckSquare, Square, Layers, Search, ArrowRight, CheckCircle2 } from "lucide-react";
import { Table, td, th } from "./ui";

interface BulkTemplateAssignerProps {
  periods: KpiPeriod[];
  departments: Department[];
  jobLevels: JobLevel[];
  employees: Employee[];
  templates: KpiTemplate[];
}

export function BulkTemplateAssigner({
  periods,
  departments,
  jobLevels,
  employees,
  templates,
}: BulkTemplateAssignerProps) {
  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod ? activePeriod.id : 0);

  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [targetTemplateId, setTargetTemplateId] = useState<number | "">("");

  const [isPending, startTransition] = useTransition();

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const levelMap = useMemo(() => new Map(jobLevels.map((l) => [l.id, l.name])), [jobLevels]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.isActive) return false;
      if (selectedDeptId !== "ALL" && emp.departmentId !== Number(selectedDeptId)) return false;
      if (selectedLevelId !== "ALL" && emp.jobLevelId !== Number(selectedLevelId)) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        emp.jobPosition.toLowerCase().includes(q)
      );
    });
  }, [employees, selectedDeptId, selectedLevelId, searchQuery]);

  const isAllSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((emp) => selectedEmployeeIds.includes(emp.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(filteredEmployees.map((e) => e.id));
    }
  };

  const handleToggleSelectEmp = (id: number) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyBulkTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetTemplateId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Template",
        text: "Pilih template KPI yang akan dipasangkan ke karyawan terpilih.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (selectedEmployeeIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Pilih minimal satu karyawan melalui checkbox.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    const tpl = templates.find((t) => t.id === Number(targetTemplateId));
    const confirm = await Swal.fire({
      title: "Pasang Template Massal?",
      html: `Template <b>"${tpl?.name}"</b> akan dipasangkan ke <b>${selectedEmployeeIds.length} karyawan</b> terpilih pada periode ini.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Pasangkan",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/bulk-template-assignment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: selectedPeriodId,
            templateId: Number(targetTemplateId),
            employeeIds: selectedEmployeeIds,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memasang template");

        void Swal.fire({
          icon: "success",
          title: "Berhasil Dipasang!",
          text: `Template KPI berhasil diterapkan ke ${data.updatedCount} formulir penilaian karyawan.`,
          confirmButtonColor: "#0f766e",
          timer: 2000,
        });

        setSelectedEmployeeIds([]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
        void Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "#0f766e" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Bulk Action Bar */}
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Periode KPI
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year} {p.status === "ACTIVE" ? "(Aktif)" : `(${p.status})`}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Departemen
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="ALL">Semua Departemen</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Job Level Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Job Level
            </label>
            <select
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="ALL">Semua Level</option>
              {jobLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Cari Karyawan
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIK, Nama..."
                className="w-48 rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Bulk Action Controls */}
        <form onSubmit={handleApplyBulkTemplate} className="flex flex-wrap items-center gap-2 border-t pt-3 md:border-t-0 md:pt-0">
          <div className="flex items-center gap-2">
            <select
              value={targetTemplateId}
              onChange={(e) => setTargetTemplateId(e.target.value ? Number(e.target.value) : "")}
              className="rounded-md border border-teal-300 bg-teal-50/50 px-3 py-1.5 text-sm font-semibold text-teal-900 shadow-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="">-- Pilih Template Target --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isPending || selectedEmployeeIds.length === 0 || !targetTemplateId}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" />
              Terapkan ke ({selectedEmployeeIds.length}) Karyawan
            </button>
          </div>
        </form>
      </div>

      {/* Employees Table with Checkboxes */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-12 px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="rounded text-teal-600 focus:outline-none"
                  title={isAllSelected ? "Batal pilih semua" : "Pilih semua yang tampil"}
                >
                  {isAllSelected ? (
                    <CheckSquare className="h-4 w-4 text-teal-700" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400" />
                  )}
                </button>
              </th>
              <th className={th}>NIK & Nama Karyawan</th>
              <th className={th}>Departemen</th>
              <th className={th}>Jabatan & Job Level</th>
              <th className={th}>Unit Operasional</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-500">
                  Tidak ada data karyawan yang cocok.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const isChecked = selectedEmployeeIds.includes(emp.id);
                return (
                  <tr
                    key={emp.id}
                    onClick={() => handleToggleSelectEmp(emp.id)}
                    className={`cursor-pointer transition-colors ${
                      isChecked ? "bg-teal-50/50 hover:bg-teal-50" : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleToggleSelectEmp(emp.id)}
                        className="rounded text-teal-600 focus:outline-none"
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-teal-700" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300" />
                        )}
                      </button>
                    </td>
                    <td className={td}>
                      <div className="font-semibold text-slate-900">{emp.name}</div>
                      <div className="font-mono text-xs text-slate-500">{emp.nik}</div>
                    </td>
                    <td className={`${td} text-slate-700`}>
                      {deptMap.get(emp.departmentId) ?? "-"}
                    </td>
                    <td className={td}>
                      <div className="font-medium text-slate-800">{emp.jobPosition}</div>
                      <div className="text-xs text-slate-500">
                        {levelMap.get(emp.jobLevelId) ?? "-"}
                      </div>
                    </td>
                    <td className={`${td} text-slate-600`}>{emp.operatingUnit || "HO"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
