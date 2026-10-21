"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import Swal from "sweetalert2";
import { btnPrimary, btnSecondary, inputCls } from "./ui";
import type { Department, Employee, JobLevel } from "@/db/schema";

// =========================================================================
// 1. MODAL TAMBAH PERIODE KPI
// =========================================================================

interface PeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: (fd: FormData) => Promise<void>;
}

export function PeriodModal({ isOpen, onClose, action }: PeriodModalProps) {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const [name, setName] = useState(`KPI Tahun ${nextYear}`);
  const [year, setYear] = useState(String(nextYear));
  const [startDate, setStartDate] = useState(`${nextYear}-01-01`);
  const [endDate, setEndDate] = useState(`${nextYear}-12-31`);
  const [evaluationDate, setEvaluationDate] = useState(`${nextYear}-12-31`);
  const [inputStartMonth, setInputStartMonth] = useState("11");
  const [cutoffMonth, setCutoffMonth] = useState("12");
  const [minTenureMonths, setMinTenureMonths] = useState("6");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE");
  const [isPending, startTransition] = useTransition();

  // Reset or initialize when opened
  useEffect(() => {
    if (isOpen) {
      const y = new Date().getFullYear() + 1;
      setName(`KPI Tahun ${y}`);
      setYear(String(y));
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
      setEvaluationDate(`${y}-12-31`);
      setInputStartMonth("11");
      setCutoffMonth("12");
      setMinTenureMonths("6");
      setStatus("ACTIVE");
    }
  }, [isOpen]);

  // Sync dates when year changes
  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    const numY = parseInt(newYear, 10);
    if (!isNaN(numY) && numY > 2000 && numY < 2100) {
      setName(`KPI Tahun ${numY}`);
      setStartDate(`${numY}-01-01`);
      setEndDate(`${numY}-12-31`);
      setEvaluationDate(`${numY}-12-31`);
    }
  };

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Periode Wajib Diisi",
        text: "Silakan masukkan nama periode KPI (misal: KPI Tahun 2026).",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const numYear = parseInt(year, 10);
    if (isNaN(numYear) || numYear < 2000 || numYear > 2100) {
      void Swal.fire({
        icon: "warning",
        title: "Tahun Tidak Valid",
        text: "Silakan masukkan tahun yang valid (contoh: 2026).",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("year", year);
    fd.append("startDate", startDate);
    fd.append("endDate", endDate);
    fd.append("evaluationDate", evaluationDate);
    fd.append("inputStartMonth", inputStartMonth);
    fd.append("cutoffMonth", cutoffMonth);
    fd.append("minTenureMonths", minTenureMonths);
    fd.append("status", status);

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Periode KPI Dibuat!",
          text: `Periode "${name}" berhasil ditambahkan.`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal membuat periode.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Buat Periode KPI Baru</h2>
              <p className="text-xs text-slate-600">Jadwal evaluasi tahunan, batas penilaian, dan syarat eligibilitas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-6 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Periode <span className="text-rose-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: KPI Tahun 2026"
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tahun <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => handleYearChange(e.target.value)}
                min={2020}
                max={2050}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status Awal
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "ACTIVE" | "DRAFT")}
                className={inputCls}
              >
                <option value="ACTIVE">ACTIVE (Aktif Dibuka)</option>
                <option value="DRAFT">DRAFT (Persiapan)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tgl Mulai Periode</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tgl Selesai Periode</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tgl Evaluasi Akhir</label>
              <input
                type="date"
                value={evaluationDate}
                onChange={(e) => setEvaluationDate(e.target.value)}
                required
                className={inputCls}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Jendela Input & Batas Eligibilitas
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mulai Input (Bln)
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={inputStartMonth}
                  onChange={(e) => setInputStartMonth(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-slate-500">Bln 11 = November</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cut-off Input (Bln)
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={cutoffMonth}
                  onChange={(e) => setCutoffMonth(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-slate-500">Bln 12 = Desember</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Min. Masa Kerja (Bln)
                </label>
                <input
                  type="number"
                  min={0}
                  max={36}
                  value={minTenureMonths}
                  onChange={(e) => setMinTenureMonths(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-slate-500">Syarat ikut penilaian</p>
              </div>
            </div>
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={btnSecondary}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Menyimpan...
                </>
              ) : (
                "+ Buat Periode"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// 2. MODAL TAMBAH DEPARTEMEN
// =========================================================================

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: (fd: FormData) => Promise<void>;
  createAction?: (fd: FormData) => Promise<void>;
  updateAction?: (fd: FormData) => Promise<void>;
  initialDepartment?: Department | null;
  employees?: Employee[];
}

export function DepartmentModal({
  isOpen,
  onClose,
  action,
  createAction,
  updateAction,
  initialDepartment,
}: DepartmentModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(initialDepartment?.id);

  useEffect(() => {
    if (isOpen) {
      if (initialDepartment) {
        setCode(initialDepartment.code || "");
        setName(initialDepartment.name || "");
      } else {
        setCode("");
        setName("");
      }
    }
  }, [isOpen, initialDepartment]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Data Belum Lengkap",
        text: "Kode dan Nama Departemen wajib diisi!",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    if (initialDepartment?.id) {
      fd.append("id", String(initialDepartment.id));
    }
    fd.append("code", code.trim().toUpperCase());
    fd.append("name", name.trim());

    startTransition(async () => {
      try {
        if (isEdit && updateAction) {
          await updateAction(fd);
          await Swal.fire({
            icon: "success",
            title: "Perubahan Disimpan!",
            text: `Departemen ${name.trim()} (${code.trim().toUpperCase()}) berhasil diperbarui.`,
            confirmButtonColor: "#0284c7",
            timer: 1800,
            timerProgressBar: true,
          });
        } else {
          const act = createAction || action;
          if (act) await act(fd);
          await Swal.fire({
            icon: "success",
            title: "Departemen Tersimpan!",
            text: `Departemen ${name.trim()} (${code.trim().toUpperCase()}) berhasil dibuat.`,
            confirmButtonColor: "#0284c7",
            timer: 1800,
            timerProgressBar: true,
          });
        }
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan departemen.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isEdit ? "Edit Departemen" : "Tambah Departemen Baru"}
              </h2>
              <p className="text-xs text-slate-600">
                {isEdit
                  ? "Perbarui kode atau nama departemen."
                  : "Daftarkan kode dan nama departemen baru."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kode Departemen <span className="text-rose-500">*</span>
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Contoh: HSE"
              required
              maxLength={20}
              className={`${inputCls} font-mono font-semibold uppercase`}
            />
            <p className="mt-1 text-[11px] text-slate-400">Kode unik singkatan departemen.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Departemen <span className="text-rose-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Health Safety & Environment"
              required
              className={inputCls}
            />
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={btnSecondary}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {isPending
                ? "Menyimpan..."
                : isEdit
                ? "Simpan Perubahan"
                : "+ Simpan Departemen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// 3. MODAL TAMBAH JOB LEVEL
// =========================================================================

interface JobLevelModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: (fd: FormData) => Promise<void>;
}

export function JobLevelModal({ isOpen, onClose, action }: JobLevelModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      setCode("");
      setName("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Data Belum Lengkap",
        text: "Kode dan Nama Job Level wajib diisi!",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    fd.append("rank", "0");
    fd.append("code", code.trim().toUpperCase());
    fd.append("name", name.trim());

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Job Level Tersimpan!",
          text: `Job Level "${name.trim()}" (${code.trim().toUpperCase()}) berhasil disimpan.`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan job level.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tambah Job Level</h2>
              <p className="text-xs text-slate-600">Daftarkan kode dan nama tingkatan job level.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kode Level <span className="text-rose-500">*</span>
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Contoh: NON_STAFF, STAFF, SPV, SUPT, MGR"
              required
              maxLength={10}
              className={`${inputCls} font-mono font-semibold uppercase`}
            />
            <p className="mt-1 text-[11px] text-slate-400">Kode unik singkatan level (misal: NON_STAFF, STAFF, SPV, MGR).</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Job Level <span className="text-rose-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Non Staff, Staff, Supervisor, Manager"
              required
              className={inputCls}
            />
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={btnSecondary}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0369a1] active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Menyimpan..." : "+ Simpan Job Level"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OperatingUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, editingId?: string | null) => void;
  initialUnit?: { id: string; name: string } | null;
}

export function OperatingUnitModal({
  isOpen,
  onClose,
  onSave,
  initialUnit,
}: OperatingUnitModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(initialUnit ? initialUnit.name : "");
    }
  }, [isOpen, initialUnit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Unit Kosong",
        text: "Silakan isi nama operating unit.",
      });
      return;
    }
    onSave(name.trim().toUpperCase(), initialUnit?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">
            {initialUnit ? "Edit Operating Unit" : "Tambah Operating Unit"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Operating Unit <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Site GAM, Site AKP, atau HO"
              required
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 uppercase transition"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              Unit kerja operasional untuk alokasi penempatan karyawan (Site / Head Office).
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            >
              {initialUnit ? "Simpan Perubahan" : "+ Tambah Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// 5. MODAL TAMBAH / EDIT JOB POSITION (JABATAN)
// =========================================================================

interface JobPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  jobLevels: JobLevel[];
  createAction: (fd: FormData) => Promise<void>;
  updateAction?: (fd: FormData) => Promise<void>;
  initialPosition?: {
    id: number;
    code: string | null;
    name: string;
    departmentId: number | null;
    jobLevelId: number | null;
    description: string | null;
    isActive: boolean;
  } | null;
}

export function JobPositionModal({
  isOpen,
  onClose,
  departments,
  jobLevels,
  createAction,
  updateAction,
  initialPosition,
}: JobPositionModalProps) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [jobLevelId, setJobLevelId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      if (initialPosition) {
        setName(initialPosition.name || "");
        setDepartmentId(initialPosition.departmentId ? String(initialPosition.departmentId) : "");
        setJobLevelId(initialPosition.jobLevelId ? String(initialPosition.jobLevelId) : "");
      } else {
        setName("");
        setDepartmentId("");
        setJobLevelId("");
      }
    }
  }, [isOpen, initialPosition]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Job Position Wajib Diisi",
        text: "Silakan masukkan nama Job Position.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }
    if (!departmentId) {
      void Swal.fire({
        icon: "warning",
        title: "Departemen Wajib Dipilih",
        text: "Silakan pilih departemen untuk job position ini.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }
    if (!jobLevelId) {
      void Swal.fire({
        icon: "warning",
        title: "Job Level Wajib Dipilih",
        text: "Silakan pilih tingkatan job level untuk job position ini.",
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    if (initialPosition?.id) {
      fd.append("id", String(initialPosition.id));
      if (initialPosition.code) {
        fd.append("code", initialPosition.code);
      }
    }
    fd.append("name", name.trim());
    fd.append("departmentId", departmentId);
    fd.append("jobLevelId", jobLevelId);
    fd.append("isActive", "true");

    startTransition(async () => {
      try {
        if (initialPosition && updateAction) {
          await updateAction(fd);
        } else {
          await createAction(fd);
        }
        await Swal.fire({
          icon: "success",
          title: initialPosition ? "Job Position Diperbarui!" : "Job Position Ditambahkan!",
          text: `Job Position "${name}" berhasil disimpan.`,
          confirmButtonColor: "#0284c7",
          timer: 1600,
          timerProgressBar: true,
        });
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan job position.";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  const selectedDept = departments.find((d) => String(d.id) === String(departmentId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {initialPosition ? "Edit Job Position" : "Tambah Job Position"}
              </h2>
              <p className="text-xs text-slate-500">Definisikan nama posisi, departemen, dan level kepangkatan.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Kode Job Position: Otomatis berdasarkan departemen */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                Kode Job Position
              </label>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                Otomatis
              </span>
            </div>
            <input
              type="text"
              value={
                initialPosition && String(initialPosition.departmentId) === String(departmentId)
                  ? initialPosition.code || `${selectedDept ? selectedDept.code : "..."}-[Otomatis]`
                  : selectedDept
                  ? `${selectedDept.code}-[Otomatis]`
                  : "[Pilih Departemen Terlebih Dahulu]"
              }
              readOnly
              disabled
              className={`${inputCls} font-mono font-bold uppercase bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed`}
            />
            {initialPosition && departmentId && String(initialPosition.departmentId) !== String(departmentId) ? (
              <p className="text-[11px] text-amber-600 mt-1">
                Departemen diubah: kode jabatan akan diperbarui otomatis ke format departemen baru ({selectedDept?.code}-[Nomor]) tanpa merusak relasi karyawan.
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                Format: [Kode Departemen]-[Nomor Urut] berurutan per departemen (contoh: {selectedDept ? `${selectedDept.code}-001` : "HRGA-001"}).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Job Position <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Supervisor Logistik, Staff Payroll, dll"
              required
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Departemen <span className="text-rose-500">*</span>
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              required
              className={inputCls}
            >
              <option value="">-- Pilih Departemen --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Job Level <span className="text-rose-500">*</span>
            </label>
            <select
              value={jobLevelId}
              onChange={(e) => setJobLevelId(e.target.value)}
              required
              className={inputCls}
            >
              <option value="">-- Pilih Job Level --</option>
              {jobLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={btnSecondary}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {isPending
                ? "Menyimpan..."
                : initialPosition
                ? "Simpan Perubahan"
                : "+ Simpan Job Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
