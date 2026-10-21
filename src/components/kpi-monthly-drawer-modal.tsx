"use client";

import React from "react";
import type { KpiDetailItem } from "./kpi-collapsible-input";

interface KpiMonthlyDrawerModalProps {
  isOpen: boolean;
  parameterGroupName: string;
  kpi: KpiDetailItem | null;
  onClose: () => void;
  onEditMonth: (monthIndex: number) => void;
  isLocked?: boolean;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function KpiMonthlyDrawerModal({
  isOpen,
  parameterGroupName,
  kpi,
  onClose,
  onEditMonth,
  isLocked = false,
}: KpiMonthlyDrawerModalProps) {
  if (!isOpen || !kpi) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        role="dialog"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Parameter: {parameterGroupName}
            </span>
            <h3 className="font-extrabold text-base tracking-wide text-white">
              📅 Rincian Realisasi 12 Bulan — {kpi.name}
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

        {/* Subheader info banner */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-4">
            <span>
              Target Indikator: <strong className="font-mono font-bold text-slate-900">{kpi.targetDisplay || kpi.target}</strong>
            </span>
            <span>•</span>
            <span>
              Satuan: <strong className="font-bold text-slate-900">{kpi.unit || "-"}</strong>
            </span>
            <span>•</span>
            <span>
              Agregasi: <strong className="font-bold text-slate-900">{kpi.aggregation}</strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            Klik tombol Edit ✎ pada baris bulan untuk mengubah nilai &amp; catatan
          </span>
        </div>

        {/* Scrollable Table Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="p-3 w-12 text-center">Bulan</th>
                  <th className="p-3 text-center w-28">Target</th>
                  <th className="p-3 text-center w-36">Realisasi Aktual</th>
                  <th className="p-3 text-left">Catatan Penilai</th>
                  <th className="p-3 text-center w-32">Dokumen Bukti</th>
                  <th className="p-3 text-center w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {MONTH_NAMES.map((mName, mIdx) => {
                  const val = kpi.monthlyActuals[mIdx];
                  const hasVal = val !== null && val !== undefined;
                  const note = kpi.monthlyNotes[mIdx] || "-";
                  const attachment = kpi.monthlyAttachments?.[mIdx];

                  return (
                    <tr key={mIdx} className="hover:bg-slate-50/60 transition">
                      {/* Bulan */}
                      <td className="p-3 text-center font-bold text-slate-900 font-mono">
                        {MONTH_SHORT[mIdx]}
                      </td>

                      {/* Target */}
                      <td className="p-3 text-center font-mono text-slate-700">
                        {kpi.targetDisplay || kpi.target}
                      </td>

                      {/* Realisasi */}
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-lg font-mono font-bold text-xs border ${
                            hasVal
                              ? "bg-slate-100 text-slate-900 border-slate-200 shadow-2xs"
                              : "bg-slate-50 text-slate-400 border-dashed border-slate-200"
                          }`}
                        >
                          {hasVal ? val : "Belum diisi"}
                        </span>
                      </td>

                      {/* Catatan */}
                      <td className="p-3 text-slate-700 text-[11px] max-w-xs">
                        <span className={note === "-" ? "text-slate-400 italic" : "line-clamp-2"}>
                          {note}
                        </span>
                      </td>

                      {/* Lampiran */}
                      <td className="p-3 text-center">
                        {attachment ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 truncate max-w-[120px]">
                            ✓ {attachment}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">-</span>
                        )}
                      </td>

                      {/* Aksi (Biru Muda) */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => onEditMonth(mIdx)}
                          className="px-2.5 py-1 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1 mx-auto"
                        >
                          <span>✎</span>
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50/50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            Tutup Rincian
          </button>
        </div>
      </div>
    </div>
  );
}
