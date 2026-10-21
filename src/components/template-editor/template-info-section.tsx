"use client";

import React from "react";
import { Edit3 } from "lucide-react";
import type { Department, JobLevel, KpiTemplate } from "@/db/schema";

interface TemplateInfoSectionProps {
  template: KpiTemplate;
  templateName: string;
  department?: Department;
  jobLevel?: JobLevel;
  periodYear: string;
  isActive: boolean;
  totalWeightPct: number;
  targetWeightPct?: number;
  onEditInfo: () => void;
}

export function TemplateInfoSection({
  template,
  templateName,
  department,
  jobLevel,
  periodYear,
  isActive,
  totalWeightPct,
  targetWeightPct = 115,
  onEditInfo,
}: TemplateInfoSectionProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Informasi Template
        </h3>
        <button
          type="button"
          onClick={onEditInfo}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
        >
          <Edit3 className="w-3 h-3 text-slate-400" />
          <span>Ubah Informasi</span>
        </button>
      </div>

      {/* 2-Column Compact Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-[11px] text-slate-400 font-medium block">Nama Template</span>
          <span className="font-semibold text-slate-900 text-xs block truncate" title={templateName}>
            {templateName}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 font-medium block">Departemen</span>
          <span className="font-semibold text-slate-800 text-xs block truncate">
            {department?.name ?? "Semua Departemen"}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 font-medium block">Job Level</span>
          <span className="font-semibold text-slate-800 text-xs block truncate">
            {jobLevel?.name ?? "Semua Level"}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 font-medium block">Periode & Status</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-semibold text-slate-800">{periodYear}</span>
            <span className="text-slate-300">•</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
              {isActive ? "Published" : "Draft"}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Total Bobot Parameter */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 text-[11px]">Ringkasan Bobot:</span>
        <span className="font-semibold text-slate-800 text-xs font-mono">
          Total Bobot Parameter: <strong className={totalWeightPct === targetWeightPct ? "text-emerald-700" : "text-blue-600"}>{totalWeightPct}%</strong> / {targetWeightPct}%
        </span>
      </div>
    </div>
  );
}
