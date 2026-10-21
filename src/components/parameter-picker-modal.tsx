"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  X,
  Check,
  Plus,
  Loader2,
  Building2,
  Globe,
  Tag,
  AlertCircle,
} from "lucide-react";
import type { MasterParamItem } from "@/lib/excel-template-kpi";

interface ParameterPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetParamName: string;
  targetCategoryName: string;
  targetUnit?: string;
  currentMasterParameterId: number | null;
  masterParameters: MasterParamItem[];
  departmentId: number | "";
  departmentName?: string;
  onSelectParameter: (masterParameterId: number) => void;
  onCreateNewParameter?: () => Promise<void> | void;
  isCreatingNew?: boolean;
}

type ScopeFilter = "ALL" | "DEPT" | "CORP";

export function ParameterPickerModal({
  isOpen,
  onClose,
  targetParamName,
  targetCategoryName,
  targetUnit,
  currentMasterParameterId,
  masterParameters,
  departmentId,
  departmentName,
  onSelectParameter,
  onCreateNewParameter,
  isCreatingNew = false,
}: ParameterPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset filter dan fokus ke input saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setScopeFilter("ALL");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Listener tombol ESC untuk menutup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isCreatingNew) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isCreatingNew, onClose]);

  const currentDeptId = departmentId ? Number(departmentId) : null;

  // Hitung jumlah item berdasarkan cakupan
  const { deptParamsCount, corpParamsCount } = useMemo(() => {
    let deptCount = 0;
    let corpCount = 0;
    for (const mp of masterParameters) {
      if (currentDeptId && mp.departmentId === currentDeptId) {
        deptCount++;
      } else if (!mp.departmentId) {
        corpCount++;
      }
    }
    return { deptParamsCount: deptCount, corpParamsCount: corpCount };
  }, [masterParameters, currentDeptId]);

  // Filter daftar parameter
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return masterParameters.filter((mp) => {
      // Filter cakupan departemen vs umum
      if (scopeFilter === "DEPT") {
        if (!currentDeptId || mp.departmentId !== currentDeptId) return false;
      } else if (scopeFilter === "CORP") {
        if (mp.departmentId !== null && mp.departmentId !== undefined) return false;
      }

      // Filter query pencarian
      if (q) {
        const matchName = mp.name.toLowerCase().includes(q);
        const matchCode = mp.code?.toLowerCase().includes(q);
        const matchCat = mp.categoryName?.toLowerCase().includes(q);
        const matchDesc = mp.description?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat && !matchDesc) return false;
      }

      return true;
    });
  }, [masterParameters, scopeFilter, searchQuery, currentDeptId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="parameter-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      {/* Backdrop click */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isCreatingNew) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="parameter-picker-title" className="text-sm font-bold text-slate-900">
              Pilih Kamus Parameter
            </h2>
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
              <span>Indikator:</span>
              <span className="font-semibold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {targetParamName}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500">Kategori: {targetCategoryName}</span>
              {targetUnit && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    Satuan: {targetUnit}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isCreatingNew}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer disabled:opacity-50"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Scope Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama parameter, kode, atau kategori..."
              className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scope Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setScopeFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                scopeFilter === "ALL"
                  ? "bg-slate-800 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua ({masterParameters.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("DEPT")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                scopeFilter === "DEPT"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200"
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>
                {departmentName ? `Departemen (${deptParamsCount})` : `Departemen (${deptParamsCount})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("CORP")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                scopeFilter === "CORP"
                  ? "bg-emerald-700 text-white shadow-2xs"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Umum / Corporate ({corpParamsCount})</span>
            </button>
          </div>
        </div>

        {/* Master Parameter List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredList.length === 0 ? (
            <div className="text-center py-10 px-4">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                Tidak ada parameter yang cocok
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                Coba sesuaikan kata kunci pencarian atau daftarkan indikator ini sebagai parameter baru di Kamus Parameter.
              </p>
            </div>
          ) : (
            filteredList.map((mp) => {
              const isSelected = currentMasterParameterId === mp.id;
              const isDept = Boolean(mp.departmentId);

              return (
                <div
                  key={mp.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50/50 shadow-2xs"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{mp.name}</span>
                      {mp.code && (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                          {mp.code}
                        </span>
                      )}
                      {isDept ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                          <Building2 className="w-2.5 h-2.5" />
                          <span>{mp.departmentName || "Departemen"}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Umum</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {mp.categoryName && (
                        <span className="inline-flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{mp.categoryName}</span>
                        </span>
                      )}
                      {mp.unit && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-[10px]">Satuan: {mp.unit}</span>
                        </>
                      )}
                      {mp.description && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="truncate max-w-xs">{mp.description}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 shadow-2xs">
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Terpilih</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectParameter(mp.id);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition shadow-2xs cursor-pointer"
                      >
                        <span>Pilih</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer & Quick Register Action */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2.5">
          {onCreateNewParameter ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Belum terdaftar di Kamus?</span>
              <button
                type="button"
                onClick={async () => {
                  await onCreateNewParameter();
                  onClose();
                }}
                disabled={isCreatingNew}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer disabled:opacity-50"
              >
                {isCreatingNew ? (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                <span>Daftarkan Sebagai Baru</span>
              </button>
            </div>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={isCreatingNew}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs disabled:opacity-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
