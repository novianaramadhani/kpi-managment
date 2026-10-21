"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import {
  type MonthlyAssessmentDetailResult,
  type MonthlyIndicatorItem,
  type EmployeeProgressItem,
  type IndicatorMonthDetail,
  type AppraisalEvidenceItem,
  INDONESIAN_MONTH_NAMES,
} from "@/types/monthly-assessment";
import {
  calculateKpiScore,
  calculateParameterScore,
  calculateOverallKpiScore,
  type GenericScoringRule,
} from "@/lib/scoring";
import {
  saveMonthlyDraftAction,
  submitMonthlyAction,
  submitMyAssessmentAction,
  saveIndicatorAnnualActualAction,
  saveIndicatorMonthlyValuesAction,
} from "@/lib/monthly-assessment-actions";
import {
  submitAppraisalToHeadDeptAction,
  validateAppraisalByHeadDeptAction,
  validateAppraisalByManagerAction,
  approveAppraisalByHrAction,
} from "@/lib/approval-actions";
import { exportIndividualAppraisal, exportEvaluationResultExcel } from "@/lib/excel-individual";
import { downloadEvaluationPdf } from "@/lib/pdf-evaluation";
import { syncAppraisalWithTemplateAction } from "@/lib/actions";
import { CustomKpiModal } from "./custom-kpi-modal";
import { CalculationTraceModal } from "./calculation-trace-modal";
import { EvidenceViewerModal } from "./evidence-viewer-modal";
import { BatchExcelUploadModal } from "./batch-excel-upload-modal";
import { extractMatchingTargetsFromCategories } from "@/lib/excel-batch-assessment";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Pencil,
  Lock,
  Lightbulb,
  Save,
  X,
  Plus,
  Paperclip,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FileText,
  FileSpreadsheet,
  Database,
  AlertTriangle,
  Info,
  Send,
  History,
  UserCheck,
  Clock3,
  RotateCcw,
  ShieldCheck,
  CheckCheck,
  Eye,
  Download,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";

/**
 * Design Tokens untuk Modal Input Penilaian KPI
 * Terpusat: Warna, Skala Tipografi, dan Komponen Style
 * Menyesuaikan standar font & ukuran aplikasi (tidak oversized)
 */
const MODAL_TOKENS = {
  // CSS Variables untuk root modal
  cssVars: {
    "--modal-blue-bg": "#EFF6FF",
    "--modal-blue-text": "#1E40AF",
    "--modal-indigo-bg": "#EEF2FF",
    "--modal-indigo-text": "#3730A3",
    "--modal-accent": "#2563EB",
    "--modal-accent-hover": "#1D4ED8",
    "--modal-status-dot": "#10B981",
  } as React.CSSProperties,

  // Skala Tipografi Terpadu (Menyesuaikan standar modal dan form lain di aplikasi)
  typography: {
    modalTitle: "text-sm sm:text-base font-bold text-slate-900 tracking-tight",
    sectionTitle: "text-xs font-bold uppercase tracking-wider",
    label: "text-xs font-semibold text-slate-700",
    resultLabel: "text-xs font-medium text-slate-600",
    resultValue: "text-xs sm:text-sm font-semibold text-[#1E40AF] tabular-nums",
    resultValueReference: "text-xs sm:text-sm font-medium text-slate-700 tabular-nums",
    helper: "text-[11px] font-normal text-slate-500",
    subheading: "text-xs font-normal text-slate-500",
    formula: "text-[11px] font-normal text-slate-500 tabular-nums",
    scoreNumber: "text-base sm:text-lg font-bold text-[#1E40AF] tabular-nums leading-none",
    scoreTotal: "text-xs font-normal text-slate-500 tabular-nums ml-1",
  },

  // Warna Surface & Strip Header (Warna HANYA untuk header section input penilaian & hasil perhitungan)
  colors: {
    dialog: "relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150",
    backdrop: "fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity",
    header: "border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4 shrink-0 bg-white",
    body: "overflow-y-auto flex-1 p-5 sm:p-6 space-y-4 text-slate-800 bg-white",
    footer: "border-t border-slate-200 bg-white px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0",

    // Section Strips (Warna nuansa biru muda yang jelas terlihat pada header section)
    section1Strip: "px-3.5 py-2.5 bg-blue-100 text-blue-900 rounded-t-lg flex items-center justify-between border-b border-blue-200",
    section2Strip: "px-3.5 py-2.5 bg-indigo-100 text-indigo-900 rounded-t-lg flex items-center justify-between border-b border-indigo-200",

    // Primary Blue Accent (#2563EB)
    primaryBtn: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition active:scale-[0.98] cursor-pointer disabled:opacity-50",
    segmentedActive: "bg-blue-600 text-white font-medium shadow-xs",
    segmentedInactive: "text-slate-600 hover:text-slate-900 font-normal",

    // Nilai penting & referensi
    importantValue: "text-[#1E40AF]",
    referenceText: "inline-flex items-center gap-1 text-[11px] font-normal text-slate-500",

    // Status dot
    statusDot: "inline-block w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5 shrink-0",
  },

  // Kontrol & Form
  controls: {
    inputActual: "w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition tabular-nums",
    segmentedContainer: "inline-flex p-0.5 rounded-md bg-white/90 border border-blue-300 shadow-xs text-xs",
    ghostBtn: "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-normal text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer",
    ghostCloseBtn: "rounded-md p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer",
  },
};

// Helper badge status lembut (hijau / kuning / merah)
function getBandBadgeStyle(score: number | null, maxScore: number = 25, isUnmatched: boolean = false): string {
  if (isUnmatched || score === null) {
    return "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"; // Kuning/Amber lembut
  }
  const ratio = score / (maxScore || 25);
  if (ratio >= 0.8) {
    return "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]"; // Hijau lembut
  }
  if (ratio >= 0.4) {
    return "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"; // Kuning lembut
  }
  return "bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]"; // Merah lembut
}

interface MonthlyAssessmentViewProps {
  initialDetail: MonthlyAssessmentDetailResult | null;
  employees: EmployeeProgressItem[];
  availableYears: number[];
  currentYear: number;
  currentMonth: number;
  currentEmployeeId: number | null;
  userRole?: string;
  currentUser?: {
    id: number;
    name: string;
    role: string;
  } | null;
}

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"
];

// Helper format angka & satuan
function formatValueWithUnit(val: number | null | undefined, unit: string | null | undefined): string {
  if (val === null || val === undefined) return "-";
  const numStr = val.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (!unit) return numStr;
  if (unit === "%") return `${numStr}%`;
  return `${numStr} ${unit}`;
}

// Helper format target (angka aja)
function formatTargetNumber(target: number | null | undefined, unit: string | null | undefined): string {
  if (target === null || target === undefined || Number.isNaN(Number(target))) return "-";
  const num = Number(target);
  const numStr = num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (unit === "%") return `${numStr}%`;
  return numStr;
}

// Helper format realisasi (angka aja)
function formatActualNumber(val: number | null | undefined, unit: string | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "-";
  const num = Number(val);
  const numStr = num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (unit === "%") return `${numStr}%`;
  return numStr;
}

// Helper format kriteria scoring (angka aja, bersih tanpa kata-kata deskriptif)
function cleanRuleNumeric(rule: GenericScoringRule, unit: string | null | undefined): string {
  const isPercent = unit === "%";
  const p = isPercent ? "%" : "";
  const op = (rule.operator || "").toUpperCase();
  const min = rule.minValue;
  const max = rule.maxValue;

  // If explicit min & max are provided
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${min}${p} - ${max}${p}`;
  }
  if (op === "GTE" || op === ">=") {
    const val = min ?? max;
    return val !== null && val !== undefined ? `≥ ${val}${p}` : "≥ 0";
  }
  if (op === "LTE" || op === "<=") {
    const val = max ?? min;
    return val !== null && val !== undefined ? `≤ ${val}${p}` : "≤ 0";
  }
  if (op === "GT" || op === ">") {
    const val = min ?? max;
    return val !== null && val !== undefined ? `> ${val}${p}` : "> 0";
  }
  if (op === "LT" || op === "<") {
    const val = max ?? min;
    return val !== null && val !== undefined ? `< ${val}${p}` : "< 0";
  }
  if (op === "EQ" || op === "=") {
    const val = min ?? max;
    return val !== null && val !== undefined ? `${val}${p}` : "0";
  }

  // If label exists, strip qualitative descriptions, parentheses, and text units
  if (rule.label && rule.label.trim().length > 0) {
    let cleaned = rule.label.replace(/\s*\([^)]*\)/g, "");
    cleaned = cleaned.replace(/\b(Hasil Survey|Hari|Kasus|Dokumen|Orang|Bulan|Kali|Unit|Item|Persen|Point|Poin)\b/gi, "");
    cleaned = cleaned.replace(/^\s*[-–]\s*/, "").replace(/\s+/g, " ").trim();
    if (cleaned.length > 0) return cleaned;
  }

  return `${rule.score}`;
}

// Helper format target untuk modal/rekap
function formatTarget(target: number | null | undefined, unit: string | null | undefined): string {
  if (target === null || target === undefined) return "-";
  const numStr = target.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (unit === "%") return `${numStr}%`;
  if (unit) return `${numStr} ${unit}`;
  return numStr;
}

// Helper format label kriteria scoring untuk tabel dan modal
function formatRuleLabel(rule: GenericScoringRule, unit: string | null | undefined): string {
  const u = (unit || "").trim();
  const formatVal = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    const str = String(v).replace(/\.0000$/, "").replace(/\.00$/, "");
    if (u === "%") return `${str}%`;
    if (u.toLowerCase() === "rp") {
      const num = Number(str);
      return !isNaN(num) ? `Rp ${num.toLocaleString("id-ID")}` : `Rp ${str}`;
    }
    if (u) return `${str} ${u}`;
    return str;
  };

  const min = rule.minValue !== null && rule.minValue !== undefined ? String(rule.minValue) : "";
  const max = rule.maxValue !== null && rule.maxValue !== undefined ? String(rule.maxValue) : "";
  const op = (rule.operator || "").toUpperCase();

  let condStr = "";
  if (op === "EQ" || op === "=") condStr = min ? `= ${formatVal(min)}` : "";
  else if (op === "LT" || op === "<") condStr = (max || min) ? `< ${formatVal(max || min)}` : "";
  else if (op === "LTE" || op === "<=") condStr = (max || min) ? `≤ ${formatVal(max || min)}` : "";
  else if (op === "GT" || op === ">") condStr = (min || max) ? `> ${formatVal(min || max)}` : "";
  else if (op === "GTE" || op === ">=") condStr = (min || max) ? `≥ ${formatVal(min || max)}` : "";
  else if (op === "BETWEEN") condStr = min && max ? `${formatVal(min)} - ${formatVal(max)}` : "";

  if (rule.label && rule.label.trim().length > 0) {
    const trimmed = rule.label.trim();
    if (/^[><=≥≤]/.test(trimmed) || /^\d/.test(trimmed)) {
      return condStr || trimmed;
    }
    return condStr ? `${condStr} (${trimmed})` : trimmed;
  }

  return condStr || `Kriteria (${rule.score} poin)`;
}

// Helper format tanggal audit trail (WIB)
function formatAuditDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return "-";
  try {
    const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
    return (
      d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB"
    );
  } catch {
    return String(dateVal);
  }
}

// Helper label & warna badge aktivitas audit
function formatAuditActionLabel(action: string): { label: string; badgeClass: string } {
  const a = action.toUpperCase();
  if (a.includes("SUBMIT_ASSESSMENT")) {
    return { label: "Kirim Penilaian", badgeClass: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  if (a.includes("SUBMIT_TO_HEAD_DEPT") || a.includes("HEAD_DEPT_SUBMIT")) {
    return { label: "Diajukan ke Head Dept", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (a.includes("FORWARD_TO_MANAGER") || a.includes("VALIDATE_HEAD_DEPT")) {
    return { label: "Validasi Head Dept", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  if (a.includes("FORWARD_TO_HR") || a.includes("VALIDATE_MANAGER")) {
    return { label: "Validasi Manager", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  if (a.includes("APPROVE")) {
    return { label: "Disetujui HR (Final)", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (a.includes("REVISE")) {
    return { label: "Permintaan Revisi", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  return { label: action, badgeClass: "bg-slate-50 text-slate-700 border-slate-200" };
}

export function MonthlyAssessmentView({
  initialDetail,
  employees,
  availableYears,
  currentYear,
  currentMonth,
  currentEmployeeId,
  userRole = "ADMIN",
  currentUser,
}: MonthlyAssessmentViewProps) {
  const router = useRouter();

  // LEVEL 1: Parameter Accordion (Set of open parameter IDs, default all open for immediate assessment)
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(
    () => new Set<number>(initialDetail?.categories?.map((c) => c.categoryId) || [])
  );
  const [isTipsModalOpen, setIsTipsModalOpen] = useState(false);

  // Unified Assessment Input Modal State (Section 1: Input Penilaian & Section 2: Hasil Perhitungan)
  const [assessmentModal, setAssessmentModal] = useState<{
    isOpen: boolean;
    indicator: MonthlyIndicatorItem | null;
    categoryName: string;
    inputPattern: "SEKALI" | "BULANAN";
    singleActualStr: string;
    tempValues: Record<number, { actual: string; target: string; notes: string }>;
    aggregationMethod: "AVG" | "SUM" | "MIN" | "MAX" | "LAST_VALUE";
    targetStr: string;
    comment: string;
    evidenceFileName: string | null;
    evidenceUrl?: string | null;
    evidenceFileType?: string | null;
    evidenceId?: number | null;
    isUploadingEvidence?: boolean;
  }>({
    isOpen: false,
    indicator: null,
    categoryName: "",
    inputPattern: "BULANAN",
    singleActualStr: "",
    tempValues: {},
    aggregationMethod: "AVG",
    targetStr: "",
    comment: "",
    evidenceFileName: null,
    evidenceUrl: null,
    evidenceFileType: null,
    evidenceId: null,
    isUploadingEvidence: false,
  });

  // Evidence Viewer Modal State (Pratinjau Dokumen Bukti)
  const [evidenceViewerState, setEvidenceViewerState] = useState<{
    isOpen: boolean;
    indicatorName?: string;
    categoryName?: string;
    items: AppraisalEvidenceItem[];
    initialIndex?: number;
  }>({
    isOpen: false,
    items: [],
  });

  // Local Evidence Map (realtime reactivity per parameterId)
  const [localEvidenceMap, setLocalEvidenceMap] = useState<Record<number, AppraisalEvidenceItem[]>>({});

  useEffect(() => {
    if (initialDetail) {
      const map: Record<number, AppraisalEvidenceItem[]> = {};
      for (const cat of initialDetail.categories) {
        for (const ind of cat.indicators) {
          if (ind.parameterId && ind.evidenceList && ind.evidenceList.length > 0) {
            map[ind.parameterId] = ind.evidenceList;
          }
        }
      }
      setLocalEvidenceMap(map);
    }
  }, [initialDetail]);

  // Kumpulan seluruh berkas bukti (Lampiran & Bukti Pendukung) untuk penilaian ini
  const allEvidenceList = useMemo(() => {
    const all: AppraisalEvidenceItem[] = [];
    const seenIds = new Set<number>();
    for (const list of Object.values(localEvidenceMap)) {
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            all.push(item);
          }
        }
      }
    }
    return all.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [localEvidenceMap]);

  const sectionEvidenceFileRef = useRef<HTMLInputElement>(null);
  const [isSectionUploadingEvidence, setIsSectionUploadingEvidence] = useState(false);

  const handleUploadSectionEvidence = async (file: File) => {
    if (!file || !initialDetail?.appraisalId) return;
    setIsSectionUploadingEvidence(true);
    try {
      let firstParamId = 0;
      for (const cat of initialDetail.categories || []) {
        for (const ind of cat.indicators || []) {
          if (ind.parameterId) {
            firstParamId = ind.parameterId;
            break;
          }
        }
        if (firstParamId) break;
      }

      if (!firstParamId) {
        throw new Error("Tidak ditemukan parameter KPI untuk melampirkan berkas.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("appraisalId", String(initialDetail.appraisalId));
      formData.append("parameterId", String(firstParamId));
      formData.append(
        "fileType",
        /\.(xlsx|xls|csv)$/i.test(file.name) ? "EXCEL_DATA" : "ATTACHMENT"
      );

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengunggah file bukti.");
      }

      const newEv: AppraisalEvidenceItem = data.evidence;

      setLocalEvidenceMap((prev) => {
        const curList = prev[firstParamId] || [];
        return {
          ...prev,
          [firstParamId]: [newEv, ...curList.filter((e) => e.id !== newEv.id)],
        };
      });

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah berkas.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Mengunggah",
        text: msg,
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSectionUploadingEvidence(false);
      if (sectionEvidenceFileRef.current) {
        sectionEvidenceFileRef.current.value = "";
      }
    }
  };

  // Collapsible state for range guide in modal (default closed)
  const [isRangeGuideExpanded, setIsRangeGuideExpanded] = useState(false);
  const [focusedMonth, setFocusedMonth] = useState<number | null>(null);

  // Calculation Trace Modal State (Formula Engine Audit)
  const [traceModalState, setTraceModalState] = useState<{
    isOpen: boolean;
    appraisalItemId: number;
    month?: number | null;
    indicatorName: string;
    categoryName?: string;
    unit?: string;
  }>({
    isOpen: false,
    appraisalItemId: 0,
    month: 1,
    indicatorName: "",
  });

  // Local state untuk perubahan langsung 1 tahun: key is appraisalItemId
  const [editedAnnualValues, setEditedAnnualValues] = useState<
    Record<
      number,
      {
        annualActual: number | null;
        target?: number | null;
        notes?: string | null;
        mode: "MONTHLY" | "ANNUAL_DIRECT";
      }
    >
  >({});

  // LEVEL 5: Custom KPI Modal State
  const [customKpiModalState, setCustomKpiModalState] = useState<{
    isOpen: boolean;
    categoryId: number;
    categoryName: string;
  }>({
    isOpen: false,
    categoryId: 0,
    categoryName: "",
  });

  // Criteria Modal State
  const [criteriaModalItem, setCriteriaModalItem] = useState<MonthlyIndicatorItem | null>(null);

  // View Form Hasil & Actions Modal State
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isBatchExcelModalOpen, setIsBatchExcelModalOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [expandedRecapId, setExpandedRecapId] = useState<number | null>(null);
  const [isDownloadResultOpen, setIsDownloadResultOpen] = useState(false);
  const downloadResultRef = useRef<HTMLDivElement>(null);

  // Riwayat & Audit Trail Modal State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isSubmittingMyAssessment, setIsSubmittingMyAssessment] = useState(false);

  // Popover Rincian Perhitungan (Realisasi, Bobot, atau Skor Akhir)
  const [popoverAnchor, setPopoverAnchor] = useState<{
    type: "realization" | "weight" | "final_score";
    indicator: MonthlyIndicatorItem;
    categoryName: string;
    categoryWeight?: number;
    rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTriggerMouseEnter = (
    type: "realization" | "weight" | "final_score",
    indicator: MonthlyIndicatorItem,
    categoryName: string,
    categoryWeight: number | undefined,
    target: HTMLElement
  ) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setPopoverAnchor({
        type,
        indicator,
        categoryName,
        categoryWeight,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
      });
    }, 120);
  };

  const handleTriggerMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setPopoverAnchor(null);
    }, 200);
  };

  const handleTriggerClick = (
    e: React.MouseEvent<HTMLElement>,
    type: "realization" | "weight" | "final_score",
    indicator: MonthlyIndicatorItem,
    categoryName: string,
    categoryWeight: number | undefined
  ) => {
    e.stopPropagation();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (
      popoverAnchor?.type === type &&
      popoverAnchor.indicator.appraisalItemId === indicator.appraisalItemId
    ) {
      setPopoverAnchor(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopoverAnchor({
        type,
        indicator,
        categoryName,
        categoryWeight,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
      });
    }
  };

  const handlePopoverMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setPopoverAnchor(null);
    }, 200);
  };

  // Close Realization Popover on Outside Click or Escape
  useEffect(() => {
    if (!popoverAnchor) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!mobileSheetRef.current || !mobileSheetRef.current.contains(target))
      ) {
        setPopoverAnchor(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPopoverAnchor(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [popoverAnchor]);

  // Close Download Evaluation Dropdown on Outside Click or Escape
  useEffect(() => {
    if (!isDownloadResultOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (downloadResultRef.current && !downloadResultRef.current.contains(event.target as Node)) {
        setIsDownloadResultOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDownloadResultOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDownloadResultOpen]);

  // Close Actions Menu on Outside Click or Escape
  useEffect(() => {
    if (!isActionsMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsActionsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionsMenuOpen]);

  // Local state for live edits: key is `${appraisalItemId}_${month}`
  const [editedValues, setEditedValues] = useState<
    Record<
      string,
      {
        actualValue: number | null;
        target?: number | null;
        notes: string | null;
      }
    >
  >({});

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal Actions Dropdown & Score Detail Popover State
  const [isModalActionsOpen, setIsModalActionsOpen] = useState(false);
  const modalActionsRef = useRef<HTMLDivElement>(null);
  const [scoreDetailMonth, setScoreDetailMonth] = useState<number | null>(null);
  const scorePopoverRef = useRef<HTMLDivElement>(null);

  // Close Modal Actions and Score Popover on Outside Click or Escape
  useEffect(() => {
    function handleModalClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        modalActionsRef.current &&
        !modalActionsRef.current.contains(target)
      ) {
        setIsModalActionsOpen(false);
      }
      if (
        scorePopoverRef.current &&
        !scorePopoverRef.current.contains(target)
      ) {
        setScoreDetailMonth(null);
      }
    }

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModalActionsOpen(false);
        setScoreDetailMonth(null);
      }
    }

    document.addEventListener("mousedown", handleModalClickOutside);
    window.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleModalClickOutside);
      window.removeEventListener("keydown", handleModalKeyDown);
    };
  }, []);

  // User Role Scoping
  const normalizedRole = (userRole || "ADMIN").toUpperCase();
  const isGlobalAdmin = normalizedRole === "ADMIN";

  // Validation State: kelengkapan pengisian form sebelum dikirim
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Current employee & metadata
  const currentEmp = useMemo(() => {
    if (!employees || employees.length === 0) return null;
    if (currentEmployeeId) {
      return employees.find((e) => e.employeeId === currentEmployeeId) ?? employees[0];
    }
    return employees[0];
  }, [employees, currentEmployeeId]);

  const activeTemplateName =
    initialDetail?.employee?.templateName ||
    initialDetail?.templateName ||
    currentEmp?.templateName ||
    "-";

  // Live calculation of all categories, indicators, and 12-month details
  const liveCategories = useMemo(() => {
    if (!initialDetail) return [];

    return initialDetail.categories.map((cat, catIdx) => {
      const liveIndicators = cat.indicators.map((ind, indIdx) => {
        // Compute 12-month data with live edits
        const baseMonthly = ind.monthlyDetails || [];
        const liveMonthly: IndicatorMonthDetail[] = [];
        let filledCount = 0;
        let sumActual = 0;

        for (let m = 1; m <= 12; m++) {
          const key = `${ind.appraisalItemId}_${m}`;
          const edit = editedValues[key];

          const origMonth = baseMonthly.find((b) => b.month === m);
          const actual =
            edit !== undefined
              ? edit.actualValue
              : origMonth?.actual !== undefined
              ? origMonth.actual
              : null;
          const target =
            edit?.target !== undefined
              ? edit.target
              : origMonth?.target !== undefined && origMonth?.target !== null
              ? origMonth.target
              : ind.target;
          const notes =
            edit !== undefined
              ? edit.notes
              : origMonth?.notes !== undefined
              ? origMonth.notes
              : null;

          const mScoreRes = calculateKpiScore(actual, ind.scoringRules, {
            indicatorWeight: ind.indicatorWeight,
            parameterWeight: ind.parameterWeight,
            maxScore: ind.maxScore,
            compareBasis: ind.compareBasis,
            target,
            direction: ind.direction,
            measurementType: ind.measurementType,
            unit: ind.unit,
          });

          if (actual !== null) {
            filledCount++;
            sumActual += actual;
          }

          liveMonthly.push({
            month: m,
            monthShort: SHORT_MONTH_NAMES[m - 1],
            monthName: INDONESIAN_MONTH_NAMES[m - 1],
            target,
            unit: ind.unit,
            actual,
            achievement: mScoreRes.realizationPct ?? null,
            realizationPct: mScoreRes.realizationPct ?? null,
            bandLabel: mScoreRes.bandLabel ?? null,
            score: actual !== null ? mScoreRes.score : null,
            status: origMonth?.status ?? (actual !== null ? "DRAFT" : "NOT_STARTED"),
            notes,
          });
        }

        // Hitung realisasi tahunan (Fleksibel Agregasi Bulanan vs Input Langsung 1 Tahun)
        const annualEdit = editedAnnualValues[ind.appraisalItemId];
        let annualActual: number | null = null;
        let annualInputMode: "MONTHLY" | "ANNUAL_DIRECT" = ind.annualInputMode || "MONTHLY";

        if (annualEdit && annualEdit.mode === "ANNUAL_DIRECT") {
          annualActual = annualEdit.annualActual;
          annualInputMode = "ANNUAL_DIRECT";
        } else if (filledCount > 0) {
          const aggType = ind.aggregation || "AVERAGE";
          const validMonthlyActuals = liveMonthly
            .map((m) => m.actual)
            .filter((v): v is number => v !== null && v !== undefined);

          if (aggType === "SUM") {
            annualActual = validMonthlyActuals.reduce((a, b) => a + b, 0);
          } else if (aggType === "LAST_VALUE") {
            annualActual = validMonthlyActuals[validMonthlyActuals.length - 1];
          } else {
            annualActual = parseFloat((sumActual / filledCount).toFixed(1));
          }
          annualInputMode = "MONTHLY";
        } else if (ind.annualActual !== null && ind.annualActual !== undefined) {
          annualActual = ind.annualActual;
          annualInputMode = ind.annualInputMode || "ANNUAL_DIRECT";
        }

        const currentTarget =
          annualEdit?.target !== undefined && annualEdit?.target !== null
            ? annualEdit.target
            : ind.target;

        const annualScoreRes = calculateKpiScore(annualActual, ind.scoringRules, {
          indicatorWeight: ind.indicatorWeight,
          parameterWeight: ind.parameterWeight,
          maxScore: ind.maxScore,
          compareBasis: ind.compareBasis,
          target: currentTarget,
          direction: ind.direction,
          measurementType: ind.measurementType,
          unit: ind.unit,
        });

        const annualStatus: "Completed" | "In Progress" | "Not Started" =
          annualInputMode === "MONTHLY"
            ? (filledCount === 12 ? "Completed" : filledCount > 0 ? "In Progress" : "Not Started")
            : (annualActual !== null ? "Completed" : "Not Started");

        // Current month score for parameter aggregation
        const targetMonth = currentMonth || 1;
        const curMonthVal = liveMonthly[targetMonth - 1]?.actual ?? null;
        const curMonthTarget = liveMonthly[targetMonth - 1]?.target ?? currentTarget;
        const curScoreRes = calculateKpiScore(curMonthVal, ind.scoringRules, {
          indicatorWeight: ind.indicatorWeight,
          parameterWeight: ind.parameterWeight,
          maxScore: ind.maxScore,
          compareBasis: ind.compareBasis,
          target: curMonthTarget,
          direction: ind.direction,
          measurementType: ind.measurementType,
          unit: ind.unit,
        });

        const effectiveParamId = ind.parameterId ?? 0;
        const currentParamEvList = localEvidenceMap[effectiveParamId] ?? ind.evidenceList ?? [];

        return {
          ...ind,
          indicatorCode: ind.indicatorCode || `${catIdx + 1}.${indIdx + 1}`,
          target: currentTarget,
          monthTarget: curMonthTarget,
          actualValue: curMonthVal,
          score: curScoreRes.score,
          achievement: curScoreRes.realizationPct ?? null,
          realizationPct: curScoreRes.realizationPct ?? null,
          realizationPctDisplay: curScoreRes.realizationPctDisplay,
          bandLabel: curScoreRes.bandLabel ?? null,
          finalScoreFraction: curScoreRes.finalScoreFraction,
          finalScorePercentage: curScoreRes.finalScorePercentage,
          finalScoreDisplay: curScoreRes.finalScoreDisplay,
          monthlyDetails: liveMonthly,
          annualTarget: currentTarget,
          annualActual,
          annualAchievement: annualScoreRes.realizationPct ?? null,
          annualScore: annualActual !== null ? annualScoreRes.score : null,
          annualBandLabel: annualScoreRes.bandLabel ?? null,
          annualFinalScoreFraction: annualScoreRes.finalScoreFraction,
          annualFinalScorePercentage: annualScoreRes.finalScorePercentage,
          annualFinalScoreDisplay: annualScoreRes.finalScoreDisplay,
          annualProgress: annualInputMode === "MONTHLY" ? `${filledCount}/12` : (annualActual !== null ? "1/1" : "0/1"),
          annualStatus,
          annualInputMode,
          annualNotes: annualEdit?.notes !== undefined ? annualEdit.notes : ind.annualNotes,
          evidenceList: currentParamEvList,
          latestEvidence: currentParamEvList[0] || null,
        };
      });

      const paramScore = calculateParameterScore(liveIndicators);
      const annualParamScore = calculateParameterScore(
        liveIndicators.map((i) => ({
          finalScoreFraction: i.annualFinalScoreFraction,
        }))
      );

      // Hitung rata-rata progress bulan untuk kategori ini
      const filledAvg =
        liveIndicators.length > 0
          ? Math.round(
              liveIndicators.reduce((acc, ind) => {
                const count = ind.monthlyDetails?.filter((m) => m.actual !== null).length ?? 0;
                return acc + count;
              }, 0) / liveIndicators.length
            )
          : 0;

      return {
        ...cat,
        categoryNumber: catIdx + 1,
        indicatorCount: liveIndicators.length,
        progressMonths: `${filledAvg}/12`,
        scorePercentage: paramScore.totalPercentage,
        annualScorePercentage: annualParamScore.totalPercentage,
        parameterScore: paramScore,
        annualParameterScore: annualParamScore,
        indicators: liveIndicators,
      };
    });
  }, [initialDetail, editedValues, editedAnnualValues, currentMonth, localEvidenceMap]);

  // Daftar poin indikator terurut (Poin 1..N) untuk pengecekan validasi form
  const allIndicatorPoints = useMemo(() => {
    let counter = 0;
    const list: Array<{
      pointNumber: number;
      appraisalItemId: number;
      indicatorCode: string;
      indicatorName: string;
      categoryName: string;
      categoryId: number;
      isFilled: boolean;
      actualValue: number | null;
      annualActual: number | null;
      isEditable: boolean;
      rawIndicator: MonthlyIndicatorItem;
    }> = [];

    for (const cat of liveCategories) {
      for (const ind of cat.indicators) {
        counter++;
        const hasMonth =
          ind.actualValue !== null &&
          ind.actualValue !== undefined &&
          !isNaN(Number(ind.actualValue)) &&
          String(ind.actualValue).trim() !== "";
        const hasAnnual =
          ind.annualActual !== null &&
          ind.annualActual !== undefined &&
          !isNaN(Number(ind.annualActual)) &&
          String(ind.annualActual).trim() !== "";
        const isFilled = hasMonth || hasAnnual;

        const isEditable =
          isGlobalAdmin ||
          ind.isEditable !== false ||
          (initialDetail?.myAssessmentStatus?.assignedCategoryNames &&
            initialDetail.myAssessmentStatus.assignedCategoryNames.some(
              (cName: string) => cName.toLowerCase() === cat.categoryName.toLowerCase()
            ));

        list.push({
          pointNumber: counter,
          appraisalItemId: ind.appraisalItemId,
          indicatorCode: ind.indicatorCode || `${cat.categoryNumber}.${counter}`,
          indicatorName: ind.indicatorName,
          categoryName: cat.categoryName,
          categoryId: cat.categoryId,
          isFilled,
          actualValue: ind.actualValue,
          annualActual: ind.annualActual ?? null,
          isEditable: Boolean(isEditable),
          rawIndicator: ind,
        });
      }
    }
    return list;
  }, [liveCategories, isGlobalAdmin, initialDetail?.myAssessmentStatus?.assignedCategoryNames]);

  // Lookup map: appraisalItemId -> pointNumber
  const pointNumberMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of allIndicatorPoints) {
      map.set(p.appraisalItemId, p.pointNumber);
    }
    return map;
  }, [allIndicatorPoints]);

  // Filter poin yang belum diisi (khusus yang merupakan kewenangan penilai / form editable)
  const unfilledPoints = useMemo(() => {
    return allIndicatorPoints.filter((p) => p.isEditable && !p.isFilled);
  }, [allIndicatorPoints]);

  // Set ID poin yang belum diisi untuk lookup cepat di tabel
  const unfilledPointIds = useMemo(() => {
    return new Set(unfilledPoints.map((p) => p.appraisalItemId));
  }, [unfilledPoints]);

  // Handler melompat dan membuka indikator yang belum diisi
  const handleJumpToUnfilledPoint = (item: (typeof allIndicatorPoints)[0]) => {
    setExpandedCatIds((prev) => new Set(prev).add(item.categoryId));
    setTimeout(() => {
      const rowEl = document.getElementById(`indicator-row-${item.appraisalItemId}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      handleOpenAssessmentModal(item.rawIndicator, item.categoryName);
    }, 80);
  };

  // Live Overall Score
  const liveOverall = useMemo(() => {
    if (liveCategories.length === 0) {
      return {
        overallScoreFraction: 0,
        overallScorePercentage: 0,
        overallScoreDisplay: "0.0%",
        grade: "E" as const,
        label: "Belum Diisi",
        action: "-",
      };
    }
    const paramScores = liveCategories.map((c) => c.parameterScore);
    return calculateOverallKpiScore(paramScores);
  }, [liveCategories]);

  // Live Annual / Cumulative Score (Akumulasi Tahunan Aktual)
  const liveAnnualOverall = useMemo(() => {
    if (liveCategories.length === 0) {
      return {
        overallScoreFraction: 0,
        overallScorePercentage: 0,
        overallScoreDisplay: "0.0%",
        grade: "E" as const,
        label: "Belum Diisi",
        action: "-",
      };
    }
    const annualParamScores = liveCategories.map((c) => {
      const annualIndicators = c.indicators.map((ind) => {
        const annRes = calculateKpiScore(ind.annualActual, ind.scoringRules, {
          indicatorWeight: ind.indicatorWeight,
          parameterWeight: ind.parameterWeight,
          maxScore: ind.maxScore,
          compareBasis: ind.compareBasis,
          target: ind.target,
          direction: ind.direction,
          measurementType: ind.measurementType,
          unit: ind.unit,
        });
        return { finalScoreFraction: annRes.finalScoreFraction };
      });
      return calculateParameterScore(annualIndicators);
    });
    return calculateOverallKpiScore(annualParamScores);
  }, [liveCategories]);

  // Overall Progress (Parameters)
  const overallProgressParameters = useMemo(() => {
    if (liveCategories.length === 0) return "0 / 5";
    const totalParams = liveCategories.length;
    let filledParams = 0;

    for (const cat of liveCategories) {
      if (cat.indicators.length === 0) continue;
      const isParamFilled = cat.indicators.some((ind) => {
        const hasMonthValue = ind.monthlyDetails?.some(
          (m) => m.actual !== null && m.actual !== undefined
        );
        const hasAnnual = ind.annualActual !== null && ind.annualActual !== undefined;
        return hasMonthValue || hasAnnual;
      });
      if (isParamFilled) filledParams++;
    }

    return `${filledParams} / ${totalParams}`;
  }, [liveCategories]);

  // Toggle Parameter Accordion (Buka/Tutup per Parameter)
  const toggleParameter = (catId: number) => {
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Buka Unified Modal Input Penilaian (Pola Sekali vs Bulanan)
  const handleOpenAssessmentModal = (
    ind: MonthlyIndicatorItem,
    categoryName: string,
    overridePattern?: "SEKALI" | "BULANAN",
    overrideMonth?: number
  ) => {
    const defaultTargetVal =
      ind.target !== null && ind.target !== undefined ? String(ind.target) : "0";

    const temps: Record<number, { actual: string; target: string; notes: string }> = {};
    let hasAnyMonth = false;
    for (let m = 1; m <= 12; m++) {
      const key = `${ind.appraisalItemId}_${m}`;
      const edit = editedValues[key];
      const origMonth = ind.monthlyDetails?.find((b) => b.month === m);

      const actualVal =
        edit !== undefined
          ? edit.actualValue
          : origMonth?.actual !== undefined
          ? origMonth.actual
          : null;

      if (actualVal !== null && actualVal !== undefined) {
        hasAnyMonth = true;
      }

      const targetVal =
        edit?.target !== undefined
          ? edit.target
          : origMonth?.target !== undefined && origMonth?.target !== null
          ? origMonth.target
          : ind.target !== null && ind.target !== undefined
          ? ind.target
          : null;

      const notesVal =
        edit !== undefined
          ? edit.notes
          : origMonth?.notes !== undefined
          ? origMonth.notes
          : "";

      temps[m] = {
        actual: actualVal !== null && actualVal !== undefined ? String(actualVal) : "",
        target: targetVal !== null && targetVal !== undefined ? String(targetVal) : defaultTargetVal,
        notes: notesVal || "",
      };
    }

    const editAnnual = editedAnnualValues[ind.appraisalItemId];
    const initialSingleActual =
      editAnnual?.annualActual !== undefined && editAnnual.annualActual !== null
        ? String(editAnnual.annualActual)
        : ind.annualActual !== null && ind.annualActual !== undefined
        ? String(ind.annualActual)
        : "";

    // Pola input: jika ada overridePattern pakai itu, atau sesuaikan dengan mode
    const initialPattern: "SEKALI" | "BULANAN" =
      overridePattern ||
      (ind.annualInputMode === "ANNUAL_DIRECT" || (!hasAnyMonth && initialSingleActual !== "")
        ? "SEKALI"
        : "BULANAN");

    const aggRaw = (ind.aggregation || "AVG").toUpperCase();
    let initialAgg: "AVG" | "SUM" | "MIN" | "MAX" | "LAST_VALUE" = "AVG";
    if (aggRaw.includes("SUM")) initialAgg = "SUM";
    else if (aggRaw.includes("MIN")) initialAgg = "MIN";
    else if (aggRaw.includes("MAX")) initialAgg = "MAX";
    else if (aggRaw.includes("LAST")) initialAgg = "LAST_VALUE";

    setIsRangeGuideExpanded(false);
    setFocusedMonth(overrideMonth !== undefined ? overrideMonth : currentMonth);
    setIsModalActionsOpen(false);
    setScoreDetailMonth(null);

    const effectiveParamId = ind.parameterId ?? 0;
    const currentParamEvList = localEvidenceMap[effectiveParamId] ?? ind.evidenceList ?? [];
    const latestEv = currentParamEvList[0] || ind.latestEvidence || null;

    setAssessmentModal({
      isOpen: true,
      indicator: ind,
      categoryName,
      inputPattern: initialPattern,
      singleActualStr: initialSingleActual,
      tempValues: temps,
      aggregationMethod: initialAgg,
      targetStr: defaultTargetVal,
      comment: ind.annualNotes || ind.notes || "",
      evidenceFileName: latestEv?.fileName || null,
      evidenceUrl: latestEv?.filePath || null,
      evidenceFileType: latestEv?.fileType || null,
      evidenceId: latestEv?.id || null,
      isUploadingEvidence: false,
    });
  };

  // Tutup Modal Input Penilaian
  const handleCloseAssessmentModal = () => {
    setIsRangeGuideExpanded(false);
    setFocusedMonth(null);
    setIsModalActionsOpen(false);
    setScoreDetailMonth(null);

    setAssessmentModal({
      isOpen: false,
      indicator: null,
      categoryName: "",
      inputPattern: "BULANAN",
      singleActualStr: "",
      tempValues: {},
      aggregationMethod: "AVG",
      targetStr: "",
      comment: "",
      evidenceFileName: null,
      evidenceUrl: null,
      evidenceFileType: null,
      evidenceId: null,
      isUploadingEvidence: false,
    });
  };

  // Unggah Berkas Bukti (Evidence) dari Modal Penilaian
  const handleUploadModalEvidence = async (file: File) => {
    if (!assessmentModal.indicator || !initialDetail) return;
    const ind = assessmentModal.indicator;
    const effectiveParamId = ind.parameterId;

    if (!effectiveParamId) {
      Swal.fire({
        icon: "warning",
        title: "Parameter Belum Terhubung",
        text: "Indikator ini belum memiliki ID parameter KPI di sistem.",
      });
      return;
    }

    try {
      setAssessmentModal((prev) => ({ ...prev, isUploadingEvidence: true }));
      const formData = new FormData();
      formData.append("file", file);
      formData.append("appraisalId", String(initialDetail.appraisalId));
      formData.append("parameterId", String(effectiveParamId));
      if (focusedMonth) {
        formData.append("month", String(focusedMonth));
      }
      formData.append(
        "fileType",
        /\.(xlsx|xls|csv)$/i.test(file.name) ? "EXCEL_DATA" : "ATTACHMENT"
      );

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengunggah file bukti.");
      }

      const newEv: AppraisalEvidenceItem = data.evidence;

      setAssessmentModal((prev) => ({
        ...prev,
        evidenceFileName: newEv.fileName,
        evidenceUrl: newEv.filePath,
        evidenceFileType: newEv.fileType,
        evidenceId: newEv.id,
        isUploadingEvidence: false,
      }));

      // Update local state map secara reaktif
      setLocalEvidenceMap((prev) => {
        const curList = prev[effectiveParamId] || [];
        return {
          ...prev,
          [effectiveParamId]: [newEv, ...curList.filter((e) => e.id !== newEv.id)],
        };
      });

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: "success",
        title: "Berkas bukti berhasil diunggah!",
      });
    } catch (err: any) {
      setAssessmentModal((prev) => ({ ...prev, isUploadingEvidence: false }));
      Swal.fire({
        icon: "error",
        title: "Gagal Mengunggah Bukti",
        text: err?.message || "Terjadi kesalahan saat mengunggah berkas.",
      });
    }
  };

  // Hapus Berkas Bukti
  const handleDeleteEvidence = async (evidenceId: number) => {
    try {
      const res = await fetch(`/api/evidence/${evidenceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus file bukti.");
      }

      setLocalEvidenceMap((prev) => {
        const next = { ...prev };
        for (const pId in next) {
          next[pId] = next[pId].filter((e) => e.id !== evidenceId);
        }
        return next;
      });

      setEvidenceViewerState((prev) => ({
        ...prev,
        items: prev.items.filter((e) => e.id !== evidenceId),
      }));

      if (assessmentModal.evidenceId === evidenceId) {
        setAssessmentModal((prev) => ({
          ...prev,
          evidenceFileName: null,
          evidenceUrl: null,
          evidenceFileType: null,
          evidenceId: null,
        }));
      }

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: "success",
        title: "File bukti telah dihapus.",
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Gagal Menghapus Bukti",
        text: err?.message || "Terjadi kesalahan.",
      });
    }
  };

  // Live Input Handler untuk Nilai Bulanan di dalam Modal
  const handleAssessmentModalInputChange = (
    month: number,
    field: "actual" | "target" | "notes",
    val: string
  ) => {
    setAssessmentModal((prev) => ({
      ...prev,
      tempValues: {
        ...prev.tempValues,
        [month]: {
          ...prev.tempValues[month],
          [field]: val,
        },
      },
    }));
  };

  // Backwards compatibility aliases
  const handleOpenMonthlyModal = handleOpenAssessmentModal;
  const handleCloseMonthlyModal = handleCloseAssessmentModal;
  const handleOpenAnnualModal = handleOpenAssessmentModal;
  const handleCloseAnnualModal = handleCloseAssessmentModal;
  const handleMonthlyModalInputChange = handleAssessmentModalInputChange;

  // Export Format/Data 12 Bulan ke Excel dari dalam Modal (Siap Import Langsung)
  const handleExportMonthlyExcel = (ind: MonthlyIndicatorItem) => {
    if (!initialDetail) return;
    const wb = XLSX.utils.book_new();

    const headers = ["No Bulan", "Bulan", "Target", "Actual (Realisasi)"];
    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const rawTarget = assessmentModal.tempValues[m]?.target?.trim() ?? "";
      let numTarget: number | string = rawTarget;
      if (rawTarget !== "") {
        const sanitized = rawTarget.replace(/,/g, ".");
        const n = parseFloat(sanitized);
        if (!isNaN(n)) numTarget = n;
      }

      const rawVal = assessmentModal.tempValues[m]?.actual?.trim() ?? "";
      let numVal: number | string = rawVal;
      if (rawVal !== "") {
        const sanitized = rawVal.replace(/,/g, ".");
        const n = parseFloat(sanitized);
        if (!isNaN(n)) numVal = n;
      }
      return [
        m,
        INDONESIAN_MONTH_NAMES[i],
        numTarget === "" ? "" : numTarget,
        numVal === "" ? "" : numVal,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Realisasi");

    const safeEmpName = initialDetail.employee.name.replace(/[^a-zA-Z0-9]/g, "_");
    const safeIndCode = (ind.indicatorCode || "KPI").replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(wb, `Import_KPI_${safeIndCode}_${safeEmpName}_${currentYear}.xlsx`);
  };

  // Import File Excel Realisasi 12 Bulan ke dalam Modal
  const handleImportMonthlyExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) throw new Error("Sheet Excel tidak ditemukan.");

        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows || rows.length === 0) throw new Error("File Excel kosong.");

        const monthLookup: Record<string, number> = {
          "jan": 1, "januari": 1, "january": 1,
          "feb": 2, "februari": 2, "february": 2,
          "mar": 3, "maret": 3, "march": 3,
          "apr": 4, "april": 4,
          "mei": 5, "may": 5,
          "jun": 6, "juni": 6, "june": 6,
          "jul": 7, "juli": 7, "july": 7,
          "ags": 8, "agu": 8, "agustus": 8, "aug": 8, "august": 8,
          "sep": 9, "september": 9,
          "okt": 10, "oktober": 10, "oct": 10, "october": 10,
          "nov": 11, "november": 11,
          "des": 12, "desember": 12, "dec": 12, "december": 12,
        };

        const importedActuals: Record<number, string> = {};
        const importedTargets: Record<number, string> = {};
        let monthColIdx = -1;
        let actualColIdx = -1;
        let targetColIdx = -1;
        let headerRowIdx = -1;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] ?? "").toLowerCase().trim();
            if (cell.includes("bulan") || cell.includes("month")) {
              monthColIdx = j;
            }
            if (cell.includes("target")) {
              targetColIdx = j;
            }
            if (cell.includes("actual") || cell.includes("realisasi") || cell.includes("capaian") || cell.includes("nilai")) {
              actualColIdx = j;
            }
          }
          if (monthColIdx !== -1 && actualColIdx !== -1) {
            headerRowIdx = i;
            break;
          }
        }

        const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length === 0) continue;

          let detectedMonth: number | null = null;
          let detectedActual: string | null = null;
          let detectedTarget: string | null = null;

          if (monthColIdx !== -1 && actualColIdx !== -1) {
            const monthRaw = String(row[monthColIdx] ?? "").trim();
            const actualRaw = String(row[actualColIdx] ?? "").trim();

            const mNum = parseInt(monthRaw, 10);
            if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
              detectedMonth = mNum;
            } else {
              const lower = monthRaw.toLowerCase();
              for (const [key, val] of Object.entries(monthLookup)) {
                if (lower.startsWith(key)) {
                  detectedMonth = val;
                  break;
                }
              }
            }

            if (detectedMonth === null) {
              for (let c = 0; c < row.length; c++) {
                if (c === actualColIdx || c === targetColIdx) continue;
                const cellStr = String(row[c] ?? "").trim();
                const m = parseInt(cellStr, 10);
                if (!isNaN(m) && m >= 1 && m <= 12) {
                  detectedMonth = m;
                  break;
                }
                const lower = cellStr.toLowerCase();
                for (const [key, val] of Object.entries(monthLookup)) {
                  if (lower.startsWith(key)) {
                    detectedMonth = val;
                    break;
                  }
                }
                if (detectedMonth !== null) break;
              }
            }

            if (actualRaw !== "") {
              detectedActual = actualRaw;
            }

            if (targetColIdx !== -1) {
              const targetRaw = String(row[targetColIdx] ?? "").trim();
              if (targetRaw !== "") {
                detectedTarget = targetRaw;
              }
            }
          } else {
            for (let j = 0; j < row.length; j++) {
              const cellStr = String(row[j] ?? "").trim();
              const mNum = parseInt(cellStr, 10);
              if (!isNaN(mNum) && mNum >= 1 && mNum <= 12 && detectedMonth === null) {
                detectedMonth = mNum;
                continue;
              }
              const lower = cellStr.toLowerCase();
              for (const [key, val] of Object.entries(monthLookup)) {
                if (lower.startsWith(key) && detectedMonth === null) {
                  detectedMonth = val;
                  break;
                }
              }
            }

            for (let j = row.length - 1; j >= 0; j--) {
              const val = String(row[j] ?? "").trim();
              if (val !== "" && !isNaN(Number(val.replace(/,/g, ".")))) {
                detectedActual = val;
                break;
              }
            }
          }

          if (detectedMonth !== null && detectedActual !== null) {
            const cleaned = detectedActual.replace(/%/g, "").replace(/\s+/g, "").trim();
            importedActuals[detectedMonth] = cleaned;
          }

          if (detectedMonth !== null && detectedTarget !== null) {
            const cleanedTgt = detectedTarget.replace(/%/g, "").replace(/\s+/g, "").trim();
            importedTargets[detectedMonth] = cleanedTgt;
          }
        }

        const count = Object.keys(importedActuals).length;
        if (count === 0 && Object.keys(importedTargets).length === 0) {
          Swal.fire({
            icon: "warning",
            title: "Data Tidak Ditemukan",
            text: "Tidak dapat mengenali kolom 'Bulan' atau 'Actual (Realisasi)'. Pastikan menggunakan format template yang sesuai.",
            confirmButtonColor: "#0284c7",
          });
          return;
        }

        setAssessmentModal((prev) => {
          const nextTemp = { ...prev.tempValues };
          for (let m = 1; m <= 12; m++) {
            if (importedActuals[m] !== undefined || importedTargets[m] !== undefined) {
              nextTemp[m] = {
                ...nextTemp[m],
                ...(importedActuals[m] !== undefined ? { actual: importedActuals[m] } : {}),
                ...(importedTargets[m] !== undefined ? { target: importedTargets[m] } : {}),
              };
            }
          }
          return {
            ...prev,
            tempValues: nextTemp,
          };
        });

        const Toast = Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        });
        Toast.fire({
          icon: "success",
          title: `Berhasil import ${count} data bulan!`,
        });
      } catch (err: any) {
        Swal.fire({
          icon: "error",
          title: "Gagal Membaca Excel",
          text: err?.message || "Format file tidak didukung.",
          confirmButtonColor: "#0284c7",
        });
      } finally {
        if (e.target) {
          e.target.value = "";
        }
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Simpan Penilaian dari Unified Assessment Modal (Pola Sekali atau Bulanan)
  const handleSaveAssessmentModal = async () => {
    if (!assessmentModal.indicator || !initialDetail) return;
    const ind = assessmentModal.indicator;

    setIsSaving(true);

    try {
      // 1. Parsing target master secara defensif (mencegah crash dari .trim() pada undefined/number)
      const rawMasterTarget = String(assessmentModal.targetStr ?? "").trim();
      let parsedMasterTarget: number | null = null;
      if (rawMasterTarget !== "") {
        const sanitized = rawMasterTarget.replace(/,/g, ".");
        const num = parseFloat(sanitized);
        if (!isNaN(num)) parsedMasterTarget = num;
      } else if (ind.target !== null && ind.target !== undefined) {
        parsedMasterTarget = ind.target;
      }

      const modalComment = String(assessmentModal.comment ?? "").trim() || null;

      if (assessmentModal.inputPattern === "SEKALI") {
        const rawActual = String(assessmentModal.singleActualStr ?? "").trim();
        let parsedActual: number | null = null;
        if (rawActual !== "") {
          const sanitized = rawActual.replace(/,/g, ".");
          const num = parseFloat(sanitized);
          if (!isNaN(num)) parsedActual = num;
        }

        if (parsedActual !== null) {
          const checkScore = calculateKpiScore(parsedActual, ind.scoringRules, {
            indicatorWeight: ind.indicatorWeight,
            parameterWeight: ind.parameterWeight,
            maxScore: ind.maxScore,
            compareBasis: ind.compareBasis,
            target: parsedMasterTarget,
            direction: ind.direction,
            measurementType: ind.measurementType,
            unit: ind.unit,
          });

          if (checkScore.score === null) {
            const confirmRes = await Swal.fire({
              icon: "warning",
              title: "Nilai Tidak Cocok dengan Band",
              text: "Nilai actual yang diinput tidak cocok dengan rentang kriteria band manapun pada Master Template (skor belum terdefinisi). Tetap simpan penilaian ini?",
              showCancelButton: true,
              confirmButtonText: "Ya, Simpan",
              cancelButtonText: "Batal Periksa Kembali",
              confirmButtonColor: "#2563eb",
              cancelButtonColor: "#64748b",
            });
            if (!confirmRes.isConfirmed) {
              return; // finally block will ensure setIsSaving(false)
            }
          }
        }

        // Update state lokal secara reaktif & responsif
        setEditedAnnualValues((prev) => ({
          ...prev,
          [ind.appraisalItemId]: {
            annualActual: parsedActual,
            target: parsedMasterTarget,
            notes: modalComment,
            mode: "ANNUAL_DIRECT",
          },
        }));

        handleCloseAssessmentModal();

        const res = await saveIndicatorAnnualActualAction({
          appraisalId: initialDetail.appraisalId,
          appraisalItemId: ind.appraisalItemId,
          annualActual: parsedActual,
          target: parsedMasterTarget,
          notes: modalComment,
          actor: currentUser?.name || "Penilai",
        });

        if (res.success) {
          const Toast = Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 2200,
            timerProgressBar: true,
          });
          Toast.fire({
            icon: "success",
            title: `Penilaian "${ind.indicatorName}" berhasil disimpan!`,
          });
          router.refresh();
        } else {
          Swal.fire({
            icon: "warning",
            title: "Tersimpan di Layar",
            text: res.error || "Data aktif di layar, sinkronisasi server sedang berlangsung.",
          });
        }
      } else {
        // BULANAN
        const updatesForState: Record<string, { actualValue: number | null; target?: number | null; notes: string | null }> = {};
        const valuesToSave: { month: number; actualValue: number | null; notes: string | null; target?: number | null }[] = [];
        const validActuals: number[] = [];

        for (let m = 1; m <= 12; m++) {
          const raw = String(assessmentModal.tempValues[m]?.actual ?? "").trim();
          let parsedVal: number | null = null;
          if (raw !== "") {
            const sanitized = raw.replace(/,/g, ".");
            const num = parseFloat(sanitized);
            if (!isNaN(num)) {
              parsedVal = num;
              validActuals.push(num);
            }
          }

          const rawRowTarget = String(assessmentModal.tempValues[m]?.target ?? "").trim();
          let parsedRowTarget: number | null = null;
          if (rawRowTarget !== "") {
            const sanitized = rawRowTarget.replace(/,/g, ".");
            const num = parseFloat(sanitized);
            if (!isNaN(num)) {
              parsedRowTarget = num;
            }
          } else if (parsedMasterTarget !== null) {
            parsedRowTarget = parsedMasterTarget;
          }

          const notesVal = String(assessmentModal.tempValues[m]?.notes ?? "").trim() || null;
          const key = `${ind.appraisalItemId}_${m}`;
          updatesForState[key] = {
            actualValue: parsedVal,
            target: parsedRowTarget,
            notes: notesVal,
          };
          valuesToSave.push({
            month: m,
            actualValue: parsedVal,
            notes: notesVal,
            target: parsedRowTarget,
          });
        }

        let aggregatedActual: number | null = null;
        if (validActuals.length > 0) {
          const method = assessmentModal.aggregationMethod;
          if (method === "SUM") {
            aggregatedActual = validActuals.reduce((a, b) => a + b, 0);
          } else if (method === "MIN") {
            aggregatedActual = Math.min(...validActuals);
          } else if (method === "MAX") {
            aggregatedActual = Math.max(...validActuals);
          } else if (method === "LAST_VALUE") {
            aggregatedActual = validActuals[validActuals.length - 1];
          } else {
            // AVG
            aggregatedActual = parseFloat((validActuals.reduce((a, b) => a + b, 0) / validActuals.length).toFixed(2));
          }
        }

        const lastValidTarget = valuesToSave.find((v) => v.target !== null && v.target !== undefined)?.target ?? parsedMasterTarget;

        if (aggregatedActual !== null) {
          const checkScore = calculateKpiScore(aggregatedActual, ind.scoringRules, {
            indicatorWeight: ind.indicatorWeight,
            parameterWeight: ind.parameterWeight,
            maxScore: ind.maxScore,
            compareBasis: ind.compareBasis,
            target: lastValidTarget ?? parsedMasterTarget,
            direction: ind.direction,
            measurementType: ind.measurementType,
            unit: ind.unit,
          });

          if (checkScore.score === null) {
            const confirmRes = await Swal.fire({
              icon: "warning",
              title: "Nilai Tidak Cocok dengan Band",
              text: "Hasil agregasi actual bulanan tidak cocok dengan rentang kriteria band manapun pada Master Template (skor belum terdefinisi). Tetap simpan penilaian ini?",
              showCancelButton: true,
              confirmButtonText: "Ya, Simpan",
              cancelButtonText: "Batal Periksa Kembali",
              confirmButtonColor: "#2563eb",
              cancelButtonColor: "#64748b",
            });
            if (!confirmRes.isConfirmed) {
              return; // finally block will ensure setIsSaving(false)
            }
          }
        }

        // Update state lokal secara reaktif & responsif
        setEditedValues((prev) => ({
          ...prev,
          ...updatesForState,
        }));

        setEditedAnnualValues((prev) => ({
          ...prev,
          [ind.appraisalItemId]: {
            annualActual: aggregatedActual,
            target: lastValidTarget ?? ind.target ?? null,
            notes: modalComment,
            mode: "MONTHLY",
          },
        }));

        handleCloseAssessmentModal();

        // Simpan secara atomik dalam 1 server action call (menghindari lock contention / hang dari Promise.all 12x)
        const res = await saveIndicatorMonthlyValuesAction({
          appraisalId: initialDetail.appraisalId,
          appraisalItemId: ind.appraisalItemId,
          values: valuesToSave,
          aggregationMethod: assessmentModal.aggregationMethod,
          notes: modalComment,
          actor: currentUser?.name || "Penilai",
        });

        if (res.success) {
          const Toast = Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 2200,
            timerProgressBar: true,
          });
          Toast.fire({
            icon: "success",
            title: `Realisasi bulanan "${ind.indicatorName}" berhasil disimpan!`,
          });
          router.refresh();
        } else {
          Swal.fire({
            icon: "warning",
            title: "Tersimpan di Layar",
            text: res.error || "Data aktif terhitung di layar, sinkronisasi server sedang berlangsung.",
          });
        }
      }
    } catch (err: any) {
      console.error("[handleSaveAssessmentModal] Error:", err);
      Swal.fire({
        icon: "error",
        title: "Gagal Menyimpan",
        text: err?.message || "Terjadi kendala saat menyimpan penilaian.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMonthlyModal = handleSaveAssessmentModal;
  const handleSaveAnnualModal = handleSaveAssessmentModal;

  // Status appraisal dan jenjang tahapan saat ini
  const currentAppraisalStatus = (
    initialDetail?.appraisalStatus ||
    currentEmp?.appraisalStatus ||
    "DRAFT"
  ).toUpperCase();

  const approvalLine = initialDetail?.approvalLine;

  const appraiserName = useMemo(() => {
    if (approvalLine?.appraiser?.name) {
      return approvalLine.appraiser.name;
    }
    for (const cat of initialDetail?.categories || []) {
      for (const ind of cat.indicators) {
        if (ind.assignedAssessors && ind.assignedAssessors.length > 0) {
          return ind.assignedAssessors[0].name;
        }
      }
    }
    return "Atasan Langsung";
  }, [approvalLine, initialDetail?.categories]);

  const currentStage = (
    initialDetail?.currentStage ||
    (currentAppraisalStatus === "FINAL"
      ? "FINAL"
      : currentAppraisalStatus === "PENDING_HR" || currentAppraisalStatus === "REVIEWED"
      ? "HR"
      : currentAppraisalStatus === "PENDING_MANAGER" || currentAppraisalStatus === "REVISED_MGR"
      ? "MANAGER"
      : currentAppraisalStatus === "PENDING_HEAD_DEPT" || currentAppraisalStatus === "SUBMITTED" || currentAppraisalStatus === "REVISED_HEAD"
      ? "HEAD_DEPT"
      : "PENILAI")
  ).toUpperCase();

  const isRevised =
    currentAppraisalStatus === "REVISED_PENILAI" ||
    currentAppraisalStatus === "REVISED_HEAD" ||
    currentAppraisalStatus === "REVISED_MGR";

  // Staging Pipeline: Draft -> Waiting Approval -> Approved
  const isApproved = currentAppraisalStatus === "FINAL";
  const isWaitingApproval =
    !isApproved &&
    (currentAppraisalStatus === "SUBMITTED" ||
      currentAppraisalStatus === "PENDING_HEAD_DEPT" ||
      currentAppraisalStatus === "REVISED_HEAD" ||
      currentAppraisalStatus === "PENDING_MANAGER" ||
      currentAppraisalStatus === "REVISED_MGR" ||
      currentAppraisalStatus === "PENDING_HR" ||
      currentAppraisalStatus === "REVIEWED" ||
      currentStage === "HEAD_DEPT" ||
      currentStage === "MANAGER" ||
      currentStage === "HR");
  const isDraft = !isApproved && !isWaitingApproval;

  const isDraftDone = !isDraft;
  const isWaitingApprovalDone = isApproved;

  const waitingApprovalSubtext =
    currentStage === "HR" || currentAppraisalStatus === "PENDING_HR" || currentAppraisalStatus === "REVIEWED"
      ? "HR"
      : currentStage === "MANAGER" || currentAppraisalStatus === "PENDING_MANAGER" || currentAppraisalStatus === "REVISED_MGR"
      ? "Manager"
      : "Head Dept";

  // normalizedRole declared at top
  // isGlobalAdmin declared at top
  const isHrUser = isGlobalAdmin || normalizedRole === "HR";
  const isManagerUser =
    isGlobalAdmin ||
    normalizedRole === "MANAGER" ||
    Boolean(currentUser?.id && approvalLine?.manager?.id === currentUser.id);
  const isHeadDeptUser =
    isGlobalAdmin ||
    normalizedRole === "HEAD_DEPT" ||
    Boolean(currentUser?.id && approvalLine?.headDept?.id === currentUser.id);
  const isPenilaiUser =
    isGlobalAdmin ||
    normalizedRole === "PENILAI" ||
    Boolean(currentUser?.id && approvalLine?.appraiser?.id === currentUser.id);

  const isFormEditable =
    isGlobalAdmin ||
    (currentStage === "PENILAI" &&
      (currentAppraisalStatus === "DRAFT" || currentAppraisalStatus === "REVISED_PENILAI"));

  // Apakah user saat ini berhak mengirim penilaian (sesuai assignment Master Template atau Admin)
  const canSubmitMyAssessment =
    isGlobalAdmin || Boolean(initialDetail?.myAssessmentStatus?.isAssigned);

  // Status Siklus Hidup Penilaian Komprehensif:
  // Draft -> Submitted -> Under Review -> Revision -> Approved -> Finalized
  const lifecycleStatus = useMemo(() => {
    if (currentAppraisalStatus === "FINAL") {
      return {
        key: "FINALIZED" as const,
        label: "Finalized",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
        dotClass: "bg-emerald-600",
        description: "Penilaian telah disahkan secara resmi oleh HR dan berstatus final.",
      };
    }
    if (currentAppraisalStatus === "APPROVED") {
      return {
        key: "APPROVED" as const,
        label: "Approved",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dotClass: "bg-emerald-500",
        description: "Penilaian telah disetujui dan menunggu penerbitan dokumen final.",
      };
    }
    if (
      isRevised ||
      currentAppraisalStatus.startsWith("REVISED") ||
      Boolean(initialDetail?.myAssessmentStatus?.hasRevisionPending)
    ) {
      return {
        key: "REVISION" as const,
        label: "Revision",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
        dotClass: "bg-rose-500 animate-pulse",
        description: `Penilaian dikembalikan untuk diperbaiki/direvisi (${currentStage}).`,
      };
    }
    if (
      currentAppraisalStatus === "PENDING_HEAD_DEPT" ||
      currentAppraisalStatus === "PENDING_MANAGER" ||
      currentAppraisalStatus === "PENDING_HR" ||
      currentAppraisalStatus === "REVIEWED" ||
      currentStage === "HEAD_DEPT" ||
      currentStage === "MANAGER" ||
      currentStage === "HR"
    ) {
      const stageName =
        currentStage === "HR" || currentAppraisalStatus === "PENDING_HR" || currentAppraisalStatus === "REVIEWED"
          ? "HR"
          : currentStage === "MANAGER" || currentAppraisalStatus === "PENDING_MANAGER"
          ? "Manager"
          : "Head Dept";
      return {
        key: "UNDER_REVIEW" as const,
        label: `Under Review (${stageName})`,
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-500 animate-pulse",
        description: `Penilaian sedang dalam tahapan review & validasi oleh ${stageName}.`,
      };
    }
    if (
      Boolean(initialDetail?.myAssessmentStatus?.isSubmitted) ||
      currentAppraisalStatus === "SUBMITTED" ||
      Boolean(initialDetail?.assessorProgress && initialDetail.assessorProgress.some((p) => p.isSubmitted))
    ) {
      return {
        key: "SUBMITTED" as const,
        label: "Submitted",
        badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
        dotClass: "bg-sky-500",
        description: "Penilaian telah dikirim oleh penilai dan terkunci.",
      };
    }
    return {
      key: "DRAFT" as const,
      label: "Draft",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      dotClass: "bg-slate-400",
      description: "Penilaian masih dalam tahap pengisian (draft).",
    };
  }, [
    currentAppraisalStatus,
    currentStage,
    isRevised,
    initialDetail?.myAssessmentStatus,
    initialDetail?.assessorProgress,
  ]);

  // Handler: Kirim Penilaian Saya (Validasi Kelengkapan, Kunci, dan Teruskan jika Lengkap)
  const handleSubmitMyAssessment = async () => {
    if (!initialDetail) return;

    // 1. Client-Side Automatic Validation: cek seluruh poin sebelum memicu modal konfirmasi
    if (unfilledPoints.length > 0) {
      setValidationAttempted(true);
      setTimeout(() => {
        const banner = document.getElementById("validation-unfilled-banner");
        if (banner) {
          banner.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
      return;
    }

    // 2. Jika semua poin sudah terisi lengkap, lanjutkan proses pengiriman dan tampilkan modal konfirmasi
    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";
    const myStatus = initialDetail.myAssessmentStatus;
    const isRevision = Boolean(myStatus?.hasRevisionPending);
    const catNames = myStatus?.assignedCategoryNames?.join(", ") || "parameter tugas Anda";

    const confirmRes = await Swal.fire({
      title: isRevision ? "Kirim Ulang Revisi Saya?" : "Kirim Penilaian Saya?",
      html: `
        <div class="text-left text-xs text-slate-600 space-y-2">
          <p>Anda akan mengirimkan hasil penilaian untuk <strong>${empName}</strong>.</p>
          <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="font-bold text-slate-800 block mb-1">Parameter Tugas Anda:</span>
            <span class="text-slate-600">${catNames}</span>
          </div>
          <p class="text-[11px] text-slate-500">
            Setelah dikirim, nilai parameter tugas Anda akan dikunci. Pastikan seluruh indikator telah terisi dengan benar.
          </p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: isRevision ? "Ya, Kirim Revisi" : "Ya, Kirim Penilaian Saya",
      cancelButtonText: "Batal Periksa Kembali",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
    });

    if (!confirmRes.isConfirmed) return;

    setIsSubmittingMyAssessment(true);
    try {
      const res = await submitMyAssessmentAction({
        appraisalId: initialDetail.appraisalId,
        month: currentMonth,
      });

      if (!res.success) {
        if (res.unfilledIndicators && res.unfilledIndicators.length > 0) {
          // Tampilkan pesan validasi langsung di dalam form tanpa browser alert / popup
          setValidationAttempted(true);
          setTimeout(() => {
            const banner = document.getElementById("validation-unfilled-banner");
            if (banner) {
              banner.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 50);
        } else {
          await Swal.fire({
            icon: "error",
            title: "Gagal Mengirim Penilaian",
            text: res.error || "Terjadi kendala saat mengirim penilaian.",
          });
        }
        return;
      }

      if (res.isAllSubmitted) {
        await Swal.fire({
          icon: "success",
          title: "Penilaian Berhasil Dikirim!",
          html: `
            <div class="text-left text-xs text-slate-600 space-y-2">
              <p class="font-semibold text-emerald-800">
                Seluruh penilai telah menyelesaikan tugas penilaiannya.
              </p>
              <p>
                Berkas penilaian untuk <strong>${empName}</strong> otomatis diteruskan ke tahap review <strong>Head Dept</strong> untuk proses verifikasi.
              </p>
            </div>
          `,
          confirmButtonText: "OK, Mengerti",
          confirmButtonColor: "#059669",
        });
      } else {
        await Swal.fire({
          icon: "success",
          title: "Penilaian Anda Berhasil Dikirim!",
          html: `
            <div class="text-left text-xs text-slate-600 space-y-2">
              <p class="font-semibold text-emerald-800">
                Penilaian untuk parameter tugas Anda telah tersimpan dan dikunci.
              </p>
              <p>
                ${res.message || "Penilai lain dapat melanjutkan pengisian parameter masing-masing secara paralel tanpa harus menunggu."}
              </p>
            </div>
          `,
          confirmButtonText: "OK, Mengerti",
          confirmButtonColor: "#2563eb",
        });
      }

      router.refresh();
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Gagal Mengirim",
        text: err?.message || "Terjadi kesalahan pada sistem.",
      });
    } finally {
      setIsSubmittingMyAssessment(false);
    }
  };

  // Simpan Seluruh Draft Penilaian
  const handleSaveDraftAll = async () => {
    if (!initialDetail) return;
    setIsSaving(true);
    try {
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: "success",
        title: "Draft Penilaian Tersimpan Aman",
        text: "Seluruh data pengisian nilai KPI telah tersimpan sebagai draft.",
      });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Submit ke Head Dept (oleh Penilai)
  const handleSubmitToHeadDept = async () => {
    if (!initialDetail) return;
    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";
    const headName = approvalLine?.headDept?.name || "Head Department";

    const { value: notes, isConfirmed } = await Swal.fire({
      title: "Ajukan ke Head Dept?",
      text: `Pengajuan KPI untuk "${empName}" akan dikirimkan ke ${headName} untuk proses validasi.`,
      icon: "question",
      input: "textarea",
      inputPlaceholder: "Catatan pengajuan untuk Head Dept (opsional)...",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Ajukan ke Head Dept",
      cancelButtonText: "Batal",
    });

    if (!isConfirmed) return;

    setIsSubmitting(true);
    try {
      const res = await submitAppraisalToHeadDeptAction({
        appraisalId: initialDetail.appraisalId,
        notes: notes || undefined,
        actor: {
          id: currentUser?.id ?? null,
          name: currentUser?.name || "Penilai",
          role: userRole,
        },
      });

      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: "Berhasil Diajukan!",
          text: res.message || `Penilaian berhasil diajukan ke ${headName}.`,
          confirmButtonColor: "#0284c7",
          timer: 2000,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Mengajukan",
          text: res.error || "Terjadi kesalahan sistem.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Validasi oleh Head Dept (Forward ke Manager atau Kembalikan ke Penilai)
  const handleHeadDeptValidate = async (action: "FORWARD" | "REVISE") => {
    if (!initialDetail) return;
    const isForward = action === "FORWARD";
    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";
    const mgrName = approvalLine?.manager?.name || "Manager";

    let notes = "";
    if (isForward) {
      const { isConfirmed, value } = await Swal.fire({
        title: "Validasi & Teruskan ke Manager?",
        text: `Penilaian "${empName}" akan disetujui di tingkat Head Dept dan diteruskan ke ${mgrName}.`,
        icon: "question",
        input: "textarea",
        inputPlaceholder: "Catatan untuk Manager (opsional)...",
        showCancelButton: true,
        confirmButtonColor: "#059669",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Teruskan ke Manager",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    } else {
      const { isConfirmed, value } = await Swal.fire({
        title: "Kembalikan ke Penilai untuk Revisi?",
        text: `Penilaian "${empName}" akan dikembalikan ke Penilai (struktur 1 tingkat sebelumnya) agar diperbaiki.`,
        icon: "warning",
        input: "textarea",
        inputPlaceholder: "Tuliskan alasan / catatan bagian yang perlu direvisi (wajib)...",
        inputValidator: (val) => (!val?.trim() ? "Catatan revisi wajib diisi agar Penilai memahami koreksi." : null),
        showCancelButton: true,
        confirmButtonColor: "#d97706",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Kembalikan ke Penilai",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    }

    setIsSubmitting(true);
    try {
      const res = await validateAppraisalByHeadDeptAction({
        appraisalId: initialDetail.appraisalId,
        action,
        notes,
        actor: {
          id: currentUser?.id ?? null,
          name: currentUser?.name || "Head Dept",
          role: userRole,
        },
      });

      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: isForward ? "Berhasil Diteruskan!" : "Dikembalikan untuk Revisi",
          text: res.message,
          confirmButtonColor: isForward ? "#059669" : "#d97706",
          timer: 2000,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memproses",
          text: res.error || "Terjadi kesalahan.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Validasi oleh Manager (Forward ke HR atau Kembalikan ke Head Dept)
  const handleManagerValidate = async (action: "FORWARD" | "REVISE") => {
    if (!initialDetail) return;
    const isForward = action === "FORWARD";
    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";

    let notes = "";
    if (isForward) {
      const { isConfirmed, value } = await Swal.fire({
        title: "Validasi & Teruskan ke HR?",
        text: `Penilaian "${empName}" akan disetujui di tingkat Manager dan diteruskan ke Tim HR untuk finalisasi.`,
        icon: "question",
        input: "textarea",
        inputPlaceholder: "Catatan untuk HR (opsional)...",
        showCancelButton: true,
        confirmButtonColor: "#059669",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Teruskan ke HR",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    } else {
      const { isConfirmed, value } = await Swal.fire({
        title: "Kembalikan ke Head Dept?",
        text: `Penilaian "${empName}" akan dikembalikan ke Head Dept (struktur 1 tingkat sebelumnya) untuk peninjauan ulang.`,
        icon: "warning",
        input: "textarea",
        inputPlaceholder: "Tuliskan alasan pengembalian ke Head Dept (wajib)...",
        inputValidator: (val) => (!val?.trim() ? "Alasan pengembalian wajib diisi." : null),
        showCancelButton: true,
        confirmButtonColor: "#d97706",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Kembalikan ke Head Dept",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    }

    setIsSubmitting(true);
    try {
      const res = await validateAppraisalByManagerAction({
        appraisalId: initialDetail.appraisalId,
        action,
        notes,
        actor: {
          id: currentUser?.id ?? null,
          name: currentUser?.name || "Manager",
          role: userRole,
        },
      });

      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: isForward ? "Berhasil Diteruskan ke HR!" : "Dikembalikan ke Head Dept",
          text: res.message,
          confirmButtonColor: isForward ? "#059669" : "#d97706",
          timer: 2000,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memproses",
          text: res.error || "Terjadi kesalahan.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Finalisasi oleh HR (Approve Final atau Kembalikan ke Manager)
  const handleHrApprove = async (action: "APPROVE" | "REVISE") => {
    if (!initialDetail) return;
    const isApprove = action === "APPROVE";
    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";

    let notes = "";
    if (isApprove) {
      const { isConfirmed, value } = await Swal.fire({
        title: "Setujui & Finalisasi Nilai KPI?",
        text: `Nilai KPI "${empName}" akan disahkan secara resmi sebagai skor FINAL. Status dokumen akan dikunci resmi.`,
        icon: "question",
        input: "textarea",
        inputPlaceholder: "Catatan persetujuan HR (opsional)...",
        showCancelButton: true,
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Setujui & Finalisasi",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    } else {
      const { isConfirmed, value } = await Swal.fire({
        title: "Kembalikan ke Manager untuk Revisi?",
        text: `Penilaian "${empName}" akan dikembalikan ke Manager (struktur 1 tingkat sebelumnya) untuk dikaji ulang.`,
        icon: "warning",
        input: "textarea",
        inputPlaceholder: "Tuliskan catatan evaluasi HR untuk Manager (wajib)...",
        inputValidator: (val) => (!val?.trim() ? "Alasan evaluasi wajib diisi." : null),
        showCancelButton: true,
        confirmButtonColor: "#d97706",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Kembalikan ke Manager",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      notes = value || "";
    }

    setIsSubmitting(true);
    try {
      const res = await approveAppraisalByHrAction({
        appraisalId: initialDetail.appraisalId,
        action,
        notes,
        actor: {
          id: currentUser?.id ?? null,
          name: currentUser?.name || "HR Department",
          role: userRole,
        },
      });

      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: isApprove ? "KPI Resmi Difinalisasi!" : "Dikembalikan ke Manager",
          text: res.message,
          confirmButtonColor: isApprove ? "#4f46e5" : "#d97706",
          timer: 2000,
        });
        router.refresh();
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Memproses",
          text: res.error || "Terjadi kesalahan.",
          confirmButtonColor: "#0284c7",
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err instanceof Error ? err.message : "Terjadi kesalahan.",
        confirmButtonColor: "#0284c7",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAll = handleSubmitToHeadDept;

  // Sinkronkan Dokumen Penilaian Karyawan ini dengan Master Template Terbaru
  const handleSyncFromMasterTemplate = async () => {
    setIsActionsMenuOpen(false);
    if (!initialDetail?.appraisalId) return;

    const empName = initialDetail.employee.name || currentEmp?.name || "Karyawan";

    const confirmRes = await Swal.fire({
      title: "Update dari Master Template?",
      html: `
        <div class="text-left text-xs text-slate-600 space-y-2">
          <p>Dokumen penilaian untuk <strong>${empName}</strong> akan diperbarui mengikuti kriteria penilaian, skor band, dan bobot terbaru dari Master Template.</p>
          <div class="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-indigo-900 space-y-1">
            <span class="font-bold block">Pembaruan yang diterapkan:</span>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>Kriteria &amp; skor band penilaian terbaru (scoring rules snapshot)</li>
              <li>Target, satuan, dan pembobotan parameter terbaru</li>
              <li>Rekalkulasi skor &amp; capaian otomatis</li>
            </ul>
          </div>
          <p class="text-[11px] text-slate-500 italic">
            *Nilai aktual bulanan yang telah diisi tetap aman dan tidak akan hilang.
          </p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Update Sekarang",
      cancelButtonText: "Batal",
      confirmButtonColor: "#4f46e5",
      cancelButtonColor: "#64748b",
    });

    if (!confirmRes.isConfirmed) return;

    setIsSaving(true);
    try {
      const res = await syncAppraisalWithTemplateAction(initialDetail.appraisalId);
      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: "Berhasil Diperbarui!",
          text: res.message || "Form penilaian berhasil diperbarui sesuai Master Template terbaru.",
          confirmButtonColor: "#4f46e5",
        });
        router.refresh();
      } else {
        await Swal.fire({
          icon: "error",
          title: "Gagal Memperbarui",
          text: res.error || "Terjadi kesalahan saat menyinkronkan data.",
          confirmButtonColor: "#4f46e5",
        });
      }
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err?.message || "Terjadi kesalahan koneksi atau server.",
        confirmButtonColor: "#4f46e5",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers Download Penilaian (Excel / PDF)
  const handleDownloadEvaluationExcel = () => {
    const emp = initialDetail?.employee || currentEmp;
    exportEvaluationResultExcel({
      employee: {
        name: emp?.name || "Karyawan",
        nik: emp?.nik || "-",
        jobPosition: emp?.jobPosition || "-",
        departmentName: emp?.departmentName || "-",
        templateName: activeTemplateName || "-",
      },
      period: {
        year: currentYear,
        name: initialDetail?.period?.name || `Tahun ${currentYear}`,
      },
      summary: {
        overallScoreDisplay: liveAnnualOverall.overallScoreDisplay,
        grade: liveAnnualOverall.grade,
      },
      categories: liveCategories,
      approvalLine: approvalLine || undefined,
    });
  };

  const handleDownloadEvaluationPdf = () => {
    const emp = initialDetail?.employee || currentEmp;
    downloadEvaluationPdf({
      employee: {
        name: emp?.name || "Karyawan",
        nik: emp?.nik || "-",
        jobPosition: emp?.jobPosition || "-",
        departmentName: emp?.departmentName || "-",
        templateName: activeTemplateName || "-",
      },
      period: {
        year: currentYear,
        name: initialDetail?.period?.name || `Tahun ${currentYear}`,
      },
      summary: {
        overallScoreDisplay: liveAnnualOverall.overallScoreDisplay,
        grade: liveAnnualOverall.grade,
      },
      categories: liveCategories,
      approvalLine: approvalLine || undefined,
    });
  };

  // Status Badge Helper
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Completed
          </span>
        );
      case "In Progress":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            In Progress
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen pb-12 text-slate-800 antialiased">
      {/* ================================================== */}
      {/* 1. HEADER: TOMBOL KEMBALI & JUDUL FORMULIR PENILAIAN */}
      {/* ================================================== */}
      <div className="relative mb-4 flex items-center justify-center min-h-[40px]">
        {/* Tombol Back di Kiri */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <Link
            href={`/input-kpi?year=${currentYear}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-all active:scale-95 group cursor-pointer"
            title="Kembali ke Daftar Karyawan"
            aria-label="Kembali ke Daftar Karyawan"
          >
            <svg
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Kembali</span>
          </Link>
        </div>

        {/* Judul Formulir di Tengah */}
        <div className="text-center">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
            Formulir Penilaian KPI
          </h1>
          <span className="text-[11px] font-medium text-slate-500 block -mt-0.5 tracking-wide">
            Periode {currentYear}
          </span>
        </div>
      </div>

      {/* ================================================== */}
      {/* 2. EMPLOYEE & ASSESSMENT SUMMARY (HORIZONTAL)      */}
      {/* ================================================== */}
      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-3 items-center">
          {/* 1. Nama Karyawan */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Nama Karyawan
            </span>
            <span
              className="mt-0.5 block text-xs sm:text-sm font-semibold text-slate-800 truncate"
              title={initialDetail?.employee.name || currentEmp?.name || "-"}
            >
              {initialDetail?.employee.name || currentEmp?.name || "-"}
            </span>
          </div>

          {/* 2. Departemen */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Departemen
            </span>
            <span
              className="mt-0.5 block text-xs sm:text-sm font-medium text-slate-700 truncate"
              title={initialDetail?.employee.departmentName || currentEmp?.departmentName || "-"}
            >
              {initialDetail?.employee.departmentName || currentEmp?.departmentName || "-"}
            </span>
          </div>

          {/* 3. Jabatan */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Jabatan
            </span>
            <span
              className="mt-0.5 block text-xs sm:text-sm font-medium text-slate-700 truncate"
              title={initialDetail?.employee.jobPosition || currentEmp?.jobPosition || "-"}
            >
              {initialDetail?.employee.jobPosition || currentEmp?.jobPosition || "-"}
            </span>
          </div>

          {/* 4. Penilai */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Penilai
            </span>
            <span
              className="mt-0.5 block text-xs sm:text-sm font-medium text-slate-700 truncate"
              title={appraiserName}
            >
              {appraiserName}
            </span>
          </div>

          {/* 5. Total Skor */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Total Skor
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-xs sm:text-sm font-bold text-emerald-700">
                {liveAnnualOverall.overallScoreDisplay}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600">
                ({liveAnnualOverall.grade})
              </span>
            </div>
          </div>

          {/* 6. Progress */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Progress
            </span>
            <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800 truncate">
              {overallProgressParameters} Parameter
            </div>
          </div>

          {/* 7. Status */}
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Status
            </span>
            <div className="mt-0.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${lifecycleStatus.badgeClass}`}
                title={lifecycleStatus.description}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${lifecycleStatus.dotClass}`} />
                <span className="truncate">{lifecycleStatus.label}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* 2B. BANNER PERMINTAAN REVISI (Jika Ada)            */}
      {/* ================================================== */}
      {(isRevised || Boolean(initialDetail?.rejectionReason)) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-md bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  Status: Perlu Revisi ({currentStage})
                </span>
                <span className="text-[11px] text-amber-700 font-medium">
                  Dokumen dikembalikan 1 tingkat ke struktur sebelumnya
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-amber-900">
                "{initialDetail?.rejectionReason || "Mohon periksa kembali catatan dan nilai realisasi indikator terkait."}"
              </p>
              <span className="mt-1 block text-[11px] text-amber-700/80">
                Silakan lakukan koreksi pada nilai indikator di bawah, kemudian ajukan kembali untuk melanjutkan alur persetujuan.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 3. ACTION BAR                                      */}
      {/* ================================================== */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          <span className="text-xs font-semibold text-slate-700">
            Tabel Penilaian KPI
          </span>
        </div>

        {/* Action Buttons: Dropdown Actions (View, Upload) dan Kirim Penilaian Saya */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Dropdown Menu Actions (View, Upload) */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              type="button"
              onClick={() => setIsActionsMenuOpen((prev) => !prev)}
              aria-expanded={isActionsMenuOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95 cursor-pointer"
              title="Menu Aksi: View Form Hasil & Upload Penilaian Excel"
            >
              <SlidersHorizontal className="h-4 w-4 text-slate-600" />
              <span>Actions</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                  isActionsMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isActionsMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-30 transition-all animate-in fade-in zoom-in-95 duration-150"
              >
                {/* Aksi 1: View Form Hasil */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsActionsMenuOpen(false);
                    setIsResultModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition text-left cursor-pointer"
                >
                  <Eye className="h-4 w-4 text-slate-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">View Form Hasil</span>
                    <span className="text-[10px] text-slate-500">Formulir evaluasi & hasil akhir</span>
                  </div>
                </button>

                {/* Aksi 2: Upload Penilaian Excel */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsActionsMenuOpen(false);
                    setIsBatchExcelModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-sky-50 hover:text-sky-900 transition text-left cursor-pointer mt-0.5"
                >
                  <FileSpreadsheet className="h-4 w-4 text-sky-600 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Upload Penilaian Excel</span>
                    <span className="text-[10px] text-slate-500">Import berkas Excel KPI</span>
                  </div>
                </button>

                {/* Aksi 3: Update dari Master Template */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSyncFromMasterTemplate}
                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition text-left cursor-pointer mt-1 border-t border-slate-100 pt-2"
                >
                  <RefreshCw className="h-4 w-4 text-indigo-600 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Update dari Master Template</span>
                    <span className="text-[10px] text-slate-500">Sinkronkan kriteria, skor &amp; bobot terbaru</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Tombol Kirim Penilaian Saya (Warna Biru sebagai Aksen Utama) */}
          {canSubmitMyAssessment && currentStage === "PENILAI" && (
            initialDetail?.myAssessmentStatus?.hasRevisionPending ? (
              <button
                type="button"
                disabled={isSubmittingMyAssessment}
                onClick={handleSubmitMyAssessment}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                title="Kirim ulang nilai parameter tugas Anda yang telah direvisi"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{isSubmittingMyAssessment ? "Mengirim..." : "Kirim Ulang Revisi Saya"}</span>
              </button>
            ) : initialDetail?.myAssessmentStatus?.isSubmitted ? (
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition cursor-pointer"
                title="Penilaian Anda telah dikirim dan terkunci. Klik untuk melihat detail audit."
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Penilaian Saya Terkirim ✓</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {validationAttempted && unfilledPoints.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-2xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>{unfilledPoints.length} Poin Belum Lengkap</span>
                  </span>
                )}
                <button
                  type="button"
                  disabled={isSubmittingMyAssessment || !isFormEditable}
                  onClick={handleSubmitMyAssessment}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 ${
                    validationAttempted && unfilledPoints.length > 0
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  title="Validasi kelengkapan dan kirim penilaian parameter tugas Anda"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSubmittingMyAssessment ? "Memvalidasi & Mengirim..." : "Kirim Penilaian Saya"}</span>
                </button>
              </div>
            )
          )}

          {/* Contextual Hierarchy Approval Actions */}
          {currentStage === "PENILAI" && !canSubmitMyAssessment && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Tahap: Pengisian Penilai
            </span>
          )}

          {currentStage === "HEAD_DEPT" && (
            isHeadDeptUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleHeadDeptValidate("REVISE")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Kembalikan dokumen penilaian ke Penilai untuk direvisi"
                >
                  <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <span>Minta Revisi ke Penilai</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleHeadDeptValidate("FORWARD")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Validasi penilaian dan teruskan ke Manager"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{isSubmitting ? "Memproses..." : "Validasi & Teruskan ke Manager"}</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Menunggu Review Head Dept
              </span>
            )
          )}

          {currentStage === "MANAGER" && (
            isManagerUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleManagerValidate("REVISE")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Kembalikan ke Head Dept (struktur 1 tingkat sebelumnya)"
                >
                  <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <span>Kembalikan ke Head Dept</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleManagerValidate("FORWARD")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Validasi manajerial dan teruskan ke HR"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{isSubmitting ? "Memproses..." : "Validasi & Teruskan ke HR"}</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Menunggu Validasi Manager
              </span>
            )
          )}

          {currentStage === "HR" && (
            isHrUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleHrApprove("REVISE")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Kembalikan ke Manager (struktur 1 tingkat sebelumnya)"
                >
                  <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <span>Kembalikan ke Manager</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving || isSubmitting}
                  onClick={() => handleHrApprove("APPROVE")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-60"
                  title="Setujui dan sahkan nilai KPI secara resmi"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{isSubmitting ? "Memproses..." : "Setujui & Finalisasi (HR)"}</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                Menunggu Approval HR
              </span>
            )
          )}

          {currentStage === "FINAL" && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Disetujui & Final (Selesai)</span>
            </span>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* 4. DAFTAR PARAMETER ACCORDION (UNIFIED SPREADSHEET) */}
      {/* ================================================== */}
      <section className="mb-8 space-y-3">
        {/* ========================================================= */}
        {/* INLINE VALIDATION BANNER: PENILAIAN BELUM LENGKAP        */}
        {/* ========================================================= */}
        {validationAttempted && unfilledPoints.length > 0 && (
          <div
            id="validation-unfilled-banner"
            role="alert"
            aria-live="assertive"
            className="rounded-2xl border border-amber-300 bg-amber-50/95 p-4 sm:p-5 shadow-xs transition-all scroll-mt-24"
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                      <span>⚠ Penilaian Belum Lengkap</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                        {unfilledPoints.length} Poin Belum Diisi
                      </span>
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-amber-900">
                      Masih terdapat data yang belum diisi:
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unfilledPoints[0] && (
                      <button
                        type="button"
                        onClick={() => handleJumpToUnfilledPoint(unfilledPoints[0])}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-2xs"
                        title={`Lompat dan lengkapi nilai untuk Poin ${unfilledPoints[0].pointNumber}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Lengkapi Poin {unfilledPoints[0].pointNumber} Sekarang</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setValidationAttempted(false)}
                      className="rounded-lg p-1.5 text-amber-800/80 hover:text-amber-950 hover:bg-amber-200/70 transition cursor-pointer border border-transparent hover:border-amber-300"
                      title="Tutup banner peringatan"
                      aria-label="Tutup banner peringatan"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {unfilledPoints.map((item) => (
                    <li
                      key={item.appraisalItemId}
                      className="flex items-center justify-between gap-2.5 rounded-xl border border-amber-200/90 bg-white/95 px-3 py-2 shadow-2xs hover:border-amber-300 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-amber-600 font-bold text-xs shrink-0">•</span>
                        <span className="font-bold text-xs text-amber-950 shrink-0">
                          Poin {item.pointNumber}
                        </span>
                        <span
                          className="text-xs text-slate-700 truncate"
                          title={`${item.indicatorName} (${item.categoryName})`}
                        >
                          : {item.indicatorName}
                          <span className="ml-1 text-[11px] text-slate-400">({item.categoryName})</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJumpToUnfilledPoint(item)}
                        className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 active:scale-95 px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer"
                        title={`Lengkapi nilai untuk Poin ${item.pointNumber}`}
                      >
                        <Pencil className="h-3 w-3 text-amber-600" />
                        <span>Isi</span>
                      </button>
                    </li>
                  ))}
                </ul>

                <p className="text-xs font-medium text-amber-900 pt-0.5">
                  Silakan lengkapi poin tersebut sebelum mengirim penilaian.
                </p>
              </div>
            </div>
          </div>
        )}

        {validationAttempted && unfilledPoints.length === 0 && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-emerald-900 scroll-mt-24"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-xs font-bold block">
                  Seluruh poin penilaian telah terisi lengkap!
                </span>
                <span className="text-[11px] text-emerald-700">
                  Semua indikator sudah memiliki nilai. Anda dapat mengirimkan penilaian sekarang.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmitMyAssessment}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-2xs"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Kirim Penilaian Saya</span>
              </button>
              <button
                type="button"
                onClick={() => setValidationAttempted(false)}
                className="rounded-lg p-1.5 text-emerald-800/80 hover:text-emerald-950 hover:bg-emerald-200/70 transition cursor-pointer border border-transparent hover:border-emerald-300"
                title="Tutup banner"
                aria-label="Tutup banner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Toolbar: Info & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2 px-0.5">
          <div className="text-xs font-semibold text-slate-700">
            Daftar Parameter KPI • {liveCategories.length} Parameter ({liveCategories.reduce((acc, c) => acc + c.indicators.length, 0)} Indikator)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTipsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition cursor-pointer shadow-2xs"
              title="Lihat tips dan panduan perhitungan KPI"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Tips Perhitungan</span>
            </button>
          </div>
        </div>

        {/* Unified Modern Spreadsheet Table */}
        <div className="overflow-x-auto rounded-xl border border-[#dbe2ea] bg-white shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className="border-b border-[#dbe2ea] text-xs font-semibold text-slate-700 select-none"
                style={{ backgroundColor: "#f0f4f8" }}
              >
                <th className="py-2.5 px-4 text-left border-r border-[#dbe2ea] min-w-[260px]">
                  Parameter / Indikator KPI
                </th>
                <th className="py-2.5 px-4 text-left border-r border-[#dbe2ea] min-w-[180px]">
                  Kriteria Penilaian
                </th>
                <th className="py-2.5 px-2 text-center border-r border-[#dbe2ea] w-16 min-w-[64px]">
                  Skor
                </th>
                <th className="py-2.5 px-3 text-center border-r border-[#dbe2ea] min-w-[160px] w-48">
                  Realisasi
                </th>
                <th className="py-2.5 px-2 text-center border-r border-[#dbe2ea] w-20">
                  Bobot
                </th>
                <th className="py-2.5 px-2 text-center border-r border-[#dbe2ea] w-24">
                  Skor Akhir
                </th>
                <th className="py-2.5 px-2 text-center w-24">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {liveCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs italic bg-white">
                    Belum ada parameter KPI pada penilaian ini.
                  </td>
                </tr>
              ) : (
                liveCategories.map((cat) => {
                  const isTargetKerja =
                    cat.categoryNumber === 1 ||
                    cat.categoryName.toLowerCase().includes("target kerja");
                  const isExpanded = expandedCatIds.has(cat.categoryId);

                  const allFilled =
                    cat.indicators.length > 0 &&
                    cat.indicators.every((ind) => ind.annualStatus === "Completed");
                  const anyFilled = cat.indicators.some((ind) => ind.annualStatus !== "Not Started");
                  const catStatus: "Completed" | "In Progress" | "Not Started" = allFilled
                    ? "Completed"
                    : anyFilled
                    ? "In Progress"
                    : "Not Started";

                  return (
                    <React.Fragment key={cat.categoryId}>
                      {/* Accordion Header Row (Konsisten & Sama untuk Semua 5 Parameter Utama) */}
                      <tr
                        onClick={() => toggleParameter(cat.categoryId)}
                        className="cursor-pointer select-none border-b border-[#163a7d] transition hover:brightness-105"
                        style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                      >
                        {/* Kolom 1: Parameter & Status */}
                        <td className="py-2.5 px-4 align-middle border-r border-[#1e4794] text-white">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-white shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-white shrink-0" />
                              )}
                              <span className="font-bold text-white text-xs sm:text-[13px] tracking-tight truncate">
                                {cat.categoryNumber}. {cat.categoryName}
                              </span>
                            </div>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full font-medium shrink-0 select-none text-[10px] px-2 py-0.5 border border-white/20 bg-white/10 text-white"
                            >
                              <span
                                className={`rounded-full shrink-0 w-1.5 h-1.5 ${
                                  catStatus === "Completed"
                                    ? "bg-emerald-400"
                                    : catStatus === "In Progress"
                                    ? "bg-amber-400"
                                    : "bg-slate-300"
                                }`}
                              />
                              <span>
                                {catStatus === "Completed"
                                  ? "Selesai"
                                  : catStatus === "In Progress"
                                  ? "In Progress"
                                  : "Belum Mulai"}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Kolom 2: Ringkasan Sub-Parameter / Indikator */}
                        <td className="py-2.5 px-4 align-middle border-r border-[#1e4794] text-white/80 text-xs">
                          <span>
                            {isTargetKerja
                              ? `${cat.indicators.length} Sub-Parameter`
                              : "1 Indikator (General)"}
                          </span>
                        </td>

                        {/* Kolom 3: Skor */}
                        <td className="py-2.5 px-2 text-white/40 text-center text-xs align-middle border-r border-[#1e4794] font-mono">
                          -
                        </td>

                        {/* Kolom 4: Realisasi */}
                        <td className="py-2.5 px-2 text-white/40 text-center text-xs align-middle border-r border-[#1e4794] font-mono">
                          -
                        </td>

                        {/* Kolom 5: Bobot Utama */}
                        <td className="py-2.5 px-2 text-white text-center align-middle border-r border-[#1e4794] font-mono text-xs font-semibold">
                          {Math.round(cat.categoryWeight * 100)}%
                        </td>

                        {/* Kolom 6: Skor Akhir */}
                        <td className="py-2.5 px-2 text-amber-300 text-center align-middle border-r border-[#1e4794] font-mono text-xs font-bold">
                          {(cat.annualScorePercentage ?? cat.scorePercentage ?? 0).toFixed(1)}%
                        </td>

                        {/* Kolom 7: Aksi Accordion */}
                        <td className="py-2.5 px-2 text-center align-middle text-white/80 text-xs">
                          <span className="text-[11px] text-white/80 hover:text-white font-medium">
                            {isExpanded ? "Tutup" : "Buka"}
                          </span>
                        </td>
                      </tr>

                      {/* Sub-Rows Indikator Saat Accordion Dibuka */}
                      {isExpanded && (
                        isTargetKerja ? (
                          /* 1. TARGET KERJA: Memiliki sub-parameter dari Departemen beserta Bobot Internal */
                          cat.indicators.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-4 text-center text-slate-400 italic bg-white text-xs border-b border-[#dbe2ea]">
                                Belum ada sub-parameter pada Target Kerja.
                              </td>
                            </tr>
                          ) : (
                            cat.indicators.map((ind, indIdx) => {
                              const isIndUnfilled = unfilledPointIds.has(ind.appraisalItemId);
                              const curMonthDetail = ind.monthlyDetails?.find((m) => m.month === currentMonth);
                              const isIndSubmitted = curMonthDetail?.status === "SUBMITTED";
                              const effectiveScore =
                                ind.annualScore !== null && ind.annualScore !== undefined
                                  ? ind.annualScore
                                  : ind.score !== null && ind.score !== undefined
                                  ? ind.score
                                  : null;
                              const hasActual =
                                (ind.annualActual !== null && ind.annualActual !== undefined) ||
                                (ind.actualValue !== null && ind.actualValue !== undefined) ||
                                (ind.annualScore !== null && ind.annualScore !== undefined);
                              const displayScore = `${effectiveScore} pt`;
                              const isPopoverOpen =
                                popoverAnchor?.type === "realization" &&
                                popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;
                              const weightPctVal = Math.round((ind.indicatorWeight || 0) * 100);
                              const weightPctDisplay = `${weightPctVal}%`;
                              const isWeightPopoverOpen =
                                popoverAnchor?.type === "weight" &&
                                popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;
                              const finalScoreStr = ind.annualFinalScoreDisplay || ind.finalScoreDisplay;
                              const isFinalPopoverOpen =
                                popoverAnchor?.type === "final_score" &&
                                popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;

                              return (
                                <tr
                                  id={`indicator-row-${ind.appraisalItemId}`}
                                  key={ind.appraisalItemId}
                                  className={`border-b border-[#dbe2ea] transition-colors scroll-mt-24 ${
                                    isIndUnfilled && validationAttempted
                                      ? "bg-amber-50/60 hover:bg-amber-50/90"
                                      : "bg-white hover:bg-slate-50/70"
                                  }`}
                                >
                                  {/* 1. Sub-Parameter KPI */}
                                  <td className="py-2.5 px-3 pl-8 border-r border-[#dbe2ea] align-middle">
                                    <div className="flex items-start gap-2.5">
                                      <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                                        <span
                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border text-center ${
                                            isIndUnfilled && validationAttempted
                                              ? "bg-amber-200 text-amber-950 border-amber-300 font-extrabold"
                                              : "bg-slate-100 text-slate-700 border-slate-200"
                                          }`}
                                        >
                                          1.{indIdx + 1}
                                        </span>
                                        {ind.indicatorCode && (
                                          <span className="text-[9px] font-mono font-medium text-slate-400">
                                            {ind.indicatorCode}
                                          </span>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <div className="font-semibold text-slate-800 text-xs">
                                            {ind.indicatorName}
                                          </div>
                                          {isIndUnfilled && validationAttempted && (
                                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                              <span>Belum Diisi</span>
                                            </span>
                                          )}
                                        </div>
                                        {ind.target !== null && ind.target !== undefined && (
                                          <div className="text-[11px] text-slate-500 mt-0.5">
                                            Target:{" "}
                                            <span className="font-medium text-slate-700">
                                              {formatTargetNumber(ind.target, ind.unit)}
                                            </span>
                                          </div>
                                        )}
                                        {ind.indicatorDescription && (
                                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                            {ind.indicatorDescription}
                                          </div>
                                        )}
                                        {ind.evidenceList && ind.evidenceList.length > 0 && (
                                          <div className="mt-1.5 flex items-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEvidenceViewerState({
                                                  isOpen: true,
                                                  indicatorName: ind.indicatorName,
                                                  categoryName: cat.categoryName,
                                                  items: ind.evidenceList || [],
                                                })
                                              }
                                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition active:scale-95 cursor-pointer shadow-2xs"
                                              title={`Klik untuk melihat dokumen bukti (${ind.evidenceList.length} berkas)`}
                                            >
                                              <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                                              <span>{ind.evidenceList.length} Bukti Terlampir</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* 2. Kriteria Penilaian */}
                                  <td className="py-2.5 px-3 border-r border-[#dbe2ea] align-middle">
                                    <div className="space-y-1">
                                      {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                        <>
                                          {ind.scoringRules.slice(0, 3).map((r, rIdx) => (
                                            <div
                                              key={rIdx}
                                              className="h-6 flex items-center px-2 rounded text-[11px] border border-slate-200 bg-slate-50 font-mono text-slate-700 font-medium truncate"
                                              title={cleanRuleNumeric(r, ind.unit)}
                                            >
                                              {cleanRuleNumeric(r, ind.unit)}
                                            </div>
                                          ))}
                                          {ind.scoringRules.length > 3 && (
                                            <button
                                              type="button"
                                              onClick={() => setCriteriaModalItem(ind)}
                                              className="text-[10px] text-slate-600 hover:text-blue-600 hover:underline font-medium block pt-0.5"
                                            >
                                              +{ind.scoringRules.length - 3} lainnya...
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-300 font-mono text-xs">-</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 3. Skor */}
                                  <td className="py-2.5 px-2 border-r border-[#dbe2ea] align-middle text-center">
                                    <div className="space-y-1">
                                      {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                        <>
                                          {ind.scoringRules.slice(0, 3).map((r, rIdx) => (
                                            <div
                                              key={rIdx}
                                              className="h-6 flex items-center justify-center rounded text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 font-mono"
                                            >
                                              {r.score}
                                            </div>
                                          ))}
                                          {ind.scoringRules.length > 3 && (
                                            <div className="h-[15px] pt-0.5" aria-hidden="true" />
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-300 font-mono text-xs">-</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 4. Realisasi */}
                                  <td className="py-2.5 px-3 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                    {!hasActual || effectiveScore === null ? (
                                      <span className="text-slate-400 text-sm font-normal select-none cursor-default">-</span>
                                    ) : (
                                      <button
                                        type="button"
                                        aria-expanded={isPopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Rincian perhitungan realisasi ${ind.indicatorName}, skor ${displayScore}`}
                                        onClick={(e) => handleTriggerClick(e, "realization", ind, cat.categoryName, cat.categoryWeight)}
                                        onMouseEnter={(e) => handleTriggerMouseEnter("realization", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                        onMouseLeave={handleTriggerMouseLeave}
                                        className="group inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                      >
                                        <span className="tabular-nums font-semibold">
                                          {displayScore}
                                        </span>
                                        <Info
                                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    )}
                                  </td>

                                  {/* 5. Bobot: Menampilkan Bobot Internal untuk Sub-Parameter Target Kerja */}
                                  <td className="py-2.5 px-2 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                    <button
                                      type="button"
                                      aria-expanded={isWeightPopoverOpen}
                                      aria-haspopup="dialog"
                                      aria-label={`Rincian bobot internal ${ind.indicatorName}, nilai ${weightPctDisplay}`}
                                      onClick={(e) => handleTriggerClick(e, "weight", ind, cat.categoryName, cat.categoryWeight)}
                                      onMouseEnter={(e) => handleTriggerMouseEnter("weight", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                      onMouseLeave={handleTriggerMouseLeave}
                                      className="group inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                    >
                                      <span className="tabular-nums font-medium">
                                        {weightPctDisplay}
                                      </span>
                                      <Info
                                        className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </td>

                                  {/* 6. Skor Akhir */}
                                  <td className="py-2.5 px-2 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                    {!finalScoreStr || finalScoreStr === "-" ? (
                                      <span className="text-slate-400 text-xs font-normal select-none cursor-default">-</span>
                                    ) : (
                                      <button
                                        type="button"
                                        aria-expanded={isFinalPopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Rincian perhitungan skor akhir ${ind.indicatorName}, hasil ${finalScoreStr}`}
                                        onClick={(e) => handleTriggerClick(e, "final_score", ind, cat.categoryName, cat.categoryWeight)}
                                        onMouseEnter={(e) => handleTriggerMouseEnter("final_score", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                        onMouseLeave={handleTriggerMouseLeave}
                                        className="group inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                      >
                                        <span className="tabular-nums font-bold">
                                          {finalScoreStr}
                                        </span>
                                        <Info
                                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    )}
                                  </td>

                                  {/* 7. Aksi: Button input murni tanpa bungkus card */}
                                  <td className="py-2.5 px-2 text-center align-middle">
                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                      {ind.isEditable === false ? (
                                        <div
                                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border cursor-not-allowed select-none ${
                                            isIndSubmitted
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                              : "bg-slate-100 text-slate-400 border-slate-200"
                                          }`}
                                          title={
                                            isIndSubmitted
                                              ? "Terkunci: Penilaian untuk indikator ini telah dikirim (Submitted)"
                                              : "Terkunci: Penilaian hanya dapat dilakukan oleh asesor yang ditugaskan"
                                          }
                                        >
                                          <Lock className={`h-3 w-3 shrink-0 ${isIndSubmitted ? "text-emerald-600" : "text-slate-400"}`} />
                                          <span>{isIndSubmitted ? "Terkirim" : "Terkunci"}</span>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenAssessmentModal(ind, cat.categoryName)}
                                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap ${
                                            isIndUnfilled && validationAttempted
                                              ? "bg-amber-600 hover:bg-amber-700 text-white font-bold ring-2 ring-amber-300"
                                              : "text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
                                          }`}
                                          title={`Input rincian penilaian untuk ${ind.indicatorName}`}
                                        >
                                          <Pencil className={`h-3 w-3 shrink-0 ${isIndUnfilled && validationAttempted ? "text-white" : "text-slate-600"}`} />
                                          <span>{isIndUnfilled && validationAttempted ? "Isi Nilai" : hasActual ? "Edit" : "Input"}</span>
                                        </button>
                                      )}

                                      {/* Button View Evidence */}
                                      {ind.evidenceList && ind.evidenceList.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEvidenceViewerState({
                                              isOpen: true,
                                              indicatorName: ind.indicatorName,
                                              categoryName: cat.categoryName,
                                              items: ind.evidenceList || [],
                                            })
                                          }
                                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                          title={`Lihat berkas bukti untuk ${ind.indicatorName} (${ind.evidenceList.length} berkas)`}
                                        >
                                          <Eye className="h-3 w-3 text-emerald-600 shrink-0" />
                                          <span>Bukti</span>
                                          {ind.evidenceList.length > 1 && (
                                            <span className="rounded-full bg-emerald-200/80 px-1 py-0.2 text-[9px] font-bold text-emerald-800">
                                              {ind.evidenceList.length}
                                            </span>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        ) : (
                          /* 2. PARAMETER GENERAL: Kehadiran & Disiplin, Keselamatan Kerja, Kepatuhan & SP, Inovasi & Improvement */
                          /* Ditampilkan sebagai single row indikator tanpa duplikasi (tanpa sub-kode 2.1, dsb.) dan langsung menggunakan Bobot Utama */
                          (() => {
                            const ind = cat.indicators[0];
                            if (!ind) {
                              return (
                                <tr>
                                  <td colSpan={7} className="py-4 text-center text-slate-400 italic bg-white text-xs border-b border-[#dbe2ea]">
                                    Belum ada indikator pada parameter ini.
                                  </td>
                                </tr>
                              );
                            }

                            const isIndUnfilled = unfilledPointIds.has(ind.appraisalItemId);
                            const curMonthDetail = ind.monthlyDetails?.find((m) => m.month === currentMonth);
                            const isIndSubmitted = curMonthDetail?.status === "SUBMITTED";
                            const effectiveScore =
                              ind.annualScore !== null && ind.annualScore !== undefined
                                ? ind.annualScore
                                : ind.score !== null && ind.score !== undefined
                                ? ind.score
                                : null;
                            const hasActual =
                              (ind.annualActual !== null && ind.annualActual !== undefined) ||
                              (ind.actualValue !== null && ind.actualValue !== undefined) ||
                              (ind.annualScore !== null && ind.annualScore !== undefined);
                            const displayScore = `${effectiveScore} pt`;
                            const isPopoverOpen =
                              popoverAnchor?.type === "realization" &&
                              popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;
                            const finalScoreStr = ind.annualFinalScoreDisplay || ind.finalScoreDisplay;
                            const isFinalPopoverOpen =
                              popoverAnchor?.type === "final_score" &&
                              popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;

                            return (
                              <tr
                                id={`indicator-row-${ind.appraisalItemId}`}
                                key={ind.appraisalItemId}
                                className={`border-b border-[#dbe2ea] transition-colors scroll-mt-24 ${
                                  isIndUnfilled && validationAttempted
                                    ? "bg-amber-50/60 hover:bg-amber-50/90"
                                    : "bg-white hover:bg-slate-50/70"
                                }`}
                              >
                                {/* 1. Indikator Parameter General (Tanpa Sub-Kode Angka) */}
                                <td className="py-2.5 px-3 pl-8 border-r border-[#dbe2ea] align-middle">
                                  <div className="flex items-start gap-2.5">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <div className="font-semibold text-slate-800 text-xs">
                                          {ind.indicatorName}
                                        </div>
                                        {isIndUnfilled && validationAttempted && (
                                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                                            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                            <span>Belum Diisi</span>
                                          </span>
                                        )}
                                      </div>
                                      {ind.target !== null && ind.target !== undefined && (
                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                          Target:{" "}
                                          <span className="font-medium text-slate-700">
                                            {formatTargetNumber(ind.target, ind.unit)}
                                          </span>
                                        </div>
                                      )}
                                      {ind.indicatorDescription && (
                                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                          {ind.indicatorDescription}
                                        </div>
                                      )}
                                      {ind.evidenceList && ind.evidenceList.length > 0 && (
                                        <div className="mt-1.5 flex items-center">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEvidenceViewerState({
                                                isOpen: true,
                                                indicatorName: ind.indicatorName,
                                                categoryName: cat.categoryName,
                                                items: ind.evidenceList || [],
                                              })
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition active:scale-95 cursor-pointer shadow-2xs"
                                            title={`Klik untuk melihat dokumen bukti (${ind.evidenceList.length} berkas)`}
                                          >
                                            <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                                            <span>{ind.evidenceList.length} Bukti Terlampir</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* 2. Kriteria Penilaian */}
                                <td className="py-2.5 px-3 border-r border-[#dbe2ea] align-middle">
                                  <div className="space-y-1">
                                    {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                      <>
                                        {ind.scoringRules.slice(0, 3).map((r, rIdx) => (
                                          <div
                                            key={rIdx}
                                            className="h-6 flex items-center px-2 rounded text-[11px] border border-slate-200 bg-slate-50 font-mono text-slate-700 font-medium truncate"
                                            title={cleanRuleNumeric(r, ind.unit)}
                                          >
                                            {cleanRuleNumeric(r, ind.unit)}
                                          </div>
                                        ))}
                                        {ind.scoringRules.length > 3 && (
                                          <button
                                            type="button"
                                            onClick={() => setCriteriaModalItem(ind)}
                                            className="text-[10px] text-slate-600 hover:text-blue-600 hover:underline font-medium block pt-0.5"
                                          >
                                            +{ind.scoringRules.length - 3} lainnya...
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs">-</span>
                                    )}
                                  </div>
                                </td>

                                {/* 3. Skor */}
                                <td className="py-2.5 px-2 border-r border-[#dbe2ea] align-middle text-center">
                                  <div className="space-y-1">
                                    {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                      <>
                                        {ind.scoringRules.slice(0, 3).map((r, rIdx) => (
                                          <div
                                            key={rIdx}
                                            className="h-6 flex items-center justify-center rounded text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 font-mono"
                                          >
                                            {r.score}
                                          </div>
                                        ))}
                                        {ind.scoringRules.length > 3 && (
                                          <div className="h-[15px] pt-0.5" aria-hidden="true" />
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs">-</span>
                                    )}
                                  </div>
                                </td>

                                {/* 4. Realisasi */}
                                <td className="py-2.5 px-3 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                  {!hasActual || effectiveScore === null ? (
                                    <span className="text-slate-400 text-sm font-normal select-none cursor-default">-</span>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-expanded={isPopoverOpen}
                                      aria-haspopup="dialog"
                                      aria-label={`Rincian perhitungan realisasi ${ind.indicatorName}, skor ${displayScore}`}
                                      onClick={(e) => handleTriggerClick(e, "realization", ind, cat.categoryName, cat.categoryWeight)}
                                      onMouseEnter={(e) => handleTriggerMouseEnter("realization", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                      onMouseLeave={handleTriggerMouseLeave}
                                      className="group inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                    >
                                      <span className="tabular-nums font-semibold">
                                        {displayScore}
                                      </span>
                                      <Info
                                        className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  )}
                                </td>

                                {/* 5. Bobot: HANYA Bobot Utama (Tanpa Bobot Internal) */}
                                <td className="py-2.5 px-2 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                  <span className="tabular-nums font-semibold text-xs text-slate-700 font-mono">
                                    {Math.round((cat.categoryWeight || 0) * 100)}%
                                  </span>
                                </td>

                                {/* 6. Skor Akhir */}
                                <td className="py-2.5 px-2 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                  {!finalScoreStr || finalScoreStr === "-" ? (
                                    <span className="tabular-nums font-bold text-xs text-slate-800 font-mono">
                                      {(cat.annualScorePercentage ?? cat.scorePercentage ?? 0).toFixed(1)}%
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-expanded={isFinalPopoverOpen}
                                      aria-haspopup="dialog"
                                      aria-label={`Rincian perhitungan skor akhir ${ind.indicatorName}, hasil ${finalScoreStr}`}
                                      onClick={(e) => handleTriggerClick(e, "final_score", ind, cat.categoryName, cat.categoryWeight)}
                                      onMouseEnter={(e) => handleTriggerMouseEnter("final_score", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                      onMouseLeave={handleTriggerMouseLeave}
                                      className="group inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                    >
                                      <span className="tabular-nums font-bold">
                                        {finalScoreStr}
                                      </span>
                                      <Info
                                        className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  )}
                                </td>

                                {/* 7. Aksi: Button input murni tanpa bungkus card */}
                                <td className="py-2.5 px-2 text-center align-middle">
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {ind.isEditable === false ? (
                                      <div
                                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border cursor-not-allowed select-none ${
                                          isIndSubmitted
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-slate-100 text-slate-400 border-slate-200"
                                        }`}
                                        title={
                                          isIndSubmitted
                                            ? "Terkunci: Penilaian untuk indikator ini telah dikirim (Submitted)"
                                            : "Terkunci: Penilaian hanya dapat dilakukan oleh asesor yang ditugaskan"
                                        }
                                      >
                                        <Lock className={`h-3 w-3 shrink-0 ${isIndSubmitted ? "text-emerald-600" : "text-slate-400"}`} />
                                        <span>{isIndSubmitted ? "Terkirim" : "Terkunci"}</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAssessmentModal(ind, cat.categoryName)}
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap ${
                                          isIndUnfilled && validationAttempted
                                            ? "bg-amber-600 hover:bg-amber-700 text-white font-bold ring-2 ring-amber-300"
                                            : "text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
                                        }`}
                                        title={`Input rincian penilaian untuk ${ind.indicatorName}`}
                                      >
                                        <Pencil className={`h-3 w-3 shrink-0 ${isIndUnfilled && validationAttempted ? "text-white" : "text-slate-600"}`} />
                                        <span>{isIndUnfilled && validationAttempted ? "Isi Nilai" : hasActual ? "Edit" : "Input"}</span>
                                      </button>
                                    )}

                                    {/* Button View Evidence */}
                                    {ind.evidenceList && ind.evidenceList.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEvidenceViewerState({
                                            isOpen: true,
                                            indicatorName: ind.indicatorName,
                                            categoryName: cat.categoryName,
                                            items: ind.evidenceList || [],
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                        title={`Lihat berkas bukti untuk ${ind.indicatorName} (${ind.evidenceList.length} berkas)`}
                                      >
                                        <Eye className="h-3 w-3 text-emerald-600 shrink-0" />
                                        <span>Bukti</span>
                                        {ind.evidenceList.length > 1 && (
                                          <span className="rounded-full bg-emerald-200/80 px-1 py-0.2 text-[9px] font-bold text-emerald-800">
                                            {ind.evidenceList.length}
                                          </span>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })()
                        )
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ================================================== */}
      {/* 3B-1. LAMPIRAN & BUKTI PENDUKUNG PENILAIAN         */}
      {/* ================================================== */}
      <section
        id="lampiran-bukti-pendukung"
        className="mt-8 pt-6 border-t border-slate-200/80 scroll-mt-6"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700 border border-sky-100">
                <Paperclip className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Lampiran &amp; Bukti Pendukung Penilaian
                  </h3>
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-200">
                    {allEvidenceList.length} Berkas
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Dokumen, berkas Excel, atau foto bukti pendukung capaian KPI periode {currentYear}
                </p>
              </div>
            </div>

            {/* Tombol Tambah Lampiran Baru */}
            {isFormEditable && (
              <div className="flex items-center gap-2">
                <input
                  ref={sectionEvidenceFileRef}
                  type="file"
                  accept="image/*,.pdf,.xlsx,.xls,.docx,.doc"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadSectionEvidence(e.target.files[0]);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={isSectionUploadingEvidence}
                  onClick={() => sectionEvidenceFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Unggah berkas bukti pendukung baru"
                >
                  {isSectionUploadingEvidence ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengunggah...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Lampiran</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* List or Empty State */}
          {allEvidenceList.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 text-xs space-y-1.5">
              <Paperclip className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">Belum ada lampiran dokumen atau bukti pendukung</p>
              <p className="text-[11px] max-w-md mx-auto text-slate-500">
                Lampiran dapat diunggah melalui tombol Tambah Lampiran di atas atau saat melakukan Upload Penilaian dari Excel.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allEvidenceList.map((ev, evIdx) => {
                const isImg =
                  ev.mimeType?.startsWith("image/") ||
                  /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(ev.fileName);
                const isExcel =
                  ev.fileType === "EXCEL_DATA" ||
                  /\.(xlsx|xls|csv)$/i.test(ev.fileName);

                // Find parameter name from categories
                let paramName = "Umum Penilaian";
                let catName = "";
                for (const cat of liveCategories) {
                  for (const ind of cat.indicators) {
                    if (ind.parameterId === ev.parameterId) {
                      paramName = ind.indicatorName;
                      catName = cat.categoryName;
                      break;
                    }
                  }
                }

                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors shadow-2xs group"
                  >
                    {/* Thumbnail preview */}
                    {isImg ? (
                      <img
                        src={ev.filePath}
                        alt={ev.fileName}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 transition shadow-2xs"
                        onClick={() =>
                          setEvidenceViewerState({
                            isOpen: true,
                            items: allEvidenceList,
                            initialIndex: evIdx,
                            indicatorName: paramName,
                            categoryName: catName,
                          })
                        }
                      />
                    ) : isExcel ? (
                      <div className="w-12 h-12 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate" title={ev.fileName}>
                        {ev.fileName}
                      </p>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white text-slate-600 border border-slate-200 truncate max-w-full mt-0.5">
                        {paramName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                        <span>{ev.fileSize ? `${(ev.fileSize / 1024).toFixed(1)} KB` : "-"}</span>
                        <span>•</span>
                        <span>{formatAuditDate(ev.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setEvidenceViewerState({
                            isOpen: true,
                            items: allEvidenceList,
                            initialIndex: evIdx,
                            indicatorName: paramName,
                            categoryName: catName,
                          })
                        }
                        className="p-1 rounded text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition cursor-pointer"
                        title="Pratinjau berkas bukti"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <a
                        href={ev.filePath}
                        download={ev.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                        title="Unduh berkas"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      {userRole !== "EMPLOYEE" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEvidence(ev.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Hapus berkas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ================================================== */}
      {/* 3B. ALUR PERSETUJUAN (STAGING TRACKER)             */}
      {/* ================================================== */}
      <section
        id="alur-persetujuan"
        className="mt-8 pt-6 border-t border-slate-200/80 scroll-mt-6"
      >
        {/* Minimalist Staging Approval Tracker (No Card, Clean Horizontal Line) */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Alur Persetujuan (Staging Tracker)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Tahap saat ini:</span>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  currentAppraisalStatus === "FINAL"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : isRevised
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-sky-50 text-sky-800 border border-sky-200"
                }`}
              >
                {currentAppraisalStatus === "FINAL"
                  ? "Selesai (Final)"
                  : isRevised
                  ? `Perlu Revisi (${currentStage})`
                  : currentStage === "PENILAI"
                  ? "Tahap Penilai"
                  : currentStage === "HEAD_DEPT"
                  ? "Review Head Dept"
                  : currentStage === "MANAGER"
                  ? "Validasi Manager"
                  : currentStage === "HR"
                  ? "Persetujuan HR"
                  : currentStage}
              </span>
            </div>
          </div>

          {/* Stepper Steps (Clean row, no card) */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 py-3 border-y border-slate-200/70">
            {[
              {
                key: "PENILAI",
                num: 1,
                label: "Penilai",
                desc: "Input & Draft",
                isDone: currentAppraisalStatus !== "DRAFT" && currentAppraisalStatus !== "REVISED_PENILAI",
                isActive: currentStage === "PENILAI",
                name: approvalLine?.appraiser?.name || "Atasan Langsung",
              },
              {
                key: "HEAD_DEPT",
                num: 2,
                label: "Head Dept",
                desc: "Review Dept",
                isDone:
                  currentAppraisalStatus === "PENDING_MANAGER" ||
                  currentAppraisalStatus === "PENDING_HR" ||
                  currentAppraisalStatus === "REVIEWED" ||
                  currentAppraisalStatus === "FINAL" ||
                  currentAppraisalStatus === "REVISED_MGR",
                isActive: currentStage === "HEAD_DEPT",
                name: approvalLine?.headDept?.name || "Head Dept",
              },
              {
                key: "MANAGER",
                num: 3,
                label: "Manager",
                desc: "Validasi Divisi",
                isDone:
                  currentAppraisalStatus === "PENDING_HR" ||
                  currentAppraisalStatus === "REVIEWED" ||
                  currentAppraisalStatus === "FINAL",
                isActive: currentStage === "MANAGER",
                name: approvalLine?.manager?.name || "Manager",
              },
              {
                key: "HR",
                num: 4,
                label: "HR Approval",
                desc: "Persetujuan Akhir",
                isDone: currentAppraisalStatus === "FINAL",
                isActive: currentStage === "HR",
                name: "Divisi HR",
              },
              {
                key: "FINAL",
                num: 5,
                label: "Final",
                desc: "Selesai & Sah",
                isDone: currentAppraisalStatus === "FINAL",
                isActive: currentAppraisalStatus === "FINAL",
                name: "KPI Resmi",
              },
            ].map((st, idx, arr) => {
              const isCurrent = st.isActive;
              const isDone = st.isDone;

              return (
                <div key={st.key} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        isDone
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : isCurrent
                          ? isRevised
                            ? "bg-amber-500 text-white shadow-2xs animate-pulse"
                            : "bg-sky-600 text-white shadow-2xs animate-pulse"
                          : "bg-slate-100 text-slate-400 font-medium"
                      }`}
                    >
                      {isDone ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        st.num
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs truncate ${
                            isCurrent
                              ? isRevised
                                ? "text-amber-800 font-bold"
                                : "text-sky-800 font-bold"
                              : isDone
                              ? "text-slate-800 font-semibold"
                              : "text-slate-400 font-medium"
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <span className="block text-[10px] text-slate-400 truncate">
                        {isDone ? "Selesai" : isCurrent ? (isRevised ? "Perlu Revisi" : "Sedang Berjalan") : "Menunggu"}
                        {st.name ? ` • ${st.name}` : ""}
                      </span>
                    </div>
                  </div>

                  {idx < arr.length - 1 && (
                    <div className="hidden sm:block text-slate-300 shrink-0">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* 4. MODAL DIALOG INPUT PENILAIAN (2 SECTIONS)       */}
      {/* ================================================== */}
      {assessmentModal.isOpen && assessmentModal.indicator && (() => {
        const ind = assessmentModal.indicator;

        const rawMasterTarget = assessmentModal.targetStr.trim();
        let parsedMasterTarget: number | null = null;
        if (rawMasterTarget !== "") {
          const sanitized = rawMasterTarget.replace(/,/g, ".");
          const num = parseFloat(sanitized);
          if (!isNaN(num)) parsedMasterTarget = num;
        } else if (ind.target !== null && ind.target !== undefined) {
          parsedMasterTarget = ind.target;
        }

        let filledCount = 0;
        let sumActual = 0;
        let sumScore = 0;
        const validActuals: number[] = [];

        const monthRows = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const temp = assessmentModal.tempValues[m];
          const raw = temp?.actual?.trim() ?? "";
          let actualNum: number | null = null;
          if (raw !== "") {
            const sanitized = raw.replace(/,/g, ".");
            const num = parseFloat(sanitized);
            if (!isNaN(num)) {
              actualNum = num;
              validActuals.push(num);
            }
          }

          const rawTarget = temp?.target?.trim() ?? "";
          let targetNum: number | null = null;
          if (rawTarget !== "") {
            const sanitizedT = rawTarget.replace(/,/g, ".");
            const numT = parseFloat(sanitizedT);
            if (!isNaN(numT)) targetNum = numT;
          }

          const effectiveTarget = targetNum !== null ? targetNum : parsedMasterTarget;
          const mScoreRes = calculateKpiScore(actualNum, ind.scoringRules, {
            indicatorWeight: ind.indicatorWeight,
            parameterWeight: ind.parameterWeight,
            maxScore: ind.maxScore,
            compareBasis: ind.compareBasis,
            target: effectiveTarget,
            direction: ind.direction,
            measurementType: ind.measurementType,
            unit: ind.unit,
          });

          const score = actualNum !== null ? mScoreRes.score : null;

          if (actualNum !== null) {
            filledCount++;
            sumActual += actualNum;
            if (score !== null) sumScore += score;
          }

          return {
            month: m,
            monthShort: SHORT_MONTH_NAMES[i],
            monthName: INDONESIAN_MONTH_NAMES[i],
            targetNum,
            targetStr: temp?.target ?? "",
            actualNum,
            actualStr: temp?.actual ?? "",
            notesStr: temp?.notes ?? "",
            score,
            realizationPct: mScoreRes.realizationPct,
            realizationPctDisplay: mScoreRes.realizationPctDisplay,
            bandLabel: mScoreRes.bandLabel,
            isNotApplicable: mScoreRes.isNotApplicable,
          };
        });

        // 1. Hitung Actual Periode berdasarkan Pola Input (Sekali vs Bulanan)
        let actualPeriode: number | null = null;
        let actualPeriodeDisplay = "-";

        if (assessmentModal.inputPattern === "SEKALI") {
          const raw = assessmentModal.singleActualStr.trim();
          if (raw !== "") {
            const sanitized = raw.replace(/,/g, ".");
            const num = parseFloat(sanitized);
            if (!isNaN(num)) {
              actualPeriode = num;
              actualPeriodeDisplay = String(num);
            } else {
              actualPeriodeDisplay = raw;
            }
          }
        } else {
          // Bulanan dengan metode agregasi terpilih
          if (validActuals.length > 0) {
            const method = assessmentModal.aggregationMethod;
            if (method === "SUM") {
              actualPeriode = validActuals.reduce((a, b) => a + b, 0);
            } else if (method === "MIN") {
              actualPeriode = Math.min(...validActuals);
            } else if (method === "MAX") {
              actualPeriode = Math.max(...validActuals);
            } else if (method === "LAST_VALUE") {
              actualPeriode = validActuals[validActuals.length - 1];
            } else {
              // AVG
              actualPeriode = parseFloat((validActuals.reduce((a, b) => a + b, 0) / validActuals.length).toFixed(2));
            }
            actualPeriodeDisplay = String(actualPeriode);
          }
        }

        // 2. Evaluasi Hasil Perhitungan (Section 2) secara dinamis dari Master Template
        const periodScoreRes = calculateKpiScore(actualPeriode, ind.scoringRules, {
          indicatorWeight: ind.indicatorWeight,
          parameterWeight: ind.parameterWeight,
          maxScore: ind.maxScore,
          compareBasis: ind.compareBasis,
          target: parsedMasterTarget,
          direction: ind.direction,
          measurementType: ind.measurementType,
          unit: ind.unit,
        });

        const directionLabel =
          ind.direction === "LOWER_IS_BETTER"
            ? "Lower is Better ↓"
            : ind.direction === "NOT_APPLICABLE"
            ? "Not Applicable"
            : "Higher is Better ↑";

        const sortedRules = (ind.scoringRules ? [...ind.scoringRules] : []).sort(
          (a, b) => Number(b.score) - Number(a.score)
        );

        // Rumus konkret dinamis menampilkan angka target: contoh "(99.4 / 100) × 100% = 99.4%"
        const concreteFormulaText = (() => {
          if (actualPeriode === null) return null;
          const tgt = parsedMasterTarget ?? 0;
          if (ind.direction === "NOT_APPLICABLE" || ind.measurementType === "BOOLEAN") {
            return `Evaluasi langsung: Actual "${actualPeriodeDisplay}" dievaluasi terhadap kriteria Band.`;
          }
          if (ind.direction === "LOWER_IS_BETTER") {
            return `(${tgt} / ${actualPeriodeDisplay}) × 100% = ${periodScoreRes.realizationPctDisplay}`;
          }
          return `(${actualPeriodeDisplay} / ${tgt}) × 100% = ${periodScoreRes.realizationPctDisplay}`;
        })();

        // Subjudul employee · nik · template
        const modalSubtitle = [
          initialDetail?.employee.name,
          initialDetail?.employee.nik ? `NIK ${initialDetail?.employee.nik}` : null,
          activeTemplateName ? `Template ${activeTemplateName}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            {/* Backdrop Blur */}
            <div
              className={MODAL_TOKENS.colors.backdrop}
              onClick={handleCloseAssessmentModal}
            />

            {/* Modal Dialog Card (Single Surface, App Default Font) */}
            <div
              className={MODAL_TOKENS.colors.dialog}
              style={MODAL_TOKENS.cssVars}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. Modal Header (Clean, spacious, uncluttered) */}
              <div className={MODAL_TOKENS.colors.header}>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                    {ind.indicatorCode ? `${ind.indicatorCode} · ${ind.indicatorName}` : ind.indicatorName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {modalSubtitle || "Penilaian Karyawan"}
                  </p>

                  {/* Metadata compact di bawah judul */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-2">
                    <span>
                      Target:{" "}
                      <strong className="font-semibold text-slate-700 tabular-nums">
                        {formatTargetNumber(parsedMasterTarget, ind.unit)}
                      </strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Satuan:{" "}
                      <strong className="font-semibold text-slate-700">
                        {ind.unit || "-"}
                      </strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Bobot:{" "}
                      <strong className="font-semibold text-slate-700 tabular-nums">
                        {Math.round(ind.indicatorWeight * 100)}%
                      </strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      <strong className="font-semibold text-slate-700">
                        {directionLabel}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Ghost Action Tools & Close */}
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTraceModalState({
                        isOpen: true,
                        appraisalItemId: ind.appraisalItemId,
                        month: focusedMonth || currentMonth,
                        indicatorName: ind.indicatorName,
                        categoryName: assessmentModal.categoryName,
                        unit: ind.unit || undefined,
                      });
                    }}
                    className={MODAL_TOKENS.controls.ghostBtn}
                    title="Buka rincian rumus & audit trace perhitungan"
                  >
                    <Calculator className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Audit Trace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTipsModalOpen(true)}
                    className={MODAL_TOKENS.controls.ghostBtn}
                    title="Panduan perhitungan KPI"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Tips</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseAssessmentModal}
                    className={MODAL_TOKENS.controls.ghostCloseBtn}
                    title="Tutup (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 2. Modal Body */}
              <div className={MODAL_TOKENS.colors.body}>
                {/* 2A. Toolbar: Mode Penilaian & Actions Dropdown */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Kiri: Metode Agregasi (jika Bulanan) atau Info Mode (jika Sekali) */}
                  {assessmentModal.inputPattern === "BULANAN" ? (
                    <div className="flex items-center gap-2">
                      <label htmlFor="modal-agg-select" className="text-xs font-medium text-slate-600">
                        Metode Agregasi:
                      </label>
                      <select
                        id="modal-agg-select"
                        value={assessmentModal.aggregationMethod}
                        onChange={(e) =>
                          setAssessmentModal((prev) => ({
                            ...prev,
                            aggregationMethod: e.target.value as any,
                          }))
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition cursor-pointer shadow-2xs"
                      >
                        <option value="AVG">AVG (Rata-rata)</option>
                        <option value="SUM">SUM (Penjumlahan)</option>
                        <option value="MIN">MIN (Nilai Terendah)</option>
                        <option value="MAX">MAX (Nilai Tertinggi)</option>
                        <option value="LAST_VALUE">Last Value (Bulan Terakhir)</option>
                      </select>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-medium">
                      Input nilai capaian satu periode
                    </div>
                  )}

                  {/* Kanan: Mode Penilaian & Actions Dropdown */}
                  <div className="flex items-center gap-2.5">
                    {/* Mode Penilaian: Sekali / Bulanan */}
                    <div className="inline-flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
                        <input
                          type="radio"
                          name="modalInputPattern"
                          value="SEKALI"
                          checked={assessmentModal.inputPattern === "SEKALI"}
                          onChange={() =>
                            setAssessmentModal((prev) => ({
                              ...prev,
                              inputPattern: "SEKALI",
                            }))
                          }
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Sekali</span>
                      </label>

                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
                        <input
                          type="radio"
                          name="modalInputPattern"
                          value="BULANAN"
                          checked={assessmentModal.inputPattern === "BULANAN"}
                          onChange={() =>
                            setAssessmentModal((prev) => ({
                              ...prev,
                              inputPattern: "BULANAN",
                            }))
                          }
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Bulanan</span>
                      </label>
                    </div>

                    {/* Actions Dropdown: Import & Export Excel */}
                    {assessmentModal.inputPattern === "BULANAN" && (
                      <div className="relative" ref={modalActionsRef}>
                        <button
                          type="button"
                          onClick={() => setIsModalActionsOpen((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition cursor-pointer"
                          aria-expanded={isModalActionsOpen}
                        >
                          <span>Actions</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isModalActionsOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isModalActionsOpen && (
                          <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                            <button
                              type="button"
                              onClick={() => {
                                setIsModalActionsOpen(false);
                                modalFileInputRef.current?.click();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer text-left"
                            >
                              <Upload className="w-3.5 h-3.5 text-slate-500" />
                              <span>Import Excel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsModalActionsOpen(false);
                                handleExportMonthlyExcel(ind);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer text-left"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                              <span>Export Excel</span>
                            </button>
                          </div>
                        )}

                        <input
                          ref={modalFileInputRef}
                          type="file"
                          accept=".xlsx, .xls, .csv"
                          onChange={handleImportMonthlyExcel}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2B. Area Input Utama */}
                {assessmentModal.inputPattern === "SEKALI" ? (
                  /* Input Sekali */
                  <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3 max-w-lg">
                    <div className="space-y-1.5">
                      <label htmlFor="modal-actual-input" className={MODAL_TOKENS.typography.label}>
                        Nilai Actual {ind.unit ? `(${ind.unit})` : ""}
                      </label>
                      <div className="relative">
                        <input
                          id="modal-actual-input"
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={assessmentModal.singleActualStr}
                          onChange={(e) =>
                            setAssessmentModal((prev) => ({
                              ...prev,
                              singleActualStr: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveAssessmentModal();
                            }
                          }}
                          placeholder={ind.measurementType === "BOOLEAN" ? "Contoh: Ya / Selesai / 1" : "0"}
                          className={`${MODAL_TOKENS.controls.inputActual} ${ind.unit ? "pr-9" : ""}`}
                        />
                        {ind.unit && (
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-slate-400">
                            {ind.unit}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Choice Chips untuk Text / Boolean jika ada di scoringRules */}
                    {ind.scoringRules && ind.scoringRules.length > 0 && (ind.measurementType === "BOOLEAN" || ind.direction === "NOT_APPLICABLE") && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-slate-500">Pilihan cepat:</span>
                        {ind.scoringRules.map((rule, idx) => (
                          <button
                            key={rule.id || idx}
                            type="button"
                            onClick={() =>
                              setAssessmentModal((prev) => ({
                                ...prev,
                                singleActualStr: rule.label || String(rule.minValue ?? rule.score),
                              }))
                            }
                            className="px-2.5 py-0.5 rounded text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition cursor-pointer"
                          >
                            {rule.label || `Skor ${rule.score}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Ringkasan Hasil Nilai Sekali */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                      <div className="flex items-center gap-3">
                        <span>
                          Realisasi:{" "}
                          <strong className="font-semibold text-blue-700 tabular-nums">
                            {actualPeriode !== null ? (periodScoreRes.isNotApplicable ? "N/A" : periodScoreRes.realizationPctDisplay) : "-"}
                          </strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Band:{" "}
                          <strong className="font-medium text-slate-700">
                            {periodScoreRes.bandLabel || "-"}
                          </strong>
                        </span>
                      </div>
                      <div>
                        <span>
                          Score:{" "}
                          <strong className="font-bold text-blue-700 tabular-nums">
                            {periodScoreRes.score !== null ? `${periodScoreRes.score} pt` : "-"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Input Bulanan: Tabel 12 Bulan (Fokus Utama) */
                  <div className="space-y-3">
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider z-10">
                            <tr>
                              <th className="px-3.5 py-2 w-32">Bulan</th>
                              <th className="px-3.5 py-2 text-right w-24">Target</th>
                              <th className="px-3.5 py-2 text-right w-28">Actual</th>
                              <th className="px-3.5 py-2 text-center w-24">Realisasi</th>
                              <th className="px-3.5 py-2 text-center w-24">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {monthRows.map((r) => {
                              const isPopoverOpen = scoreDetailMonth === r.month;
                              return (
                                <tr key={r.month} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="px-3.5 py-1.5 font-medium text-slate-800">
                                    {r.monthName}{" "}
                                    <span className="text-[11px] text-slate-400 font-normal">({r.monthShort})</span>
                                  </td>
                                  <td className="px-3.5 py-1.5 text-right">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={r.targetStr}
                                      onChange={(e) => handleAssessmentModalInputChange(r.month, "target", e.target.value)}
                                      placeholder="0"
                                      className="w-20 rounded border border-slate-200 bg-white px-2 py-0.5 text-right text-xs tabular-nums text-slate-700 focus:border-blue-600 focus:outline-none transition"
                                    />
                                  </td>
                                  <td className="px-3.5 py-1.5 text-right">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={r.actualStr}
                                      onChange={(e) => handleAssessmentModalInputChange(r.month, "actual", e.target.value)}
                                      placeholder="0"
                                      className="w-24 rounded border border-slate-300 bg-white px-2 py-0.5 text-right text-xs tabular-nums font-semibold text-blue-700 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                                    />
                                  </td>
                                  <td className="px-3.5 py-1.5 text-center tabular-nums">
                                    {r.actualNum !== null ? (
                                      r.isNotApplicable ? (
                                        <span className="text-slate-500 text-[11px]">N/A</span>
                                      ) : (
                                        <span className="text-slate-800 font-medium text-xs">
                                          {r.realizationPctDisplay}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-1.5 text-center relative tabular-nums">
                                    <div className="inline-flex items-center justify-center gap-1.5">
                                      <span className="font-semibold text-blue-700">
                                        {r.score !== null ? r.score : <span className="text-slate-300 font-normal">-</span>}
                                      </span>
                                      {r.actualNum !== null && (
                                        <button
                                          type="button"
                                          onClick={() => setScoreDetailMonth(isPopoverOpen ? null : r.month)}
                                          className="p-0.5 text-slate-400 hover:text-blue-600 transition rounded cursor-pointer"
                                          title="Lihat Band & detail perhitungan"
                                          aria-label={`Detail skor bulan ${r.monthName}`}
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Popover Detail Skor & Band */}
                                    {isPopoverOpen && (
                                      <div
                                        ref={scorePopoverRef}
                                        className={`absolute right-4 ${
                                          r.month > 6 ? "bottom-full mb-1" : "top-full mt-1"
                                        } z-30 w-60 p-3 bg-white rounded-lg shadow-xl border border-slate-200 text-left text-xs animate-in fade-in zoom-in-95 duration-100`}
                                      >
                                        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100">
                                          <span className="font-bold text-slate-800">Detail Skor · {r.monthName}</span>
                                          <button
                                            type="button"
                                            onClick={() => setScoreDetailMonth(null)}
                                            className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <div className="space-y-1.5 text-slate-600">
                                          <div className="flex justify-between items-center">
                                            <span>Target:</span>
                                            <span className="font-medium text-slate-800 tabular-nums">
                                              {formatTargetNumber(r.targetNum !== null ? r.targetNum : parsedMasterTarget, ind.unit)}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span>Actual:</span>
                                            <span className="font-medium text-slate-800 tabular-nums">
                                              {r.actualNum !== null ? `${r.actualNum} ${ind.unit || ""}` : "-"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span>Realisasi:</span>
                                            <span className="font-semibold text-blue-700 tabular-nums">
                                              {r.isNotApplicable ? "N/A" : r.realizationPctDisplay}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center pt-0.5">
                                            <span>Band:</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getBandBadgeStyle(r.score, ind.maxScore, r.score === null)}`}>
                                              {r.bandLabel || "Tidak cocok"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center font-bold pt-1.5 border-t border-slate-100 text-slate-800">
                                            <span>Score:</span>
                                            <span className="text-blue-700 tabular-nums">
                                              {r.score !== null ? `${r.score} pt` : "-"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 2C. Hasil Agregasi: Compact Summary di bawah tabel */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <div className="flex items-center gap-3.5 text-slate-600">
                        <span>
                          Terisi <strong className="font-semibold text-slate-800">{filledCount}/12 bulan</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Hasil Agregasi ({assessmentModal.aggregationMethod}):{" "}
                          <strong className="font-semibold text-blue-700 tabular-nums">
                            {actualPeriodeDisplay !== "-" ? `${actualPeriodeDisplay}${ind.unit ? ` ${ind.unit}` : ""}` : "Belum terisi"}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-slate-600">
                        <span>
                          Realisasi:{" "}
                          <strong className="font-semibold text-blue-700 tabular-nums">
                            {actualPeriode !== null ? (periodScoreRes.isNotApplicable ? "N/A" : periodScoreRes.realizationPctDisplay) : "-"}
                          </strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>
                          Score:{" "}
                          <strong className="font-bold text-blue-700 tabular-nums">
                            {actualPeriode === null ? "-" : periodScoreRes.score === null ? "-" : `${periodScoreRes.score} pt`}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2D. Section "Catatan & Bukti" (2 Kolom Desktop, 1 Kolom Mobile) */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-700">Catatan & Bukti</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Kolom Bukti Pendukung */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-600">Bukti Pendukung</label>
                        {assessmentModal.evidenceFileName && (
                          <span className="text-[11px] font-medium text-emerald-600">Terlampir</span>
                        )}
                      </div>

                      {assessmentModal.evidenceFileName ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 min-w-0 mr-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-medium text-slate-800 truncate" title={assessmentModal.evidenceFileName}>
                              {assessmentModal.evidenceFileName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const effectiveParamId = assessmentModal.indicator?.parameterId ?? 0;
                                const list = localEvidenceMap[effectiveParamId] || assessmentModal.indicator?.evidenceList || [];
                                let itemsToView = [...list];
                                if (itemsToView.length === 0 && assessmentModal.evidenceUrl) {
                                  itemsToView = [
                                    {
                                      id: assessmentModal.evidenceId || 0,
                                      appraisalId: initialDetail?.appraisalId || 0,
                                      parameterId: effectiveParamId,
                                      fileName: assessmentModal.evidenceFileName!,
                                      filePath: assessmentModal.evidenceUrl,
                                      fileType: assessmentModal.evidenceFileType || "ATTACHMENT",
                                    },
                                  ];
                                }
                                setEvidenceViewerState({
                                  isOpen: true,
                                  indicatorName: assessmentModal.indicator?.indicatorName,
                                  categoryName: assessmentModal.categoryName,
                                  items: itemsToView,
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                              title="Lihat Pratinjau Dokumen Bukti"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              <span>Lihat Bukti</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (assessmentModal.evidenceId) {
                                  handleDeleteEvidence(assessmentModal.evidenceId);
                                } else {
                                  setAssessmentModal((prev) => ({
                                    ...prev,
                                    evidenceFileName: null,
                                    evidenceUrl: null,
                                    evidenceFileType: null,
                                    evidenceId: null,
                                  }));
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                              title="Hapus berkas bukti"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20 text-xs text-slate-600 cursor-pointer transition">
                          {assessmentModal.isUploadingEvidence ? (
                            <>
                              <span className="inline-block w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              <span>Mengunggah berkas...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5 text-slate-500" />
                              <span>+ Upload File</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
                            disabled={assessmentModal.isUploadingEvidence}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                handleUploadModalEvidence(f);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      )}

                      {/* Tautan jika ada multiple evidence files */}
                      {assessmentModal.indicator?.parameterId &&
                        (localEvidenceMap[assessmentModal.indicator.parameterId] || assessmentModal.indicator.evidenceList || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const effectiveParamId = assessmentModal.indicator!.parameterId!;
                              const list = localEvidenceMap[effectiveParamId] || assessmentModal.indicator!.evidenceList || [];
                              setEvidenceViewerState({
                                isOpen: true,
                                indicatorName: assessmentModal.indicator?.indicatorName,
                                categoryName: assessmentModal.categoryName,
                                items: list,
                              });
                            }}
                            className="text-[11px] text-blue-600 hover:underline font-medium inline-flex items-center gap-1 pt-0.5 cursor-pointer"
                          >
                            <Paperclip className="w-3 h-3 text-blue-500" />
                            <span>Lihat semua ({(localEvidenceMap[assessmentModal.indicator.parameterId] || assessmentModal.indicator.evidenceList || []).length} berkas bukti)</span>
                          </button>
                        )}
                    </div>

                    {/* Kolom Catatan / Komentar */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Catatan / Komentar</label>
                      <textarea
                        rows={2}
                        value={assessmentModal.comment}
                        onChange={(e) =>
                          setAssessmentModal((prev) => ({
                            ...prev,
                            comment: e.target.value,
                          }))
                        }
                        placeholder="Tuliskan keterangan capaian atau catatan penilaian..."
                        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Modal Sticky Footer */}
              <div className={MODAL_TOKENS.colors.footer}>
                <div className="flex items-center text-xs text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2 shrink-0" />
                  <span>Data dari Master Template KPI</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCloseAssessmentModal}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveAssessmentModal}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: "#2563EB", color: "#FFFFFF" }}
                    title="Simpan penilaian dan kembali ke formulir penilaian"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 text-white shrink-0 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 text-white shrink-0" />
                    )}
                    <span>{isSaving ? "Menyimpan..." : "Simpan Penilaian"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================================================== */}
      {/* ================================================== */}
      {/* 4B. POPOVER RINCIAN PERHITUNGAN (REALISASI, BOBOT, SKOR AKHIR) */}
      {/* ================================================== */}
      {popoverAnchor && (() => {
        const pInd = popoverAnchor.indicator;
        const pType = popoverAnchor.type; // "realization" | "weight" | "final_score"

        const pEffectiveScore =
          pInd.annualScore !== null && pInd.annualScore !== undefined
            ? pInd.annualScore
            : pInd.score !== null && pInd.score !== undefined
            ? pInd.score
            : 0;

        const pMaxScore =
          pInd.scoringRules && pInd.scoringRules.length > 0
            ? Math.max(...pInd.scoringRules.map((r) => r.score || 0))
            : (pInd.maxScore ?? 25);

        // Matched band calculation
        const matchedRule = pInd.scoringRules?.find((r) => r.score === pEffectiveScore);
        const pBandDisplay = matchedRule
          ? cleanRuleNumeric(matchedRule, pInd.unit)
          : (pInd.annualBandLabel || pInd.bandLabel || "-");

        const pAch = pInd.annualAchievement ?? pInd.realizationPct;
        const pTargetDisplay =
          pInd.target !== null && pInd.target !== undefined
            ? formatTargetNumber(pInd.target, pInd.unit)
            : null;

        // Actual calculation
        const pActualDisplay = (() => {
          if (pInd.annualActual === null || pInd.annualActual === undefined) return "-";
          if (pInd.unit === "%") {
            return `${pInd.annualActual.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
          }
          if (pInd.unit) {
            return `${pInd.annualActual.toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${pInd.unit}`;
          }
          if (pAch !== null && pAch !== undefined) {
            return `${pAch.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
          }
          return pInd.annualActual.toLocaleString("id-ID", { maximumFractionDigits: 2 });
        })();

        // Weights
        const pParamWeightRaw = popoverAnchor.categoryWeight ?? pInd.parameterWeight ?? 0;
        const pParamWeightPct = Math.round(pParamWeightRaw > 1 ? pParamWeightRaw : pParamWeightRaw * 100);
        const isSingleIndicator = Math.round((pInd.indicatorWeight || 0) * 100) === 100 && pParamWeightPct > 0;
        const pIndicatorWeightPct = isSingleIndicator
          ? pParamWeightPct
          : Math.round((pInd.indicatorWeight || 0) * 100);

        // Bobot: Efektivitas & Rumus
        const pEfektivitasVal = pMaxScore > 0 ? (pEffectiveScore / pMaxScore) * pIndicatorWeightPct : 0;
        const pEfektivitasDisplay = `${pEfektivitasVal.toFixed(1).replace(/\.0$/, "").replace(".", ",")}%`;
        const pWeightFormula = `${pEffectiveScore} / ${pMaxScore} × ${pIndicatorWeightPct}% = ${pEfektivitasDisplay}`;

        // Skor Akhir: Nilai & Rumus
        const pFinalScoreDisplay = pInd.annualFinalScoreDisplay || pInd.finalScoreDisplay || "0.0%";
        const pFinalScoreFormula =
          !isSingleIndicator && pParamWeightPct > 0 && pParamWeightPct < 100
            ? `(${pEffectiveScore} / ${pMaxScore}) × ${pIndicatorWeightPct}% × ${pParamWeightPct}% = ${pFinalScoreDisplay}`
            : `(${pEffectiveScore} / ${pMaxScore}) × ${pIndicatorWeightPct}% = ${pFinalScoreDisplay}`;

        const popoverWidth = 295;
        let popoverLeft = popoverAnchor.rect.left + popoverAnchor.rect.width / 2 - popoverWidth / 2;
        if (typeof window !== "undefined") {
          popoverLeft = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, popoverLeft));
        }

        const popoverEstimatedHeight = 240;
        const opensBelow =
          typeof window !== "undefined"
            ? popoverAnchor.rect.bottom + popoverEstimatedHeight + 12 <= window.innerHeight
            : true;

        const popoverTop = opensBelow
          ? popoverAnchor.rect.bottom + 6
          : Math.max(12, popoverAnchor.rect.top - popoverEstimatedHeight - 6);

        const titleText = "Detail Perhitungan";

        return (
          <>
            {/* DESKTOP POPOVER */}
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={titleText}
              onMouseEnter={handlePopoverMouseEnter}
              onMouseLeave={handlePopoverMouseLeave}
              className="hidden sm:block fixed z-[70] w-[295px] rounded-xl bg-white p-4 shadow-xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 duration-150 select-text"
              style={{
                top: `${popoverTop}px`,
                left: `${popoverLeft}px`,
              }}
            >
              {/* Header Popover */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    {titleText}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate" title={pInd.indicatorName}>
                    {pInd.indicatorCode ? `${pInd.indicatorCode} · ` : ""}{pInd.indicatorName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPopoverAnchor(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition cursor-pointer shrink-0"
                  aria-label="Tutup rincian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Konten Sesuai Tipe Popover */}
              {pType === "realization" && (
                <div className="space-y-2 text-xs">
                  {pTargetDisplay && (
                    <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Target</span>
                      <span className="text-slate-800 font-bold tabular-nums">{pTargetDisplay}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Aktual</span>
                    <span className="text-slate-900 font-bold tabular-nums">{pActualDisplay}</span>
                  </div>
                  {pAch !== null && pAch !== undefined && pInd.unit !== "%" && (
                    <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">% Realisasi</span>
                      <span className="text-blue-900 font-bold tabular-nums">
                        {pAch.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Band</span>
                    <span className="text-slate-900 font-bold">{pBandDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1">
                    <span className="text-slate-500 font-medium">Skor</span>
                    <span className="text-blue-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                  </div>
                </div>
              )}

              {pType === "weight" && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Bobot</span>
                    <span className="text-slate-900 font-bold tabular-nums">{pIndicatorWeightPct}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Skor</span>
                    <span className="text-slate-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Efektivitas</span>
                    <span className="text-blue-900 font-bold tabular-nums">{pEfektivitasDisplay}</span>
                  </div>
                  <div className="pt-2 space-y-1">
                    <span className="text-slate-500 font-medium text-[11px] block">Rumus:</span>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-800 tabular-nums">
                      {pWeightFormula}
                    </div>
                  </div>
                </div>
              )}

              {pType === "final_score" && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Skor</span>
                    <span className="text-slate-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Bobot</span>
                    <span className="text-slate-900 font-bold tabular-nums">{pIndicatorWeightPct}%</span>
                  </div>
                  {pParamWeightPct > 0 && pParamWeightPct < 100 && (
                    <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Bobot Parameter</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pParamWeightPct}%</span>
                    </div>
                  )}
                  <div className="pt-2 space-y-1">
                    <span className="text-slate-500 font-medium text-[11px] block">Rumus:</span>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-800 tabular-nums">
                      {pFinalScoreFormula}
                    </div>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2 bg-blue-50/70 -mx-4 px-4 border-t border-blue-100/80 mt-2">
                    <span className="text-blue-950 font-bold">Skor Akhir</span>
                    <span className="font-extrabold text-sm text-blue-900 tabular-nums">
                      {pFinalScoreDisplay}
                    </span>
                  </div>
                </div>
              )}

              {/* Link Ubah Penilaian */}
              {pInd.isEditable !== false && (
                <button
                  type="button"
                  onClick={() => {
                    const indToEdit = popoverAnchor.indicator;
                    const catNameToEdit = popoverAnchor.categoryName;
                    setPopoverAnchor(null);
                    handleOpenAssessmentModal(indToEdit, catNameToEdit);
                  }}
                  className="mt-2.5 pt-2 border-t border-slate-100 w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3 text-blue-600" />
                  <span>Ubah penilaian</span>
                </button>
              )}
            </div>

            {/* MOBILE BOTTOM SHEET (< sm) */}
            <div className="sm:hidden fixed inset-0 z-[70] flex items-end justify-center">
              <div
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
                onClick={() => setPopoverAnchor(null)}
              />
              <div
                ref={mobileSheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={titleText}
                className="relative z-10 w-full bg-white rounded-t-2xl p-4 shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto"
              >
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />

                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {titleText}
                    </h4>
                    <p className="text-xs text-slate-500 truncate">
                      {pInd.indicatorCode ? `${pInd.indicatorCode} · ` : ""}{pInd.indicatorName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPopoverAnchor(null)}
                    className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                    aria-label="Tutup"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {pType === "realization" && (
                  <div className="space-y-2 text-xs">
                    {pTargetDisplay && (
                      <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium">Target</span>
                        <span className="text-slate-800 font-bold tabular-nums">{pTargetDisplay}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Aktual</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pActualDisplay}</span>
                    </div>
                    {pAch !== null && pAch !== undefined && pInd.unit !== "%" && (
                      <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium">% Realisasi</span>
                        <span className="text-blue-900 font-bold tabular-nums">
                          {pAch.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Band</span>
                      <span className="text-slate-900 font-bold">{pBandDisplay}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-1.5">
                      <span className="text-slate-500 font-medium">Skor</span>
                      <span className="text-blue-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                    </div>
                  </div>
                )}

                {pType === "weight" && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Bobot</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pIndicatorWeightPct}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Skor</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Efektivitas</span>
                      <span className="text-blue-900 font-bold tabular-nums">{pEfektivitasDisplay}</span>
                    </div>
                    <div className="pt-2 space-y-1">
                      <span className="text-slate-500 font-medium text-xs block">Rumus:</span>
                      <div className="bg-slate-50 border border-slate-200/80 rounded-md px-3 py-2 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {pWeightFormula}
                      </div>
                    </div>
                  </div>
                )}

                {pType === "final_score" && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Skor</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pEffectiveScore} pt</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Bobot</span>
                      <span className="text-slate-900 font-bold tabular-nums">{pIndicatorWeightPct}%</span>
                    </div>
                    {pParamWeightPct > 0 && pParamWeightPct < 100 && (
                      <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium">Bobot Parameter</span>
                        <span className="text-slate-900 font-bold tabular-nums">{pParamWeightPct}%</span>
                      </div>
                    )}
                    <div className="pt-2 space-y-1">
                      <span className="text-slate-500 font-medium text-xs block">Rumus:</span>
                      <div className="bg-slate-50 border border-slate-200/80 rounded-md px-3 py-2 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {pFinalScoreFormula}
                      </div>
                    </div>
                    <div className="py-2.5 flex items-center justify-between gap-2 bg-blue-50/70 -mx-4 px-4 border-t border-blue-100/80 mt-2">
                      <span className="text-blue-950 font-bold text-sm">Skor Akhir</span>
                      <span className="font-extrabold text-base text-blue-900 tabular-nums">
                        {pFinalScoreDisplay}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPopoverAnchor(null)}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-center transition cursor-pointer"
                  >
                    Tutup
                  </button>
                  {pInd.isEditable !== false && (
                    <button
                      type="button"
                      onClick={() => {
                        const indToEdit = popoverAnchor.indicator;
                        const catNameToEdit = popoverAnchor.categoryName;
                        setPopoverAnchor(null);
                        handleOpenAssessmentModal(indToEdit, catNameToEdit);
                      }}
                      className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white text-center shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: "#2563EB", color: "#FFFFFF" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Ubah penilaian</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* 8. CRITERIA PENILAIAN MODAL (READ ONLY) */}
      {/* ================================================== */}
      {criteriaModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setCriteriaModalItem(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Scoring Criteria</h3>
                <p className="text-xs text-slate-500 mt-0.5">{criteriaModalItem.indicatorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setCriteriaModalItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {criteriaModalItem.scoringRules && criteriaModalItem.scoringRules.length > 0 ? (
                criteriaModalItem.scoringRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-700">
                      {formatRuleLabel(rule, criteriaModalItem.unit)}
                    </span>
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {rule.score} Poin
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">
                  Tidak ada kriteria penilaian terdaftar.
                </div>
              )}
            </div>

            <p className="mt-3 text-[11px] text-slate-400 text-center">
              Kriteria bersifat Read Only berasal dari Master Template KPI.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setCriteriaModalItem(null)}
                className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ================================================== */}
      {/* 9. MODAL VIEW FORM HASIL (FULL EVALUATION REPORT) */}
      {/* ================================================== */}
      {isResultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsResultModalOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl transition-all">
            {/* Header Dialog */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    FORMULIR HASIL EVALUASI KINERJA (KPI)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Rekapitulasi lengkap capaian indikator dan perhitungan skor akhir tahun {currentYear}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Dropdown Download Penilaian (Pilih Excel / PDF) */}
                <div className="relative" ref={downloadResultRef}>
                  <button
                    type="button"
                    onClick={() => setIsDownloadResultOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer shadow-2xs active:scale-95"
                    title="Download Penilaian"
                    aria-expanded={isDownloadResultOpen}
                    aria-haspopup="true"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download Penilaian</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                        isDownloadResultOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isDownloadResultOpen && (
                    <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                        Pilih Format Dokumen
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDownloadResultOpen(false);
                          handleDownloadEvaluationExcel();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition cursor-pointer text-left"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-800">Download Excel (.xlsx)</div>
                          <div className="text-[10px] text-slate-500">Rekap capaian &amp; detail bulanan</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDownloadResultOpen(false);
                          handleDownloadEvaluationPdf();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-900 transition cursor-pointer text-left border-t border-slate-100/80"
                      >
                        <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-800">Download PDF (.pdf)</div>
                          <div className="text-[10px] text-slate-500">Format formulir resmi siap cetak</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                  title="Tutup Modal"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Employee Information & Summary */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-semibold uppercase text-slate-400">Karyawan</span>
                  <span className="mt-0.5 block text-sm font-bold text-slate-900">
                    {initialDetail?.employee.name || currentEmp?.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    NIK: {initialDetail?.employee.nik || currentEmp?.nik}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold uppercase text-slate-400">Posisi & Dept</span>
                  <span className="mt-0.5 block text-sm font-medium text-slate-800">
                    {initialDetail?.employee.jobPosition || currentEmp?.jobPosition}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {initialDetail?.employee.departmentName || currentEmp?.departmentName}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold uppercase text-slate-400">Master Template & Periode</span>
                  <span className="mt-0.5 block text-sm font-semibold text-slate-800 truncate" title={activeTemplateName}>
                    {activeTemplateName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    Tahun {currentYear} • {overallProgressParameters} Parameter Terisi
                  </span>
                </div>

                <div className="rounded-lg bg-emerald-50 p-2.5 ring-1 ring-emerald-500/20">
                  <span className="block text-[11px] font-semibold uppercase text-emerald-700">Total Skor Akhir Tahunan</span>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-xl font-extrabold text-emerald-800">
                      {liveAnnualOverall.overallScoreDisplay}
                    </span>
                    <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      Grade {liveAnnualOverall.grade}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* TABEL 1: REKAPITULASI PENILAIAN PER PARAMETER & INDIKATOR (FULL UTUH) */}
            <div className="mt-6">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    1. Rekapitulasi Capaian &amp; Skor Akhir KPI
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Rekapitulasi capaian indikator, kriteria penilaian, dan perhitungan skor akhir KPI
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {activeTemplateName && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                      <span className="text-slate-400">Template:</span>
                      <span className="font-semibold text-slate-800">{activeTemplateName}</span>
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-medium">
                    {liveCategories.reduce((acc, c) => acc + c.indicators.length, 0)} Indikator Aktif
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#dbe2ea] bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr
                      className="border-b border-blue-700 text-xs font-semibold text-white select-none bg-blue-600"
                    >
                      <th className="py-2.5 px-4 text-left border-r border-blue-500/60 min-w-[260px] text-white">
                        Parameter
                      </th>
                      <th className="py-2.5 px-3 text-left border-r border-blue-500/60 min-w-[220px] text-white">
                        Kriteria Penilaian / Skor
                      </th>
                      <th className="py-2.5 px-3 text-center border-r border-blue-500/60 min-w-[150px] w-44 text-white">
                        Realisasi
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-blue-500/60 w-20 text-white">
                        Bobot
                      </th>
                      <th className="py-2.5 px-4 text-right w-28 text-white">
                        Skor Akhir
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liveCategories.map((cat) => (
                      <React.Fragment key={cat.categoryId}>
                        {/* Parameter Header Row (Group Header) matching Input Penilaian KPI */}
                        <tr className="bg-slate-100/90 border-t-2 border-slate-200 text-slate-900 font-bold select-none">
                          <td className="px-4 py-2.5 border-r border-[#dbe2ea]">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-[#163a7d] text-[10px] font-bold text-white shrink-0">
                                {cat.categoryNumber}
                              </span>
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                                {cat.categoryName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 font-normal text-xs border-r border-[#dbe2ea]">
                            {cat.indicators.length} Indikator
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-xs border-r border-[#dbe2ea]">
                            -
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-slate-800 font-mono text-xs border-r border-[#dbe2ea]">
                            {Math.round(cat.categoryWeight * 100)}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-extrabold text-[#163a7d] font-mono text-xs">
                            {(cat.annualScorePercentage ?? cat.scorePercentage ?? 0).toFixed(1)}%
                          </td>
                        </tr>

                        {/* Indicator Rows */}
                        {cat.indicators.map((ind) => {
                          const isExpanded = expandedRecapId === ind.appraisalItemId;

                          return (
                            <React.Fragment key={ind.appraisalItemId}>
                              <tr
                                className={`hover:bg-slate-50/80 transition-colors border-b border-[#dbe2ea] ${
                                  isExpanded ? "bg-indigo-50/30" : "bg-white"
                                }`}
                              >
                                {/* 1. Parameter (dengan icon detail ⓘ di samping nama) */}
                                <td className="py-2.5 px-3 pl-8 border-r border-[#dbe2ea] align-top">
                                  <div className="flex items-start gap-2">
                                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0 mt-0.5">
                                      {ind.indicatorCode}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-slate-900 text-xs leading-snug">
                                          {ind.indicatorName}
                                        </span>
                                        {/* Icon detail/info kecil ⓘ di samping nama parameter */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedRecapId((prev) =>
                                              prev === ind.appraisalItemId ? null : ind.appraisalItemId
                                            )
                                          }
                                          className={`inline-flex items-center justify-center w-4.5 h-4.5 rounded-full transition cursor-pointer shrink-0 ${
                                            isExpanded
                                              ? "bg-[#163a7d] text-white shadow-2xs"
                                              : "text-slate-400 hover:text-[#163a7d] hover:bg-slate-100"
                                          }`}
                                          title={
                                            isExpanded
                                              ? "Tutup transparansi perhitungan parameter"
                                              : "Lihat detail parameter & transparansi perhitungan"
                                          }
                                          aria-label={`Detail transparansi perhitungan ${ind.indicatorName}`}
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {/* Target & Ringkasan Parameter */}
                                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                                        <span>
                                          Target:{" "}
                                          <strong className="font-mono font-bold text-slate-700">
                                            {formatTargetNumber(ind.target, ind.unit)}
                                          </strong>
                                        </span>
                                        {ind.aggregation && (
                                          <>
                                            <span className="text-slate-300">•</span>
                                            <span className="text-slate-400">
                                              Agregasi: {ind.aggregation}
                                            </span>
                                          </>
                                        )}
                                      </div>

                                      {ind.indicatorDescription && (
                                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                                          {ind.indicatorDescription}
                                        </div>
                                      )}

                                      {/* Dokumen Bukti Badge jika ada */}
                                      {ind.evidenceList && ind.evidenceList.length > 0 && (
                                        <div className="mt-1.5 flex items-center">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEvidenceViewerState({
                                                isOpen: true,
                                                indicatorName: ind.indicatorName,
                                                categoryName: cat.categoryName,
                                                items: ind.evidenceList || [],
                                              })
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition active:scale-95 cursor-pointer shadow-2xs"
                                            title={`Klik untuk melihat dokumen bukti (${ind.evidenceList.length} berkas)`}
                                          >
                                            <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                                            <span>{ind.evidenceList.length} Bukti Terlampir</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* 2. Kriteria Penilaian – Skor */}
                                <td className="py-2.5 px-3 border-r border-[#dbe2ea] align-top">
                                  <div className="space-y-1">
                                    {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                      <>
                                        {ind.scoringRules.slice(0, 3).map((r, rIdx) => {
                                          const isMatched =
                                            ind.annualScore !== null &&
                                            ind.annualScore !== undefined &&
                                            Number(r.score) === Number(ind.annualScore);

                                          return (
                                            <div
                                              key={rIdx}
                                              className={`flex items-center justify-between gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                                                isMatched
                                                  ? "bg-indigo-50/90 border-indigo-300 text-indigo-950 font-semibold ring-1 ring-indigo-400/30"
                                                  : "bg-slate-50 border-slate-200 text-slate-700"
                                              }`}
                                              title={cleanRuleNumeric(r, ind.unit)}
                                            >
                                              <span className="truncate max-w-[130px]">
                                                {cleanRuleNumeric(r, ind.unit)}
                                              </span>
                                              <div className="flex items-center gap-1 shrink-0">
                                                <span
                                                  className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                                                    isMatched
                                                      ? "bg-[#163a7d] text-white"
                                                      : "bg-white text-indigo-700 border border-indigo-100"
                                                  }`}
                                                >
                                                  {r.score} pt
                                                </span>
                                                {isMatched && (
                                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                                                    ✓
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                        {ind.scoringRules.length > 3 && (
                                          <button
                                            type="button"
                                            onClick={() => setCriteriaModalItem(ind)}
                                            className="text-[10px] text-indigo-600 hover:underline font-medium block pt-0.5"
                                          >
                                            +{ind.scoringRules.length - 3} lainnya...
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs">-</span>
                                    )}
                                  </div>
                                </td>

                                {/* 3. Realisasi (Menampilkan Skor Utama + Ikon Info) */}
                                <td className="py-2.5 px-3 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                  {(() => {
                                    const effectiveScore =
                                      ind.annualScore !== null && ind.annualScore !== undefined
                                        ? ind.annualScore
                                        : ind.score !== null && ind.score !== undefined
                                        ? ind.score
                                        : null;

                                    const hasActual =
                                      (ind.annualActual !== null && ind.annualActual !== undefined) ||
                                      (ind.actualValue !== null && ind.actualValue !== undefined) ||
                                      (ind.annualScore !== null && ind.annualScore !== undefined);

                                    if (!hasActual || effectiveScore === null) {
                                      return <span className="text-slate-400 text-sm font-normal select-none cursor-default">-</span>;
                                    }

                                    const displayScore = `${effectiveScore} pt`;

                                    const isPopoverOpen =
                                      popoverAnchor?.type === "realization" &&
                                      popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;

                                    return (
                                      <button
                                        type="button"
                                        aria-expanded={isPopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Rincian perhitungan realisasi ${ind.indicatorName}, skor ${displayScore}`}
                                        onClick={(e) => handleTriggerClick(e, "realization", ind, cat.categoryName, cat.categoryWeight)}
                                        onMouseEnter={(e) => handleTriggerMouseEnter("realization", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                        onMouseLeave={handleTriggerMouseLeave}
                                        className="group inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-blue-50/80 hover:text-blue-950 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                      >
                                        <span className="tabular-nums font-semibold">
                                          {displayScore}
                                        </span>
                                        <Info
                                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    );
                                  })()}
                                </td>

                                {/* 4. Bobot (Nilai Bobot + Ikon Info) */}
                                <td className="py-2.5 px-2 border-r border-[#dbe2ea] text-center align-middle font-sans">
                                  {(() => {
                                    const isSingleIndicator = cat.indicators.length === 1;
                                    const weightPctVal = isSingleIndicator
                                      ? Math.round((cat.categoryWeight || 0) * 100)
                                      : Math.round((ind.indicatorWeight || 0) * 100);
                                    const weightPctDisplay = `${weightPctVal}%`;
                                    const isPopoverOpen =
                                      popoverAnchor?.type === "weight" &&
                                      popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;

                                    return (
                                      <button
                                        type="button"
                                        aria-expanded={isPopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Rincian perhitungan bobot ${ind.indicatorName}, nilai ${weightPctDisplay}`}
                                        onClick={(e) => handleTriggerClick(e, "weight", ind, cat.categoryName, cat.categoryWeight)}
                                        onMouseEnter={(e) => handleTriggerMouseEnter("weight", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                        onMouseLeave={handleTriggerMouseLeave}
                                        className="group inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-950 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                      >
                                        <span className="tabular-nums font-medium">
                                          {weightPctDisplay}
                                        </span>
                                        <Info
                                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    );
                                  })()}
                                </td>

                                {/* 5. Skor Akhir (Nilai Skor Akhir + Ikon Info) */}
                                <td className="py-2.5 px-4 text-right align-middle font-sans">
                                  {(() => {
                                    const finalScoreStr = ind.annualFinalScoreDisplay || ind.finalScoreDisplay;
                                    if (!finalScoreStr || finalScoreStr === "-") {
                                      return <span className="text-slate-400 text-xs font-normal select-none cursor-default">-</span>;
                                    }

                                    const isFinalPopoverOpen =
                                      popoverAnchor?.type === "final_score" &&
                                      popoverAnchor.indicator.appraisalItemId === ind.appraisalItemId;

                                    return (
                                      <button
                                        type="button"
                                        aria-expanded={isFinalPopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Rincian perhitungan skor akhir ${ind.indicatorName}, hasil ${finalScoreStr}`}
                                        onClick={(e) => handleTriggerClick(e, "final_score", ind, cat.categoryName, cat.categoryWeight)}
                                        onMouseEnter={(e) => handleTriggerMouseEnter("final_score", ind, cat.categoryName, cat.categoryWeight, e.currentTarget)}
                                        onMouseLeave={handleTriggerMouseLeave}
                                        className="group inline-flex items-center justify-end gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-slate-900 hover:bg-blue-50/80 hover:text-blue-950 transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 active:scale-95"
                                      >
                                        <span className="tabular-nums font-bold">
                                          {finalScoreStr}
                                        </span>
                                        <Info
                                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    );
                                  })()}
                                </td>
                              </tr>

                              {/* Expandable Detail Drawer: Transparansi Perhitungan Lengkap */}
                              {isExpanded && (
                                <tr className="bg-slate-50/80 border-b border-[#dbe2ea]">
                                  <td colSpan={5} className="px-6 py-4">
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
                                      {/* Header Drawer Info */}
                                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex items-center gap-2.5">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#163a7d] text-white text-xs font-bold">
                                            ⓘ
                                          </span>
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono text-xs font-bold text-slate-500">
                                                {ind.indicatorCode}
                                              </span>
                                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                                Transparansi Perhitungan: {ind.indicatorName}
                                              </h4>
                                            </div>
                                            {ind.indicatorDescription && (
                                              <p className="text-[11px] text-slate-500 mt-0.5">
                                                {ind.indicatorDescription}
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        {/* Quick Metrics Badges */}
                                        <div className="flex items-center gap-2 text-xs flex-wrap font-mono">
                                          <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
                                            Satuan: <strong className="text-slate-900">{ind.unit || "%"}</strong>
                                          </span>
                                          <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
                                            Target:{" "}
                                            <strong className="text-slate-900">
                                              {formatTargetNumber(ind.target, ind.unit)}
                                            </strong>
                                          </span>
                                          <span className="px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-900">
                                            Realisasi:{" "}
                                            <strong className="text-indigo-700">
                                              {ind.annualActual !== null
                                                ? formatActualNumber(ind.annualActual, ind.unit)
                                                : "-"}
                                            </strong>
                                          </span>
                                          <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                                            Skor: {ind.annualScore !== null ? `${ind.annualScore} pt` : "-"}
                                          </span>
                                        </div>
                                      </div>

                                      {/* 1. Formula & Metode Agregasi */}
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                                        <div>
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                            Metode Agregasi
                                          </span>
                                          <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                                            {ind.aggregation || "AVERAGE"}
                                          </span>
                                          <span className="text-[10px] text-slate-500 block">
                                            {ind.aggregation === "SUM"
                                              ? "Penjumlahan seluruh aktual bulanan"
                                              : ind.aggregation === "LAST_VALUE"
                                              ? "Nilai aktual bulan terakhir yang terisi"
                                              : "Rata-rata aktual bulan yang terisi"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                            Basis Komparasi
                                          </span>
                                          <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                                            {ind.compareBasis || "ACTUAL"}
                                          </span>
                                          <span className="text-[10px] text-slate-500 block">
                                            {ind.compareBasis === "ACHIEVEMENT"
                                              ? "Dibandingkan % achievement (Actual / Target)"
                                              : "Dibandingkan langsung ke nilai aktual"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                            Formula Skor Akhir
                                          </span>
                                          <span className="font-bold text-indigo-700 font-mono mt-0.5 block">
                                            Skor ({ind.annualScore ?? 0}) × Bobot ({Math.round(ind.indicatorWeight * 100)}%) = {ind.finalScoreDisplay}
                                          </span>
                                          <span className="text-[10px] text-slate-500 block">
                                            Kontribusi ke Parameter: {ind.finalScoreDisplay}
                                          </span>
                                        </div>
                                      </div>

                                      {/* 2. Breakdown Capaian per Bulan (Jan - Des) */}
                                      <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                            📅 Rincian Inputan Realisasi 12 Bulan (Januari - Desember {currentYear})
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-mono">
                                            {SHORT_MONTH_NAMES.filter(
                                              (_, idx) =>
                                                ind.monthlyDetails?.[idx]?.actual !== null &&
                                                ind.monthlyDetails?.[idx]?.actual !== undefined
                                            ).length}{" "}
                                            Bulan Terisi
                                          </span>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                          <table className="w-full text-center text-xs border-collapse">
                                            <thead>
                                              <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                                                <th className="py-1.5 px-2 text-left w-20">Data</th>
                                                {SHORT_MONTH_NAMES.map((m) => (
                                                  <th key={m} className="py-1.5 px-1.5 min-w-[45px]">
                                                    {m}
                                                  </th>
                                                ))}
                                                <th className="py-1.5 px-2 bg-slate-200/60 font-bold">Total/Avg</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                                              {/* Baris Target */}
                                              <tr className="hover:bg-slate-50/50">
                                                <td className="py-1 px-2 text-left text-slate-500 font-sans font-medium text-[10px]">
                                                  Target
                                                </td>
                                                {SHORT_MONTH_NAMES.map((_, idx) => {
                                                  const mTarget = ind.monthlyDetails?.[idx]?.target ?? ind.target;
                                                  return (
                                                    <td key={idx} className="py-1 px-1.5 text-slate-500">
                                                      {mTarget !== null && mTarget !== undefined
                                                        ? formatTargetNumber(mTarget, ind.unit)
                                                        : "-"}
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-1 px-2 bg-slate-50 font-bold text-slate-700">
                                                  {formatTargetNumber(ind.target, ind.unit)}
                                                </td>
                                              </tr>
                                              {/* Baris Aktual */}
                                              <tr className="hover:bg-slate-50/50 bg-indigo-50/20 font-semibold">
                                                <td className="py-1 px-2 text-left text-indigo-900 font-sans font-bold text-[10px]">
                                                  Aktual
                                                </td>
                                                {SHORT_MONTH_NAMES.map((_, idx) => {
                                                  const mAct = ind.monthlyDetails?.[idx]?.actual;
                                                  return (
                                                    <td key={idx} className="py-1 px-1.5 text-slate-900">
                                                      {mAct !== null && mAct !== undefined ? (
                                                        formatActualNumber(mAct, ind.unit)
                                                      ) : (
                                                        <span className="text-slate-300">-</span>
                                                      )}
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-1 px-2 bg-indigo-50/60 font-extrabold text-indigo-700">
                                                  {ind.annualActual !== null
                                                    ? formatActualNumber(ind.annualActual, ind.unit)
                                                    : "-"}
                                                </td>
                                              </tr>
                                              {/* Baris Skor Bulanan */}
                                              <tr className="hover:bg-slate-50/50 text-[10px]">
                                                <td className="py-1 px-2 text-left text-slate-500 font-sans font-medium">
                                                  Skor Poin
                                                </td>
                                                {SHORT_MONTH_NAMES.map((_, idx) => {
                                                  const mScore = ind.monthlyDetails?.[idx]?.score;
                                                  return (
                                                    <td key={idx} className="py-1 px-1.5 text-slate-600">
                                                      {mScore !== null && mScore !== undefined ? (
                                                        `${mScore} pt`
                                                      ) : (
                                                        <span className="text-slate-300">-</span>
                                                      )}
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-1 px-2 bg-slate-50 font-bold text-indigo-700">
                                                  {ind.annualScore !== null ? `${ind.annualScore} pt` : "-"}
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                      {/* 3. Tingkatan Rentang Band Kriteria (dengan Matched Highlight) */}
                                      <div>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                                          🎯 Tingkatan Kriteria Penilaian &amp; Band yang Tercapai
                                        </span>
                                        {ind.scoringRules && ind.scoringRules.length > 0 ? (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            {ind.scoringRules.map((rule, rIdx) => {
                                              const isMatched =
                                                ind.annualScore !== null &&
                                                ind.annualScore !== undefined &&
                                                Number(rule.score) === Number(ind.annualScore);
                                              return (
                                                <div
                                                  key={rIdx}
                                                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                                                    isMatched
                                                      ? "bg-indigo-50/90 border-indigo-300 text-indigo-950 ring-1 ring-indigo-400/30 shadow-2xs font-semibold"
                                                      : "bg-slate-50 border-slate-200 text-slate-700"
                                                  }`}
                                                >
                                                  <div>
                                                    <span className="font-semibold block font-mono">
                                                      {formatRuleLabel(rule, ind.unit)}
                                                    </span>
                                                    {rule.label &&
                                                      rule.label !== formatRuleLabel(rule, ind.unit) && (
                                                        <span className="text-[10px] text-slate-400 block mt-0.5">
                                                          {rule.label}
                                                        </span>
                                                      )}
                                                  </div>
                                                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                                    <span
                                                      className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded ${
                                                        isMatched
                                                          ? "bg-[#163a7d] text-white"
                                                          : "bg-white text-slate-600 border border-slate-200"
                                                      }`}
                                                    >
                                                      {rule.score} pt
                                                    </span>
                                                    {isMatched && (
                                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
                                                        TERCAPAI
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-400 italic">
                                            Tidak ada aturan scoring band spesifik.
                                          </p>
                                        )}
                                      </div>

                                      {/* 4. Catatan Penilai & Dokumen Bukti */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                                        <div>
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                            Catatan Penilai (Realisasi Tahunan)
                                          </span>
                                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs min-h-[48px]">
                                            {ind.annualNotes || ind.notes || (
                                              <span className="text-slate-400 italic">
                                                Tidak ada catatan penilai khusus untuk indikator ini.
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                            Dokumen Bukti (Evidence) Terlampir
                                          </span>
                                          {ind.evidenceList && ind.evidenceList.length > 0 ? (
                                            <div className="space-y-1.5">
                                              {ind.evidenceList.map((ev, evIdx) => (
                                                <div
                                                  key={ev.id || evIdx}
                                                  className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-900 text-xs"
                                                >
                                                  <div className="flex items-center gap-2 truncate mr-2">
                                                    <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                    <span className="truncate font-medium">{ev.fileName}</span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setEvidenceViewerState({
                                                        isOpen: true,
                                                        indicatorName: ind.indicatorName,
                                                        categoryName: cat.categoryName,
                                                        items: ind.evidenceList || [],
                                                        initialIndex: evIdx,
                                                      })
                                                    }
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition shrink-0 cursor-pointer"
                                                  >
                                                    <Eye className="w-3 h-3" />
                                                    <span>Lihat</span>
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 text-xs italic min-h-[48px] flex items-center">
                                              Belum ada berkas dokumen bukti yang dilampirkan.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {/* Overall Summary Row (5 Kolom) */}
                    <tr className="bg-emerald-50/80 font-bold text-emerald-950 border-t-2 border-emerald-300">
                      <td colSpan={2} className="px-4 py-3 text-left font-bold text-xs">
                        TOTAL HASIL PENILAIAN AKHIR KPI (TAHUNAN)
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                          Grade {liveAnnualOverall.grade}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center font-bold text-slate-900 font-mono text-xs">
                        {initialDetail?.templateId ? "115%" : "100%"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-800 font-extrabold font-mono">
                        {liveAnnualOverall.overallScoreDisplay}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABEL 2: MATRIKS REALISASI BULANAN LENGKAP (JAN - DES) */}
            <div className="mt-6">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Matriks Hasil Inputan Bulanan (Januari - Desember)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Rekapitulasi pencatatan nilai realisasi aktual per bulan tahun {currentYear}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  12 Bulan Rekap
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold text-slate-700">
                      <th className="px-3 py-2.5 min-w-[180px]">Indikator KPI</th>
                      <th className="px-2 py-2.5 text-right">Target</th>
                      {SHORT_MONTH_NAMES.map((m) => (
                        <th key={m} className="px-2 py-2.5 text-right min-w-[50px]">
                          {m}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right bg-slate-200/50">Rata-rata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liveCategories.flatMap((cat) =>
                      cat.indicators.map((ind) => (
                        <tr key={ind.appraisalItemId} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            <span className="text-slate-400 mr-1.5">{ind.indicatorCode}</span>
                            {ind.indicatorName}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-600 font-mono">
                            {formatTargetNumber(ind.target, ind.unit)}
                          </td>
                          {(ind.monthlyDetails || []).map((m) => (
                            <td
                              key={m.month}
                              className={`px-2 py-2 text-right ${
                                m.actual !== null ? "font-semibold text-slate-900" : "text-slate-300"
                              }`}
                            >
                              {m.actual !== null ? m.actual.toLocaleString("id-ID") : "-"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-indigo-700 bg-slate-50/50">
                            {ind.annualActual !== null ? ind.annualActual.toLocaleString("id-ID") : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Box (4-Tier Hierarchy) */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-xs">
                {/* 1. Karyawan */}
                <div>
                  <span className="text-slate-400 block mb-12">Karyawan Yang Dinilai</span>
                  <div className="font-bold text-slate-900 underline">
                    {initialDetail?.employee.name || currentEmp?.name || "-"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    NIK: {initialDetail?.employee.nik || currentEmp?.nik || "-"}
                  </div>
                </div>

                {/* 2. Penilai */}
                <div>
                  <span className="text-slate-400 block mb-12">Penilai (Supervisor)</span>
                  <div className="font-bold text-slate-900 underline">
                    {approvalLine?.appraiser?.name || "Atasan Langsung"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {approvalLine?.appraiser?.jobPosition || "Supervisor"}
                  </div>
                </div>

                {/* 3. Head Dept */}
                <div>
                  <span className="text-slate-400 block mb-12">Head Department</span>
                  <div className="font-bold text-slate-900 underline">
                    {approvalLine?.headDept?.name || "Head Department"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {approvalLine?.headDept?.jobPosition || "Head Dept"}
                  </div>
                </div>

                {/* 4. Manager / HR */}
                <div>
                  <span className="text-slate-400 block mb-12">Manager Divisi</span>
                  <div className="font-bold text-slate-900 underline">
                    {approvalLine?.manager?.name || "Manager"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {approvalLine?.manager?.jobPosition || "Manager"}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsResultModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleDownloadEvaluationExcel}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer active:scale-95"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Download Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadEvaluationPdf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition cursor-pointer active:scale-95"
              >
                <FileText className="h-4 w-4" />
                <span>Download PDF (.pdf)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 7. MODAL CUSTOM KPI */}
      {/* ================================================== */}
      {initialDetail?.appraisalId && (
        <CustomKpiModal
          isOpen={customKpiModalState.isOpen}
          onClose={() => setCustomKpiModalState((prev) => ({ ...prev, isOpen: false }))}
          appraisalId={initialDetail.appraisalId}
          categoryId={customKpiModalState.categoryId}
          categoryName={customKpiModalState.categoryName}
        />
      )}

      {/* ================================================== */}
      {/* 8. MODAL CALCULATION TRACE (AUDIT TRAIL) */}
      {/* ================================================== */}
      <CalculationTraceModal
        isOpen={traceModalState.isOpen}
        onClose={() => setTraceModalState((prev) => ({ ...prev, isOpen: false }))}
        appraisalItemId={traceModalState.appraisalItemId}
        initialMonth={traceModalState.month}
        indicatorName={traceModalState.indicatorName}
        categoryName={traceModalState.categoryName}
        unit={traceModalState.unit}
      />

      {/* ================================================== */}
      {/* 9. MODAL TIPS PERHITUNGAN PENILAIAN KPI            */}
      {/* ================================================== */}
      {isTipsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Tips & Panduan Perhitungan KPI
                  </h3>
                  <p className="text-xs text-slate-500">
                    Penjelasan ringkas mengenai cara kerja indikator, skor, bobot, dan prorate
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTipsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-4 text-xs text-slate-600">
              {/* Card 1: Target, Realisasi & Achievement */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 font-mono text-[11px]">
                    1
                  </span>
                  <span>Target vs Realisasi & Achievement</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-7">
                  <strong className="text-slate-800">Target</strong> adalah angka sasaran kerja yang ditetapkan.
                  <strong className="text-slate-800"> Realisasi</strong> adalah pencapaian nyata bulanan/tahunan yang diinput oleh penilai.
                  Persentase <strong className="text-emerald-700">Achievement (%)</strong> dihitung dari{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[11px]">(Realisasi / Target) × 100%</code>.
                </p>
              </div>

              {/* Card 2: Kriteria & Skor */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-700 font-mono text-[11px]">
                    2
                  </span>
                  <span>Kriteria Penilaian & Penentuan Skor (1 - 25 Poin)</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-7">
                  Setiap indikator memiliki skala kriteria scoring dari Master Template. Sistem mencocokkan Realisasi secara otomatis ke rentang kriteria untuk menghasilkan skor poin (maksimal 25 poin).
                </p>
              </div>

              {/* Card 3: Bobot & Skor Akhir */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-700 font-mono text-[11px]">
                    3
                  </span>
                  <span>Bobot & Skor Akhir Indikator</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-7">
                  <strong className="text-slate-800">Bobot</strong> menentukan porsi kontribusi indikator terhadap parameter.
                  <strong className="text-slate-800"> Skor Akhir</strong> dihitung dengan rumus:{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[11px]">(Skor ÷ 25) × 100 × Bobot Indikator</code>.
                </p>
              </div>

              {/* Card 4: Skema Prorate */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 font-mono text-[11px]">
                    4
                  </span>
                  <span>Skema Prorate (Karyawan Baru / Mutasi)</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-7">
                  Bagi karyawan yang aktif sebagian bulan dalam 1 tahun kalender (misalnya baru bergabung pada pertengahan tahun), sistem secara adil hanya menghitung bulan-bulan saat karyawan aktif. Target dan skor disesuaikan proporsional tanpa penalti bulan kosong sebelum tanggal bergabung.
                </p>
              </div>

              {/* Card 5: Tips Pengisian & Alur */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 font-mono text-[11px]">
                    5
                  </span>
                  <span>Penyimpanan Draft & Persetujuan Berjenjang</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-7">
                  Perubahan input otomatis tersimpan sebagai draft. Setelah seluruh indikator selesai dievaluasi, atasan dapat mengirim penilaian untuk diverifikasi oleh Head Dept, Manager, hingga HR Approval.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setIsTipsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 6. MODAL RIWAYAT & AUDIT TRAIL                     */}
      {/* ================================================== */}
      {isAuditModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
        >
          <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-4 shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="audit-modal-title" className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    Riwayat & Monitoring Penilaian (Audit Trail)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Monitoring penilai paralel dan riwayat pengajuan KPI periode {currentYear}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Tutup dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-6 text-slate-800 bg-slate-50/30">
              {/* Section 1: Monitoring Penilai Paralel */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Monitoring Penilai Paralel
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Setiap penilai bekerja secara independen pada parameter masing-masing
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th scope="col" className="py-2.5 px-3.5 text-left font-semibold text-slate-600">
                          Penilai (Asesor)
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold text-slate-600">
                          Parameter Ditugaskan
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-center font-semibold text-slate-600">
                          Kelengkapan Indikator
                        </th>
                        <th scope="col" className="py-2.5 px-3.5 text-right font-semibold text-slate-600">
                          Status Penilaian
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {initialDetail?.assessorProgress && initialDetail.assessorProgress.length > 0 ? (
                        initialDetail.assessorProgress.map((p) => {
                          const pct =
                            p.totalIndicators > 0
                              ? Math.round((p.filledIndicators / p.totalIndicators) * 100)
                              : 0;
                          return (
                            <tr key={p.assessorId} className="hover:bg-slate-50/60 transition">
                              <td className="py-3 px-3.5">
                                <div className="font-semibold text-slate-900">{p.assessorName}</div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  NIK: {p.assessorNik}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {p.categoryNames?.map((cName: string) => (
                                    <span
                                      key={cName}
                                      className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100"
                                    >
                                      {cName}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <div className="font-medium text-slate-700">
                                  {p.filledIndicators} / {p.totalIndicators} Indikator ({pct}%)
                                </div>
                                <div className="w-24 mx-auto mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      p.isSubmitted
                                        ? "bg-emerald-500"
                                        : pct === 100
                                        ? "bg-sky-500"
                                        : "bg-amber-400"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                {p.isSubmitted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Terkirim
                                  </span>
                                ) : pct === 100 ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
                                    <CheckCheck className="w-3 h-3 text-sky-600" />
                                    Siap Dikirim
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                                    Draft ({p.filledIndicators}/{p.totalIndicators})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-xs text-slate-400 italic">
                            Tidak ada penugasan asesor spesifik. Penilaian dilakukan oleh atasan langsung default.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Timeline Riwayat & Audit Trail */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Clock3 className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Riwayat Pengiriman, Persetujuan & Revisi
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  {initialDetail?.approvalLogs && initialDetail.approvalLogs.length > 0 ? (
                    <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {initialDetail.approvalLogs.map((log) => {
                        const { label, badgeClass } = formatAuditActionLabel(log.action);
                        return (
                          <div key={log.id} className="relative group">
                            {/* Timeline dot */}
                            <span className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-4 ring-white border-2 border-indigo-600" />
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">{log.actorName}</span>
                                  {log.actorRole && (
                                    <span className="text-[11px] text-slate-400">• {log.actorRole}</span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold border ${badgeClass}`}
                                  >
                                    {label}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400 tabular-nums">
                                  {formatAuditDate(log.createdAt)}
                                </span>
                              </div>
                              {log.notes && (
                                <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700 leading-relaxed">
                                  "{log.notes}"
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                      <Clock3 className="w-6 h-6 mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="font-medium text-slate-600">Belum ada riwayat aktivitas</p>
                      <p className="text-[11px]">
                        Seluruh log pengiriman, persetujuan, dan revisi akan tercatat di sini secara otomatis.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                ID Dokumen: #{initialDetail?.appraisalId || "-"}
              </span>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Viewer Modal (Pratinjau Dokumen Bukti) */}
      <EvidenceViewerModal
        isOpen={evidenceViewerState.isOpen}
        onClose={() => setEvidenceViewerState((prev) => ({ ...prev, isOpen: false }))}
        indicatorName={evidenceViewerState.indicatorName}
        categoryName={evidenceViewerState.categoryName}
        items={evidenceViewerState.items}
        initialIndex={evidenceViewerState.initialIndex}
        onDelete={handleDeleteEvidence}
        isReadOnly={userRole === "EMPLOYEE"}
      />

      {/* Modal Upload Penilaian Excel (Batch Multi-Parameter) */}
      {initialDetail?.appraisalId && (
        <BatchExcelUploadModal
          isOpen={isBatchExcelModalOpen}
          onClose={() => setIsBatchExcelModalOpen(false)}
          appraisalId={initialDetail.appraisalId}
          employeeName={initialDetail.employee.name}
          employeeNik={initialDetail.employee.nik}
          departmentName={initialDetail.employee.departmentName}
          periodYear={initialDetail.period.year}
          availableIndicators={extractMatchingTargetsFromCategories(initialDetail.categories || [])}
          onSuccess={() => {
            router.refresh();
          }}
          onEvidenceUpdated={async () => {
            if (initialDetail?.appraisalId) {
              try {
                const res = await fetch(`/api/evidence?appraisalId=${initialDetail.appraisalId}`);
                const data = await res.json();
                if (data.success && Array.isArray(data.evidence)) {
                  const map: Record<number, AppraisalEvidenceItem[]> = {};
                  for (const ev of data.evidence) {
                    if (ev.parameterId) {
                      if (!map[ev.parameterId]) map[ev.parameterId] = [];
                      map[ev.parameterId].push(ev);
                    }
                  }
                  setLocalEvidenceMap(map);
                }
              } catch (err) {
                console.error("Gagal sinkronisasi bukti:", err);
              }
            }
          }}
        />
      )}

    </div>
  );
}
