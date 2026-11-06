"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Building2,
  Briefcase,
  Users,
  ExternalLink,
  Download,
  FileText,
  Edit3,
  Check,
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
  // Inline edit callbacks (used when previewing/editing from Generate Template KPI)
  onUpdateCategory?: (catId: number, data: { name?: string; weight?: number }) => Promise<void>;
  onUpdateIndicatorName?: (ind: KpiParameter, newName: string) => Promise<void>;
  onUpdateIndicatorWeight?: (ind: KpiParameter, newWeight: number) => Promise<void>;
  onDeleteIndicator?: (ind: KpiParameter) => Promise<void>;
  onUpdateCriteriaBandInline?: (band: KpiBand, data: { label?: string; score?: string }) => Promise<void>;
  onAddCriteriaBand?: (paramId: number) => void;
  onDeleteCriteriaBand?: (bandId: number) => Promise<void>;
  onAddIndicator?: (catId: number) => void;
  onEditIndicator?: (catId: number, ind: KpiParameter) => void;
  onOpenStep2ForEmployee?: () => void;
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
  onUpdateCategory,
  onUpdateIndicatorName,
  onUpdateIndicatorWeight,
  onDeleteIndicator,
  onUpdateCriteriaBandInline,
  onAddCriteriaBand,
  onDeleteCriteriaBand,
  onAddIndicator,
  onEditIndicator,
  onOpenStep2ForEmployee,
}: TemplateViewModalProps) {
  const canInlineEdit = Boolean(
    onUpdateCategory || onUpdateIndicatorName || onUpdateIndicatorWeight || onUpdateCriteriaBandInline
  );
  const [isInlineEditing, setIsInlineEditing] = useState(false);

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

  useEffect(() => {
    if (!isOpen) {
      setIsInlineEditing(false);
    }
  }, [isOpen]);

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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* 1. MODAL HEADER (Clean White Background & Subtle Border) */}
        {/* ========================================================= */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] bg-[#FFFFFF] space-y-2">
          {/* Top: Name, Badges, & Close */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug break-words">
                  {employee?.name || template.name}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                      template.isActive
                        ? "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]"
                        : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        template.isActive ? "bg-[#16A34A]" : "bg-[#64748B]"
                      }`}
                    />
                    <span>{template.isActive ? "Published" : "Draft"}</span>
                  </span>
                  <span className="text-[11px] font-mono font-medium text-[#64748B] bg-[#F8FAFC] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
                    v{template.version}.0
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-1.5 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer shrink-0 -mt-1 -mr-1"
              title="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom: Single-Line Metadata & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-0.5">
            <div className="flex items-center gap-x-2.5 gap-y-1 text-xs text-[#64748B] flex-wrap">
              {employee?.nik && (
                <>
                  <span>
                    NIK: <strong className="font-mono font-semibold text-[#0F172A]">{employee.nik}</strong>
                  </span>
                  <span className="text-[#CBD5E1]">•</span>
                </>
              )}
              {employee?.jobPosition ? (
                <span>
                  Job Position: <strong className="font-semibold text-[#0F172A]">{employee.jobPosition}</strong>
                </span>
              ) : (
                <span>
                  Job Level: <strong className="font-semibold text-[#0F172A]">{jobLevel?.name ?? "Semua Jabatan"}</strong>
                </span>
              )}
              <span className="text-[#CBD5E1]">•</span>
              <span>
                Departemen:{" "}
                <strong className="font-semibold text-[#0F172A]">
                  {employee?.departmentName || department?.name || "Semua Departemen"}
                </strong>
              </span>
              <span className="text-[#CBD5E1]">•</span>
              <span>
                Total Bobot: <strong className="font-semibold text-[#16A34A]">{targetPct}%</strong>
              </span>
              {template.site && (
                <>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Site: <strong className="font-semibold text-[#0F172A]">{template.site}</strong>
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition shadow-2xs cursor-pointer"
                  title="Tugaskan template ini ke karyawan"
                >
                  <Users className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                  <span>Assign Template</span>
                </button>
              )}

              {onOpenStep2ForEmployee && (
                <button
                  type="button"
                  onClick={onOpenStep2ForEmployee}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2563EB] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] transition cursor-pointer"
                  title="Pilih atau ganti indikator dari Kamus Parameter KPI untuk karyawan ini"
                >
                  <span>Pilih Indikator Kamus</span>
                </button>
              )}

              {canInlineEdit && (
                <button
                  type="button"
                  onClick={() => setIsInlineEditing((prev) => !prev)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    isInlineEditing
                      ? "bg-[#2563EB] text-white hover:bg-blue-700"
                      : "bg-[#EFF6FF] text-[#2563EB] border border-blue-200 hover:bg-blue-100/80"
                  }`}
                  title="Edit nilai kriteria, skor, dan bobot secara langsung pada tabel di bawah"
                >
                  {isInlineEditing ? (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Selesai Edit</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Edit Template</span>
                    </>
                  )}
                </button>
              )}

              {!canInlineEdit && template.id > 0 && (
                <Link
                  href={`/setup/templates/${template.id}`}
                  className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EFF6FF] border border-blue-200 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-blue-100/80 transition shadow-2xs cursor-pointer"
                  title="Edit konfigurasi parameter dan bobot template"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Edit Template</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. MODAL BODY (EXCEL SPREADSHEET FORMAT: 4 KOLOM) */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
          {isInlineEditing && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
              <span>
                <strong>Mode Edit Aktif:</strong> Klik langsung pada teks <strong>Kriteria Penilaian</strong>, <strong>Skor</strong>, <strong>Nama Indikator</strong>, atau <strong>Bobot (%)</strong> di tabel bawah untuk mengubah nilainya, lalu tekan Enter.
              </span>
              <button
                type="button"
                onClick={() => setIsInlineEditing(false)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                Selesai Edit
              </button>
            </div>
          )}

          {/* Unified KPI Excel Table (mode="template" atau mode="edit") */}
          <KpiExcelTable
            mode={isInlineEditing ? "edit" : "template"}
            categories={tplCategories}
            parameters={tplParameters}
            bands={bands}
            templateTargetPct={targetPct}
            templateName={template.name}
            department={department}
            jobLevel={jobLevel}
            onUpdateCategory={onUpdateCategory}
            onUpdateIndicatorName={onUpdateIndicatorName}
            onUpdateIndicatorWeight={onUpdateIndicatorWeight}
            onDeleteIndicator={onDeleteIndicator}
            onUpdateCriteriaBandInline={onUpdateCriteriaBandInline}
            onAddCriteriaBand={onAddCriteriaBand}
            onDeleteCriteriaBand={onDeleteCriteriaBand}
            onAddIndicator={onAddIndicator}
            onEditIndicator={onEditIndicator}
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
