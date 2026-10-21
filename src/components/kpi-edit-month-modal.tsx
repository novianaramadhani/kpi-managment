"use client";

import React, { useState, useEffect, useRef } from "react";

export interface EditMonthData {
  employeeName: string;
  parameterName: string; // Parameter group name e.g. Target Kerja
  kpiId: string | number;
  kpiName: string;
  monthIndex: number; // 0..11
  monthName: string; // e.g. Januari
  year: number; // e.g. 2025
  target: number | string | null;
  currentActual: number | null;
  unit: string;
  note: string;
  attachmentName?: string | null;
}

interface KpiEditMonthModalProps {
  isOpen: boolean;
  data: EditMonthData | null;
  onClose: () => void;
  onSave: (payload: {
    kpiId: string | number;
    monthIndex: number;
    actual: number | null;
    note: string;
    attachmentName?: string | null;
  }) => void;
  isLocked?: boolean;
}

export function KpiEditMonthModal({
  isOpen,
  data,
  onClose,
  onSave,
  isLocked = false,
}: KpiEditMonthModalProps) {
  const [actualInput, setActualInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      setActualInput(data.currentActual !== null && data.currentActual !== undefined ? String(data.currentActual) : "");
      setNoteInput(data.note || "");
      setAttachmentName(data.attachmentName || "");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [data]);

  if (!isOpen || !data) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setTimeout(() => {
      setAttachmentName(file.name);
      setIsUploading(false);
    }, 400);
  };

  const handleRemoveAttachment = () => {
    setAttachmentName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    const trimmed = actualInput.trim();
    const parsedActual = trimmed === "" ? null : parseFloat(trimmed.replace(/,/g, ""));

    onSave({
      kpiId: data.kpiId,
      monthIndex: data.monthIndex,
      actual: parsedActual !== null && !isNaN(parsedActual) ? parsedActual : null,
      note: noteInput.trim(),
      attachmentName: attachmentName || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Form Input Realisasi
            </span>
            <h3 className="font-extrabold text-base tracking-wide text-white">
              EDIT REALISASI KPI
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Read-Only Context Info Grid */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 font-semibold block uppercase text-[10px] tracking-wider">
                Employee
              </span>
              <span className="font-bold text-slate-800 text-sm">{data.employeeName}</span>
            </div>

            <div>
              <span className="text-slate-500 font-semibold block uppercase text-[10px] tracking-wider">
                Periode
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {data.monthName} {data.year}
              </span>
            </div>

            <div>
              <span className="text-slate-500 font-semibold block uppercase text-[10px] tracking-wider">
                Parameter Group
              </span>
              <span className="font-semibold text-slate-700">{data.parameterName}</span>
            </div>

            <div>
              <span className="text-slate-500 font-semibold block uppercase text-[10px] tracking-wider">
                Target
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {data.target !== null && data.target !== undefined ? data.target : "-"}
                {data.unit && data.unit !== "%" ? ` ${data.unit}` : data.unit || ""}
              </span>
            </div>

            <div className="col-span-2 pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-semibold block uppercase text-[10px] tracking-wider">
                KPI / Indikator
              </span>
              <span className="font-extrabold text-slate-900 text-sm block">
                {data.kpiName}
              </span>
            </div>
          </div>

          {/* Realisasi Input Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Nilai Realisasi Aktual <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="number"
                step="any"
                disabled={isLocked}
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold font-mono text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition shadow-2xs"
              />
              {data.unit && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 pointer-events-none">
                  Satuan: {data.unit}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Masukkan angka realisasi aktual yang tercapai pada bulan {data.monthName}.
            </p>
          </div>

          {/* Catatan Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Catatan Evaluasi / Keterangan (Opsional)
            </label>
            <textarea
              rows={2}
              disabled={isLocked}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Contoh: Pencatatan harian shift pagi berjalan lancar tanpa deviasi..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition shadow-2xs resize-none"
            />
          </div>

          {/* Lampiran Upload Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Lampiran Bukti Dokumen (Evidence)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={isLocked || isUploading}
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png"
            />

            {attachmentName ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold text-emerald-900 truncate">
                    {attachmentName}
                  </span>
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={handleRemoveAttachment}
                    className="text-slate-400 hover:text-rose-600 p-1 text-xs font-bold transition cursor-pointer"
                    title="Hapus Lampiran"
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isLocked || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{isUploading ? "Mengunggah..." : "Upload Lampiran"}</span>
                </button>
                <span className="text-[11px] text-slate-400">PDF, Excel, JPG atau PNG</span>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLocked}
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs hover:shadow-sm transition cursor-pointer"
            >
              Simpan &amp; Hitung Ulang
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
