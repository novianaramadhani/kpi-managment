"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Eye,
  Send,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Settings,
  Download,
} from "lucide-react";
import type { Department, JobLevel, KpiTemplate } from "@/db/schema";

interface TemplateHeaderProps {
  template: KpiTemplate;
  templateName: string;
  department?: Department;
  jobLevel?: JobLevel;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentName?: string | null;
  } | null;
  periodYear: string;
  isActive: boolean;
  isValidToPublish: boolean;
  isPending: boolean;
  templateTargetPct: number;
  isEditTemplateMode?: boolean;
  onToggleEditTemplate?: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft?: () => void;
  onEditInfo?: () => void;
  onExportExcel?: () => void;
  onImportExcel?: () => void;
  onSyncToEmployees?: () => void;
  isSyncingToEmployees?: boolean;
}

export function TemplateHeader({
  template,
  templateName,
  department,
  jobLevel,
  employee,
  periodYear,
  isActive,
  isValidToPublish,
  isPending,
  templateTargetPct,
  isEditTemplateMode = false,
  onToggleEditTemplate,
  onPreview,
  onPublish,
  onEditInfo,
  onSyncToEmployees,
  isSyncingToEmployees = false,
  onExportExcel,
  onImportExcel,
}: TemplateHeaderProps) {
  const deptLabel = department?.name ?? "Semua Departemen";
  const levelLabel = jobLevel?.name ?? "Semua Level";

  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!isActionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionsOpen]);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
        <Link href="/setup/templates" className="hover:text-slate-700 transition-colors">
          Template KPI
        </Link>
        <span>&rsaquo;</span>
        <span className="text-slate-600">Detail Template</span>
      </div>

      {/* BARIS 1: Tombol Kembali, Judul Halaman & Template, Badges, Dropdown Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        {/* Sisi Kiri: Kembali + Judul + Badges */}
        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
          <Link
            href="/setup/templates"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-2xs transition cursor-pointer mt-0.5 sm:mt-0"
            title="Kembali ke Daftar Master Template"
            aria-label="Kembali ke Daftar Master Template"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1
                className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate min-w-0"
                title={`Struktur KPI: ${templateName}`}
              >
                Struktur KPI: {templateName}
              </h1>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Badge Status */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  <span>{isActive ? "Published" : "Draft"}</span>
                </span>

                {/* Badge Versi */}
                <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                  v{template.version || 1}.0
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Atur parameter, indikator, dan kriteria penilaian untuk template KPI ini.
            </p>
          </div>
        </div>

        {/* Sisi Kanan: Single Dropdown Menu Actions + Direct Download Button */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer"
              title="Download Template KPI ke Excel (beserta kolom input actual bulanan)"
            >
              <Download className="h-3.5 w-3.5 text-emerald-700" />
              <span>Download Excel</span>
            </button>
          )}

          <div className="relative" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setIsActionsOpen((prev) => !prev)}
              aria-expanded={isActionsOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-98 cursor-pointer"
              title="Menu Aksi Template KPI"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-600" />
              <span>Actions</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                  isActionsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isActionsOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-xl z-50 transition-all animate-in fade-in zoom-in-95 duration-150"
              >
                {/* 1. Update ke Employee */}
                {onSyncToEmployees && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isSyncingToEmployees}
                    onClick={() => {
                      setIsActionsOpen(false);
                      onSyncToEmployees();
                    }}
                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50/80 hover:text-indigo-900 transition text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="h-7 w-7 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-100/70 transition-colors">
                      <RefreshCw
                        className={`h-3.5 w-3.5 text-indigo-600 ${
                          isSyncingToEmployees ? "animate-spin" : ""
                        }`}
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 group-hover:text-indigo-950">
                        {isSyncingToEmployees ? "Memperbarui..." : "Update ke Employee"}
                      </span>
                      <span className="text-[10.5px] text-slate-500 leading-tight">
                        Sinkronkan kriteria skor ke form karyawan
                      </span>
                    </div>
                  </button>
                )}

                {/* 2. Edit Template */}
                {onToggleEditTemplate && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsActionsOpen(false);
                      onToggleEditTemplate();
                    }}
                    className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium transition text-left cursor-pointer group mt-0.5 ${
                      isEditTemplateMode
                        ? "bg-amber-50/90 text-amber-900 hover:bg-amber-100/80"
                        : "text-slate-700 hover:bg-blue-50/80 hover:text-blue-900"
                    }`}
                  >
                    <div
                      className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isEditTemplateMode
                          ? "bg-amber-100 border-amber-200 text-amber-700"
                          : "bg-blue-50 border-blue-100 text-blue-600 group-hover:bg-blue-100/70"
                      }`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">
                          {isEditTemplateMode ? "Keluar Edit Template" : "Edit Template"}
                        </span>
                        {isEditTemplateMode && (
                          <span className="text-[9.5px] font-bold uppercase bg-amber-200/80 text-amber-800 px-1 py-0.2 rounded">
                            Aktif
                          </span>
                        )}
                      </div>
                      <span className="text-[10.5px] text-slate-500 leading-tight">
                        {isEditTemplateMode
                          ? "Simpan & tutup mode edit langsung"
                          : "Edit langsung kriteria & skor di tabel"}
                      </span>
                    </div>
                  </button>
                )}

                {/* 3. Preview */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onPreview();
                  }}
                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition text-left cursor-pointer group mt-0.5"
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 text-slate-600 group-hover:bg-slate-200/60 transition-colors">
                    <Eye className="h-3.5 w-3.5 text-slate-600" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800">Preview Template</span>
                    <span className="text-[10.5px] text-slate-500 leading-tight">
                      Lihat pratinjau struktur KPI lengkap
                    </span>
                  </div>
                </button>

                {/* Download Excel Template */}
                {onExportExcel && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsActionsOpen(false);
                      onExportExcel();
                    }}
                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-950 transition text-left cursor-pointer group mt-0.5"
                  >
                    <div className="h-7 w-7 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700 group-hover:bg-emerald-100/70 transition-colors">
                      <Download className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 group-hover:text-emerald-950">
                        Download Excel
                      </span>
                      <span className="text-[10.5px] text-slate-500 leading-tight">
                        Unduh format template &amp; input actual bulanan
                      </span>
                    </div>
                  </button>
                )}

                {/* Divider */}
                <div className="my-1 border-t border-slate-100" />

                {/* 4. Publish */}
                <button
                  type="button"
                  role="menuitem"
                  disabled={isPending || !isValidToPublish}
                  onClick={() => {
                    if (!isValidToPublish || isPending) return;
                    setIsActionsOpen(false);
                    onPublish();
                  }}
                  className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium transition text-left cursor-pointer group mt-0.5 ${
                    !isValidToPublish || isPending
                      ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                      : "text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-950"
                  }`}
                  title={
                    !isValidToPublish
                      ? `Publish hanya aktif jika struktur KPI valid dan total bobot = ${templateTargetPct}%.`
                      : "Publish Template KPI"
                  }
                >
                  <div
                    className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      !isValidToPublish || isPending
                        ? "bg-slate-100 border-slate-200 text-slate-400"
                        : "bg-emerald-50 border-emerald-200 text-emerald-600 group-hover:bg-emerald-100/70"
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">
                        {isActive ? "Publish Ulang Template" : "Publish Template"}
                      </span>
                      {isValidToPublish && (
                        <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                          Siap
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] text-slate-500 leading-tight">
                      {!isValidToPublish
                        ? `Perlu validasi bobot ${templateTargetPct}%`
                        : "Aktifkan template untuk penilaian"}
                    </span>
                  </div>
                </button>

                {/* 5. Ubah Info Template (jika onEditInfo tersedia) */}
                {onEditInfo && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsOpen(false);
                        onEditInfo();
                      }}
                      className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition text-left cursor-pointer group mt-0.5"
                    >
                      <div className="h-7 w-7 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 text-slate-500 group-hover:bg-slate-200/60 transition-colors">
                        <Settings className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-slate-800">Ubah Info Template</span>
                        <span className="text-[10.5px] text-slate-500 leading-tight">
                          Nama, departemen, level jabatan
                        </span>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BARIS 2: Metadata satu baris ringkas */}
      <div className="flex items-center gap-2 text-xs text-slate-500 pl-10.5 flex-wrap">
        <span className="font-medium text-slate-600 truncate">
          {deptLabel} &bull; {levelLabel} &bull; {periodYear}
          {employee?.nik ? ` \u2022 NIK: ${employee.nik}` : ""}
        </span>
        {template.site && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            Site: {template.site}
          </span>
        )}
      </div>
    </div>
  );
}
