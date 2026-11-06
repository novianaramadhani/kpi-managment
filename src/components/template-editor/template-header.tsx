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

  // Resolusi nama, NIK, jabatan, dan departemen karyawan untuk template
  const empName = employee?.name || (() => {
    const match = templateName.match(/Template\s+KPI\s+([^-]+)/i);
    return match ? match[1].trim() : null;
  })();
  const nikLabel = employee?.nik && employee.nik !== "-" ? employee.nik : null;
  const jobPositionLabel =
    employee?.jobPosition && employee.jobPosition !== "-"
      ? employee.jobPosition
      : levelLabel;
  const departmentLabel =
    employee?.departmentName && employee.departmentName !== "-"
      ? employee.departmentName
      : deptLabel;

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
    <div className="w-full flex flex-col gap-2">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium">
        <Link href="/setup/templates" className="hover:text-[#0F172A] transition-colors">
          Template KPI
        </Link>
        <span>&rsaquo;</span>
        <span className="text-[#0F172A] font-semibold">Detail Template</span>
      </div>

      {/* BARIS UTAMA: Tombol Kembali, Informasi Nama & Metadata Langsung (Tanpa Card Terpisah), serta Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        {/* Sisi Kiri: Kembali + Nama & Baris Info */}
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <Link
            href="/setup/templates"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition cursor-pointer mt-0.5 sm:mt-0 shadow-2xs"
            title="Kembali ke Daftar Master Template"
            aria-label="Kembali ke Daftar Master Template"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A] break-words min-w-0">
                {empName || templateName}
              </h1>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Badge Status */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                    isActive
                      ? "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]"
                      : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-[#16A34A]" : "bg-[#64748B]"
                    }`}
                  />
                  <span>{isActive ? "Published" : "Draft"}</span>
                </span>

                {/* Badge Versi */}
                <span className="text-[11px] font-mono font-medium text-[#64748B] bg-[#F8FAFC] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
                  v{template.version || 1}.0
                </span>
              </div>
            </div>

            {/* Metadata Sebaris Tanpa Card-Card Kecil */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#64748B]">
              {empName ? (
                <>
                  {nikLabel && (
                    <>
                      <span>
                        NIK: <strong className="font-mono font-semibold text-[#0F172A]">{nikLabel}</strong>
                      </span>
                      <span className="text-[#CBD5E1]">•</span>
                    </>
                  )}
                  <span>
                    Job Position: <strong className="font-semibold text-[#0F172A]">{jobPositionLabel}</strong>
                  </span>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Departemen: <strong className="font-semibold text-[#0F172A]">{departmentLabel}</strong>
                  </span>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Periode: <strong className="font-semibold text-[#0F172A]">{periodYear}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Departemen: <strong className="font-semibold text-[#0F172A]">{deptLabel}</strong>
                  </span>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Job Level: <strong className="font-semibold text-[#0F172A]">{levelLabel}</strong>
                  </span>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Periode: <strong className="font-semibold text-[#0F172A]">{periodYear}</strong>
                  </span>
                </>
              )}

              {template.site && (
                <>
                  <span className="text-[#CBD5E1]">•</span>
                  <span>
                    Site: <strong className="font-semibold text-[#0F172A]">{template.site}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sisi Kanan: Actions Dropdown */}
        <div className="flex items-center gap-2 shrink-0 justify-end w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setIsActionsOpen((prev) => !prev)}
              aria-expanded={isActionsOpen}
              aria-haspopup="true"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] shadow-2xs hover:bg-[#F8FAFC] transition active:scale-98 cursor-pointer"
              title="Menu Aksi Template KPI"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#64748B]" />
              <span>Actions</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#64748B] transition-transform duration-200 ${
                  isActionsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isActionsOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-1.5 shadow-xl z-30 transition-all animate-in fade-in zoom-in-95 duration-150"
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
                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="h-7 w-7 rounded-md bg-[#EFF6FF] border border-blue-200/80 flex items-center justify-center shrink-0 text-[#2563EB] transition-colors">
                      <RefreshCw
                        className={`h-3.5 w-3.5 text-[#2563EB] ${
                          isSyncingToEmployees ? "animate-spin" : ""
                        }`}
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-[#0F172A]">
                        {isSyncingToEmployees ? "Memperbarui..." : "Update ke Employee"}
                      </span>
                      <span className="text-[10.5px] text-[#64748B] leading-tight">
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
                        ? "bg-[#EFF6FF] text-[#2563EB]"
                        : "text-[#0F172A] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <div className="h-7 w-7 rounded-md border border-blue-200/80 bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#0F172A]">
                          {isEditTemplateMode ? "Keluar Edit Template" : "Edit Template"}
                        </span>
                        {isEditTemplateMode && (
                          <span className="text-[9.5px] font-semibold uppercase bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] px-1.5 py-0.2 rounded">
                            Aktif
                          </span>
                        )}
                      </div>
                      <span className="text-[10.5px] text-[#64748B] leading-tight">
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
                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition text-left cursor-pointer group mt-0.5"
                >
                  <div className="h-7 w-7 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center shrink-0 text-[#64748B] transition-colors">
                    <Eye className="h-3.5 w-3.5 text-[#64748B]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[#0F172A]">Preview Template</span>
                    <span className="text-[10.5px] text-[#64748B] leading-tight">
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
                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition text-left cursor-pointer group mt-0.5"
                  >
                    <div className="h-7 w-7 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center shrink-0 text-[#64748B] transition-colors">
                      <Download className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-[#0F172A]">
                        Download Excel
                      </span>
                      <span className="text-[10.5px] text-[#64748B] leading-tight">
                        Unduh format template &amp; input actual bulanan
                      </span>
                    </div>
                  </button>
                )}

                {/* Divider */}
                <div className="my-1 border-t border-[#E2E8F0]" />

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
                      : "text-[#0F172A] hover:bg-[#F8FAFC]"
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
                        ? "bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]"
                        : "bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]"
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#0F172A]">
                        {isActive ? "Publish Ulang Template" : "Publish Template"}
                      </span>
                      {isValidToPublish && (
                        <span className="text-[9.5px] font-semibold text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0] px-1.5 py-0.2 rounded">
                          Siap
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] text-[#64748B] leading-tight">
                      {!isValidToPublish
                        ? `Perlu validasi bobot ${templateTargetPct}%`
                        : "Aktifkan template untuk penilaian"}
                    </span>
                  </div>
                </button>

                {/* 5. Ubah Info Template (jika onEditInfo tersedia) */}
                {onEditInfo && (
                  <>
                    <div className="my-1 border-t border-[#E2E8F0]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsOpen(false);
                        onEditInfo();
                      }}
                      className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition text-left cursor-pointer group mt-0.5"
                    >
                      <div className="h-7 w-7 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center shrink-0 text-[#64748B] transition-colors">
                        <Settings className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[#0F172A]">Ubah Info Template</span>
                        <span className="text-[10.5px] text-[#64748B] leading-tight">
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
    </div>
  );
}
