"use client";

import React from "react";
import { Scale, Target, Calculator } from "lucide-react";

interface KpiCalculationInfoProps {
  targetWeightPct?: number; // e.g. 115
  categoryCount?: number;
  indicatorCount?: number;
  categories?: any[];
  parameters?: any[];
  bands?: any[];
}

export function KpiCalculationInfo({
  targetWeightPct = 115,
  categories,
  parameters,
  bands,
}: KpiCalculationInfoProps) {
  // Compute min/max parameter weight if available
  const paramWeights = (categories ?? [])
    .map((c) => Math.round(Number(c.weight) * 100))
    .filter((w) => !isNaN(w) && w > 0);
  const minParamWeight = paramWeights.length > 0 ? Math.min(...paramWeights) : 10;
  const maxParamWeight = paramWeights.length > 0 ? Math.max(...paramWeights) : 65;
  const paramWeightRange =
    minParamWeight === maxParamWeight
      ? `${minParamWeight}%`
      : `${minParamWeight}% – ${maxParamWeight}%`;

  // Compute min/max indicator weight if available
  const indWeights = (parameters ?? [])
    .map((p) => Math.round(Number(p.weight) * 100))
    .filter((w) => !isNaN(w) && w > 0);
  const minIndWeight = indWeights.length > 0 ? Math.min(...indWeights) : 10;
  const maxIndWeight = indWeights.length > 0 ? Math.max(...indWeights) : 100;
  const indWeightRange =
    minIndWeight === maxIndWeight
      ? `${minIndWeight}%`
      : `${minIndWeight}% – ${maxIndWeight}%`;

  // Extract distinct grade letters if bands provided
  const gradeLabels = React.useMemo(() => {
    if (!bands || bands.length === 0) return "A · B · C · D";
    const uniqueGrades = Array.from(
      new Set(
        bands
          .map((b) => b.grade || b.label || "")
          .filter((g) => Boolean(g) && g.length <= 4)
      )
    );
    return uniqueGrades.length > 0 ? uniqueGrades.join(" · ") : "A · B · C · D";
  }, [bands]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-1 text-slate-800">
      {/* KOLOM KIRI: 1. Bobot & Skala + 2. Alur Penilaian */}
      <div className="space-y-4">
        {/* BAGIAN 1: Bobot & Skala */}
        <div>
          <div className="flex items-start gap-2">
            <Scale className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">
                1. Bobot & Skala
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Total bobot template dan rentang skor capaian indikator.
              </p>
            </div>
          </div>

          <div className="mt-2.5 pl-6 space-y-2">
            {/* Total Bobot & Skala Poin */}
            <div className="flex items-center gap-6 text-[13px]">
              <div>
                <span className="text-[11px] text-slate-400 block">Total Bobot</span>
                <span className="text-[18px] font-semibold text-slate-900">
                  {targetWeightPct}%
                </span>
              </div>
              <div className="border-l border-slate-200/80 pl-6">
                <span className="text-[11px] text-slate-400 block">Skala Penilaian</span>
                <span className="text-[18px] font-semibold text-slate-900">
                  1 – 25
                </span>
                <span className="text-[12px] text-slate-500 ml-1">poin</span>
              </div>
            </div>

            {/* Rentang Bobot Parameter & Indicator */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-6 text-[12px]">
              <div>
                <span className="text-slate-500">Bobot Parameter:</span>{" "}
                <span className="font-semibold text-slate-800">{paramWeightRange}</span>
              </div>
              <span className="text-slate-300">·</span>
              <div>
                <span className="text-slate-500">Bobot Indikator:</span>{" "}
                <span className="font-semibold text-slate-800">{indWeightRange}</span>
              </div>
            </div>
          </div>
        </div>

        {/* DIVIDER ANTARA BAGIAN 1 DAN 2 */}
        <div className="border-t border-slate-200/80 pt-3.5">
          {/* BAGIAN 2: Alur Penilaian */}
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">
                2. Alur Penilaian
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Konversi realisasi bulanan dan metode agregasi tahunan.
              </p>
            </div>
          </div>

          <div className="mt-2.5 pl-6 space-y-2 text-[13px]">
            {/* Alur Konversi Realisasi */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-slate-800">Realisasi</span>
              <span className="text-slate-400 text-xs font-semibold">→</span>
              <span className="font-medium text-slate-800">Kriteria Scoring</span>
              <span className="text-slate-400 text-xs font-semibold">→</span>
              <span className="font-semibold text-blue-600">Poin (1 – 25)</span>
            </div>

            {/* Periode & Agregasi */}
            <div className="pt-1.5 border-t border-slate-100 flex items-center gap-2 text-[12px] text-slate-600 flex-wrap">
              <span>
                <strong className="text-slate-700 font-medium">Periode:</strong>{" "}
                <span className="text-blue-600 font-medium">Monthly</span> · Annual
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-slate-700 font-medium">Agregasi:</strong>{" "}
                Average · Sum · Last Value
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KOLOM KANAN: 3. Formula Skor Akhir */}
      <div className="md:border-l md:border-slate-200/80 md:pl-6 space-y-3.5">
        <div className="flex items-start gap-2">
          <Calculator className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">
              3. Formula Skor Akhir
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Perhitungan nilai tertimbang hingga penentuan grade capaian.
            </p>
          </div>
        </div>

        <div className="pl-6 space-y-3">
          {/* Rumus Utama */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">
              Rumus Skor Indikator
            </span>
            <div className="text-[14px] sm:text-[15px] font-semibold text-slate-900 tracking-tight">
              Skor = <span className="text-blue-600">Poin</span> × Bobot Indikator × Bobot Parameter
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Poin capaian (1–25) dikalikan dengan bobot efektif indikator terhadap template.
            </p>
          </div>

          {/* Alur Menuju Grade */}
          <div className="space-y-1.5 text-[12px]">
            <span className="text-[11px] font-medium text-slate-400 block">
              Konversi Total Skor ke Grade
            </span>
            <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
              <span className="font-medium text-slate-800">Total Skor Capaian</span>
              <span className="text-slate-400 text-xs font-semibold">→</span>
              <span className="font-semibold text-slate-900">Kategori Grade</span>
              <span className="text-slate-400 text-xs font-semibold">→</span>
              <span className="font-bold text-blue-600">{gradeLabels}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Total skor bulanan atau tahunan diklasifikasikan ke dalam rentang nilai grade (A/B/C/D).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
