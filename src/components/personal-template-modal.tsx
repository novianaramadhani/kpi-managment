"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  User,
  Search,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  Building2,
  Briefcase,
  Loader2,
} from "lucide-react";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, KpiCategory, KpiParameter, KpiTemplate } from "@/db/schema";
import { createPersonalTemplateAction } from "@/lib/personal-template-actions";

interface PersonalTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  templates: KpiTemplate[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  categories: KpiCategory[];
  parameters?: KpiParameter[];
  onSuccess?: (newTemplateId: number) => void;
}

export function PersonalTemplateModal({
  isOpen,
  onClose,
  employees,
  templates,
  departments,
  jobLevels,
  jobPositions = [],
  categories,
  parameters = [],
  onSuccess,
}: PersonalTemplateModalProps) {
  const router = useRouter();

  // Search & Selection State
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedBaseTemplateId, setSelectedBaseTemplateId] = useState<number | null>(null);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close modal with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Click outside search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered active employees
  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 15);
    return employees
      .filter((e) => {
        const nameMatch = (e.name || "").toLowerCase().includes(q);
        const nikMatch = (e.nik || "").toLowerCase().includes(q);
        const posMatch = (e.jobPosition || "").toLowerCase().includes(q);
        return nameMatch || nikMatch || posMatch;
      })
      .slice(0, 20);
  }, [employees, employeeSearch]);

  // Selected Employee Details
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const levelMap = useMemo(() => new Map(jobLevels.map((l) => [l.id, l])), [jobLevels]);

  // Standard (non-custom) active templates available for cloning
  const standardTemplates = useMemo(() => {
    return templates.filter((t) => !t.isCustom && t.isActive);
  }, [templates]);

  // Auto-detect best matching base template when employee is selected
  useEffect(() => {
    if (!selectedEmployee) {
      setSelectedBaseTemplateId(null);
      setCustomTemplateName("");
      return;
    }

    // Set default template name
    const jobTitle = selectedEmployee.jobPosition || "Karyawan";
    setCustomTemplateName(`[Personal] ${selectedEmployee.name} - ${jobTitle}`);

    // Priority 1: Match by Job Position
    let matchedTpl: KpiTemplate | undefined = undefined;
    if (selectedEmployee.jobPositionId) {
      matchedTpl = standardTemplates.find(
        (t) => t.jobPositionId === selectedEmployee.jobPositionId
      );
    }

    // Priority 2: Match by Department and Job Level
    if (!matchedTpl) {
      matchedTpl = standardTemplates.find(
        (t) =>
          t.departmentId === selectedEmployee.departmentId &&
          t.jobLevelId === selectedEmployee.jobLevelId
      );
    }

    // Priority 3: Match by Department only
    if (!matchedTpl) {
      matchedTpl = standardTemplates.find(
        (t) => t.departmentId === selectedEmployee.departmentId
      );
    }

    if (matchedTpl) {
      setSelectedBaseTemplateId(matchedTpl.id);
    } else {
      setSelectedBaseTemplateId(null);
    }
  }, [selectedEmployee, standardTemplates]);

  // Selected Base Template Details
  const selectedBaseTemplate = useMemo(() => {
    if (!selectedBaseTemplateId) return null;
    return standardTemplates.find((t) => t.id === selectedBaseTemplateId) || null;
  }, [standardTemplates, selectedBaseTemplateId]);

  // Categories & Parameters of the selected Base Template
  const baseCategories = useMemo(() => {
    if (!selectedBaseTemplateId) return [];
    return categories
      .filter((c) => c.templateId === selectedBaseTemplateId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, selectedBaseTemplateId]);

  const baseParamCount = useMemo(() => {
    const catIds = new Set(baseCategories.map((c) => c.id));
    return parameters.filter((p) => catIds.has(p.categoryId)).length;
  }, [baseCategories, parameters]);

  // Submit Handler
  const handleCreate = async () => {
    if (!selectedEmployeeId || !selectedEmployee) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Silakan pilih karyawan pemilik template terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    if (!customTemplateName.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Nama Template Diperlukan",
        text: "Silakan masukkan nama template personal.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPersonalTemplateAction({
        employeeId: selectedEmployeeId,
        baseTemplateId: selectedBaseTemplateId || null,
        customName: customTemplateName.trim(),
        description: description.trim(),
      });

      if (!res.success || !res.templateId) {
        throw new Error(res.error || "Gagal membuat template personal.");
      }

      await Swal.fire({
        icon: "success",
        title: "Template Personal Dibuat",
        text: `Template personal untuk ${selectedEmployee.name} berhasil dibuat. Membuka editor...`,
        timer: 1500,
        showConfirmButton: false,
      });

      onSuccess?.(res.templateId);
      onClose();
      router.push(`/setup/templates/${res.templateId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data.";
      Swal.fire({
        icon: "error",
        title: "Gagal Membuat Template",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personal-tpl-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-400/30 text-blue-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="personal-tpl-title" className="text-base font-bold text-white leading-tight">
                Buat Template Penilaian Personal
              </h2>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Kloning struktur template standar khusus untuk satu orang karyawan dan jabatannya
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs">
          {/* 1. Pemilihan Karyawan */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-slate-700">
              Pilih Karyawan <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={
                    selectedEmployee && !isDropdownOpen
                      ? `${selectedEmployee.name} (${selectedEmployee.nik}) - ${selectedEmployee.jobPosition}`
                      : employeeSearch
                  }
                  onChange={(e) => {
                    setEmployeeSearch(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Ketik nama karyawan atau NIK..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {(selectedEmployeeId || employeeSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmployeeId(null);
                      setEmployeeSearch("");
                      setIsDropdownOpen(true);
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Hapus pilihan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dropdown Options */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <div className="px-4 py-3 text-center text-slate-500 text-xs">
                      Tidak ada karyawan yang cocok dengan pencarian.
                    </div>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const dept = deptMap.get(emp.departmentId);
                      const isSelected = emp.id === selectedEmployeeId;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmployeeId(emp.id);
                            setIsDropdownOpen(false);
                            setEmployeeSearch("");
                          }}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50/80 transition flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected ? "bg-blue-50 font-semibold" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>NIK: {emp.nik}</span>
                                <span>•</span>
                                <span className="truncate">{emp.jobPosition || "Karyawan"}</span>
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium shrink-0">
                            {dept?.name || "-"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Employee Information Card */}
            {selectedEmployee && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Departemen</div>
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {deptMap.get(selectedEmployee.departmentId)?.name || "-"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Jabatan (Job Position)</div>
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {selectedEmployee.jobPosition || "-"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Job Level</div>
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {levelMap.get(selectedEmployee.jobLevelId)?.name || "-"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Pemilihan Template Acuan (Base Template) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Template Acuan (Cetak Biru) <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              {selectedBaseTemplate ? (
                <span className="text-[11px] text-blue-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Template rekomendasi terdeteksi
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 font-normal">
                  Bisa tanpa referensi (buat dari nol)
                </span>
              )}
            </div>
            <select
              value={selectedBaseTemplateId ?? ""}
              onChange={(e) => setSelectedBaseTemplateId(Number(e.target.value) || null)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            >
              <option value="">Tanpa Template Acuan (Mulai dari Template Kosong)</option>
              {standardTemplates.map((t) => {
                const dep = deptMap.get(t.departmentId);
                const lvl = levelMap.get(t.jobLevelId);
                return (
                  <option key={t.id} value={t.id}>
                    {t.name} ({dep?.name || "Semua"} • {lvl?.name || "-"})
                  </option>
                );
              })}
            </select>

            {/* Keterangan jika Tanpa Template Acuan */}
            {!selectedBaseTemplateId && selectedEmployee && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2 mt-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-700">Tanpa acuan cetak biru:</span> Template personal akan dibuat kosong tanpa indikator awal. Anda dapat langsung menyusun kategori dan indikator KPI secara bebas dari nol di halaman editor setelah template dibuat.
                </div>
              </div>
            )}

            {/* Pratinjau Kategori & Indikator dari Template Acuan */}
            {selectedBaseTemplate && (
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Struktur yang akan disalin:
                  </span>
                  <span className="text-[11px] font-normal text-blue-700">
                    {baseCategories.length} Kategori • {baseParamCount} Indikator
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {baseCategories.map((c) => (
                    <div
                      key={c.id}
                      className="px-2.5 py-1.5 bg-white rounded-lg border border-blue-100 text-[11px] text-slate-700 flex items-center justify-between"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="font-semibold text-blue-700 shrink-0 ml-1">
                        {Math.round(Number(c.weight) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Nama Template Personal */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Nama Template Personal <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customTemplateName}
              onChange={(e) => setCustomTemplateName(e.target.value)}
              placeholder="Contoh: [Personal] FERRY YUDI - Officer Purchasing"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 4. Deskripsi / Catatan Khusus */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Keterangan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan penyesuaian target kerja, indikator khusus, atau target pencapaian..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitting || !selectedEmployeeId || !customTemplateName.trim()}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{selectedBaseTemplateId ? "Menduplikasi Template..." : "Membuat Template..."}</span>
              </>
            ) : (
              <>
                <span>{selectedBaseTemplateId ? "Kloning & Buka Editor" : "Buat & Buka Editor"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
