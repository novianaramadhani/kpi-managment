"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserCheck, ShieldCheck, Search, Check } from "lucide-react";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, KpiCategory, KpiPeriod, KpiTemplate } from "@/db/schema";
import { getTemplateAssessorsAction, saveTemplateAssessorsAction } from "@/lib/actions";

interface TemplateAssessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: KpiTemplate | null;
  department?: Department;
  jobLevel?: JobLevel;
  categories: KpiCategory[];
  employees: Employee[];
  activePeriod?: KpiPeriod;
  periods?: KpiPeriod[];
}

export function TemplateAssessorModal({
  isOpen,
  onClose,
  template,
  department,
  jobLevel,
  categories,
  employees,
  activePeriod,
  periods = [],
}: TemplateAssessorModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod?.id ?? 0);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [assessorMap, setAssessorMap] = useState<Record<number, number | null>>({});
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState("");

  // Categories belonging to this template
  const tplCategories = useMemo(() => {
    if (!template) return [];
    return categories
      .filter((c) => c.templateId === template.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }, [template, categories]);

  // Set default period if activePeriod changes
  useEffect(() => {
    if (activePeriod?.id) {
      setSelectedPeriodId(activePeriod.id);
    }
  }, [activePeriod?.id]);

  // Fetch current assignments for this template when modal opens or period changes
  useEffect(() => {
    if (!isOpen || !template || !selectedPeriodId) return;

    let isMounted = true;
    setIsLoadingAssignments(true);

    getTemplateAssessorsAction(template.id, selectedPeriodId)
      .then((res) => {
        if (!isMounted) return;
        const mapping: Record<number, number | null> = {};
        for (const cat of tplCategories) {
          mapping[cat.id] = null;
        }
        for (const assign of res.assignments) {
          mapping[assign.categoryId] = assign.assessorEmployeeId;
        }
        setAssessorMap(mapping);
      })
      .catch((err) => {
        console.error("Gagal memuat data penilai:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingAssignments(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, template?.id, selectedPeriodId, tplCategories]);

  // Active employees for assessor selection
  const employeeOptions = useMemo(() => {
    return employees
      .filter((e) => e.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  // Filtered employee options based on search query in select
  const filteredEmployeeOptions = useMemo(() => {
    if (!searchEmployeeQuery.trim()) return employeeOptions;
    const q = searchEmployeeQuery.toLowerCase().trim();
    return employeeOptions.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        e.jobPosition.toLowerCase().includes(q)
    );
  }, [employeeOptions, searchEmployeeQuery]);

  const handleSelectAssessor = (categoryId: number, empId: number | null) => {
    setAssessorMap((prev) => ({
      ...prev,
      [categoryId]: empId,
    }));
  };

  const handleSave = () => {
    if (!template || !selectedPeriodId) return;

    const payload = tplCategories.map((c) => ({
      categoryId: c.id,
      assessorEmployeeId: assessorMap[c.id] ?? null,
    }));

    startTransition(async () => {
      try {
        await saveTemplateAssessorsAction({
          templateId: template.id,
          periodId: selectedPeriodId,
          assignments: payload,
        });

        await Swal.fire({
          icon: "success",
          title: "Penilai Berhasil Disimpan",
          text: `Konfigurasi penilai per parameter untuk ${template.name} berhasil diperbarui.`,
          timer: 1600,
          showConfirmButton: false,
        });

        router.refresh();
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan penilai.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#2563eb",
        });
      }
    });
  };

  if (!isOpen || !template) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <UserCheck className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 truncate">
                Assign Penilai KPI per Parameter
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Template: <strong className="text-slate-700">{template.name}</strong> · {department?.name ?? "Umum"} · {jobLevel?.name ?? "Semua Level"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Periode Penilaian */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Periode Penilaian:</span>
            {periods.length > 0 ? (
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none transition cursor-pointer"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.year}) {p.status === "ACTIVE" ? "(Aktif)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-slate-800">
                {activePeriod?.name ?? "Periode Aktif"}
              </span>
            )}
          </div>

          <span className="text-xs text-slate-500">
            {tplCategories.length} Parameter KPI
          </span>
        </div>

        {/* Notice Info Box */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100 flex items-start gap-2.5 text-xs text-blue-900">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Tentukan NIK penilai khusus untuk setiap Parameter KPI template ini. Penilai yang ditugaskan berwenang memberi nilai pada seluruh indikator dalam parameter tersebut. Jika dikosongkan, wewenang otomatis mengikuti hierarki atasan langsung (Appraiser).
          </p>
        </div>

        {/* Modal Body: Parameter Assessor Assignment List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoadingAssignments ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Memuat konfigurasi penilai...
            </div>
          ) : tplCategories.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm font-semibold text-slate-700">Tidak ada parameter di template ini</p>
              <p className="text-xs text-slate-400 mt-1">
                Silakan edit template dan tambahkan parameter terlebih dahulu.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {tplCategories.map((cat, idx) => {
                const assignedEmpId = assessorMap[cat.id];
                const assignedEmp = assignedEmpId ? employees.find((e) => e.id === assignedEmpId) : null;
                const catWeightPct = Math.round(Number(cat.weight) * 100);

                return (
                  <div key={cat.id} className="p-4 bg-white hover:bg-slate-50/50 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Parameter Info */}
                      <div className="space-y-1 min-w-0 max-w-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-sm text-slate-800 truncate">
                            {cat.name}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                            Bobot {catWeightPct}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 pl-7">
                          Tipe parameter: {cat.categoryType}
                        </p>
                      </div>

                      {/* Right: Assessor Dropdown Selector */}
                      <div className="flex-1 sm:max-w-md">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Penilai Ditugaskan (NIK / Nama)
                        </label>
                        <div className="relative">
                          <select
                            value={assignedEmpId ? String(assignedEmpId) : ""}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : null;
                              handleSelectAssessor(cat.id, val);
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none transition cursor-pointer font-medium"
                          >
                            <option value="">
                              [Default] Hierarki Atasan Langsung (Appraiser)
                            </option>
                            {employeeOptions.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                [{emp.nik}] {emp.name} ({emp.jobPosition})
                              </option>
                            ))}
                          </select>
                        </div>

                        {assignedEmp && (
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              NIK: <strong className="text-slate-700">{assignedEmp.nik}</strong> · {assignedEmp.jobPosition}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectAssessor(cat.id, null)}
                              className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {Object.values(assessorMap).filter(Boolean).length} dari {tplCategories.length} parameter memiliki penilai khusus
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || isLoadingAssignments || tplCategories.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Simpan Penilai</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
