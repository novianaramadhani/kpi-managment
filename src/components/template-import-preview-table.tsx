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
  onUpdateCategoryWeight?: (
    catIndex: number,
    newWeight: number
  ) => void;
  onAutoBalanceIndicatorWeights?: (catIndex: number) => void;
  onAutoHarmonizeParamBands?: (catIndex: number, paramIndex: number) => void;
  onAutoHarmonizeAllBands?: () => void;
}

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
  onUpdateCategoryWeight,
  onAutoBalanceIndicatorWeights,
  onAutoHarmonizeParamBands,
  onAutoHarmonizeAllBands,
}: TemplateImportPreviewTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // State untuk Modal Pemilihan Parameter (Target catIndex & paramIndex)
  const [pickerTarget, setPickerTarget] = useState<{
    catIndex: number;
    paramIndex: number;
  } | null>(null);

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
      <div className="flex items-center justify-between flex-wrap gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
        {/* Search input */}
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari indikator atau parameter..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Tombol Perbaiki Otomatis Seluruh Rentang */}
        {indicatorsWithIssuesCount > 0 && onAutoHarmonizeAllBands && (
          <button
            type="button"
            onClick={onAutoHarmonizeAllBands}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 text-xs font-semibold shadow-2xs transition cursor-pointer"
            title="Otomatis sesuaikan seluruh rentang kriteria agar tidak ada celah nilai (gap) maupun overlap"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Auto-Perbaiki Seluruh Rentang ({indicatorsWithIssuesCount})</span>
          </button>
        )}
      </div>

      {/* Tabel Pratinjau Utama: Tepat 8 Kolom */}
      <div className="rounded-xl border border-slate-300 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 text-[11px] font-bold text-slate-800 border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center border-r border-slate-300">No</th>
                <th className="py-2.5 px-3 min-w-[160px] border-r border-slate-300">Parameter</th>
                <th className="py-2.5 px-3 min-w-[220px] border-r border-slate-300">Indikator</th>
                <th className="py-2.5 px-3 min-w-[240px] border-r border-slate-300">Kriteria Penilaian</th>
                <th className="py-2.5 px-2 w-20 text-center border-r border-slate-300" title="Skor dapat diedit langsung">
                  Skor
                </th>
                <th className="py-2.5 px-2 w-28 text-center border-r border-slate-300" title="Bobot internal sub bab dapat diedit">
                  Bobot Internal
                </th>
                <th className="py-2.5 px-2 w-24 text-center border-r border-slate-300" title="Bobot parameter utama dapat diedit">
                  Bobot
                </th>
                <th className="py-2.5 px-3 min-w-[200px]">Mapping Kamus</th>
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

                      const matchedMaster = masterParameters.find(
                        (mp) => mp.id === param.masterParameterId
                      );
                      const isMatched = Boolean(
                        matchedMaster &&
                          (!departmentId ||
                            matchedMaster.departmentId === Number(departmentId) ||
                            matchedMaster.departmentId === null ||
                            matchedMaster.departmentId === undefined)
                      );

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
                                className="py-3 px-2 text-center align-top bg-slate-50/40 border-r border-slate-300 border-b border-slate-300"
                              >
                                <div className="sticky top-12 flex justify-center">
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
                                className="py-3 px-3 border-r border-slate-300 border-b border-slate-300 align-top bg-slate-50/20"
                              >
                                <div className="space-y-1 sticky top-12">
                                  <span className="font-bold text-slate-900 block text-xs">
                                    {cleanCatName}
                                  </span>

                                  {/* Hanya tampilkan peringatan bila bobot internal sub-parameter tidak pas 100% */}
                                  {cat.categoryType === "SUB_ITEMS" && !isInternalWeightValid && (
                                    <div className="mt-2 flex flex-col gap-1">
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-rose-50 text-rose-800 border-rose-300"
                                        title="Total bobot internal seluruh subparameter dalam kategori wajib 100%"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                        <span>Total Sub: {catInternalWeightPct}%</span>
                                      </span>
                                      {onAutoBalanceIndicatorWeights && (
                                        <button
                                          type="button"
                                          onClick={() => onAutoBalanceIndicatorWeights(origCatIdx)}
                                          className="text-[10px] text-blue-700 hover:text-blue-900 underline text-left font-semibold cursor-pointer"
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

                            {/* 3. Indikator (Kolom Sub Bab dengan nomor sendiri) */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-2.5 px-3 border-r border-slate-300 border-b border-slate-300 align-top bg-white ${
                                  isNewIndicator ? "border-t border-slate-300" : ""
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-mono text-xs font-bold text-slate-800 shrink-0">
                                      {subNumber}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <span className="font-semibold text-slate-900 text-xs block">
                                        {param.name}
                                      </span>
                                    </div>
                                  </div>

                                  {param.description && (
                                    <p className="text-[11px] text-slate-500 line-clamp-2">
                                      {param.description}
                                    </p>
                                  )}

                                  {/* Target & Satuan */}
                                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                                    <div>Target: <span className="font-semibold text-slate-800">{param.target || "100"}{param.unit || "%"}</span></div>
                                    {onAutoHarmonizeParamBands && (
                                      <button
                                        type="button"
                                        onClick={() => onAutoHarmonizeParamBands(origCatIdx, origParamIdx)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-medium border border-blue-200 transition cursor-pointer"
                                        title="Sesuaikan otomatis batas rentang kriteria agar berurutan tanpa gap atau overlap"
                                      >
                                        <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                                        <span>Auto-Isi Rentang</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* 4. Kriteria Penilaian (Operator dan Nilai Kriteria Terpisah) */}
                            <td
                              className={`py-2 px-2.5 text-slate-800 border-r border-slate-300 align-top bg-white ${
                                isLastBandOfParam ? "border-b border-slate-300" : "border-b border-slate-100"
                              } ${isNewIndicator ? "border-t border-slate-300" : ""}`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
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
                                      className={`h-7 px-1.5 py-0.5 rounded-md text-xs font-mono font-semibold border transition focus:outline-none focus:ring-1 cursor-pointer ${
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
                                      className="w-full h-7 px-2 py-0.5 rounded-md text-xs text-slate-800 bg-white border border-slate-300 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300 transition"
                                      title={`Ubah nilai kriteria (saat ini: ${band.label})`}
                                      aria-label={`Nilai kriteria ${param.name} baris ${bIdx + 1}`}
                                    />
                                  </div>
                                </div>

                                {/* Marker Pemeriksaan Manual jika operator tidak dikenali atau nilai belum pasti */}
                                {(band.isUnrecognizedOperator || band.operatorSymbol === "?" || band.needsManualReview) && (
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300"
                                      title={band.manualReviewReason || "Perlu pemeriksaan manual"}
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span>{band.manualReviewReason ? `Perlu pemeriksaan manual: ${band.manualReviewReason}` : "Perlu pemeriksaan manual"}</span>
                                    </span>
                                  </div>
                                )}

                                {/* Indikasi gap / overlap bila ada pada indikator ini */}
                                {isFirstRowOfParam && paramValidation?.hasErrors && (
                                  <div className="text-[10px] text-rose-800 bg-rose-50 px-2.5 py-2 rounded-md border border-rose-200 space-y-1.5 mt-1">
                                    <div className="flex items-center justify-between gap-1.5 font-semibold text-rose-900">
                                      <div className="flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        <span>
                                          {paramValidation.errors.some((e) => e.includes("Overlap") || e.includes("tumpang tindih"))
                                            ? "Overlap terdeteksi pada kriteria:"
                                            : "Peringatan kriteria penilaian:"}
                                        </span>
                                      </div>
                                      {onAutoHarmonizeParamBands && (
                                        <button
                                          type="button"
                                          onClick={() => onAutoHarmonizeParamBands(origCatIdx, origParamIdx)}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white hover:bg-rose-100 border border-rose-300 text-[10px] font-semibold text-rose-700 cursor-pointer shadow-2xs transition"
                                          title="Otomatis sesuaikan rentang nilai agar valid dan tidak bertabrakan"
                                        >
                                          <Sparkles className="w-3 h-3 text-rose-600 shrink-0" />
                                          <span>Auto Perbaiki</span>
                                        </button>
                                      )}
                                    </div>
                                    <div className="space-y-0.5 pl-4 text-rose-700">
                                      {paramValidation.errors.map((err, eIdx) => (
                                        <div key={eIdx}>• {err}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {isFirstRowOfParam && paramValidation?.hasWarnings && !paramValidation?.hasErrors && (
                                  <div className="text-[10px] text-amber-800 bg-amber-50 px-2.5 py-2 rounded-md border border-amber-200 space-y-1.5 mt-1">
                                    <div className="flex items-center justify-between gap-1.5 font-semibold text-amber-900">
                                      <div className="flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>Gap rentang nilai terdeteksi:</span>
                                      </div>
                                      {onAutoHarmonizeParamBands && (
                                        <button
                                          type="button"
                                          onClick={() => onAutoHarmonizeParamBands(origCatIdx, origParamIdx)}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-300 text-[10px] font-semibold text-amber-800 cursor-pointer shadow-2xs transition"
                                          title="Otomatis tutup celah rentang kriteria ini"
                                        >
                                          <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                          <span>Auto Perbaiki</span>
                                        </button>
                                      )}
                                    </div>
                                    <div className="space-y-0.5 pl-4 text-amber-800">
                                      {paramValidation.warnings.map((warn, wIdx) => (
                                        <div key={wIdx}>• {warn}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. Skor (Bisa diedit langsung) */}
                            <td
                              className={`py-2 px-2 text-center border-r border-slate-300 align-top ${
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
                                className="w-14 text-center px-1.5 py-1 rounded-md font-mono font-semibold text-xs border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300 transition"
                                title={`Edit skor kriteria "${band.label}" (Nilai: ${band.score})`}
                                aria-label={`Skor ${band.label}`}
                              />
                            </td>

                            {/* 6. Bobot Internal (Sub Bab bisa edit) */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-2.5 px-2 text-center border-r border-slate-300 border-b border-slate-300 align-top bg-white ${
                                  isNewIndicator ? "border-t border-slate-300" : ""
                                }`}
                              >
                                {cat.categoryType === "DIRECT" ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200 font-bold" title="Penilaian langsung memiliki bobot internal 100%">
                                    100%
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center justify-center gap-1">
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
                                      className="w-12 text-center px-1 py-0.5 rounded-md text-xs font-mono font-semibold border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300"
                                      title={`Ubah bobot internal "${param.name}"`}
                                      aria-label={`Bobot internal ${param.name}`}
                                    />
                                    <span className="text-slate-600 font-mono text-[11px] font-semibold">%</span>
                                  </div>
                                )}
                              </td>
                            )}

                            {/* 7. Bobot (Parameter utama bisa edit) */}
                            {isFirstRowOfCat && (
                              <td
                                rowSpan={catTotalRows}
                                className="py-3 px-2 text-center border-r border-slate-300 border-b border-slate-300 align-top bg-slate-50/20"
                              >
                                <div className="inline-flex items-center justify-center gap-1 sticky top-12">
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
                                    className="w-12 text-center px-1 py-0.5 rounded-md text-xs font-mono font-semibold border border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300"
                                    title={`Ubah bobot parameter utama "${cleanCatName}"`}
                                    aria-label={`Bobot parameter ${cleanCatName}`}
                                  />
                                  <span className="text-slate-600 font-mono text-[11px] font-semibold">%</span>
                                </div>
                              </td>
                            )}

                            {/* 8. Mapping Kamus */}
                            {isFirstRowOfParam && (
                              <td
                                rowSpan={paramRowSpan}
                                className={`py-2.5 px-3 align-top min-w-[210px] bg-white border-b border-slate-300 ${
                                  isNewIndicator ? "border-t border-slate-300" : ""
                                }`}
                              >
                                <div className="space-y-1.5">
                                  {isMatched && matchedMaster ? (
                                    <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-slate-200 bg-slate-50/50">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1 text-slate-800 font-semibold text-xs truncate">
                                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                          <span className="truncate" title={matchedMaster.name}>
                                            {matchedMaster.name}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-mono">
                                          {matchedMaster.code && (
                                            <span className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600 font-semibold">
                                              {matchedMaster.code}
                                            </span>
                                          )}
                                          <span className="truncate">
                                            {matchedMaster.departmentId
                                              ? (matchedMaster.departmentName || "Departemen")
                                              : "[Umum]"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPickerTarget({
                                              catIndex: origCatIdx,
                                              paramIndex: origParamIdx,
                                            })
                                          }
                                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded border border-slate-200 shadow-2xs transition cursor-pointer"
                                          title="Ganti pemetaan parameter"
                                        >
                                          Ubah
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onUpdateIndicatorMasterId(origCatIdx, origParamIdx, null)
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                          title="Lepas pemetaan parameter"
                                          aria-label="Lepas pemetaan"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPickerTarget({
                                            catIndex: origCatIdx,
                                            paramIndex: origParamIdx,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-2xs transition cursor-pointer"
                                        title={`Pilih parameter dari kamus untuk "${param.name}"`}
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Pilih Kamus</span>
                                      </button>
                                      <span className="text-[11px] text-slate-400 font-medium">
                                        Belum Dipetakan
                                      </span>
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
            <tfoot className="sticky bottom-0 z-10 bg-slate-50 text-xs font-bold text-slate-800 border-t-2 border-slate-300">
              <tr>
                <td colSpan={6} className="py-2.5 px-3 text-right pr-4 border-r border-slate-300 font-bold">
                  Total Bobot Parameter
                </td>
                <td className="py-2.5 px-2 text-center text-slate-900 border-r border-slate-300 font-mono font-bold text-xs">
                  {Math.round(categories.reduce((acc, c) => acc + c.weight, 0) * 100)}%
                </td>
                <td className="py-2.5 px-3 text-slate-600 text-[11px] font-normal">
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
