"use client";

import React from "react";
import { Lightbulb, CheckCircle2 } from "lucide-react";

export function TemplateGuideSection() {
  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200/70 p-3.5 space-y-2">
      <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
        <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
        <span>Petunjuk Penggunaan & Aturan Bobot</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>Total seluruh Parameter = 115% (contoh: Target Kerja 65%, Kehadiran 20%, SP 10%, dsb).</span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>Bobot seluruh indikator dalam satu parameter wajib berjumlah tepat 100%.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>Setiap indikator memiliki skala nilai skor (misal: &ge;98% &rarr; 25).</span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>Klik tombol Preview untuk memeriksa pratinjau form evaluasi akhir format Excel.</span>
        </div>
      </div>
    </div>
  );
}
