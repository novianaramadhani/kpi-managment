"use client";

import React, { useState, useTransition } from "react";
import { addCustomIndicatorToAppraisal } from "@/lib/actions";
import Swal from "sweetalert2";

interface CustomKpiModalProps {
  isOpen: boolean;
  onClose: () => void;
  appraisalId: number;
  categoryId: number;
  categoryName: string;
}

export function CustomKpiModal({
  isOpen,
  onClose,
  appraisalId,
  categoryId,
  categoryName,
}: CustomKpiModalProps) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [weight, setWeight] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !target || !weight) {
      Swal.fire("Error", "Nama, Target, dan Bobot wajib diisi.", "error");
      return;
    }

    startTransition(async () => {
      // Default simple criteria for custom KPIs
      const criteria = [
        { label: "Tercapai", operator: "GTE", minValue: Number(target), maxValue: null, score: 25 },
        { label: "Kurang", operator: "LT", minValue: null, maxValue: Number(target), score: 10 }
      ];

      const res = await addCustomIndicatorToAppraisal({
        appraisalId,
        categoryId,
        name,
        target: Number(target),
        unit,
        weight: Number(weight),
        criteria,
      });

      if (res.success) {
        Swal.fire("Berhasil", "Custom KPI berhasil ditambahkan.", "success");
        onClose();
      } else {
        Swal.fire("Gagal", res.error || "Gagal menambahkan Custom KPI", "error");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">Tambah Custom KPI</h3>
          <p className="text-xs text-slate-500">Parameter: {categoryName}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Nama Indikator</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Contoh: Penyelesaian Proyek X"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Target Tahunan</label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Contoh: 100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Satuan (Opsional)</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="%, Rp, Dokumen, dll"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Bobot KPI (%)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Contoh: 10"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
              disabled={isPending}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : "Simpan Custom KPI"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
