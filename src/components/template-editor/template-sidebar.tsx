"use client";

import React from "react";
import {
  Edit3,
  Lightbulb,
  CheckCircle2,
  FolderTree,
  FileText,
  Sliders,
  Layers,
  Award,
} from "lucide-react";
import type { Department, JobLevel, KpiTemplate } from "@/db/schema";

interface TemplateSidebarProps {
  template: KpiTemplate;
  department?: Department;
  jobLevel?: JobLevel;
  totalWeightPct: number;
  targetWeightPct: number;
  periodYear?: string;
  categoryCount: number;
  parameterCount: number;
  indicatorCount: number;
  criteriaCount: number;
  onEditInfo: () => void;
}

export function TemplateSidebar({
  template,
  department,
  jobLevel,
  totalWeightPct,
  targetWeightPct,
  periodYear = "2026",
  categoryCount,
  parameterCount,
  indicatorCount,
  criteriaCount,
  onEditInfo,
}: TemplateSidebarProps) {
  const isPublished = template.isActive;
  const isFull = totalWeightPct === 100;

  return (
    <div className="space-y-4">
      {/* CARD 1: INFORMASI TEMPLATE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
          Informasi Template
        </h3>

        <div className="space-y-3 text-xs">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Nama Template</span>
            <span className="font-semibold text-slate-800 text-sm">{template.name}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Departemen</span>
              <span className="font-semibold text-slate-800">{department?.name || "-"}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Job Level</span>
              <span className="font-semibold text-slate-800">{jobLevel?.name || "-"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Periode</span>
              <span className="font-semibold text-slate-800">{periodYear}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Status</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5 ${
                  isPublished
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPublished ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 font-medium">Total Bobot</span>
              <span className={`font-bold ${isFull ? "text-emerald-600" : "text-slate-900"}`}>
                {totalWeightPct}% / {targetWeightPct}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isFull
                    ? "bg-emerald-500"
                    : totalWeightPct > 100
                    ? "bg-rose-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, totalWeightPct))}%` }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onEditInfo}
          className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
          <span>Ubah Informasi</span>
        </button>
      </div>

      {/* CARD 2: PETUNJUK PENGGUNAAN */}
      <div className="bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-slate-50/40 rounded-2xl border border-blue-100/80 shadow-xs p-5 space-y-3">
        <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
          <Lightbulb className="w-4 h-4 text-blue-600" />
          <span>Petunjuk Penggunaan</span>
        </div>

        <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Pastikan total bobot seluruh parameter = 115%.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Setiap indikator wajib memiliki kriteria scoring.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Gunakan rentang nilai yang tidak tumpang tindih.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Klik Preview untuk melihat tampilan penilaian.</span>
          </li>
        </ul>
      </div>

      {/* CARD 3: STRUKTUR TEMPLATE STATS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs pb-2 border-b border-slate-100">
          <FolderTree className="w-4 h-4 text-slate-600" />
          <span>Struktur Template</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 text-slate-600">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>Parameter</span>
            </div>
            <span className="font-bold text-slate-900">{categoryCount}</span>
          </div>

          <div className="flex items-center justify-between py-1 text-slate-600">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>Indikator</span>
            </div>
            <span className="font-bold text-slate-900">{parameterCount}</span>
          </div>

          <div className="flex items-center justify-between py-1 text-slate-600">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-purple-500" />
              <span>Indikator / Sub-Point</span>
            </div>
            <span className="font-bold text-slate-900">{indicatorCount}</span>
          </div>

          <div className="flex items-center justify-between py-1 text-slate-600">
            <div className="flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Kriteria Scoring</span>
            </div>
            <span className="font-bold text-slate-900">{criteriaCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
