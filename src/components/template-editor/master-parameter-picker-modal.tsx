"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Building2,
  Globe2,
  X,
  BookOpen,
  Plus,
} from "lucide-react";
import type { MasterParamItem } from "@/lib/excel-template-kpi";

interface MasterParameterPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentId?: number | null;
  departmentName?: string;
  masterParameters: MasterParamItem[];
  onSelect: (param: MasterParamItem) => void;
  canApplyAll?: boolean;
  onApplyAllDept?: () => void;
}

export function MasterParameterPickerModal({
  isOpen,
  onClose,
  departmentId,
  departmentName,
  masterParameters,
  onSelect,
  canApplyAll,
  onApplyAllDept,
}: MasterParameterPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"ALL" | "DEPT" | "GENERAL">("ALL");

  // Filter relevant parameters: General (null) OR template's department
  const relevantParams = useMemo(() => {
    return masterParameters.filter((p) => {
      // Must be either General OR matching template dept
      const isGeneral = !p.departmentId;
      const isMyDept = departmentId && p.departmentId === departmentId;

      if (!isGeneral && !isMyDept) return false;

      // Filter tab
      if (selectedFilter === "DEPT" && isGeneral) return false;
      if (selectedFilter === "GENERAL" && !isGeneral) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchCode = (p.code || "").toLowerCase().includes(q);
        const matchDesc = (p.description || "").toLowerCase().includes(q);
        const matchCat = (p.categoryName || "").toLowerCase().includes(q);
        return matchName || matchCode || matchDesc || matchCat;
      }

      return true;
    });
  }, [masterParameters, departmentId, selectedFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-xs">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pilih dari Kamus Master Parameter</h3>
              <p className="text-[11px] text-slate-500">
                Pilih indikator standar untuk langsung diterapkan ke template ini.
                {departmentName && (
                  <span className="ml-1 text-slate-700 font-semibold">
                    (Departemen: {departmentName})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari indikator, kode, atau target..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSelectedFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua ({relevantParams.length})
            </button>
            {departmentId && (
              <button
                type="button"
                onClick={() => setSelectedFilter("DEPT")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedFilter === "DEPT"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{departmentName || "Departemen"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedFilter("GENERAL")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedFilter === "GENERAL"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Umum / Corporate</span>
            </button>
          </div>
        </div>

        {/* Indicators List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {relevantParams.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada indikator yang cocok</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Coba ubah kata kunci pencarian atau buat indikator baru secara manual.
              </p>
            </div>
          ) : (
            relevantParams.map((p) => {
              const isGeneral = !p.departmentId;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelect(p);
                    onClose();
                  }}
                  className="group flex items-center justify-between gap-3 rounded-xl p-3 bg-white hover:bg-slate-50/80 transition border border-slate-200/80 hover:border-indigo-200 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                        {p.code || `MP-${String(p.id).padStart(3, "0")}`}
                      </span>

                      {isGeneral ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          <Globe2 className="h-2.5 w-2.5" />
                          <span>General</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          <Building2 className="h-2.5 w-2.5" />
                          <span>{p.departmentName || "Departemen"}</span>
                        </span>
                      )}

                      {p.categoryName && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          • {p.categoryName}
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-slate-800 text-xs">{p.name}</div>
                    {p.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{p.description}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(p);
                      onClose();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
                    title="Pilih indikator ini"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>{relevantParams.length} indikator relevan</span>
          <div className="flex items-center gap-2">
            {canApplyAll && onApplyAllDept && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onApplyAllDept();
                }}
                className="rounded-lg px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-2xs"
              >
                Terapkan Seluruh Kamus {departmentName}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-200 font-medium transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
