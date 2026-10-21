"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { Department, JobLevel, KpiBand, KpiCategory, KpiParameter } from "@/db/schema";
import { formatNaturalCriteria } from "@/lib/kpi-display";
import { parseConditionString, extractCriteriaValue } from "@/lib/excel-template-kpi";
import Swal from "sweetalert2";

export type KpiTableMode = "template" | "view" | "edit" | "penilaian";

export interface KpiTableAssessmentValue {
  actualValue?: number | string | null;
  selectedScore?: number | null;
  finalScore?: number | null;
  notes?: string | null;
}

export interface KpiExcelTableProps {
  mode?: KpiTableMode;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
  templateTargetPct?: number; // e.g. 115
  templateName?: string;
  department?: Department;
  jobLevel?: JobLevel;
  // Penilaian mode props
  employeeName?: string;
  employeeNik?: string;
  assessmentValues?: Record<number, KpiTableAssessmentValue>; // key: parameterId
  onAssessmentChange?: (parameterId: number, val: { actualValue: string; notes?: string }) => void;
  // Edit mode callbacks
  onUpdateCategory?: (catId: number, data: { name?: string; weight?: number }) => Promise<void>;
  onDeleteCategory?: (cat: KpiCategory) => Promise<void>;
  onAddIndicator?: (catId: number) => void;
  onEditIndicator?: (catId: number, ind: KpiParameter) => void;
  onDeleteIndicator?: (ind: KpiParameter) => Promise<void>;
  onUpdateIndicatorName?: (ind: KpiParameter, newName: string) => Promise<void>;
  onUpdateIndicatorWeight?: (ind: KpiParameter, newWeight: number) => Promise<void>;
  onAddCriteriaBand?: (paramId: number) => void;
  onEditCriteriaBand?: (band: KpiBand, param: KpiParameter) => void;
  onUpdateCriteriaBandInline?: (band: KpiBand, data: { label?: string; score?: string }) => Promise<void>;
  onDeleteCriteriaBand?: (bandId: number) => Promise<void>;
  onMoveBandOrder?: (band: KpiBand, direction: "UP" | "DOWN") => Promise<void>;
  highlightedIds?: {
    categoryId?: number;
    parameterId?: number;
    bandId?: number;
  };
  // Accordion Props
  expandedCategoryIds?: Set<number>;
  onToggleCategory?: (catId: number) => void;
  categoryIssuesMap?: Map<number, boolean | string>;
}

// Helper to format criteria label cleanly
export function renderBandCriteriaText(band: KpiBand, unit?: string | null): string {
  const natural = formatNaturalCriteria(band, unit);
  const label = (band.label || "").trim();
  const cond = (natural.condition || "").trim();

  if (
    band.operator === "TEXT" ||
    band.operator === "NEQ" ||
    band.operator === "CONTAINS" ||
    (band.operator === "EQ" && (unit === "Teks" || band.minValue === null))
  ) {
    return cond || label || "Pilihan Teks";
  }

  if (label && cond && label !== cond) {
    if (/^[><=≥≤]/.test(label) || /^\d/.test(label)) {
      return label;
    }
    return `${cond} (${label})`;
  }
  return cond || label || "Kriteria";
}

export function parseBandOperatorDetails(band: KpiBand, unit?: string | null) {
  const text = renderBandCriteriaText(band, unit);
  const parsed = parseConditionString(text);
  let operatorSymbol = parsed.operatorSymbol;
  let criteriaValue = parsed.criteriaValue || text;
  let isUnrecognizedOperator = parsed.isUnrecognizedOperator;

  if (parsed.isUnrecognizedOperator) {
    operatorSymbol = "?";
  } else if (!operatorSymbol || operatorSymbol === "Teks") {
    if (band.operator === "LT") operatorSymbol = "<";
    else if (band.operator === "LTE") operatorSymbol = "<=";
    else if (band.operator === "GT") operatorSymbol = ">";
    else if (band.operator === "GTE") operatorSymbol = ">=";
    else if (band.operator === "BETWEEN") operatorSymbol = "Rentang";
    else if (band.operator === "TEXT") operatorSymbol = "Teks";
    else if (band.operator === "EQ") operatorSymbol = "=";
  }

  if (operatorSymbol === "<" || operatorSymbol === ">" || operatorSymbol === "=") {
    criteriaValue = criteriaValue.replace(/^[<>=≤≥\s]+/, "").trim();
  } else if (operatorSymbol === "<=" || operatorSymbol === ">=") {
    criteriaValue = criteriaValue.replace(/^(?:<=|>=|≤|≥|=<|=>|\s)+/, "").trim();
  }

  if (!criteriaValue) {
    criteriaValue = text;
  }

  return { operatorSymbol, criteriaValue, isUnrecognizedOperator };
}

// Detect gaps and overlaps in criteria bands of a parameter
export function checkBandIntegrity(paramBands: KpiBand[]): {
  hasIssue: boolean;
  message?: string;
} {
  if (paramBands.length <= 1) {
    return { hasIssue: false };
  }

  // Check for duplicate exact conditions
  const seenConds = new Set<string>();
  for (const b of paramBands) {
    const key = `${b.operator}_${b.minValue}_${b.maxValue}_${b.label}`;
    if (seenConds.has(key)) {
      return {
        hasIssue: true,
        message: "Terdapat kriteria dengan kondisi duplikat.",
      };
    }
    seenConds.add(key);
  }

  // Check numeric overlapping
  const numericBands = paramBands.filter(
    (b) =>
      b.operator !== "TEXT" &&
      b.operator !== "NEQ" &&
      b.operator !== "CONTAINS" &&
      ((b.minValue !== null && b.minValue !== "" && !isNaN(Number(b.minValue))) ||
        (b.maxValue !== null && b.maxValue !== "" && !isNaN(Number(b.maxValue))))
  );

  for (let i = 0; i < numericBands.length; i++) {
    for (let j = i + 1; j < numericBands.length; j++) {
      const b1 = numericBands[i];
      const b2 = numericBands[j];

      const min1 = b1.minValue !== null && b1.minValue !== "" && !isNaN(Number(b1.minValue)) ? Number(b1.minValue) : null;
      const max1 = b1.maxValue !== null && b1.maxValue !== "" && !isNaN(Number(b1.maxValue)) ? Number(b1.maxValue) : null;
      const min2 = b2.minValue !== null && b2.minValue !== "" && !isNaN(Number(b2.minValue)) ? Number(b2.minValue) : null;
      const max2 = b2.maxValue !== null && b2.maxValue !== "" && !isNaN(Number(b2.maxValue)) ? Number(b2.maxValue) : null;

      // Both are exact values with EQ
      if (b1.operator === "EQ" && b2.operator === "EQ" && min1 !== null && min1 === min2) {
        return { hasIssue: true, message: `Kondisi sama (= ${min1}) pada beberapa kriteria.` };
      }

      // Overlap on BETWEEN ranges
      if (b1.operator === "BETWEEN" && b2.operator === "BETWEEN") {
        if (min1 !== null && max1 !== null && min2 !== null && max2 !== null) {
          if (Math.max(min1, min2) <= Math.min(max1, max2)) {
            return {
              hasIssue: true,
              message: `Rentang nilai ${min1}-${max1} dan ${min2}-${max2} saling tumpang tindih.`,
            };
          }
        }
      }
    }
  }

  return { hasIssue: false };
}

export function KpiExcelTable({
  mode = "view",
  categories,
  parameters,
  bands,
  templateTargetPct = 115,
  employeeName,
  employeeNik,
  assessmentValues = {},
  onAssessmentChange,
  onUpdateCategory,
  onDeleteCategory,
  onAddIndicator,
  onEditIndicator,
  onDeleteIndicator,
  onUpdateIndicatorName,
  onUpdateIndicatorWeight,
  onAddCriteriaBand,
  onEditCriteriaBand,
  onUpdateCriteriaBandInline,
  onDeleteCriteriaBand,
  onMoveBandOrder,
  highlightedIds,
  expandedCategoryIds,
  onToggleCategory,
  categoryIssuesMap,
}: KpiExcelTableProps) {
  const isPenilaian = mode === "penilaian";
  const isEdit = mode === "edit";

  // Active inline cell editing state
  const [editingCell, setEditingCell] = useState<{
    type: "catName" | "catWeight" | "paramName" | "paramWeight" | "bandLabel" | "bandScore";
    id: number;
  } | null>(null);
  const [cellDraft, setCellDraft] = useState("");

  // Explicitly sort categories by sortOrder ASC, id ASC tie-breaker
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

  // Internal state for expanded categories if not controlled from parent
  const [internalExpandedCategoryIds, setInternalExpandedCategoryIds] = useState<Set<number>>(() => {
    if (mode === "edit") {
      const initial = new Set<number>();
      for (const cat of categories) {
        if (categoryIssuesMap?.get(cat.id)) {
          initial.add(cat.id);
        }
      }
      return initial;
    }
    return new Set(categories.map((c) => c.id));
  });

  const isControlled = expandedCategoryIds !== undefined;
  const currentExpandedCategoryIds = isControlled ? expandedCategoryIds : internalExpandedCategoryIds;

  const toggleCategory = (catId: number) => {
    if (onToggleCategory) {
      onToggleCategory(catId);
    } else {
      setInternalExpandedCategoryIds((prev) => {
        const next = new Set(prev);
        if (next.has(catId)) {
          next.delete(catId);
        } else {
          next.add(catId);
        }
        return next;
      });
    }
  };

  // Handle delete confirmation
  const handleConfirmDelete = async (
    title: string,
    text: string,
    onConfirm: () => Promise<void>
  ) => {
    const res = await Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });
    if (res.isConfirmed) {
      await onConfirm();
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
      <table className="w-full min-w-[720px] table-fixed text-left text-xs sm:text-[13px] border-collapse">
        {/* ========================================================= */}
        {/* COLUMN DEFINITIONS (table-layout: fixed) */}
        {/* ========================================================= */}
        <colgroup>
          {isPenilaian ? (
            <>
              <col style={{ width: "28%" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
            </>
          ) : (
            <>
              <col style={{ width: "30%", minWidth: "220px", maxWidth: "320px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
            </>
          )}
        </colgroup>

        {/* ========================================================= */}
        {/* 1. TABLE HEADER (Satu Kali di Atas) */}
        {/* ========================================================= */}
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold select-none text-[11px]">
          <tr className="divide-x divide-slate-200">
            {/* Kolom 1: Parameter */}
            <th className="px-3 py-2 text-left font-bold truncate">
              Parameter
            </th>

            {/* Kolom 2: Kriteria Penilaian */}
            <th className="px-3 py-2 text-left font-bold">
              <div className="flex items-center justify-between gap-2">
                <span>Kriteria Penilaian</span>
                <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                  Operator • Nilai
                </span>
              </div>
            </th>

            {/* Kolom 3: Realisasi (HANYA MUNCUL DI MODE PENILAIAN) */}
            {isPenilaian && (
              <th className="px-2.5 py-2 text-center font-bold">Realisasi</th>
            )}

            {/* Kolom 4: Skor */}
            <th className="px-2 py-2 text-center font-bold">
              Skor
            </th>

            {/* Kolom 5: Bobot */}
            <th className="px-2 py-2 text-center font-bold">
              Bobot
            </th>

            {/* Kolom 6: Skor Akhir (HANYA MUNCUL DI MODE PENILAIAN) */}
            {isPenilaian && (
              <th className="px-2.5 py-2 text-center font-bold">Skor Akhir</th>
            )}
          </tr>
        </thead>

        {/* ========================================================= */}
        {/* 2. TABLE BODY */}
        {/* ========================================================= */}
        <tbody className="divide-y divide-slate-200 text-slate-800">
          {sortedCategories.length === 0 ? (
            <tr>
              <td
                colSpan={isPenilaian ? 6 : 4}
                className="py-12 text-center text-slate-400 italic text-xs"
              >
                Belum ada parameter dan indikator KPI.
              </td>
            </tr>
          ) : (
            sortedCategories.map((cat, catIdx) => {
              const isDirect = cat.categoryType === "DIRECT";
              const catWeightPct = Math.round(Number(cat.weight) * 100);
              const catParams = categoryParametersMap.get(cat.id) || [];
              const cleanCatName = cat.name.replace(/^faktor\s+kinerja.*$/i, "Target Kerja");
              const isCatHighlighted = highlightedIds?.categoryId === cat.id;

              const isExpanded = currentExpandedCategoryIds.has(cat.id);
              const totalIndicators = isDirect ? 1 : catParams.length;
              const paramIds = isDirect ? (catParams[0] ? [catParams[0].id] : []) : catParams.map((p) => p.id);
              const totalBands = bands.filter((b) => paramIds.includes(b.parameterId)).length;

              const issueVal = categoryIssuesMap?.get(cat.id);
              const hasIssue = Boolean(issueVal);
              const issueTooltip = typeof issueVal === "string" ? issueVal : "Parameter ini memiliki perhatian validasi";

              // Check sum of indicator weights in this category
              const sumIndWeights = catParams.reduce(
                (sum, ind) => sum + Math.round(Number(ind.weight) * 100),
                0
              );
              const isIndWeightMismatch = !isDirect && catParams.length > 0 && sumIndWeights !== 100;

              return (
                <React.Fragment key={cat.id}>
                  {/* --------------------------------------------------------- */}
                  {/* BARIS PITA KATEGORI: ACCORDION HEADER (#BFDBFE) */}
                  {/* --------------------------------------------------------- */}
                  <tr
                    id={`category-row-${cat.id}`}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-controls={`category-content-${cat.id}`}
                    onClick={() => toggleCategory(cat.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleCategory(cat.id);
                      }
                    }}
                    className={`group transition-colors duration-150 cursor-pointer select-none border-y border-slate-300/80 bg-blue-100 dark:bg-blue-900/30 text-slate-900 ${
                      isExpanded
                        ? "shadow-2xs"
                        : "hover:brightness-95"
                    } ${
                      isCatHighlighted
                        ? "ring-2 ring-amber-400 ring-offset-1 z-20"
                        : ""
                    }`}
                  >
                    <td colSpan={isPenilaian ? 6 : 4} className="px-3.5 py-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs sm:text-[13px]">
                        {/* Sisi Kiri: Chevron (#1D4ED8) + Nomor + Nama (slate-900 font-bold) + Ikon Peringatan amber-600 */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="shrink-0 p-0.5 rounded text-[#1D4ED8] transition-transform duration-150">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#1D4ED8]" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[#1D4ED8]" />
                            )}
                          </span>

                          <span className="font-bold text-slate-700 text-xs shrink-0 select-none">
                            {catIdx + 1}.
                          </span>

                          {/* Inline Edit Nama Kategori */}
                          {isEdit && editingCell?.type === "catName" && editingCell.id === cat.id ? (
                            <input
                              type="text"
                              value={cellDraft}
                              onChange={(e) => setCellDraft(e.target.value)}
                              onBlur={async () => {
                                if (onUpdateCategory && cellDraft.trim()) {
                                  await onUpdateCategory(cat.id, { name: cellDraft.trim() });
                                }
                                setEditingCell(null);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  if (onUpdateCategory && cellDraft.trim()) {
                                    await onUpdateCategory(cat.id, { name: cellDraft.trim() });
                                  }
                                  setEditingCell(null);
                                } else if (e.key === "Escape") {
                                  setEditingCell(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="px-2 py-0.5 text-xs font-bold rounded bg-white text-slate-900 border border-blue-500 ring-2 ring-blue-400 focus:outline-none flex-1 min-w-0"
                            />
                          ) : (
                            <div
                              className="flex items-center gap-2 min-w-0"
                              onClick={(e) => {
                                if (isEdit) {
                                  e.stopPropagation();
                                  setEditingCell({ type: "catName", id: cat.id });
                                  setCellDraft(cat.name);
                                }
                              }}
                            >
                              <span
                                className="font-bold text-slate-900 tracking-tight truncate cursor-text"
                                title={isEdit ? "Klik untuk edit nama parameter" : undefined}
                              >
                                {cleanCatName}{" "}
                                <span className="font-semibold text-blue-900/85 text-xs">
                                  ({catWeightPct}% dari {templateTargetPct}%)
                                </span>
                              </span>
                              {hasIssue && (
                                <span
                                  title={issueTooltip}
                                  className="inline-flex items-center shrink-0 cursor-help"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Sisi Kanan: Ringkasan kecil + Tombol aksi hover + Total Bobot (blue-900 font-semibold) */}
                        <div
                          className="flex items-center gap-3 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] font-normal text-blue-950/70 select-none">
                            {totalIndicators} indikator · {totalBands} kriteria
                          </span>

                          {/* Hover Actions */}
                          {isEdit && (
                            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 flex items-center gap-1 transition-opacity duration-150">
                              {onAddIndicator && !isDirect && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddIndicator(cat.id);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-white/85 hover:bg-white text-blue-800 rounded border border-blue-300 transition cursor-pointer shadow-2xs"
                                  title="Tambah Indikator"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Indikator</span>
                                </button>
                              )}

                              {onDeleteCategory && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmDelete(
                                      `Hapus Parameter "${cat.name}"?`,
                                      "Seluruh indikator dan kriteria di dalam parameter ini akan dihapus.",
                                      () => onDeleteCategory(cat)
                                    );
                                  }}
                                  className="p-1 text-slate-600 hover:text-rose-600 hover:bg-white/60 rounded transition cursor-pointer"
                                  title="Hapus Parameter"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Total Bobot Kategori (Satu Kali Saja, #1E3A8A / blue-900) */}
                          {isEdit && editingCell?.type === "catWeight" && editingCell.id === cat.id ? (
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={cellDraft}
                              onChange={(e) => setCellDraft(e.target.value)}
                              onBlur={async () => {
                                if (onUpdateCategory && cellDraft) {
                                  await onUpdateCategory(cat.id, { weight: Number(cellDraft) });
                                }
                                setEditingCell(null);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  if (onUpdateCategory && cellDraft) {
                                    await onUpdateCategory(cat.id, { weight: Number(cellDraft) });
                                  }
                                  setEditingCell(null);
                                } else if (e.key === "Escape") {
                                  setEditingCell(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="w-12 px-1 py-0.5 text-xs font-bold text-center rounded bg-white text-slate-900 border border-blue-500 ring-2 ring-blue-400 font-mono"
                            />
                          ) : (
                            <span
                              onClick={(e) => {
                                if (isEdit) {
                                  e.stopPropagation();
                                  setEditingCell({ type: "catWeight", id: cat.id });
                                  setCellDraft(String(catWeightPct));
                                }
                              }}
                              className={`font-mono font-bold text-blue-950 text-xs sm:text-[13px] min-w-[38px] text-right ${
                                isEdit ? "cursor-text hover:underline" : ""
                              }`}
                              title={isEdit ? "Klik untuk ubah bobot parameter" : undefined}
                            >
                              {catWeightPct}%
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* --------------------------------------------------------- */}
                  {/* DIRECT CATEGORY ITEMS */}
                  {/* --------------------------------------------------------- */}
                  {isExpanded && isDirect && (() => {
                    const directParam = catParams[0];
                    const directBands = directParam
                      ? bands
                          .filter((b) => b.parameterId === directParam.id)
                          .sort(
                            (a, b) =>
                              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                              Number(b.score ?? 0) - Number(a.score ?? 0)
                          )
                      : [];

                    const bandRowsCount = Math.max(1, directBands.length);
                    const totalRowSpan = bandRowsCount + (isEdit ? 1 : 0);
                    const integrity = checkBandIntegrity(directBands);
                    const isParamHighlighted =
                      highlightedIds?.parameterId === directParam?.id || isCatHighlighted;

                    return (
                      <React.Fragment key={`direct-${cat.id}`}>
                        {Array.from({ length: bandRowsCount }).map((_, bIdx) => {
                          const band = directBands[bIdx];
                          const isFirst = bIdx === 0;
                          const isBandHighlighted = highlightedIds?.bandId === band?.id;
                          const rowHighlight =
                            integrity.hasIssue || isParamHighlighted || isBandHighlighted;

                          return (
                            <tr
                              key={band ? band.id : `empty-direct-${cat.id}-${bIdx}`}
                              id={
                                isFirst && directParam
                                  ? `indicator-row-${directParam.id}`
                                  : band
                                  ? `band-row-${band.id}`
                                  : undefined
                              }
                              className={`divide-x divide-slate-200 group scroll-mt-36 transition-all duration-150 h-9 ${
                                isParamHighlighted || isBandHighlighted
                                  ? "bg-amber-100/90 ring-2 ring-amber-400 ring-offset-1 z-10"
                                  : rowHighlight
                                  ? "bg-amber-50/70 hover:bg-amber-50"
                                  : "hover:bg-slate-50/70 bg-white"
                              }`}
                            >
                              {/* 1. Parameter (rowSpan) */}
                              {isFirst && (
                                <td
                                  rowSpan={totalRowSpan}
                                  className="px-3 py-2 align-top font-medium border border-slate-200 bg-white"
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="flex-1 min-w-0">
                                      <span
                                        className="font-semibold text-blue-950 dark:text-blue-100 line-clamp-2 block"
                                        title={cat.name}
                                      >
                                        {cat.name}
                                      </span>
                                      {directParam?.unit && (
                                        <span className="text-[10px] text-blue-700/75 dark:text-blue-300 font-mono font-medium">
                                          ({directParam.unit})
                                        </span>
                                      )}
                                    </div>

                                    {isEdit && directParam && (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 ml-1">
                                        {onEditIndicator && (
                                          <button
                                            type="button"
                                            onClick={() => onEditIndicator(cat.id, directParam)}
                                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                                            title="Edit Parameter & Skala Nilai"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {onDeleteIndicator && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleConfirmDelete(
                                                `Hapus Parameter "${cat.name}"?`,
                                                "Seluruh kriteria penilaian untuk parameter ini akan dihapus.",
                                                () => onDeleteIndicator(directParam)
                                              )
                                            }
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                            title="Hapus Parameter"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {directParam?.description && (
                                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-snug line-clamp-2">
                                      {directParam.description}
                                    </p>
                                  )}
                                  {integrity.hasIssue && (
                                    <div className="mt-1 text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-300">
                                      {integrity.message}
                                    </div>
                                  )}
                                </td>
                              )}

                              {/* 2. Kriteria Penilaian */}
                              <td className="px-3 py-1.5 align-middle border border-slate-200 text-slate-700">
                                {band ? (
                                  <div className="flex items-center justify-between gap-2">
                                    {isEdit &&
                                    editingCell?.type === "bandLabel" &&
                                    editingCell.id === band.id ? (
                                      <input
                                        type="text"
                                        value={cellDraft}
                                        onChange={(e) => setCellDraft(e.target.value)}
                                        onBlur={async () => {
                                          if (onUpdateCriteriaBandInline && cellDraft.trim()) {
                                            await onUpdateCriteriaBandInline(band, {
                                              label: cellDraft.trim(),
                                            });
                                          }
                                          setEditingCell(null);
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === "Enter") {
                                            if (onUpdateCriteriaBandInline && cellDraft.trim()) {
                                              await onUpdateCriteriaBandInline(band, {
                                                label: cellDraft.trim(),
                                              });
                                            }
                                            setEditingCell(null);
                                          } else if (e.key === "Escape") {
                                            setEditingCell(null);
                                          }
                                        }}
                                        autoFocus
                                        className="w-full px-2 py-0.5 text-xs rounded bg-white border border-blue-500 ring-2 ring-blue-400 focus:outline-none"
                                      />
                                    ) : (
                                      <span
                                        onClick={() => {
                                          if (isEdit) {
                                            setEditingCell({ type: "bandLabel", id: band.id });
                                            setCellDraft(band.label || "");
                                          }
                                        }}
                                        className={isEdit ? "cursor-text hover:text-blue-700" : ""}
                                        title={isEdit ? "Klik untuk edit kriteria" : undefined}
                                      >
                                        {(() => {
                                          const { operatorSymbol, criteriaValue, isUnrecognizedOperator } =
                                            parseBandOperatorDetails(band, directParam?.unit);
                                          return (
                                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                                              <span
                                                className={`inline-flex items-center gap-0.5 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded border shadow-2xs select-none shrink-0 ${
                                                  isUnrecognizedOperator || operatorSymbol === "?"
                                                    ? "bg-amber-100 text-amber-900 border-amber-400"
                                                    : operatorSymbol === ">=" || operatorSymbol === "≥" || operatorSymbol === ">"
                                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                                    : operatorSymbol === "<=" || operatorSymbol === "≤" || operatorSymbol === "<"
                                                    ? "bg-blue-50 text-blue-800 border-blue-300"
                                                    : operatorSymbol === "="
                                                    ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                                                    : operatorSymbol === "Rentang"
                                                    ? "bg-purple-50 text-purple-800 border-purple-300"
                                                    : "bg-slate-100 text-slate-800 border-slate-300"
                                                }`}
                                                title={`Operator: ${operatorSymbol}`}
                                              >
                                                <span className="text-[9px] uppercase font-bold text-slate-500 mr-0.5">Op:</span>
                                                <span>{operatorSymbol}</span>
                                              </span>
                                              <span className="font-semibold text-xs text-slate-900">
                                                {criteriaValue}
                                              </span>
                                              {(isUnrecognizedOperator || operatorSymbol === "?") && (
                                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-900 bg-amber-50 px-1 py-0.2 rounded border border-amber-300">
                                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                                  <span>Perlu pemeriksaan manual</span>
                                                </span>
                                              )}
                                            </span>
                                          );
                                        })()}
                                      </span>
                                    )}

                                    {/* Hover tool icons */}
                                    {isEdit && directParam && (
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {onEditCriteriaBand && (
                                          <button
                                            type="button"
                                            onClick={() => onEditCriteriaBand(band, directParam)}
                                            className="p-1 text-slate-400 hover:text-slate-800 rounded transition cursor-pointer"
                                            title="Edit Kriteria Modal"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                        )}
                                        {onDeleteCriteriaBand && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleConfirmDelete(
                                                "Hapus Baris Kriteria Ini?",
                                                `Kriteria "${renderBandCriteriaText(
                                                  band,
                                                  directParam?.unit
                                                )}" akan dihapus.`,
                                                () => onDeleteCriteriaBand(band.id)
                                              )
                                            }
                                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                            title="Hapus Kriteria"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">
                                    Belum ada kriteria penilaian
                                  </span>
                                )}
                              </td>

                              {/* 3. Realisasi (HANYA MUNCUL DI MODE PENILAIAN) */}
                              {isPenilaian && isFirst && (
                                <td
                                  rowSpan={totalRowSpan}
                                  className="px-2.5 py-1.5 align-middle text-center border border-slate-200 bg-white"
                                >
                                  {directParam && onAssessmentChange ? (
                                    <input
                                      type="text"
                                      value={assessmentValues[directParam.id]?.actualValue ?? ""}
                                      onChange={(e) =>
                                        onAssessmentChange(directParam.id, {
                                          actualValue: e.target.value,
                                        })
                                      }
                                      placeholder="0"
                                      className="w-full px-1.5 py-1 text-xs text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="font-mono text-slate-700 font-bold">
                                      {directParam
                                        ? assessmentValues[directParam.id]?.actualValue ?? "-"
                                        : "-"}
                                    </span>
                                  )}
                                </td>
                              )}

                              {/* 4. Skor */}
                              <td className="px-2 py-1.5 align-middle text-center font-bold text-slate-800 border border-slate-200 font-mono">
                                {band ? (
                                  isEdit &&
                                  editingCell?.type === "bandScore" &&
                                  editingCell.id === band.id ? (
                                    <input
                                      type="number"
                                      value={cellDraft}
                                      onChange={(e) => setCellDraft(e.target.value)}
                                      onBlur={async () => {
                                        if (onUpdateCriteriaBandInline && cellDraft) {
                                          await onUpdateCriteriaBandInline(band, {
                                            score: cellDraft,
                                          });
                                        }
                                        setEditingCell(null);
                                      }}
                                      onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                          if (onUpdateCriteriaBandInline && cellDraft) {
                                            await onUpdateCriteriaBandInline(band, {
                                              score: cellDraft,
                                            });
                                          }
                                          setEditingCell(null);
                                        } else if (e.key === "Escape") {
                                          setEditingCell(null);
                                        }
                                      }}
                                      autoFocus
                                      className="w-12 px-1 py-0.5 text-xs text-center font-mono font-bold rounded bg-white border border-blue-500 ring-2 ring-blue-400 focus:outline-none"
                                    />
                                  ) : (
                                    <span
                                      onClick={() => {
                                        if (isEdit) {
                                          setEditingCell({ type: "bandScore", id: band.id });
                                          setCellDraft(String(band.score || "0"));
                                        }
                                      }}
                                      className={isEdit ? "cursor-text hover:text-blue-700" : ""}
                                      title={isEdit ? "Klik untuk edit skor" : undefined}
                                    >
                                      {band.score}
                                    </span>
                                  )
                                ) : (
                                  "-"
                                )}
                              </td>

                              {/* 5. Bobot (rowSpan) */}
                              {isFirst && (
                                <td
                                  rowSpan={totalRowSpan}
                                  className="px-2 py-1.5 align-middle text-center font-bold text-slate-900 font-mono border border-slate-200 bg-white"
                                >
                                  {catWeightPct}%
                                </td>
                              )}

                              {/* 6. Skor Akhir (HANYA MUNCUL DI MODE PENILAIAN) */}
                              {isPenilaian && isFirst && (
                                <td
                                  rowSpan={totalRowSpan}
                                  className="px-2.5 py-1.5 align-middle text-center font-mono font-bold text-emerald-700 border border-slate-200 bg-white"
                                >
                                  {directParam &&
                                  assessmentValues[directParam.id]?.finalScore !== undefined &&
                                  assessmentValues[directParam.id]?.finalScore !== null
                                    ? `${assessmentValues[directParam.id]?.finalScore}%`
                                    : "-"}
                                </td>
                              )}
                            </tr>
                          );
                        })}

                        {/* Baris + Tambah Kriteria di dalam Grid Excel */}
                        {isEdit && directParam && (
                          <tr className="divide-x divide-slate-200 bg-slate-50/40 hover:bg-blue-50/40 transition-colors h-8">
                            <td
                              onClick={() => onAddCriteriaBand?.(directParam.id)}
                              className="h-8 px-3 py-1.5 text-[11px] text-blue-600 hover:underline cursor-pointer select-none font-medium border border-slate-200 text-left align-middle"
                            >
                              + Tambah kriteria
                            </td>
                            <td className="h-8 border border-slate-200 bg-slate-50/20" />
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })()}

                  {/* --------------------------------------------------------- */}
                  {/* STANDARD CATEGORY WITH SUB-PARAMETERS */}
                  {/* --------------------------------------------------------- */}
                  {isExpanded && !isDirect && catParams.length === 0 && (
                    <tr className="divide-x divide-slate-200">
                      <td
                        colSpan={isPenilaian ? 6 : 4}
                        className="px-3 py-4 text-center text-slate-400 italic text-[11px] border border-slate-200 bg-slate-50/40"
                      >
                        Belum ada indikator di parameter ini.{" "}
                        {isEdit && onAddIndicator && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddIndicator(cat.id);
                            }}
                            className="font-semibold text-blue-600 hover:underline not-italic cursor-pointer ml-1"
                          >
                            + Tambah Indikator
                          </button>
                        )}
                      </td>
                    </tr>
                  )}

                  {isExpanded &&
                    !isDirect &&
                    catParams.map((param, paramIdx) => {
                      const paramWeightPct = Math.round(Number(param.weight) * 100);
                      const paramBands = bands
                        .filter((b) => b.parameterId === param.id)
                        .sort(
                          (a, b) =>
                            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                            Number(b.score ?? 0) - Number(a.score ?? 0)
                        );

                      const bandRowsCount = Math.max(1, paramBands.length);
                      const totalRowSpan = bandRowsCount + (isEdit ? 1 : 0);
                      const integrity = checkBandIntegrity(paramBands);
                      const isParamHighlighted =
                        highlightedIds?.parameterId === param.id || isCatHighlighted;

                      return (
                        <React.Fragment key={param.id}>
                          {Array.from({ length: bandRowsCount }).map((_, bIdx) => {
                            const band = paramBands[bIdx];
                            const isFirst = bIdx === 0;
                            const isBandHighlighted = highlightedIds?.bandId === band?.id;
                            const rowHighlight =
                              integrity.hasIssue ||
                              paramBands.length === 0 ||
                              isParamHighlighted ||
                              isBandHighlighted;

                            return (
                              <tr
                                key={band ? band.id : `empty-param-${param.id}-${bIdx}`}
                                id={
                                  isFirst
                                    ? `indicator-row-${param.id}`
                                    : band
                                    ? `band-row-${band.id}`
                                    : undefined
                                }
                                className={`divide-x divide-slate-200 group scroll-mt-36 transition-all duration-150 h-9 ${
                                  isParamHighlighted || isBandHighlighted
                                    ? "bg-amber-100/90 ring-2 ring-amber-400 ring-offset-1 z-10"
                                    : rowHighlight
                                    ? "bg-amber-50/70 hover:bg-amber-50"
                                    : "hover:bg-slate-50/70 bg-white"
                                }`}
                              >
                                {/* 1. Parameter (rowSpan across criteria rows + add button) */}
                                {isFirst && (
                                  <td
                                    rowSpan={totalRowSpan}
                                    className="px-3 py-2 align-top font-medium border border-slate-200 bg-white"
                                  >
                                    <div className="flex items-start justify-between gap-1.5">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start gap-1 min-w-0">
                                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-400 text-xs shrink-0 select-none mt-0.5">
                                            {catIdx + 1}.{paramIdx + 1}
                                          </span>

                                          {isEdit &&
                                          editingCell?.type === "paramName" &&
                                          editingCell.id === param.id ? (
                                            <input
                                              type="text"
                                              value={cellDraft}
                                              onChange={(e) => setCellDraft(e.target.value)}
                                              onBlur={async () => {
                                                if (onUpdateIndicatorName && cellDraft.trim()) {
                                                  await onUpdateIndicatorName(param, cellDraft.trim());
                                                }
                                                setEditingCell(null);
                                              }}
                                              onKeyDown={async (e) => {
                                                if (e.key === "Enter") {
                                                  if (onUpdateIndicatorName && cellDraft.trim()) {
                                                    await onUpdateIndicatorName(
                                                      param,
                                                      cellDraft.trim()
                                                    );
                                                  }
                                                  setEditingCell(null);
                                                } else if (e.key === "Escape") {
                                                  setEditingCell(null);
                                                }
                                              }}
                                              autoFocus
                                              className="px-2 py-0.5 text-xs font-semibold rounded bg-white text-blue-950 border border-blue-500 ring-2 ring-blue-400 focus:outline-none w-full"
                                            />
                                          ) : (
                                            <span
                                              onClick={() => {
                                                if (isEdit) {
                                                  setEditingCell({
                                                    type: "paramName",
                                                    id: param.id,
                                                  });
                                                  setCellDraft(param.name);
                                                }
                                              }}
                                              className={`font-semibold text-blue-950 dark:text-blue-100 line-clamp-2 leading-tight ${
                                                isEdit ? "cursor-text hover:text-blue-700 dark:hover:text-blue-300" : ""
                                              }`}
                                              title={param.name}
                                            >
                                              {param.name}
                                            </span>
                                          )}
                                        </div>

                                        {param.unit && (
                                          <span className="text-[10px] text-blue-700/75 dark:text-blue-300 font-mono ml-4 font-medium block mt-0.5">
                                            ({param.unit})
                                          </span>
                                        )}
                                      </div>

                                      {/* Action Icons right next to indicator on hover */}
                                      {isEdit && (
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 ml-1">
                                          {onEditIndicator && (
                                            <button
                                              type="button"
                                              onClick={() => onEditIndicator(cat.id, param)}
                                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                                              title="Edit Indikator & Skala Nilai"
                                            >
                                              <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                          )}

                                          {onDeleteIndicator && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleConfirmDelete(
                                                  `Hapus Indikator "${param.name}"?`,
                                                  "Seluruh kriteria penilaian untuk indikator ini akan dihapus.",
                                                  () => onDeleteIndicator(param)
                                                )
                                              }
                                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                              title="Hapus Indikator"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {param.description && (
                                      <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-snug line-clamp-2">
                                        {param.description}
                                      </p>
                                    )}

                                    {integrity.hasIssue && (
                                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 font-medium bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-300">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        <span>{integrity.message}</span>
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* 2. Kriteria Penilaian */}
                                <td className="px-3 py-1.5 align-middle border border-slate-200 text-slate-700">
                                  {band ? (
                                    <div className="flex items-center justify-between gap-2">
                                      {isEdit &&
                                      editingCell?.type === "bandLabel" &&
                                      editingCell.id === band.id ? (
                                        <input
                                          type="text"
                                          value={cellDraft}
                                          onChange={(e) => setCellDraft(e.target.value)}
                                          onBlur={async () => {
                                            if (onUpdateCriteriaBandInline && cellDraft.trim()) {
                                              await onUpdateCriteriaBandInline(band, {
                                                label: cellDraft.trim(),
                                              });
                                            }
                                            setEditingCell(null);
                                          }}
                                          onKeyDown={async (e) => {
                                            if (e.key === "Enter") {
                                              if (onUpdateCriteriaBandInline && cellDraft.trim()) {
                                                await onUpdateCriteriaBandInline(band, {
                                                  label: cellDraft.trim(),
                                                });
                                              }
                                              setEditingCell(null);
                                            } else if (e.key === "Escape") {
                                              setEditingCell(null);
                                            }
                                          }}
                                          autoFocus
                                          className="w-full px-2 py-0.5 text-xs rounded bg-white border border-blue-500 ring-2 ring-blue-400 focus:outline-none"
                                        />
                                      ) : (
                                        <span
                                          onClick={() => {
                                            if (isEdit) {
                                              setEditingCell({
                                                type: "bandLabel",
                                                id: band.id,
                                              });
                                              setCellDraft(band.label || "");
                                            }
                                          }}
                                          className={isEdit ? "cursor-text hover:text-blue-700" : ""}
                                          title={isEdit ? "Klik untuk edit kriteria" : undefined}
                                        >
                                          {(() => {
                                            const { operatorSymbol, criteriaValue, isUnrecognizedOperator } =
                                              parseBandOperatorDetails(band, param.unit);
                                            return (
                                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                                <span
                                                  className={`inline-flex items-center gap-0.5 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded border shadow-2xs select-none shrink-0 ${
                                                    isUnrecognizedOperator || operatorSymbol === "?"
                                                      ? "bg-amber-100 text-amber-900 border-amber-400"
                                                      : operatorSymbol === ">=" || operatorSymbol === "≥" || operatorSymbol === ">"
                                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                                      : operatorSymbol === "<=" || operatorSymbol === "≤" || operatorSymbol === "<"
                                                      ? "bg-blue-50 text-blue-800 border-blue-300"
                                                      : operatorSymbol === "="
                                                      ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                                                      : operatorSymbol === "Rentang"
                                                      ? "bg-purple-50 text-purple-800 border-purple-300"
                                                      : "bg-slate-100 text-slate-800 border-slate-300"
                                                  }`}
                                                  title={`Operator: ${operatorSymbol}`}
                                                >
                                                  <span className="text-[9px] uppercase font-bold text-slate-500 mr-0.5">Op:</span>
                                                  <span>{operatorSymbol}</span>
                                                </span>
                                                <span className="font-semibold text-xs text-slate-900">
                                                  {criteriaValue}
                                                </span>
                                                {(isUnrecognizedOperator || operatorSymbol === "?") && (
                                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-900 bg-amber-50 px-1 py-0.2 rounded border border-amber-300">
                                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                                    <span>Perlu pemeriksaan manual</span>
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          })()}
                                        </span>
                                      )}

                                      {/* Hover row tool buttons */}
                                      {isEdit && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {onMoveBandOrder && (
                                            <div className="flex flex-col -space-y-0.5">
                                              <button
                                                type="button"
                                                onClick={() => onMoveBandOrder(band, "UP")}
                                                disabled={bIdx === 0}
                                                className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20 cursor-pointer"
                                                title="Pindah ke Atas"
                                              >
                                                <ChevronUp className="w-2.5 h-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => onMoveBandOrder(band, "DOWN")}
                                                disabled={bIdx === paramBands.length - 1}
                                                className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20 cursor-pointer"
                                                title="Pindah ke Bawah"
                                              >
                                                <ChevronDown className="w-2.5 h-2.5" />
                                              </button>
                                            </div>
                                          )}

                                          {onEditCriteriaBand && (
                                            <button
                                              type="button"
                                              onClick={() => onEditCriteriaBand(band, param)}
                                              className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100 transition cursor-pointer"
                                              title="Edit Kriteria Modal"
                                            >
                                              <Edit3 className="w-3 h-3" />
                                            </button>
                                          )}

                                          {onDeleteCriteriaBand && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleConfirmDelete(
                                                  "Hapus Baris Kriteria Ini?",
                                                  `Kriteria "${renderBandCriteriaText(
                                                    band,
                                                    param.unit
                                                  )}" akan dihapus.`,
                                                  () => onDeleteCriteriaBand(band.id)
                                                )
                                              }
                                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                                              title="Hapus Kriteria"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between text-amber-600 italic text-[11px]">
                                      <span>Belum ada kriteria</span>
                                      {isEdit && onEditIndicator && (
                                        <button
                                          type="button"
                                          onClick={() => onEditIndicator(cat.id, param)}
                                          className="text-[10px] font-bold text-blue-600 hover:underline not-italic cursor-pointer"
                                        >
                                          + Tambah Skala Nilai
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* 3. Realisasi (HANYA MUNCUL DI MODE PENILAIAN) */}
                                {isPenilaian && isFirst && (
                                  <td
                                    rowSpan={totalRowSpan}
                                    className="px-2.5 py-1.5 align-middle text-center border border-slate-200 bg-white"
                                  >
                                    {onAssessmentChange ? (
                                      <input
                                        type="text"
                                        value={assessmentValues[param.id]?.actualValue ?? ""}
                                        onChange={(e) =>
                                          onAssessmentChange(param.id, {
                                            actualValue: e.target.value,
                                          })
                                        }
                                        placeholder="0"
                                        className="w-full px-1.5 py-1 text-xs text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                    ) : (
                                      <span className="font-mono text-slate-700 font-bold">
                                        {assessmentValues[param.id]?.actualValue ?? "-"}
                                      </span>
                                    )}
                                  </td>
                                )}

                                {/* 4. Skor */}
                                <td className="px-2 py-1.5 align-middle text-center font-bold text-slate-800 border border-slate-200 font-mono">
                                  {band ? (
                                    isEdit &&
                                    editingCell?.type === "bandScore" &&
                                    editingCell.id === band.id ? (
                                      <input
                                        type="number"
                                        value={cellDraft}
                                        onChange={(e) => setCellDraft(e.target.value)}
                                        onBlur={async () => {
                                          if (onUpdateCriteriaBandInline && cellDraft) {
                                            await onUpdateCriteriaBandInline(band, {
                                              score: cellDraft,
                                            });
                                          }
                                          setEditingCell(null);
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === "Enter") {
                                            if (onUpdateCriteriaBandInline && cellDraft) {
                                              await onUpdateCriteriaBandInline(band, {
                                                score: cellDraft,
                                              });
                                            }
                                            setEditingCell(null);
                                          } else if (e.key === "Escape") {
                                            setEditingCell(null);
                                          }
                                        }}
                                        autoFocus
                                        className="w-12 px-1 py-0.5 text-xs text-center font-mono font-bold rounded bg-white border border-blue-500 ring-2 ring-blue-400 focus:outline-none"
                                      />
                                    ) : (
                                      <span
                                        onClick={() => {
                                          if (isEdit) {
                                            setEditingCell({ type: "bandScore", id: band.id });
                                            setCellDraft(String(band.score || "0"));
                                          }
                                        }}
                                        className={isEdit ? "cursor-text hover:text-blue-700" : ""}
                                        title={isEdit ? "Klik untuk edit skor" : undefined}
                                      >
                                        {band.score}
                                      </span>
                                    )
                                  ) : (
                                    "-"
                                  )}
                                </td>

                                {/* 5. Bobot (rowSpan) */}
                                {isFirst && (
                                  <td
                                    rowSpan={totalRowSpan}
                                    className={`px-2 py-1.5 align-middle text-center font-bold font-mono border border-slate-200 ${
                                      isIndWeightMismatch
                                        ? "bg-amber-50 text-amber-900"
                                        : "bg-white text-slate-900"
                                    }`}
                                  >
                                    {isEdit &&
                                    editingCell?.type === "paramWeight" &&
                                    editingCell.id === param.id ? (
                                      <div
                                        className="flex items-center justify-center gap-0.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="number"
                                          min="1"
                                          max="100"
                                          value={cellDraft}
                                          onChange={(e) => setCellDraft(e.target.value)}
                                          onBlur={async () => {
                                            if (onUpdateIndicatorWeight && cellDraft) {
                                              await onUpdateIndicatorWeight(
                                                param,
                                                Number(cellDraft)
                                              );
                                            }
                                            setEditingCell(null);
                                          }}
                                          onKeyDown={async (e) => {
                                            if (e.key === "Enter") {
                                              if (onUpdateIndicatorWeight && cellDraft) {
                                                await onUpdateIndicatorWeight(
                                                  param,
                                                  Number(cellDraft)
                                                );
                                              }
                                              setEditingCell(null);
                                            } else if (e.key === "Escape") {
                                              setEditingCell(null);
                                            }
                                          }}
                                          autoFocus
                                          className="w-12 px-1 py-0.5 text-xs text-center font-mono font-bold border border-blue-500 ring-2 ring-blue-400 rounded bg-white text-slate-900"
                                        />
                                        <span>%</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1">
                                        <span
                                          onClick={() => {
                                            if (isEdit) {
                                              setEditingCell({
                                                type: "paramWeight",
                                                id: param.id,
                                              });
                                              setCellDraft(String(paramWeightPct));
                                            }
                                          }}
                                          className={
                                            isEdit
                                              ? "cursor-text hover:text-blue-600 hover:underline"
                                              : ""
                                          }
                                          title={
                                            isEdit
                                              ? "Klik untuk mengubah bobot indikator inline"
                                              : undefined
                                          }
                                        >
                                          {paramWeightPct}%
                                        </span>
                                        {isIndWeightMismatch && (
                                          <span
                                            title={`Total bobot indikator parameter ini: ${sumIndWeights}% (harus 100%)`}
                                            className="cursor-help inline-flex items-center"
                                          >
                                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* 6. Skor Akhir (HANYA MUNCUL DI MODE PENILAIAN) */}
                                {isPenilaian && isFirst && (
                                  <td
                                    rowSpan={totalRowSpan}
                                    className="px-2.5 py-1.5 align-middle text-center font-mono font-bold text-emerald-700 border border-slate-200 bg-white"
                                  >
                                    {assessmentValues[param.id]?.finalScore !== undefined &&
                                    assessmentValues[param.id]?.finalScore !== null
                                      ? `${assessmentValues[param.id]?.finalScore}%`
                                      : "-"}
                                  </td>
                                )}
                              </tr>
                            );
                          })}

                          {/* Baris + Tambah Kriteria di dalam Grid Excel */}
                          {isEdit && (
                            <tr className="divide-x divide-slate-200 bg-slate-50/40 hover:bg-blue-50/40 transition-colors h-8">
                              <td
                                onClick={() => onAddCriteriaBand?.(param.id)}
                                className="h-8 px-3 py-1.5 text-[11px] text-blue-600 hover:underline cursor-pointer select-none font-medium border border-slate-200 text-left align-middle"
                              >
                                + Tambah kriteria
                              </td>
                              <td className="h-8 border border-slate-200 bg-slate-50/20" />
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                  {/* Baris + Tambah Indikator di dalam Grid Excel di bawah Kategori */}
                  {isExpanded && isEdit && !isDirect && (
                    <tr className="divide-x divide-slate-200 bg-slate-50/60 hover:bg-blue-50/60 transition-colors h-8">
                      <td
                        colSpan={isPenilaian ? 6 : 4}
                        onClick={() => onAddIndicator?.(cat.id)}
                        className="px-4 py-1.5 text-xs text-blue-700 font-semibold hover:underline cursor-pointer select-none border border-slate-200"
                      >
                        + Tambah indikator di {cleanCatName}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
