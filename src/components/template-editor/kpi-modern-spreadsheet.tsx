"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  X,
  Loader2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import type { KpiCategory, KpiParameter, KpiBand, KpiCalculationRule } from "@/db/schema";
import Swal from "sweetalert2";
import { parseConditionString, extractCriteriaValue } from "@/lib/excel-template-kpi";
import {
  batchUpdateTemplateStructure,
  type BatchBandUpdatePayload,
} from "@/lib/actions";
import { stripIndicatorPrefix } from "./indicator-modal";

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
  onImportExcel?: () => void;
  onAddCategory?: () => void;
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
  const score = !isNaN(scoreNum)
    ? Number.isInteger(scoreNum)
      ? String(scoreNum)
      : scoreNum.toFixed(2).replace(/\.?0+$/, "")
    : "0";

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
  if (isUnrecognizedOperator || operatorSymbol === "?") {
    return (
      <span
        className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200 select-none"
        title={`Operator: ${operatorSymbol}`}
      >
        {operatorSymbol}
      </span>
    );
  }

  return (
    <span
      className="text-[11px] font-medium text-slate-600 select-none"
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
      className="w-full min-w-[54px] max-w-[72px] h-6 px-1 text-[11px] font-medium text-center bg-white border border-slate-200 rounded focus:border-slate-500 focus:outline-hidden cursor-pointer mx-auto block"
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
      className="w-full h-6 px-2 text-[11px] text-slate-800 bg-white border border-slate-200 rounded focus:border-slate-500 focus:outline-hidden"
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
      className="w-14 h-6 px-1 text-[11px] text-center text-slate-800 bg-white border border-slate-200 rounded focus:border-slate-500 focus:outline-hidden mx-auto block"
    />
  );
}

export function KpiModernSpreadsheet({
  categories,
  parameters,
  bands,
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
  onAddCriteriaBand,
  onDeleteCriteriaBand,
  isEditTemplateMode = false,
  onToggleEditTemplateMode,
  templateId,
  onImportExcel,
  onAddCategory,
}: KpiModernSpreadsheetProps) {
  const [draftBands, setDraftBands] = useState<
    Record<number, { operatorSymbol: string; criteriaValue: string; score: string }>
  >({});
  const [isSavingBands, setIsSavingBands] = useState(false);

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

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }, [categories]);

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

  const totalTemplateWeightPct = useMemo(() => {
    return sortedCategories.reduce((sum, c) => sum + Math.round(Number(c.weight) * 100), 0);
  }, [sortedCategories]);

  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [draftCatName, setDraftCatName] = useState("");
  const [draftCatWeight, setDraftCatWeight] = useState("");

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
    <div className="w-full space-y-3 text-[#0F172A]">
      {/* Sticky Banner Mode Edit Template */}
      {isEditTemplateMode && (
        <div className="px-4 py-2.5 bg-[#EFF6FF] border border-[#E2E8F0] rounded-xl flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
            <span className="text-xs font-semibold text-[#0F172A]">
              Mode Edit Massal Aktif:
            </span>
            <span className="text-xs text-[#64748B]">
              Ubah Operator, Kriteria Penilaian, dan Skor langsung pada tabel.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelEditTemplate}
              disabled={isSavingBands}
              className="px-3 py-1 text-xs font-medium text-[#64748B] hover:text-[#0F172A] bg-[#FFFFFF] border border-[#E2E8F0] rounded-md transition cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAllTemplateEdits}
              disabled={isSavingBands}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 border border-[#2563EB] rounded-md transition cursor-pointer disabled:opacity-50"
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

      {/* ========================================================= */}
      {/* 1. DESKTOP VIEW: FULL SPREADSHEET (hidden md:block)       */}
      {/* ========================================================= */}
      <div className="hidden md:block w-full overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
        {/* ========================================================= */}
        {/* HEADER TABEL (Dark Navy #16345B) */}
        {/* ========================================================= */}
        <thead>
          <tr className="border-b border-[#16345B] bg-[#16345B] text-xs font-semibold text-white select-none">
            <th className="py-2.5 px-3.5 text-left border-r border-white/15 min-w-[220px]">
              Parameter / Indikator
            </th>
            <th className="py-2.5 px-2.5 text-center border-r border-white/15 w-24 min-w-[80px]">
              Operator
            </th>
            <th className="py-2.5 px-3 text-left border-r border-white/15 min-w-[180px]">
              Kriteria Penilaian
            </th>
            <th className="py-2.5 px-2 text-center border-r border-white/15 w-20 min-w-[68px]">
              Skor
            </th>
            <th className="py-2.5 px-2 text-center border-r border-white/15 w-20 min-w-[72px]">
              Bobot
            </th>
            <th className="py-2.5 px-2.5 text-center w-24 min-w-[84px]">
              Aksi
            </th>
          </tr>
        </thead>

        <tbody>
          {sortedCategories.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 px-6 text-center bg-[#FFFFFF]">
                <div className="max-w-md mx-auto flex flex-col items-center justify-center text-center">
                  <div className="h-12 w-12 rounded-xl bg-[#EFF6FF] border border-[#E2E8F0] flex items-center justify-center mb-3 text-[#2563EB]">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] mb-1">
                    Struktur KPI Belum Terisi
                  </h3>
                  <p className="text-xs text-[#64748B] leading-relaxed mb-4">
                    Unggah file template Excel untuk langsung mengisi kategori, indikator, target, bobot, dan kriteria skor, atau susun parameter secara manual.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {onImportExcel && (
                      <button
                        type="button"
                        onClick={onImportExcel}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB] px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5 text-[#2563EB]" />
                        <span>Import Excel</span>
                      </button>
                    )}
                    {onAddCategory && (
                      <button
                        type="button"
                        onClick={onAddCategory}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2563EB] bg-[#2563EB] hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 text-white" />
                        <span>Tambah Kategori</span>
                      </button>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            sortedCategories.map((cat, catIdx) => {
              const catWeightPct = Math.round(Number(cat.weight) * 100);
              const catParams = categoryParametersMap.get(cat.id) || [];
              const isTargetKerja = cat.name.toLowerCase().includes("target kerja");
              const hasDistinctSingleSub =
                catParams.length === 1 &&
                stripIndicatorPrefix(catParams[0].name).toLowerCase() !==
                  stripIndicatorPrefix(cat.name).toLowerCase();
              const isDirect =
                !isTargetKerja &&
                !hasDistinctSingleSub &&
                cat.categoryType === "DIRECT" &&
                catParams.length <= 1;
              const isExpanded = expandedCategoryIds.has(cat.id);
              const isCatHighlighted = highlightedIds?.categoryId === cat.id;

              const directParam = isDirect ? catParams[0] : null;
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

              // List of indicators to render inside this category (for DIRECT, use directParam as 1 item; for SUB_ITEMS, exclude any dummy item whose name matches the category header)
              const cleanCatTitle = stripIndicatorPrefix(cat.name).toLowerCase();
              const filteredSubParams = catParams.filter(
                (p) => stripIndicatorPrefix(p.name).toLowerCase() !== cleanCatTitle
              );
              const indicatorsToRender = isDirect
                ? directParam
                  ? [directParam]
                  : []
                : filteredSubParams;
              const effectiveTotalIndikator = isDirect ? 1 : indicatorsToRender.length;

              return (
                <React.Fragment key={cat.id}>
                  {/* ========================================================= */}
                  {/* 1. HEADER PARAMETER: Background #F1F5F9 */}
                  {/* ========================================================= */}
                  <tr
                    id={`category-row-${cat.id}`}
                    onClick={() => onToggleCategory(cat.id)}
                    className={`cursor-pointer select-none border-y border-[#E2E8F0] bg-[#F1F5F9] hover:bg-slate-200/60 transition-colors ${
                      isCatHighlighted ? "ring-1 ring-[#2563EB]" : ""
                    }`}
                  >
                    {/* Kolom 1: Parameter Name & Status */}
                    <td className="py-2.5 px-3.5 align-middle border-r border-[#E2E8F0] border-y border-[#E2E8F0]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0 transition-transform" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#64748B] shrink-0 transition-transform" />
                          )}
                          <span className="text-xs font-bold text-[#0F172A] shrink-0">
                            {catIdx + 1}.
                          </span>

                          {editingCatId === cat.id ? (
                            <div
                              className="flex items-center gap-1.5"
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
                                className="h-6 px-2 text-xs font-medium text-[#0F172A] bg-[#FFFFFF] rounded border border-[#E2E8F0] focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditCategory(cat.id)}
                                className="p-0.5 text-[#16A34A] hover:bg-[#F0FDF4] rounded cursor-pointer"
                                title="Simpan"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCatId(null)}
                                className="p-0.5 text-[#64748B] hover:text-[#0F172A] rounded cursor-pointer"
                                title="Batal"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-semibold text-[#0F172A] text-xs tracking-tight uppercase truncate">
                              {cat.name}
                            </span>
                          )}

                          {hasIssue && (
                            <span title={issueTooltip} className="cursor-help shrink-0">
                              {issueSeverity === "ERROR" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              ) : issueSeverity === "INFO" ? (
                                <Info className="w-3.5 h-3.5 text-[#2563EB]" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </span>
                          )}
                        </div>

                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold shrink-0 select-none text-[11px] bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                          <span className="rounded-full shrink-0 w-1.5 h-1.5 bg-[#16A34A]" />
                          <span>Aktif</span>
                        </span>
                      </div>
                    </td>

                    {/* Kolom 2 & 3: Ringkasan Indikator & Kriteria */}
                    <td
                      colSpan={2}
                      className="py-2.5 px-3 align-middle border-r border-[#E2E8F0] border-y border-[#E2E8F0] text-[#64748B] font-normal text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {isDirect
                            ? `1 Indikator Utama • ${totalKriteria} Kriteria`
                            : `${effectiveTotalIndikator} Indikator • ${totalKriteria} Kriteria`}
                        </span>
                        {!isDirect && onAddIndicator && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddIndicator(cat.id);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-[#2563EB] bg-[#EFF6FF] hover:bg-blue-100/80 border border-blue-200 transition cursor-pointer shrink-0"
                            title="Tambah Sub-Indikator pada parameter ini"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Tambah Indikator</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Kolom 4: Skor */}
                    <td className="py-2.5 px-2 text-[#64748B] text-center text-xs align-middle border-r border-[#E2E8F0] border-y border-[#E2E8F0] font-normal">
                      -
                    </td>

                    {/* Kolom 5: Bobot Parameter */}
                    <td
                      className="py-2.5 px-2 text-[#0F172A] text-center align-middle border-r border-[#E2E8F0] border-y border-[#E2E8F0] text-xs font-semibold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {quickWeightCatId === cat.id ? (
                        <div className="flex items-center justify-center gap-1">
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
                            className="w-11 h-6 text-center text-xs font-medium text-[#0F172A] bg-[#FFFFFF] rounded border border-[#E2E8F0] focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveQuickWeightCat(cat.id)}
                            className="p-0.5 text-[#16A34A] hover:bg-[#F0FDF4] rounded cursor-pointer"
                            title="Simpan"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickWeightCatId(cat.id);
                            setQuickWeightCatValue(String(catWeightPct));
                          }}
                          className="font-semibold text-xs text-[#0F172A] hover:text-[#2563EB] cursor-pointer"
                          title="Klik untuk ubah bobot parameter"
                        >
                          {catWeightPct}%
                        </button>
                      )}
                    </td>

                    {/* Kolom 6: Aksi Parameter */}
                    <td
                      className="py-2.5 px-2.5 text-center align-middle border-y border-[#E2E8F0]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleStartEditCategory(cat, e)}
                          className="p-1.5 rounded-md text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                          title={`Ubah nama parameter ${cat.name}`}
                          aria-label={`Ubah nama parameter ${cat.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteCategory && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategoryConfirm(cat)}
                            className="p-1.5 rounded-md text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title={`Hapus parameter ${cat.name}`}
                            aria-label={`Hapus parameter ${cat.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ========================================================= */}
                  {/* 2. BARIS INDIKATOR & KRITERIA (Background #FFFFFF) */}
                  {/* ========================================================= */}
                  {isExpanded &&
                    (indicatorsToRender.length === 0 ? (
                      <tr className="bg-[#FFFFFF] border-b border-[#E2E8F0]">
                        <td colSpan={6} className="py-6 text-center text-[#64748B] italic text-xs border-b border-[#E2E8F0]">
                          Belum ada indikator pada parameter ini.{" "}
                          {onAddIndicator && (
                            <button
                              type="button"
                              onClick={() => onAddIndicator(cat.id)}
                              className="ml-1 font-semibold text-[#2563EB] hover:underline not-italic cursor-pointer"
                            >
                              + Tambah Indikator
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      indicatorsToRender.map((ind, indIdx) => {
                        const rawIndWeightPct = Math.round(Number(ind.weight) * 100);
                        const indWeightPct = isDirect
                          ? catWeightPct
                          : catParams.length === 1 && rawIndWeightPct === catWeightPct
                          ? 100
                          : rawIndWeightPct;
                        const indBands = bands
                          .filter((b) => b.parameterId === ind.id)
                          .sort(
                            (a, b) =>
                              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
                          );
                        const isIndHighlighted = highlightedIds?.parameterId === ind.id;
                        const hasSub = !isDirect;
                        const indCode = hasSub ? `${catIdx + 1}.${indIdx + 1}` : "";
                        const displayIndName = isDirect ? "" : ind.name;
                        const hasTargetInfo =
                          hasSub &&
                          ind.target !== null &&
                          ind.target !== undefined &&
                          String(ind.target).trim() !== "";

                        return (
                          <tr
                            id={`indicator-row-${ind.id}`}
                            key={ind.id}
                            className={`border-b border-[#E2E8F0] transition-colors ${
                              isIndHighlighted
                                ? "bg-[#EFF6FF]/60"
                                : "bg-[#FFFFFF] hover:bg-[#F8FAFC]"
                            }`}
                          >
                            {/* 1. Parameter / Indikator & Target */}
                            <td className="py-2.5 px-3.5 pl-6 border-r border-[#E2E8F0] border-b border-[#E2E8F0] align-middle">
                              <div className="flex items-start gap-2">
                                {hasSub && indCode && (
                                  <span className="text-xs font-semibold text-[#64748B] shrink-0 mt-0.5 w-7 select-none">
                                    {indCode}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  {hasSub ? (
                                    <div>
                                      <span
                                        onClick={() =>
                                          onEditIndicator && onEditIndicator(cat.id, ind)
                                        }
                                        className="font-medium text-[#0F172A] text-xs leading-snug hover:text-[#2563EB] cursor-pointer block"
                                        title="Klik untuk edit indikator"
                                      >
                                        {stripIndicatorPrefix(displayIndName) || `Indikator ${indCode}`}
                                      </span>
                                      {hasTargetInfo && (
                                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[10.5px] font-medium text-[#64748B]">
                                          Target: {ind.target}{" "}
                                          {ind.unit && ind.unit !== "Teks" ? ind.unit : ""}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[#CBD5E1] text-xs font-normal select-none block">
                                      -
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Operator (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-[#E2E8F0] border-b border-[#E2E8F0] align-middle text-center">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-[#E2E8F0]">
                                  {indBands.map((band) => {
                                    const { operatorSymbol, isUnrecognizedOperator } =
                                      formatCriteriaValues(band, ind.unit);
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center justify-center px-2 text-[11px] font-normal text-[#64748B]"
                                      >
                                        {isEditTemplateMode
                                          ? renderEditableOperatorCell(
                                              band.id,
                                              operatorSymbol,
                                              draftBands,
                                              handleDraftBandChange
                                            )
                                          : renderOperatorBadge(
                                              operatorSymbol,
                                              isUnrecognizedOperator
                                            )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-2 py-2 text-[#CBD5E1] font-normal text-xs">-</div>
                              )}
                            </td>

                            {/* 3. Kriteria Penilaian (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-[#E2E8F0] border-b border-[#E2E8F0] align-middle">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-[#E2E8F0]">
                                  {indBands.map((band) => {
                                    const { criteriaValue } = formatCriteriaValues(
                                      band,
                                      ind.unit
                                    );
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center px-3 text-[11px] font-normal text-[#0F172A] truncate"
                                        title={criteriaValue}
                                      >
                                        {isEditTemplateMode
                                          ? renderEditableCriteriaCell(
                                              band.id,
                                              criteriaValue,
                                              draftBands,
                                              handleDraftBandChange
                                            )
                                          : criteriaValue}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-3 py-2 text-[#64748B] italic text-xs">
                                  Belum ada kriteria
                                </div>
                              )}
                            </td>

                            {/* 4. Skor (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-[#E2E8F0] border-b border-[#E2E8F0] align-middle text-center">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-[#E2E8F0]">
                                  {indBands.map((band) => {
                                    const { score } = formatCriteriaValues(band, ind.unit);
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center justify-center px-2 text-[11px] font-normal text-[#0F172A]"
                                      >
                                        {isEditTemplateMode
                                          ? renderEditableScoreCell(
                                              band.id,
                                              score,
                                              draftBands,
                                              handleDraftBandChange
                                            )
                                          : score}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-2 py-2 text-[#CBD5E1] font-normal text-xs">-</div>
                              )}
                            </td>

                            {/* 5. Bobot */}
                            <td
                              className="py-2.5 px-2 border-r border-[#E2E8F0] border-b border-[#E2E8F0] text-center align-middle text-xs font-normal text-[#0F172A]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!isDirect && quickWeightParamId === ind.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={quickWeightParamValue}
                                    onChange={(e) => setQuickWeightParamValue(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter")
                                        await handleSaveQuickWeightParam(ind);
                                      if (e.key === "Escape") setQuickWeightParamId(null);
                                    }}
                                    autoFocus
                                    className="w-11 h-6 text-center text-xs font-normal border border-[#E2E8F0] rounded bg-[#FFFFFF] focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveQuickWeightParam(ind)}
                                    className="p-0.5 text-[#16A34A] hover:bg-[#F0FDF4] rounded cursor-pointer"
                                    title="Simpan"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : isDirect && quickWeightCatId === cat.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={quickWeightCatValue}
                                    onChange={(e) => setQuickWeightCatValue(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter") await handleSaveQuickWeightCat(cat.id);
                                      if (e.key === "Escape") setQuickWeightCatId(null);
                                    }}
                                    autoFocus
                                    className="w-11 h-6 text-center text-xs font-medium text-[#0F172A] bg-[#FFFFFF] rounded border border-[#E2E8F0] focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveQuickWeightCat(cat.id)}
                                    className="p-0.5 text-[#16A34A] hover:bg-[#F0FDF4] rounded cursor-pointer"
                                    title="Simpan"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isDirect) {
                                      setQuickWeightParamId(ind.id);
                                      setQuickWeightParamValue(String(indWeightPct));
                                    } else {
                                      setQuickWeightCatId(cat.id);
                                      setQuickWeightCatValue(String(catWeightPct));
                                    }
                                  }}
                                  className="font-normal text-xs text-[#0F172A] hover:text-[#2563EB] cursor-pointer"
                                  title={
                                    isDirect
                                      ? "Klik untuk ubah bobot parameter"
                                      : "Klik untuk ubah bobot indikator"
                                  }
                                >
                                  {indWeightPct}%
                                </button>
                              )}
                            </td>

                            {/* 6. Aksi Indikator */}
                            <td
                              className="py-2.5 px-2.5 border-b border-[#E2E8F0] text-center align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center justify-center gap-1">
                                {onEditIndicator && (
                                  <button
                                    type="button"
                                    onClick={() => onEditIndicator(cat.id, ind)}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2563EB] hover:bg-blue-100/80 bg-[#EFF6FF] border border-blue-200/80 shadow-2xs transition cursor-pointer whitespace-nowrap"
                                    title={`Edit indikator ${displayIndName || cat.name}`}
                                  >
                                    <Pencil className="h-3 w-3 shrink-0 text-[#2563EB]" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ))}
                </React.Fragment>
              );
            })
          )}

          {/* Baris Total Bobot Parameter di Bawah Tabel Master Template */}
          {sortedCategories.length > 0 && (
            <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC] font-medium text-[#0F172A] select-none">
              <td
                colSpan={4}
                className="py-2.5 px-3.5 text-left align-middle border-r border-[#E2E8F0] text-xs font-semibold uppercase tracking-tight text-[#0F172A]"
              >
                Total Bobot Parameter KPI
              </td>
              <td className="py-2.5 px-2 text-center align-middle border-r border-[#E2E8F0] text-xs font-semibold text-[#0F172A]">
                {totalTemplateWeightPct}%
              </td>
              <td className="py-2.5 px-2.5 text-center align-middle text-[11px] font-normal text-[#64748B]">
                Target {templateTargetPct}%
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* ========================================================= */}
      {/* 2. MOBILE CARD VIEW (md:hidden)                           */}
      {/* ========================================================= */}
      <div className="md:hidden space-y-3">
        {sortedCategories.length === 0 ? (
          <div className="bg-[#FFFFFF] rounded-xl border border-[#E2E8F0] p-6 text-center shadow-2xs">
            <div className="h-12 w-12 rounded-xl bg-[#EFF6FF] border border-[#E2E8F0] flex items-center justify-center mx-auto mb-3 text-[#2563EB]">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-[#0F172A] mb-1">
              Struktur KPI Belum Terisi
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed mb-4">
              Unggah file template Excel untuk langsung mengisi indikator, bobot, dan kriteria skor, atau susun parameter secara manual.
            </p>
            <div className="flex flex-col gap-2">
              {onImportExcel && (
                <button
                  type="button"
                  onClick={onImportExcel}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB] px-3.5 py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>Import Excel</span>
                </button>
              )}
              {onAddCategory && (
                <button
                  type="button"
                  onClick={onAddCategory}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2563EB] bg-[#2563EB] hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-white" />
                  <span>Tambah Kategori</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          sortedCategories.map((cat, catIdx) => {
            const catWeightPct = Math.round(Number(cat.weight) * 100);
            const catParams = categoryParametersMap.get(cat.id) || [];
            const isTargetKerja = cat.name.toLowerCase().includes("target kerja");
            const hasDistinctSingleSub =
              catParams.length === 1 &&
              stripIndicatorPrefix(catParams[0].name).toLowerCase() !==
                stripIndicatorPrefix(cat.name).toLowerCase();
            const isDirect =
              !isTargetKerja &&
              !hasDistinctSingleSub &&
              cat.categoryType === "DIRECT" &&
              catParams.length <= 1;
            const isExpanded = expandedCategoryIds.has(cat.id);
            const directParam = isDirect ? catParams[0] : null;
            const cleanCatTitle = stripIndicatorPrefix(cat.name).toLowerCase();
            const filteredSubParams = catParams.filter(
              (p) => stripIndicatorPrefix(p.name).toLowerCase() !== cleanCatTitle
            );
            const indicatorsToRender = isDirect ? (directParam ? [directParam] : []) : filteredSubParams;
            const totalIndikator = isDirect ? 1 : indicatorsToRender.length;
            const paramIds = indicatorsToRender.map((p) => p.id);
            const totalKriteria = bands.filter((b) => paramIds.includes(b.parameterId)).length;

            return (
              <div
                key={cat.id}
                className="bg-[#FFFFFF] rounded-xl border border-[#E2E8F0] shadow-2xs overflow-hidden"
              >
                {/* Category Header Card */}
                <div
                  onClick={() => onToggleCategory(cat.id)}
                  className="p-3.5 bg-[#F1F5F9] hover:bg-slate-200/60 border-b border-[#E2E8F0] flex items-center justify-between gap-2.5 cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#64748B] shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#64748B] shrink-0" />
                    )}
                    <span className="text-xs font-bold text-[#0F172A] shrink-0">
                      {catIdx + 1}.
                    </span>
                    <span className="text-xs font-bold text-[#0F172A] uppercase truncate">
                      {cat.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="px-2 py-0.5 rounded-md bg-[#FFFFFF] border border-[#E2E8F0] text-xs font-bold text-[#0F172A] shadow-2xs">
                      {catWeightPct}%
                    </span>

                    {!isDirect && onAddIndicator && (
                      <button
                        type="button"
                        onClick={() => onAddIndicator(cat.id)}
                        className="p-1.5 rounded-lg border border-blue-200 bg-[#EFF6FF] text-[#2563EB] hover:bg-blue-100 transition cursor-pointer"
                        title="Tambah Indikator"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleStartEditCategory(cat, e)}
                      className="p-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:text-[#2563EB] transition cursor-pointer"
                      title="Ubah Nama Parameter"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {onDeleteCategory && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategoryConfirm(cat)}
                        className="p-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:text-rose-600 transition cursor-pointer"
                        title="Hapus Parameter"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-line summary */}
                <div className="px-3.5 py-1.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
                  <span>
                    {isDirect ? `1 Indikator Utama • ${totalKriteria} Kriteria` : `${totalIndikator} Indikator • ${totalKriteria} Kriteria`}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                    Aktif
                  </span>
                </div>

                {/* Expanded Indicators List */}
                {isExpanded && (
                  <div className="p-3 space-y-3 bg-[#FFFFFF]">
                    {indicatorsToRender.length === 0 ? (
                      <div className="py-4 text-center text-[#64748B] italic text-xs">
                        Belum ada indikator pada parameter ini.
                        {onAddIndicator && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => onAddIndicator(cat.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-blue-200 rounded-lg cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah Indikator</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      indicatorsToRender.map((ind, indIdx) => {
                        const rawIndWeightPct = Math.round(Number(ind.weight) * 100);
                        const indWeightPct = isDirect
                          ? catWeightPct
                          : catParams.length === 1 && rawIndWeightPct === catWeightPct
                          ? 100
                          : rawIndWeightPct;
                        const indBands = bands
                          .filter((b) => b.parameterId === ind.id)
                          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
                        const hasSub = !isDirect;
                        const indCode = hasSub ? `${catIdx + 1}.${indIdx + 1}` : "";
                        const cleanName = stripIndicatorPrefix(ind.name);

                        return (
                          <div
                            key={ind.id}
                            className="bg-[#FFFFFF] rounded-xl border border-[#E2E8F0] p-3 space-y-2.5"
                          >
                            {/* Indicator Top Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                {indCode && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#EFF6FF] border border-blue-200 text-[#2563EB] font-mono font-bold text-[11px] shrink-0">
                                    {indCode}
                                  </span>
                                )}
                                <span
                                  onClick={() => onEditIndicator && onEditIndicator(cat.id, ind)}
                                  className="text-xs font-bold text-[#0F172A] leading-snug hover:text-[#2563EB] cursor-pointer"
                                >
                                  {cleanName || "Indikator Utama"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <span className="px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] font-semibold text-[#0F172A]">
                                  Bobot {indWeightPct}%
                                </span>
                                {onEditIndicator && (
                                  <button
                                    type="button"
                                    onClick={() => onEditIndicator(cat.id, ind)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-[#2563EB] bg-[#EFF6FF] hover:bg-blue-100/80 border border-blue-200 transition cursor-pointer"
                                    title="Edit Indikator"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Scoring Criteria Matrix Table */}
                            {indBands.length > 0 ? (
                              <div className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden shadow-2xs">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[10.5px] font-semibold text-[#64748B]">
                                    <tr>
                                      <th className="py-1 px-2 text-center w-14">Operator</th>
                                      <th className="py-1 px-2">Kriteria</th>
                                      <th className="py-1 px-2 text-center w-12">Skor</th>
                                      {isEditTemplateMode && <th className="py-1 px-1.5 text-center w-10">Aksi</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#E2E8F0] text-[11px]">
                                    {indBands.map((band) => {
                                      const { operatorSymbol, criteriaValue, score, isUnrecognizedOperator } =
                                        formatCriteriaValues(band, ind.unit);
                                      return (
                                        <tr key={band.id} className="hover:bg-[#F8FAFC]">
                                          <td className="py-1.5 px-2 text-center align-middle font-medium text-[#64748B]">
                                            {isEditTemplateMode
                                              ? renderEditableOperatorCell(band.id, operatorSymbol, draftBands, handleDraftBandChange)
                                              : renderOperatorBadge(operatorSymbol, isUnrecognizedOperator)}
                                          </td>
                                          <td className="py-1.5 px-2 align-middle font-medium text-[#0F172A]">
                                            {isEditTemplateMode
                                              ? renderEditableCriteriaCell(band.id, criteriaValue, draftBands, handleDraftBandChange)
                                              : criteriaValue}
                                          </td>
                                          <td className="py-1.5 px-2 text-center align-middle font-bold text-[#0F172A]">
                                            {isEditTemplateMode
                                              ? renderEditableScoreCell(band.id, score, draftBands, handleDraftBandChange)
                                              : score}
                                          </td>
                                          {isEditTemplateMode && (
                                            <td className="py-1.5 px-1 text-center align-middle">
                                              {onDeleteCriteriaBand && (
                                                <button
                                                  type="button"
                                                  onClick={() => onDeleteCriteriaBand(band.id)}
                                                  className="p-1 text-[#64748B] hover:text-rose-600 rounded transition cursor-pointer"
                                                  title="Hapus kriteria"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                                </button>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="py-2 px-3 rounded-lg bg-[#FFFFFF] border border-[#E2E8F0] text-center text-xs text-[#64748B] italic">
                                Belum ada kriteria penilaian
                              </div>
                            )}

                            {/* Touch Actions Bar */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0]">
                              {onAddCriteriaBand && (
                                <button
                                  type="button"
                                  onClick={() => onAddCriteriaBand(ind.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:bg-[#EFF6FF] bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-2.5 py-1 transition cursor-pointer"
                                >
                                  <Plus className="w-3 h-3 text-[#2563EB]" />
                                  <span>+ Kriteria</span>
                                </button>
                              )}

                              <div className="flex items-center gap-1.5">
                                {onEditIndicator && (
                                  <button
                                    type="button"
                                    onClick={() => onEditIndicator(cat.id, ind)}
                                    className="text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-2.5 py-1 transition cursor-pointer"
                                  >
                                    Atur Detail
                                  </button>
                                )}
                                {!isDirect && onDeleteIndicator && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteIndicatorConfirm(ind)}
                                    className="p-1 text-[#64748B] hover:text-rose-600 transition cursor-pointer"
                                    title="Hapus Indikator"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Mobile Total Weight Summary Footer */}
        {sortedCategories.length > 0 && (
          <div className="bg-[#FFFFFF] rounded-xl border border-[#E2E8F0] p-3.5 shadow-2xs flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-[#0F172A] uppercase block">Total Bobot Parameter</span>
              <span className="text-[11px] text-[#64748B]">Target kelulusan publish: {templateTargetPct}%</span>
            </div>
            <div className="text-right">
              <span className={`text-base font-bold ${totalTemplateWeightPct === templateTargetPct ? "text-[#16A34A]" : "text-amber-700"}`}>
                {totalTemplateWeightPct}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
