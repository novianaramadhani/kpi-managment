"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  UserCheck,
  Users,
  Building2,
  Briefcase,
} from "lucide-react";
import type {
  Department,
  JobLevel,
  KpiBand,
  KpiCategory,
  KpiParameter,
  KpiTemplate,
} from "@/db/schema";
import { Badge } from "./ui";

interface TemplateDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  template: KpiTemplate | null;
  department?: Department;
  jobLevel?: JobLevel;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
  onOpenAssignTemplate?: (template: KpiTemplate) => void;
  onOpenAssignAssessor?: (template: KpiTemplate) => void;
}

export function TemplateDetailDrawer({
  isOpen,
  onClose,
  template,
  department,
  jobLevel,
  categories,
  parameters,
  bands,
  onOpenAssignTemplate,
  onOpenAssignAssessor,
}: TemplateDetailDrawerProps) {
  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Categories belonging to this template
  const tplCategories = React.useMemo(() => {
    if (!template) return [];
    return categories
      .filter((c) => c.templateId === template.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }, [template, categories]);

  const tplCategoryIds = React.useMemo(
    () => new Set(tplCategories.map((c) => c.id)),
    [tplCategories]
  );

  // Parameters / Indicators belonging to this template
  const tplParameters = React.useMemo(() => {
    return parameters.filter((p) => tplCategoryIds.has(p.categoryId));
  }, [parameters, tplCategoryIds]);

  // Accordion open/close state per Category
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({});

  // By default, open all categories when drawer opens
  useEffect(() => {
    if (isOpen && tplCategories.length > 0) {
      const allCat: Record<number, boolean> = {};
      tplCategories.forEach((c) => (allCat[c.id] = true));
      setOpenCategories(allCat);
    }
  }, [isOpen, template?.id]);

  const toggleCategory = (catId: number) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleExpandAllCategories = () => {
    const all: Record<number, boolean> = {};
    tplCategories.forEach((c) => (all[c.id] = true));
    setOpenCategories(all);
  };

  const handleCollapseAllCategories = () => {
    setOpenCategories({});
  };

  const areAllCategoriesOpen =
    tplCategories.length > 0 && tplCategories.every((c) => openCategories[c.id]);

  if (!isOpen || !template) return null;

  const totalCatWeight = tplCategories.reduce(
    (sum, c) => sum + Number(c.weight) * 100,
    0
  );
  const targetPct = Math.round(Number(template.totalWeight) * 100);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-4 sm:pl-8">
        <div className="w-screen max-w-3xl sm:max-w-4xl lg:max-w-5xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
          {/* Header: Matches Reference Screenshot */}
          <div className="px-6 sm:px-8 pt-5 pb-4 border-b border-slate-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              {/* Left Side: Title + Badges, and Metadata */}
              <div className="space-y-3 min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug break-words">
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

                {/* Metadata: Department • Job Level */}
                <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{department?.name ?? "Umum"}</span>
                    {department?.code && (
                      <span className="text-slate-400 font-normal">({department.code})</span>
                    )}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{jobLevel?.name ?? "Semua Level"}</span>
                    {jobLevel?.code && (
                      <span className="text-slate-400 font-normal">({jobLevel.code})</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Right Side: Action Buttons and Close Button */}
              <div className="flex items-start gap-4 shrink-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {onOpenAssignTemplate && (
                      <button
                        type="button"
                        onClick={() => onOpenAssignTemplate(template)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer"
                        title="Tugaskan template ini ke karyawan (NIK)"
                      >
                        <Users className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Assign Template</span>
                      </button>
                    )}

                    {onOpenAssignAssessor && (
                      <button
                        type="button"
                        onClick={() => onOpenAssignAssessor(template)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer"
                        title="Tentukan penilai untuk setiap parameter"
                      >
                        <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Assign Penilai</span>
                      </button>
                    )}
                  </div>

                  <Link
                    href={`/setup/templates/${template.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs cursor-pointer"
                    title="Edit konfigurasi parameter dan bobot template"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Edit Template</span>
                  </Link>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0 -mt-1 -mr-1"
                  title="Tutup (Esc)"
                  aria-label="Tutup drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* DRAWER BODY */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
            {/* STRUKTUR KPI (FLAT ACCORDION) */}
            <div className="space-y-2">
                {/* Header Controls */}
                {tplCategories.length > 0 && (
                  <div className="flex items-center justify-end pb-1">
                    <button
                      type="button"
                      onClick={
                        areAllCategoriesOpen
                          ? handleCollapseAllCategories
                          : handleExpandAllCategories
                      }
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                    >
                      {areAllCategoriesOpen ? "Tutup Semua" : "Buka Semua"}
                    </button>
                  </div>
                )}

                {/* Empty State */}
                {tplCategories.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Template belum memiliki parameter.
                  </div>
                )}

                {/* Flat Accordion List with Thin Dividers */}
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {tplCategories.map((cat, catIdx) => {
                    const isOpenCat = Boolean(openCategories[cat.id]);
                    const catWeightPct = Math.round(Number(cat.weight) * 100);
                    const catParams = tplParameters
                      .filter((p) => p.categoryId === cat.id)
                      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

                    return (
                      <div key={cat.id} className="py-0.5">
                        {/* Parameter Header Row */}
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className="w-full flex items-center justify-between py-3 px-1 sm:px-2 text-left hover:bg-slate-50 transition cursor-pointer group"
                        >
                          <div className="flex items-baseline gap-2 min-w-0 pr-2">
                            <span className="text-sm font-bold text-slate-500 font-mono shrink-0">
                              {catIdx + 1}.
                            </span>
                            <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                              {cat.name.replace(/^faktor\s+kinerja.*$/i, "Target Kerja")}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 ml-3">
                            <span className="text-xs sm:text-sm font-bold text-slate-700">
                              {catWeightPct}%
                            </span>
                            <div className="text-slate-400 group-hover:text-slate-600 transition-colors">
                              {isOpenCat ? (
                                <ChevronDown className="w-4 h-4 transition-transform duration-150" />
                              ) : (
                                <ChevronRight className="w-4 h-4 transition-transform duration-150" />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Indicators Flat List */}
                        {isOpenCat && (
                          <div className="divide-y divide-slate-100 border-t border-slate-100 pl-3 sm:pl-4 pr-1 sm:pr-2">
                            {catParams.length === 0 ? (
                              <div className="py-2.5 text-xs text-slate-400 italic">
                                Belum ada indikator di dalam parameter ini.
                              </div>
                            ) : (
                              catParams.map((param, paramIdx) => {
                                const paramWeightPct = Math.round(Number(param.weight) * 100);

                                return (
                                  <div
                                    key={param.id}
                                    className="flex items-center justify-between py-2 sm:py-2.5 gap-3"
                                  >
                                    <div className="flex items-baseline gap-2 min-w-0">
                                      <span className="text-xs sm:text-sm font-semibold text-slate-400 font-mono shrink-0">
                                        {catIdx + 1}.{paramIdx + 1}
                                      </span>
                                      <span className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                                        {param.name}
                                      </span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-semibold text-slate-600 shrink-0 ml-3">
                                      {paramWeightPct}%
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          {/* Footer Info */}
          <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Template pusat HR · Terakhir diubah{" "}
              {new Date(template.updatedAt).toLocaleDateString("id-ID")}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
