"use client";

import React from "react";
import { FilePlus, ChevronUp, ChevronDown, Pencil, Copy, Trash2 } from "lucide-react";
import type { KpiBand, KpiParameter } from "@/db/schema";

interface IndicatorListProps {
  parameters: KpiParameter[];
  bands: KpiBand[];
  onOpenAddModal: () => void;
  onOpenEditModal: (param: KpiParameter) => void;
  onDuplicate: (paramId: number) => void;
  onDelete: (param: KpiParameter) => void;
  onMoveOrder: (param: KpiParameter, direction: "UP" | "DOWN") => void;
  isPending: boolean;
  categoryWeightPct?: number;
}

export function IndicatorList({
  parameters,
  onOpenAddModal,
  onOpenEditModal,
  onDuplicate,
  onDelete,
  onMoveOrder,
  isPending,
  categoryWeightPct,
}: IndicatorListProps) {
  if (parameters.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-2.5">
          <FilePlus className="h-5 w-5" />
        </div>
        <h4 className="text-xs font-bold text-slate-800 mb-1">
          Belum Ada Indikator KPI
        </h4>
        <p className="text-[11px] text-slate-400 max-w-sm mx-auto mb-3">
          Tambahkan indikator penilaian kinerja pertama pada parameter ini untuk mulai menyusun target.
        </p>
        <button
          type="button"
          onClick={onOpenAddModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold transition cursor-pointer active:scale-95"
        >
          <span>+ Tambah Indikator Pertama</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        {/* Table Header: Clean horizontal border */}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <th className="py-2.5 px-4 w-12 text-center">#</th>
            <th className="py-2.5 px-4">Indikator KPI</th>
            <th className="py-2.5 px-4 text-center w-32">Bobot</th>
            <th className="py-2.5 px-4 w-28">Satuan</th>
            <th className="py-2.5 px-4 w-44">Metode / PIC</th>
            <th className="py-2.5 px-4 text-right w-24">Aksi</th>
          </tr>
        </thead>

        {/* Table Body: Subtle divide line, clean typography, NO cards, NO badges */}
        <tbody className="divide-y divide-slate-100">
          {parameters.map((param, idx) => {
            const weightPct = Math.round(Number(param.weight) * 100);

            return (
              <tr
                key={param.id}
                className="hover:bg-slate-50/70 transition-colors group"
              >
                {/* Order & Move buttons */}
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-mono text-slate-400 font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onMoveOrder(param, "UP")}
                        disabled={idx === 0 || isPending}
                        className="p-0.5 text-slate-400 hover:text-slate-900 disabled:opacity-20 cursor-pointer"
                        title="Pindah ke Atas"
                      >
                        <ChevronUp className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveOrder(param, "DOWN")}
                        disabled={idx === parameters.length - 1 || isPending}
                        className="p-0.5 text-slate-400 hover:text-slate-900 disabled:opacity-20 cursor-pointer"
                        title="Pindah ke Bawah"
                      >
                        <ChevronDown className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </td>

                {/* Indicator Info: Name & Truncated Description */}
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900 text-xs">
                    {param.name}
                  </div>
                  {param.description && (
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 max-w-md font-normal">
                      {param.description}
                    </p>
                  )}
                </td>

                {/* Weight: Simple font-mono text, NO badge, shows both internal and effective */}
                <td className="py-3 px-4 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <span className="font-mono text-xs font-bold text-slate-800" title="Bobot Internal Sub-poin">
                      {weightPct}%
                    </span>
                    {categoryWeightPct !== undefined && (
                      <span className="text-[10px] text-slate-500 font-medium mt-0.5" title="Bobot Efektif thd Global">
                        Eff: {((weightPct / 100) * categoryWeightPct).toFixed(1).replace(/\.0$/, "")}%
                      </span>
                    )}
                  </div>
                </td>

                {/* Satuan: Clean text, NO badge */}
                <td className="py-3 px-4 text-slate-600 font-medium">
                  {param.unit || "-"}
                </td>

                {/* Metode / PIC: Clean text, NO badges */}
                <td className="py-3 px-4 text-slate-600">
                  <div className="font-medium text-slate-800 text-[11px]">
                    {param.inputType}
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    {param.picRole || "HEAD_DEPT"}
                  </div>
                </td>

                {/* Action buttons (Clean icons with progressive disclosure) */}
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenEditModal(param)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                      title="Edit Indikator & Scoring"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicate(param.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      title="Duplikat Indikator"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(param)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Hapus Indikator"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
