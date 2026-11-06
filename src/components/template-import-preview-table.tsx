"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Loader2,
  Search,
  Check,
  AlertCircle,
  FileMinus,
  Sparkles,
  RotateCcw,
  MoveHorizontal,
} from "lucide-react";
import type {
  ParsedCategory,
  MasterParamItem,
} from "@/lib/excel-template-kpi";
import {
  extractCriteriaValue,
} from "@/lib/excel-template-kpi";
import {
  validateStructuredCriteria,
  parseRangeValues,
  extractSingleNumericValue,
  type CriteriaItem,
} from "@/lib/kpi-criteria-helper";
import { ParameterPickerModal } from "./parameter-picker-modal";

export type ComparisonStatus = "MATCHED" | "DIFFERENT" | "ADDED" | "REMOVED";

export interface IndicatorComparisonItem {
  name: string;
  categoryName: string;
  status: ComparisonStatus;
  diffDetails?: string[];
  existingIndicator?: {
    id: number;
    name: string;
    target?: string | null;
    unit?: string | null;
    weight: number;
  };
}

interface TemplateImportPreviewTableProps {
  categories: ParsedCategory[];
  masterParameters: MasterParamItem[];
  departmentId: number | "";
  departmentName?: string;
  onUpdateIndicatorMasterId: (
    catIndex: number,
    paramIndex: number,
    masterParameterId: number | null
  ) => void;
  onAddIndicatorToMaster?: (
    catIndex: number,
    paramIndex: number
  ) => Promise<void> | void;
  addingParamKey?: string | null;
  comparisonMap?: Map<string, IndicatorComparisonItem>;
  removedIndicators?: IndicatorComparisonItem[];
  hasExistingMaster?: boolean;
  onUpdateBandScore: (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newScore: number
  ) => void;
  onUpdateBandOperator?: (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newOperatorSymbol: string
  ) => void;
  onUpdateBandCriteriaValue?: (
    catIndex: number,
    paramIndex: number,
    bandIndex: number,
    newCriteriaValue: string
  ) => void;
  onUpdateIndicatorWeight?: (
    catIndex: number,
    paramIndex: number,
    newWeight: number
  ) => void;
  onUpdateIndicatorName?: (
    catIndex: number,
    paramIndex: number,
    newName: string
  ) => void;
  onUpdateIndicatorTarget?: (
    catIndex: number,
    paramIndex: number,
    newTarget: string
  ) => void;
  onUpdateCategoryWeight?: (
    catIndex: number,
    newWeight: number
  ) => void;
  onAutoBalanceIndicatorWeights?: (catIndex: number) => void;
  onAutoHarmonizeParamBands?: (catIndex: number, paramIndex: number) => void;
  onAutoHarmonizeAllBands?: () => void;
}

export type ColumnKey =
  | "no"
  | "parameter"
  | "indicator"
  | "criteria"
  | "score"
  | "internalWeight"
  | "weight"
  | "mapping";

const DEFAULT_COL_WIDTHS: Record<ColumnKey, number> = {
  no: 44,
  parameter: 170,
  indicator: 250,
  criteria: 270,
  score: 64,
  internalWeight: 84,
  weight: 76,
  mapping: 220,
};

const MIN_COL_WIDTHS: Record<ColumnKey, number> = {
  no: 36,
  parameter: 100,
  indicator: 130,
  criteria: 160,
  score: 48,
  internalWeight: 65,
  weight: 60,
  mapping: 140,
};

export function TemplateImportPreviewTable({
  categories,
  masterParameters,
  departmentId,
  departmentName,
  onUpdateIndicatorMasterId,
  onAddIndicatorToMaster,
  addingParamKey,
  comparisonMap,
  removedIndicators = [],
  hasExistingMaster = false,
  onUpdateBandScore,
  onUpdateBandOperator,
  onUpdateBandCriteriaValue,
  onUpdateIndicatorWeight,
  onUpdateIndicatorName,
  onUpdateIndicatorTarget,
  onUpdateCategoryWeight,
  onAutoBalanceIndicatorWeights,
  onAutoHarmonizeParamBands,
  onAutoHarmonizeAllBands,
}: TemplateImportPreviewTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // State lebar kolom yang dapat di-drag / diubah ukurannya secara bebas
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COL_WIDTHS);

  const startResizing = (colKey: ColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(MIN_COL_WIDTHS[colKey], startWidth + diff);
      setColWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const resetColWidth = (colKey: ColumnKey) => {
    setColWidths((prev) => ({
      ...prev,
      [colKey]: DEFAULT_COL_WIDTHS[colKey],
    }));
  };

  const resetAllColWidths = () => {
    setColWidths(DEFAULT_COL_WIDTHS);
  };

  const isAnyColumnResized = useMemo(() => {
    return (Object.keys(DEFAULT_COL_WIDTHS) as ColumnKey[]).some(
      (k) => colWidths[k] !== DEFAULT_COL_WIDTHS[k]
    );
  }, [colWidths]);

  const totalTableWidth = useMemo(() => {
    return (Object.keys(colWidths) as ColumnKey[]).reduce(
      (sum, k) => sum + (colWidths[k] || DEFAULT_COL_WIDTHS[k]),
      0
    );
  }, [colWidths]);

  const renderResizeHandle = (colKey: ColumnKey) => (
    <div
      onMouseDown={(e) => startResizing(colKey, e)}
      onDoubleClick={() => resetColWidth(colKey)}
      className="absolute top-0 right-0 bottom-0 w-3 cursor-col-resize select-none flex items-center justify-end z-30 group/handle"
      title="Tarik untuk ubah lebar kolom (Klik ganda untuk reset)"
    >
      <div className="w-[3px] h-full bg-slate-300/80 group-hover/handle:bg-blue-500 transition-colors" />
    </div>
  );

  // State untuk Modal Pemilihan Parameter (Target catIndex & paramIndex)
  const [pickerTarget, setPickerTarget] = useState<{
    catIndex: number;
    paramIndex: number;
  } | null>(null);

  // State untuk popover detail alert overlap / celah kriteria saat icon diklik
  const [activeAlertKey, setActiveAlertKey] = useState<string | null>(null);

  // Ambil parameter & kategori target yang sedang aktif di modal
  const activeTargetParam = useMemo(() => {
    if (!pickerTarget) return null;
    const cat = categories[pickerTarget.catIndex];
    return cat?.params[pickerTarget.paramIndex] || null;
  }, [categories, pickerTarget]);

  const activeTargetCategory = useMemo(() => {
    if (!pickerTarget) return null;
    return categories[pickerTarget.catIndex] || null;
  }, [categories, pickerTarget]);

  // Filter kategori dan indikator berdasarkan pencarian,
  // sambil menjaga index asli (origCatIdx & origParamIdx) ke array utama categories
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return categories
      .map((cat, origCatIdx) => {
        const matchingParams = cat.params
          .map((param, origParamIdx) => ({ param, origParamIdx }))
          .filter(({ param }) => {
            const normName = param.name.trim().toLowerCase();

            // Filter query pencarian
            if (q) {
              const matchName = normName.includes(q);
              const matchCat = cat.name.toLowerCase().includes(q);
              const matchDesc = param.description?.toLowerCase().includes(q);
              if (!matchName && !matchCat && !matchDesc) return false;
            }

            return true;
          });

        return {
          ...cat,
          origCatIdx,
          filteredParams: matchingParams,
        };
      })
      .filter((cat) => cat.filteredParams.length > 0);
  }, [categories, searchQuery]);

  // Hitung jumlah indikator yang memiliki peringatan gap atau error overlap kriteria
  const indicatorsWithIssuesCount = useMemo(() => {
    let count = 0;
    for (const cat of categories) {
      for (const param of cat.params) {
        const paramCriteriaItems: CriteriaItem[] = param.bands.map((b, idx) => {
          const rawCriteria = (b.criteriaValue ?? extractCriteriaValue(b.label, b.operator)).trim();
          const effectiveOp =
            b.operatorSymbol === "Rentang"
              ? "BETWEEN"
              : b.operatorSymbol === ">="
              ? "GTE"
              : b.operatorSymbol === ">"
              ? "GT"
              : b.operatorSymbol === "<="
              ? "LTE"
              : b.operatorSymbol === "<"
              ? "LT"
              : b.operatorSymbol === "="
              ? "EQ"
              : b.operatorSymbol === "Teks"
              ? "TEXT"
              : b.operator;

          let minV = b.minValue != null ? String(b.minValue) : "";
          let maxV = b.maxValue != null ? String(b.maxValue) : "";
          let minInc = b.minInclusive;
          let maxInc = b.maxInclusive;

          if (effectiveOp === "BETWEEN") {
            const range = parseRangeValues(rawCriteria || b.label);
            if (range) {
              minV = String(range.min);
              maxV = String(range.max);
              if (minInc === undefined) minInc = range.minInclusive;
              if (maxInc === undefined) maxInc = range.maxInclusive;
            }
          } else if (effectiveOp === "GT" || effectiveOp === "GTE") {
            maxV = "";
            const num = extractSingleNumericValue(rawCriteria);
            if (num !== null) minV = String(num);
          } else if (effectiveOp === "LT" || effectiveOp === "LTE") {
            minV = "";
            const num = extractSingleNumericValue(rawCriteria);
            if (num !== null) maxV = String(num);
          } else if (effectiveOp === "EQ") {
            const num = extractSingleNumericValue(rawCriteria);
            if (num !== null) {
              minV = String(num);
              maxV = String(num);
            }
          }

          return {
            id: b.id ? String(b.id) : `band-${idx}`,
            label: b.label || rawCriteria,
            score: String(b.score ?? 0),
            operator: effectiveOp,
            minValue: minV,
            maxValue: maxV,
            minInclusive: minInc,
            maxInclusive: maxInc,
          };
        });

        const val = validateStructuredCriteria(
          paramCriteriaItems,
          "HIGHER_IS_BETTER",
          param.unit || "%",
          param.inputType || "PERCENTAGE"
        );
        if (val.hasErrors || val.hasWarnings) {
          count++;
        }
      }
    }
    return count;
  }, [categories]);

  if (categories.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-500 text-xs">
        <p className="font-semibold text-slate-700">Belum ada data tabel yang terbaca</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Silakan unggah berkas Excel pada tahap sebelumnya untuk melihat pratinjau struktur KPI.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar Pencarian & Aksi Otomatis */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
        {/* Search input & Column width hint */}
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari indikator atau parameter..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <MoveHorizontal className="w-3.5 h-3.5" />
              <span>Batas kolom dapat digeser</span>
            </span>
            {isAnyColumnResized && (
              <button
                type="button"
                onClick={resetAllColWidths}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition cursor-pointer"
                title="Kembalikan semua lebar kolom ke ukuran awal"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset Lebar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabel Pratinjau Utama: Kolom Terstruktur & Dapat Digeser */}
      <div className="rounded-xl border border-slate-300 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
          <table
            className="w-full text-left text-xs border-collapse table-fixed"
            style={{ minWidth: `${totalTableWidth}px` }}
          >
            <colgroup>
              <col style={{ width: `${colWidths.no}px` }} />
              <col style={{ width: `${colWidths.parameter}px` }} />
              <col style={{ width: `${colWidths.indicator}px` }} />
              <col style={{ width: `${colWidths.criteria}px` }} />
              <col style={{ width: `${colWidths.score}px` }} />
              <col style={{ width: `${colWidths.internalWeight}px` }} />
              <col style={{ width: `${colWidths.weight}px` }} />
              <col style={{ width: `${colWidths.mapping}px` }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-100 text-[11px] font-bold text-slate-800 border-b border-slate-300 shadow-2xs">
              <tr>
                <th className="relative py-1.5 px-2 text-center border-r border-slate-300 select-none">
                  No
                  {renderResizeHandle("no")}
                </th>
                <th className="relative py-1.5 px-2 border-r border-slate-300 select-none">
                  Parameter
                  {renderResizeHandle("parameter")}
                </th>
                <th className="relative py-1.5 px-2 border-r border-slate-300 select-none">
                  Indikator
                  {renderResizeHandle("indicator")}
                </th>
                <th className="relative py-1.5 px-2 border-r border-slate-300 select-none">
                  Kriteria Penilaian
                  {renderResizeHandle("criteria")}
                </th>
                <th
                  className="relative py-1.5 px-1.5 text-center border-r border-slate-300 select-none"
                  title="Skor dapat diedit langsung"
                >
                  Skor
                  {renderResizeHandle("score")}
                </th>
                <th
                  className="relative py-1.5 px-1.5 text-center border-r border-slate-300 select-none"
                  title="Bobot internal sub bab dapat diedit"
                >
                  Bobot Internal
                  {renderResizeHandle("internalWeight")}
                </th>
                <th
                  className="relative py-1.5 px-1.5 text-center border-r border-slate-300 select-none"
                  title="Bobot parameter utama dapat diedit"
                >
                  Bobot
                  {renderResizeHandle("weight")}
                </th>
                <th className="relative py-1.5 px-2 select-none">
                  Mapping Kamus
                  {renderResizeHandle("mapping")}
                </th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {filteredCategories.map((cat) => {
                const origCatIdx = cat.origCatIdx;
                const catNo = origCatIdx + 1;
                const catWeightPct = Math.round(cat.weight * 100);
                const cleanCatName =
                  cat.name
                    .replace(/^[0-9]+(?:\.[0-9]+)*\s*[-.]?\s*/, "")
                    .replace(/^[IVXLCDM]+\.\s*/i, "")
                    .trim() || cat.name;

                // Hitung total bobot internal sub-parameter di Indikator 1
                const catInternalWeightSum = cat.params.reduce((acc, p) => acc + (p.weight || 0), 0);
                const catInternalWeightPct = Math.round(catInternalWeightSum * 100);
                const isInternalWeightValid = Math.abs(catInternalWeightPct - 100) <= 1;

                const catTotalRows = cat.filteredParams.reduce(
                  (sum, { param }) => sum + Math.max(param.bands.length, 1),
                  0
                );

                return (
                  <React.Fragment key={`cat-${origCatIdx}`}>
                    {cat.filteredParams.map(({ param, origParamIdx }, pDisplayIdx) => {
                      const pWeightPct = Math.round(param.weight * 100);
                      const paramRowSpan = Math.max(param.bands.length, 1);

                      // Penomoran sub bab mandiri (misal 1.1, 1.2, atau 2.1 untuk direct)
                      const subNumber =
                        cat.categoryType === "SUB_ITEMS"
                          ? param.subParamNumber ||
                            (param.indicatorNumber ? param.indicatorNumber : `${catNo}.${origParamIdx + 1}`)
                          : `${catNo}.1`;

                      const matchedMaster = param.masterParameterId != null
                        ? masterParameters.find(
                            (mp) => Number(mp.id) === Number(param.masterParameterId)
                          )
                        : undefined;
                      const isMatched = Boolean(matchedMaster);

                      const paramCriteriaItems: CriteriaItem[] = (
                        param.bands.length > 0 ? param.bands : []
                      ).map((b, idx) => {
                        let minV = b.minValue != null ? String(b.minValue) : "";
                        let maxV = b.maxValue != null ? String(b.maxValue) : "";
                        let minInc = b.minInclusive;
                        let maxInc = b.maxInclusive;

                        const rawCriteria = (b.criteriaValue ?? extractCriteriaValue(b.label, b.operator)).trim();
                        const effectiveOp =
                          b.operatorSymbol === "Rentang"
                            ? "BETWEEN"
                            : b.operatorSymbol === ">="
                            ? "GTE"
                            : b.operatorSymbol === ">"
                            ? "GT"
                            : b.operatorSymbol === "<="
                            ? "LTE"
                            : b.operatorSymbol === "<"
                            ? "LT"
                            : b.operatorSymbol === "="
                            ? "EQ"
                            : b.operatorSymbol === "Teks"
                            ? "TEXT"
                            : b.operator;

                        if (effectiveOp === "BETWEEN") {
                          const range = parseRangeValues(rawCriteria || b.label);
                          if (range) {
                            minV = String(range.min);
                            maxV = String(range.max);
                            if (minInc === undefined) minInc = range.minInclusive;
                            if (maxInc === undefined) maxInc = range.maxInclusive;
                          }
                        } else if (effectiveOp === "GT" || effectiveOp === "GTE") {
                          maxV = "";
                          const num = extractSingleNumericValue(rawCriteria);
                          if (num !== null) minV = String(num);
                        } else if (effectiveOp === "LT" || effectiveOp === "LTE") {
                          minV = "";
                          const num = extractSingleNumericValue(rawCriteria);
                          if (num !== null) maxV = String(num);
                        } else if (effectiveOp === "EQ") {
                          const num = extractSingleNumericValue(rawCriteria);
                          if (num !== null) {
                            minV = String(num);
                            maxV = String(num);
                          }
                        }

                        return {
                          id: b.id ? String(b.id) : `band-${idx}`,
                          label: b.label || rawCriteria,
                          score: String(b.score ?? 0),
                          operator: effectiveOp,
                          minValue: minV,
                          maxValue: maxV,
                          minInclusive: minInc,
                          maxInclusive: maxInc,
                        };
                      });
                      const paramValidation = validateStructuredCriteria(
                        paramCriteriaItems,
                        "HIGHER_IS_BETTER",
                        param.unit || "%",
                        param.inputType || "PERCENTAGE"
                      );

                      const bands =
                        param.bands.length > 0
                          ? param.bands
                          : [
                              {
                                label: "Standar",
                                score: 25,
                                operator: "EQ" as const,
                                minValue: null,
                                maxValue: null,
                                sortOrder: 0,
                              },
                            ];

                      return bands.map((band, bIdx) => {
                        const isFirstRowOfCat = pDisplayIdx === 0 && bIdx === 0;
                        const isFirstRowOfParam = bIdx === 0;
                        const isLastBandOfParam = bIdx === bands.length - 1;
                        const isNewCategory = isFirstRowOfCat && origCatIdx > 0;
                        const isNewIndicator = isFirstRowOfParam && pDisplayIdx > 0;

                        return (
                          <tr
                            key={`cat-${origCatIdx}-p-${origParamIdx}-b-${bIdx}`}
                            className={`transition-colors ${
                              isNewCategory
                                ? "border-t-2 border-slate-300"
                                : isNewIndicator
                                ? "border-t border-slate-300"
                                : ""
                            } ${
                              isLastBandOfParam ? "border-b border-slate-300" : "border-b border-slate-100"
                            } hover:bg-slate-50/50`}
                          >
                            {/* 1. No (Penomoran utama 1 s/d 5) */}
                            {isFirstRowOfCat && (
                              <td
                                rowSpan={catTotalRows}
                                className="py-2 px-1 text-center align-top bg-slate-50/40 border-r border-slate-300 border-b border-slate-300"
                              >
                                <div className="sticky top-10 flex justify-center">
                                  <span className="font-mono font-bold text-xs text-slate-800">
                                    {catNo}
                                  </span>
                                </div>
                              </td>
                            )}

                            {/* 2. Parameter (Parameter Utama) */}
                            {isFirstRowOfCat && (
                              <td
                                rowSpan={catTotalRows}
                                className="py-2 px-2 border-r border-slate-300 border-b border-slate-300 align-top bg-slate-50/20"
                              >
                                <div className="space-y-1 sticky top-10">
                                  <span className="font-bold text-slate-900 block text-xs leading-snug break-words">
                                    {cleanCatName}
                                  </span>

                                  {/* Hanya tampilkan peringatan bila bobot internal sub-parameter tidak pas 100% */}
                                  {cat.categoryType === "SUB_ITEMS" && !isInternalWeightValid && (
                                    <div className="mt-1 flex flex-col gap-0.5">
                                      <span
                                        className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-rose-50 text-rose-800 border-rose-300"
                                        title="Total bobot internal seluruh subparameter dalam kategori wajib 100%"
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>Total Sub: {catInternalWeightPct}%</span>
                                      </span>
                                      {onAutoBalanceIndicatorWeights && (
                                        <button
                                          type="button"
                                          onClick={() => onAutoBalanceIndicatorWeights(origCatIdx)}
                                          className="text-[9px] text-blue-700 hover:text-blue-900 underline text-left font-semibold cursor-pointer"
                                          title="Bagi rata bobot subparameter agar total tepat 100%"
                                        >
                                          Seimbangkan (100%)
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* 3. Indikator (Nama Indikator Bersih) */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-1.5 px-2 border-r border-slate-300 border-b border-slate-300 align-top bg-white ${
                                  isNewIndicator ? "border-t border-slate-300" : ""
                                }`}
                              >
                                <div className="flex items-start gap-1">
                                  <span className="font-mono text-xs font-bold text-slate-800 shrink-0 mt-0.5">
                                    {subNumber}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    {onUpdateIndicatorName ? (
                                      <input
                                        type="text"
                                        value={param.name}
                                        onChange={(e) => onUpdateIndicatorName(origCatIdx, origParamIdx, e.target.value)}
                                        className="w-full px-1.5 py-0.5 text-xs font-semibold text-slate-900 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none transition leading-tight"
                                        title="Ubah nama indikator langsung"
                                        aria-label={`Nama indikator ${subNumber}`}
                                      />
                                    ) : (
                                      <span className="font-semibold text-slate-900 text-xs block leading-snug break-words">
                                        {param.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* 4. Kriteria Penilaian (Operator dan Nilai Kriteria Terpisah) */}
                            <td
                              className={`py-1 px-1.5 text-slate-800 border-r border-slate-300 align-top bg-white ${
                                isLastBandOfParam ? "border-b border-slate-300" : "border-b border-slate-100"
                              } ${isNewIndicator ? "border-t border-slate-300" : ""}`}
                            >
                              <div className="flex items-center gap-1">
                                {/* Field Operator */}
                                <div className="relative shrink-0">
                                  <select
                                    value={
                                      band.operatorSymbol ||
                                      (band.operator === "GTE"
                                        ? ">="
                                        : band.operator === "GT"
                                        ? ">"
                                        : band.operator === "LTE"
                                        ? "<="
                                        : band.operator === "LT"
                                        ? "<"
                                        : band.operator === "EQ"
                                        ? "="
                                        : band.operator === "BETWEEN"
                                        ? "Rentang"
                                        : "Teks")
                                    }
                                    onChange={(e) => {
                                      onUpdateBandOperator?.(
                                        origCatIdx,
                                        origParamIdx,
                                        bIdx,
                                        e.target.value
                                      );
                                    }}
                                    className={`h-6 px-1 py-0 rounded text-[11px] font-mono font-semibold border transition focus:outline-none focus:ring-1 cursor-pointer ${
                                      band.isUnrecognizedOperator || band.operatorSymbol === "?" || band.needsManualReview
                                        ? "bg-amber-50 text-amber-900 border-amber-400 focus:border-amber-600 focus:ring-amber-200"
                                        : "bg-white text-slate-800 border-slate-300 hover:border-slate-400 focus:border-slate-500 focus:ring-slate-300"
                                    }`}
                                    title="Pilih operator pembanding kriteria"
                                    aria-label={`Operator kriteria ${param.name} baris ${bIdx + 1}`}
                                  >
                                    <option value=">=">&gt;= (≥)</option>
                                    <option value=">">&gt;</option>
                                    <option value="<=">&lt;= (≤)</option>
                                    <option value="<">&lt;</option>
                                    <option value="=">=</option>
                                    <option value="Rentang">Rentang</option>
                                    <option value="Teks">Teks</option>
                                    {(band.isUnrecognizedOperator || band.operatorSymbol === "?" || band.needsManualReview) && (
                                      <option value="?">⚠️ ? (Tidak Dikenali)</option>
                                    )}
                                  </select>
                                </div>

                                {/* Field Nilai Kriteria */}
                                <div className="min-w-0 flex-1">
                                  <input
                                    type="text"
                                    value={
                                      band.criteriaValue !== undefined && band.criteriaValue !== null
                                        ? band.criteriaValue
                                        : extractCriteriaValue(band.label, band.operator)
                                    }
                                    onChange={(e) => {
                                      onUpdateBandCriteriaValue?.(
                                        origCatIdx,
                                        origParamIdx,
                                        bIdx,
                                        e.target.value
                                      );
                                    }}
                                    placeholder="Nilai kriteria..."
                                    className="w-full h-6 px-1.5 py-0 rounded text-[11px] text-slate-800 bg-white border border-slate-300 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300 transition"
                                    title={`Ubah nilai kriteria (saat ini: ${band.label})`}
                                    aria-label={`Nilai kriteria ${param.name} baris ${bIdx + 1}`}
                                  />
                                </div>

                                {/* Marker Pemeriksaan Manual jika operator belum pasti (klik icon untuk lihat detail) */}
                                {(band.isUnrecognizedOperator || band.operatorSymbol === "?" || band.needsManualReview) && (
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveAlertKey(
                                          activeAlertKey === `manual-${origCatIdx}-${origParamIdx}-${bIdx}`
                                            ? null
                                            : `manual-${origCatIdx}-${origParamIdx}-${bIdx}`
                                        )
                                      }
                                      className="h-6 w-6 rounded flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 transition cursor-pointer"
                                      title="Perlu periksa manual (Klik icon untuk detail)"
                                      aria-label="Detail periksa manual"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    </button>

                                    {activeAlertKey === `manual-${origCatIdx}-${origParamIdx}-${bIdx}` && (
                                      <>
                                        <div
                                          className="fixed inset-0 z-30"
                                          onClick={() => setActiveAlertKey(null)}
                                        />
                                        <div className="absolute right-0 top-full mt-1 w-72 z-40 bg-white rounded-lg shadow-xl border border-slate-300 p-2.5 text-xs text-left">
                                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
                                            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-[11px]">
                                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                              <span>Perlu Pemeriksaan Manual</span>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setActiveAlertKey(null)}
                                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition cursor-pointer text-xs"
                                              title="Tutup"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                          <p className="text-[11px] text-slate-700 leading-snug">
                                            {band.manualReviewReason || "Operator pembanding atau nilai kriteria belum dikenali dengan pasti."}
                                          </p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Icon Alert Overlap / Gap kriteria (klik icon untuk lihat detail) */}
                                {isFirstRowOfParam && (paramValidation?.hasErrors || paramValidation?.hasWarnings) && (
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveAlertKey(
                                          activeAlertKey === `crit-${origCatIdx}-${origParamIdx}`
                                            ? null
                                            : `crit-${origCatIdx}-${origParamIdx}`
                                        )
                                      }
                                      className={`h-6 w-6 rounded flex items-center justify-center transition cursor-pointer border ${
                                        paramValidation.hasErrors
                                          ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-300 animate-pulse"
                                          : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300"
                                      }`}
                                      title={
                                        paramValidation.hasErrors
                                          ? "Overlap nilai terdeteksi (Klik icon untuk detail)"
                                          : "Celah rentang terdeteksi (Klik icon untuk detail)"
                                      }
                                      aria-label="Detail peringatan kriteria"
                                    >
                                      {paramValidation.hasErrors ? (
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                      ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                      )}
                                    </button>

                                    {activeAlertKey === `crit-${origCatIdx}-${origParamIdx}` && (
                                      <>
                                        <div
                                          className="fixed inset-0 z-30"
                                          onClick={() => setActiveAlertKey(null)}
                                        />
                                        <div className="absolute right-0 top-full mt-1 w-80 z-40 bg-white rounded-lg shadow-xl border border-slate-300 p-2.5 text-xs text-left">
                                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
                                            <div className="flex items-center gap-1.5 font-bold">
                                              {paramValidation.hasErrors ? (
                                                <>
                                                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                                  <span className="text-rose-900 text-[11px]">
                                                    Overlap Nilai Terdeteksi
                                                  </span>
                                                </>
                                              ) : (
                                                <>
                                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                                  <span className="text-amber-900 text-[11px]">
                                                    Celah Rentang Terdeteksi
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setActiveAlertKey(null)}
                                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition cursor-pointer text-xs"
                                              title="Tutup"
                                            >
                                              ✕
                                            </button>
                                          </div>

                                          <div className="space-y-1 text-[11px] text-slate-700 max-h-48 overflow-y-auto pr-1">
                                            {paramValidation.hasErrors &&
                                              paramValidation.errors.map((err, eIdx) => (
                                                <div key={`err-${eIdx}`} className="text-rose-700 leading-snug">
                                                  • {err}
                                                </div>
                                              ))}
                                            {!paramValidation.hasErrors &&
                                              paramValidation.warnings.map((warn, wIdx) => (
                                                <div key={`warn-${wIdx}`} className="text-amber-800 leading-snug">
                                                  • {warn}
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. Skor (Bisa diedit langsung) */}
                            <td
                              className={`py-1 px-1 text-center border-r border-slate-300 align-top ${
                                isLastBandOfParam ? "border-b border-slate-300" : "border-b border-slate-100"
                              } ${isNewIndicator ? "border-t border-slate-300" : ""}`}
                            >
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={band.score ?? ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  onUpdateBandScore(origCatIdx, origParamIdx, bIdx, isNaN(val) ? 0 : val);
                                }}
                                className="w-12 h-6 text-center px-1 py-0 rounded font-mono font-semibold text-[11px] border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300 transition"
                                title={`Edit skor kriteria "${band.label}" (Nilai: ${band.score})`}
                                aria-label={`Skor ${band.label}`}
                              />
                            </td>

                            {/* 6. Bobot Internal (Sub Bab bisa edit) */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-1.5 px-1 text-center border-r border-slate-300 border-b border-slate-300 align-top bg-white ${
                                  isNewIndicator ? "border-t border-slate-300" : ""
                                }`}
                              >
                                {cat.categoryType === "DIRECT" ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-bold" title="Penilaian langsung memiliki bobot internal 100%">
                                    100%
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center justify-center gap-0.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="1"
                                      value={pWeightPct}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        const w = isNaN(val) ? 0 : Math.max(0, val) / 100;
                                        onUpdateIndicatorWeight?.(origCatIdx, origParamIdx, w);
                                      }}
                                      className="w-11 h-6 text-center px-0.5 py-0 rounded text-[11px] font-mono font-semibold border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300"
                                      title={`Ubah bobot internal "${param.name}"`}
                                      aria-label={`Bobot internal ${param.name}`}
                                    />
                                    <span className="text-slate-600 font-mono text-[10px] font-semibold">%</span>
                                  </div>
                                )}
                              </td>
                            )}

                            {/* 7. Bobot (Parameter utama bisa edit) */}
                            {isFirstRowOfCat && (
                              <td
                                rowSpan={catTotalRows}
                                className="py-2 px-1 text-center border-r border-slate-300 border-b border-slate-300 align-top bg-slate-50/20"
                              >
                                <div className="inline-flex items-center justify-center gap-0.5 sticky top-10">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={catWeightPct}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      const w = isNaN(val) ? 0 : Math.max(0, val) / 100;
                                      onUpdateCategoryWeight?.(origCatIdx, w);
                                    }}
                                    className="w-11 h-6 text-center px-0.5 py-0 rounded text-[11px] font-mono font-semibold border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300"
                                    title={`Ubah bobot parameter utama "${cleanCatName}"`}
                                    aria-label={`Bobot parameter ${cleanCatName}`}
                                  />
                                  <span className="text-slate-600 font-mono text-[10px] font-semibold">%</span>
                                </div>
                              </td>
                            )}

                            {/* 8. Mapping Kamus */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-1.5 px-2 align-top border-b border-slate-300 transition-colors ${
                                  isMatched && matchedMaster
                                    ? "bg-emerald-50/25"
                                    : "bg-rose-50/30"
                                } ${isNewIndicator ? "border-t border-slate-300" : ""}`}
                              >
                                <div className="space-y-1">
                                  {isMatched && matchedMaster ? (
                                    <div className="flex items-center justify-between gap-1.5 p-1 rounded-md border border-emerald-300 bg-emerald-50/70">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1 text-emerald-950 font-semibold text-[11px] truncate">
                                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span className="truncate" title={matchedMaster.name}>
                                            {matchedMaster.name}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-emerald-700 font-mono">
                                          {matchedMaster.code && (
                                            <span className="bg-white px-1 py-0.2 rounded border border-emerald-300 text-emerald-800 font-bold shrink-0">
                                              {matchedMaster.code}
                                            </span>
                                          )}
                                          <span className="truncate">
                                            {matchedMaster.departmentId
                                              ? (matchedMaster.departmentName || "Dept")
                                              : "[Umum]"}
                                          </span>
                                          {matchedMaster.departmentId &&
                                            departmentId &&
                                            Number(matchedMaster.departmentId) !== Number(departmentId) && (
                                              <span className="text-[8px] text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-300 shrink-0 font-sans font-semibold">
                                                Lintas
                                              </span>
                                            )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPickerTarget({
                                              catIndex: origCatIdx,
                                              paramIndex: origParamIdx,
                                            })
                                          }
                                          className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 bg-white hover:bg-emerald-100 rounded border border-emerald-300 shadow-2xs transition cursor-pointer"
                                          title="Ganti pemetaan parameter"
                                        >
                                          Ubah
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onUpdateIndicatorMasterId(origCatIdx, origParamIdx, null)
                                          }
                                          className="p-0.5 text-emerald-600 hover:text-rose-600 rounded transition cursor-pointer text-xs"
                                          title="Lepas pemetaan parameter"
                                          aria-label="Lepas pemetaan"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-1.5 p-1 rounded-md border border-rose-300 bg-rose-50/70">
                                      <div className="min-w-0 flex-1 flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <div className="min-w-0">
                                          <span className="text-[11px] font-bold text-rose-900 block truncate">
                                            Belum di Kamus
                                          </span>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPickerTarget({
                                            catIndex: origCatIdx,
                                            paramIndex: origParamIdx,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-rose-800 bg-white hover:bg-rose-100 border border-rose-300 shadow-2xs transition cursor-pointer shrink-0"
                                        title={`Pilih parameter dari kamus untuk "${param.name}"`}
                                      >
                                        <Plus className="w-3 h-3 text-rose-600" />
                                        <span>Pilih Kamus</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-slate-50 text-[11px] font-bold text-slate-800 border-t-2 border-slate-300">
              <tr>
                <td colSpan={6} className="py-1.5 px-2 text-right pr-3 border-r border-slate-300 font-bold">
                  Total Bobot Parameter
                </td>
                <td className="py-1.5 px-1 text-center text-slate-900 border-r border-slate-300 font-mono font-bold text-[11px]">
                  {Math.round(categories.reduce((acc, c) => acc + c.weight, 0) * 100)}%
                </td>
                <td className="py-1.5 px-2 text-slate-600 text-[10px] font-normal truncate">
                  Total bobot parameter utama wajib berjumlah tepat 115%.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal Pemilihan Parameter Kamus */}
      <ParameterPickerModal
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        targetParamName={activeTargetParam?.name || ""}
        targetCategoryName={activeTargetCategory?.name || ""}
        targetUnit={activeTargetParam?.unit || ""}
        currentMasterParameterId={activeTargetParam?.masterParameterId ?? null}
        masterParameters={masterParameters}
        departmentId={departmentId}
        departmentName={departmentName}
        onSelectParameter={(mpId) => {
          if (pickerTarget) {
            onUpdateIndicatorMasterId(pickerTarget.catIndex, pickerTarget.paramIndex, mpId);
          }
        }}
        onCreateNewParameter={
          onAddIndicatorToMaster && pickerTarget
            ? () => onAddIndicatorToMaster(pickerTarget.catIndex, pickerTarget.paramIndex)
            : undefined
        }
        isCreatingNew={Boolean(addingParamKey)}
      />
    </div>
  );
}
