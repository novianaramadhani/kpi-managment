"use client";

import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import {
  Building2,
  SlidersHorizontal,
  AlertCircle,
  X,
  Info,
} from "lucide-react";
import {
  getDepartmentKpiParametersAction,
  saveDepartmentKpiTargetAction,
  type DepartmentKpiParamItem,
  type DepartmentEmployeeItem,
} from "@/lib/actions";

interface DepartmentKpiAssessmentViewProps {
  selectedDeptId: string;
  departments: { id: number; name: string }[];
  currentYear: number;
  userRole?: string;
  onSelectDept?: (deptId: string) => void;
}

export function DepartmentKpiAssessmentView({
  selectedDeptId,
  departments,
  currentYear,
  userRole = "ADMIN",
  onSelectDept,
}: DepartmentKpiAssessmentViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [paramsList, setParamsList] = useState<DepartmentKpiParamItem[]>([]);
  const [deptEmployees, setDeptEmployees] = useState<DepartmentEmployeeItem[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [departmentName, setDepartmentName] = useState<string>("");

  // Modal State untuk Set Target per Parameter
  const [modalParam, setModalParam] = useState<DepartmentKpiParamItem | null>(null);
  const [modalTarget, setModalTarget] = useState<string>("");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [isSavingParam, setIsSavingParam] = useState(false);

  // Load department parameters when selectedDeptId or currentYear changes
  useEffect(() => {
    if (!selectedDeptId || selectedDeptId === "ALL") {
      setParamsList([]);
      setDeptEmployees([]);
      setPeriodId(null);
      setDepartmentName("");
      return;
    }

    const deptNum = Number(selectedDeptId);
    if (!deptNum || isNaN(deptNum)) return;

    setIsLoading(true);
    getDepartmentKpiParametersAction({ departmentId: deptNum, year: currentYear })
      .then((res) => {
        if (res.success) {
          setParamsList(res.parameters);
          setPeriodId(res.periodId ?? null);
          setDepartmentName(res.departmentName || "");
          setDeptEmployees(res.employees || []);
        } else {
          setParamsList([]);
          setDeptEmployees([]);
        }
      })
      .catch((err) => {
        console.error("Gagal memuat parameter departemen:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedDeptId, currentYear]);

  // Buka modal untuk set target parameter tertentu
  const openModal = (param: DepartmentKpiParamItem) => {
    setModalParam(param);
    setModalTarget(param.target ? String(param.target) : "");
    setModalNotes(param.description || param.notes || "");
  };

  // Simpan nilai target untuk satu parameter dari modal
  const handleSaveModalTarget = async () => {
    if (!modalParam) return;

    setIsSavingParam(true);
    try {
      const res = await saveDepartmentKpiTargetAction({
        masterParameterId: modalParam.masterParameterId,
        target: modalTarget,
        notes: modalNotes,
      });

      if (res.success) {
        // Update data pada tabel utama secara lokal
        const cleanTarget = modalTarget.trim() || null;
        setParamsList((prev) =>
          prev.map((p) =>
            p.masterParameterId === modalParam.masterParameterId
              ? {
                  ...p,
                  target: cleanTarget,
                  description: modalNotes.trim() || null,
                }
              : p
          )
        );

        setModalParam(null);

        const Toast = Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
        });
        Toast.fire({
          icon: "success",
          title: "Target Disimpan",
          text: `Target untuk "${modalParam.name}" berhasil diperbarui.`,
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan Target",
          text: res.error || "Terjadi kesalahan saat menyimpan target parameter.",
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Kesalahan Sistem",
        text: err?.message || "Gagal menyimpan target parameter.",
      });
    } finally {
      setIsSavingParam(false);
    }
  };

  // JIKA FILTER DEPARTEMEN BELUM DIPILIH (STATUS "ALL" ATAU KOSONG)
  if (!selectedDeptId || selectedDeptId === "ALL") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 mb-3 border border-slate-200">
          <Building2 className="w-5 h-5" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          Pilih Departemen
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Silakan tentukan salah satu departemen untuk melihat dan mengatur target KPI.
        </p>

        <div className="mt-5 max-w-xs mx-auto">
          <select
            value=""
            onChange={(e) => onSelectDept?.(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="" disabled>
              -- Pilih Departemen --
            </option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar Pilih Departemen */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Target Parameter Departemen: <strong className="font-bold text-slate-900">{departmentName || "-"}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Departemen:</label>
          <select
            value={selectedDeptId}
            onChange={(e) => onSelectDept?.(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
          >
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KONTEN UTAMA: DAFTAR PARAMETER DEPARTMENT */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Memuat parameter Department KPI...
        </div>
      ) : paramsList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 mx-auto mb-3">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-slate-800">
            Belum Ada Parameter Department KPI
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Departemen {departmentName} belum memiliki parameter dengan Scope bernilai{" "}
            <strong>Department</strong>.
          </p>
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 text-left">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                Untuk menandai indikator sebagai Department KPI, buka menu{" "}
                <strong>Master Kamus Parameter</strong> dan ubah kolom Scope menjadi{" "}
                <strong>Department</strong>.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* TAMPILAN DESKTOP: TABEL LEBAR (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-4 py-3 w-12 text-center">No</th>
                  <th className="px-4 py-3 min-w-[220px]">Parameter KPI</th>
                  <th className="px-4 py-3 w-24 text-center">Satuan</th>
                  <th className="px-4 py-3 w-44 text-center">Target KPI</th>
                  <th className="px-4 py-3 w-36 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paramsList.map((param, idx) => {
                  const hasTarget = param.target && param.target.trim() !== "";

                  return (
                    <tr key={param.masterParameterId} className="hover:bg-slate-50/60 transition-colors">
                      {/* No */}
                      <td className="px-4 py-3.5 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* Parameter Info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs">
                            {param.name}
                          </span>
                          <span className="rounded-md bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-mono">
                            {param.code || "-"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {param.categoryName || "Target Kerja"}
                        </div>
                      </td>

                      {/* Satuan */}
                      <td className="px-4 py-3.5 text-center font-medium text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                          {param.unit || "%"}
                        </span>
                      </td>

                      {/* Target KPI */}
                      <td className="px-4 py-3.5 text-center">
                        {hasTarget ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-900 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-slate-200/80">
                            {param.target}
                            {param.unit && (
                              <span className="font-sans font-medium text-[10px] text-slate-500">
                                {param.unit}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            Belum diatur
                          </span>
                        )}
                      </td>

                      {/* Button Atur Target (Clean Outline / Ghost) */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => openModal(param)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-medium shadow-2xs transition active:scale-95 cursor-pointer"
                          title={`Atur target untuk ${param.name}`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                          <span>Atur Target</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TAMPILAN MOBILE: CARD LIST ADAPTIF (md:hidden) */}
          <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
            {paramsList.map((param) => {
              const hasTarget = param.target && param.target.trim() !== "";
              return (
                <div
                  key={param.masterParameterId}
                  className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900 text-xs">
                          {param.name}
                        </span>
                        <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.2 text-[10px] font-mono">
                          {param.code || "-"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {param.categoryName || "Target Kerja"}
                      </div>
                    </div>
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-600 border border-slate-200 shrink-0">
                      {param.unit || "%"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Target KPI</span>
                      {hasTarget ? (
                        <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 inline-block mt-0.5">
                          {param.target} {param.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Belum diatur</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openModal(param)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium shadow-2xs transition active:scale-95 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      <span>Atur Target</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Card */}
          <div className="p-3.5 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between flex-wrap gap-2">
            <span>
              Menampilkan {paramsList.length} parameter Department KPI.
            </span>
            <span className="text-slate-400">
              {deptEmployees.length} Karyawan Terhubung
            </span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL SET TARGET PARAMETER (CLEAN & MINIMALIST)           */}
      {/* ========================================================= */}
      {modalParam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!isSavingParam) setModalParam(null);
          }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-150 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    Target KPI Departemen
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {modalParam.code || "-"}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-1.5">
                  {modalParam.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Departemen {departmentName} • Periode {currentYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalParam(null)}
                disabled={isSavingParam}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Subtle Metadata Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50/70 border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Satuan</span>
                  <span className="font-semibold text-slate-700 mt-0.5 block">{modalParam.unit || "%"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Kategori</span>
                  <span className="font-semibold text-slate-700 mt-0.5 block truncate" title={modalParam.categoryName || "Target Kerja"}>
                    {modalParam.categoryName || "Target Kerja"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Agregasi</span>
                  <span className="font-semibold text-slate-700 mt-0.5 block">
                    {modalParam.aggregation === "SUM"
                      ? "Akumulasi"
                      : modalParam.aggregation === "LAST"
                      ? "Terakhir"
                      : "Rata-rata"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Basis Hitung</span>
                  <span className="font-semibold text-slate-700 mt-0.5 block">
                    {modalParam.compareBasis === "PERCENTAGE" ? "Persentase" : "Nilai Riil"}
                  </span>
                </div>
              </div>

              {/* Input Nilai Target */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-800 block">
                  Nilai Target <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={modalTarget}
                    onChange={(e) => setModalTarget(e.target.value)}
                    placeholder="Contoh: 100%, 95, 4 Hari, <= 5..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-14 text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition shadow-2xs"
                    autoFocus
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-xs font-semibold text-slate-400 font-mono">
                    {modalParam.unit || "%"}
                  </div>
                </div>
              </div>

              {/* Keterangan / Deskripsi Target (Opsional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800 block">
                  Catatan / Acuan Target <span className="text-slate-400 font-normal">(opsional)</span>
                </label>
                <textarea
                  rows={3}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Keterangan acuan target, pedoman perhitungan, atau rumus..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition shadow-2xs resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setModalParam(null)}
                disabled={isSavingParam}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveModalTarget}
                disabled={isSavingParam}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-5 py-2 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSavingParam ? "Menyimpan..." : "Simpan Target"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
