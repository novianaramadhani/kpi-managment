"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  X,
  Loader2,
  Settings,
} from "lucide-react";
import type { KpiCategory, KpiParameter, KpiBand, KpiCalculationRule } from "@/db/schema";
import Swal from "sweetalert2";
import { parseConditionString, extractCriteriaValue } from "@/lib/excel-template-kpi";
import {
  batchUpdateTemplateStructure,
  type BatchBandUpdatePayload,
} from "@/lib/actions";

export interface KpiModernSpreadsheetProps {
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
  calculationRules?: KpiCalculationRule[];
  templateTargetPct?: number;
  expandedCategoryIds: Set<number>;
  onToggleCategory: (catId: number) => void;
  categoryIssuesMap?: Map<
    number,
    boolean | string | { severity?: "INFO" | "WARNING" | "ERROR"; message?: string }
  >;
  highlightedIds?: {
    categoryId?: number;
    parameterId?: number;
    bandId?: number;
  };
  onUpdateCategory?: (catId: number, data: { name?: string; weight?: number }) => Promise<void>;
  onDeleteCategory?: (cat: KpiCategory) => Promise<void>;
  onUpdateIndicatorWeight?: (ind: KpiParameter, newWeight: number) => Promise<void>;
  onAddIndicator?: (catId: number) => void;
  onEditIndicator?: (catId: number, ind: KpiParameter) => void;
  onDeleteIndicator?: (ind: KpiParameter) => Promise<void>;
  onDuplicateIndicator?: (paramId: number) => Promise<void>;
  onMoveIndicatorOrder?: (param: KpiParameter, direction: "UP" | "DOWN") => Promise<void>;
  onAddCriteriaBand?: (paramId: number) => void;
  onEditCriteriaBand?: (band: KpiBand, param: KpiParameter) => void;
  onDeleteCriteriaBand?: (bandId: number) => Promise<void>;
  onMoveBandOrder?: (band: KpiBand, direction: "UP" | "DOWN") => Promise<void>;
  isEditTemplateMode?: boolean;
  onToggleEditTemplateMode?: () => void;
  templateId?: number;
}

// Helper untuk memformat Kondisi, Nilai / Range, dan Skor
function formatCriteriaValues(band: KpiBand, unit?: string | null) {
  const u = (unit || "").trim();
  const rawOp = (band.operator || "GTE").toUpperCase();
  const min =
    band.minValue !== null && band.minValue !== undefined && band.minValue !== ""
      ? Number(band.minValue)
      : null;
  const max =
    band.maxValue !== null && band.maxValue !== undefined && band.maxValue !== ""
      ? Number(band.maxValue)
      : null;
  const scoreNum =
    band.score !== null && band.score !== undefined ? Number(band.score) : 0;
  const score = !isNaN(scoreNum) ? scoreNum.toFixed(2) : "0.00";

  let condition = "";
  let valueRange = "";

  if (rawOp === "TEXT") {
    condition = band.label || (band.minValue ? String(band.minValue) : "Pilihan Teks");
    valueRange = "-";
  } else if (rawOp === "NEQ") {
    condition = `≠ "${band.label || band.minValue || "-"}"`;
    valueRange = "-";
  } else if (rawOp === "CONTAINS") {
    condition = `Contains "${band.label || band.minValue || "-"}"`;
    valueRange = "-";
  } else if (rawOp === "EQ" && (u.toLowerCase() === "teks" || min === null || isNaN(min))) {
    condition = band.label || (band.minValue ? String(band.minValue) : "Pilihan Teks");
    valueRange = "-";
  } else if (rawOp === "BETWEEN") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    condition = `${min ?? 0}${unitSuffix} - ${max ?? 100}${unitSuffix}`;
    valueRange = `${min ?? 0} - ${max ?? 100}`;
  } else if (rawOp === "GTE" || rawOp === "GREATER_EQUAL") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    condition = `≥ ${min ?? 0}${unitSuffix}`;
    valueRange = min !== null ? String(min) : "-";
  } else if (rawOp === "GT" || rawOp === "GREATER_THAN") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    condition = `> ${min ?? 0}${unitSuffix}`;
    valueRange = min !== null ? `> ${min}` : "-";
  } else if (rawOp === "LTE" || rawOp === "LESS_EQUAL") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    const v = max ?? min ?? 0;
    condition = `≤ ${v}${unitSuffix}`;
    valueRange = `0 - ${v}`;
  } else if (rawOp === "LT" || rawOp === "LESS_THAN") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    const v = max ?? min ?? 0;
    condition = `< ${v}${unitSuffix}`;
    valueRange = `0 - ${v > 0 ? v - 1 : 0}`;
  } else if (rawOp === "EQ" || rawOp === "EQUAL") {
    const unitSuffix = u === "%" ? "%" : u ? ` ${u}` : "";
    condition = `= ${min ?? 0}${unitSuffix}`;
    valueRange = String(min ?? 0);
  } else {
    condition = band.label || String(min ?? "-");
    valueRange = min !== null ? (max !== null ? `${min} - ${max}` : String(min)) : "-";
  }

  // Jika ada label terformat spesifik atau teks keterangan kualitatif (e.g. "Sangat Baik", "Baik", "Kurang")
  if (band.label && band.label.trim()) {
    const lbl = band.label.trim();
    if (/^[><=≥≤\d]/.test(lbl) || lbl.includes("%") || lbl.includes("-")) {
      condition = lbl;
    } else if (condition && !lbl.toLowerCase().includes(condition.toLowerCase())) {
      condition = `${condition} (${lbl})`;
    } else if (!condition) {
      condition = lbl;
    }
  }

  // Ekstraksi terpisah: Operator pembanding & Nilai kriteria
  let operatorSymbol = "=";
  let criteriaValue = condition;
  let isUnrecognizedOperator = false;

  const rawText = (band.label && band.label.trim()) || condition;
  const parsed = parseConditionString(rawText);

  if (parsed.isUnrecognizedOperator) {
    operatorSymbol = "?";
    isUnrecognizedOperator = true;
    criteriaValue = parsed.criteriaValue || rawText;
  } else if (parsed.operatorSymbol && parsed.operatorSymbol !== "Teks") {
    operatorSymbol = parsed.operatorSymbol;
    criteriaValue = parsed.criteriaValue || rawText;
  } else if (rawOp === "LT" || rawOp === "LESS_THAN") {
    operatorSymbol = "<";
    criteriaValue = extractCriteriaValue(rawText, "LT") || rawText;
  } else if (rawOp === "LTE" || rawOp === "LESS_EQUAL") {
    operatorSymbol = "<=";
    criteriaValue = extractCriteriaValue(rawText, "LTE") || rawText;
  } else if (rawOp === "GT" || rawOp === "GREATER_THAN") {
    operatorSymbol = ">";
    criteriaValue = extractCriteriaValue(rawText, "GT") || rawText;
  } else if (rawOp === "GTE" || rawOp === "GREATER_EQUAL") {
    operatorSymbol = ">=";
    criteriaValue = extractCriteriaValue(rawText, "GTE") || rawText;
  } else if (rawOp === "BETWEEN") {
    operatorSymbol = "Rentang";
    criteriaValue = extractCriteriaValue(rawText, "BETWEEN") || rawText;
  } else if (rawOp === "TEXT") {
    operatorSymbol = "Teks";
    criteriaValue = rawText;
  } else if (rawOp === "EQ" || rawOp === "EQUAL") {
    operatorSymbol = "=";
    criteriaValue = extractCriteriaValue(rawText, "EQ") || rawText;
  }

  // Jika criteriaValue masih diawali simbol operator, bersihkan agar benar-benar terpisah
  if (operatorSymbol === "<" || operatorSymbol === ">" || operatorSymbol === "=") {
    criteriaValue = criteriaValue.replace(/^[<>=≤≥\s]+/, "").trim();
  } else if (operatorSymbol === "<=" || operatorSymbol === ">=") {
    criteriaValue = criteriaValue.replace(/^(?:<=|>=|≤|≥|=<|=>|\s)+/, "").trim();
  }

  if (!criteriaValue) {
    criteriaValue = rawText;
  }

  return { condition, valueRange, score, operatorSymbol, criteriaValue, isUnrecognizedOperator };
}

export function renderOperatorBadge(operatorSymbol: string, isUnrecognizedOperator?: boolean) {
  let colorClasses = "bg-slate-50 text-slate-600 border-slate-200";

  if (isUnrecognizedOperator || operatorSymbol === "?") {
    colorClasses = "bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300";
  } else if (operatorSymbol === "<" || operatorSymbol === "<=" || operatorSymbol === "≤") {
    colorClasses = "bg-rose-50 text-rose-500 border-rose-200";
  } else if (operatorSymbol === "=") {
    colorClasses = "bg-blue-50 text-blue-500 border-blue-200";
  } else if (operatorSymbol === ">" || operatorSymbol === ">=" || operatorSymbol === "≥") {
    colorClasses = "bg-emerald-50 text-emerald-600 border-emerald-200";
  } else if (operatorSymbol === "Rentang") {
    colorClasses = "bg-purple-50 text-purple-600 border-purple-200";
  } else if (operatorSymbol === "Teks") {
    colorClasses = "bg-slate-50 text-slate-600 border-slate-200";
  }

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[40px] px-1.5 h-6 text-xs font-bold font-mono rounded border shadow-2xs select-none ${colorClasses}`}
      title={`Operator: ${operatorSymbol}`}
    >
      {operatorSymbol}
    </span>
  );
}
export function renderEditableOperatorCell(
  bandId: number,
  currentOp: string,
  draftBands: Record<number, { operatorSymbol: string; criteriaValue: string; score: string }>,
  onChange: (bandId: number, field: "operatorSymbol" | "criteriaValue" | "score", value: string) => void
) {
  const val = draftBands[bandId]?.operatorSymbol ?? currentOp;
  return (
    <select
      value={val}
      onChange={(e) => onChange(bandId, "operatorSymbol", e.target.value)}
      aria-label="Pilih operator kriteria"
      className="w-full min-w-[56px] max-w-[76px] h-7 px-1 text-xs font-mono font-bold text-center bg-white border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer mx-auto block"
    >
      <option value="<">&lt;</option>
      <option value="<=">&le;</option>
      <option value="=">=</option>
      <option value=">">&gt;</option>
      <option value=">=">&ge;</option>
      <option value="Rentang">Rentang</option>
      <option value="Teks">Teks</option>
    </select>
  );
}

export function renderEditableCriteriaCell(
  bandId: number,
  currentVal: string,
  draftBands: Record<number, { operatorSymbol: string; criteriaValue: string; score: string }>,
  onChange: (bandId: number, field: "operatorSymbol" | "criteriaValue" | "score", value: string) => void
) {
  const val = draftBands[bandId]?.criteriaValue ?? currentVal;
  return (
    <input
      type="text"
      value={val}
      onChange={(e) => onChange(bandId, "criteriaValue", e.target.value)}
      placeholder="Nilai Kriteria"
      aria-label="Nilai kriteria"
      className="w-full h-7 px-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
    />
  );
}

export function renderEditableScoreCell(
  bandId: number,
  currentScore: string,
  draftBands: Record<number, { operatorSymbol: string; criteriaValue: string; score: string }>,
  onChange: (bandId: number, field: "operatorSymbol" | "criteriaValue" | "score", value: string) => void
) {
  const val = draftBands[bandId]?.score ?? currentScore;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={val}
      onChange={(e) => onChange(bandId, "score", e.target.value)}
      placeholder="0"
      aria-label="Skor kriteria"
      className="w-16 h-7 px-1.5 text-xs font-bold tabular-nums text-center text-slate-900 bg-white border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs mx-auto block"
    />
  );
}

export function KpiModernSpreadsheet({
  categories,
  parameters,
  bands,
  calculationRules = [],
  templateTargetPct = 115,
  expandedCategoryIds,
  onToggleCategory,
  categoryIssuesMap,
  highlightedIds,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateIndicatorWeight,
  onAddIndicator,
  onEditIndicator,
  onDeleteIndicator,
  onDuplicateIndicator,
  onMoveIndicatorOrder,
  onAddCriteriaBand,
  onEditCriteriaBand,
  onDeleteCriteriaBand,
  onMoveBandOrder,
  isEditTemplateMode = false,
  onToggleEditTemplateMode,
  templateId,
}: KpiModernSpreadsheetProps) {
  // Mode Edit Template - State & Drafts
  const [draftBands, setDraftBands] = useState<
    Record<number, { operatorSymbol: string; criteriaValue: string; score: string }>
  >({});
  const [isSavingBands, setIsSavingBands] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Close contextual action menu on click outside
  useEffect(() => {
    if (!openActionMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".action-menu-container")) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openActionMenuId]);

  // Inisialisasi draft saat masuk ke Mode Edit Template atau ketika bands diperbarui
  useEffect(() => {
    if (isEditTemplateMode) {
      const initialDrafts: Record<
        number,
        { operatorSymbol: string; criteriaValue: string; score: string }
      > = {};
      for (const band of bands) {
        const param = parameters.find((p) => p.id === band.parameterId);
        const { operatorSymbol, criteriaValue, score } = formatCriteriaValues(band, param?.unit);
        initialDrafts[band.id] = {
          operatorSymbol: operatorSymbol === "?" ? "=" : operatorSymbol,
          criteriaValue,
          score,
        };
      }
      setDraftBands(initialDrafts);
    }
  }, [isEditTemplateMode, bands, parameters]);

  const handleDraftBandChange = (
    bandId: number,
    field: "operatorSymbol" | "criteriaValue" | "score",
    value: string
  ) => {
    setDraftBands((prev) => ({
      ...prev,
      [bandId]: {
        ...(prev[bandId] || { operatorSymbol: "=", criteriaValue: "", score: "0" }),
        [field]: value,
      },
    }));
  };

  const handleCancelEditTemplate = () => {
    if (onToggleEditTemplateMode) {
      onToggleEditTemplateMode();
    }
  };

  const handleSaveAllTemplateEdits = async () => {
    if (!templateId) {
      void Swal.fire({
        icon: "error",
        title: "Template ID tidak valid",
        text: "Tidak dapat menyimpan perubahan karena Template ID tidak ditemukan.",
      });
      return;
    }

    try {
      setIsSavingBands(true);
      const updates: BatchBandUpdatePayload[] = Object.entries(draftBands).map(
        ([idStr, data]) => ({
          id: Number(idStr),
          operatorSymbol: data.operatorSymbol,
          criteriaValue: data.criteriaValue,
          score: data.score,
        })
      );

      const result = await batchUpdateTemplateStructure(templateId, { bands: updates });
      if (result.success) {
        void Swal.fire({
          icon: "success",
          title: "Template Berhasil Diperbarui",
          text: `${result.count} baris kriteria penilaian berhasil disimpan.`,
          timer: 2000,
          showConfirmButton: false,
        });
        if (onToggleEditTemplateMode) {
          onToggleEditTemplateMode();
        }
      } else {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: result.error || "Terjadi kesalahan saat menyimpan perubahan.",
        });
      }
    } catch (err: any) {
      console.error("Error saving bulk template edits:", err);
      void Swal.fire({
        icon: "error",
        title: "Kesalahan Sistem",
        text: err?.message || "Gagal menyimpan perubahan template.",
      });
    } finally {
      setIsSavingBands(false);
    }
  };
  // Sort categories by sortOrder ASC, id ASC
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }, [categories]);

  // Group parameters by category
  const categoryParametersMap = useMemo(() => {
    const map = new Map<number, KpiParameter[]>();
    for (const cat of sortedCategories) {
      const catParams = parameters
        .filter((p) => p.categoryId === cat.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
      map.set(cat.id, catParams);
    }
    return map;
  }, [sortedCategories, parameters]);

  // Inline editing parameter name & weight state
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [draftCatName, setDraftCatName] = useState("");
  const [draftCatWeight, setDraftCatWeight] = useState("");

  // Quick edit weight only state (for parameter & indicator)
  const [quickWeightCatId, setQuickWeightCatId] = useState<number | null>(null);
  const [quickWeightCatValue, setQuickWeightCatValue] = useState("");

  const [quickWeightParamId, setQuickWeightParamId] = useState<number | null>(null);
  const [quickWeightParamValue, setQuickWeightParamValue] = useState("");

  const handleStartEditCategory = (cat: KpiCategory, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCatId(cat.id);
    setDraftCatName(cat.name);
    setDraftCatWeight(String(Math.round(Number(cat.weight) * 100)));
  };

  const handleSaveEditCategory = async (catId: number) => {
    if (!draftCatName.trim()) {
      setEditingCatId(null);
      return;
    }
    const w = Number(draftCatWeight);
    if (isNaN(w) || w <= 0 || w > 200) {
      setEditingCatId(null);
      return;
    }
    if (onUpdateCategory) {
      await onUpdateCategory(catId, { name: draftCatName.trim(), weight: w });
    }
    setEditingCatId(null);
  };

  const handleSaveQuickWeightCat = async (catId: number) => {
    const w = Number(quickWeightCatValue);
    if (isNaN(w) || w <= 0 || w > 200) {
      setQuickWeightCatId(null);
      return;
    }
    if (onUpdateCategory) {
      await onUpdateCategory(catId, { weight: w });
    }
    setQuickWeightCatId(null);
  };

  const handleSaveQuickWeightParam = async (ind: KpiParameter) => {
    const w = Number(quickWeightParamValue);
    if (isNaN(w) || w <= 0 || w > 100) {
      setQuickWeightParamId(null);
      return;
    }
    if (onUpdateIndicatorWeight) {
      await onUpdateIndicatorWeight(ind, w);
    }
    setQuickWeightParamId(null);
  };

  const handleDeleteCategoryConfirm = async (cat: KpiCategory) => {
    if (!onDeleteCategory) return;
    const res = await Swal.fire({
      title: `Hapus Parameter "${cat.name}"?`,
      text: "Seluruh indikator dan kriteria penilaian di dalamnya akan ikut dihapus.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });
    if (res.isConfirmed) {
      await onDeleteCategory(cat);
    }
  };

  const handleDeleteIndicatorConfirm = async (ind: KpiParameter) => {
    if (!onDeleteIndicator) return;
    const res = await Swal.fire({
      title: `Hapus Indikator "${ind.name}"?`,
      text: "Seluruh kriteria penilaian pada indikator ini akan ikut dihapus.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });
    if (res.isConfirmed) {
      await onDeleteIndicator(ind);
    }
  };

  return (
    <div className="w-full bg-white border border-[#dbe2ea] rounded-xl overflow-hidden shadow-2xs text-slate-800">
      {/* Sticky Banner Mode Edit Template */}
      {isEditTemplateMode && (
        <div className="p-3 sm:p-3.5 px-4 bg-slate-900 border-b border-slate-800 text-white flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-[13px] font-bold text-white">
                  Mode Edit Template Aktif
                </span>
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/60">
                  Edit Massal
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Ubah Operator, Kriteria Penilaian, dan Skor langsung pada baris tabel, lalu simpan semua perubahan sekaligus.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelEditTemplate}
              disabled={isSavingBands}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAllTemplateEdits}
              disabled={isSavingBands}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-2xs transition cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isSavingBands ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left table-fixed">
          {/* 6 Kolom KPI Spreadsheet: Parameter 30% | Operator 75px | Kriteria 38% | Skor 70px | Bobot 70px | Aksi 48px */}
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "75px", minWidth: "75px", maxWidth: "75px" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "70px", minWidth: "70px", maxWidth: "70px" }} />
            <col style={{ width: "70px", minWidth: "70px", maxWidth: "70px" }} />
            <col style={{ width: "48px", minWidth: "48px", maxWidth: "48px" }} />
          </colgroup>

          {/* ========================================================= */}
          {/* HEADER TABEL: Header Ringkas 1 Baris (Compact 36px)        */}
          {/* ========================================================= */}
          <thead>
            <tr
              className="border-b border-[#dbe2ea] text-xs font-semibold text-slate-700 select-none h-9"
              style={{ backgroundColor: "#f8fafc" }}
            >
              <th
                className="py-1.5 px-3 text-left border-r border-[#dbe2ea] align-middle font-semibold"
                style={{ width: "30%" }}
              >
                Parameter / Indikator
              </th>
              <th
                className="py-1.5 px-2 text-center border-r border-[#dbe2ea] align-middle font-semibold"
                style={{ width: "75px", minWidth: "75px", maxWidth: "75px" }}
              >
                Operator
              </th>
              <th
                className="py-1.5 px-3 text-left border-r border-[#dbe2ea] align-middle font-semibold"
                style={{ width: "38%" }}
              >
                Kriteria Penilaian
              </th>
              <th
                className="py-1.5 px-2 text-center border-r border-[#dbe2ea] align-middle font-semibold"
                style={{ width: "70px", minWidth: "70px", maxWidth: "70px" }}
              >
                Skor
              </th>
              <th
                className="py-1.5 px-2 text-center border-r border-[#dbe2ea] align-middle font-semibold"
                style={{ width: "70px", minWidth: "70px", maxWidth: "70px" }}
              >
                Bobot
              </th>
              <th
                className="py-1.5 px-1 text-center align-middle font-semibold"
                style={{ width: "48px", minWidth: "48px", maxWidth: "48px" }}
              >
                Aksi
              </th>
            </tr>
          </thead>

          {/* ========================================================= */}
          {/* BODY TABEL: Semua Baris Mengikuti 6 Kolom Sesuai Desain   */}
          {/* ========================================================= */}
          <tbody>
            {sortedCategories.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs italic bg-white">
                  Belum ada parameter KPI. Klik tombol &ldquo;Tambah Kategori&rdquo; untuk mulai menyusun template.
                </td>
              </tr>
            ) : (
              sortedCategories.map((cat, catIdx) => {
                const isDirect = cat.categoryType === "DIRECT";
                const catWeightPct = Math.round(Number(cat.weight) * 100);
                const catParams = categoryParametersMap.get(cat.id) || [];
                const isExpanded = expandedCategoryIds.has(cat.id);
                const isCatHighlighted = highlightedIds?.categoryId === cat.id;

                // Direct parameter item (if mode DIRECT)
                const directParam = isDirect ? catParams[0] : null;

                // Count summary
                const totalIndikator = isDirect ? 1 : catParams.length;
                const paramIds = isDirect
                  ? directParam
                    ? [directParam.id]
                    : []
                  : catParams.map((p) => p.id);
                const totalKriteria = bands.filter((b) => paramIds.includes(b.parameterId)).length;

                const issueEntry = categoryIssuesMap?.get(cat.id);
                const hasIssue = Boolean(issueEntry);
                const issueSeverity =
                  typeof issueEntry === "object" && issueEntry !== null && "severity" in issueEntry
                    ? (issueEntry.severity as "INFO" | "WARNING" | "ERROR")
                    : "WARNING";
                const issueTooltip =
                  typeof issueEntry === "object" && issueEntry !== null && "message" in issueEntry
                    ? issueEntry.message
                    : typeof issueEntry === "string"
                    ? issueEntry
                    : "Terdapat perhatian validasi pada parameter ini";

                return (
                  <React.Fragment key={cat.id}>
                    {/* ========================================================= */}
                    {/* 1. HEADER PARAMETER: Expanded (Navy Solid) vs Collapsed  */}
                    {/* ========================================================= */}
                    {isExpanded ? (
                      /* EXPANDED: 6 Kolom Sempurna dengan solid royal navy yang konsisten */
                      <tr
                        id={`category-row-${cat.id}`}
                        className="select-none border-b border-[#163a7d] h-9"
                        style={{ backgroundColor: "#163a7d" }}
                      >
                        {/* Kolom 1: Parameter */}
                        <td
                          className="py-1.5 px-3 text-white align-middle border-r border-[#1e4794]"
                          style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => onToggleCategory(cat.id)}
                              className="p-0.5 -ml-1 text-white hover:text-white rounded hover:bg-white/10 transition cursor-pointer flex items-center shrink-0"
                              title="Klik untuk melipat / collapse parameter"
                            >
                              <ChevronDown className="w-4 h-4 text-white" />
                            </button>

                            {editingCatId === cat.id ? (
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  value={draftCatName}
                                  onChange={(e) => setDraftCatName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEditCategory(cat.id);
                                    if (e.key === "Escape") setEditingCatId(null);
                                  }}
                                  autoFocus
                                  className="h-7 px-2 text-xs font-semibold text-slate-900 bg-white rounded border border-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditCategory(cat.id)}
                                  className="p-1 text-white bg-white/20 hover:bg-white/30 rounded cursor-pointer"
                                  title="Simpan"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCatId(null)}
                                  className="p-1 text-white/70 hover:text-white rounded cursor-pointer"
                                  title="Batal"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  onClick={() => onToggleCategory(cat.id)}
                                  className="font-bold text-white text-xs sm:text-[13px] tracking-tight cursor-pointer truncate"
                                >
                                  {catIdx + 1}. {cat.name}
                                </span>
                                {hasIssue && (
                                  <span title={issueTooltip} className="cursor-help shrink-0">
                                    {issueSeverity === "ERROR" ? (
                                      <AlertCircle className="w-3 h-3 text-rose-300" />
                                    ) : issueSeverity === "INFO" ? (
                                      <Info className="w-3 h-3 text-blue-200" />
                                    ) : (
                                      <AlertTriangle className="w-3 h-3 text-amber-300" />
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Kolom 2 & 3: Info Ringkasan (colSpan={2}) */}
                        <td
                          colSpan={2}
                          className="py-1.5 px-3 text-white align-middle border-r border-[#1e4794]"
                          style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                        >
                          <span className="text-white/80 text-xs font-normal">
                            {isDirect ? `${totalKriteria} Kriteria` : `${totalIndikator} Indikator • ${totalKriteria} Kriteria`}
                          </span>
                        </td>

                        {/* Kolom 4: Skor */}
                        <td
                          className="py-1.5 px-2 text-white/40 text-center text-xs align-middle border-r border-[#1e4794]"
                          style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                        >
                          -
                        </td>

                        {/* Kolom 5: Bobot */}
                        <td
                          className="py-1.5 px-2 text-white text-center align-middle border-r border-[#1e4794]"
                          style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {quickWeightCatId === cat.id ? (
                            <div
                              className="flex items-center justify-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="number"
                                min="1"
                                max="200"
                                value={quickWeightCatValue}
                                onChange={(e) => setQuickWeightCatValue(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") await handleSaveQuickWeightCat(cat.id);
                                  if (e.key === "Escape") setQuickWeightCatId(null);
                                }}
                                autoFocus
                                className="w-11 h-6 text-center text-xs font-bold text-slate-900 bg-white rounded border border-white focus:outline-none"
                              />
                              <span className="text-xs font-bold text-white">%</span>
                              <button
                                type="button"
                                onClick={() => handleSaveQuickWeightCat(cat.id)}
                                className="p-0.5 text-white bg-white/20 hover:bg-white/30 rounded cursor-pointer"
                                title="Simpan"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickWeightCatId(null)}
                                className="p-0.5 text-white/70 hover:text-white rounded cursor-pointer"
                                title="Batal"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickWeightCatId(cat.id);
                                setQuickWeightCatValue(String(catWeightPct));
                              }}
                              className="text-white font-semibold text-xs px-2 py-0.5 rounded border border-white/20 transition cursor-pointer"
                              style={{ backgroundColor: "#102a5c" }}
                              title="Klik untuk ubah bobot parameter"
                            >
                              {catWeightPct}%
                            </button>
                          )}
                        </td>

                        {/* Kolom 6: 1 Button Actions Parameter */}
                        <td
                          className="py-1 px-1 text-center align-middle relative action-menu-container"
                          style={{ backgroundColor: "#163a7d", color: "#ffffff" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === `cat-${cat.id}` ? null : `cat-${cat.id}`);
                            }}
                            className="w-7 h-7 rounded border border-white/20 bg-white/10 hover:bg-white/20 text-white transition cursor-pointer inline-flex items-center justify-center"
                            title="Menu Aksi Parameter"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>

                          {openActionMenuId === `cat-${cat.id}` && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-1 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700 animate-in fade-in-50 zoom-in-95"
                            >
                              {!isDirect && onAddIndicator && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onAddIndicator(cat.id);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                >
                                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Tambah Indikator</span>
                                </button>
                              )}
                              {isDirect && directParam && onAddCriteriaBand && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onAddCriteriaBand(directParam.id);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                >
                                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Tambah Kriteria</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  setOpenActionMenuId(null);
                                  handleStartEditCategory(cat, e);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>Ubah Nama</span>
                              </button>
                              {onDeleteCategory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    handleDeleteCategoryConfirm(cat);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors text-rose-600 font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Hapus Parameter</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      /* COLLAPSED: 6 Kolom Sempurna */
                      <tr
                        id={`category-row-${cat.id}`}
                        onClick={() => onToggleCategory(cat.id)}
                        className={`cursor-pointer select-none transition-colors border-b border-[#dbe2ea] bg-white hover:bg-[#f8fafc] group/cat h-9 ${
                          isCatHighlighted ? "bg-amber-50/70 ring-1 ring-amber-300" : ""
                        }`}
                      >
                        {/* Kolom 1: Parameter */}
                        <td className="py-1.5 px-3 align-middle border-r border-[#dbe2ea]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                              <span className="font-semibold text-slate-900 text-xs sm:text-[13px] tracking-tight truncate">
                                {catIdx + 1}. {cat.name}
                              </span>
                              {hasIssue && (
                                <span title={issueTooltip} className="cursor-help shrink-0">
                                  {issueSeverity === "ERROR" ? (
                                    <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                  ) : issueSeverity === "INFO" ? (
                                    <Info className="w-3 h-3 text-blue-500 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  )}
                                </span>
                              )}
                            </div>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full font-medium shrink-0 select-none text-[11px] leading-none px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>Aktif</span>
                            </span>
                          </div>
                        </td>

                        {/* Kolom 2 & 3: Info Ringkasan (colSpan={2}) */}
                        <td colSpan={2} className="py-1.5 px-3 align-middle border-r border-[#dbe2ea] text-slate-500 text-xs">
                          <span className="text-slate-500 text-xs">
                            {isDirect ? `${totalKriteria} Kriteria` : `${totalIndikator} Indikator • ${totalKriteria} Kriteria`}
                          </span>
                        </td>

                        {/* Kolom 4: Skor */}
                        <td className="py-1.5 px-2 align-middle border-r border-[#dbe2ea] text-center text-slate-400 text-xs">
                          -
                        </td>

                        {/* Kolom 5: Bobot */}
                        <td
                          className="py-1.5 px-2 align-middle text-center border-r border-[#dbe2ea]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setQuickWeightCatId(cat.id);
                              setQuickWeightCatValue(String(catWeightPct));
                            }}
                            className="font-semibold text-xs sm:text-[13px] text-slate-900 tabular-nums hover:text-blue-600 px-1 py-0.5 rounded transition cursor-pointer"
                            title="Klik untuk ubah bobot parameter"
                          >
                            {catWeightPct}%
                          </button>
                        </td>

                        {/* Kolom 6: 1 Button Actions Parameter */}
                        <td
                          className="py-1 px-1 text-center align-middle relative action-menu-container"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === `cat-${cat.id}` ? null : `cat-${cat.id}`);
                            }}
                            className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition cursor-pointer inline-flex items-center justify-center shadow-2xs"
                            title="Menu Aksi Parameter"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>

                          {openActionMenuId === `cat-${cat.id}` && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-1 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700 animate-in fade-in-50 zoom-in-95"
                            >
                              {!isDirect && onAddIndicator && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onAddIndicator(cat.id);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                >
                                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Tambah Indikator</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  setOpenActionMenuId(null);
                                  handleStartEditCategory(cat, e);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>Ubah Nama</span>
                              </button>
                              {onDeleteCategory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    handleDeleteCategoryConfirm(cat);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors text-rose-600 font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Hapus Parameter</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {/* ========================================================= */}
                    {/* 2. BARIS DETAIL & KRITERIA SAAT EXPANDED                  */}
                    {/* ========================================================= */}
                    {isExpanded && (
                      isDirect ? (
                        /* DIRECT MODE SAAT EXPANDED: 6 Kolom Konsisten Tanpa RowSpan */
                        (() => {
                          const param = directParam;
                          const paramBands = param
                            ? bands
                                .filter((b) => b.parameterId === param.id)
                                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
                            : [];

                          if (paramBands.length === 0) {
                            return (
                              <tr className="bg-white border-b border-[#dbe2ea] h-9">
                                <td className="py-1 px-3 align-middle border-r border-[#dbe2ea] text-xs text-slate-700">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-700">
                                      Target: <strong className="text-slate-900">{param?.target ? `${param.target}${param.unit === "%" ? "%" : ` ${param.unit}`}` : "100%"}</strong>
                                    </span>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500">Satuan: {param?.unit || "%"}</span>
                                  </div>
                                </td>
                                <td colSpan={2} className="py-1 px-3 align-middle border-r border-[#dbe2ea] text-slate-400 text-xs italic">
                                  Belum ada kriteria penilaian
                                </td>
                                <td className="py-1 px-2 align-middle border-r border-[#dbe2ea] text-center text-slate-400 text-xs">
                                  -
                                </td>
                                <td className="py-1 px-2 align-middle text-center font-semibold text-xs text-slate-900 border-r border-[#dbe2ea]">
                                  {catWeightPct}%
                                </td>
                                <td className="py-1 px-1 text-center align-middle relative action-menu-container" onClick={(e) => e.stopPropagation()}>
                                  {param && onAddCriteriaBand && (
                                    <button
                                      type="button"
                                      onClick={() => onAddCriteriaBand(param.id)}
                                      className="p-1 rounded text-blue-600 hover:bg-blue-50 transition cursor-pointer inline-flex items-center justify-center"
                                      title="Tambah Kriteria"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <React.Fragment key={`direct-${cat.id}`}>
                              {/* Sub-header info parameter langsung */}
                              <tr className="bg-slate-50/70 border-b border-[#dbe2ea] text-xs h-8">
                                <td colSpan={3} className="py-1 px-3 border-r border-[#dbe2ea] align-middle">
                                  <div className="flex items-center gap-2">
                                    {param?.name &&
                                      param.name.trim().toLowerCase() !== "parameter langsung" &&
                                      param.name.trim().toLowerCase() !== cat.name.trim().toLowerCase() && (
                                        <span className="font-semibold text-slate-800 mr-1">
                                          {param.name}
                                        </span>
                                    )}
                                    <span className="text-slate-600">
                                      Target: <strong className="text-slate-900">{param?.target ? `${param.target}${param.unit === "%" ? "%" : ` ${param.unit}`}` : "100%"}</strong>
                                    </span>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500">Satuan: {param?.unit || "%"}</span>
                                  </div>
                                </td>
                                <td className="py-1 px-2 text-center align-middle border-r border-[#dbe2ea] text-slate-400 text-xs">
                                  -
                                </td>
                                <td className="py-1 px-2 text-center align-middle font-bold text-xs text-slate-700 border-r border-[#dbe2ea]">
                                  {catWeightPct}%
                                </td>
                                <td className="py-1 px-1 text-center align-middle relative action-menu-container" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenActionMenuId(openActionMenuId === `direct-${cat.id}` ? null : `direct-${cat.id}`);
                                    }}
                                    className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition cursor-pointer inline-flex items-center justify-center shadow-2xs"
                                    title="Menu Aksi Parameter"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                  </button>
                                  {openActionMenuId === `direct-${cat.id}` && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-1 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700 animate-in fade-in-50 zoom-in-95"
                                    >
                                      {param && onAddCriteriaBand && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            onAddCriteriaBand(param.id);
                                          }}
                                          className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                        >
                                          <Plus className="w-3.5 h-3.5 text-blue-600" />
                                          <span>Tambah Kriteria</span>
                                        </button>
                                      )}
                                      {param && onEditIndicator && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            onEditIndicator(cat.id, param);
                                          }}
                                          className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                          <span>Ubah Target</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {/* Baris Kriteria Penilaian Rapat & Bebas RowSpan */}
                              {paramBands.map((band, bIdx) => {
                                const { score, operatorSymbol, criteriaValue, isUnrecognizedOperator } =
                                  formatCriteriaValues(band, param?.unit);

                                return (
                                  <tr
                                    key={band.id}
                                    className="bg-white border-b border-[#dbe2ea] group/band hover:bg-[#f8fafc] transition-colors h-9"
                                  >
                                    {/* Kolom 1: Area Indent Kosong */}
                                    <td className="py-1 px-3 align-middle bg-white border-r border-[#dbe2ea]" />

                                    {/* Kolom 2: Operator */}
                                    <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center">
                                      {isEditTemplateMode
                                        ? renderEditableOperatorCell(
                                            band.id,
                                            operatorSymbol,
                                            draftBands,
                                            handleDraftBandChange
                                          )
                                        : renderOperatorBadge(operatorSymbol, isUnrecognizedOperator)}
                                    </td>

                                    {/* Kolom 3: Kriteria */}
                                    <td className="py-1 px-3 align-middle bg-white border-r border-[#dbe2ea]">
                                      {isEditTemplateMode ? (
                                        renderEditableCriteriaCell(
                                          band.id,
                                          criteriaValue,
                                          draftBands,
                                          handleDraftBandChange
                                        )
                                      ) : (
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                          <span className="font-normal text-slate-800 text-xs sm:text-[13px]">
                                            {criteriaValue}
                                          </span>
                                          {(isUnrecognizedOperator || operatorSymbol === "?") && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300">
                                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                              <span>Perlu periksa</span>
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    {/* Kolom 4: Skor */}
                                    <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center">
                                      {isEditTemplateMode ? (
                                        renderEditableScoreCell(
                                          band.id,
                                          score,
                                          draftBands,
                                          handleDraftBandChange
                                        )
                                      ) : (
                                        <span className="font-normal text-xs sm:text-[13px] text-slate-800 tabular-nums">
                                          {score}
                                        </span>
                                      )}
                                    </td>

                                    {/* Kolom 5: Bobot */}
                                    <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center text-slate-300 text-xs">
                                      -
                                    </td>

                                    {/* Kolom 6: Aksi (Kosong untuk baris kriteria, aksi terpusat pada baris indikator) */}
                                    <td className="py-1 px-1 align-middle bg-white" />
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })()
                      ) : (
                        /* SUB_ITEMS MODE SAAT EXPANDED: 6 Kolom Sempurna */
                        catParams.length === 0 ? (
                          /* EMPTY STATE INDIKATOR */
                          <tr className="bg-white border-b border-[#dbe2ea] h-9">
                            <td className="py-1.5 px-3 border-r border-[#dbe2ea] text-slate-400 text-xs italic">
                              Belum ada indikator
                            </td>
                            <td colSpan={2} className="py-1.5 px-3 border-r border-[#dbe2ea] text-slate-400 text-xs italic">
                              {onAddIndicator && (
                                <button
                                  type="button"
                                  onClick={() => onAddIndicator(cat.id)}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer not-italic select-none"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Tambah Indikator</span>
                                </button>
                              )}
                            </td>
                            <td className="py-1.5 px-2 border-r border-[#dbe2ea] text-center text-slate-400 text-xs">
                              -
                            </td>
                            <td className="py-1.5 px-2 border-r border-[#dbe2ea] text-center text-slate-400 text-xs">
                              -
                            </td>
                            <td className="py-1.5 px-1 text-center text-slate-400 text-xs">
                              -
                            </td>
                          </tr>
                        ) : (
                          catParams.map((ind, indIdx) => {
                            const indWeightPct = Math.round(Number(ind.weight) * 100);
                            const indBands = bands
                              .filter((b) => b.parameterId === ind.id)
                              .sort(
                                (a, b) =>
                                  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
                              );
                            const isIndHighlighted = highlightedIds?.parameterId === ind.id;

                            return (
                              <React.Fragment key={ind.id}>
                                {/* 1. GROUPED ROW INDIKATOR: 1 Button Aksi Ringkas */}
                                <tr
                                  id={`indicator-row-${ind.id}`}
                                  className={`bg-slate-50/90 hover:bg-slate-100/80 border-b border-[#dbe2ea] transition-colors group/ind h-9 ${
                                    isIndHighlighted ? "bg-amber-50/80 ring-1 ring-amber-400" : ""
                                  }`}
                                >
                                  {/* Kolom 1-3: Info Indikator, Target, Satuan */}
                                  <td colSpan={3} className="py-1 px-3 border-r border-[#dbe2ea] align-middle">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        onClick={() => onEditIndicator && onEditIndicator(cat.id, ind)}
                                        className="font-semibold text-slate-900 text-xs sm:text-[13px] tracking-tight cursor-pointer hover:text-blue-600 transition-colors truncate"
                                        title="Klik untuk edit indikator"
                                      >
                                        {catIdx + 1}.{indIdx + 1} {ind.name}
                                      </span>
                                      {ind.target && (
                                        <span className="text-[11px] font-medium text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                          Target: <strong className="text-slate-800">{ind.target}{ind.unit === "%" ? "%" : ` ${ind.unit}`}</strong>
                                        </span>
                                      )}
                                      {ind.unit && ind.unit !== "%" && !ind.target && (
                                        <span className="text-[11px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                          Satuan: {ind.unit}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Kolom 4: Skor */}
                                  <td className="py-1 px-2 text-center align-middle border-r border-[#dbe2ea] text-slate-400 text-xs">
                                    -
                                  </td>

                                  {/* Kolom 5: Bobot Indikator */}
                                  <td
                                    className="py-1 px-2 text-center align-middle border-r border-[#dbe2ea]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {quickWeightParamId === ind.id ? (
                                      <div className="flex items-center justify-center gap-1">
                                        <input
                                          type="number"
                                          min="1"
                                          max="100"
                                          value={quickWeightParamValue}
                                          onChange={(e) => setQuickWeightParamValue(e.target.value)}
                                          onKeyDown={async (e) => {
                                            if (e.key === "Enter") await handleSaveQuickWeightParam(ind);
                                            if (e.key === "Escape") setQuickWeightParamId(null);
                                          }}
                                          autoFocus
                                          className="w-11 h-6 text-center text-xs font-semibold tabular-nums border border-blue-500 rounded bg-white focus:outline-none"
                                        />
                                        <span className="text-xs font-semibold text-slate-600">%</span>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveQuickWeightParam(ind)}
                                          className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                          title="Simpan"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setQuickWeightParamId(null)}
                                          className="p-0.5 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"
                                          title="Batal"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuickWeightParamId(ind.id);
                                          setQuickWeightParamValue(String(indWeightPct));
                                        }}
                                        className="font-bold text-xs sm:text-[13px] text-slate-900 tabular-nums hover:text-blue-600 px-1 py-0.5 rounded transition cursor-pointer"
                                        title="Klik untuk ubah bobot indikator"
                                      >
                                        {indWeightPct}%
                                      </button>
                                    )}
                                  </td>

                                  {/* Kolom 6: 1 Button Actions Indikator */}
                                  <td
                                    className="py-1 px-1 text-center align-middle relative action-menu-container"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(openActionMenuId === `ind-${ind.id}` ? null : `ind-${ind.id}`);
                                      }}
                                      className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition cursor-pointer inline-flex items-center justify-center shadow-2xs"
                                      title="Menu Aksi Indikator"
                                    >
                                      <Settings className="w-3.5 h-3.5" />
                                    </button>

                                    {openActionMenuId === `ind-${ind.id}` && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute right-1 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700 animate-in fade-in-50 zoom-in-95"
                                      >
                                        {onAddCriteriaBand && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionMenuId(null);
                                              onAddCriteriaBand(ind.id);
                                            }}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                          >
                                            <Plus className="w-3.5 h-3.5 text-blue-600" />
                                            <span>Tambah Kriteria</span>
                                          </button>
                                        )}
                                        {onEditIndicator && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionMenuId(null);
                                              onEditIndicator(cat.id, ind);
                                            }}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors text-slate-700 font-medium"
                                          >
                                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                            <span>Ubah Indikator</span>
                                          </button>
                                        )}
                                        {onDeleteIndicator && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionMenuId(null);
                                              handleDeleteIndicatorConfirm(ind);
                                            }}
                                            className="w-full px-3 py-1.5 text-left hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors text-rose-600 font-medium"
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                            <span>Hapus Indikator</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>

                                {/* 2. KRITERIA SUBROWS: Rapat & Konsisten (36px, Tanpa RowSpan) */}
                                {indBands.length === 0 ? (
                                  <tr className="bg-white border-b border-[#dbe2ea] h-9">
                                    <td colSpan={6} className="py-1.5 px-4 text-center text-slate-400 text-xs italic">
                                      Belum ada kriteria penilaian untuk indikator ini.
                                    </td>
                                  </tr>
                                ) : (
                                  indBands.map((band, bIdx) => {
                                    const { score, operatorSymbol, criteriaValue, isUnrecognizedOperator } =
                                      formatCriteriaValues(band, ind.unit);

                                    return (
                                      <tr
                                        key={band.id}
                                        className="bg-white border-b border-[#dbe2ea] group/band hover:bg-[#f8fafc] transition-colors h-9"
                                      >
                                        {/* Kolom 1: Area Indent Kosong */}
                                        <td className="py-1 px-3 align-middle bg-white border-r border-[#dbe2ea]" />

                                        {/* Kolom 2: Operator */}
                                        <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center">
                                          {isEditTemplateMode
                                            ? renderEditableOperatorCell(
                                                band.id,
                                                operatorSymbol,
                                                draftBands,
                                                handleDraftBandChange
                                              )
                                            : renderOperatorBadge(operatorSymbol, isUnrecognizedOperator)}
                                        </td>

                                        {/* Kolom 3: Kriteria */}
                                        <td className="py-1 px-3 align-middle bg-white border-r border-[#dbe2ea]">
                                          {isEditTemplateMode ? (
                                            renderEditableCriteriaCell(
                                              band.id,
                                              criteriaValue,
                                              draftBands,
                                              handleDraftBandChange
                                            )
                                          ) : (
                                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                              <span className="font-normal text-slate-800 text-xs sm:text-[13px]">
                                                {criteriaValue}
                                              </span>
                                              {(isUnrecognizedOperator || operatorSymbol === "?") && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300">
                                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                                  <span>Perlu periksa</span>
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </td>

                                        {/* Kolom 4: Skor */}
                                        <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center">
                                          {isEditTemplateMode ? (
                                            renderEditableScoreCell(
                                              band.id,
                                              score,
                                              draftBands,
                                              handleDraftBandChange
                                            )
                                          ) : (
                                            <span className="font-normal text-xs sm:text-[13px] text-slate-800 tabular-nums">
                                              {score}
                                            </span>
                                          )}
                                        </td>

                                        {/* Kolom 5: Bobot */}
                                        <td className="py-1 px-2 align-middle bg-white border-r border-[#dbe2ea] text-center text-slate-300 text-xs">
                                          -
                                        </td>

                                        {/* Kolom 6: Aksi (Kosong untuk baris kriteria, aksi terpusat pada baris indikator) */}
                                        <td className="py-1 px-1 align-middle bg-white" />
                                      </tr>
                                    );
                                  })
                                )}
                              </React.Fragment>
                            );
                          })
                        )
                      )
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
