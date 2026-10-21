"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  CopyCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  Search,
  Check,
  RotateCcw,
  Layers,
  ArrowRight,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import type { Department, JobLevel, KpiPeriod, KpiTemplate } from "@/db/schema";
import {
  generateTemplateBatchAction,
  type GenerateTemplateBatchResult,
} from "@/lib/template-batch-actions";

export interface TemplateBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: KpiTemplate[];
  departments: Department[];
  jobLevels: JobLevel[];
  periods?: KpiPeriod[];
  activePeriod?: KpiPeriod;
  onSuccess?: () => void;
}

export function TemplateBatchModal({
  isOpen,
  onClose,
  templates,
  departments,
  jobLevels,
  periods = [],
  activePeriod,
  onSuccess,
}: TemplateBatchModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modal view: "FORM" (Konfigurasi & Preview) atau "SUMMARY" (Hasil Eksekusi)
  const [currentStep, setCurrentStep] = useState<"FORM" | "SUMMARY">("FORM");

  // State Step 1: Template Sumber
  const [sourceTemplateId, setSourceTemplateId] = useState<number | "">("");

  // State Step 2: Periode
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | "">("");

  // State Step 3: Kombinasi Departemen & Job Level (Key format: `${deptId}_${levelId}`)
  const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set());

  // Search & Filter untuk daftar kombinasi
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");

  // Hasil eksekusi setelah generate
  const [batchResult, setBatchResult] = useState<GenerateTemplateBatchResult | null>(null);

  // Inisialisasi default saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      setCurrentStep("FORM");
      setBatchResult(null);
      setSearchQuery("");
      setDeptFilter("ALL");

      // Set default template sumber ke template pertama jika ada
      if (templates.length > 0 && !sourceTemplateId) {
        setSourceTemplateId(templates[0].id);
      }

      // Set default periode ke activePeriod atau period pertama
      if (activePeriod) {
        setSelectedPeriodId(activePeriod.id);
      } else if (periods.length > 0) {
        setSelectedPeriodId(periods[0].id);
      }

      // Reset pilihan kombinasi
      setSelectedCombinations(new Set());
    }
  }, [isOpen, templates, periods, activePeriod]);

  // Listener untuk tombol Escape (Aksesibilitas R-32)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, onClose]);

  // Lookup data helper
  const selectedSourceTemplate = useMemo(() => {
    return templates.find((t) => t.id === Number(sourceTemplateId)) || null;
  }, [templates, sourceTemplateId]);

  const selectedPeriod = useMemo(() => {
    return periods.find((p) => p.id === Number(selectedPeriodId)) || activePeriod || null;
  }, [periods, activePeriod, selectedPeriodId]);

  const periodYear = selectedPeriod?.year || 2026;

  // Daftar seluruh kombinasi yang mungkin (Departemen x Job Level)
  const allCombinations = useMemo(() => {
    const list: Array<{
      key: string;
      department: Department;
      jobLevel: JobLevel;
      isExisting: boolean;
      existingTemplateName?: string;
    }> = [];

    for (const dept of departments) {
      for (const level of jobLevels) {
        const key = `${dept.id}_${level.id}`;
        // Cek apakah kombinasi Departemen + Job Level + Periode sudah memiliki template di database
        const existing = templates.find(
          (t) =>
            t.departmentId === dept.id &&
            t.jobLevelId === level.id &&
            Number(t.periodId) === Number(selectedPeriodId)
        );

        list.push({
          key,
          department: dept,
          jobLevel: level,
          isExisting: !!existing,
          existingTemplateName: existing?.name,
        });
      }
    }
    return list;
  }, [departments, jobLevels, templates, selectedPeriodId]);

  // Filter kombinasi berdasarkan search & deptFilter
  const filteredCombinations = useMemo(() => {
    return allCombinations.filter((item) => {
      const matchesDept =
        deptFilter === "ALL" || String(item.department.id) === deptFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.department.name.toLowerCase().includes(q) ||
        item.jobLevel.name.toLowerCase().includes(q) ||
        (item.department.code && item.department.code.toLowerCase().includes(q));

      return matchesDept && matchesSearch;
    });
  }, [allCombinations, deptFilter, searchQuery]);

  // Handler toggle satu checkbox kombinasi
  const handleToggleCombination = (key: string) => {
    setSelectedCombinations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Handler Pilih Semua yang tampil pada filter
  const handleSelectAllVisible = () => {
    setSelectedCombinations((prev) => {
      const next = new Set(prev);
      for (const item of filteredCombinations) {
        next.add(item.key);
      }
      return next;
    });
  };

  // Handler Batalkan Pilihan yang tampil pada filter
  const handleDeselectAllVisible = () => {
    setSelectedCombinations((prev) => {
      const next = new Set(prev);
      for (const item of filteredCombinations) {
        next.delete(item.key);
      }
      return next;
    });
  };

  // Hitung jumlah item terpilih: baru vs sudah ada
  const selectedStats = useMemo(() => {
    let newCount = 0;
    let existingCount = 0;

    for (const key of selectedCombinations) {
      const found = allCombinations.find((c) => c.key === key);
      if (found) {
        if (found.isExisting) {
          existingCount++;
        } else {
          newCount++;
        }
      }
    }

    return {
      total: selectedCombinations.size,
      newCount,
      existingCount,
    };
  }, [selectedCombinations, allCombinations]);

  // Preview daftar hasil template yang akan diproses
  const previewItems = useMemo(() => {
    return Array.from(selectedCombinations).map((key) => {
      const item = allCombinations.find((c) => c.key === key);
      const deptName = item?.department.name || "";
      const levelName = item?.jobLevel.name || "";
      const isExisting = item?.isExisting ?? false;
      const existingName = item?.existingTemplateName;

      // Format nama otomatis: KPI {Departemen} - {Job Level} - {Periode}
      const generatedName = `KPI ${deptName} - ${levelName} - ${periodYear}`;
      const srcName = selectedSourceTemplate?.name || "Template Acuan";

      // Label preview: Template HSE - HSE / Safety - Staff - 2026
      const previewLabel = `${srcName} - ${deptName} - ${levelName} - ${periodYear}`;

      return {
        key,
        departmentName: deptName,
        jobLevelName: levelName,
        generatedName,
        previewLabel,
        isExisting,
        existingName,
      };
    });
  }, [selectedCombinations, allCombinations, selectedSourceTemplate, periodYear]);

  // Eksekusi Generate Batch
  const handleExecuteGenerate = () => {
    if (!sourceTemplateId || !selectedPeriodId || selectedCombinations.size === 0) {
      return;
    }

    const combinationsPayload = Array.from(selectedCombinations).map((key) => {
      const [dId, lId] = key.split("_").map(Number);
      return {
        departmentId: dId,
        jobLevelId: lId,
      };
    });

    startTransition(async () => {
      try {
        const res = await generateTemplateBatchAction({
          sourceTemplateId: Number(sourceTemplateId),
          periodId: Number(selectedPeriodId),
          combinations: combinationsPayload,
        });

        setBatchResult(res);
        setCurrentStep("SUMMARY");
        if (onSuccess) {
          onSuccess();
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Terjadi kesalahan sistem saat generate batch.";
        setBatchResult({
          success: false,
          total: selectedCombinations.size,
          createdCount: 0,
          skippedCount: 0,
          failedCount: selectedCombinations.size,
          details: [],
          message: errorMsg,
        });
        setCurrentStep("SUMMARY");
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 transition-all duration-200 flex flex-col max-h-[92vh] w-full ${
          currentStep === "FORM" ? "max-w-4xl" : "max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* HEADER MODAL */}
        {/* ========================================================= */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <CopyCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Generate Template Batch
              </h3>
              <p className="text-xs text-slate-500">
                {currentStep === "FORM"
                  ? "Gandakan seluruh konfigurasi template sumber ke beberapa Departemen dan Job Level sekaligus."
                  : "Ringkasan hasil proses duplikasi template KPI."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              aria-label="Tutup modal"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* BODY MODAL (SCROLLABLE) */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {currentStep === "FORM" ? (
            /* ===================================================== */
            /* STEP 1: FORM PEMILIHAN & PREVIEW */
            /* ===================================================== */
            <div className="space-y-5">
              {/* Grid 2 Kolom: 1. Template Sumber & 2. Periode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Pilih Template Sumber */}
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      1. Pilih Template Sumber <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Acuan Duplikasi
                    </span>
                  </div>

                  <select
                    value={sourceTemplateId}
                    onChange={(e) => setSourceTemplateId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Pilih Master Template Sumber --</option>
                    {templates.map((t) => {
                      const d = departments.find((item) => item.id === t.departmentId);
                      const l = jobLevels.find((item) => item.id === t.jobLevelId);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} {d ? `(${d.name}` : ""}{l ? ` - ${l.name})` : ")"}
                        </option>
                      );
                    })}
                  </select>

                  {/* Ringkasan Konfigurasi Template Sumber */}
                  {selectedSourceTemplate ? (
                    <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-100 text-blue-900 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span>{selectedSourceTemplate.name}</span>
                        <span className="text-blue-700">
                          Bobot: {Math.round(Number(selectedSourceTemplate.totalWeight) * 100)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-700/90 leading-relaxed">
                        Parameter, indikator, target, satuan, kriteria penilaian, skor, bobot, dan urutan dari template ini akan digandakan seutuhnya.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      Pilih salah satu template di atas sebagai acuan seluruh konfigurasi.
                    </p>
                  )}
                </div>

                {/* 2. Pilih Periode */}
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      2. Pilih Periode <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Tahun KPI
                    </span>
                  </div>

                  <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Pilih Periode Target --</option>
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || `KPI Tahun ${p.year}`} {p.status === "ACTIVE" ? "(Aktif)" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="p-2.5 rounded-lg bg-slate-100/70 border border-slate-200 text-slate-700 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span>Periode Terpilih:</span>
                      <span className="text-slate-900 font-bold">
                        {selectedPeriod?.name || `Tahun ${periodYear}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Nama template yang digenerate akan diakhiri dengan tahun: <strong>{periodYear}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Pilih Kombinasi Departemen dan Job Level */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      3. Pilih Kombinasi Departemen dan Job Level <span className="text-rose-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Centang kombinasi yang ingin dibuatkan master template.
                    </p>
                  </div>

                  {/* Summary Counter Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100/80 text-blue-900 border border-blue-200 text-xs font-semibold self-start sm:self-auto">
                    <span>Total {selectedStats.total} kombinasi dipilih</span>
                    {selectedStats.total > 0 && (
                      <span className="text-[10px] text-blue-700 font-normal">
                        ({selectedStats.newCount} baru, {selectedStats.existingCount} sudah ada)
                      </span>
                    )}
                  </div>
                </div>

                {/* Toolbar Filter & Quick Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 border-t border-slate-200/60">
                  {/* Search input */}
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari Departemen atau Job Level..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter Departemen Dropdown */}
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua Departemen ({departments.length})</option>
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  {/* Quick Action: Select All / Deselect All */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                      title="Pilih semua kombinasi yang tampil"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllVisible}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                      title="Batalkan pilihan kombinasi yang tampil"
                    >
                      Batal Pilih
                    </button>
                  </div>
                </div>

                {/* Daftar Grid Kombinasi */}
                <div className="border border-slate-200 rounded-xl bg-white max-h-60 overflow-y-auto divide-y divide-slate-100 p-1">
                  {filteredCombinations.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">Tidak ada kombinasi yang cocok</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Sesuaikan kata kunci pencarian atau filter departemen.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1">
                      {filteredCombinations.map((item) => {
                        const isChecked = selectedCombinations.has(item.key);
                        return (
                          <label
                            key={item.key}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border transition cursor-pointer select-none ${
                              isChecked
                                ? "bg-blue-50/70 border-blue-300 text-slate-900"
                                : "bg-white border-slate-200/70 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCombination(item.key)}
                              className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold truncate text-[11px] text-slate-800">
                                  {item.department.name}
                                </span>
                                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
                                  {item.jobLevel.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {item.isExisting ? (
                                  <span className="text-[9px] font-semibold text-amber-800 bg-amber-100/90 px-1.5 py-0.2 rounded inline-flex items-center gap-0.5">
                                    Sudah Ada (Dilewati)
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded inline-flex items-center gap-0.5">
                                    Siap Dibuat
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Hasil Sebelum Generate */}
              {selectedCombinations.size > 0 && (
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Preview Hasil Generate ({selectedCombinations.size} Template)</span>
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Total <strong>{selectedStats.newCount}</strong> template baru akan dibuat
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="py-2 px-3 w-8 text-center">No</th>
                          <th className="py-2 px-3">Nama Template Yang Akan Dibuat</th>
                          <th className="py-2 px-3 w-36">Kombinasi</th>
                          <th className="py-2 px-3 w-28 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {previewItems.map((item, idx) => (
                          <tr key={item.key} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 text-center text-slate-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              <div>{item.generatedName}</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                Acuan: {selectedSourceTemplate?.name || "-"}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {item.departmentName} - {item.jobLevelName}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {item.isExisting ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  Sudah Ada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Akan Dibuat
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/80 border border-blue-200 text-blue-900 text-[11px]">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Sistem akan memeriksa ketersediaan template secara otomatis sebelum menyimpan. Kombinasi yang sudah berstatus <strong>Sudah Ada</strong> tidak akan diduplikasi ulang dan template yang sudah ada tidak akan diubah.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ===================================================== */
            /* STEP 2: SUMMARY SETELAH SELESAI */
            /* ===================================================== */
            <div className="space-y-5 py-2">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  Generate Template Batch Selesai
                </h4>
                <p className="text-xs text-slate-500">
                  {batchResult?.message || "Proses duplikasi template telah selesai diproses."}
                </p>
              </div>

              {/* 3 Kartu Ringkasan Hasil */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/80 text-emerald-950 text-center">
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Berhasil Dibuat
                  </span>
                  <span className="text-2xl font-extrabold text-emerald-800">
                    {batchResult?.createdCount ?? 0}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 text-amber-950 text-center">
                  <span className="block text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                    Sudah Tersedia
                  </span>
                  <span className="text-2xl font-extrabold text-amber-800">
                    {batchResult?.skippedCount ?? 0}
                  </span>
                  <span className="block text-[10px] text-amber-600 font-medium">Dilewati</span>
                </div>

                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-950 text-center">
                  <span className="block text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                    Gagal
                  </span>
                  <span className="text-2xl font-extrabold text-rose-800">
                    {batchResult?.failedCount ?? 0}
                  </span>
                </div>
              </div>

              {/* Rincian Hasil Per Kombinasi */}
              {batchResult && batchResult.details.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-xs">
                    Rincian Hasil Setiap Template
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="py-2 px-3 w-8 text-center">No</th>
                          <th className="py-2 px-3">Nama Template</th>
                          <th className="py-2 px-3 w-36">Departemen - Level</th>
                          <th className="py-2 px-3 w-32 text-center">Status</th>
                          <th className="py-2 px-3">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {batchResult.details.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 text-center text-slate-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {item.templateName}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {item.departmentName} - {item.jobLevelName}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {item.status === "CREATED" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check className="w-3 h-3" /> Berhasil
                                </span>
                              )}
                              {item.status === "SKIPPED" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Info className="w-3 h-3" /> Sudah Ada
                                </span>
                              )}
                              {item.status === "FAILED" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3" /> Gagal
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[10px]">
                              {item.status === "CREATED" && "Berhasil diduplikasi dari template sumber."}
                              {item.status === "SKIPPED" && (item.reason || "Template sudah tersedia sebelumnya.")}
                              {item.status === "FAILED" && (
                                <span className="text-rose-600 font-medium">{item.reason || "Gagal menyimpan."}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* FOOTER MODAL (AKSI) */}
        {/* ========================================================= */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          {currentStep === "FORM" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer text-xs disabled:opacity-40"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleExecuteGenerate}
                disabled={
                  isPending ||
                  !sourceTemplateId ||
                  !selectedPeriodId ||
                  selectedCombinations.size === 0
                }
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-sm transition cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses Duplikasi ({selectedCombinations.size} Template)...</span>
                  </>
                ) : (
                  <>
                    <CopyCheck className="w-4 h-4" />
                    <span>
                      Generate {selectedStats.newCount > 0 ? `${selectedStats.newCount} Template Baru` : `${selectedCombinations.size} Template`}
                    </span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setCurrentStep("FORM");
                  setBatchResult(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer text-xs"
              >
                Generate Batch Lainnya
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.refresh();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-sm transition cursor-pointer text-xs"
              >
                <Check className="w-4 h-4" />
                <span>Selesai & Lihat Master Template</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
