"use client";

import React, { useState, useTransition } from "react";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, KpiPeriod, KpiTemplate } from "@/db/schema";
import { btnPrimary, btnSecondary } from "./ui";

interface CreateAppraisalWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  departments: Department[];
  jobLevels: JobLevel[];
  templates: KpiTemplate[];
  period: KpiPeriod;
  createAction: (fd: FormData) => Promise<void>;
}

export function CreateAppraisalWizardModal({
  isOpen,
  onClose,
  employees,
  departments,
  jobLevels,
  templates,
  period,
  createAction,
}: CreateAppraisalWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedTplId, setSelectedTplId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const selectedEmp = employees.find((e) => String(e.id) === selectedEmpId);
  const empDept = departments.find((d) => d.id === selectedEmp?.departmentId);
  const empLevel = jobLevels.find((l) => l.id === selectedEmp?.jobLevelId);
  const appraiser = employees.find((e) => e.id === selectedEmp?.appraiserId);

  // Template Rekomendasi Otomatis berdasarkan Dept & Job Level
  const suggestedTemplate = selectedEmp
    ? templates.find(
        (t) => t.departmentId === selectedEmp.departmentId && t.jobLevelId === selectedEmp.jobLevelId
      ) ??
      templates.find((t) => t.departmentId === selectedEmp.departmentId) ??
      templates[0]
    : null;

  // Active chosen template
  const activeTemplate = selectedTplId
    ? templates.find((t) => String(t.id) === selectedTplId)
    : suggestedTemplate;

  const handleEmpSelect = (empId: string) => {
    setSelectedEmpId(empId);
    const emp = employees.find((e) => String(e.id) === empId);
    if (emp) {
      const matchTpl =
        templates.find(
          (t) => t.departmentId === emp.departmentId && t.jobLevelId === emp.jobLevelId
        ) ??
        templates.find((t) => t.departmentId === emp.departmentId) ??
        templates[0];
      if (matchTpl) {
        setSelectedTplId(String(matchTpl.id));
      }
    }
  };

  const handleNextToStep2 = () => {
    if (!selectedEmpId) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Silakan pilih karyawan terlebih dahulu.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }
    setStep(2);
  };

  const handleNextToStep3 = () => {
    if (!activeTemplate) {
      void Swal.fire({
        icon: "warning",
        title: "Template Belum Dipilih",
        text: "Silakan pilih template KPI untuk karyawan ini.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }
    setStep(3);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !activeTemplate) return;

    const fd = new FormData();
    fd.append("employeeId", selectedEmpId);
    fd.append("periodId", String(period.id));
    fd.append("templateId", String(activeTemplate.id));

    startTransition(async () => {
      let remaining = 4;
      const timer = setInterval(() => {
        remaining -= 1;
        const el = document.getElementById("swal-countdown-timer");
        if (el) {
          el.textContent = `${Math.max(1, remaining)} detik`;
        }
      }, 1000);

      void Swal.fire({
        title: "Menyiapkan Formulir KPI...",
        html: `
          <div style="font-size: 13px; color: #475569; margin-top: 6px; text-align: center;">
            <p>Menghubungkan template <b>${activeTemplate.name}</b> ke <b>${selectedEmp?.name ?? "Karyawan"}</b>...</p>
            <div style="margin: 14px auto; padding: 8px 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #0284c7; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
              <span>Estimasi waktu proses:</span>
              <span id="swal-countdown-timer" style="font-family: monospace; font-size: 13px; font-weight: 800; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">3–5 detik</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Sistem sedang menyalin parameter & indikator penilaian ke database.</p>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
        willClose: () => {
          clearInterval(timer);
        },
      });

      try {
        await createAction(fd);
        clearInterval(timer);
      } catch (err: unknown) {
        clearInterval(timer);
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
        ) {
          Swal.close();
          throw err;
        }
        const msg = err instanceof Error ? err.message : "Gagal membuat formulir penilaian";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER & STEPPER */}
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>📝</span>
              <span>Inisiasi Penilaian KPI Baru</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              ✕
            </button>
          </div>

          {/* Stepper Progress Bar */}
          <div className="mt-4 flex items-center justify-center gap-2 sm:gap-4 text-xs font-semibold">
            {/* Step 1 */}
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-emerald-800" : "text-slate-400"}`}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step > 1
                    ? "bg-emerald-600 text-white"
                    : step === 1
                    ? "bg-emerald-800 text-white ring-4 ring-emerald-100"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {step > 1 ? "✓" : "1"}
              </span>
              <span>Informasi Dasar</span>
            </div>

            <div className={`h-0.5 w-8 sm:w-12 ${step >= 2 ? "bg-emerald-600" : "bg-slate-200"}`} />

            {/* Step 2 */}
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-emerald-800" : "text-slate-400"}`}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step > 2
                    ? "bg-emerald-600 text-white"
                    : step === 2
                    ? "bg-emerald-800 text-white ring-4 ring-emerald-100"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {step > 2 ? "✓" : "2"}
              </span>
              <span>Pilih Template</span>
            </div>

            <div className={`h-0.5 w-8 sm:w-12 ${step >= 3 ? "bg-emerald-600" : "bg-slate-200"}`} />

            {/* Step 3 */}
            <div className={`flex items-center gap-2 ${step >= 3 ? "text-emerald-800" : "text-slate-400"}`}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step === 3
                    ? "bg-emerald-800 text-white ring-4 ring-emerald-100"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                3
              </span>
              <span>Ringkasan</span>
            </div>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STAGE 1: INFORMASI DASAR */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Pilih karyawan yang akan diinisiasi penilaiannya. Data departemen, jabatan, dan atasan penilai akan otomatis diisi oleh sistem.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Karyawan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => handleEmpSelect(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">— Pilih Karyawan —</option>
                  {employees.map((emp) => {
                    const dept = departments.find((d) => d.id === emp.departmentId);
                    return (
                      <option key={emp.id} value={emp.id}>
                        [{emp.nik}] {emp.name} — {emp.jobPosition} ({dept?.name ?? "-"})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* AUTO-FILLED DETAIL CARD */}
              {selectedEmp ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                        👤
                      </span>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          {selectedEmp.name}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-mono">
                          NIK: {selectedEmp.nik}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 border border-emerald-200">
                      ✓ Data Terverifikasi
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Departemen</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{empDept?.name ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Job Level</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{empLevel?.name ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Jabatan (Posisi)</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{selectedEmp.jobPosition}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Unit Kerja</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{selectedEmp.operatingUnit || "HO"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Atasan Direct</span>
                      <p className="font-semibold text-emerald-800 mt-0.5">{appraiser?.name ?? "Superintendent / Head Dept"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Periode Evaluasi</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{period.name}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-400 text-xs">
                  Silakan pilih karyawan di atas untuk melihat informasi dasar otomatis.
                </div>
              )}
            </div>
          )}

          {/* STAGE 2: PILIH / SUGEST TEMPLATE */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* SUGGESTION BANNER */}
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 flex items-start gap-3">
                <span className="text-lg">💡</span>
                <div className="text-xs">
                  <h4 className="font-extrabold text-emerald-950">Template Terpilih Otomatis</h4>
                  <p className="text-emerald-800 mt-0.5">
                    Sistem mendeteksi Departemen <b>{empDept?.name}</b> dan Job Level <b>{empLevel?.name}</b> karyawan ini.
                  </p>
                </div>
              </div>

              {/* ACTIVE/SUGGESTED TEMPLATE CARD */}
              {activeTemplate ? (
                <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-sm">
                        📋
                      </span>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {activeTemplate.name}
                        </h4>
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Versi v{activeTemplate.version} · Total Bobot: {(Number(activeTemplate.totalWeight) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-bold border border-emerald-300">
                      ✓ Rekomendasi
                    </span>
                  </div>

                  {/* Dropdown switch template if needed */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Ubah ke Template Lain (Opsional):
                    </label>
                    <select
                      value={activeTemplate.id}
                      onChange={(e) => setSelectedTplId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
                    >
                      {templates.map((t) => {
                        const isMatched =
                          t.departmentId === selectedEmp?.departmentId &&
                          t.jobLevelId === selectedEmp?.jobLevelId;
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name} {isMatched ? "★ (Rekomendasi Utama)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center text-amber-900 text-xs">
                  Belum ada template aktif yang tersedia untuk departemen dan job level ini.
                </div>
              )}
            </div>
          )}

          {/* STAGE 3: RINGKASAN */}
          {step === 3 && selectedEmp && activeTemplate && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-200 pb-2">
                  Ringkasan Inisiasi Penilaian KPI
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Nama Karyawan</span>
                    <p className="font-bold text-slate-900">{selectedEmp.name}</p>
                    <span className="text-[11px] text-slate-500 font-mono">NIK: {selectedEmp.nik}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Departemen & Level</span>
                    <p className="font-bold text-slate-900">{empDept?.name}</p>
                    <span className="text-[11px] text-slate-500">{empLevel?.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Periode Penilaian</span>
                    <p className="font-bold text-slate-900">{period.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Template Digunakan</span>
                    <p className="font-bold text-emerald-800">{activeTemplate.name}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 border border-emerald-200 flex items-center gap-2">
                <span>🚀</span>
                <span>
                  Klik tombol di bawah untuk membuat formulir dan langsung menuju ke halaman pengisian realisasi KPI.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-3.5 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className={btnSecondary}
            >
              ← Kembali
            </button>
          ) : (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Batal
            </button>
          )}

          {step === 1 && (
            <button type="button" onClick={handleNextToStep2} className={btnPrimary}>
              Lanjutkan ke Pilih Template ➔
            </button>
          )}

          {step === 2 && (
            <button type="button" onClick={handleNextToStep3} className={btnPrimary}>
              Lanjutkan ke Ringkasan ➔
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className={btnPrimary}
            >
              {isPending ? "Memuat Formulir..." : "✓ Konfirmasi & Buat Form Penilaian"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
