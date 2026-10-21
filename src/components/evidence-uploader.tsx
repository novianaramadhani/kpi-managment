"use client";

import React, { useState, useRef } from "react";
import type { AppraisalEvidence, KpiParameter } from "@/db/schema";
import Swal from "sweetalert2";
import { EvidenceViewerModal } from "./kpi/evidence-viewer-modal";

interface EvidenceUploaderProps {
  appraisalId: number;
  parameter: KpiParameter;
  evidenceList: AppraisalEvidence[];
  onEvidenceChange: (updatedList: AppraisalEvidence[]) => void;
  onAutoFill?: (extracted: {
    monthlyActuals?: (number | null)[];
    monthlyTargets?: (number | null)[];
    annualActual?: number | null;
  }) => void;
  currentInputs?: {
    actual?: number | null;
    target?: number | null;
    monthlyActuals?: (number | null)[];
  };
  employeeName?: string;
  periodName?: string;
  deptName?: string;
  isLocked?: boolean;
}

export function EvidenceUploader({
  appraisalId,
  parameter,
  evidenceList,
  onEvidenceChange,
  onAutoFill,
  currentInputs,
  employeeName,
  periodName,
  deptName,
  isLocked = false,
}: EvidenceUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDiffEvidence, setSelectedDiffEvidence] = useState<AppraisalEvidence | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<AppraisalEvidence | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter evidence untuk parameter ini
  const paramEvidence = evidenceList.filter((e) => e.parameterId === parameter.id);
  const excelDataEvidence = paramEvidence.filter((e) => e.fileType === "EXCEL_DATA");
  const latestExcel = excelDataEvidence[excelDataEvidence.length - 1];

  // Helper download template Excel
  const handleDownloadTemplate = () => {
    const params = new URLSearchParams({
      parameterId: String(parameter.id),
      employeeName: employeeName || "",
      periodName: periodName || "",
      deptName: deptName || "",
    });
    window.open(`/api/evidence/template?${params.toString()}`, "_blank");
  };

  // Upload file (baik Excel Data atau Attachment Dokumen)
  const handleUpload = async (file: File, fileType: "EXCEL_DATA" | "ATTACHMENT") => {
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("appraisalId", String(appraisalId));
    formData.append("parameterId", String(parameter.id));
    formData.append("fileType", fileType);

    if (fileType === "EXCEL_DATA" && currentInputs) {
      formData.append("currentInputs", JSON.stringify(currentInputs));
    }

    try {
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengunggah bukti.");
      }

      // Update state bukti
      const newEvidence: AppraisalEvidence = data.evidence;
      const updated = [...evidenceList.filter((e) => e.id !== newEvidence.id), newEvidence];
      onEvidenceChange(updated);

      if (fileType === "EXCEL_DATA" && data.parsedResult) {
        const extracted = data.parsedResult.extractedData;

        // Terapkan auto-fill ke form jika ada callback
        if (onAutoFill) {
          onAutoFill({
            monthlyActuals: extracted.monthlyActuals,
            monthlyTargets: extracted.monthlyTargets,
            annualActual: extracted.totalActual ?? data.parsedResult.extractedValue,
          });
        }

        const matchStatus = data.evidence.matchStatus;
        const comp = data.comparisonResult;

        if (matchStatus === "MATCH") {
          void Swal.fire({
            icon: "success",
            title: "Excel Terverifikasi Cocok!",
            html: `
              <p class="text-sm text-slate-700">Data Excel berhasil dibaca dan form telah otomatis terisi.</p>
              <div class="mt-2 rounded bg-emerald-50 p-2 text-xs font-bold text-emerald-800 border border-emerald-300">
                ${data.parsedResult.summaryText}
              </div>
            `,
            confirmButtonColor: "#0284c7",
          });
        } else if (matchStatus === "MISMATCH") {
          void Swal.fire({
            icon: "warning",
            title: "Data Terisi, Namun Ditemukan Selisih!",
            html: `
              <p class="text-sm text-slate-700">${comp?.diffMessage || "Terdapat perbedaan nilai antara Form dan Excel."}</p>
              <p class="mt-1 text-xs text-slate-500">Nilai dari Excel telah dimasukkan ke dalam form. Silakan cek rincian selisih.</p>
            `,
            confirmButtonColor: "#0284c7",
            showCancelButton: true,
            confirmButtonText: "Lihat Rincian Selisih",
            cancelButtonText: "Tutup",
          }).then((result) => {
            if (result.isConfirmed) {
              setSelectedDiffEvidence(newEvidence);
            }
          });
        } else {
          void Swal.fire({
            icon: "info",
            title: "Data Excel Berhasil Dibaca",
            text: data.parsedResult.summaryText || "Nilai telah disinkronkan ke form.",
            confirmButtonColor: "#0284c7",
          });
        }
      } else {
        void Swal.fire({
          icon: "success",
          title: "File Bukti Terlampir",
          text: `File "${file.name}" berhasil disimpan sebagai dokumen pendukung.`,
          confirmButtonColor: "#0284c7",
          timer: 2000,
        });
      }
    } catch (err: any) {
      void Swal.fire({
        icon: "error",
        title: "Gagal Mengunggah",
        text: err.message || "Terjadi kesalahan saat mengunggah file.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsUploading(false);
      if (excelInputRef.current) excelInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Hapus bukti
  const handleDelete = async (evidenceId: number) => {
    const result = await Swal.fire({
      title: "Hapus File Bukti?",
      text: "File bukti ini akan dihapus dari sistem penilaian.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/evidence/${evidenceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus file bukti.");

      const updated = evidenceList.filter((e) => e.id !== evidenceId);
      onEvidenceChange(updated);
      if (selectedDiffEvidence?.id === evidenceId) {
        setSelectedDiffEvidence(null);
      }

      void Swal.fire({
        icon: "success",
        title: "Terhapus",
        text: "File bukti telah dihapus.",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      void Swal.fire({
        icon: "error",
        title: "Gagal",
        text: err.message,
      });
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="pt-2.5 mt-2.5 border-t border-slate-100">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={excelInputRef}
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, "EXCEL_DATA");
        }}
      />
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.docx,.doc"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, "ATTACHMENT");
        }}
      />

      {/* Top Bar: Compact Status & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600 inline-flex items-center gap-1.5 text-xs">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span>File Terlampir:</span>
          </span>

          {paramEvidence.length > 0 ? (
            <span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-bold border border-emerald-200">
              {paramEvidence.length} file
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-normal italic">
              Belum ada file
            </span>
          )}

          {latestExcel && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                latestExcel.matchStatus === "MATCH"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : latestExcel.matchStatus === "MISMATCH"
                  ? "bg-amber-50 text-amber-900 border-amber-300"
                  : "bg-blue-50 text-blue-800 border-blue-300"
              }`}
            >
              {latestExcel.matchStatus === "MATCH" ? "Excel Cocok" : "Ada Selisih"}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* 1. Download Template Excel Khusus Parameter Ini */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer"
            title="Download file template Excel resmi"
          >
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Template</span>
          </button>

          {/* 2. Upload Excel & Auto Fill */}
          {!isLocked && (
            <button
              type="button"
              disabled={isUploading}
              onClick={() => excelInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 transition shadow-2xs cursor-pointer disabled:opacity-50"
              title="Upload file Excel untuk auto-fill"
            >
              <svg className="w-3 h-3 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{isUploading ? "Memproses..." : "Import Excel"}</span>
            </button>
          )}

          {/* 3. Attach File Bukti Lain */}
          {!isLocked && (
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ backgroundColor: "#1e3a8a", borderColor: "#1e3a8a", color: "#ffffff" }}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-900 border border-blue-900 px-2.5 py-1 text-xs font-bold text-white hover:opacity-90 transition shadow-2xs cursor-pointer disabled:opacity-50"
              title="Lampirkan foto, PDF, dokumen surat"
            >
              <svg className="w-3.5 h-3.5 text-blue-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span>Attach File</span>
            </button>
          )}
        </div>
      </div>

      {/* List Files Attached */}
      {paramEvidence.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {paramEvidence.map((ev) => {
            const isExcel = ev.fileType === "EXCEL_DATA";
            const isImage = ev.mimeType?.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(ev.fileName);
            const isPdf = ev.mimeType === "application/pdf" || /\.pdf$/i.test(ev.fileName);

            return (
              <div
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600">
                    {isExcel ? (
                      <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    ) : isImage ? (
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : isPdf ? (
                      <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <a
                      href={ev.filePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-semibold text-slate-800 hover:text-emerald-700 hover:underline block max-w-xs md:max-w-md"
                      title={ev.fileName}
                    >
                      {ev.fileName}
                    </a>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{formatBytes(ev.fileSize)}</span>
                      <span>·</span>
                      <span className="capitalize">{isExcel ? "Data Auto-Fill" : "Lampiran Dokumen"}</span>
                      {ev.extractedValue && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-emerald-700">
                            Nilai: {ev.extractedValue} {parameter.unit ?? ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isExcel && ev.matchStatus && (
                    <button
                      type="button"
                      onClick={() => setSelectedDiffEvidence(ev)}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border transition ${
                        ev.matchStatus === "MATCH"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                      }`}
                    >
                      {ev.matchStatus === "MATCH" ? "Match" : "Cek Selisih"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setViewingEvidence(ev)}
                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                    title="Lihat Dokumen Bukti (View Evidence)"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Lihat Bukti</span>
                  </button>

                  <a
                    href={ev.filePath}
                    download={ev.fileName}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Unduh
                  </a>

                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ev.id)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="Hapus bukti ini"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Panel Perbandingan Selisih Data */}
      {selectedDiffEvidence && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs">
          <div className="flex items-center justify-between border-b border-amber-200 pb-2">
            <div className="font-bold text-amber-950 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Hasil Verifikasi & Selisih Data: {selectedDiffEvidence.fileName}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDiffEvidence(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-2 text-slate-700">
            {selectedDiffEvidence.extractedData?.monthlyActuals ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-amber-200 bg-amber-100/80 font-bold text-amber-950">
                      <th className="p-1.5">Bulan</th>
                      <th className="p-1.5">Nilai di Form</th>
                      <th className="p-1.5">Nilai di Excel</th>
                      <th className="p-1.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDiffEvidence.extractedData.monthlyActuals.map((excelVal: number | null, mIdx: number) => {
                      const inputVal = currentInputs?.monthlyActuals ? currentInputs.monthlyActuals[mIdx] : null;
                      const hasExcel = excelVal !== null && excelVal !== undefined;
                      const isMatch =
                        hasExcel &&
                        inputVal !== null &&
                        inputVal !== undefined &&
                        Math.abs(Number(inputVal) - Number(excelVal)) < 0.001;

                      if (!hasExcel && inputVal === null) return null;

                      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

                      return (
                        <tr key={mIdx} className="border-b border-amber-100">
                          <td className="p-1.5 font-bold">{monthLabels[mIdx]}</td>
                          <td className="p-1.5 font-mono">{inputVal !== null && inputVal !== undefined ? inputVal : "-"}</td>
                          <td className="p-1.5 font-mono">{excelVal !== null ? excelVal : "-"}</td>
                          <td className="p-1.5 text-center">
                            {isMatch ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                                Match
                              </span>
                            ) : (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">
                                Selisih
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-2 bg-white rounded border border-amber-200 text-xs">
                <div>
                  <span className="text-slate-500">Nilai Input Form Saat Ini:</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {currentInputs?.actual !== null && currentInputs?.actual !== undefined
                      ? currentInputs.actual
                      : "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Nilai Diekstrak Dari Excel:</span>
                  <div className="font-bold text-emerald-800 font-mono">
                    {selectedDiffEvidence.extractedValue ?? "-"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Evidence Viewer Modal */}
      {viewingEvidence && (
        <EvidenceViewerModal
          isOpen={!!viewingEvidence}
          onClose={() => setViewingEvidence(null)}
          title={`Pratinjau Bukti: ${parameter.name}`}
          indicatorName={parameter.name}
          items={paramEvidence.map((e) => ({
            id: e.id,
            appraisalId: e.appraisalId,
            parameterId: e.parameterId,
            month: e.month,
            fileType: e.fileType,
            fileName: e.fileName,
            filePath: e.filePath,
            fileSize: e.fileSize,
            mimeType: e.mimeType,
            extractedValue: e.extractedValue,
            extractedData: e.extractedData as any,
            matchStatus: e.matchStatus,
            description: e.description,
            uploadedBy: e.uploadedBy,
            createdAt: e.createdAt,
          }))}
          initialIndex={Math.max(
            0,
            paramEvidence.findIndex((e) => e.id === viewingEvidence.id)
          )}
          onDelete={handleDelete}
          isReadOnly={isLocked}
        />
      )}
    </div>
  );
}
