"use client";

import React, { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import {
  X,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  CheckCircle2,
  Layers,
  Search,
  Users,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";
import type { Department, JobLevel, JobPosition, Employee, KpiPeriod, KpiTemplate } from "@/db/schema";
import {
  downloadWizardKpiTemplate,
  downloadBatchWizardKpiTemplates,
} from "@/lib/excel-template-kpi";
import {
  getFiveMainParametersForWizard,
  type WizardTemplateStructureResult,
} from "@/lib/actions";

export interface TemplateImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  employees?: Employee[];
  templates?: KpiTemplate[];
  periods?: KpiPeriod[];
  activePeriod?: KpiPeriod;
  onSuccess?: (templateId: number) => void;
}

export function TemplateImportExcelModal({
  isOpen,
  onClose,
  departments,
  jobLevels,
  jobPositions = [],
  employees = [],
  periods = [],
  activePeriod,
}: TemplateImportExcelModalProps) {
  // Filter & Konfigurasi State
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [jobLevelId, setJobLevelId] = useState<number | "">("");
  const [periodYear, setPeriodYear] = useState<string>("2026");
  const [selectedPositionId, setSelectedPositionId] = useState<number | "">("");

  // Multi-Select Employee State (Many-to-Many)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Struktur 5 Parameter Utama
  const [wizardConfig, setWizardConfig] = useState<WizardTemplateStructureResult | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const handleRetryFetch = () => {
    setConfigError(null);
    setFetchTrigger((prev) => prev + 1);
  };

  const selectedDept = departments.find((d) => d.id === Number(departmentId));
  const selectedLevel = jobLevels.find((l) => l.id === Number(jobLevelId));
  const selectedPos = jobPositions.find((p) => p.id === Number(selectedPositionId));

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (departmentId && e.departmentId !== Number(departmentId)) return false;
      if (jobLevelId && e.jobLevelId !== Number(jobLevelId)) return false;
      if (selectedPositionId && e.jobPositionId !== Number(selectedPositionId)) return false;
      return true;
    });
  }, [employees, departmentId, jobLevelId, selectedPositionId]);

  const searchedEmployees = useMemo(() => {
    if (!employeeSearchQuery.trim()) return filteredEmployees;
    const q = employeeSearchQuery.toLowerCase().trim();
    return filteredEmployees.filter(
      (e) =>
        e.nik?.toLowerCase().includes(q) ||
        e.name?.toLowerCase().includes(q) ||
        (e.jobPosition && e.jobPosition.toLowerCase().includes(q))
    );
  }, [filteredEmployees, employeeSearchQuery]);

  const filteredPositions = useMemo(() => {
    return jobPositions.filter((p) => {
      if (departmentId && p.departmentId !== Number(departmentId)) return false;
      if (jobLevelId && p.jobLevelId !== Number(jobLevelId)) return false;
      return true;
    });
  }, [jobPositions, departmentId, jobLevelId]);

  const templateName = useMemo(() => {
    const deptName = selectedDept?.name || "";
    const levelName = selectedLevel?.name || "";
    const period = periodYear.trim();
    const parts = [deptName, levelName, period].filter(Boolean);
    return parts.length > 0
      ? `Template KPI ${parts.join(" - ")}`
      : "Template KPI [Departemen] - [Job Level] - [Tahun]";
  }, [selectedDept, selectedLevel, periodYear]);

  // Sinkronkan pilihan employee saat filter berubah: default pilih semua yang memenuhi kriteria
  useEffect(() => {
    if (departmentId && jobLevelId) {
      setSelectedEmployeeIds(new Set(filteredEmployees.map((e) => e.id)));
    } else {
      setSelectedEmployeeIds(new Set());
    }
  }, [departmentId, jobLevelId, selectedPositionId, filteredEmployees]);

  const handleToggleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredEmployees.map((e) => e.id)));
    }
  };

  const handleToggleEmployee = (id: number) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (activePeriod?.year) {
      setPeriodYear(String(activePeriod.year));
    } else if (periods.length > 0 && periods[0].year) {
      setPeriodYear(String(periods[0].year));
    }
  }, [activePeriod, periods]);

  useEffect(() => {
    if (!departmentId) {
      setWizardConfig(null);
      setConfigError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingConfig(true);
    setConfigError(null);
    setLoadingSeconds(0);

    const timer = setInterval(() => {
      setLoadingSeconds((prev) => prev + 1);
    }, 1000);

    getFiveMainParametersForWizard(
      Number(departmentId),
      jobLevelId ? Number(jobLevelId) : null,
      null
    )
      .then((res) => {
        if (!isMounted) return;
        setWizardConfig(res);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        console.error("Gagal mengambil struktur 5 parameter utama:", err);
        const errMsg =
          err instanceof Error ? err.message : "Gagal memuat kamus parameter dari server";
        setConfigError(errMsg);
      })
      .finally(() => {
        clearInterval(timer);
        if (isMounted) setIsLoadingConfig(false);
      });

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [departmentId, jobLevelId, fetchTrigger]);

  useEffect(() => {
    if (isOpen) {
      setDepartmentId("");
      setJobLevelId("");
      setSelectedPositionId("");
      setSelectedEmployeeIds(new Set());
      setEmployeeSearchQuery("");
      setWizardConfig(null);
      setConfigError(null);
      setLoadingSeconds(0);
      if (activePeriod?.year) {
        setPeriodYear(String(activePeriod.year));
      } else {
        setPeriodYear("2026");
      }
    }
  }, [isOpen, activePeriod]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownloadExcel = async () => {
    if (!wizardConfig || !departmentId || !jobLevelId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Departemen & Job Level",
        text: "Silakan pilih Departemen dan Job Level terlebih dahulu sebelum mengunduh format Excel.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const selectedList = employees
      .filter((e) => selectedEmployeeIds.has(e.id))
      .map((e) => ({
        nik: e.nik,
        name: e.name,
        jobPosition: e.jobPosition || selectedPos?.name || "-",
      }));

    const finalEmployeeList =
      selectedList.length > 0
        ? selectedList
        : selectedPos
        ? [{ nik: "-", name: "-", jobPosition: selectedPos.name }]
        : [{ nik: "-", name: "-", jobPosition: "-" }];

    try {
      setIsDownloading(true);
      await downloadBatchWizardKpiTemplates({
        templateName,
        departmentName: selectedDept?.name || "Departemen",
        jobLevelName: selectedLevel?.name || "Job_Level",
        periodYear,
        employees: finalEmployeeList,
        categories: wizardConfig.categories,
        totalWeightPct: wizardConfig.totalWeightPct || 115,
      });

      const count = finalEmployeeList.length;
      void Swal.fire({
        icon: "success",
        title: count > 1 ? `${count} Template Berhasil Di-generate` : "Format Excel Berhasil Diunduh",
        html: `<div class="text-xs text-left space-y-1">
          <p>Template KPI untuk <strong>${count} karyawan</strong> berhasil diproses berdasarkan konfigurasi Departemen &amp; Job Level.</p>
          <p class="text-slate-500 mt-1">Struktur KPI menggunakan satu sumber Kamus Parameter <strong>${selectedDept?.name}</strong>.</p>
          <p class="text-slate-500 mt-1">${count > 1 ? "File dipaketkan otomatis dalam format ZIP berisi file Excel individual per NIK karyawan." : "File Excel formal siap diisi dan diupload."}</p>
        </div>`,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Mengerti",
      });
    } catch (err) {
      console.error("Gagal mendownload template:", err);
      void Swal.fire({
        icon: "error",
        title: "Gagal Mengunduh",
        text: "Terjadi kesalahan saat memproses download template Excel.",
        confirmButtonColor: "#ef4444",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 transition-all duration-200 flex flex-col max-h-[94vh] w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - 1 Tab Review & Download */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Import Master Template KPI — Review & Download
              </h3>
              <p className="text-xs text-slate-500">
                Konfigurasi Departemen & Job Level, review pratinjau format 6 kolom, dan unduh template Excel
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Konfigurasi Pemilihan */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Departemen <span className="text-rose-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : "";
                    setDepartmentId(val);
                    setSelectedPositionId("");
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Pilih Departemen --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  2. Job Level <span className="text-rose-500">*</span>
                </label>
                <select
                  value={jobLevelId}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : "";
                    setJobLevelId(val);
                    setSelectedPositionId("");
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Pilih Job Level --</option>
                  {jobLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  3. Periode <span className="text-rose-500">*</span>
                </label>
                <select
                  value={periodYear}
                  onChange={(e) => setPeriodYear(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  {periods.length > 0 ? (
                    periods.map((p) => (
                      <option key={p.id} value={String(p.year)}>
                        KPI Tahun {p.year} {p.status === "ACTIVE" ? "(Aktif)" : ""}
                      </option>
                    ))
                  ) : (
                    <option value="2026">KPI Tahun 2026</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  4. Jabatan <span className="text-slate-400 font-normal">(Filter Opsional)</span>
                </label>
                <select
                  value={selectedPositionId}
                  onChange={(e) => setSelectedPositionId(e.target.value ? Number(e.target.value) : "")}
                  disabled={!departmentId}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">-- Semua Jabatan ({filteredPositions.length}) --</option>
                  {filteredPositions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Nama Master Template (Otomatis)
                </label>
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Otomatis Dibentuk Sistem
                </span>
              </div>
              <input
                type="text"
                readOnly
                disabled
                value={templateName}
                placeholder="Template KPI [Departemen] - [Job Level] - [Tahun]"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-100 text-slate-800 font-semibold cursor-not-allowed select-none focus:outline-none"
              />
            </div>
          </div>

          {/* Section Multi-Select Karyawan (Many-to-Many Generation) */}
          {departmentId && jobLevelId && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              {/* Header Selector Karyawan */}
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-xs">
                      Pilih Karyawan (Multi-Select NIK)
                    </span>
                    <span className="text-[11px] text-slate-500 ml-2 hidden sm:inline">
                      Satu konfigurasi dapat diterapkan ke banyak employee
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Search Karyawan */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      placeholder="Cari NIK / Nama..."
                      className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none w-36 sm:w-44"
                    />
                  </div>

                  {/* Badge Terpilih */}
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                    <strong>{selectedEmployeeIds.size}</strong> dari {filteredEmployees.length} Dipilih
                  </span>
                </div>
              </div>

              {/* Tabel Daftar Karyawan dengan Checkbox */}
              {filteredEmployees.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Belum ada karyawan terdaftar pada {selectedDept?.name} - {selectedLevel?.name}.
                  Template umum akan di-generate jika diunduh.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-10 text-center border-r border-slate-200/80">
                          <button
                            type="button"
                            onClick={handleToggleSelectAll}
                            className="p-0.5 rounded text-slate-600 hover:text-blue-600 transition cursor-pointer"
                            title={
                              selectedEmployeeIds.size === filteredEmployees.length
                                ? "Batal pilih semua"
                                : "Pilih semua karyawan"
                            }
                          >
                            {selectedEmployeeIds.size === filteredEmployees.length &&
                            filteredEmployees.length > 0 ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </th>
                        <th className="py-2 px-3 w-28 text-center border-r border-slate-200/80 font-bold">
                          NIK
                        </th>
                        <th className="py-2 px-3 min-w-[180px] border-r border-slate-200/80 font-bold">
                          Nama Employee
                        </th>
                        <th className="py-2 px-3 min-w-[160px] font-bold">
                          Jabatan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {searchedEmployees.map((emp) => {
                        const isChecked = selectedEmployeeIds.has(emp.id);
                        return (
                          <tr
                            key={emp.id}
                            onClick={() => handleToggleEmployee(emp.id)}
                            className={`cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-blue-50/40 hover:bg-blue-50/60"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-2 px-3 text-center border-r border-slate-100">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleEmployee(emp.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 border-r border-slate-100">
                              {emp.nik}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 border-r border-slate-100">
                              {emp.name}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {emp.jobPosition || selectedPos?.name || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Area Review Format Excel */}
          {departmentId && jobLevelId ? (
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              {/* Toolbar Ringkas: Hanya Label Ringkas & Tombol Download (Tanpa Header Tambahan) */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Pratinjau Struktur Master KPI
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    (Total Bobot: <strong className="text-blue-700 font-mono">115%</strong>)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  disabled={!wizardConfig || isLoadingConfig || isDownloading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-hidden"
                >
                  {isDownloading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memproses Template...</span>
                    </>
                  ) : isLoadingConfig ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyiapkan Format ({loadingSeconds}s)...</span>
                    </>
                  ) : selectedEmployeeIds.size > 1 ? (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download {selectedEmployeeIds.size} Template KPI (ZIP)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download Format Excel Terisi</span>
                    </>
                  )}
                </button>
              </div>

              {/* Tabel Pratinjau 6 Kolom yang Bisa Direview */}
              {isLoadingConfig ? (
                <div className="py-12 px-4 text-center text-xs text-slate-600 flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-slate-200">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800 text-sm">
                      Memuat data dari Kamus Parameter {selectedDept?.name || ""} dan Parameter General...
                    </p>
                    <p className="text-slate-500 text-xs">
                      Sedang memproses struktur parameter KPI... ({loadingSeconds} detik)
                    </p>
                  </div>
                  {loadingSeconds >= 7 && (
                    <div className="mt-2 flex flex-col sm:flex-row items-center gap-2 text-xs">
                      <span className="text-amber-800 bg-amber-50 px-3 py-1 rounded-md border border-amber-200">
                        Proses membutuhkan waktu lebih lama dari biasanya.
                      </span>
                      <button
                        type="button"
                        onClick={handleRetryFetch}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-hidden"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Muat Ulang</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : configError ? (
                <div className="py-10 px-4 text-center text-xs text-slate-600 flex flex-col items-center justify-center gap-3 bg-red-50/50 rounded-xl border border-red-200">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-sm">
                      Gagal Memuat Parameter KPI
                    </p>
                    <p className="text-red-700 text-xs max-w-md mx-auto">
                      {configError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryFetch}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-hidden"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Muat Ulang</span>
                  </button>
                </div>
              ) : wizardConfig ? (
                <div className="space-y-3">
                  {/* Tabel Struktur Parameter KPI (6 Kolom Formal Langsung) */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 w-14 text-center border-r border-slate-200/80 font-bold">No</th>
                            <th className="py-2.5 px-3 min-w-[220px] border-r border-slate-200/80 font-bold">Parameter</th>
                            <th className="py-2.5 px-3 w-36 text-center border-r border-slate-200/80 font-bold">
                              Bobot Parameter (%)
                            </th>
                            <th className="py-2.5 px-3 min-w-[220px] border-r border-slate-200/80 font-bold">
                              Kriteria Penilaian
                            </th>
                            <th className="py-2.5 px-3 w-16 text-center border-r border-slate-200/80 font-bold">Skor</th>
                            <th className="py-2.5 px-3 w-36 text-center font-bold">Bobot Indikator (%)</th>
                          </tr>
                        </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {[...wizardConfig.categories]
                          .sort((a, b) => a.order - b.order)
                          .map((cat) => {
                            const isDirect = cat.categoryType === "DIRECT";

                            if (isDirect) {
                              // Parameter Utama General No. 2, 3, 4, 5 (Mandiri tanpa sub-parameter)
                              const bands =
                                cat.defaultBands && cat.defaultBands.length > 0
                                  ? cat.defaultBands
                                  : [
                                      { label: "Target Tercapai (>= 98%)", score: 25 },
                                      { label: "Cukup (95% - 97%)", score: 15 },
                                      { label: "Kurang (< 95%)", score: 5 },
                                    ];

                              return (
                                <React.Fragment key={cat.order}>
                                  {bands.map((b, bIdx) => (
                                    <tr
                                      key={`gen-${cat.order}-${bIdx}`}
                                      className={
                                        bIdx === 0
                                          ? "bg-slate-50/60 hover:bg-slate-100/60 transition-colors"
                                          : "hover:bg-slate-50/40 transition-colors"
                                      }
                                    >
                                      {/* 1. No */}
                                      <td className="py-2 px-3 text-center font-bold text-slate-700 border-r border-slate-100">
                                        {bIdx === 0 ? cat.order : ""}
                                      </td>

                                      {/* 2. Parameter */}
                                      <td className="py-2 px-3 border-r border-slate-100">
                                        {bIdx === 0 && (
                                          <div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-bold text-slate-900">{cat.name}</span>
                                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                Parameter Utama No. {cat.order} (Mandiri)
                                              </span>
                                            </div>
                                            {cat.parameterName && cat.parameterName !== cat.name && (
                                              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                                {cat.parameterName}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </td>

                                      {/* 3. Bobot Parameter (%) */}
                                      <td className="py-2 px-3 text-center font-bold text-blue-700 font-mono border-r border-slate-100">
                                        {bIdx === 0 ? `${cat.weightPct}%` : ""}
                                      </td>

                                      {/* 4. Kriteria Penilaian */}
                                      <td className="py-2 px-3 text-slate-700 border-r border-slate-100">
                                        <span className="font-medium">{b.label}</span>
                                      </td>

                                      {/* 5. Skor */}
                                      <td className="py-2 px-3 text-center border-r border-slate-100">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                            b.score >= 20
                                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                              : b.score >= 10
                                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                                              : "bg-amber-50 text-amber-700 border border-amber-200"
                                          }`}
                                        >
                                          {b.score}
                                        </span>
                                      </td>

                                      {/* 6. Bobot Indikator (%) */}
                                      <td className="py-2 px-3 text-center font-bold text-emerald-700 font-mono">
                                        {bIdx === 0 ? "100%" : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            } else {
                              // Parameter Utama No. 1: Target Kerja
                              return (
                                <React.Fragment key={cat.order}>
                                  {/* Baris Parameter Utama No. 1: Target Kerja */}
                                  <tr className="bg-slate-100/80 hover:bg-slate-200/50 transition-colors border-b border-slate-200 font-semibold">
                                    {/* 1. No */}
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-900 border-r border-slate-200">
                                      1
                                    </td>

                                    {/* 2. Parameter */}
                                    <td className="py-2.5 px-3 border-r border-slate-200">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-950 text-[13px] tracking-tight">
                                          Target Kerja
                                        </span>
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                          Parameter Utama No. 1
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-normal">
                                          (Kamus Acuan: {selectedDept?.name || selectedDept?.code})
                                        </span>
                                      </div>
                                    </td>

                                    {/* 3. Bobot Parameter (%) */}
                                    <td className="py-2.5 px-3 text-center font-bold text-blue-700 font-mono border-r border-slate-200">
                                      {cat.weightPct}%
                                    </td>

                                    {/* 4. Kriteria Penilaian */}
                                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono border-r border-slate-200">
                                      -
                                    </td>

                                    {/* 5. Skor */}
                                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono border-r border-slate-200">
                                      -
                                    </td>

                                    {/* 6. Bobot Indikator (%) */}
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 font-mono">
                                      100%
                                    </td>
                                  </tr>

                                  {/* Sub-Parameter dari Kamus Parameter Departemen: 1.1, 1.2, dst (tanpa prefix "Target Kerja -") */}
                                  {cat.subParameters.map((p, pIdx) => {
                                    const bands =
                                      p.defaultBands && p.defaultBands.length > 0
                                        ? p.defaultBands
                                        : [
                                            { label: "Target Tercapai (>= 98%)", score: 25 },
                                            { label: "Cukup (95% - 97%)", score: 15 },
                                            { label: "Kurang (< 95%)", score: 5 },
                                          ];
                                    const subNo = `1.${pIdx + 1}`;

                                    return bands.map((b, bIdx) => (
                                      <tr
                                        key={`tgt-${pIdx}-${bIdx}`}
                                        className={
                                          bIdx === 0
                                            ? "bg-blue-50/25 hover:bg-blue-50/35 transition-colors"
                                            : "hover:bg-slate-50/40 transition-colors"
                                        }
                                      >
                                        {/* 1. No */}
                                        <td className="py-2 px-3 text-center font-semibold text-slate-700 border-r border-slate-100">
                                          {bIdx === 0 ? subNo : ""}
                                        </td>

                                        {/* 2. Parameter: Nama Asli dari Kamus Parameter (Tanpa Prefix "Target Kerja -") */}
                                        <td className="py-2 px-3 border-r border-slate-100">
                                          {bIdx === 0 && (
                                            <div className="pl-2">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-semibold text-slate-900">
                                                  {p.name}
                                                </span>
                                                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                  Sub-Parameter {subNo}
                                                </span>
                                              </div>
                                              <div className="text-[10px] text-slate-400 font-normal flex items-center gap-2 mt-0.5">
                                                <span>Satuan: <strong>{p.unit}</strong></span>
                                                <span>Target: <strong>{p.target || "100"}</strong></span>
                                              </div>
                                            </div>
                                          )}
                                        </td>

                                        {/* 3. Bobot Parameter (%) - Dikosongkan pada baris sub-parameter */}
                                        <td className="py-2 px-3 text-center text-slate-300 font-mono border-r border-slate-100">
                                          {""}
                                        </td>

                                        {/* 4. Kriteria Penilaian */}
                                        <td className="py-2 px-3 text-slate-700 border-r border-slate-100">
                                          <span className="font-medium">{b.label}</span>
                                        </td>

                                        {/* 5. Skor */}
                                        <td className="py-2 px-3 text-center border-r border-slate-100">
                                          <span
                                            className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                              b.score >= 20
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                : b.score >= 10
                                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                                : "bg-amber-50 text-amber-700 border border-amber-200"
                                            }`}
                                          >
                                            {b.score}
                                          </span>
                                        </td>

                                        {/* 6. Bobot Indikator (%) */}
                                        <td className="py-2 px-3 text-center font-bold text-emerald-700 font-mono">
                                          {bIdx === 0 ? `${p.weightPct}%` : ""}
                                        </td>
                                      </tr>
                                    ));
                                  })}
                                </React.Fragment>
                              );
                            }
                          })}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-10 bg-slate-100 text-xs font-bold text-slate-800 border-t-2 border-slate-300">
                        <tr>
                          <td colSpan={2} className="py-2.5 px-4 text-center border-r border-slate-200 font-bold text-slate-800">
                            Total Bobot
                          </td>
                          <td className="py-2.5 px-3 text-center text-blue-700 border-r border-slate-200 font-mono font-bold text-[13px]">
                            {wizardConfig.totalWeightPct || 115}%
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200"></td>
                          <td className="py-2.5 px-3 border-r border-slate-200"></td>
                          <td className="py-2.5 px-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                    <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      Tabel pratinjau di atas menampilkan struktur 6 kolom yang akan diekspor ke Excel. Target Kerja diposisikan sebagai <strong>Parameter Utama No. 1</strong> dengan sub-parameter 1.1, 1.2, dst mengambil nama asli dari Kamus Parameter <strong>{selectedDept?.name}</strong> (tanpa prefix). Sedangkan 4 Parameter General (<strong>Kehadiran & Disiplin</strong>, <strong>Keselamatan Kerja</strong>, <strong>Kepatuhan & SP</strong>, dan <strong>Inovasi & Improvement</strong>) berdiri mandiri sebagai <strong>Parameter Utama No. 2, 3, 4, dan 5</strong> tanpa sub-parameter. Setelah diisi, file dapat diunggah melalui menu <strong>Upload Template</strong>.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-500 text-xs">
              <p className="font-medium text-slate-700">Pilih Departemen dan Job Level</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Pilih Departemen dan Job Level di atas untuk melihat tabel pratinjau format Excel 6 kolom dan mengunduh filenya.
              </p>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
