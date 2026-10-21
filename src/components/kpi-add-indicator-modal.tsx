"use client";

import React, { useState } from "react";
import type { CriterionItem } from "./kpi-criteria-popover";

interface KpiAddIndicatorModalProps {
  isOpen: boolean;
  parameterGroupId: string | number;
  parameterGroupName: string;
  onClose: () => void;
  onAdd: (payload: {
    parameterGroupId: string | number;
    name: string;
    description: string;
    target: number;
    unit: string;
    weightInParameter: number;
    aggregation: "AVERAGE" | "SUM" | "LAST_VALUE";
    criteria: CriterionItem[];
    applyToMaster: boolean;
  }) => void;
}

export function KpiAddIndicatorModal({
  isOpen,
  parameterGroupId,
  parameterGroupName,
  onClose,
  onAdd,
}: KpiAddIndicatorModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("100");
  const [unit, setUnit] = useState("%");
  const [weight, setWeight] = useState("20");
  const [aggregation, setAggregation] = useState<"AVERAGE" | "SUM" | "LAST_VALUE">("AVERAGE");

  // Default 3 tier scoring criteria
  const [band1Label, setBand1Label] = useState("≥ 100%");
  const [band1Max, setBand1Max] = useState("100");
  const [band2Label, setBand2Label] = useState("90% - 99%");
  const [band2Min, setBand2Min] = useState("90");
  const [band3Label, setBand3Label] = useState("< 90%");
  const [band3Max, setBand3Max] = useState("90");

  const [applyToMaster, setApplyToMaster] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama Indikator KPI wajib diisi.");
      return;
    }

    const numTarget = parseFloat(target);
    if (isNaN(numTarget)) {
      setError("Target harus berupa angka.");
      return;
    }

    const numWeight = parseFloat(weight);
    if (isNaN(numWeight) || numWeight <= 0 || numWeight > 100) {
      setError("Bobot indikator harus berupa angka 1 - 100%.");
      return;
    }

    const criteria: CriterionItem[] = [
      {
        label: band1Label || "Sangat Baik",
        operator: "GTE",
        minValue: parseFloat(band1Max) || numTarget,
        score: 25,
      },
      {
        label: band2Label || "Standar / Baik",
        operator: "BETWEEN",
        minValue: parseFloat(band2Min) || numTarget * 0.9,
        maxValue: parseFloat(band1Max) || numTarget,
        score: 15,
      },
      {
        label: band3Label || "Perlu Perbaikan",
        operator: "LT",
        maxValue: parseFloat(band3Max) || numTarget * 0.9,
        score: 5,
      },
    ];

    onAdd({
      parameterGroupId,
      name: trimmedName,
      description: description.trim(),
      target: numTarget,
      unit: unit.trim(),
      weightInParameter: numWeight,
      aggregation,
      criteria,
      applyToMaster,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 my-8"
        role="dialog"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Kelompok: {parameterGroupName}
            </span>
            <h3 className="font-extrabold text-base tracking-wide text-white">
              Tambah Indikator KPI Baru
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800">
              Nama Indikator KPI <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="Contoh: Lead Time Pemenuhan Permintaan Material"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800">
              Deskripsi Indikator (Opsional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tujuan atau standar pengukuran indikator ini..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
            />
          </div>

          {/* Grid: Target, Satuan, Bobot, Agregasi */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-800">Target <span className="text-rose-500">*</span></label>
              <input
                type="number"
                step="any"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="100"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold font-mono text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-800">Satuan (Unit)</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 font-semibold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                <option value="%">% (Persentase)</option>
                <option value="Hari">Hari</option>
                <option value="Bulan">Bulan</option>
                <option value="Dokumen">Dokumen</option>
                <option value="Laporan">Laporan</option>
                <option value="Ide / Kaizen">Ide / Kaizen</option>
                <option value="Proyek">Proyek</option>
                <option value="Item / Pcs">Item / Pcs</option>
                <option value="Rp (Rupiah)">Rp (Rupiah)</option>
                <option value="Jam">Jam</option>
                <option value="Frekuensi / Kali">Frekuensi / Kali</option>
                <option value="Zero Incident / LTI">Zero Incident / LTI</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-800">Bobot KPI (%)</label>
              <input
                type="number"
                step="any"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="20"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold font-mono text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-800">Metode Agregasi</label>
              <select
                value={aggregation}
                onChange={(e) => setAggregation(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 font-semibold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                <option value="AVERAGE">Average (Rata-rata)</option>
                <option value="SUM">Sum (Akumulatif)</option>
                <option value="LAST_VALUE">Last Value (Bulan Akhir)</option>
              </select>
            </div>
          </div>

          {/* Kriteria Skor (3 Rentang) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <span className="font-bold text-slate-900 block">
              Aturan Kriteria Skor (Skala 25 pt)
            </span>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded text-center shrink-0">
                  25 pt
                </span>
                <input
                  type="text"
                  value={band1Label}
                  onChange={(e) => setBand1Label(e.target.value)}
                  placeholder="≥ 100% (Sangat Baik)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="w-16 font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded text-center shrink-0">
                  15 pt
                </span>
                <input
                  type="text"
                  value={band2Label}
                  onChange={(e) => setBand2Label(e.target.value)}
                  placeholder="90% - 99% (Standar / Baik)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="w-16 font-bold text-rose-800 bg-rose-100 px-2 py-1 rounded text-center shrink-0">
                  5 pt
                </span>
                <input
                  type="text"
                  value={band3Label}
                  onChange={(e) => setBand3Label(e.target.value)}
                  placeholder="< 90% (Perlu Perbaikan)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Option Checkbox: Apply to master template */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 cursor-pointer transition">
              <input
                type="checkbox"
                checked={applyToMaster}
                onChange={(e) => setApplyToMaster(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900 block">
                  Terapkan juga ke template master departemen
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Jika dicentang, indikator ini akan tersimpan ke master template KPI departemen terkait.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-xs hover:shadow-sm transition cursor-pointer"
            >
              Simpan Indikator
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
