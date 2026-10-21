"use client";

import React, { useState } from "react";

interface KpiAddParameterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (payload: { name: string; weight: number; applyToMaster: boolean }) => void;
}

export function KpiAddParameterModal({
  isOpen,
  onClose,
  onAdd,
}: KpiAddParameterModalProps) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("10");
  const [applyToMaster, setApplyToMaster] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama Parameter wajib diisi.");
      return;
    }
    const numWeight = parseFloat(weight);
    if (isNaN(numWeight) || numWeight <= 0 || numWeight > 100) {
      setError("Bobot harus berupa angka 1 - 100%.");
      return;
    }

    onAdd({
      name: trimmed,
      weight: numWeight,
      applyToMaster,
    });

    setName("");
    setWeight("10");
    setApplyToMaster(false);
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Kustomisasi Parameter KPI
            </span>
            <h3 className="font-extrabold text-base tracking-wide text-white">
              Tambah Parameter Baru
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Nama Parameter Group <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="Contoh: Proyek Khusus / Inisiatif Strategis"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Bobot Parameter (%) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="10"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                %
              </span>
            </div>
          </div>

          {/* Option Checkbox: Apply to master template */}
          <div className="pt-2 border-t border-slate-200">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 cursor-pointer transition">
              <input
                type="checkbox"
                checked={applyToMaster}
                onChange={(e) => setApplyToMaster(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  Terapkan juga ke template master departemen
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Jika dicentang, parameter ini akan otomatis tersedia untuk karyawan lain di departemen yang sama.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs hover:shadow-sm transition cursor-pointer"
            >
              Simpan Parameter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
