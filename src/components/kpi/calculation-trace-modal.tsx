"use client";

import React, { useState, useEffect } from "react";
import { X, Calculator, ArrowRight, CheckCircle2, AlertCircle, Clock, ShieldCheck } from "lucide-react";
import { getCalculationTraceAction } from "@/lib/monthly-assessment-actions";
import { INDONESIAN_MONTH_NAMES } from "@/types/monthly-assessment";

export interface CalculationTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  appraisalItemId: number;
  initialMonth?: number | null; // 1..12 or null for annual
  indicatorName: string;
  categoryName?: string;
  unit?: string;
}

export function CalculationTraceModal({
  isOpen,
  onClose,
  appraisalItemId,
  initialMonth = 1,
  indicatorName,
  categoryName,
  unit,
}: CalculationTraceModalProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(initialMonth);
  const [isLoading, setIsLoading] = useState(false);
  const [traces, setTraces] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedMonth(initialMonth);
      void fetchTrace(initialMonth);
    }
  }, [isOpen, appraisalItemId, initialMonth]);

  const fetchTrace = async (month: number | null) => {
    try {
      setIsLoading(true);
      const res = await getCalculationTraceAction({
        appraisalItemId,
        month,
      });
      if (res.success && res.data) {
        setTraces(res.data);
      } else {
        setTraces([]);
      }
    } catch {
      setTraces([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMonth = (m: number | null) => {
    setSelectedMonth(m);
    void fetchTrace(m);
  };

  if (!isOpen) return null;

  const currentTrace = traces[0] || null;
  const steps: Array<{
    step: number;
    label: string;
    formula: string;
    result: string | number;
  }> = currentTrace?.traceJson?.steps || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Audit Trace Perhitungan</h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  Formula Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {categoryName ? `${categoryName} → ` : ""}
                <span className="font-semibold text-slate-700">{indicatorName}</span>
                {unit ? ` (${unit})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Month Selector Pills */}
        <div className="px-5 py-2.5 bg-slate-100/60 border-b border-slate-200/80 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const isSelected = selectedMonth === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectMonth(m)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {INDONESIAN_MONTH_NAMES[m - 1]?.slice(0, 3)}
              </button>
            );
          })}
          <div className="h-4 w-px bg-slate-300 mx-1 shrink-0" />
          <button
            type="button"
            onClick={() => handleSelectMonth(null)}
            className={`px-3 py-1 text-[11px] font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
              selectedMonth === null
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
            }`}
          >
            Tahunan
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
              <span>Memuat audit trace perhitungan...</span>
            </div>
          ) : !currentTrace ? (
            <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">
                Belum ada data audit trace untuk{" "}
                {selectedMonth !== null ? `Bulan ${INDONESIAN_MONTH_NAMES[selectedMonth - 1]}` : "Realisasi Tahunan"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                Trace kalkulasi akan tersimpan secara otomatis setiap kali nilai aktual bulanan atau tahunan disimpan oleh penilai.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Target
                  </span>
                  <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">
                    {currentTrace.target ?? "-"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Aktual
                  </span>
                  <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">
                    {currentTrace.actual ?? "-"}
                  </span>
                </div>
                <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl">
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider block">
                    Capaian (%)
                  </span>
                  <span className="text-sm font-bold text-blue-900 font-mono mt-0.5 block">
                    {currentTrace.achievementPct !== null ? `${Number(currentTrace.achievementPct).toFixed(2)}%` : "-"}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                    Kontribusi Akhir
                  </span>
                  <span className="text-sm font-bold text-emerald-900 font-mono mt-0.5 block">
                    {currentTrace.finalScorePct !== null ? `${Number(currentTrace.finalScorePct).toFixed(4)}%` : "-"}
                  </span>
                </div>
              </div>

              {/* Rule Badge */}
              <div className="flex items-center justify-between p-3 bg-slate-50/80 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">Formula Engine:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 border border-slate-200 rounded">
                    {currentTrace.calculationRuleCode || "ACH-NORMAL-V1"}
                  </span>
                  {currentTrace.rule?.name && (
                    <span className="text-slate-500 text-[11px] hidden sm:inline">
                      ({currentTrace.rule.name})
                    </span>
                  )}
                </div>
                {currentTrace.rule?.direction && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      currentTrace.rule.direction === "INVERSE"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}
                  >
                    {currentTrace.rule.direction}
                  </span>
                )}
              </div>

              {/* Step-by-Step Timeline */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 tracking-tight">Rincian Tahapan Kalkulasi:</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {steps.map((st) => (
                    <div key={st.step} className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50/50 transition">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                            {st.step}
                          </span>
                          <span className="font-bold text-slate-900">{st.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono ml-6">{st.formula}</p>
                      </div>
                      <div className="sm:text-right shrink-0 ml-6 sm:ml-0">
                        <span className="inline-block px-2.5 py-1 bg-slate-100/80 text-slate-800 rounded-lg font-mono font-bold text-[11px] border border-slate-200/60">
                          {st.result}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Metadata Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>
                    Dihitung pada:{" "}
                    {currentTrace.calculatedAt
                      ? new Date(currentTrace.calculatedAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "-"}
                  </span>
                </div>
                <span>Oleh: {currentTrace.calculatedBy || "system"}</span>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition cursor-pointer shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
