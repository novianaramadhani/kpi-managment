"use client";

import React, { useState, useMemo, useTransition } from "react";
import Swal from "sweetalert2";
import type {
  Appraisal,
  Department,
  Employee,
  JobLevel,
  KpiPeriod,
  KpiTemplate,
} from "@/db/schema";
import { Badge } from "./ui";

interface TemplateAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: KpiTemplate | null;
  departments: Department[];
  jobLevels: JobLevel[];
  employees: Employee[];
  activePeriod?: KpiPeriod;
  existingAppraisals?: Appraisal[];
  assignAction: (fd: FormData) => Promise<void>;
}

export function TemplateAssignModal({
  isOpen,
  onClose,
  template,
  departments,
  jobLevels,
  employees,
  activePeriod,
  existingAppraisals = [],
  assignAction,
}: TemplateAssignModalProps) {
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyDept, setOnlyDept] = useState(true);
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);

  // Lookup maps
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const levelMap = useMemo(() => new Map(jobLevels.map((l) => [l.id, l])), [jobLevels]);
  const appraisalEmpMap = useMemo(
    () => new Map(existingAppraisals.map((a) => [a.employeeId, a])),
    [existingAppraisals]
  );

  const currentDept = template ? deptMap.get(template.departmentId) : undefined;
  const currentLvl = template ? levelMap.get(template.jobLevelId) : undefined;

  // Filter Karyawan: PRIORITAS UTAMA adalah karyawan sesuai Departemen Template
  const filteredEmployees = useMemo(() => {
    if (!template) return [];

    let list = employees.filter((e) => e.isActive);

    // Filter departemen template
    if (onlyDept) {
      list = list.filter((e) => e.departmentId === template.departmentId);
    }

    // Filter pencarian
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.nik.toLowerCase().includes(q) ||
          e.jobPosition.toLowerCase().includes(q)
      );
    }

    return list;
  }, [template, employees, onlyDept, searchQuery]);

  if (!isOpen || !template) return null;

  const totalInDept = employees.filter(
    (e) => e.isActive && e.departmentId === template.departmentId
  ).length;

  const handleToggleSelectAll = () => {
    if (selectedEmpIds.length === filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(filteredEmployees.map((e) => e.id));
    }
  };

  const handleToggleEmp = (id: number) => {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeriod) {
      void Swal.fire({
        icon: "error",
        title: "Periode Tidak Ditemukan",
        text: "Tidak ada periode KPI yang sedang aktif di sistem.",
      });
      return;
    }

    if (selectedEmpIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Silakan pilih minimal satu karyawan untuk ditugaskan template ini.",
      });
      return;
    }

    const fd = new FormData();
    fd.append("templateId", String(template.id));
    fd.append("periodId", String(activePeriod.id));
    fd.append("employeeIds", JSON.stringify(selectedEmpIds));

    startTransition(async () => {
      let remaining = 4;
      const timer = setInterval(() => {
        remaining -= 1;
        const el = document.getElementById("swal-countdown-assign");
        if (el) {
          el.textContent = `${Math.max(1, remaining)} detik`;
        }
      }, 1000);

      void Swal.fire({
        title: "Menugaskan Template KPI...",
        html: `
          <div style="font-size: 13px; color: #475569; margin-top: 6px; text-align: center;">
            <p>Menerapkan <b>${template.name}</b> ke <b>${selectedEmpIds.length} karyawan</b>...</p>
            <div style="margin: 14px auto; padding: 8px 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #0284c7; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
              <span>Estimasi proses:</span>
              <span id="swal-countdown-assign" style="font-family: monospace; font-size: 13px; font-weight: 800; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">3–5 detik</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Menyiapkan formulir dan menyalin parameter indikator kinerja.</p>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        await assignAction(fd);
        clearInterval(timer);
        Swal.close();
        void Swal.fire({
          icon: "success",
          title: "Berhasil Ditugaskan!",
          text: `Template berhasil diterapkan kepada ${selectedEmpIds.length} karyawan. Formulir penilaian telah siap di menu Input KPI.`,
          confirmButtonColor: "#10b981",
        });
        setSelectedEmpIds([]);
        onClose();
      } catch (err: unknown) {
        clearInterval(timer);
        Swal.close();
        void Swal.fire({
          icon: "error",
          title: "Gagal Menugaskan",
          text: err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data.",
          confirmButtonColor: "#ef4444",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* HEADER */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </span>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Tugaskan Template ke Karyawan
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Pilih karyawan yang akan menggunakan parameter penilaian dari master template ini.
            </p>

            {/* Badges info template */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-slate-400 font-normal">Template:</span>
                {template.name}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <span className="text-emerald-500 font-normal">Dept:</span>
                {currentDept?.name ?? "Umum"}
              </span>
              {activePeriod && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  <span className="text-blue-500 font-normal">Periode:</span>
                  {activePeriod.name}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Tutup"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Department Filter Banner */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>
                Menampilkan karyawan Departemen <b>{currentDept?.name ?? "Terkait"}</b> ({totalInDept} orang)
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 hover:text-slate-900 font-medium">
              <input
                type="checkbox"
                checked={onlyDept}
                onChange={(e) => setOnlyDept(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Hanya departemen ini</span>
            </label>
          </div>

          {/* Search & Select All Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, NIK, atau jabatan karyawan..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={filteredEmployees.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <input
                type="checkbox"
                readOnly
                checked={
                  filteredEmployees.length > 0 &&
                  selectedEmpIds.length === filteredEmployees.length
                }
                className="rounded border-slate-300 text-emerald-600 pointer-events-none"
              />
              <span>
                {selectedEmpIds.length === filteredEmployees.length && filteredEmployees.length > 0
                  ? "Batal Pilih Semua"
                  : `Pilih Semua (${filteredEmployees.length})`}
              </span>
            </button>
          </div>

          {/* TABEL DAFTAR KARYAWAN (TERPISAH NIK, NAMA, DEPARTEMEN, JOB LEVEL, JOB POSITION) */}
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    Tidak ada karyawan ditemukan
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {onlyDept
                      ? `Belum ada karyawan aktif yang terdaftar di Departemen ${currentDept?.name ?? "ini"}.`
                      : "Tidak ada data karyawan yang cocok dengan pencarian."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#0f172a] text-white shadow-xs">
                    <tr className="border-b border-slate-800">
                      <th className="w-10 px-3.5 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredEmployees.length > 0 &&
                            selectedEmpIds.length === filteredEmployees.length
                          }
                          onChange={handleToggleSelectAll}
                          className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          title="Pilih semua"
                        />
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300 whitespace-nowrap">
                        NIK
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300">
                        NAMA
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300">
                        DEPARTEMEN
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300 whitespace-nowrap">
                        JOB LEVEL
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300">
                        JOB POSITION
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-[11px] text-slate-300 text-right whitespace-nowrap">
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.map((emp) => {
                      const isChecked = selectedEmpIds.includes(emp.id);
                      const empLvl = levelMap.get(emp.jobLevelId);
                      const empDept = deptMap.get(emp.departmentId);
                      const app = appraisalEmpMap.get(emp.id);
                      const hasThisTemplate = app?.templateId === template.id;
                      const hasOtherTemplate = app && app.templateId !== template.id;

                      return (
                        <tr
                          key={emp.id}
                          onClick={() => handleToggleEmp(emp.id)}
                          className={`transition-colors cursor-pointer select-none hover:bg-slate-50/90 ${
                            isChecked ? "bg-emerald-50/50" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="w-10 px-3.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleEmp(emp.id)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>

                          {/* NIK */}
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {emp.nik}
                            </span>
                          </td>

                          {/* NAMA */}
                          <td className="px-3.5 py-2.5">
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{emp.name}</span>
                              {emp.operatingUnit && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {emp.operatingUnit}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* DEPARTEMEN */}
                          <td className="px-3.5 py-2.5">
                            <span className="text-xs font-medium text-slate-700">
                              {empDept?.name ?? "-"}
                            </span>
                          </td>

                          {/* JOB LEVEL */}
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <span>{empLvl?.name ?? "-"}</span>
                            </span>
                          </td>

                          {/* JOB POSITION */}
                          <td className="px-3.5 py-2.5">
                            <span className="text-xs font-medium text-slate-800">
                              {emp.jobPosition || "-"}
                            </span>
                          </td>

                          {/* STATUS */}
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                            {hasThisTemplate ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                                ✓ Sudah Terpasang
                              </span>
                            ) : hasOtherTemplate ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full"
                                title="Akan dialihkan ke template ini"
                              >
                                ⚠️ Ganti Template
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                Belum Ditugaskan
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 bg-slate-50">
          <div className="text-xs text-slate-600 font-medium">
            <span className="font-bold text-slate-900">{selectedEmpIds.length}</span> dari{" "}
            <span>{filteredEmployees.length}</span> karyawan dipilih
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedEmpIds.length === 0 || isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Tugaskan Template ({selectedEmpIds.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
