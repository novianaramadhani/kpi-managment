"use client";

import React, { useState, useRef, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  BarChart2,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { Department, JobLevel, JobPosition, Employee, KpiPeriod } from "@/db/schema";
import { createTemplateFromExcel, type ImportCategoryInput } from "@/lib/actions";

export interface KpiEditableRow {
  id: string;
  name: string;
  unit: string;
  target: string;
  weight: number;
}

export interface TemplateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  employees?: Employee[];
  periods?: KpiPeriod[];
  activePeriod?: KpiPeriod;
  onSuccess?: (templateId: number) => void;
}

export function TemplateUploadModal({
  isOpen,
  onClose,
  departments,
  jobLevels,
  periods = [],
  activePeriod,
  onSuccess,
}: TemplateUploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Section 1: Informasi Template
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [jobLevelId, setJobLevelId] = useState<number | "">("");
  const [periodYear, setPeriodYear] = useState<string>("2026");

  // Section 2: Upload File State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Section 3: Data KPI yang dapat diedit langsung
  const [kpiRows, setKpiRows] = useState<KpiEditableRow[]>([]);

  // Default period year
  useEffect(() => {
    if (activePeriod?.year) {
      setPeriodYear(String(activePeriod.year));
    } else if (periods.length > 0 && periods[0].year) {
      setPeriodYear(String(periods[0].year));
    }
  }, [activePeriod, periods]);

  // Reset modal state saat dibuka
  useEffect(() => {
    if (isOpen) {
      setUploadedFile(null);
      setDepartmentId("");
      setJobLevelId("");
      setKpiRows([]);
      if (activePeriod?.year) {
        setPeriodYear(String(activePeriod.year));
      } else {
        setPeriodYear("2026");
      }
    }
  }, [isOpen, activePeriod]);

  // Keyboard navigation: Close with ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  // Helper parsing file Excel
  const parseExcelFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      // 1. Deteksi metadata (Departemen, Job Level, Periode) dari sheet Panduan / Info jika ada
      let detectedDept = "";
      let detectedLevel = "";
      let detectedYear = "";

      const metaSheet =
        wb.Sheets["PANDUAN PENGISIAN"] ||
        wb.Sheets["PANDUAN"] ||
        wb.Sheets["INFORMASI MASTER TEMPLATE KPI"];
      if (metaSheet) {
        const metaRows: (string | number)[][] = XLSX.utils.sheet_to_json(metaSheet, {
          header: 1,
          defval: "",
        });
        metaRows.forEach((row) => {
          const label = String(row[0] || "").toLowerCase();
          const val = String(row[1] || "").trim();
          if (label.includes("departemen")) detectedDept = val;
          if (label.includes("job level")) detectedLevel = val;
          if (label.includes("periode")) detectedYear = val;
        });
      }

      // Deteksi juga dari nama file jika belum ada di sheet panduan
      const filename = file.name.toLowerCase();
      if (!detectedDept) {
        const foundDept = departments.find(
          (d) =>
            filename.includes(d.name.toLowerCase()) ||
            (d.code && filename.includes(d.code.toLowerCase()))
        );
        if (foundDept) {
          setDepartmentId(foundDept.id);
        }
      } else {
        const foundDept = departments.find(
          (d) =>
            d.name.toLowerCase() === detectedDept.toLowerCase() ||
            d.code.toLowerCase() === detectedDept.toLowerCase()
        );
        if (foundDept) setDepartmentId(foundDept.id);
      }

      if (!detectedLevel) {
        const foundLevel = jobLevels.find(
          (l) =>
            filename.includes(l.name.toLowerCase()) ||
            (l.code && filename.includes(l.code.toLowerCase()))
        );
        if (foundLevel) {
          setJobLevelId(foundLevel.id);
        }
      } else {
        const foundLevel = jobLevels.find(
          (l) =>
            l.name.toLowerCase() === detectedLevel.toLowerCase() ||
            (l.code && l.code.toLowerCase() === detectedLevel.toLowerCase())
        );
        if (foundLevel) setJobLevelId(foundLevel.id);
      }

      if (detectedYear) {
        setPeriodYear(detectedYear);
      } else {
        const yearMatch = filename.match(/20\d{2}/);
        if (yearMatch) setPeriodYear(yearMatch[0]);
      }

      // 2. Baca sheet data KPI utama
      const dataSheetName =
        wb.SheetNames.find((s) => {
          const low = s.toLowerCase();
          return (
            !low.includes("panduan") &&
            !low.includes("mapping") &&
            (low.includes("struktur") || low.includes("kpi") || low.includes("template") || low.includes("data"))
          );
        }) || (wb.SheetNames[0] !== "_SYSTEM_MAPPING" ? wb.SheetNames[0] : wb.SheetNames[1]);

      if (!dataSheetName || !wb.Sheets[dataSheetName]) {
        throw new Error("Sheet data KPI tidak ditemukan di file Excel.");
      }

      const ws = wb.Sheets[dataSheetName];
      const rows: (string | number)[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
      });

      if (!rows || rows.length === 0) {
        throw new Error("Sheet data KPI kosong.");
      }

      // Cari baris header
      let headerRowIdx = -1;
      let colName = -1;
      let colUnit = -1;
      let colTarget = -1;
      let colWeight = -1;
      let colParamWeight = -1;
      let colIndWeight = -1;

      for (let r = 0; r < Math.min(rows.length, 12); r++) {
        const row = rows[r] || [];
        const lower = row.map((cell) => String(cell || "").toLowerCase().trim());
        const hasKpi = lower.some(
          (c) =>
            c.includes("kpi") ||
            c.includes("indikator") ||
            c.includes("parameter") ||
            c.includes("key performance") ||
            c.includes("nama")
        );
        const hasWeight = lower.some((c) => c.includes("bobot") || c.includes("weight") || c.includes("%"));

        if (hasKpi && (hasWeight || lower.some((c) => c.includes("target")))) {
          headerRowIdx = r;
          lower.forEach((c, idx) => {
            if (
              (c.includes("kpi") || c.includes("indikator") || c.includes("parameter") || c.includes("key performance")) &&
              !c.includes("bobot") &&
              !c.includes("target")
            ) {
              if (colName === -1) colName = idx;
            }
            if (c.includes("unit") || c.includes("satuan") || c.includes("uom")) {
              if (colUnit === -1) colUnit = idx;
            }
            if (c.includes("target") || c.includes("sasaran") || c.includes("goal")) {
              if (colTarget === -1) colTarget = idx;
            }
            if (c.includes("bobot parameter")) {
              colParamWeight = idx;
            }
            if (c.includes("bobot indikator") || c.includes("bobot sub")) {
              colIndWeight = idx;
            }
            if (c.includes("bobot") || c.includes("weight") || c.includes("bobot (%)")) {
              if (colWeight === -1) colWeight = idx;
            }
          });
          break;
        }
      }

      const parsedItems: KpiEditableRow[] = [];

      if (headerRowIdx !== -1) {
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] || [];
          const rawName = colName !== -1 ? String(row[colName] || "").trim() : "";
          const rawUnit = colUnit !== -1 ? String(row[colUnit] || "").trim() : "";
          const rawTarget = colTarget !== -1 ? String(row[colTarget] || "").trim() : "";

          let rawWeight = 0;
          const pWeight = colParamWeight !== -1 ? Number(row[colParamWeight]) : NaN;
          const iWeight = colIndWeight !== -1 ? Number(row[colIndWeight]) : NaN;

          if (!isNaN(pWeight) && !isNaN(iWeight) && pWeight > 0) {
            const cleanPWeight = pWeight <= 1 ? pWeight * 100 : pWeight;
            const cleanIWeight = iWeight <= 1 ? iWeight * 100 : iWeight;
            if (rawName.toLowerCase().includes("target kerja") && cleanIWeight < 100) {
              rawWeight = Math.round((cleanIWeight / 100) * cleanPWeight);
            } else {
              rawWeight = Math.round(cleanPWeight);
            }
          } else {
            let directWeight = colWeight !== -1 ? Number(row[colWeight]) : 0;
            if (!isNaN(directWeight) && directWeight > 0 && directWeight <= 1) {
              rawWeight = Math.round(directWeight * 100);
            } else if (!isNaN(directWeight)) {
              rawWeight = Math.round(directWeight);
            }
          }

          if (rawName) {
            parsedItems.push({
              id: `kpi-${Date.now()}-${r}`,
              name: rawName,
              unit: rawUnit || "%",
              target: rawTarget,
              weight: rawWeight,
            });
          }
        }
      }

      // Fallback jika tidak ada header yang cocok, sediakan minimal baris kosong terdeteksi
      if (parsedItems.length === 0) {
        parsedItems.push({
          id: `kpi-${Date.now()}-1`,
          name: "",
          unit: "%",
          target: "",
          weight: 0,
        });
      }

      setKpiRows(parsedItems);
      setUploadedFile(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca format file Excel.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      void parseExcelFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void parseExcelFile(e.dataTransfer.files[0]);
    }
  };

  // Tambah baris baru
  const handleAddRow = () => {
    setKpiRows((prev) => [
      ...prev,
      {
        id: `kpi-${Date.now()}-${prev.length + 1}`,
        name: "",
        unit: "%",
        target: "",
        weight: 0,
      },
    ]);
  };

  // Hapus baris
  const handleDeleteRow = (id: string) => {
    setKpiRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Update nilai field per baris
  const handleUpdateRow = (id: string, field: keyof KpiEditableRow, val: string | number) => {
    setKpiRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: val };
        }
        return r;
      })
    );
  };

  // Helper validasi per baris
  const getRowError = (row: KpiEditableRow) => {
    if (!row.name.trim()) return "Nama KPI wajib diisi";
    if (!row.unit.trim()) return "Unit wajib diisi";
    if (!row.target.trim()) return "Target wajib diisi";
    if (isNaN(row.weight) || row.weight <= 0) return "Bobot harus > 0";
    return null;
  };

  // Kalkulasi Status & Validasi Keseluruhan
  const totalBobot = useMemo(() => {
    return Math.round(kpiRows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0));
  }, [kpiRows]);

  const rowsWithErrors = useMemo(() => {
    return kpiRows.filter((r) => getRowError(r) !== null);
  }, [kpiRows]);

  const isMetadataValid = Boolean(departmentId && jobLevelId && periodYear.trim());
  const isDataValid = kpiRows.length > 0 && rowsWithErrors.length === 0;
  const isTotalBobot100 = totalBobot === 100;
  const canSave = isMetadataValid && isDataValid && isTotalBobot100 && !isPending;

  // Nama template otomatis
  const selectedDept = departments.find((d) => d.id === Number(departmentId));
  const selectedLevel = jobLevels.find((l) => l.id === Number(jobLevelId));
  const templateName = useMemo(() => {
    const deptName = selectedDept?.name || "Departemen";
    const levelName = selectedLevel?.name || "Job_Level";
    return `KPI ${deptName} - ${levelName} - ${periodYear.trim()}`;
  }, [selectedDept, selectedLevel, periodYear]);

  // Handler Simpan Master Template
  const handleSave = () => {
    if (!canSave) return;

    startTransition(async () => {
      try {
        const categoriesPayload: ImportCategoryInput[] = [
          {
            name: "Key Performance Indicators",
            weight: 1.0,
            categoryType: "SUB_ITEMS",
            sortOrder: 1,
            params: kpiRows.map((r, idx) => ({
              name: r.name.trim(),
              unit: r.unit.trim() || "%",
              target: r.target.trim(),
              weight: Number(r.weight) / 100,
              maxScore: 25,
              inputType: "MONTHLY_ACTUAL",
              sortOrder: idx + 1,
              bands: [
                { label: "Kurang", operator: "LT", score: 1, sortOrder: 1 },
                { label: "Cukup", operator: "GTE", score: 2, sortOrder: 2 },
                { label: "Baik", operator: "GTE", score: 3, sortOrder: 3 },
                { label: "Sangat Baik", operator: "GTE", score: 4, sortOrder: 4 },
              ],
            })),
          },
        ];

        const res = await createTemplateFromExcel(
          templateName.trim(),
          Number(departmentId),
          Number(jobLevelId),
          categoriesPayload,
          periodYear.trim()
        );

        await Swal.fire({
          icon: "success",
          title: "Master Template Berhasil Disimpan",
          text: `Template "${res.name}" berhasil dibuat dengan ${kpiRows.length} KPI dan total bobot 100%.`,
          confirmButtonColor: "#2563eb",
          timer: 2000,
          timerProgressBar: true,
        });

        onClose();
        if (onSuccess) {
          onSuccess(res.id);
        } else {
          router.push(`/setup/templates/${res.id}`);
          router.refresh();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan template baru.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Simpan Template",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 transition-all duration-200 flex flex-col max-h-[94vh] w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Upload Master Template KPI
              </h3>
              <p className="text-xs text-slate-500">
                Upload file Excel, periksa dan sesuaikan data sebelum disimpan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs bg-slate-50/40">
          {/* ================================================================= */}
          {/* SECTION 1: INFORMASI TEMPLATE                                     */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">Informasi Template</h4>
                <p className="text-[11px] text-slate-500">
                  Pilih parameter utama untuk master template KPI.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Departemen <span className="text-rose-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Pilih Departemen --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.code ? `(${d.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Job Level <span className="text-rose-500">*</span>
                </label>
                <select
                  value={jobLevelId}
                  onChange={(e) => setJobLevelId(e.target.value ? Number(e.target.value) : "")}
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
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Periode <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                    placeholder="2026"
                    className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 2: UPLOAD FILE EXCEL                                      */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">Upload File Excel</h4>
                <p className="text-[11px] text-slate-500">
                  Upload file master template KPI (.xlsx, .xls). Sistem akan membaca data dan menampilkan pada tabel di bawah.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />

            {uploadedFile ? (
              <div className="border border-emerald-300 bg-emerald-50/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-xs truncate">
                      {uploadedFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>File berhasil diunggah</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  >
                    Ganti File
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUploadedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    title="Hapus file"
                    className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-xl p-5 text-center cursor-pointer transition"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-4 h-4" />
                </div>
                <p className="font-semibold text-slate-800 text-xs">
                  Tarik file Excel ke sini, atau klik untuk memilih file (.xlsx, .xls)
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Format akan otomatis dibaca dan diekstrak ke dalam form tabel interaktif
                </p>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 3: REVIEW & PENYESUAIAN DATA                              */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </span>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Review & Penyesuaian Data</h4>
                  <p className="text-[11px] text-slate-500">
                    Data berikut dibaca dari file Excel. Anda dapat menyesuaikan langsung pada form jika terdapat ketidaksesuaian.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            </div>

            {kpiRows.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Belum ada data KPI.</p>
                <p className="text-[11px] text-slate-400">
                  Upload file Excel di atas atau klik tombol <strong>Tambah Baris</strong> untuk mengisi manual.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-x-auto shadow-2xs bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-[11px] font-bold">
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3 min-w-[240px]">Key Performance Indicator <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3 w-32">Unit Pengukuran <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3 w-36">Target <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3 w-28">Bobot (%) <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3 w-36">Status</th>
                      <th className="py-2.5 px-3 w-14 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kpiRows.map((row, idx) => {
                      const errorMsg = getRowError(row);
                      const isTargetEmpty = !row.target.trim();
                      const isNameEmpty = !row.name.trim();
                      const isUnitEmpty = !row.unit.trim();
                      const isWeightInvalid = isNaN(row.weight) || row.weight <= 0;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-xs">
                            {idx + 1}
                          </td>

                          {/* Key Performance Indicator */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRow(row.id, "name", e.target.value)}
                              placeholder="Masukkan nama KPI"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-slate-900 focus:outline-none transition ${
                                isNameEmpty
                                  ? "border-rose-400 focus:border-rose-500 bg-rose-50/20"
                                  : "border-slate-200 focus:border-blue-600 bg-white"
                              }`}
                            />
                          </td>

                          {/* Unit Pengukuran */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) => handleUpdateRow(row.id, "unit", e.target.value)}
                              placeholder="Rp/Bcm"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-slate-900 focus:outline-none transition ${
                                isUnitEmpty
                                  ? "border-rose-400 focus:border-rose-500 bg-rose-50/20"
                                  : "border-slate-200 focus:border-blue-600 bg-white"
                              }`}
                            />
                          </td>

                          {/* Target */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.target}
                              onChange={(e) => handleUpdateRow(row.id, "target", e.target.value)}
                              placeholder={isTargetEmpty ? "Masukkan target" : "1.500"}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs transition focus:outline-none ${
                                isTargetEmpty
                                  ? "border-rose-500 focus:border-rose-600 bg-rose-50/20 text-rose-900 placeholder:text-rose-400"
                                  : "border-slate-200 focus:border-blue-600 bg-white text-slate-900"
                              }`}
                            />
                          </td>

                          {/* Bobot (%) */}
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={row.weight === 0 && !row.name ? "" : row.weight}
                              onChange={(e) => {
                                const val = e.target.value === "" ? 0 : Number(e.target.value);
                                handleUpdateRow(row.id, "weight", val);
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-slate-900 focus:outline-none transition ${
                                isWeightInvalid
                                  ? "border-rose-400 focus:border-rose-500 bg-rose-50/20"
                                  : "border-slate-200 focus:border-blue-600 bg-white"
                              }`}
                            />
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3">
                            {errorMsg ? (
                              <span className="inline-flex items-center gap-1.5 text-rose-600 font-semibold text-xs">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                                <span className="truncate">{errorMsg}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                <span>Valid</span>
                              </span>
                            )}
                          </td>

                          {/* Aksi Hapus */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              title="Hapus baris KPI"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 4: VALIDASI DATA & RINGKASAN                              */}
          {/* ================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Validasi Data Checklist */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  4
                </span>
                <h4 className="font-bold text-slate-900 text-xs">Validasi Data</h4>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* 1. Format File */}
                <div className="flex items-start gap-2.5">
                  {uploadedFile ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Format file valid</span>
                    <p className="text-[11px] text-slate-500">
                      {uploadedFile
                        ? "File Excel berhasil dibaca oleh sistem."
                        : "Data dapat dimasukkan langsung tanpa file."}
                    </p>
                  </div>
                </div>

                {/* 2. Departemen & Job Level */}
                <div className="flex items-start gap-2.5">
                  {isMetadataValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Departemen & Job Level</span>
                    <p className="text-[11px] text-slate-500">
                      {isMetadataValid
                        ? "Data sudah dipilih dengan benar."
                        : "Harap pilih Departemen dan Job Level."}
                    </p>
                  </div>
                </div>

                {/* 3. Data KPI */}
                <div className="flex items-start gap-2.5">
                  {kpiRows.length > 0 && rowsWithErrors.length === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Data KPI</span>
                    <p className="text-[11px] text-slate-500">
                      {kpiRows.length === 0
                        ? "Belum ada baris KPI."
                        : rowsWithErrors.length === 0
                        ? "Seluruh data KPI valid."
                        : `Terdapat ${rowsWithErrors.length} data yang perlu diperbaiki.`}
                    </p>
                  </div>
                </div>

                {/* 4. Total Bobot */}
                <div className="flex items-start gap-2.5">
                  {isTotalBobot100 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Total bobot</span>
                    <p className="text-[11px]">
                      {isTotalBobot100 ? (
                        <span className="text-emerald-700 font-semibold">
                          Total bobot sudah pas 100%.
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Total bobot saat ini {totalBobot}%. Harus 100%.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Ringkasan Metrics */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs">Ringkasan</h4>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Jumlah KPI</span>
                    <span className="font-bold text-slate-900 text-sm">{kpiRows.length}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Total Bobot</span>
                    <span
                      className={`font-bold text-sm ${
                        isTotalBobot100 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {totalBobot}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Status</span>
                    {canSave ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Valid & Siap Disimpan
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Perlu Diperbaiki
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Alert box warning jika belum 100% atau ada error */}
              {!canSave && (
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 flex items-start gap-2 text-[11px] text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    {!isTotalBobot100 ? (
                      <>
                        <strong className="block font-bold">Total bobot belum 100%.</strong>
                        <span>Sesuaikan bobot pada tabel di atas hingga total menjadi 100% untuk dapat disimpan.</span>
                      </>
                    ) : rowsWithErrors.length > 0 ? (
                      <>
                        <strong className="block font-bold">Terdapat data yang belum lengkap.</strong>
                        <span>Lengkapi Target atau nilai pada field yang ditandai merah untuk dapat disimpan.</span>
                      </>
                    ) : (
                      <>
                        <strong className="block font-bold">Informasi template belum lengkap.</strong>
                        <span>Pilih Departemen dan Job Level terlebih dahulu.</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 ${
              canSave
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                : "bg-slate-300 text-slate-500 cursor-not-allowed select-none opacity-80"
            }`}
          >
            {isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Menyimpan Master Template...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Master Template</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
