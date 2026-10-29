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
  Settings,
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
        className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-amber-50 text-amber-700 border border-amber-200 select-none"
        title={`Operator: ${operatorSymbol}`}
      >
        {operatorSymbol}
      </span>
    );
  }

  return (
    <span
      className="text-[11px] font-mono font-medium text-slate-600 select-none"
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
      className="w-full min-w-[54px] max-w-[72px] h-6 px-1 text-[11px] font-mono font-semibold text-center bg-white border border-slate-200 rounded focus:border-blue-500 focus:outline-hidden cursor-pointer mx-auto block"
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
      className="w-full h-6 px-2 text-[11px] font-mono text-slate-800 bg-white border border-slate-200 rounded focus:border-blue-500 focus:outline-hidden"
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
      className="w-14 h-6 px-1 text-[11px] font-mono font-semibold tabular-nums text-center text-slate-800 bg-white border border-slate-200 rounded focus:border-blue-500 focus:outline-hidden mx-auto block"
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
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

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
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white text-slate-800">
      {/* Sticky Banner Mode Edit Template */}
      {isEditTemplateMode && (
        <div className="px-4 py-2.5 bg-sky-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" />
            <span className="text-xs font-semibold text-sky-950">
              Mode Edit Massal Aktif:
            </span>
            <span className="text-xs text-slate-600">
              Ubah Operator, Kriteria Penilaian, dan Skor langsung pada tabel.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelEditTemplate}
              disabled={isSavingBands}
              className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md transition cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAllTemplateEdits}
              disabled={isSavingBands}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-sky-950 bg-sky-100 hover:bg-sky-200/80 border border-sky-200 rounded-md transition cursor-pointer disabled:opacity-50"
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

      <table className="w-full text-left text-xs border-collapse">
        {/* ========================================================= */}
        {/* HEADER TABEL (Nama Kolom Tetap Sama, Desain Sama dengan Form Penilaian) */}
        {/* ========================================================= */}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-semibold text-slate-600 select-none">
            <th className="py-2.5 px-3.5 text-left border-r border-slate-200 min-w-[220px]">
              Parameter / Indikator
            </th>
            <th className="py-2.5 px-2.5 text-center border-r border-slate-200 w-24 min-w-[80px]">
              Operator
            </th>
            <th className="py-2.5 px-3 text-left border-r border-slate-200 min-w-[180px]">
              Kriteria Penilaian
            </th>
            <th className="py-2.5 px-2 text-center border-r border-slate-200 w-20 min-w-[68px]">
              Skor
            </th>
            <th className="py-2.5 px-2 text-center border-r border-slate-200 w-20 min-w-[72px]">
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
              <td colSpan={6} className="py-12 px-6 text-center bg-white">
                <div className="max-w-md mx-auto flex flex-col items-center justify-center text-center">
                  <div className="h-12 w-12 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-center mb-3 text-sky-700">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">
                    Struktur KPI Belum Terisi
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    Unggah file template Excel untuk langsung mengisi kategori, indikator, target, bobot, dan kriteria skor, atau susun parameter secara manual.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {onImportExcel && (
                      <button
                        type="button"
                        onClick={onImportExcel}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 hover:bg-sky-200/80 text-sky-950 border border-sky-200 px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload Template Excel</span>
                      </button>
                    )}
                    {onAddCategory && (
                      <button
                        type="button"
                        onClick={onAddCategory}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 text-slate-500" />
                        <span>Tambah Kategori Manual</span>
                      </button>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            sortedCategories.map((cat, catIdx) => {
              const isDirect = cat.categoryType === "DIRECT";
              const catWeightPct = Math.round(Number(cat.weight) * 100);
              const catParams = categoryParametersMap.get(cat.id) || [];
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

              // List of indicators to render inside this category (for DIRECT, use directParam as 1 item)
              const indicatorsToRender = isDirect
                ? directParam
                  ? [directParam]
                  : []
                : catParams;

              return (
                <React.Fragment key={cat.id}>
                  {/* ========================================================= */}
                  {/* 1. HEADER PARAMETER: Nuansa Biru Muda Terang Sama Form KPI */}
                  {/* ========================================================= */}
                  <tr
                    id={`category-row-${cat.id}`}
                    onClick={() => onToggleCategory(cat.id)}
                    className={`cursor-pointer select-none border-b border-sky-200/90 bg-sky-100 hover:bg-sky-200/75 transition-colors ${
                      isCatHighlighted ? "ring-1 ring-amber-300" : ""
                    }`}
                  >
                    {/* Kolom 1: Parameter Name & Status */}
                    <td className="py-2 px-3.5 align-middle border-r border-sky-200/80">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-blue-600 shrink-0 transition-transform" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0 transition-transform" />
                          )}
                          <span className="font-mono text-xs font-bold text-blue-600 shrink-0">
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
                                className="h-6 px-2 text-xs font-semibold text-slate-900 bg-white rounded border border-sky-300 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditCategory(cat.id)}
                                className="p-0.5 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                title="Simpan"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCatId(null)}
                                className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                                title="Batal"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-bold text-blue-950 text-xs tracking-tight uppercase truncate">
                              {cat.name}
                            </span>
                          )}

                          {hasIssue && (
                            <span title={issueTooltip} className="cursor-help shrink-0">
                              {issueSeverity === "ERROR" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              ) : issueSeverity === "INFO" ? (
                                <Info className="w-3.5 h-3.5 text-blue-500" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </span>
                          )}
                        </div>

                        <span className="inline-flex items-center gap-1.5 font-medium shrink-0 select-none text-[11px] text-emerald-700">
                          <span className="rounded-full shrink-0 w-1.5 h-1.5 bg-emerald-500" />
                          <span>Aktif</span>
                        </span>
                      </div>
                    </td>

                    {/* Kolom 2 & 3: Ringkasan Indikator & Kriteria */}
                    <td
                      colSpan={2}
                      className="py-2 px-3 align-middle border-r border-sky-200/80 text-slate-700 font-medium text-xs"
                    >
                      {isDirect
                        ? `1 Indikator Utama • ${totalKriteria} Kriteria`
                        : `${totalIndikator} Indikator • ${totalKriteria} Kriteria`}
                    </td>

                    {/* Kolom 4: Skor */}
                    <td className="py-2 px-2 text-slate-400 text-center text-xs align-middle border-r border-sky-200/80 font-mono">
                      -
                    </td>

                    {/* Kolom 5: Bobot Parameter */}
                    <td
                      className="py-2 px-2 text-slate-900 text-center align-middle border-r border-sky-200/80 font-mono text-xs font-semibold"
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
                            className="w-11 h-6 text-center text-xs font-bold text-slate-900 bg-white rounded border border-sky-400 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveQuickWeightCat(cat.id)}
                            className="p-0.5 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
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
                          className="font-mono font-bold text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                          title="Klik untuk ubah bobot parameter"
                        >
                          {catWeightPct}%
                        </button>
                      )}
                    </td>

                    {/* Kolom 6: Aksi Parameter */}
                    <td
                      className="py-2 px-2.5 text-center align-middle relative action-menu-container"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleCategory(cat.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? "Tutup" : "Buka"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionMenuId(
                              openActionMenuId === `cat-${cat.id}` ? null : `cat-${cat.id}`
                            );
                          }}
                          className="p-1 rounded text-blue-700 hover:bg-sky-200/70 transition cursor-pointer inline-flex items-center justify-center"
                          title="Menu Aksi Parameter"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {openActionMenuId === `cat-${cat.id}` && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-1 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700"
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

                  {/* ========================================================= */}
                  {/* 2. BARIS INDIKATOR & KRITERIA (Desain Sama dengan Form KPI) */}
                  {/* ========================================================= */}
                  {isExpanded &&
                    (indicatorsToRender.length === 0 ? (
                      <tr className="bg-white border-b border-slate-200">
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic text-xs">
                          Belum ada indikator pada parameter ini.{" "}
                          {onAddIndicator && (
                            <button
                              type="button"
                              onClick={() => onAddIndicator(cat.id)}
                              className="ml-1 font-semibold text-blue-600 hover:underline not-italic cursor-pointer"
                            >
                              + Tambah Indikator
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      indicatorsToRender.map((ind, indIdx) => {
                        const indWeightPct = isDirect
                          ? catWeightPct
                          : Math.round(Number(ind.weight) * 100);
                        const indBands = bands
                          .filter((b) => b.parameterId === ind.id)
                          .sort(
                            (a, b) =>
                              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
                          );
                        const isIndHighlighted = highlightedIds?.parameterId === ind.id;
                        const indCode = `${catIdx + 1}.${indIdx + 1}`;
                        const displayIndName =
                          isDirect &&
                          (!ind.name ||
                            ind.name.trim().toLowerCase() === "parameter langsung")
                            ? cat.name
                            : ind.name;

                        return (
                          <tr
                            id={`indicator-row-${ind.id}`}
                            key={ind.id}
                            className={`border-b border-slate-200 transition-colors ${
                              isIndHighlighted
                                ? "bg-amber-50/50"
                                : "bg-white hover:bg-slate-50/50"
                            }`}
                          >
                            {/* 1. Parameter / Indikator & Target */}
                            <td className="py-2 px-3.5 pl-6 border-r border-slate-200 align-middle">
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-mono text-slate-400 font-medium shrink-0 mt-0.5 w-6">
                                  {indCode}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span
                                    onClick={() =>
                                      onEditIndicator && onEditIndicator(cat.id, ind)
                                    }
                                    className="font-medium text-slate-900 text-xs leading-snug hover:text-blue-600 cursor-pointer block"
                                    title="Klik untuk edit indikator"
                                  >
                                    {displayIndName}
                                  </span>
                                  {ind.target !== null &&
                                    ind.target !== undefined &&
                                    String(ind.target).trim() !== "" && (
                                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                                        <span className="text-slate-400 font-sans">Target:</span>
                                        <span className="font-semibold text-slate-700">
                                          {ind.target}
                                          {ind.unit === "%" ? "%" : ind.unit ? ` ${ind.unit}` : ""}
                                        </span>
                                      </div>
                                    )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Operator (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-slate-200 align-middle text-center">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-slate-200/80">
                                  {indBands.map((band) => {
                                    const { operatorSymbol, isUnrecognizedOperator } =
                                      formatCriteriaValues(band, ind.unit);
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center justify-center px-2 text-[11px] font-mono text-slate-600"
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
                                <div className="px-2 py-2 text-slate-300 font-mono text-xs">-</div>
                              )}
                            </td>

                            {/* 3. Kriteria Penilaian (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-slate-200 align-middle">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-slate-200/80">
                                  {indBands.map((band) => {
                                    const { criteriaValue } = formatCriteriaValues(
                                      band,
                                      ind.unit
                                    );
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center px-3 text-[11px] font-mono text-slate-600 truncate"
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
                                <div className="px-3 py-2 text-slate-400 italic text-xs">
                                  Belum ada kriteria
                                </div>
                              )}
                            </td>

                            {/* 4. Skor (Flat sub-rows dengan border tipis) */}
                            <td className="p-0 border-r border-slate-200 align-middle text-center">
                              {indBands.length > 0 ? (
                                <div className="divide-y divide-slate-200/80">
                                  {indBands.map((band) => {
                                    const { score } = formatCriteriaValues(band, ind.unit);
                                    return (
                                      <div
                                        key={band.id}
                                        className="h-7 flex items-center justify-center px-2 text-[11px] font-mono font-medium text-slate-600 tabular-nums"
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
                                <div className="px-2 py-2 text-slate-300 font-mono text-xs">-</div>
                              )}
                            </td>

                            {/* 5. Bobot */}
                            <td
                              className="py-2 px-2 border-r border-slate-200 text-center align-middle font-mono text-xs font-medium text-slate-700"
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
                                    className="w-11 h-6 text-center text-xs font-semibold tabular-nums border border-sky-400 rounded bg-white focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveQuickWeightParam(ind)}
                                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
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
                                    }
                                  }}
                                  className="tabular-nums font-medium font-mono text-xs text-slate-700 hover:text-blue-700 cursor-pointer"
                                  title={
                                    isDirect
                                      ? "Bobot mengikuti parameter utama"
                                      : "Klik untuk ubah bobot indikator"
                                  }
                                >
                                  {indWeightPct}%
                                </button>
                              )}
                            </td>

                            {/* 6. Aksi Indikator */}
                            <td
                              className="py-2 px-2.5 text-center align-middle relative action-menu-container"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center justify-center gap-1">
                                {onEditIndicator && (
                                  <button
                                    type="button"
                                    onClick={() => onEditIndicator(cat.id, ind)}
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-700 hover:text-blue-700 bg-white hover:bg-slate-50 border border-slate-200 transition cursor-pointer whitespace-nowrap"
                                    title={`Edit indikator ${displayIndName}`}
                                  >
                                    <Pencil className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                                    <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionMenuId(
                                      openActionMenuId === `ind-${ind.id}`
                                        ? null
                                        : `ind-${ind.id}`
                                    );
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                  title="Menu Aksi Indikator"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {openActionMenuId === `ind-${ind.id}` && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-1 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-xs text-slate-700"
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
                                  {!isDirect && onDeleteIndicator && (
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
                        );
                      })
                    ))}
                </React.Fragment>
              );
            })
          )}

          {/* Baris Total Bobot Parameter di Bawah Tabel Master Template (Orange Muda) */}
          {sortedCategories.length > 0 && (
            <tr className="border-t border-orange-200/90 bg-orange-100 font-bold text-orange-950 select-none">
              <td
                colSpan={4}
                className="py-2.5 px-3.5 text-left align-middle border-r border-orange-200/80 text-xs font-bold uppercase tracking-tight text-orange-950"
              >
                Total Bobot Parameter KPI
              </td>
              <td className="py-2.5 px-2 text-center align-middle border-r border-orange-200/80 font-mono text-xs font-bold text-orange-700">
                {totalTemplateWeightPct}%
              </td>
              <td className="py-2.5 px-2.5 text-center align-middle text-[11px] font-semibold text-orange-700 font-mono">
                Target {templateTargetPct}%
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
