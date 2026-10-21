"use client";

import React, { useState, useEffect } from "react";
import type { MonthlyIndicatorItem } from "@/types/monthly-assessment";
import { INDONESIAN_MONTH_NAMES } from "@/types/monthly-assessment";
import { calculateKpiScore } from "@/lib/scoring";

interface MonthlyItemDrawerProps {
  item: MonthlyIndicatorItem | null;
  categoryName?: string;
  currentMonth: number;
  isLocked?: boolean;
  onClose: () => void;
  onSave: (
    appraisalItemId: number,
    month: number,
    actualValue: number | null,
    notes: string,
    allActuals?: (number | null)[]
  ) => void;
}

export function MonthlyItemDrawer({
  item,
  categoryName,
  currentMonth,
  isLocked = false,
  onClose,
  onSave,
}: MonthlyItemDrawerProps) {
  // Selected month in drawer (defaults to parent currentMonth, but user can click any of the 12 months)
  const [activeMonth, setActiveMonth] = useState<number>(currentMonth);
  const [activeTab, setActiveTab] = useState<"single" | "matrix">("single");

  // Local actuals and notes across all 12 months
  const [monthlyActuals, setMonthlyActuals] = useState<(number | null)[]>(Array(12).fill(null));
  const [monthlyNotes, setMonthlyNotes] = useState<string[]>(Array(12).fill(""));

  useEffect(() => {
    if (item) {
      setActiveMonth(currentMonth);
      const actuals = Array.isArray(item.allMonthlyActuals)
        ? [...item.allMonthlyActuals]
        : Array(12).fill(null);
      while (actuals.length < 12) actuals.push(null);

      // ensure current month has the live value
      if (item.actualValue !== undefined) {
        actuals[currentMonth - 1] = item.actualValue;
      }
      setMonthlyActuals(actuals);

      const notes = Array.isArray(item.allMonthlyNotes)
        ? [...item.allMonthlyNotes].map((n) => n || "")
        : Array(12).fill("");
      while (notes.length < 12) notes.push("");
      if (item.notes) {
        notes[currentMonth - 1] = item.notes;
      }
      setMonthlyNotes(notes);
    }
  }, [item, currentMonth]);

  if (!item) return null;

  const currentActual = monthlyActuals[activeMonth - 1];
  const currentNote = monthlyNotes[activeMonth - 1];

  // Live scoring for active month inside drawer
  const liveScore = calculateKpiScore(currentActual, item.scoringRules, {
    indicatorWeight: item.indicatorWeight,
    parameterWeight: item.parameterWeight,
    maxScore: item.maxScore,
    compareBasis: item.compareBasis,
    target: item.target,
    direction: item.direction,
    measurementType: item.measurementType,
    unit: item.unit,
  });

  const handleActualChange = (valStr: string) => {
    const numVal = valStr.trim() === "" ? null : Number(valStr);
    const updated = [...monthlyActuals];
    updated[activeMonth - 1] = numVal !== null && !isNaN(numVal) ? numVal : null;
    setMonthlyActuals(updated);
  };

  const handleNoteChange = (noteStr: string) => {
    const updated = [...monthlyNotes];
    updated[activeMonth - 1] = noteStr;
    setMonthlyNotes(updated);
  };

  const handleMatrixActualChange = (mIdx: number, valStr: string) => {
    const numVal = valStr.trim() === "" ? null : Number(valStr);
    const updated = [...monthlyActuals];
    updated[mIdx] = numVal !== null && !isNaN(numVal) ? numVal : null;
    setMonthlyActuals(updated);
  };

  const handleSaveAll = () => {
    onSave(
      item.appraisalItemId,
      activeMonth,
      monthlyActuals[activeMonth - 1],
      monthlyNotes[activeMonth - 1],
      monthlyActuals
    );
  };

  const indWeightPct = (item.indicatorWeight * 100).toFixed(1).replace(/\.0$/, "");
  const paramWeightPct = (item.parameterWeight * 100).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Slide-out Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-8">
        <div className="w-screen max-w-lg md:max-w-xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                  {categoryName || "Parameter KPI"}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Detail Penilaian Bulanan</span>
              </div>
              <h2 className="text-base font-bold text-white truncate" title={item.indicatorName}>
                {item.indicatorName}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              title="Tutup (Esc)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="px-6 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveTab("single")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  activeTab === "single"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Bulan {INDONESIAN_MONTH_NAMES[activeMonth - 1]}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("matrix")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  activeTab === "matrix"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Matriks 12 Bulan
              </button>
            </div>

            {/* Quick Month Selector if in single mode */}
            {activeTab === "single" && (
              <select
                value={activeMonth}
                onChange={(e) => setActiveMonth(Number(e.target.value))}
                className="bg-white border border-slate-300 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md shadow-2xs outline-none cursor-pointer hover:border-slate-400"
              >
                {INDONESIAN_MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    Bulan: {name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
            {/* Metadata Ringkas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Target</span>
                <span className="font-bold text-slate-900 text-xs mt-0.5 block">
                  {item.target !== null ? `${item.target} ${item.unit || ""}` : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Satuan</span>
                <span className="font-bold text-slate-900 text-xs mt-0.5 block">{item.unit || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Bobot Indikator</span>
                <span className="font-bold text-slate-900 text-xs mt-0.5 block">{indWeightPct}%</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Bobot Parameter</span>
                <span className="font-bold text-slate-900 text-xs mt-0.5 block">{paramWeightPct}%</span>
              </div>
            </div>

            {/* MODE 1: SINGLE MONTH FOCUS */}
            {activeTab === "single" ? (
              <>
                {/* Hero Input Realisasi Bulan Terpilih */}
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                      Input Realisasi Bulan {INDONESIAN_MONTH_NAMES[activeMonth - 1]}
                    </label>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded">
                      Bulan {activeMonth}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      disabled={isLocked}
                      value={currentActual !== null && currentActual !== undefined ? currentActual : ""}
                      placeholder="Masukkan angka capaian aktual..."
                      onChange={(e) => handleActualChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-black text-slate-900 shadow-2xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-emerald-100 transition disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {item.unit && (
                      <span className="px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-600 text-xs shrink-0 shadow-2xs">
                        {item.unit}
                      </span>
                    )}
                  </div>

                  {/* Hasil Kalkulasi Live */}
                  <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="p-2 bg-white rounded-lg border border-emerald-100">
                      <span className="text-slate-400 block text-[10px]">Kriteria Matched</span>
                      <strong className="text-slate-800 font-bold block truncate" title={liveScore.matchedRule?.label || "-"}>
                        {liveScore.matchedRule?.label || "—"}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-emerald-100">
                      <span className="text-slate-400 block text-[10px]">Skor (Skala 25)</span>
                      <strong className="text-slate-900 font-bold block">
                        {currentActual !== null ? `${liveScore.score} / ${item.maxScore}` : "—"}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-emerald-100">
                      <span className="text-emerald-700 block text-[10px]">Skor Akhir</span>
                      <strong className="text-emerald-900 font-black block">
                        {currentActual !== null ? liveScore.finalScoreDisplay : "0.0%"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Kriteria Penilaian Table */}
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Kriteria Penilaian
                  </h3>
                  {item.scoringRules && item.scoringRules.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="px-3 py-2">Kondisi / Nilai</th>
                            <th className="px-3 py-2 text-right">Skor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {item.scoringRules.map((rule, idx) => {
                            const isMatched = liveScore.matchedRule?.label === rule.label || liveScore.score === rule.score;
                            return (
                              <tr
                                key={idx}
                                className={`transition-colors ${
                                  isMatched
                                    ? "bg-emerald-50 text-emerald-950 font-bold"
                                    : "text-slate-700 hover:bg-slate-50/50"
                                }`}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    {isMatched && (
                                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                                    )}
                                    <span>{rule.label}</span>
                                    {isMatched && (
                                      <span className="text-[10px] text-emerald-700 font-semibold ml-1">
                                        (Aktif)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                                  {rule.score}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Tidak ada aturan khusus.</p>
                  )}
                </div>

                {/* Catatan Pencapaian */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Catatan Pencapaian Bulan {INDONESIAN_MONTH_NAMES[activeMonth - 1]} (Opsional)
                  </label>
                  <textarea
                    value={currentNote || ""}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    disabled={isLocked}
                    placeholder="Tuliskan catatan pendukung, kendala, atau penjelasan capaian..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </>
            ) : (
              /* MODE 2: 12-MONTH MATRIX COMPACT VIEW */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Matriks Realisasi 12 Bulan (Januari s.d. Desember)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Anda dapat mengisi atau meninjau capaian seluruh bulan secara langsung
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="px-3 py-2 w-28">Bulan</th>
                        <th className="px-3 py-2">Realisasi ({item.unit || "Nilai"})</th>
                        <th className="px-3 py-2 text-center w-20">Skor</th>
                        <th className="px-3 py-2 text-right w-24">Skor Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {INDONESIAN_MONTH_NAMES.map((mName, mIdx) => {
                        const mVal = monthlyActuals[mIdx];
                        const mCalc = calculateKpiScore(mVal, item.scoringRules, {
                          indicatorWeight: item.indicatorWeight,
                          parameterWeight: item.parameterWeight,
                          maxScore: item.maxScore,
                          compareBasis: item.compareBasis,
                          target: item.target,
                          direction: item.direction,
                          measurementType: item.measurementType,
                          unit: item.unit,
                        });
                        const isSelectedMonth = mIdx + 1 === activeMonth;

                        return (
                          <tr
                            key={mIdx}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              isSelectedMonth ? "bg-emerald-50/40 font-semibold" : ""
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-800">
                              <span className="flex items-center gap-1.5">
                                {isSelectedMonth && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                                )}
                                <span>{mName}</span>
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="any"
                                disabled={isLocked}
                                value={mVal !== null && mVal !== undefined ? mVal : ""}
                                placeholder="0"
                                onChange={(e) => handleMatrixActualChange(mIdx, e.target.value)}
                                className="w-full max-w-[140px] px-2 py-1 rounded-md border border-slate-300 text-xs font-bold text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-emerald-100 outline-none disabled:bg-slate-100"
                              />
                            </td>
                            <td className="px-3 py-2 text-center font-bold text-slate-700">
                              {mVal !== null ? mCalc.score : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-black text-emerald-800">
                              {mVal !== null ? mCalc.finalScoreDisplay : "0.0%"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              Tutup
            </button>
            {!isLocked && (
              <button
                type="button"
                onClick={handleSaveAll}
                className="px-5 py-2 text-xs font-bold text-white bg-sky-500 hover:bg-[#0369a1] active:scale-95 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Simpan Nilai Bulanan</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
