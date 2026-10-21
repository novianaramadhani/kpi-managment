"use client";

import React, { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";

interface ColumnDef<T> {
  key: keyof T;
  label: string;
}

interface MasterImportModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityName: string;
  fieldNames: string[];
  columns: ColumnDef<T>[];
  onDownloadTemplate: () => void;
  onParseFile: (file: File) => Promise<T[]>;
  onImport: (validItems: T[]) => Promise<{ count?: number } | void>;
  validateItem: (item: T) => { isValid: boolean; error?: string };
}

export function MasterImportModal<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  title,
  entityName,
  fieldNames,
  columns,
  onDownloadTemplate,
  onParseFile,
  onImport,
  validateItem,
}: MasterImportModalProps<T>) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<{ item: T; isValid: boolean; error?: string }[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParsedRows([]);
      setIsParsing(false);
    }
  }, [isOpen]);

  // Handle ESC key
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setIsParsing(true);
    try {
      const items = await onParseFile(selected);
      if (items.length === 0) {
        void Swal.fire({
          icon: "warning",
          title: "File Kosong atau Tidak Cocok",
          text: `Tidak ada data yang terbaca. Pastikan baris header memuat nama field: [${fieldNames.join(", ")}].`,
          confirmButtonColor: "#f59e0b",
        });
        setFile(null);
        setParsedRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        const validated = items.map((item) => {
          const res = validateItem(item);
          return { item, isValid: res.isValid, error: res.error };
        });
        setParsedRows(validated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file Excel";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#e11d48",
      });
      setFile(null);
      setParsedRows([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsParsing(false);
    }
  };

  const validRows = parsedRows.filter((r) => r.isValid);
  const invalidRows = parsedRows.filter((r) => !r.isValid);

  const handleExecuteImport = () => {
    if (validRows.length === 0) return;

    startTransition(async () => {
      try {
        await onImport(validRows.map((r) => r.item));
        await Swal.fire({
          icon: "success",
          title: "Impor Berhasil",
          text: `Berhasil mengimpor ${validRows.length} data ${entityName}.`,
          timer: 1800,
          showConfirmButton: false,
        });
        onClose();
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : `Gagal mengimpor data ${entityName}`;
        await Swal.fire({
          icon: "error",
          title: "Gagal Impor",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-2xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
              <p className="text-[11px] text-slate-500">
                Format kolom file Excel:{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {fieldNames.join(", ")}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Download Template Banner */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Unduh Format Template</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                File Excel hanya memuat baris nama field:{" "}
                <span className="font-mono font-bold text-slate-700">[{fieldNames.join(", ")}]</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Download Template</span>
            </button>
          </div>

          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50/80 p-5 text-center cursor-pointer transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-2">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-800">
              {file ? file.name : "Klik atau pilih file Excel (.xlsx / .csv)"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB · Klik untuk mengganti file`
                : "Format Excel wajib memuat header sesuai nama field"}
            </p>
          </div>

          {/* Loading Indicator */}
          {isParsing && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
              <span>Membaca dan memverifikasi data Excel...</span>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && !isParsing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Preview Data ({parsedRows.length} baris)</span>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 border border-emerald-200/80">
                    <CheckCircle2 className="w-3 h-3" /> {validRows.length} Siap Impor
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 border border-rose-200/80">
                      <AlertCircle className="w-3 h-3" /> {invalidRows.length} Tidak Valid
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      {columns.map((col) => (
                        <th key={String(col.key)} className="px-3 py-2">
                          {col.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 w-28 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? "hover:bg-slate-50/80" : "bg-rose-50/40"}>
                        <td className="px-3 py-1.5 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        {columns.map((col) => (
                          <td key={String(col.key)} className="px-3 py-1.5 text-slate-800 font-medium">
                            {String(row.item[col.key] ?? "-")}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {row.isValid ? (
                            <span className="text-emerald-700 font-semibold text-[11px] inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Valid
                            </span>
                          ) : (
                            <span
                              className="text-rose-600 font-semibold text-[11px] inline-flex items-center gap-1"
                              title={row.error}
                            >
                              <AlertCircle className="w-3 h-3" /> {row.error || "Gagal"}
                            </span>
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={validRows.length === 0 || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mengimpor...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Impor {validRows.length > 0 ? `${validRows.length} ${entityName}` : "Data"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
