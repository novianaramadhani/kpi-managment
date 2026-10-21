"use client";

import React, { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  downloadBlankKpiTemplate,
  downloadSampleKpiTemplate,
  downloadMasterParameterTemplate,
  parseKpiTemplateExcel,
  type ParseResult,
  type MasterParamItem,
} from "@/lib/excel-template-kpi";
import { fmtPct } from "@/lib/scoring";
import type { ImportCategoryInput } from "@/lib/actions";
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  ArrowRight,
  Info,
} from "lucide-react";

export interface TemplateExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: number;
  templateName: string;
  targetTotalWeight: number;
  departmentId?: number | null;
  departmentName?: string;
  masterParams?: MasterParamItem[];
  importAction: (
    templateId: number,
    categories: ImportCategoryInput[],
    mode: "REPLACE" | "APPEND"
  ) => Promise<{
    catCount: number;
    paramCount: number;
    bandCount: number;
    newMasterCount?: number;
    updatedCount?: number;
    createdCount?: number;
  }>;
  onExportCurrent?: () => void;
}

export function TemplateExcelModal({
  isOpen,
  onClose,
  templateId,
  templateName,
  targetTotalWeight,
  departmentId,
  departmentName,
  masterParams = [],
  importAction,
  onExportCurrent,
}: TemplateExcelModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importMode, setImportMode] = useState<"REPLACE" | "APPEND">("REPLACE");
  const [isPending, startTransition] = useTransition();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setParseResult(null);
      setIsParsing(false);
      setImportMode("REPLACE");
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    try {
      const res = await parseKpiTemplateExcel(selectedFile, Math.round(targetTotalWeight * 100));
      setParseResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file Excel";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#0f172a",
      });
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = () => {
    if (!parseResult || parseResult.categories.length === 0) return;

    if (parseResult.errors.length > 0) {
      void Swal.fire({
        icon: "error",
        title: "Terdapat Error pada File Excel",
        text: "Silakan perbaiki kesalahan pada file Excel terlebih dahulu sebelum melakukan import.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await importAction(
          templateId,
          parseResult.categories as unknown as ImportCategoryInput[],
          importMode
        );

        const detailParts: string[] = [];
        if (res.updatedCount && res.updatedCount > 0) {
          detailParts.push(`${res.updatedCount} diperbarui`);
        }
        if (res.createdCount && res.createdCount > 0) {
          detailParts.push(`${res.createdCount} baru`);
        }
        const countDetail = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";

        const syncNote =
          res.newMasterCount && res.newMasterCount > 0
            ? ` Serta otomatis mendaftarkan ${res.newMasterCount} indikator baru ke Kamus Master Parameter.`
            : "";

        await Swal.fire({
          icon: "success",
          title: "Import Berhasil",
          text: `Berhasil memproses ${res.catCount} Parameter, ${res.paramCount} Indikator, dan ${res.bandCount} Kriteria${countDetail} ke template "${templateName}".${syncNote}`,
          confirmButtonColor: "#0284c7",
          timer: 3500,
          timerProgressBar: true,
        });

        router.refresh();
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengimpor struktur template";
        await Swal.fire({
          icon: "error",
          title: "Gagal Import",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  const isWeightMatch =
    parseResult && Math.abs(parseResult.totalWeight - targetTotalWeight) < 0.01;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import & Export Template KPI Excel
              </h2>
              <p className="text-xs text-slate-500">
                Template: <strong className="text-slate-700">{templateName}</strong> · Tinjau
                pratinjau data sebelum disimpan ke sistem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ========================================================= */}
        {/* MODAL BODY (SCROLLABLE) */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* STEP 1: UPLOAD & DOWNLOAD TEMPLATES (If no file or user wants to re-upload) */}
          {!file ? (
            <div className="space-y-5">
              {/* Action 0: Export Current Template with _SYSTEM_MAPPING (if available) */}
              {onExportCurrent && (
                <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-2xs hover:border-blue-300 transition">
                  <div className="space-y-1 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="block text-xs font-bold text-slate-900">
                        Export Template Saat Ini (dengan ID Pemetaan)
                      </span>
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                        Sinkronisasi ID
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Download struktur KPI template saat ini lengkap dengan hidden sheet <code>_SYSTEM_MAPPING</code>. Cocok untuk mengedit data di Excel lalu mengimpornya kembali secara presisi tanpa merusak data atau membuat duplikasi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onExportCurrent}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5 text-white" />
                    <span>Export Template Ini (.xlsx)</span>
                  </button>
                </div>
              )}

              {/* Action 1: Export Pre-filled Master Parameters Template */}
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs hover:border-emerald-300 transition">
                <div className="space-y-1 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="block text-xs font-bold text-slate-900">
                      Format Excel Terisi Kamus Master Parameter
                    </span>
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                      Rekomendasi
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Otomatis terisi seluruh indikator dari Kamus Master yang relevan untuk {departmentName ? `Departemen ${departmentName}` : "template ini"} (Umum + Departemen). Anda tinggal mengisi Target & Bobot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const relevantMasters = masterParams.filter(
                      (p) => !p.departmentId || (departmentId && p.departmentId === departmentId)
                    );
                    downloadMasterParameterTemplate({
                      filename: `Format_Master_KPI_${templateName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`,
                      templateName,
                      departmentName,
                      totalWeightPct: Math.round(targetTotalWeight * 100),
                      masterParams: relevantMasters.length > 0 ? relevantMasters : masterParams,
                    });
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
                >
                  <Download className="h-3.5 w-3.5 text-white" />
                  <span>Download Format Terisi (.xlsx)</span>
                </button>
              </div>

              {/* Action 2: Export Blank Template */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-2xs hover:border-slate-300 transition">
                <div className="space-y-1 pr-3">
                  <span className="block text-xs font-bold text-slate-900">
                    Format Template Kosong (Blank)
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Dapatkan format Excel kosong berisikan struktur 12 kolom standar Master Template dan sheet panduan ketentuan untuk diisi dari awal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    downloadBlankKpiTemplate({
                      filename: `Template_Kosong_${templateName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`,
                      templateName,
                      departmentName,
                      totalWeightPct: Math.round(targetTotalWeight * 100),
                    });
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-slate-600" />
                  <span>Download Format Kosong (.xlsx)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center hover:bg-slate-50 hover:border-emerald-400 transition"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      void handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-2xs border border-slate-200 text-emerald-600 mb-3">
                  <Upload className="h-6 w-6" />
                </div>

                <p className="font-bold text-slate-800 text-sm">
                  Tarik file Excel (.xlsx) ke sini, atau klik tombol di bawah
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  File harus memuat kolom Master Template:{" "}
                  <span className="font-medium text-slate-700">
                    Parameter, Indikator, Target, Satuan, Kriteria Penilaian, Skor, Bobot
                  </span>
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Pilih File dari Komputer</span>
                  </button>
                </div>
              </div>

              {/* Format Guidelines Summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Info className="h-4 w-4 text-emerald-600" />
                  <span>Ketentuan Format Excel Master Template:</span>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 list-disc pl-5 text-[11px] text-slate-600">
                  <li>
                    <strong>Hierarki:</strong> Parameter (Level 1) &rarr; Indikator (Level 2) &rarr; Kriteria Penilaian (Level 3) &rarr; Skor &rarr; Bobot.
                  </li>
                  <li>
                    <strong>Total Bobot Parameter:</strong> Direkomendasikan tepat{" "}
                    <span className="font-semibold text-emerald-700">
                      {Math.round(targetTotalWeight * 100)}%
                    </span>
                    .
                  </li>
                  <li>
                    <strong>Target & Satuan:</strong> Kolom Target dan Satuan diparsing murni ke field sistem.
                  </li>
                  <li>
                    <strong>Sistem Mapping:</strong> Sheet tersembunyi <code>_SYSTEM_MAPPING</code> otomatis mendeteksi ID lama untuk melakukan pembaruan (UPDATE) tanpa duplikasi.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* STEP 2: REVIEW & PREVIEW STEP */
            <div className="space-y-5">
              {/* File Info & Switch Button */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · Terbaca oleh sistem
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setParseResult(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Ganti File Excel
                  </button>
                </div>
              </div>

              {/* Parsing State */}
              {isParsing && (
                <div className="flex items-center justify-center gap-2 py-8 text-slate-600">
                  <svg
                    className="h-5 w-5 animate-spin text-emerald-600"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span className="text-xs font-medium">
                    Menganalisis dan memvalidasi struktur Excel...
                  </span>
                </div>
              )}

              {/* Parsed Content Review */}
              {parseResult && !isParsing && (
                <div className="space-y-4">
                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase">
                        Total Parameter
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {parseResult.categories.length}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase">
                        Total Indikator
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {parseResult.totalParams}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase">
                        Kriteria Penilaian
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {parseResult.totalBands}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase">
                        Total Bobot
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`text-lg font-bold ${
                            isWeightMatch ? "text-emerald-700" : "text-amber-600"
                          }`}
                        >
                          {Math.round(parseResult.totalWeight * 100)}%
                        </span>
                        <span className="text-xs text-slate-400">
                          / {Math.round(targetTotalWeight * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Errors Notice (Blocking) */}
                  {parseResult.errors.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-rose-900">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>Terdapat Kesalahan yang Perlu Diperbaiki ({parseResult.errors.length}):</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-[11px]">
                        {parseResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-rose-600 pt-1">
                        * Mohon perbaiki data pada file Excel Anda kemudian klik &quot;Ganti File Excel&quot; di atas.
                      </p>
                    </div>
                  )}

                  {/* Warnings Notice (Non-blocking) */}
                  {parseResult.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <Info className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Catatan Validasi ({parseResult.warnings.length}):</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                        {parseResult.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Mapping Info Pill / Notification */}
                  {parseResult.hasSystemMapping ? (
                    <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                        <span>
                          <strong>ID Pemetaan Sistem Terdeteksi:</strong> Terdapat{" "}
                          <span className="font-bold text-blue-800">{parseResult.updateCount}</span> item yang cocok untuk <strong>UPDATE</strong> dan{" "}
                          <span className="font-bold text-blue-800">{parseResult.createCount}</span> item baru untuk <strong>CREATE</strong>.
                        </span>
                      </div>
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shrink-0 ml-2">
                        Sinkronisasi ID
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <Info className="h-4 w-4 text-slate-500 shrink-0" />
                      <span>
                        Mode Standar: Tidak ditemukan sheet <code>_SYSTEM_MAPPING</code>. Seluruh parameter dan indikator akan dibuat sebagai data baru.
                      </span>
                    </div>
                  )}

                  {/* Success Banner if clean */}
                  {parseResult.errors.length === 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        Struktur Excel valid dan siap diterapkan. Tinjau rincian Master Template di bawah ini sebelum menyimpan.
                      </span>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* REVIEW TABLE: MASTER TEMPLATE STRUCTURE PREVIEW */}
                  {/* Parameter -> Indikator -> Kriteria Penilaian -> Skor -> Bobot */}
                  {/* ========================================================= */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Pratinjau Struktur Master Template
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {parseResult.categories.length} Parameter · {parseResult.totalParams} Indikator
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                      <div className="max-h-80 overflow-y-auto overflow-x-auto text-xs">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                            <tr>
                              <th className="px-3 py-2.5 w-16 text-center">Status</th>
                              <th className="px-3.5 py-2.5 w-1/3">Parameter / Indikator</th>
                              <th className="px-3 py-2.5 text-center w-24">Target & Satuan</th>
                              <th className="px-3.5 py-2.5 w-1/3">
                                <div className="flex items-center justify-between gap-1">
                                  <span>Kriteria Penilaian</span>
                                  <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                    Operator • Nilai
                                  </span>
                                </div>
                              </th>
                              <th className="px-3 py-2.5 text-center w-16">Skor</th>
                              <th className="px-3.5 py-2.5 text-center w-20">Bobot</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {parseResult.categories.map((c, ci) => {
                              const isDirect = c.categoryType === "DIRECT";
                              const catWeightPct = Math.round(c.weight * 100);

                              return (
                                <React.Fragment key={ci}>
                                  {/* PARAMETER LEVEL 1 HEADER ROW */}
                                  <tr className="bg-slate-50/90 font-bold border-t border-b border-slate-200">
                                    <td className="px-3 py-2 text-center align-middle">
                                      {c.id ? (
                                        <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200">
                                          UPDATE #{c.id}
                                        </span>
                                      ) : (
                                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                          BARU
                                        </span>
                                      )}
                                    </td>
                                    <td colSpan={5} className="px-3.5 py-2">
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-slate-900 text-xs">
                                            {ci + 1}. {c.name}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-3 text-slate-600 text-[11px] font-medium">
                                          <span>
                                            Bobot Parameter:{" "}
                                            <strong className="text-slate-900 font-bold">
                                              {catWeightPct}%
                                            </strong>
                                          </span>
                                          {!isDirect && (
                                            <>
                                              <span className="text-slate-300">•</span>
                                              <span>
                                                Indikator:{" "}
                                                <strong className="text-slate-900">
                                                  {c.params.length} item
                                                </strong>
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* INDIKATOR LEVEL 2 ROWS */}
                                  {c.params.map((p, pi) => {
                                    const pWeightPct = Math.round(p.weight * 100);
                                    const effExact = (pWeightPct / 100) * catWeightPct;
                                    const effectivePct = Number.isInteger(effExact)
                                      ? effExact
                                      : parseFloat(effExact.toFixed(1));

                                    return (
                                      <tr key={pi} className="hover:bg-slate-50/80 transition">
                                        {/* Status ID Mapping */}
                                        <td className="px-3 py-2.5 align-top text-center">
                                          {p.id ? (
                                            <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200">
                                              #{p.id}
                                            </span>
                                          ) : (
                                            <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                              BARU
                                            </span>
                                          )}
                                        </td>

                                        {/* Indikator Name & Description */}
                                        <td className="px-3.5 py-2.5 align-top">
                                          <div className="font-semibold text-slate-900">
                                            {isDirect ? c.name : `${ci + 1}.${pi + 1} ${p.name}`}
                                          </div>
                                          {p.description && (
                                            <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                              {p.description}
                                            </div>
                                          )}
                                        </td>

                                        {/* Target & Satuan */}
                                        <td className="px-3 py-2.5 align-top text-center">
                                          <div className="font-semibold text-slate-800 text-xs">
                                            {p.target || "-"}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-mono">
                                            {p.unit || "%"}
                                          </div>
                                        </td>

                                        {/* Kriteria Penilaian */}
                                        <td className="px-3.5 py-2.5 align-top">
                                          {p.bands.length > 0 ? (
                                            <div className="space-y-1">
                                              {p.bands.map((b, bi) => {
                                                const opSym = b.operatorSymbol || (b.label.startsWith("<") ? "<" : b.label.startsWith(">") ? ">" : "=");
                                                const critVal = b.criteriaValue || b.label;
                                                return (
                                                  <div
                                                    key={bi}
                                                    className="flex items-center justify-between gap-2 text-[11px] bg-slate-50/70 px-2 py-0.5 rounded border border-slate-100"
                                                  >
                                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                      <span
                                                        className={`font-mono font-bold text-[10px] px-1.5 py-0.2 rounded border shadow-2xs select-none shrink-0 ${
                                                          b.isUnrecognizedOperator || opSym === "?"
                                                            ? "bg-amber-100 text-amber-900 border-amber-400"
                                                            : opSym === ">=" || opSym === "≥" || opSym === ">"
                                                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                                            : opSym === "<=" || opSym === "≤" || opSym === "<"
                                                            ? "bg-blue-50 text-blue-800 border-blue-300"
                                                            : opSym === "="
                                                            ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                                                            : opSym === "Rentang"
                                                            ? "bg-purple-50 text-purple-800 border-purple-300"
                                                            : "bg-slate-100 text-slate-800 border-slate-300"
                                                        }`}
                                                        title={`Operator: ${opSym}`}
                                                      >
                                                        <span className="text-[9px] uppercase font-bold text-slate-500 mr-0.5">Op:</span>
                                                        <span>{opSym}</span>
                                                      </span>
                                                      <span className="text-slate-800 font-semibold truncate">
                                                        {critVal}
                                                      </span>
                                                      {b.isUnrecognizedOperator && (
                                                        <span className="text-[9px] font-semibold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                                                          Manual
                                                        </span>
                                                      )}
                                                    </div>
                                                    <span className="font-bold text-slate-900 shrink-0">
                                                      Skor {b.score}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 italic text-[11px]">
                                              (Belum ada kriteria band)
                                            </span>
                                          )}
                                        </td>

                                        {/* Skor Max */}
                                        <td className="px-3.5 py-2.5 align-top text-center font-bold text-slate-800">
                                          {p.maxScore}
                                        </td>

                                        {/* Bobot */}
                                        <td className="px-3.5 py-2.5 align-top text-center">
                                          {isDirect ? (
                                            <span className="font-bold text-slate-900">
                                              {catWeightPct}%
                                            </span>
                                          ) : (
                                            <div>
                                              <span className="font-bold text-slate-900">
                                                {pWeightPct}%
                                              </span>
                                              <span className="block text-[10px] text-slate-500">
                                                Efektif: {effectivePct}%
                                              </span>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Import Mode Radio Selection */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <span className="block font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Metode Penyelarasan Struktur:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                          importMode === "REPLACE"
                            ? "border-emerald-600 bg-white shadow-2xs ring-1 ring-emerald-600"
                            : "border-slate-200 bg-white/60 hover:bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "REPLACE"}
                          onChange={() => setImportMode("REPLACE")}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-600"
                        />
                        <div>
                          <span className="block text-xs font-bold text-slate-900">
                            Sinkronisasi & Perbarui Struktur (Rekomendasi)
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            Data dengan ID mapping akan di-update secara presisi. Data baru akan ditambahkan.
                          </span>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                          importMode === "APPEND"
                            ? "border-emerald-600 bg-white shadow-2xs ring-1 ring-emerald-600"
                            : "border-slate-200 bg-white/60 hover:bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "APPEND"}
                          onChange={() => setImportMode("APPEND")}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-600"
                        />
                        <div>
                          <span className="block text-xs font-bold text-slate-900">
                            Tambahkan ke Struktur yang Ada
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            Menyimpan seluruh data dari Excel tanpa menghapus data lain yang sudah ada sebelumnya.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* MODAL FOOTER */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
          >
            Batal
          </button>

          {file && parseResult ? (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={
                !parseResult ||
                parseResult.categories.length === 0 ||
                parseResult.errors.length > 0 ||
                isPending
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Menerapkan ke Template...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Terapkan & Simpan ke Template</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 italic">
              Pilih file Excel untuk melanjutkan review
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
