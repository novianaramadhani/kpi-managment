"use client";

import React, { useState, useRef, useTransition, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Search,
  Building2,
  RotateCcw,
} from "lucide-react";
import {
  analyzeDepartmentExcelRows,
  type DepartmentImportPreviewRow,
  type SmartDepartmentImportPayload,
  type SmartDepartmentImportResult,
} from "@/lib/department-mapping-utils";
import { downloadDepartmentTemplate, parseDepartmentExcelFile } from "@/lib/excel-master";

interface SimpleDepartment {
  id: number;
  code: string;
  name: string;
}

interface DepartmentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDepartments: SimpleDepartment[];
  existingMappings?: unknown[];
  operatingUnits?: unknown[];
  onImportAction: (payload: SmartDepartmentImportPayload) => Promise<SmartDepartmentImportResult>;
  onSuccess?: () => void;
  onSwitchToMappingTab?: () => void;
}

export function DepartmentImportModal({
  isOpen,
  onClose,
  existingDepartments,
  onImportAction,
  onSuccess,
}: DepartmentImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [previewRows, setPreviewRows] = useState<DepartmentImportPreviewRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEW" | "UPDATE" | "DUPLICATE">("ALL");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPreviewRows([]);
      setIsParsing(false);
      setSearchQuery("");
      setStatusFilter("ALL");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setIsParsing(true);
    try {
      const parsedItems = await parseDepartmentExcelFile(selected);
      if (parsedItems.length === 0) {
        void Swal.fire({
          icon: "warning",
          title: "File Kosong atau Format Tidak Sesuai",
          text: "Tidak ada baris data yang terbaca. Pastikan header kolom Excel memiliki [code, name].",
          confirmButtonColor: "#f59e0b",
        });
        setFile(null);
        setPreviewRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const { items } = analyzeDepartmentExcelRows(parsedItems, existingDepartments);
      setPreviewRows(items);
      setSearchQuery("");
      setStatusFilter("ALL");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file Excel";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#e11d48",
      });
      setFile(null);
      setPreviewRows([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsParsing(false);
    }
  };

  const handleResetFile = () => {
    setFile(null);
    setPreviewRows([]);
    setSearchQuery("");
    setStatusFilter("ALL");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stats = useMemo(() => {
    let newCount = 0;
    let updateCount = 0;
    let duplicateCount = 0;

    for (const r of previewRows) {
      if (r.status === "UNIQUE") newCount++;
      else if (r.status === "EXACT_DB") updateCount++;
      else if (r.status === "DUPLICATE_IN_FILE") duplicateCount++;
    }

    const readyCount = newCount + updateCount;

    return {
      total: previewRows.length,
      newCount,
      updateCount,
      duplicateCount,
      readyCount,
      canProceed: readyCount > 0,
    };
  }, [previewRows]);

  const filteredRows = useMemo(() => {
    return previewRows.filter((r) => {
      if (statusFilter === "NEW" && r.status !== "UNIQUE") return false;
      if (statusFilter === "UPDATE" && r.status !== "EXACT_DB") return false;
      if (statusFilter === "DUPLICATE" && r.status !== "DUPLICATE_IN_FILE") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = r.code.toLowerCase().includes(q);
        const matchName = r.name.toLowerCase().includes(q);
        return matchCode || matchName;
      }

      return true;
    });
  }, [previewRows, statusFilter, searchQuery]);

  const handleProcessImport = async () => {
    if (stats.readyCount === 0) {
      void Swal.fire({
        icon: "info",
        title: "Tidak Ada Data Diproses",
        text: "Semua baris berstatus duplikat di file. Tidak ada departemen baru atau pembaruan yang disimpan.",
        confirmButtonColor: "#64748b",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Konfirmasi Import Departemen",
      html: `
        <div class="text-left text-xs text-slate-700 space-y-2">
          <p>Sistem akan memproses data ke Master Departemen:</p>
          <ul class="list-disc pl-5 space-y-1">
            ${
              stats.newCount > 0
                ? `<li><strong>${stats.newCount} Departemen Baru</strong> akan ditambahkan.</li>`
                : ""
            }
            ${
              stats.updateCount > 0
                ? `<li><strong>${stats.updateCount} Departemen Terdaftar</strong> akan diperbarui namanya.</li>`
                : ""
            }
            ${
              stats.duplicateCount > 0
                ? `<li><span class="text-slate-500">${stats.duplicateCount} Baris Duplikat di File</span> akan dilewati otomatis.</li>`
                : ""
            }
          </ul>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0f172a",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Proses Import",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const departmentsToCreate = previewRows
      .filter((r) => r.resolutionAction === "CREATE_NEW")
      .map((r) => ({
        code: r.code.trim().toUpperCase(),
        name: r.name.trim(),
      }));

    startTransition(async () => {
      try {
        const result = await onImportAction({
          departmentsToCreate,
          mappingsToSave: [],
          skippedCount: stats.duplicateCount,
        });

        if (result.errors && result.errors.length > 0) {
          await Swal.fire({
            icon: "warning",
            title: "Import Selesai dengan Catatan",
            html: `
              <div class="text-left text-xs space-y-1">
                <p>Berhasil menyimpan <strong>${result.createdDepartmentsCount}</strong> departemen.</p>
                <p class="text-rose-600 font-semibold mt-2">Catatan:</p>
                <ul class="list-disc pl-4 text-slate-600 max-h-40 overflow-y-auto">
                  ${result.errors.map((e) => `<li>${e}</li>`).join("")}
                </ul>
              </div>
            `,
            confirmButtonColor: "#f59e0b",
          });
        } else {
          await Swal.fire({
            icon: "success",
            title: "Import Berhasil",
            text: `${result.createdDepartmentsCount} departemen berhasil disimpan ke Master Departemen.`,
            confirmButtonColor: "#0f172a",
          });
        }

        onClose();
        if (onSuccess) onSuccess();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses import.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Import",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dept-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
              <Building2 className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h2 id="dept-import-title" className="text-sm font-bold text-slate-900">
                Import Master Departemen
              </h2>
              <p className="text-[11px] text-slate-500">
                Unggah file Excel untuk menambah atau memperbarui Master Departemen secara massal.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Isi Modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Zona Unggah File */}
          {!file ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Belum memiliki format? Unduh template resmi Excel kolom <strong>code</strong> dan{" "}
                    <strong>name</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadDepartmentTemplate()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer text-xs shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Download Template Excel</span>
                </button>
              </div>

              <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400 transition p-8 text-center cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelect}
                  disabled={isParsing || isPending}
                  className="hidden"
                  id="dept-file-upload-input"
                />
                <label
                  htmlFor="dept-file-upload-input"
                  className="flex flex-col items-center justify-center cursor-pointer w-full h-full"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-800 mb-2">
                    {isParsing ? (
                      <Loader2 className="w-6 h-6 animate-spin text-slate-900" />
                    ) : (
                      <Upload className="w-6 h-6 text-slate-700" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Pilih File Excel untuk Diimpor
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Mendukung format .xlsx, .xls, .csv (kolom: code, name)
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info File Aktif & Ganti File */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-900">{file.name}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-600">{previewRows.length} baris terbaca</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFile}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Ganti File</span>
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => downloadDepartmentTemplate()}
                    className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Download Template
                  </button>
                </div>
              </div>

              {/* Ringkasan Statistik */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium ${
                      statusFilter === "ALL"
                        ? "bg-slate-900 text-white font-bold"
                        : "bg-slate-100 text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Semua ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("NEW")}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium ${
                      statusFilter === "NEW"
                        ? "bg-emerald-700 text-white font-bold"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    Baru ({stats.newCount})
                  </button>
                  {stats.updateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter("UPDATE")}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium ${
                        statusFilter === "UPDATE"
                          ? "bg-blue-700 text-white font-bold"
                          : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                      }`}
                    >
                      Pembaruan ({stats.updateCount})
                    </button>
                  )}
                  {stats.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter("DUPLICATE")}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium ${
                        statusFilter === "DUPLICATE"
                          ? "bg-slate-600 text-white font-bold"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Duplikat di File ({stats.duplicateCount})
                    </button>
                  )}
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kode atau nama..."
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
                  />
                </div>
              </div>

              {/* Tabel Pratinjau Departemen */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 w-12 text-center">No</th>
                        <th className="px-3 py-2.5 w-28">Kode Departemen</th>
                        <th className="px-3 py-2.5">Nama Departemen</th>
                        <th className="px-3 py-2.5 w-32 text-center">Status</th>
                        <th className="px-3 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            Tidak ada data yang sesuai dengan filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/70 transition">
                            <td className="px-3 py-2 text-center text-slate-500 font-mono">
                              {row.rowIndex}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-900">
                              {row.code || "-"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {row.name}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.status === "UNIQUE" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                  Baru
                                </span>
                              )}
                              {row.status === "EXACT_DB" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                                  Pembaruan
                                </span>
                              )}
                              {row.status === "DUPLICATE_IN_FILE" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                                  Duplikat di File
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500">
                              {row.detectionReason}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <div className="flex items-center gap-2">
            {previewRows.length > 0 && (
              <button
                type="button"
                onClick={handleProcessImport}
                disabled={!stats.canProceed || isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {isPending
                    ? "Menyimpan..."
                    : `Proses Import (${stats.readyCount} Departemen)`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
