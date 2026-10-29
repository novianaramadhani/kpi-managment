"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Search,
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, KpiCategory, KpiParameter, KpiTemplate } from "@/db/schema";
import { createPersonalTemplateAction } from "@/lib/personal-template-actions";
import { parseKpiTemplateExcel, type ParseResult } from "@/lib/excel-template-kpi";

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

  // Excel Upload State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setExcelFile(null);
      setParseResult(null);
      setIsParsingExcel(false);
    }
  }, [isOpen]);

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

  // Set karyawan yang sudah memiliki template personal (1 karyawan max 1 template)
  const assignedEmployeeIds = useMemo(() => {
    const set = new Set<number>();
    for (const t of templates) {
      if (t.isCustom && t.employeeId) {
        set.add(t.employeeId);
      }
    }
    return set;
  }, [templates]);

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

    // Format nama simpel tanpa icon/dekorasi
    const jobTitle = selectedEmployee.jobPosition || "Karyawan";
    setCustomTemplateName(`Template KPI ${selectedEmployee.name} - ${jobTitle}`);

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

  // Handle Excel File Selection & Parsing
  const handleFileChange = async (file: File) => {
    setExcelFile(file);
    setIsParsingExcel(true);
    try {
      const res = await parseKpiTemplateExcel(file, 115);
      setParseResult(res);
      if (res.errors.length > 0) {
        void Swal.fire({
          icon: "warning",
          title: "File Excel Memiliki Catatan",
          text: `Ditemukan ${res.errors.length} masalah format pada file Excel. Silakan periksa kembali.`,
          confirmButtonColor: "#2563eb",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca format file Excel.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Parsing File",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
      setParseResult(null);
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleClearExcel = () => {
    setExcelFile(null);
    setParseResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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

    // Validasi penjagaan: 1 karyawan tidak boleh punya 2 template
    if (assignedEmployeeIds.has(selectedEmployeeId)) {
      Swal.fire({
        icon: "warning",
        title: "Karyawan Sudah Memiliki Template",
        text: `Karyawan ${selectedEmployee.name} (${selectedEmployee.nik}) sudah memiliki template personal. Satu karyawan tidak boleh memiliki 2 template atau lebih.`,
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

    if (excelFile && parseResult && parseResult.errors.length > 0) {
      const confirmContinue = await Swal.fire({
        icon: "warning",
        title: "Terdapat Error pada File Excel",
        text: "File Excel memiliki error validasi. Apakah Anda tetap ingin melanjutkan pembuatan template?",
        showCancelButton: true,
        confirmButtonText: "Ya, Lanjutkan",
        cancelButtonText: "Periksa File",
        confirmButtonColor: "#2563eb",
      });
      if (!confirmContinue.isConfirmed) return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPersonalTemplateAction({
        employeeId: selectedEmployeeId,
        baseTemplateId: selectedBaseTemplateId || null,
        customName: customTemplateName.trim(),
        description: description.trim(),
        categories: parseResult?.categories && parseResult.categories.length > 0
          ? parseResult.categories
          : undefined,
      });

      if (!res.success || !res.templateId) {
        throw new Error(res.error || "Gagal membuat template personal.");
      }

      await Swal.fire({
        icon: "success",
        title: "Template Berhasil Dibuat",
        text: parseResult?.categories && parseResult.categories.length > 0
          ? `Template untuk ${selectedEmployee.name} berhasil dibuat dan diisi ${parseResult.categories.length} kategori dari Excel. Form penilaian telah disinkronkan.`
          : `Template untuk ${selectedEmployee.name} berhasil dibuat.`,
        timer: 1800,
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
        {/* Simple Clean Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 id="personal-tpl-title" className="text-base font-bold text-slate-900">
              Buat Template KPI Personal
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih karyawan dan template acuan untuk membuat template penilaian.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-slate-800 text-xs">
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
                      const alreadyHasTemplate = assignedEmployeeIds.has(emp.id);

                      return (
                        <button
                          key={emp.id}
                          type="button"
                          disabled={alreadyHasTemplate}
                          onClick={() => {
                            if (alreadyHasTemplate) return;
                            setSelectedEmployeeId(emp.id);
                            setIsDropdownOpen(false);
                            setEmployeeSearch("");
                          }}
                          className={`w-full text-left px-3.5 py-2.5 transition flex items-center justify-between gap-3 ${
                            alreadyHasTemplate
                              ? "bg-slate-50 opacity-55 cursor-not-allowed"
                              : isSelected
                              ? "bg-blue-50 font-semibold cursor-pointer"
                              : "hover:bg-slate-50 cursor-pointer"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-2">
                              <span>{emp.name}</span>
                              {alreadyHasTemplate && (
                                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                                  Sudah ada template
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>NIK: {emp.nik}</span>
                              <span>•</span>
                              <span className="truncate">{emp.jobPosition || "Karyawan"}</span>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            {dept?.name || "-"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Simple Employee Details Card */}
            {selectedEmployee && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Departemen</span>
                  <span className="font-medium text-slate-900">{deptMap.get(selectedEmployee.departmentId)?.name || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Jabatan</span>
                  <span className="font-medium text-slate-900">{selectedEmployee.jobPosition || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Job Level</span>
                  <span className="font-medium text-slate-900">{levelMap.get(selectedEmployee.jobLevelId)?.name || "-"}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Pemilihan Template Acuan (Base Template) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Template Acuan <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              {selectedBaseTemplate && (
                <span className="text-[11px] text-slate-500">
                  {baseCategories.length} Kategori • {baseParamCount} Indikator
                </span>
              )}
            </div>
            <select
              value={selectedBaseTemplateId ?? ""}
              onChange={(e) => setSelectedBaseTemplateId(Number(e.target.value) || null)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            >
              <option value="">Tanpa Template Acuan (Template Kosong)</option>
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
          </div>

          {/* 3. Upload File Excel Template (Opsional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Upload File Excel Template <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              {parseResult && (
                <span className="text-[11px] font-medium text-emerald-600">
                  {parseResult.categories.length} Kategori • {parseResult.summary?.totalIndicators ?? 0} Indikator ({Math.round((parseResult.summary?.totalWeight ?? 1.15) * 100)}% Bobot)
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileChange(f);
              }}
              className="hidden"
            />

            {!excelFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileChange(f);
                }}
                className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/70 hover:bg-blue-50/40 rounded-xl p-4 text-center cursor-pointer transition group"
              >
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors shadow-2xs">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div className="text-xs text-slate-700 font-medium">
                    <span className="text-blue-600 font-semibold hover:underline">Klik untuk pilih file</span> atau seret file Excel ke sini
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Format .xlsx / .xls sesuai template KPI (kategori, indikator, target, kriteria skor)
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {excelFile.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{(excelFile.size / 1024).toFixed(1)} KB</span>
                      {isParsingExcel ? (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Loader2 className="h-3 w-3 animate-spin" /> Membaca...
                        </span>
                      ) : parseResult?.errors.length ? (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle className="h-3 w-3" /> Ada {parseResult.errors.length} catatan
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Format valid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                  >
                    Ganti
                  </button>
                  <button
                    type="button"
                    onClick={handleClearExcel}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                    title="Hapus file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Nama Template */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Nama Template <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customTemplateName}
              onChange={(e) => setCustomTemplateName(e.target.value)}
              placeholder="Masukkan nama template KPI..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 4. Deskripsi / Catatan Khusus */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Keterangan (Opsional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan atau keterangan template..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Simple Clean Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={
              isSubmitting ||
              !selectedEmployeeId ||
              !customTemplateName.trim() ||
              assignedEmployeeIds.has(selectedEmployeeId)
            }
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <span>Buat Template</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
