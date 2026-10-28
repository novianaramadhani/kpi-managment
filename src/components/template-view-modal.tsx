"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  X,
  Building2,
  Briefcase,
  Users,
  ExternalLink,
  Download,
  FileText,
} from "lucide-react";
import type { Department, JobLevel, KpiBand, KpiCategory, KpiParameter, KpiTemplate } from "@/db/schema";
import { Badge } from "./ui";
import { KpiExcelTable } from "./kpi-excel-table";
import { exportKpiTemplateToExcel } from "@/lib/excel-template-kpi";
import { exportKpiTemplateToPdf } from "@/lib/pdf-template";

interface TemplateViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: KpiTemplate | null;
  department?: Department;
  jobLevel?: JobLevel;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentName?: string | null;
  } | null;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands?: KpiBand[];
  onAssign?: (template: KpiTemplate) => void;
}

export function TemplateViewModal({
  isOpen,
  onClose,
  template,
  department,
  jobLevel,
  employee,
  categories,
  parameters,
  bands = [],
  onAssign,
}: TemplateViewModalProps) {
  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !template) return null;

  // Filter categories and parameters belonging to this template
  const tplCategories = categories
    .filter((c) => c.templateId === template.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

  const tplCategoryIds = new Set(tplCategories.map((c) => c.id));
  const tplParameters = parameters.filter((p) => tplCategoryIds.has(p.categoryId));

  const targetPct = Math.round(Number(template.totalWeight) * 100);
  const totalCalculatedWeight = tplCategories.reduce(
    (s, c) => s + Math.round(Number(c.weight) * 100),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* 1. MODAL HEADER */}
        {/* ========================================================= */}
        <div className="px-5 sm:px-6 pt-4 pb-3.5 border-b border-slate-200 bg-white space-y-2">
          {/* Top: Template Name, Badges, & Close */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words">
                  {template.name}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  {template.isActive ? (
                    <Badge tone="green">Published</Badge>
                  ) : (
                    <Badge tone="slate">Draft</Badge>
                  )}
                  <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    v{template.version}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 -mt-1 -mr-1"
              title="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom: Department, Job Level & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-0.5">
            <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{department?.name ?? "Semua Departemen"}</span>
                {department?.code && (
                  <span className="text-slate-400 font-normal">({department.code})</span>
                )}
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{jobLevel?.name ?? "Semua Jabatan"}</span>
                {jobLevel?.code && (
                  <span className="text-slate-400 font-normal">({jobLevel.code})</span>
                )}
              </span>
              {template.site && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Site: {template.site}
                  </span>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 pt-1 sm:pt-0">
              {onAssign && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAssign(template);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer"
                  title="Tugaskan template ini ke karyawan"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Assign Template</span>
                </button>
              )}

              <Link
                href={`/setup/templates/${template.id}`}
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs cursor-pointer"
                title="Edit konfigurasi parameter dan bobot template"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>Edit Template</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. MODAL BODY (EXCEL SPREADSHEET FORMAT: 4 KOLOM) */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
          {/* Header Info Sheet: Template, Departemen, Job Level, Target */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nama Template
                </span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {template.name}
                </span>
                <span className="text-[10px] text-slate-400">v{template.version}.0</span>
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Departemen
                </span>
                <span className="font-medium text-slate-800 mt-0.5 block truncate">
                  {department?.name ?? "Semua Departemen"}
                </span>
                <span className="text-[10px] text-slate-400">
                  {department?.code ? `Kode: ${department.code}` : "-"}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Job Level
                </span>
                <span className="font-medium text-slate-800 mt-0.5 block truncate">
                  {jobLevel?.name ?? "Semua Jabatan"}
                </span>
                <span className="text-[10px] text-slate-400">
                  {jobLevel?.code ? `Kode: ${jobLevel.code}` : "-"}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Target Total Bobot
                </span>
                <span className="font-bold text-slate-900 mt-0.5 block font-mono">
                  {targetPct}%
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  {tplCategories.length} Parameter Terkonfigurasi
                </span>
              </div>
            </div>
          </div>

          {/* Unified KPI Excel Table (mode="template" -> 4 Kolom: Parameter | Kriteria | Skor | Bobot) */}
          <KpiExcelTable
            mode="template"
            categories={tplCategories}
            parameters={tplParameters}
            bands={bands}
            templateTargetPct={targetPct}
            templateName={template.name}
            department={department}
            jobLevel={jobLevel}
          />
        </div>

        {/* ========================================================= */}
        {/* 3. MODAL FOOTER */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between p-3.5 sm:px-6 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-700 font-semibold font-mono">
            Total Bobot Parameter:{" "}
            <strong className="text-emerald-700 font-bold">
              {totalCalculatedWeight}%
            </strong>{" "}
            / {targetPct}%
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                exportKpiTemplateToExcel({
                  template,
                  departmentName: employee?.departmentName || department?.name,
                  jobLevelName: jobLevel?.name,
                  employee,
                  categories: tplCategories,
                  parameters: tplParameters,
                  bands,
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              title="Download seluruh struktur template ke Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                exportKpiTemplateToPdf({
                  template,
                  departmentName: department?.name,
                  jobLevelName: jobLevel?.name,
                  categories: tplCategories,
                  parameters: tplParameters,
                  bands,
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              title="Download seluruh struktur template ke PDF"
            >
              <FileText className="w-3.5 h-3.5 text-rose-600" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
