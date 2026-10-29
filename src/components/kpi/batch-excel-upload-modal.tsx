"use client";

import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  AlertTriangle,
  X,
  Loader2,
  RefreshCw,
  ArrowRight,
  Check,
  Layers,
  UserCheck,
  Paperclip,
  Eye,
  Download,
  Trash2,
  Calendar,
  FileText,
  Plus,
  ExternalLink,
} from "lucide-react";
import Swal from "sweetalert2";
import {
  parseKpiExcelWorkbook,
  recalculatePreviewItemMapping,
  type MultiSheetBatchResult,
  type SheetParseResult,
  type BatchPreviewItem,
  type IndicatorMatchingTarget,
} from "@/lib/excel-batch-assessment";
import { saveBatchExcelAssessmentAction } from "@/lib/monthly-assessment-actions";
import { normalizeWeight } from "@/lib/scoring";
import { EvidenceViewerModal } from "./evidence-viewer-modal";
import type { AppraisalEvidenceItem } from "@/types/monthly-assessment";

export interface BatchExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  appraisalId: number;
  employeeName: string;
  employeeNik: string;
  departmentName: string;
  periodYear: number;
  availableIndicators: IndicatorMatchingTarget[];
  onSuccess?: () => void;
  onEvidenceUpdated?: () => void;
}

export function BatchExcelUploadModal({
  isOpen,
  onClose,
  appraisalId,
  employeeName,
  employeeNik,
  departmentName,
  periodYear,
  availableIndicators,
  onSuccess,
  onEvidenceUpdated,
}: BatchExcelUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [multiSheetData, setMultiSheetData] = useState<MultiSheetBatchResult | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [modalStep, setModalStep] = useState<"mapping" | "review">("mapping");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. State Modal Detail Pembacaan Excel
  const [viewingDetailItem, setViewingDetailItem] = useState<BatchPreviewItem | null>(null);

  // 2. State Fitur Attach File (Lampiran Dokumen Bukti)
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceTargetParamId, setEvidenceTargetParamId] = useState<number | null>(null);
  const [evidenceList, setEvidenceList] = useState<AppraisalEvidenceItem[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);

  // 3. State Pratinjau Berkas Bukti (Evidence Viewer)
  const [evidenceViewerState, setEvidenceViewerState] = useState<{
    isOpen: boolean;
    items: AppraisalEvidenceItem[];
    initialIndex: number;
    indicatorName?: string;
    categoryName?: string;
  }>({
    isOpen: false,
    items: [],
    initialIndex: 0,
  });

  // Fetch daftar evidence yang sudah tersimpan untuk penilaian ini
  const fetchEvidenceRecords = async () => {
    if (!appraisalId) return;
    setIsLoadingEvidence(true);
    try {
      const res = await fetch(`/api/evidence?appraisalId=${appraisalId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.evidence)) {
        setEvidenceList(data.evidence);
      }
    } catch (err) {
      console.error("Gagal memuat berkas bukti:", err);
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  useEffect(() => {
    if (isOpen && appraisalId) {
      fetchEvidenceRecords();
    }
  }, [isOpen, appraisalId]);

  // Handle upload berkas bukti baru
  const handleUploadEvidence = async (fileToUpload: File) => {
    if (!fileToUpload || !appraisalId) return;
    setIsUploadingEvidence(true);
    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("appraisalId", String(appraisalId));

      const paramId =
        evidenceTargetParamId ||
        availableIndicators[0]?.parameterId ||
        0;

      if (!paramId) {
        throw new Error("Parameter KPI tidak ditemukan untuk melampirkan berkas.");
      }

      formData.append("parameterId", String(paramId));
      formData.append(
        "fileType",
        /\.(xlsx|xls|csv)$/i.test(fileToUpload.name) ? "EXCEL_DATA" : "ATTACHMENT"
      );
      if (evidenceDescription.trim()) {
        formData.append("description", evidenceDescription.trim());
      }

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengunggah berkas lampiran.");
      }

      setEvidenceList((prev) => [data.evidence, ...prev]);
      setEvidenceDescription("");
      if (evidenceFileInputRef.current) {
        evidenceFileInputRef.current.value = "";
      }

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: "success",
        title: "Berkas lampiran berhasil diunggah!",
      });

      if (onEvidenceUpdated) onEvidenceUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah berkas.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Mengunggah",
        text: msg,
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  // Handle hapus berkas bukti
  const handleDeleteEvidence = async (evidenceId: number) => {
    const confirmRes = await Swal.fire({
      title: "Hapus Lampiran?",
      text: "Berkas ini akan dihapus permanen dari sistem penilaian.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
    });
    if (!confirmRes.isConfirmed) return;

    try {
      const res = await fetch(`/api/evidence/${evidenceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus berkas.");
      }

      setEvidenceList((prev) => prev.filter((e) => e.id !== evidenceId));
      setEvidenceViewerState((prev) => ({
        ...prev,
        items: prev.items.filter((e) => e.id !== evidenceId),
      }));

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: "success",
        title: "Berkas lampiran telah dihapus.",
      });

      if (onEvidenceUpdated) onEvidenceUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus berkas.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Menghapus",
        text: msg,
        confirmButtonColor: "#0284c7",
      });
    }
  };

  // Close on Escape key with hierarchy priority
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (evidenceViewerState.isOpen) {
          setEvidenceViewerState((prev) => ({ ...prev, isOpen: false }));
          return;
        }
        if (viewingDetailItem) {
          setViewingDetailItem(null);
          return;
        }
        if (isEvidenceModalOpen) {
          setIsEvidenceModalOpen(false);
          return;
        }
        if (isOpen && !isSaving) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose, viewingDetailItem, isEvidenceModalOpen, evidenceViewerState.isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setMultiSheetData(null);
      setActiveSheetIndex(0);
      setModalStep("mapping");
      setErrorMsg(null);
      setIsParsing(false);
      setIsSaving(false);
      setViewingDetailItem(null);
      setIsEvidenceModalOpen(false);
      setEvidenceTargetParamId(null);
      setEvidenceViewerState({ isOpen: false, items: [], initialIndex: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Active Sheet and active items
  const activeSheet: SheetParseResult | null =
    multiSheetData?.sheets[activeSheetIndex] || null;
  const currentItems: BatchPreviewItem[] = activeSheet?.items || [];

  // Handle File Selection and Parsing
  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
      setErrorMsg("Format berkas harus berupa Excel (.xlsx atau .xls).");
      return;
    }

    setFile(selectedFile);
    setErrorMsg(null);
    setIsParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error("Berkas Excel tidak memiliki sheet yang dapat dibaca.");
      }

      const multiResult = parseKpiExcelWorkbook(
        wb,
        availableIndicators,
        selectedFile.name,
        {
          nik: employeeNik,
          name: employeeName,
          department: departmentName,
          periodYear,
        }
      );

      if (multiResult.totalEmployeesDetected === 0) {
        throw new Error(
          "Tidak ditemukan blok parameter yang valid pada sheet mana pun. Pastikan Kolom H memuat baris 'Parameter' dan baris 'Type'."
        );
      }

      setMultiSheetData(multiResult);
      setActiveSheetIndex(multiResult.activeSheetIndex);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses berkas Excel.";
      setErrorMsg(msg);
      setMultiSheetData(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Toggle selection for single item on active sheet
  const handleToggleSelect = (key: string) => {
    if (!multiSheetData) return;
    setMultiSheetData((prev) => {
      if (!prev) return null;
      const newSheets = [...prev.sheets];
      const sheet = newSheets[activeSheetIndex];
      if (!sheet) return prev;

      const updatedItems = sheet.items.map((it) => {
        if (it.key === key) {
          return { ...it, isSelected: !it.isSelected };
        }
        return it;
      });
      newSheets[activeSheetIndex] = { ...sheet, items: updatedItems };
      return { ...prev, sheets: newSheets };
    });
  };

  // Toggle select all on active sheet
  const handleToggleSelectAll = (checked: boolean) => {
    if (!multiSheetData) return;
    setMultiSheetData((prev) => {
      if (!prev) return null;
      const newSheets = [...prev.sheets];
      const sheet = newSheets[activeSheetIndex];
      if (!sheet) return prev;

      const updatedItems = sheet.items.map((it) => ({
        ...it,
        isSelected: it.selectedAppraisalItemId ? checked : false,
      }));
      newSheets[activeSheetIndex] = { ...sheet, items: updatedItems };
      return { ...prev, sheets: newSheets };
    });
  };

  // Override mapping from dropdown on active sheet
  const handleMappingChange = (key: string, newAppraisalItemId: number | null) => {
    if (!multiSheetData) return;
    setMultiSheetData((prev) => {
      if (!prev) return null;
      const newSheets = [...prev.sheets];
      const sheet = newSheets[activeSheetIndex];
      if (!sheet) return prev;

      const targetItem = sheet.items.find((it) => it.key === key);
      if (!targetItem) return prev;

      const recalculated = recalculatePreviewItemMapping(
        targetItem,
        newAppraisalItemId,
        availableIndicators
      );

      const updatedItems = sheet.items.map((it) => (it.key === key ? recalculated : it));

      // Recheck duplicate status on active sheet
      const idCount = new Map<number, number>();
      for (const it of updatedItems) {
        if (it.selectedAppraisalItemId) {
          idCount.set(
            it.selectedAppraisalItemId,
            (idCount.get(it.selectedAppraisalItemId) || 0) + 1
          );
        }
      }

      const finalItems = updatedItems.map((it) => {
        const dupCount = it.selectedAppraisalItemId ? idCount.get(it.selectedAppraisalItemId) || 0 : 0;
        return {
          ...it,
          isDuplicate: dupCount > 1,
          duplicateWarning:
            dupCount > 1 ? "Indikator ini dipilih lebih dari 1 kali pada sheet ini." : undefined,
        };
      });

      const matchedCount = finalItems.filter((i) => i.matchType === "EXACT").length;
      const needsReviewCount = finalItems.filter(
        (i) => i.matchType === "ALIAS" || i.matchType === "FUZZY"
      ).length;
      const unmatchedCount = finalItems.filter((i) => i.matchType === "UNMATCHED").length;

      newSheets[activeSheetIndex] = {
        ...sheet,
        items: finalItems,
        matchedCount,
        needsReviewCount,
        unmatchedCount,
      };

      return { ...prev, sheets: newSheets };
    });
  };

  // Validasi dan navigasi ke langkah Review sebelum simpan
  const handleProceedToReview = () => {
    if (!activeSheet) return;
    const selected = activeSheet.items.filter((it) => it.isSelected);
    if (selected.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Belum Ada Parameter Terpilih",
        text: "Pilih minimal 1 parameter yang ingin disimpan ke form penilaian.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const unmapped = selected.filter((it) => !it.selectedAppraisalItemId);
    if (unmapped.length > 0) {
      void Swal.fire({
        icon: "warning",
        title: "Parameter Belum Terpetakan",
        html: `
          <div class="text-left text-xs text-slate-700 space-y-2">
            <p>Ada <b>${unmapped.length} parameter terpilih</b> yang belum dipetakan ke Master KPI:</p>
            <ul class="list-disc pl-5 text-rose-700 space-y-0.5">
              ${unmapped.map((u) => `<li>${u.rawTitle}</li>`).join("")}
            </ul>
            <p class="text-slate-600 mt-2">
              Silakan tentukan mapping terlebih dahulu menggunakan dropdown atau hilangkan tanda centang jika tidak ingin diikutsertakan.
            </p>
          </div>
        `,
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    setModalStep("review");
  };

  // Execute Save for active sheet
  const handleSaveBatch = async () => {
    if (!activeSheet || !file) return;

    const selectedItems = activeSheet.items.filter(
      (it) => it.isSelected && it.selectedAppraisalItemId
    );

    if (selectedItems.length === 0) {
      setErrorMsg("Tidak ada parameter valid yang dipilih untuk disimpan.");
      return;
    }

    // Safety verification jika sheet yang dipilih terdeteksi milik karyawan yang berbeda
    if (
      !activeSheet.employeeInfo.isCurrentEmployeeMatch &&
      activeSheet.employeeInfo.nik &&
      activeSheet.employeeInfo.nik !== employeeNik
    ) {
      const confirmResult = await Swal.fire({
        icon: "warning",
        title: "Perhatian: Identitas Sheet Berbeda!",
        html: `
          <div class="text-left text-xs text-slate-700 space-y-2">
            <p>Sheet yang dipilih terdeteksi milik:</p>
            <div class="p-2.5 bg-amber-50 rounded-lg border border-amber-200">
              <p><b>Nama:</b> ${activeSheet.employeeInfo.name || activeSheet.sheetName}</p>
              <p><b>NIK:</b> ${activeSheet.employeeInfo.nik}</p>
            </div>
            <p>Sedangkan form penilaian yang sedang Anda buka saat ini adalah untuk:</p>
            <div class="p-2.5 bg-sky-50 rounded-lg border border-sky-200">
              <p><b>Nama:</b> ${employeeName}</p>
              <p><b>NIK:</b> ${employeeNik}</p>
            </div>
            <p class="font-bold text-amber-900 mt-2">
              Pastikan Anda memilih sheet yang tepat agar data penilaian tidak tertukar. Apakah Anda yakin ingin menerapkan data dari sheet ini?
            </p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Ya, Tetap Terapkan",
        cancelButtonText: "Batal, Pilih Sheet Lain",
        confirmButtonColor: "#0284c7",
        cancelButtonColor: "#64748b",
      });

      if (!confirmResult.isConfirmed) {
        return;
      }
    }

    setIsSaving(true);

    try {
      const payloadItems = selectedItems.map((it) => ({
        appraisalItemId: it.selectedAppraisalItemId!,
        annualActual: it.effectiveRealization,
        annualTarget: it.effectiveTarget,
        monthlyActuals: it.excelMonthlyActuals,
        monthlyTargets: it.excelMonthlyTargets,
        hasMonthlyData: it.hasMonthlyData,
        rawTitle: it.rawTitle,
        score: it.score,
        bandLabel: it.bandLabel ?? undefined,
      }));

      const res = await saveBatchExcelAssessmentAction({
        appraisalId,
        fileName: file?.name || "upload_penilaian.xlsx",
        items: payloadItems,
      });

      if (!res.success) {
        throw new Error(res.error || "Gagal menyimpan penilaian dari Excel.");
      }

      await Swal.fire({
        icon: "success",
        title: "Penilaian Berhasil Diterapkan!",
        html: `
          <p class="text-sm text-slate-700">
            Sebanyak <b>${res.updatedCount} parameter</b> dari sheet <b>${activeSheet.sheetName}</b> berhasil diperbarui dan skor penilaian telah dihitung ulang otomatis.
          </p>
        `,
        confirmButtonColor: "#0284c7",
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan penilaian.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Menyimpan",
        text: msg,
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedItems = currentItems.filter(
    (it) => it.isSelected && it.selectedAppraisalItemId
  );
  const selectedCount = currentItems.filter((it) => it.isSelected).length;
  const allSelectableCount = currentItems.filter((it) => it.selectedAppraisalItemId).length;
  const isAllSelected = allSelectableCount > 0 && selectedCount === allSelectableCount;
  const totalEstimatedWeightedPct = selectedItems.reduce(
    (acc, it) => acc + (it.weightedScorePct || 0),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700 border border-sky-200 shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-bold text-slate-900">
                {modalStep === "mapping" ? "Upload Penilaian KPI" : "Review Penilaian KPI"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-semibold text-slate-800">{employeeName}</span> ({employeeNik}) • {departmentName} • Tahun {periodYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {multiSheetData && (
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setModalStep("mapping")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    modalStep === "mapping"
                      ? "bg-white text-sky-800 shadow-2xs border border-slate-200/80 font-bold"
                      : "text-slate-600 hover:text-slate-900 cursor-pointer"
                  }`}
                >
                  1. Pemetaan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCount > 0) handleProceedToReview();
                  }}
                  disabled={selectedCount === 0}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    modalStep === "review"
                      ? "bg-white text-sky-800 shadow-2xs border border-slate-200/80 font-bold"
                      : "text-slate-600 hover:text-slate-900 cursor-pointer"
                  }`}
                >
                  2. Review ({selectedCount})
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              disabled={isSaving}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              title="Tutup (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Gagal Membaca Berkas</p>
                <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* STEP 1: Upload Dropzone if no workbook parsed yet */}
          {!multiSheetData && (
            <div className="space-y-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelect(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isParsing
                    ? "border-sky-300 bg-sky-50/50 cursor-wait"
                    : "border-slate-300 hover:border-sky-500 hover:bg-sky-50/20 bg-slate-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {isParsing ? (
                  <div className="flex flex-col items-center justify-center py-6 space-y-3">
                    <Loader2 className="w-10 h-10 text-sky-600 animate-spin" />
                    <p className="text-sm font-semibold text-slate-800">
                      Memindai semua sheet dan mencocokkan ke Master KPI...
                    </p>
                    <p className="text-xs text-slate-500">Membaca Kolom H, Kolom I s/d T, dan Kolom U per sheet karyawan...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-600 group-hover:scale-105 transition-transform">
                      <Upload className="w-8 h-8 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">
                        Klik untuk unggah atau seret berkas Excel ke sini
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
                        Mendukung berkas Excel multi-sheet (1 sheet mewakili 1 karyawan). Sistem akan membaca nama parameter pada Kolom H dan nilai Realisasi pada Kolom U secara otomatis.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Panduan Format Kolom */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <HelpCircle className="w-4 h-4 text-sky-600" />
                  Format Standar Lembar Kerja yang Dikenali Sistem:
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-slate-600 border border-slate-200 bg-white rounded-lg">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 border-r border-slate-200 text-left">Kolom H</th>
                        <th className="p-2 border-r border-slate-200 text-center">Kolom I s/d T (12 Kolom)</th>
                        <th className="p-2 border-r border-slate-200 text-right">Kolom U (Realisasi)</th>
                        <th className="p-2 text-right">Kolom V</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[10.5px]">
                      <tr>
                        <td className="p-2 border-r border-slate-200 font-sans font-semibold text-slate-800">
                          [Nama Parameter KPI]
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center text-slate-400">
                          (Kosong / Header)
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right text-slate-400">-</td>
                        <td className="p-2 text-right text-slate-400">-</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2 border-r border-slate-200 font-bold text-sky-800">Type</td>
                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">
                          Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-bold text-sky-800">
                          Realisasi
                        </td>
                        <td className="p-2 text-right text-slate-500">Persentase</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">Target</td>
                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">
                          Target Bulanan (opsional)
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-bold text-slate-700">
                          Target Tahunan
                        </td>
                        <td className="p-2 text-right text-slate-400">-</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">
                          Actual / Aktual
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center text-emerald-700">
                          Realisasi Bulanan (Jan s/d Des)
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-bold text-emerald-700">
                          Nilai Realisasi Tahunan
                        </td>
                        <td className="p-2 text-right text-slate-600">% Capaian</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Multi-Sheet Navigation & Mapping Table */}
          {multiSheetData && activeSheet && modalStep === "mapping" && (
            <div className="space-y-3.5">
              {/* Sheet Selector & Employee Identity Header (Ringkas & Informatif) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Dropdown Pemilihan Sheet */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                      <Layers className="w-4 h-4 text-sky-600" />
                      <span>Pilih Sheet Karyawan:</span>
                    </div>

                    <select
                      value={activeSheetIndex}
                      onChange={(e) => setActiveSheetIndex(Number(e.target.value))}
                      className="w-full max-w-md text-xs font-semibold rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 shadow-2xs hover:border-sky-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      {multiSheetData.sheets.map((st, idx) => {
                        const matchTag = st.employeeInfo.isCurrentEmployeeMatch ? " [✓ Sesuai]" : "";
                        const countTag = ` (${st.totalParsedBlocks} parameter)`;
                        const empLabel = st.employeeInfo.name ? ` • ${st.employeeInfo.name}` : "";
                        const nikLabel = st.employeeInfo.nik ? ` (${st.employeeInfo.nik})` : "";
                        return (
                          <option key={st.sheetName} value={idx}>
                            Sheet: {st.sheetName}{empLabel}{nikLabel}{matchTag}{countTag}
                          </option>
                        );
                      })}
                    </select>

                    <span className="text-[11px] font-medium text-slate-500 shrink-0">
                      ({multiSheetData.totalEmployeesDetected} Sheet Terdeteksi)
                    </span>
                  </div>

                  {/* Status Validasi Match & Tombol Attach File */}
                  <div className="flex items-center gap-2">
                    {/* Tombol Attach File Terpisah */}
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceTargetParamId(null);
                        setIsEvidenceModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition active:scale-95 cursor-pointer"
                      title="Lihat atau lampirkan berkas dokumen pendukung penilaian (opsional)"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-sky-600" />
                      <span>Lampiran Dokumen</span>
                      {evidenceList.length > 0 && (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                          {evidenceList.length}
                        </span>
                      )}
                    </button>

                    {activeSheet.employeeInfo.isCurrentEmployeeMatch ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sesuai dengan Karyawan Ini ✓</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-2xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Sheet Karyawan Lain (Hati-hati tertukar)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Peringatan hanya jika sheet bukan milik karyawan aktif */}
                {!activeSheet.employeeInfo.isCurrentEmployeeMatch && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 pt-2 border-t">
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Sheet ini terdeteksi untuk: <b>{activeSheet.employeeInfo.name || activeSheet.sheetName}</b> ({activeSheet.employeeInfo.nik || "-"})
                    </span>
                    <span className="text-[11px] text-amber-700">Periksa kembali sebelum melanjutkan</span>
                  </div>
                )}
              </div>

              {/* Table (Area Luas & Rapi) */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs bg-white">
                <div className="max-h-[58vh] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200 shadow-xs">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={(e) => handleToggleSelectAll(e.target.checked)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            title="Pilih Semua"
                          />
                        </th>
                        <th className="p-3 w-10 text-center text-slate-500">No</th>
                        <th className="p-3 min-w-[200px]">Parameter di Excel</th>
                        <th className="p-3 min-w-[240px]">Indikator Master KPI (Mapping)</th>
                        <th className="p-3 text-right">Target</th>
                        <th className="p-3 text-right">Realisasi</th>
                        <th className="p-3 text-right">% Capaian</th>
                        <th className="p-3 text-center">Skor (Band)</th>
                        <th className="p-3 text-right">Skor Akhir</th>
                        <th className="p-3">Status / Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-500">
                            Tidak ada parameter KPI yang terdeteksi di sheet ini.
                          </td>
                        </tr>
                      ) : (
                        currentItems.map((item, idx) => {
                          const isMatched = !!item.matchedIndicator;
                          const isExact = item.matchType === "EXACT";
                          const isAlias = item.matchType === "ALIAS";
                          const isFuzzy = item.matchType === "FUZZY";

                          return (
                            <tr
                              key={item.key}
                              className={`transition-colors ${
                                item.isSelected
                                  ? "bg-white hover:bg-slate-50/80"
                                  : "bg-slate-50/40 text-slate-400 hover:bg-slate-50"
                              } ${item.isDuplicate ? "bg-rose-50/40" : ""}`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.isSelected}
                                  disabled={!item.selectedAppraisalItemId}
                                  onChange={() => handleToggleSelect(item.key)}
                                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-40 cursor-pointer"
                                />
                              </td>

                              <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>

                              <td className="p-3 font-semibold text-slate-800">
                                <div className="flex flex-col items-start gap-1">
                                  <span>{item.rawTitle}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    {item.hasMonthlyData ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingDetailItem(item);
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs cursor-pointer group"
                                        title="Buka rincian pembacaan bulanan Januari - Desember dari Excel"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                                        <span>• 12 bulan aktual terbaca</span>
                                        <span className="font-bold underline text-emerald-900 ml-0.5">
                                          (Lihat Rincian)
                                        </span>
                                      </button>
                                    ) : item.excelAnnualActual !== null ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingDetailItem(item);
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-600 hover:text-sky-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                        title="Lihat rincian pembacaan nilai tahunan dari Excel"
                                      >
                                        <span>• Realisasi Tahunan (Kolom U)</span>
                                        <span className="text-sky-700 font-semibold underline ml-0.5">(Rincian)</span>
                                      </button>
                                    ) : null}

                                    {/* Tombol Attach File Cepat per Parameter */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEvidenceTargetParamId(item.matchedIndicator?.parameterId || null);
                                        setIsEvidenceModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 hover:text-sky-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                      title="Lampirkan berkas bukti pendukung untuk parameter ini"
                                    >
                                      <Paperclip className="w-3 h-3 text-slate-500" />
                                      <span>
                                        {(() => {
                                          const pId = item.matchedIndicator?.parameterId;
                                          const count = pId ? evidenceList.filter((ev) => ev.parameterId === pId).length : 0;
                                          return count > 0 ? `${count} Bukti` : "Attach File";
                                        })()}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Dropdown Indicator Mapping */}
                              <td className="p-3">
                                <select
                                  value={item.selectedAppraisalItemId || ""}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : null;
                                    handleMappingChange(item.key, val);
                                  }}
                                  className={`w-full text-xs rounded-lg px-2.5 py-1.5 border transition-colors cursor-pointer ${
                                    !item.selectedAppraisalItemId
                                      ? "border-rose-300 bg-rose-50/50 text-rose-800 font-semibold"
                                      : isExact
                                      ? "border-slate-300 bg-white text-slate-800"
                                      : "border-amber-300 bg-amber-50/30 text-amber-900"
                                  } focus:outline-hidden focus:ring-2 focus:ring-sky-500`}
                                >
                                  <option value="">-- Pilih Indikator Master --</option>
                                  {availableIndicators.map((ind) => (
                                    <option key={ind.appraisalItemId} value={ind.appraisalItemId}>
                                      {ind.name} ({ind.categoryName})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Target */}
                              <td className="p-3 text-right font-mono text-slate-700">
                                {item.effectiveTarget !== null ? (
                                  <span className="font-medium text-slate-800">
                                    {item.targetDisplay || item.effectiveTarget}
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span className="text-slate-400 font-mono">-</span>
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5"
                                      title="Nilai Target pada Excel kosong atau tidak terbaca di Kolom U"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                      Target Kosong
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Realisasi */}
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {item.realizationDisplay}
                              </td>

                              {/* % Capaian */}
                              <td className="p-3 text-right font-mono text-slate-700">
                                {item.realizationPctDisplay}
                              </td>

                              {/* Skor Band */}
                              <td className="p-3 text-center">
                                {item.score !== null ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs bg-sky-100 text-sky-800 border border-sky-200">
                                    {item.score}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Skor Akhir (Weighted) */}
                              <td className="p-3 text-right font-mono font-semibold text-slate-800">
                                {item.weightedScoreDisplay}
                              </td>

                              {/* Status & Warnings */}
                              <td className="p-3">
                                <div className="flex flex-col gap-1">
                                  {isExact && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                      <Check className="w-3.5 h-3.5" /> Cocok Presisi
                                    </span>
                                  )}
                                  {isAlias && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 font-medium">
                                      <RefreshCw className="w-3 h-3" /> Kamus Alias
                                    </span>
                                  )}
                                  {isFuzzy && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                                      <AlertTriangle className="w-3 h-3" /> Rekomendasi Mirip
                                    </span>
                                  )}
                                  {!isMatched && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                                      <AlertCircle className="w-3 h-3" /> Belum Terpetakan
                                    </span>
                                  )}
                                  {item.isDuplicate && (
                                    <span className="text-[10px] text-rose-600 font-bold">
                                      ⚠ Duplikasi Parameter
                                    </span>
                                  )}
                                  {item.warningNotes.map((warn, wIdx) => (
                                    <span key={wIdx} className="text-[10px] text-amber-600 italic">
                                      {warn}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Informational Footer Bar */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-2 py-1">
                <span>
                  Berkas aktif: <b className="text-slate-700">{file?.name}</b> · Sheet: <b className="text-slate-700">{activeSheet.sheetName}</b>
                </span>
                <span>
                  Terpilih untuk disimpan: <b className="text-sky-700">{selectedCount} dari {currentItems.length} parameter</b>
                </span>
              </div>
            </div>
          )}

          {/* STEP 3: Review Sebelum Simpan */}
          {multiSheetData && activeSheet && modalStep === "review" && (
            <div className="space-y-4">
              {/* Clean Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/80">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="text-slate-400">Sheet:</span>
                  <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                    {activeSheet.sheetName}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500 font-mono text-[11px] truncate max-w-sm" title={file?.name}>
                    {file?.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">
                    Parameter: <b className="text-slate-800 font-mono">{selectedItems.length}</b>/{currentItems.length}
                  </span>
                  <span className="text-slate-300">•</span>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-100/70 border border-sky-200 text-sky-900 font-semibold shadow-2xs">
                    <span className="text-[11px] text-sky-700 font-medium">Estimasi Skor Akhir:</span>
                    <span className="font-mono text-sm font-bold text-sky-800">{totalEstimatedWeightedPct.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              {/* Review Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs bg-white">
                <div className="px-4 py-2.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Rincian Nilai & Skor dari Excel ({selectedItems.length} Indikator)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Target, realisasi, dan skor otomatis sesuai lembar kerja Excel
                  </span>
                </div>

                <div className="max-h-[58vh] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200 shadow-xs">
                      <tr>
                        <th className="p-3 w-10 text-center text-slate-400">No</th>
                        <th className="p-3 min-w-[200px]">Indikator Master KPI</th>
                        <th className="p-3 min-w-[160px] text-slate-500">Parameter di Excel</th>
                        <th className="p-3 text-center">Satuan</th>
                        <th className="p-3 text-right">Target Excel</th>
                        <th className="p-3 text-right">Realisasi Excel</th>
                        <th className="p-3 text-right">% Capaian</th>
                        <th className="p-3 min-w-[140px]">Kriteria / Band</th>
                        <th className="p-3 text-center">Skor</th>
                        <th className="p-3 text-right">Nilai Akhir (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {selectedItems.map((item, idx) => {
                        const ind = item.matchedIndicator;
                        const unit = item.excelUnit || ind?.unit || "-";

                        return (
                          <tr key={item.key} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 text-center font-mono text-slate-400 text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">
                                  {ind?.name || item.rawTitle}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {ind?.categoryName && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {ind.categoryName}
                                    </span>
                                  )}
                                  {ind?.indicatorWeight && (
                                    <span className="text-[10.5px] text-slate-400 font-mono">
                                      Bobot: {(normalizeWeight(ind.indicatorWeight) * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-slate-600 font-medium">
                              {item.rawTitle}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {unit}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-800">
                              {item.targetDisplay || (item.effectiveTarget !== null ? item.effectiveTarget : "-")}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              {item.realizationDisplay || (item.effectiveRealization !== null ? item.effectiveRealization : "-")}
                            </td>
                            <td className="p-3 text-right font-mono font-semibold text-slate-700">
                              {item.realizationPctDisplay || "-"}
                            </td>
                            <td className="p-3">
                              {item.bandLabel ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                  {item.bandLabel}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {item.score !== null ? (
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg font-bold text-xs bg-sky-100 text-sky-800 border border-sky-200 font-mono">
                                  {item.score}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-sky-900">
                              {item.weightedScoreDisplay || `${item.weightedScorePct.toFixed(2)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 text-slate-800 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={9} className="p-3 text-right text-xs uppercase tracking-wider">
                          Total Estimasi Nilai Akhir:
                        </td>
                        <td className="p-3 text-right font-mono text-sm text-sky-700">
                          {totalEstimatedWeightedPct.toFixed(2)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div>
            {modalStep === "review" ? (
              <button
                type="button"
                onClick={() => setModalStep("mapping")}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span>← Kembali ke Pemetaan</span>
              </button>
            ) : multiSheetData ? (
              <button
                type="button"
                onClick={() => {
                  setMultiSheetData(null);
                  setActiveSheetIndex(0);
                  setFile(null);
                  setErrorMsg(null);
                  setModalStep("mapping");
                }}
                disabled={isSaving}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                Ganti Berkas Excel
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>

            {multiSheetData && activeSheet && (
              modalStep === "mapping" ? (
                <button
                  type="button"
                  onClick={handleProceedToReview}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>Lanjut ke Review ({selectedCount})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  disabled={isSaving || selectedItems.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan & Menghitung Skor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Konfirmasi & Terapkan Penilaian ({selectedItems.length})</span>
                    </>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SUB-MODAL 1: DETAIL PEMBACAAN EXCEL BULANAN (JAN - DES)   */}
      {/* ========================================================= */}
      {viewingDetailItem && (() => {
        const item = viewingDetailItem;
        const monthNames = [
          "Januari", "Februari", "Maret", "April", "Mei", "Juni",
          "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        const monthCols = [
          "Kolom I", "Kolom J", "Kolom K", "Kolom L", "Kolom M", "Kolom N",
          "Kolom O", "Kolom P", "Kolom Q", "Kolom R", "Kolom S", "Kolom T"
        ];

        const unit = item.matchedIndicator?.unit || "";
        const filledActualCount = item.excelMonthlyActuals.filter((v) => v !== null).length;
        const filledTargetCount = item.excelMonthlyTargets.filter((v) => v !== null).length;

        const formatVal = (v: number | null | undefined) => {
          if (v === null || v === undefined || isNaN(v)) return "-";
          const s = v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
          if (unit === "%") return `${s}%`;
          if (unit.toLowerCase() === "rp") return `Rp ${s}`;
          if (unit) return `${s} ${unit}`;
          return s;
        };

        return (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-excel-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setViewingDetailItem(null);
            }}
          >
            <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 shrink-0">
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 border border-emerald-200 shadow-xs shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="detail-excel-modal-title" className="text-base font-bold text-slate-900 truncate">
                      Rincian Pembacaan Excel: {item.rawTitle}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      Indikator Master:{" "}
                      <span className="font-semibold text-slate-800">
                        {item.matchedIndicator?.name || "Belum Terpetakan"}
                      </span>
                      {item.matchedIndicator?.categoryName ? ` (${item.matchedIndicator.categoryName})` : ""}
                      {" · "}Sheet: <span className="font-semibold text-slate-700">{activeSheet?.sheetName}</span>
                      {" · "}Baris Excel: <span className="font-mono text-slate-700">Baris {item.excelRowNumber}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingDetailItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  title="Tutup Rincian (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800">
                {/* Summary Validation Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-emerald-900">
                      Status Kelengkapan Excel:
                    </span>
                    <span className="text-emerald-800">
                      {filledActualCount} dari 12 bulan aktual terbaca
                      {filledTargetCount > 0 ? ` · ${filledTargetCount} bulan target terdefinisi` : ""}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-white/80 px-2 py-0.5 rounded border border-emerald-300">
                    Sumber: Kolom I s/d T & Kolom U
                  </span>
                </div>

                {/* 12-Month Breakdown Table */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-sky-600" />
                      Rincian Pembacaan Bulanan (Januari - Desember)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Satuan: <b className="text-slate-700 font-semibold">{unit || "-"}</b>
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[38vh]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 text-center w-12 text-slate-400">No</th>
                          <th className="p-2.5 min-w-[110px]">Bulan</th>
                          <th className="p-2.5 min-w-[120px] text-slate-500">Kolom Excel</th>
                          <th className="p-2.5 text-right min-w-[110px]">Target</th>
                          <th className="p-2.5 text-right min-w-[120px]">Actual (Realisasi)</th>
                          <th className="p-2.5 text-right min-w-[90px]">% Capaian</th>
                          <th className="p-2.5 text-center min-w-[120px]">Status Pembacaan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {monthNames.map((mName, mIdx) => {
                          const tgtVal = item.excelMonthlyTargets[mIdx];
                          const actVal = item.excelMonthlyActuals[mIdx];
                          const hasAct = actVal !== null && actVal !== undefined;
                          const hasTgt = tgtVal !== null && tgtVal !== undefined;

                          let pctStr = "-";
                          if (hasAct && hasTgt && tgtVal !== 0) {
                            pctStr = `${((actVal / tgtVal) * 100).toFixed(1)}%`;
                          } else if (hasAct && item.effectiveTarget && item.effectiveTarget !== 0) {
                            pctStr = `${((actVal / item.effectiveTarget) * 100).toFixed(1)}%`;
                          }

                          return (
                            <tr
                              key={mName}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                hasAct ? "bg-white" : "bg-slate-50/30 text-slate-400"
                              }`}
                            >
                              <td className="p-2.5 text-center font-mono text-slate-400 text-[11px]">
                                {mIdx + 1}
                              </td>
                              <td className="p-2.5 font-semibold text-slate-800">
                                {mName}
                              </td>
                              <td className="p-2.5 font-mono text-[11px] text-slate-500">
                                {monthCols[mIdx]}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-700">
                                {formatVal(tgtVal)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                {formatVal(actVal)}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-700">
                                {pctStr}
                              </td>
                              <td className="p-2.5 text-center">
                                {hasAct && hasTgt ? (
                                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3" /> Terisi Lengkap
                                  </span>
                                ) : hasAct ? (
                                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                    <Check className="w-3 h-3" /> Actual Terisi
                                  </span>
                                ) : hasTgt ? (
                                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    Target Saja
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100">
                                    - Kosong
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Total & Agregasi Tahunan (Kolom U) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Total & Agregasi Tahunan (Kolom U Excel)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Formula: {item.matchedIndicator?.aggregation || "AVERAGE"} · Basis: {item.matchedIndicator?.compareBasis || "ACTUAL"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Tahunan</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">
                        {item.targetDisplay || formatVal(item.excelAnnualTarget)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Kolom U (Baris Target)</span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Realisasi Tahunan</span>
                      <span className="text-sm font-bold text-emerald-700 font-mono">
                        {item.realizationDisplay || formatVal(item.excelAnnualActual)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Kolom U (Baris Actual)</span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">% Capaian</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">
                        {item.realizationPctDisplay || "-"}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Kolom V / Formula KPI</span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Konversi Skor KPI</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200 font-mono">
                          Band: {item.score !== null ? item.score : "-"}
                        </span>
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          Skor: {item.weightedScoreDisplay || "-"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Sesuai Kriteria Master</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
                <span className="text-xs text-slate-500">
                  Data dibaca langsung dari hasil parsing lembar kerja Excel (tanpa perlu upload ulang).
                </span>
                <button
                  type="button"
                  onClick={() => setViewingDetailItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Tutup Rincian
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* SUB-MODAL 2: FITUR ATTACH FILE (LAMPIRAN DOKUMEN BUKTI)   */}
      {/* ========================================================= */}
      {isEvidenceModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="evidence-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUploadingEvidence) {
              setIsEvidenceModalOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 shrink-0">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700 border border-sky-200 shadow-xs shrink-0">
                  <Paperclip className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id="evidence-modal-title" className="text-base font-bold text-slate-900 truncate">
                      Lampiran & Dokumen Pendukung Penilaian
                    </h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Opsional
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {employeeName} ({employeeNik}) · {departmentName} · Tahun {periodYear}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(false)}
                disabled={isUploadingEvidence}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800">
              {/* Form Upload Area */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-sky-600" />
                    Unggah Berkas Gambar atau Dokumen Pendukung Baru
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mendukung JPG, PNG, WEBP, PDF, XLSX
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Parameter KPI Terkait:
                    </label>
                    <select
                      value={evidenceTargetParamId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setEvidenceTargetParamId(val);
                      }}
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800 shadow-2xs hover:border-sky-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      <option value="">-- Umum / Seluruh Penilaian --</option>
                      {availableIndicators.map((ind) => (
                        <option key={ind.appraisalItemId} value={ind.parameterId ?? ""}>
                          {ind.name} ({ind.categoryName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Catatan / Keterangan Lampiran (opsional):
                    </label>
                    <input
                      type="text"
                      value={evidenceDescription}
                      onChange={(e) => setEvidenceDescription(e.target.value)}
                      placeholder="Contoh: Bukti rekap presensi, foto stock opname, dll."
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800 shadow-2xs hover:border-sky-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Dropzone / Upload button */}
                <div
                  onClick={() => evidenceFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isUploadingEvidence
                      ? "border-sky-300 bg-sky-50/50 cursor-wait"
                      : "border-slate-300 hover:border-sky-500 hover:bg-sky-50/30 bg-white"
                  }`}
                >
                  <input
                    ref={evidenceFileInputRef}
                    type="file"
                    accept="image/*,.pdf,.xlsx,.xls,.docx,.doc"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadEvidence(e.target.files[0]);
                      }
                    }}
                  />

                  {isUploadingEvidence ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-sky-700 font-semibold text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengunggah dan menyimpan berkas ke server...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-slate-600">
                      <Upload className="w-6 h-6 text-sky-600" />
                      <p className="font-semibold text-slate-800">
                        Klik di sini untuk memilih berkas gambar atau dokumen
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Maksimal ukuran file 10MB per berkas
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Daftar Berkas Terunggah */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Daftar Lampiran Terlampir ({evidenceList.length})
                  </span>
                  {isLoadingEvidence && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Memuat daftar...
                    </span>
                  )}
                </div>

                {evidenceList.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-slate-200 bg-slate-50/50 text-slate-400 text-xs space-y-1">
                    <Paperclip className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600">Belum ada dokumen bukti yang dilampirkan</p>
                    <p className="text-[11px]">
                      Melampirkan berkas bukti bersifat opsional dan tidak menjadi syarat wajib upload penilaian.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                    {evidenceList.map((ev, evIdx) => {
                      const isImg =
                        ev.mimeType?.startsWith("image/") ||
                        /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(ev.fileName);
                      const isExcelFile =
                        ev.fileType === "EXCEL_DATA" ||
                        /\.(xlsx|xls|csv)$/i.test(ev.fileName);

                      // Match indicator name
                      const paramMatch = availableIndicators.find(
                        (ind) => ind.parameterId === ev.parameterId
                      );

                      return (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Thumbnail or File Icon */}
                            {isImg ? (
                              <img
                                src={ev.filePath}
                                alt={ev.fileName}
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 transition"
                                onClick={() =>
                                  setEvidenceViewerState({
                                    isOpen: true,
                                    items: evidenceList,
                                    initialIndex: evIdx,
                                    indicatorName: paramMatch?.name,
                                    categoryName: paramMatch?.categoryName,
                                  })
                                }
                              />
                            ) : isExcelFile ? (
                              <div className="w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                                <FileSpreadsheet className="w-5 h-5" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 truncate" title={ev.fileName}>
                                {ev.fileName}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 mt-0.5">
                                <span>
                                  {ev.fileSize ? `${(ev.fileSize / 1024).toFixed(1)} KB` : "-"}
                                </span>
                                <span>•</span>
                                <span className="text-slate-600 font-medium truncate">
                                  {paramMatch ? `${paramMatch.name}` : "Umum Penilaian"}
                                </span>
                                {ev.description && (
                                  <>
                                    <span>•</span>
                                    <span className="italic text-slate-500 truncate" title={ev.description}>
                                      "{ev.description}"
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons: Preview, Download, Delete */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceViewerState({
                                  isOpen: true,
                                  items: evidenceList,
                                  initialIndex: evIdx,
                                  indicatorName: paramMatch?.name,
                                  categoryName: paramMatch?.categoryName,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition cursor-pointer"
                              title="Pratinjau Berkas Bukti"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat</span>
                            </button>

                            <a
                              href={ev.filePath}
                              download={ev.fileName}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title="Unduh Berkas"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>

                            <button
                              type="button"
                              onClick={() => handleDeleteEvidence(ev.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Hapus Berkas"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
              <span className="text-xs text-slate-500">
                Berkas bukti tersimpan secara terpisah dan dapat diakses kembali di Form Penilaian KPI.
              </span>
              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(false)}
                className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. EVIDENCE VIEWER MODAL (PRATINJAU DOKUMEN BUKTI PENUH)  */}
      {/* ========================================================= */}
      <EvidenceViewerModal
        isOpen={evidenceViewerState.isOpen}
        onClose={() => setEvidenceViewerState((prev) => ({ ...prev, isOpen: false }))}
        indicatorName={evidenceViewerState.indicatorName}
        categoryName={evidenceViewerState.categoryName}
        items={evidenceViewerState.items}
        initialIndex={evidenceViewerState.initialIndex}
        onDelete={handleDeleteEvidence}
      />
    </div>
  );
}
