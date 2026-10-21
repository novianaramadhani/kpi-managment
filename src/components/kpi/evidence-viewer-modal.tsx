"use client";

import React, { useState, useEffect } from "react";
import type { AppraisalEvidenceItem } from "@/types/monthly-assessment";
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Table,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  User,
  Calendar,
  HardDrive,
  Eye,
  FileDown,
} from "lucide-react";

export interface EvidenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  indicatorName?: string;
  categoryName?: string;
  items: AppraisalEvidenceItem[];
  initialIndex?: number;
  onDelete?: (evidenceId: number) => Promise<void> | void;
  isReadOnly?: boolean;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(dateVal?: string | Date | null): string {
  if (!dateVal) return "-";
  try {
    const d = new Date(dateVal);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateVal);
  }
}

export function EvidenceViewerModal({
  isOpen,
  onClose,
  title = "Pratinjau Dokumen Bukti (Evidence)",
  indicatorName,
  categoryName,
  items,
  initialIndex = 0,
  onDelete,
  isReadOnly = false,
}: EvidenceViewerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(initialIndex);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(initialIndex >= 0 && initialIndex < items.length ? initialIndex : 0);
    }
  }, [isOpen, initialIndex, items.length]);

  if (!isOpen || items.length === 0) return null;

  const currentItem = items[selectedIndex] || items[0];
  if (!currentItem) return null;

  const isExcel =
    currentItem.fileType === "EXCEL_DATA" ||
    /\.(xlsx|xls|csv)$/i.test(currentItem.fileName);
  const isImage =
    currentItem.mimeType?.startsWith("image/") ||
    /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(currentItem.fileName);
  const isPdf =
    currentItem.mimeType === "application/pdf" ||
    /\.pdf$/i.test(currentItem.fileName);
  const isDoc = /\.(doc|docx)$/i.test(currentItem.fileName);

  const handleDelete = async () => {
    if (!onDelete || isReadOnly) return;
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus berkas "${currentItem.fileName}"?`
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      await onDelete(currentItem.id);
      if (items.length <= 1) {
        onClose();
      } else {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error deleting evidence:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                <Eye className="w-3 h-3" />
                View Evidence
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {title}
              </h2>
            </div>
            {(indicatorName || categoryName) && (
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {categoryName ? `${categoryName} • ` : ""}
                <span className="font-semibold text-slate-700">{indicatorName}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Tombol Unduh */}
            <a
              href={currentItem.filePath}
              download={currentItem.fileName}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition active:scale-95 cursor-pointer"
              title="Unduh berkas ini"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Unduh</span>
            </a>

            {/* Tombol Buka Tab Baru */}
            <a
              href={currentItem.filePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition active:scale-95 cursor-pointer"
              title="Buka dokumen di tab baru"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Tab Baru</span>
            </a>

            {/* Tombol Tutup */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              title="Tutup dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Berkas Jika Ada Lebih Dari 1 Item */}
        {items.length > 1 && (
          <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 bg-slate-100/70 overflow-x-auto shrink-0 scrollbar-thin">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0 mr-1">
              Daftar Bukti ({items.length}):
            </span>
            {items.map((it, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={it.id || idx}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition shrink-0 cursor-pointer ${
                    active
                      ? "bg-white text-indigo-700 font-semibold shadow-2xs border border-indigo-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">
                    {it.fileName}
                  </span>
                  {it.matchStatus === "MATCH" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Viewer Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50 flex flex-col items-center justify-center min-h-[360px] max-h-[68vh]">
          {isImage ? (
            <div className="w-full flex flex-col items-center justify-center">
              <div className="relative max-w-full max-h-[60vh] rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 shadow-md flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentItem.filePath}
                  alt={currentItem.fileName}
                  className="max-w-full max-h-[56vh] object-contain rounded"
                />
              </div>
              <div className="mt-2 text-center text-xs text-slate-500 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold text-slate-700 truncate max-w-xs sm:max-w-md">
                  {currentItem.fileName}
                </span>
                <span>•</span>
                <span>{formatBytes(currentItem.fileSize)}</span>
              </div>
            </div>
          ) : isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center flex-1">
              <iframe
                src={currentItem.filePath}
                title={currentItem.fileName}
                className="w-full h-[60vh] rounded-lg border border-slate-200 bg-white shadow-sm"
              />
              <div className="mt-2 text-center text-xs text-slate-500 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span>Format Dokumen PDF. Jika tidak muncul, gunakan tombol </span>
                <a
                  href={currentItem.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-semibold"
                >
                  Buka di Tab Baru
                </a>
              </div>
            </div>
          ) : isExcel ? (
            <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Table className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm truncate max-w-md">
                      {currentItem.fileName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>{formatBytes(currentItem.fileSize)}</span>
                      <span>•</span>
                      <span>Excel Spreadsheet</span>
                      {currentItem.extractedValue && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-emerald-700">
                            Nilai: {currentItem.extractedValue}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {currentItem.matchStatus && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold border ${
                      currentItem.matchStatus === "MATCH"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : currentItem.matchStatus === "MISMATCH"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {currentItem.matchStatus === "MATCH" ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Data Match</span>
                      </>
                    ) : currentItem.matchStatus === "MISMATCH" ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Ada Selisih</span>
                      </>
                    ) : (
                      <span>{currentItem.matchStatus}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Rincian data Excel yang diekstrak jika ada */}
              {currentItem.extractedData?.monthlyActuals &&
              Array.isArray(currentItem.extractedData.monthlyActuals) ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                    <span>Data Realisasi Bulanan dari File Excel:</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {currentItem.extractedData.monthlyActuals.map(
                      (val: number | null, mIdx: number) => {
                        const mNames = [
                          "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
                          "Jul", "Ags", "Sep", "Okt", "Nov", "Des"
                        ];
                        const hasVal = val !== null && val !== undefined;
                        return (
                          <div
                            key={mIdx}
                            className={`p-2 rounded-lg border text-center text-xs ${
                              hasVal
                                ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-500">
                              {mNames[mIdx]}
                            </div>
                            <div className="font-mono font-semibold text-xs mt-0.5">
                              {hasVal ? val : "-"}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  File spreadsheet ini terlampir sebagai bukti kinerja. Anda dapat mengunduh berkas untuk melihat seluruh worksheet dan rumus kalkulasi detail.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <a
                  href={currentItem.filePath}
                  download={currentItem.fileName}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Unduh File Excel (.xlsx)</span>
                </a>
                <a
                  href={currentItem.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  <span>Buka di Tab Baru</span>
                </a>
              </div>
            </div>
          ) : (
            /* Format Dokumen Lain (Word, dll) */
            <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-6 text-center shadow-sm space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                {isDoc ? <FileText className="w-7 h-7" /> : <HardDrive className="w-7 h-7" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm truncate">
                  {currentItem.fileName}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Ukuran: {formatBytes(currentItem.fileSize)} • Berkas Dokumen
                </p>
              </div>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 text-left">
                Format berkas ini tidak dapat dipratinjau langsung di dalam browser. Silakan unduh dokumen untuk membukanya di komputer Anda.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <a
                  href={currentItem.filePath}
                  download={currentItem.fileName}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Dokumen</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal: Metadata Info & Aksi */}
        <div className="border-t border-slate-200 bg-white px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Diunggah: <strong className="text-slate-700">{currentItem.uploadedBy || "Pengguna"}</strong></span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDate(currentItem.createdAt)}</span>
            </span>
            {currentItem.month && (
              <>
                <span>•</span>
                <span className="font-medium text-indigo-700">
                  Bulan: {currentItem.month}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {!isReadOnly && onDelete && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Hapus berkas bukti ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? "Menghapus..." : "Hapus Bukti"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
