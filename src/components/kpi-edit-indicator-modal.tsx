"use client";

import React, { useState, useEffect } from "react";
import { getMatchedBand, type CriterionItem, type KpiDetailItem } from "./kpi-collapsible-input";

export const KPI_UNITS = [
  "%",
  "Hari",
  "Bulan",
  "Dokumen",
  "Laporan",
  "Ide / Kaizen",
  "Proyek",
  "Item / Pcs",
  "Rp (Rupiah)",
  "Jam",
  "Frekuensi / Kali",
  "Zero Incident / LTI",
  "Orang",
  "Kasus",
  "Nilai",
];

interface KpiEditIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | number;
  groupName: string;
  groupWeight: number;
  kpi: (KpiDetailItem & { annualActual?: number | null; score?: number; skorAkhirIndikator?: number }) | null;
  onSave: (payload: {
    groupId: string | number;
    kpiId: string | number;
    name: string;
    description: string;
    unit: string;
    target: number;
    targetDisplay: string;
    annualActual: number | null;
    criteria: CriterionItem[];
    score: number;
    weightInParameter: number;
    skorAkhirIndikator: number;
  }) => void;
}

// Helper untuk format teks Nilai batas dari suatu kriteria
function formatCriterionNilai(c: CriterionItem | undefined | null): string {
  if (!c) return "-";
  if (c.minValue !== null && c.minValue !== undefined && c.maxValue !== null && c.maxValue !== undefined) {
    return `${c.minValue} - ${c.maxValue}`;
  }
  if (c.maxValue !== null && c.maxValue !== undefined) {
    return `${c.maxValue}`;
  }
  if (c.minValue !== null && c.minValue !== undefined) {
    return `${c.minValue}`;
  }
  return "-";
}

export function KpiEditIndicatorModal({
  isOpen,
  onClose,
  groupId,
  groupName,
  groupWeight,
  kpi,
  onSave,
}: KpiEditIndicatorModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("%");
  const [target, setTarget] = useState("100");
  const [realisasi, setRealisasi] = useState<string>("");
  const [weight, setWeight] = useState("20");
  const [score, setScore] = useState("15");
  const [skorAkhir, setSkorAkhir] = useState("8");
  const [criteria, setCriteria] = useState<CriterionItem[]>([]);
  const [selectedCriterionIndex, setSelectedCriterionIndex] = useState<number>(0);
  const [error, setError] = useState("");

  // Helper kalkulasi Skor Akhir otomatis: (Skor / 25) * Bobot * (GroupWeight / 100)
  const computeSkorAkhirVal = (numScore: number, numWeight: number, grpWeight: number) => {
    if (isNaN(numScore) || isNaN(numWeight) || isNaN(grpWeight)) return 0;
    return Math.round((numScore / 25) * numWeight * (grpWeight / 100));
  };

  // Sync state saat modal dibuka dengan data KPI saat ini
  useEffect(() => {
    if (kpi && isOpen) {
      setName(kpi.name || "");
      setDescription(kpi.description || "");
      setUnit(kpi.unit || "%");
      setTarget(String(kpi.target ?? 100));

      const currentActual = kpi.manualActual ?? kpi.annualActual ?? null;
      setRealisasi(currentActual !== null && currentActual !== undefined ? String(currentActual) : "");

      const currentWeight = kpi.weightInParameter ?? 20;
      setWeight(String(currentWeight));

      const currentScore = kpi.manualScore ?? kpi.score ?? 15;
      setScore(String(currentScore));

      const autoComputed = computeSkorAkhirVal(currentScore, currentWeight, groupWeight);
      setSkorAkhir(String(autoComputed));

      // Clone criteria
      const loadedCriteria =
        kpi.criteria && kpi.criteria.length > 0
          ? JSON.parse(JSON.stringify(kpi.criteria))
          : [
              { label: "≤ 3%", operator: "LTE", maxValue: 3, score: 25 },
              { label: "> 3% - ≤ 6%", operator: "BETWEEN", minValue: 3, maxValue: 6, score: 15 },
              { label: "> 6%", operator: "GT", minValue: 6, score: 5 },
            ];
      setCriteria(loadedCriteria);

      // Tentukan indeks kriteria yang terpilih berdasarkan currentScore atau realisasi
      const idx = loadedCriteria.findIndex((c: CriterionItem) => c.score === currentScore);
      setSelectedCriterionIndex(idx !== -1 ? idx : 0);

      setError("");
    }
  }, [kpi, isOpen, groupWeight]);

  if (!isOpen || !kpi) return null;

  // Selected criterion object
  const selectedCriterion = criteria[selectedCriterionIndex] || criteria[0] || null;

  // Handler saat Kriteria dipilih melalui Dropdown
  const handleSelectCriterionIndex = (index: number) => {
    setSelectedCriterionIndex(index);
    const selected = criteria[index];
    if (selected) {
      setScore(String(selected.score));
      const numWeight = parseFloat(weight) || kpi.weightInParameter || 20;
      const computed = computeSkorAkhirVal(selected.score, numWeight, groupWeight);
      setSkorAkhir(String(computed));
    }
  };

  // Handler saat Skor Kriteria diubah melalui Dropdown
  const handleScoreChange = (newScoreStr: string) => {
    setScore(newScoreStr);
    const numScore = parseFloat(newScoreStr) || 0;
    const matchingIdx = criteria.findIndex((c) => c.score === numScore);
    if (matchingIdx !== -1) {
      setSelectedCriterionIndex(matchingIdx);
    }
    const numWeight = parseFloat(weight) || kpi.weightInParameter || 20;
    const computed = computeSkorAkhirVal(numScore, numWeight, groupWeight);
    setSkorAkhir(String(computed));
  };

  // Handler saat Realisasi diubah: auto-match kriteria, auto-select dropdown & auto-update nilai
  const handleRealisasiChange = (valStr: string) => {
    setRealisasi(valStr);
    const numVal = parseFloat(valStr);
    const numWeight = parseFloat(weight) || kpi.weightInParameter || 20;

    if (!isNaN(numVal) && criteria.length > 0) {
      const matched = getMatchedBand(numVal, criteria);
      if (matched) {
        setScore(String(matched.score));
        const matchingIdx = criteria.findIndex((c) => c.score === matched.score);
        if (matchingIdx !== -1) {
          setSelectedCriterionIndex(matchingIdx);
        }
        const computed = computeSkorAkhirVal(matched.score, numWeight, groupWeight);
        setSkorAkhir(String(computed));
        return;
      }
    }

    const numScore = parseFloat(score) || 0;
    const computed = computeSkorAkhirVal(numScore, numWeight, groupWeight);
    setSkorAkhir(String(computed));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama Indikator KPI wajib diisi.");
      return;
    }

    // Target dan Bobot selalu mengacu ke Master Template KPI
    const numTarget = kpi.target;
    const numWeight = kpi.weightInParameter;
    const numScore = parseFloat(score) || selectedCriterion?.score || 0;
    const numRealisasi = realisasi.trim() === "" ? null : parseFloat(realisasi);
    const computedSkorAkhir = computeSkorAkhirVal(numScore, numWeight, groupWeight);

    const targetDisplay = unit === "%" ? `${numTarget}%` : `${numTarget} ${unit}`;

    onSave({
      groupId,
      kpiId: kpi.id,
      name: trimmedName,
      description: description.trim(),
      unit,
      target: numTarget,
      targetDisplay,
      annualActual: numRealisasi,
      criteria,
      score: numScore,
      weightInParameter: numWeight,
      skorAkhirIndikator: computedSkorAkhir,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col"
        role="dialog"
      >
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Parameter: {groupName} ({groupWeight}%)
            </span>
            <h3 className="font-extrabold text-base tracking-wide text-white">
              Edit Indikator KPI — {kpi.code}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Tutup (✕)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
              {error}
            </div>
          )}

          {/* 1. Nama Indikator & Deskripsi */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800">
              Nama Indikator KPI <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="Nama indikator penilaian..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-bold text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
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
              placeholder="Penjelasan ringkas standar penilaian..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-slate-700 placeholder-slate-400 focus:border-sky-500 focus:outline-none transition"
            />
          </div>

          {/* 2. Grid Baris Pertama: Satuan (Dropdown), Target (Terkunci), Realisasi */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            {/* Dropdown Satuan */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Satuan (Unit) <span className="text-rose-500">*</span>
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                {!KPI_UNITS.includes(unit) && <option value={unit}>{unit}</option>}
                {KPI_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Target — TERKUNCI DARI MASTER TEMPLATE */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-700">
                  Target
                </label>
                <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5">
                  <span>🔒</span>
                  <span>Master</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={target}
                  title="Target tidak bisa diedit (harus dari master template)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2 font-bold font-mono text-slate-600 cursor-not-allowed select-none shadow-2xs"
                />
                <span className="absolute right-3 top-2 text-slate-400 font-medium select-none">
                  {unit}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Terkunci dari master template
              </span>
            </div>

            {/* Realisasi (Capaian) */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Realisasi (Capaian)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={realisasi}
                  onChange={(e) => handleRealisasiChange(e.target.value)}
                  placeholder="-"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold font-mono text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-slate-400 font-medium">
                  {unit}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">
                Otomatis mencocokkan tier kriteria
              </span>
            </div>
          </div>

          {/* 3. Grid Baris Kedua: Kriteria Penilaian (DROPDOWN), Skor Kriteria (DROPDOWN), Nilai (AUTO IKUT) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            {/* Dropdown Kriteria Penilaian */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Kriteria Penilaian <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCriterionIndex}
                onChange={(e) => handleSelectCriterionIndex(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                {criteria.map((c, idx) => (
                  <option key={idx} value={idx}>
                    {c.label} (Skor {c.score})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 block">
                Pilih kriteria standar capaian
              </span>
            </div>

            {/* Dropdown Skor Kriteria */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Skor Kriteria (Skala 25)
              </label>
              <select
                value={score}
                onChange={(e) => handleScoreChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold font-mono text-slate-900 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                {criteria.map((c, idx) => (
                  <option key={idx} value={c.score}>
                    Skor {c.score} — ({c.label})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 block">
                Poin kriteria evaluasi
              </span>
            </div>

            {/* Field Nilai — AUTO IKUT */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-700">
                  Nilai Kriteria
                </label>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-100/80 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <span>⚡</span>
                  <span>Auto Ikut</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={formatCriterionNilai(selectedCriterion)}
                  title="Nilai standar dari kriteria yang dipilih"
                  className="w-full rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 font-bold font-mono text-sky-950 focus:outline-none cursor-default select-none shadow-2xs"
                />
                <span className="absolute right-3 top-2 text-sky-700 font-medium select-none">
                  {unit}
                </span>
              </div>
              <span className="text-[10px] text-sky-700 block">
                Batas nilai: <strong>{selectedCriterion?.label || "-"}</strong>
              </span>
            </div>
          </div>

          {/* 4. Grid Baris Ketiga: Bobot (Terkunci) & Skor Akhir (Auto Terhitung) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            {/* Bobot Indikator — TERKUNCI DARI MASTER TEMPLATE */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-700">
                  Bobot Indikator (%)
                </label>
                <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5">
                  <span>🔒</span>
                  <span>Master Template</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={weight}
                  title="Bobot tidak bisa diedit (harus dari master template)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2 font-bold font-mono text-slate-600 cursor-not-allowed select-none shadow-2xs"
                />
                <span className="absolute right-3 top-2 text-slate-400 font-bold select-none">%</span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Bobot di kelompok parameter ({groupWeight}%)
              </span>
            </div>

            {/* Skor Akhir — AUTO TERHITUNG */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-700">
                  Skor Akhir (%)
                </label>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <span>⚡</span>
                  <span>Auto Terhitung</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={skorAkhir}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50/70 px-3 py-2 font-black font-mono text-emerald-900 focus:outline-none cursor-default select-none shadow-2xs"
                />
                <span className="absolute right-3 top-2 text-emerald-600 font-bold">%</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-medium block">
                ({score || 0} / 25) × {weight}% × {groupWeight}% = <strong>{skorAkhir}%</strong>
              </span>
            </div>
          </div>

          {/* 5. Daftar Panduan Kriteria Penilaian (Interactive Cards - No Manual Text Inputs) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-800">
                Panduan Kriteria Penilaian (Master KPI)
              </label>
              <span className="text-[11px] text-slate-500">
                Klik tier di bawah untuk memilih langsung
              </span>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
              {criteria.map((c, idx) => {
                const isSelected = selectedCriterionIndex === idx || String(score) === String(c.score);
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectCriterionIndex(idx)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-sky-50/80 border-sky-400 ring-2 ring-sky-400/20 shadow-xs"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold font-mono text-xs ${
                          c.score === 25
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : c.score === 15
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                      >
                        Skor {c.score}
                      </span>
                      <span className="font-bold text-slate-900 text-xs">
                        {c.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-600 font-mono">
                        Nilai: <strong className="text-slate-900">{formatCriterionNilai(c)} {unit}</strong>
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-200/80 px-2 py-0.5 rounded-full">
                          ✓ Terpilih
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs transition cursor-pointer"
            >
              Simpan Perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
