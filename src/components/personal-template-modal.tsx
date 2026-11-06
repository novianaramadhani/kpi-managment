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
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import Swal from "sweetalert2";
import type {
  Department,
  Employee,
  JobLevel,
  JobPosition,
  KpiCategory,
  KpiParameter,
  KpiTemplate,
} from "@/db/schema";
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
  categories,
  parameters = [],
  onSuccess,
}: PersonalTemplateModalProps) {
  const router = useRouter();

  // Step state: 1 = Pilih Dept, Nama, & Upload | 2 = Validasi Form KPI
  const [step, setStep] = useState<1 | 2>(1);

  // Form State (Hanya 3 field utama di Tahap 1: Departemen, Nama Karyawan, Upload Excel)
  const [selectedDeptId, setSelectedDeptId] = useState<number | "">("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedBaseTemplateId, setSelectedBaseTemplateId] = useState<number | null>(null);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Excel Upload State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset state saat modal dibuka/ditutup
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedDeptId("");
      setSelectedEmployeeId(null);
      setEmployeeSearch("");
      setCustomTemplateName("");
      setSelectedBaseTemplateId(null);
      setExcelFile(null);
      setParseResult(null);
      setIsParsingExcel(false);
      setIsDropdownOpen(false);
    }
  }, [isOpen]);

  // Tutup modal dengan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Klik di luar dropdown karyawan
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Map karyawan yang sudah memiliki template KPI (baik personal maupun yang terpasang pada karyawan)
  const employeeTemplateMap = useMemo(() => {
    const map = new Map<number, KpiTemplate>();
    for (const t of templates) {
      if (t.employeeId) {
        map.set(t.employeeId, t);
      }
    }
    return map;
  }, [templates]);

  const assignedEmployeeIds = useMemo(() => {
    return new Set<number>(employeeTemplateMap.keys());
  }, [employeeTemplateMap]);

  // Karyawan terfilter otomatis berdasarkan Departemen yang dipilih + kata kunci pencarian
  const filteredEmployees = useMemo(() => {
    if (!selectedDeptId) return [];
    const deptEmployees = employees.filter(
      (e) => e.departmentId === Number(selectedDeptId)
    );
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return deptEmployees;
    return deptEmployees.filter((e) => {
      const nameMatch = (e.name || "").toLowerCase().includes(q);
      const nikMatch = (e.nik || "").toLowerCase().includes(q);
      const posMatch = (e.jobPosition || "").toLowerCase().includes(q);
      return nameMatch || nikMatch || posMatch;
    });
  }, [employees, selectedDeptId, employeeSearch]);

  const availableEmployeeCount = useMemo(() => {
    return filteredEmployees.filter((e) => !assignedEmployeeIds.has(e.id)).length;
  }, [filteredEmployees, assignedEmployeeIds]);

  // Detail Karyawan Terpilih
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const deptMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments]
  );
  const levelMap = useMemo(
    () => new Map(jobLevels.map((l) => [l.id, l])),
    [jobLevels]
  );

  // Template standar untuk opsi inisialisasi saat buat manual
  const standardTemplates = useMemo(() => {
    return templates.filter((t) => !t.isCustom && t.isActive);
  }, [templates]);

  // Set nama otomatis & deteksi base template saat karyawan dipilih
  useEffect(() => {
    if (!selectedEmployee) {
      setSelectedBaseTemplateId(null);
      setCustomTemplateName("");
      return;
    }

    const jobTitle = selectedEmployee.jobPosition || "Karyawan";
    const currentYear = new Date().getFullYear();
    setCustomTemplateName(`${selectedEmployee.name} - ${jobTitle} - ${currentYear}`);

    let matchedTpl: KpiTemplate | undefined = undefined;
    if (selectedEmployee.jobPositionId) {
      matchedTpl = standardTemplates.find(
        (t) => t.jobPositionId === selectedEmployee.jobPositionId
      );
    }
    if (!matchedTpl) {
      matchedTpl = standardTemplates.find(
        (t) =>
          t.departmentId === selectedEmployee.departmentId &&
          t.jobLevelId === selectedEmployee.jobLevelId
      );
    }
    if (!matchedTpl) {
      matchedTpl = standardTemplates.find(
        (t) => t.departmentId === selectedEmployee.departmentId
      );
    }

    setSelectedBaseTemplateId(matchedTpl ? matchedTpl.id : null);
  }, [selectedEmployee, standardTemplates]);

  // Kategori & Parameter dari base template (untuk preview mode manual)
  const baseCategories = useMemo(() => {
    if (!selectedBaseTemplateId) return [];
    return categories
      .filter((c) => c.templateId === selectedBaseTemplateId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, selectedBaseTemplateId]);

  const baseParametersByCat = useMemo(() => {
    const map = new Map<number, KpiParameter[]>();
    for (const c of baseCategories) {
      map.set(
        c.id,
        parameters
          .filter((p) => p.categoryId === c.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
    return map;
  }, [baseCategories, parameters]);

  // Handle Upload & Parsing Excel
  const handleFileChange = async (file: File) => {
    setExcelFile(file);
    setIsParsingExcel(true);
    try {
      const res = await parseKpiTemplateExcel(file, 115);
      setParseResult(res);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Gagal membaca format file Excel.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File Excel",
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

  // Lanjut dari Tahap 1 ke Tahap 2 (Validasi Form)
  const handleProceedToValidation = () => {
    if (!selectedDeptId) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Departemen",
        text: "Silakan pilih departemen terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    if (!selectedEmployeeId || !selectedEmployee) {
      Swal.fire({
        icon: "warning",
        title: "Pilih Nama Karyawan",
        text: "Silakan pilih karyawan pemilik template terlebih dahulu.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    if (assignedEmployeeIds.has(selectedEmployeeId)) {
      Swal.fire({
        icon: "warning",
        title: "Karyawan Sudah Memiliki Template",
        text: `Karyawan ${selectedEmployee.name} (${selectedEmployee.nik}) sudah memiliki template KPI.`,
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    setStep(2);
  };

  // Simpan Template (dari Tahap 2: Validasi Form)
  const handleCreate = async () => {
    if (!selectedEmployeeId || !selectedEmployee) return;

    if (excelFile && parseResult && parseResult.errors.length > 0) {
      const confirmContinue = await Swal.fire({
        icon: "warning",
        title: "Terdapat Catatan Validasi pada File Excel",
        text: "File Excel memiliki catatan validasi. Apakah Anda tetap ingin menyimpan template ini?",
        showCancelButton: true,
        confirmButtonText: "Ya, Simpan",
        cancelButtonText: "Periksa Kembali",
        confirmButtonColor: "#2563eb",
      });
      if (!confirmContinue.isConfirmed) return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPersonalTemplateAction({
        employeeId: selectedEmployeeId,
        baseTemplateId:
          excelFile && parseResult?.categories?.length
            ? null
            : selectedBaseTemplateId || null,
        customName: customTemplateName.trim(),
        description: "",
        categories:
          parseResult?.categories && parseResult.categories.length > 0
            ? parseResult.categories
            : undefined,
      });

      if (!res.success || !res.templateId) {
        throw new Error(res.error || "Gagal membuat template KPI.");
      }

      await Swal.fire({
        icon: "success",
        title: "Template Berhasil Dibuat",
        text:
          parseResult?.categories && parseResult.categories.length > 0
            ? `Template untuk ${selectedEmployee.name} berhasil dibuat dari file Excel.`
            : `Template untuk ${selectedEmployee.name} berhasil dibuat.`,
        timer: 1500,
        showConfirmButton: false,
      });

      onSuccess?.(res.templateId);
      onClose();
      router.push(`/setup/templates/${res.templateId}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data.";
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
      aria-labelledby="template-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 id="template-modal-title" className="text-base font-bold text-slate-900">
              Buat Template KPI
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 1
                ? "Pilih departemen, nama karyawan, dan upload file Excel (opsional untuk buat manual)."
                : "Validasi struktur form template KPI sebelum disimpan."}
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

        {/* Stepper Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-xs shrink-0">
          <div
            className={`flex items-center gap-2 font-semibold ${step === 1 ? "text-blue-600" : "text-emerald-700"
              }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${step === 1
                  ? "bg-blue-600 text-white"
                  : "bg-emerald-100 text-emerald-700"
                }`}
            >
              1
            </span>
            <span>Pilih Departemen &amp; Karyawan</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <div
            className={`flex items-center gap-2 font-semibold ${step === 2 ? "text-blue-600" : "text-slate-400"
              }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${step === 2
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-500"
                }`}
            >
              2
            </span>
            <span>Validasi Form KPI</span>
          </div>
        </div>

        {/* Body Modal */}
        <div className="p-6 overflow-y-auto space-y-4 text-slate-800 text-xs flex-1">
          {step === 1 ? (
            <>
              {/* 1. Pilih Departemen */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Pilih Departemen <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : "";
                    setSelectedDeptId(val);
                    setSelectedEmployeeId(null);
                    setEmployeeSearch("");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Pilih Departemen...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Pilih Nama Karyawan (Terfilter berdasarkan Departemen) */}
              <div className="space-y-1.5" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Karyawan <span className="text-red-500">*</span>
                  </label>
                  {selectedDeptId && (
                    <span className="text-[11px] text-slate-500">
                      <strong className="text-emerald-700 font-semibold">{availableEmployeeCount}</strong> belum memiliki template ({filteredEmployees.length} total karyawan di{" "}
                      {deptMap.get(Number(selectedDeptId))?.name})
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      disabled={!selectedDeptId}
                      value={
                        selectedEmployee && !isDropdownOpen
                          ? `${selectedEmployee.name} (${selectedEmployee.nik}) - ${selectedEmployee.jobPosition || "Karyawan"}`
                          : employeeSearch
                      }
                      onChange={(e) => {
                        setEmployeeSearch(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => {
                        if (selectedDeptId) setIsDropdownOpen(true);
                      }}
                      placeholder={
                        selectedDeptId
                          ? "Pilih atau ketik nama karyawan..."
                          : "Pilih departemen terlebih dahulu..."
                      }
                      className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {(selectedEmployeeId || employeeSearch) && selectedDeptId && (
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

                  {/* Dropdown Daftar Karyawan Sesuai Departemen */}
                  {isDropdownOpen && selectedDeptId && (
                    <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 divide-y divide-slate-100">
                      {filteredEmployees.length === 0 ? (
                        <div className="px-4 py-3 text-center text-slate-500 text-xs">
                          Tidak ada karyawan yang cocok pada departemen ini.
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const isSelected = emp.id === selectedEmployeeId;
                          const existingTpl = employeeTemplateMap.get(emp.id);
                          const alreadyHasTemplate = Boolean(existingTpl);

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
                                  ? "bg-slate-50/90 opacity-60 cursor-not-allowed select-none border-l-2 border-l-rose-300"
                                  : isSelected
                                  ? "bg-blue-50 font-semibold cursor-pointer border-l-2 border-l-blue-600"
                                  : "hover:bg-slate-50 cursor-pointer"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-2">
                                  <span className={alreadyHasTemplate ? "text-slate-600" : ""}>
                                    {emp.name}
                                  </span>
                                  {alreadyHasTemplate && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                      Sudah Ada Template
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>NIK: {emp.nik}</span>
                                  <span>•</span>
                                  <span className="truncate">
                                    {emp.jobPosition || "Karyawan"}
                                  </span>
                                </div>
                                {alreadyHasTemplate && existingTpl && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">
                                    Template aktif: {existingTpl.name}
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                {levelMap.get(emp.jobLevelId)?.name || "-"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Upload File Excel Template (Opsional) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Upload File Excel Template{" "}
                    <span className="text-slate-400 font-normal">
                      (Opsional untuk Buat Manual)
                    </span>
                  </label>
                  {parseResult && (
                    <span className="text-[11px] font-medium text-emerald-600">
                      {parseResult.categories.length} Kategori •{" "}
                      {parseResult.summary?.totalIndicators ?? 0} Indikator
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
                    className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/70 hover:bg-blue-50/40 rounded-xl p-5 text-center cursor-pointer transition group"
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors shadow-2xs">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div className="text-xs text-slate-700 font-medium">
                        <span className="text-blue-600 font-semibold hover:underline">
                          Klik untuk pilih file Excel
                        </span>{" "}
                        atau seret file ke sini
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Kosongkan bagian ini jika Anda ingin menyusun form KPI secara manual
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
                              <AlertTriangle className="h-3 w-3" /> Ada{" "}
                              {parseResult.errors.length} catatan
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Siap divalidasi
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
            </>
          ) : (
            /* ================= TAHAP 2: VALIDASI FORM KPI ================= */
            <div className="space-y-4">
              {/* Ringkasan Identitas Template & Karyawan */}
              {selectedEmployee && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {selectedEmployee.name}{" "}
                        <span className="text-slate-400 font-mono font-normal">
                          ({selectedEmployee.nik})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {deptMap.get(selectedEmployee.departmentId)?.name || "-"} •{" "}
                        {selectedEmployee.jobPosition || "Karyawan"} •{" "}
                        {levelMap.get(selectedEmployee.jobLevelId)?.name || "-"}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${excelFile
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                    >
                      {excelFile ? "Mode: Upload Excel" : "Mode: Buat Manual"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                      Nama Template:
                    </span>
                    <input
                      type="text"
                      value={customTemplateName}
                      onChange={(e) => setCustomTemplateName(e.target.value)}
                      className="flex-1 h-7 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Konten Validasi Berdasarkan Mode (Upload Excel vs Buat Manual) */}
              {excelFile && parseResult ? (
                <div className="space-y-3">
                  {/* Banner Status Validasi Excel */}
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${parseResult.errors.length > 0
                        ? "bg-amber-50/70 border-amber-200 text-amber-900"
                        : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                      }`}
                  >
                    {parseResult.errors.length > 0 ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 flex-1">
                      <div className="font-semibold text-xs">
                        {parseResult.errors.length > 0
                          ? `Ditemukan ${parseResult.errors.length} Catatan Validasi pada File Excel`
                          : "Validasi File Excel Berhasil"}
                      </div>
                      <div className="text-[11px] opacity-85">
                        Terbaca{" "}
                        <strong>{parseResult.categories.length} Parameter</strong> dan{" "}
                        <strong>
                          {parseResult.summary?.totalIndicators ?? 0} Indikator
                        </strong>{" "}
                        dengan total bobot{" "}
                        <strong>
                          {Math.round(
                            (parseResult.summary?.totalWeight ?? 1.15) * 100
                          )}
                          %
                        </strong>
                        .
                      </div>
                      {parseResult.errors.length > 0 && (
                        <ul className="list-disc pl-4 pt-1 space-y-0.5 text-[11px] text-amber-800">
                          {parseResult.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Tabel Preview Parameter & Indikator Hasil Upload */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <tr>
                          <th className="py-2 px-3">Parameter / Indikator</th>
                          <th className="py-2 px-3 text-center w-24">Target</th>
                          <th className="py-2 px-3 text-center w-20">Satuan</th>
                          <th className="py-2 px-3 text-right w-20">Bobot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parseResult.categories.map((cat, cIdx) => (
                          <React.Fragment key={cIdx}>
                            <tr className="bg-slate-50/70 font-bold text-slate-900">
                              <td className="py-2 px-3" colSpan={3}>
                                {cIdx + 1}. {cat.name}
                              </td>
                              <td className="py-2 px-3 text-right text-emerald-700">
                                {Math.round((Number(cat.weight) || 0) * 100)}%
                              </td>
                            </tr>
                            {(cat.params || []).map((p, pIdx) => (
                              <tr key={pIdx} className="hover:bg-slate-50/40">
                                <td className="py-2 px-3 pl-6 text-slate-700">
                                  {cIdx + 1}.{pIdx + 1} {p.name}
                                </td>
                                <td className="py-2 px-3 text-center font-medium text-slate-800">
                                  {p.target || "-"}
                                </td>
                                <td className="py-2 px-3 text-center text-slate-500">
                                  {p.unit || "-"}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600">
                                  {Math.round((Number(p.weight) || 0) * 100)}%
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Mode Buat Manual (Tanpa Upload Excel) */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-blue-950 text-xs">
                        Struktur Awal Form KPI (Mode Manual)
                      </div>
                      <p className="text-[11px] text-blue-800 mt-0.5">
                        Setelah disimpan, Anda akan langsung diarahkan ke editor form KPI untuk menyesuaikan indikator dan kriteria secara manual.
                      </p>
                    </div>
                  </div>

                  {baseCategories.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                          <tr>
                            <th className="py-2 px-3">Parameter / Indikator Awal</th>
                            <th className="py-2 px-3 text-center w-24">Target</th>
                            <th className="py-2 px-3 text-center w-20">Satuan</th>
                            <th className="py-2 px-3 text-right w-20">Bobot</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {baseCategories.map((cat, cIdx) => {
                            const catParams = baseParametersByCat.get(cat.id) || [];
                            return (
                              <React.Fragment key={cat.id}>
                                <tr className="bg-slate-50/70 font-bold text-slate-900">
                                  <td className="py-2 px-3" colSpan={3}>
                                    {cIdx + 1}. {cat.name}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700">
                                    {Math.round((Number(cat.weight) || 0) * 100)}%
                                  </td>
                                </tr>
                                {catParams.map((p, pIdx) => (
                                  <tr key={p.id} className="hover:bg-slate-50/40">
                                    <td className="py-2 px-3 pl-6 text-slate-700">
                                      {cIdx + 1}.{pIdx + 1} {p.name}
                                    </td>
                                    <td className="py-2 px-3 text-center font-medium text-slate-800">
                                      {p.target || "-"}
                                    </td>
                                    <td className="py-2 px-3 text-center text-slate-500">
                                      {p.unit || "-"}
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-600">
                                      {Math.round((Number(p.weight) || 0) * 100)}%
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-600">
                      Template akan dibuat kosong dan siap diisi langsung pada halaman editor form KPI.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Kembali</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              Batal
            </button>

            {step === 1 ? (
              <button
                type="button"
                onClick={handleProceedToValidation}
                disabled={
                  !selectedDeptId ||
                  !selectedEmployeeId ||
                  isParsingExcel ||
                  assignedEmployeeIds.has(selectedEmployeeId)
                }
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Lanjut Validasi Form</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={isSubmitting || !customTemplateName.trim()}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan &amp; Buka Form KPI</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
