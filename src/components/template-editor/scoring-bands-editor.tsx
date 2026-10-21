"use client";

import React, { useState } from "react";
import { Plus, Trash2, Sparkles, ListFilter } from "lucide-react";

export interface BandDraftItem {
  id?: number;
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  minValue: string;
  maxValue: string;
  score: string;
  sortOrder: number;
}

interface ScoringBandsEditorProps {
  bands: BandDraftItem[];
  onChangeBands: (bands: BandDraftItem[]) => void;
  unit?: string | null;
  inputType?: string | null;
  onChangeUnit?: (unit: string) => void;
  onChangeInputType?: (inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE") => void;
}

export const STANDARD_PREDICATES = [
  "Sangat Baik",
  "Baik",
  "Cukup",
  "Kurang",
  "Buruk",
  "Target Tercapai",
  "Tidak Tercapai",
] as const;

export function cleanDisplayNum(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const str = String(val).trim();
  if (/^-?\d+\.\d+$/.test(str)) {
    const n = Number(str);
    if (!isNaN(n)) return String(n);
  }
  return str;
}

export function formatRupiahPreview(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return `Rp ${num.toLocaleString("id-ID")}`;
}

export function ScoringBandsEditor({
  bands,
  onChangeBands,
  unit,
  inputType,
  onChangeUnit,
  onChangeInputType,
}: ScoringBandsEditorProps) {
  // Track which rows are currently forced into manual custom text mode
  const [customModeRows, setCustomModeRows] = useState<Record<number, boolean>>({});

  const cleanUnit = (unit || "").trim();
  const isPercent = cleanUnit === "%" || inputType === "PERCENTAGE";
  const isCurrency = cleanUnit.toLowerCase() === "rp" || inputType === "CURRENCY";
  const isDays = cleanUnit.toLowerCase() === "hari";
  const isCount = ["kasus", "unit", "dokumen", "kali", "orang"].includes(cleanUnit.toLowerCase());
  const isQualitative = inputType === "QUALITATIVE";

  let selectedTypeKey = "NUMBER";
  if (isPercent) selectedTypeKey = "PERCENTAGE";
  else if (isCurrency) selectedTypeKey = "CURRENCY";
  else if (isDays) selectedTypeKey = "DAYS";
  else if (isCount) selectedTypeKey = "COUNT";
  else if (isQualitative) selectedTypeKey = "QUALITATIVE";
  else if (cleanUnit) selectedTypeKey = "COUNT";

  // Determine prefix and suffix for Nilai inputs
  let unitPrefix = "";
  let unitSuffix = "";

  if (isCurrency) {
    unitPrefix = "Rp";
  } else if (isPercent) {
    unitSuffix = "%";
  } else if (cleanUnit) {
    unitSuffix = cleanUnit;
  }

  const unitBadgeLabel = isPercent
    ? "Persentase (%)"
    : isCurrency
    ? "Rupiah (Rp)"
    : isDays
    ? "Hari (Waktu / Durasi)"
    : cleanUnit
    ? `${cleanUnit}`
    : "Angka (Number)";

  const handleSelectType = (typeKey: string) => {
    if (typeKey === "PERCENTAGE") {
      onChangeInputType?.("PERCENTAGE");
      onChangeUnit?.("%");
    } else if (typeKey === "CURRENCY") {
      onChangeInputType?.("CURRENCY");
      onChangeUnit?.("Rp");
    } else if (typeKey === "DAYS") {
      onChangeInputType?.("NUMBER");
      onChangeUnit?.("hari");
    } else if (typeKey === "COUNT") {
      onChangeInputType?.("NUMBER");
      onChangeUnit?.(cleanUnit && cleanUnit !== "%" && cleanUnit !== "Rp" ? cleanUnit : "kasus");
    } else if (typeKey === "NUMBER") {
      onChangeInputType?.("NUMBER");
      onChangeUnit?.("");
    } else if (typeKey === "QUALITATIVE") {
      onChangeInputType?.("QUALITATIVE");
      onChangeUnit?.("");
    }
  };

  // Preset 1: Higher is Better (≥ 100%, 90-99.99%, < 90%)
  const handleApplyHigherIsBetter = () => {
    onChangeBands([
      {
        label: "Sangat Baik",
        operator: "GTE",
        minValue: isPercent ? "100" : isCurrency ? "50000000" : "100",
        maxValue: "",
        score: "25",
        sortOrder: 1,
      },
      {
        label: "Baik",
        operator: "BETWEEN",
        minValue: isPercent ? "90" : isCurrency ? "25000000" : "90",
        maxValue: isPercent ? "99.99" : isCurrency ? "49999999" : "99",
        score: "15",
        sortOrder: 2,
      },
      {
        label: "Kurang",
        operator: "LT",
        minValue: "",
        maxValue: isPercent ? "90" : isCurrency ? "25000000" : "90",
        score: "5",
        sortOrder: 3,
      },
    ]);
    setCustomModeRows({});
  };

  // Preset 2: Lower is Better (≤ 3%, 3-6%, > 6%) or (≤ 3 hari, 3-6 hari, > 6 hari)
  const handleApplyLowerIsBetter = () => {
    onChangeBands([
      {
        label: "Sangat Baik",
        operator: "LTE",
        minValue: "",
        maxValue: "3",
        score: "25",
        sortOrder: 1,
      },
      {
        label: "Baik",
        operator: "BETWEEN",
        minValue: "3",
        maxValue: "6",
        score: "15",
        sortOrder: 2,
      },
      {
        label: "Kurang",
        operator: "GT",
        minValue: "6",
        maxValue: "",
        score: "5",
        sortOrder: 3,
      },
    ]);
    setCustomModeRows({});
  };

  // Preset 3: Binary (Target Tercapai vs Tidak Tercapai)
  const handleApplyBinary = () => {
    onChangeBands([
      {
        label: "Target Tercapai",
        operator: "GTE",
        minValue: isPercent ? "100" : "1",
        maxValue: "",
        score: "25",
        sortOrder: 1,
      },
      {
        label: "Tidak Tercapai",
        operator: "LT",
        minValue: "",
        maxValue: isPercent ? "100" : "1",
        score: "0",
        sortOrder: 2,
      },
    ]);
    setCustomModeRows({});
  };

  const handleAddBand = () => {
    const nextOrder = bands.length + 1;
    let defaultLabel = `Kriteria #${nextOrder}`;
    let defaultOp: BandDraftItem["operator"] = "GTE";
    let defaultMin = "";
    let defaultMax = "";
    let defaultScore = "0";

    if (nextOrder === 1) {
      defaultLabel = "Sangat Baik";
      defaultOp = "GTE";
      defaultMin = isPercent ? "100" : isCurrency ? "50000000" : "10";
      defaultScore = "25";
    } else if (nextOrder === 2) {
      defaultLabel = "Baik";
      defaultOp = "BETWEEN";
      defaultMin = isPercent ? "90" : isCurrency ? "25000000" : "5";
      defaultMax = isPercent ? "99.99" : isCurrency ? "49999999" : "9";
      defaultScore = "15";
    } else if (nextOrder === 3) {
      defaultLabel = "Kurang";
      defaultOp = "LT";
      defaultMax = isPercent ? "90" : isCurrency ? "25000000" : "5";
      defaultScore = "5";
    }

    const newBand: BandDraftItem = {
      label: defaultLabel,
      operator: defaultOp,
      minValue: defaultMin,
      maxValue: defaultMax,
      score: defaultScore,
      sortOrder: nextOrder,
    };
    onChangeBands([...bands, newBand]);
  };

  const handleOperatorChange = (index: number, newOp: BandDraftItem["operator"]) => {
    const current = bands[index];
    let newMin = current.minValue;
    let newMax = current.maxValue;

    if (newOp === "LT" || newOp === "LTE") {
      if (!newMax && newMin) {
        newMax = newMin;
        newMin = "";
      }
    } else if (newOp === "GTE" || newOp === "GT" || newOp === "EQ" || newOp === "TEXT") {
      if (!newMin && newMax) {
        newMin = newMax;
        newMax = "";
      }
    }

    const updated = bands.map((b, i) =>
      i === index ? { ...b, operator: newOp, minValue: newMin, maxValue: newMax } : b
    );
    onChangeBands(updated);
  };

  const handlePredicateChange = (index: number, selected: string) => {
    if (selected === "__CUSTOM__") {
      setCustomModeRows((prev) => ({ ...prev, [index]: true }));
      return;
    }

    let suggestedScore = bands[index]?.score;
    if (!suggestedScore || suggestedScore === "0") {
      if (selected === "Sangat Baik" || selected === "Target Tercapai") suggestedScore = "25";
      else if (selected === "Baik") suggestedScore = "15";
      else if (selected === "Cukup") suggestedScore = "10";
      else if (selected === "Kurang") suggestedScore = "5";
      else if (selected === "Buruk" || selected === "Tidak Tercapai") suggestedScore = "0";
    }

    const updated = bands.map((b, i) =>
      i === index ? { ...b, label: selected, score: suggestedScore } : b
    );
    onChangeBands(updated);
  };

  const handleUpdateBand = (index: number, field: keyof BandDraftItem, value: string) => {
    const updated = bands.map((b, i) => (i === index ? { ...b, [field]: value } : b));
    onChangeBands(updated);
  };

  const handleRemoveBand = (index: number) => {
    onChangeBands(bands.filter((_, i) => i !== index));
    setCustomModeRows((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  return (
    <div className="space-y-3.5">
      {/* 1. Tentukan Tipe Satuan Terlebih Dahulu */}
      <div className="bg-sky-50/80 border border-sky-200/90 rounded-xl p-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white text-[11px] font-black">
                1
              </span>
              <span>Tentukan Tipe Satuan:</span>
            </label>

            <select
              value={selectedTypeKey}
              onChange={(e) => handleSelectType(e.target.value)}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-950 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs cursor-pointer transition"
            >
              <option value="PERCENTAGE">Persentase (%)</option>
              <option value="CURRENCY">Amount / Rupiah (Rp)</option>
              <option value="DAYS">Waktu / Durasi (Hari)</option>
              <option value="COUNT">Jumlah / Frekuensi (Kasus, Dokumen, Unit...)</option>
              <option value="NUMBER">Angka Biasa (Skor / Indeks)</option>
              <option value="QUALITATIVE">Kualitatif (Pilihan Standar)</option>
            </select>

            {selectedTypeKey === "COUNT" && (
              <input
                type="text"
                value={cleanUnit}
                onChange={(e) => onChangeUnit && onChangeUnit(e.target.value)}
                placeholder="nama satuan..."
                className="w-24 rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-600 shadow-2xs"
                title="Ketik nama satuan (misal: kasus, dokumen, unit, orang)"
              />
            )}
          </div>

          {/* Quick Presets & Add */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-medium">Pola Cepat:</span>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "LOWER") handleApplyLowerIsBetter();
                  else if (val === "HIGHER") handleApplyHigherIsBetter();
                  else if (val === "BINARY") handleApplyBinary();
                  e.target.value = "";
                }}
                defaultValue=""
                className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-2 py-1 cursor-pointer transition focus:outline-none shadow-2xs"
              >
                <option value="" disabled>Pilih Pola KPI...</option>
                <option value="LOWER">
                  Makin Rendah Makin Baik (≤ 3{unitSuffix ? ` ${unitSuffix}` : ""}, 3–6, &gt; 6)
                </option>
                <option value="HIGHER">
                  Makin Tinggi Makin Baik (≥ 100{unitSuffix ? ` ${unitSuffix}` : ""}, 90–99.99, &lt; 90)
                </option>
                <option value="BINARY">Biner (Tercapai / Tidak)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddBand}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-lg transition cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-sky-900/80 flex items-center gap-1.5 font-medium">
          <span>✨</span>
          <span>
            Input nilai di bawah otomatis mengikuti satuan: <b className="text-sky-950 underline decoration-sky-400 font-bold">{unitBadgeLabel}</b>
          </span>
        </div>
      </div>

      {bands.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-3">
          <p className="text-xs text-slate-500 font-medium">Belum ada kriteria scoring.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleApplyLowerIsBetter}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 px-3 py-1.5 text-xs font-semibold hover:bg-sky-600 hover:text-white transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pola Turun (≤ 3, 3–6, &gt; 6)</span>
            </button>
            <button
              type="button"
              onClick={handleApplyHigherIsBetter}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pola Naik (≥ 100, 90–99, &lt; 90)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3 w-8 text-center font-bold">#</th>
                <th className="py-2.5 px-3 min-w-[150px] font-bold">Predikat</th>
                <th className="py-2.5 px-3 w-40 font-bold">Kondisi</th>
                <th className="py-2.5 px-3 min-w-[200px] text-center font-bold">
                  Nilai ({cleanUnit || "Angka"})
                </th>
                <th className="py-2.5 px-3 w-20 text-center font-bold">Skor</th>
                <th className="py-2.5 px-2 w-10 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bands.map((band, idx) => {
                const isCustomMode =
                  Boolean(customModeRows[idx]) ||
                  (!STANDARD_PREDICATES.includes(band.label as any) && band.label.trim() !== "");

                return (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    {/* Nomor */}
                    <td className="py-2 px-3 text-center font-mono text-slate-400 text-xs font-semibold">
                      {idx + 1}
                    </td>

                    {/* Predikat: Dropdown Predikat Standar / Input Kustom */}
                    <td className="py-2 px-3">
                      {isCustomMode ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={band.label}
                            onChange={(e) => handleUpdateBand(idx, "label", e.target.value)}
                            placeholder="Ketik predikat..."
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none transition shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const fallback =
                                idx === 0 ? "Sangat Baik" : idx === 1 ? "Baik" : "Kurang";
                              handleUpdateBand(idx, "label", fallback);
                              setCustomModeRows((prev) => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition shrink-0 cursor-pointer"
                            title="Kembali ke pilihan dropdown predikat"
                          >
                            <ListFilter className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <select
                          value={band.label}
                          onChange={(e) => handlePredicateChange(idx, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer transition shadow-2xs"
                        >
                          <option value="Sangat Baik">Sangat Baik</option>
                          <option value="Baik">Baik</option>
                          <option value="Cukup">Cukup</option>
                          <option value="Kurang">Kurang</option>
                          <option value="Buruk">Buruk</option>
                          <option value="Target Tercapai">Target Tercapai</option>
                          <option value="Tidak Tercapai">Tidak Tercapai</option>
                          <option value="__CUSTOM__">✏️ Ketik Manual / Kustom...</option>
                        </select>
                      )}
                    </td>

                    {/* Kondisi: Operator Terstruktur (<, ≤, =, ≥, >, Rentang) */}
                    <td className="py-2 px-3">
                      <select
                        value={band.operator}
                        onChange={(e) =>
                          handleOperatorChange(idx, e.target.value as BandDraftItem["operator"])
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none cursor-pointer transition shadow-2xs"
                      >
                        <option value="LT">&lt; (Kurang dari)</option>
                        <option value="LTE">≤ (Kurang dari atau sama)</option>
                        <option value="EQ">= (Sama dengan)</option>
                        <option value="GTE">≥ (Lebih dari atau sama)</option>
                        <option value="GT">&gt; (Lebih dari)</option>
                        <option value="BETWEEN">Rentang (Min – Max)</option>
                      </select>
                    </td>

                    {/* Nilai: Unit Otomatis Mengikuti Indikator */}
                    <td className="py-2 px-3">
                      {band.operator === "BETWEEN" ? (
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Min Value */}
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/20 transition shadow-2xs overflow-hidden">
                            {unitPrefix && (
                              <span className="px-1.5 py-1 bg-sky-50/70 border-r border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitPrefix}
                              </span>
                            )}
                            <input
                              type="text"
                              value={band.minValue}
                              onChange={(e) => handleUpdateBand(idx, "minValue", e.target.value)}
                              placeholder="3"
                              className="w-16 px-1.5 py-1 text-xs font-mono font-medium text-slate-800 text-center focus:outline-none"
                            />
                            {unitSuffix && (
                              <span className="px-1.5 py-1 bg-sky-50/70 border-l border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitSuffix}
                              </span>
                            )}
                          </div>

                          <span className="text-slate-400 font-bold text-xs">–</span>

                          {/* Max Value */}
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/20 transition shadow-2xs overflow-hidden">
                            {unitPrefix && (
                              <span className="px-1.5 py-1 bg-sky-50/70 border-r border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitPrefix}
                              </span>
                            )}
                            <input
                              type="text"
                              value={band.maxValue}
                              onChange={(e) => handleUpdateBand(idx, "maxValue", e.target.value)}
                              placeholder="6"
                              className="w-16 px-1.5 py-1 text-xs font-mono font-medium text-slate-800 text-center focus:outline-none"
                            />
                            {unitSuffix && (
                              <span className="px-1.5 py-1 bg-sky-50/70 border-l border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitSuffix}
                              </span>
                            )}
                          </div>

                          {/* Preview helper for Currency */}
                          {isCurrency && (band.minValue || band.maxValue) && (
                            <div className="w-full text-center text-[10px] text-sky-700 font-semibold">
                              {formatRupiahPreview(band.minValue)} – {formatRupiahPreview(band.maxValue)}
                            </div>
                          )}
                        </div>
                      ) : band.operator === "LT" || band.operator === "LTE" ? (
                        <div className="flex flex-col items-center justify-center">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/20 transition shadow-2xs overflow-hidden">
                            {unitPrefix && (
                              <span className="px-2 py-1 bg-sky-50/70 border-r border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitPrefix}
                              </span>
                            )}
                            <input
                              type="text"
                              value={band.maxValue !== "" ? band.maxValue : band.minValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = bands.map((b, i) =>
                                  i === idx ? { ...b, maxValue: val, minValue: "" } : b
                                );
                                onChangeBands(updated);
                              }}
                              placeholder="3"
                              className="w-24 px-2 py-1 text-xs font-mono font-medium text-slate-800 text-center focus:outline-none"
                            />
                            {unitSuffix && (
                              <span className="px-2 py-1 bg-sky-50/70 border-l border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitSuffix}
                              </span>
                            )}
                          </div>

                          {isCurrency && (band.maxValue || band.minValue) && (
                            <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                              {formatRupiahPreview(band.maxValue !== "" ? band.maxValue : band.minValue)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/20 transition shadow-2xs overflow-hidden">
                            {unitPrefix && (
                              <span className="px-2 py-1 bg-sky-50/70 border-r border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitPrefix}
                              </span>
                            )}
                            <input
                              type="text"
                              value={band.minValue !== "" ? band.minValue : band.maxValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = bands.map((b, i) =>
                                  i === idx ? { ...b, minValue: val, maxValue: "" } : b
                                );
                                onChangeBands(updated);
                              }}
                              placeholder="6"
                              className="w-24 px-2 py-1 text-xs font-mono font-medium text-slate-800 text-center focus:outline-none"
                            />
                            {unitSuffix && (
                              <span className="px-2 py-1 bg-sky-50/70 border-l border-slate-200 text-[11px] font-bold text-sky-800 select-none">
                                {unitSuffix}
                              </span>
                            )}
                          </div>

                          {isCurrency && (band.minValue || band.maxValue) && (
                            <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                              {formatRupiahPreview(band.minValue !== "" ? band.minValue : band.maxValue)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Skor */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        value={band.score}
                        onChange={(e) => handleUpdateBand(idx, "score", e.target.value)}
                        placeholder={idx === 0 ? "25" : idx === 1 ? "15" : "5"}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs font-mono font-bold text-slate-900 text-center focus:border-sky-500 focus:outline-none transition shadow-2xs"
                      />
                    </td>

                    {/* Hapus */}
                    <td className="py-2 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveBand(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Hapus Kriteria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
