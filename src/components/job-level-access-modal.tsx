"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { JobLevel, JobLevelPermission, Department } from "@/db/schema";
import { SaveJobLevelPermissionInput } from "@/lib/actions";
import Swal from "sweetalert2";

interface JobLevelAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobLevel: JobLevel | null;
  currentPermission: JobLevelPermission | null;
  departments: Department[];
  allJobLevels: JobLevel[];
  onSave: (input: SaveJobLevelPermissionInput) => Promise<{ success: boolean }>;
}

export function JobLevelAccessModal({
  isOpen,
  onClose,
  jobLevel,
  currentPermission,
  departments,
  allJobLevels,
  onSave,
}: JobLevelAccessModalProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [defaultRole, setDefaultRole] = useState("KARYAWAN");
  const [canAccessMasterData, setCanAccessMasterData] = useState(false);
  const [canAccessMasterParam, setCanAccessMasterParam] = useState(false);
  const [canAccessTemplate, setCanAccessTemplate] = useState(false);
  const [canAccessAssignment, setCanAccessAssignment] = useState(false);
  const [canAccessInputAssessment, setCanAccessInputAssessment] = useState(true);
  const [canAccessReviewAssessment, setCanAccessReviewAssessment] = useState(false);
  const [canAccessApprovalAssessment, setCanAccessApprovalAssessment] = useState(false);
  const [canAccessReports, setCanAccessReports] = useState(false);

  // Scope states
  const [departmentScope, setDepartmentScope] = useState("SELF_ONLY");
  const [levelScope, setLevelScope] = useState("SELF_ONLY");
  const [customDepartmentIds, setCustomDepartmentIds] = useState<number[]>([]);
  const [customJobLevelIds, setCustomJobLevelIds] = useState<number[]>([]);
  const [syncRoleToEmployees, setSyncRoleToEmployees] = useState(false);

  useEffect(() => {
    if (isOpen && jobLevel) {
      if (currentPermission) {
        setDefaultRole(currentPermission.defaultRole || "KARYAWAN");
        setCanAccessMasterData(!!currentPermission.canAccessMasterData);
        setCanAccessMasterParam(!!currentPermission.canAccessMasterParam);
        setCanAccessTemplate(!!currentPermission.canAccessTemplate);
        setCanAccessAssignment(!!currentPermission.canAccessAssignment);
        setCanAccessInputAssessment(currentPermission.canAccessInputAssessment ?? true);
        setCanAccessReviewAssessment(!!currentPermission.canAccessReviewAssessment);
        setCanAccessApprovalAssessment(!!currentPermission.canAccessApprovalAssessment);
        setCanAccessReports(!!currentPermission.canAccessReports);
        setDepartmentScope(currentPermission.departmentScope || "SELF_ONLY");
        setLevelScope(currentPermission.levelScope || "SELF_ONLY");
        setCustomDepartmentIds(currentPermission.customDepartmentIds || []);
        setCustomJobLevelIds(currentPermission.customJobLevelIds || []);
      } else {
        if (jobLevel.rank >= 4) {
          setDefaultRole("MANAGER");
          setDepartmentScope("ALL");
          setLevelScope("SUBORDINATES");
          setCanAccessInputAssessment(true);
          setCanAccessReviewAssessment(true);
          setCanAccessApprovalAssessment(true);
          setCanAccessReports(true);
        } else if (jobLevel.rank === 3) {
          setDefaultRole("HEAD_DEPT");
          setDepartmentScope("OWN_DEPT");
          setLevelScope("SUBORDINATES");
          setCanAccessInputAssessment(true);
          setCanAccessReviewAssessment(true);
          setCanAccessApprovalAssessment(true);
          setCanAccessReports(true);
        } else if (jobLevel.rank === 2) {
          setDefaultRole("PENILAI");
          setDepartmentScope("OWN_DEPT");
          setLevelScope("SUBORDINATES");
          setCanAccessInputAssessment(true);
          setCanAccessReviewAssessment(true);
        } else {
          setDefaultRole("KARYAWAN");
          setDepartmentScope("SELF_ONLY");
          setLevelScope("SELF_ONLY");
          setCanAccessInputAssessment(true);
        }
      }
      setSyncRoleToEmployees(false);
    }
  }, [isOpen, jobLevel, currentPermission]);

  const handleToggleDepartment = (deptId: number) => {
    setCustomDepartmentIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const handleToggleJobLevel = (lvlId: number) => {
    setCustomJobLevelIds((prev) =>
      prev.includes(lvlId) ? prev.filter((id) => id !== lvlId) : [...prev, lvlId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobLevel) return;

    setIsSaving(true);
    try {
      await onSave({
        jobLevelId: jobLevel.id,
        defaultRole,
        canAccessMasterData,
        canAccessMasterParam,
        canAccessTemplate,
        canAccessAssignment,
        canAccessInputAssessment,
        canAccessReviewAssessment,
        canAccessApprovalAssessment,
        canAccessReports,
        departmentScope,
        levelScope,
        customDepartmentIds,
        customJobLevelIds,
        syncRoleToEmployees,
      });

      await Swal.fire({
        icon: "success",
        title: "Hak Akses Tersimpan",
        text: `Hak akses untuk level ${jobLevel.name} berhasil diperbarui.`,
        timer: 1500,
        showConfirmButton: false,
      });

      onClose();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan";
      await Swal.fire({
        icon: "error",
        title: "Gagal",
        text: msg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !jobLevel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Edit Hak Akses: {jobLevel.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kode: <span className="font-semibold text-slate-700">{jobLevel.code}</span> · Rank:{" "}
              <span className="font-semibold text-slate-700">{jobLevel.rank}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* MODAL BODY */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* ROLE DEFAULT */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Role Default Sistem
            </label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
              className="w-full sm:w-72 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 bg-white cursor-pointer"
            >
              <option value="ADMIN">ADMIN (Superadmin Sistem)</option>
              <option value="HR">HR (Pengelola KPI & Master)</option>
              <option value="HEAD_DEPT">HEAD_DEPT (Kepala Departemen)</option>
              <option value="MANAGER">MANAGER (Manajer Divisi)</option>
              <option value="PENILAI">PENILAI (Supervisor / Penilai)</option>
              <option value="KARYAWAN">KARYAWAN (Staff / Pelaksana)</option>
            </select>
          </div>

          {/* MATRIKS CHECKBOX 8 MODUL (FLAT DENGAN SCROLL SECTION - TANPA CARD) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                Matriks Hak Akses Modul
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCanAccessMasterData(true);
                    setCanAccessMasterParam(true);
                    setCanAccessTemplate(true);
                    setCanAccessAssignment(true);
                    setCanAccessInputAssessment(true);
                    setCanAccessReviewAssessment(true);
                    setCanAccessApprovalAssessment(true);
                    setCanAccessReports(true);
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setCanAccessMasterData(false);
                    setCanAccessMasterParam(false);
                    setCanAccessTemplate(false);
                    setCanAccessAssignment(false);
                    setCanAccessInputAssessment(false);
                    setCanAccessReviewAssessment(false);
                    setCanAccessApprovalAssessment(false);
                    setCanAccessReports(false);
                  }}
                  className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Batal Semua
                </button>
              </div>
            </div>

            {/* AREA SCROLL SECTION HAK AKSES MODUL */}
            <div className="max-h-[220px] overflow-y-auto overscroll-contain pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* KATEGORI 1: MANAJEMEN & KONFIGURASI (FLAT, BATAS GARIS TIPIS) */}
                <div className="rounded-lg border border-slate-200/80 p-3 bg-white/40 flex flex-col">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200/70">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-slate-800">
                        1. Manajemen & Konfigurasi
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        ({[canAccessMasterData, canAccessMasterParam, canAccessTemplate, canAccessAssignment].filter(Boolean).length}/4)
                      </span>
                    </div>
                    {/* 1 Button Action */}
                    <button
                      type="button"
                      onClick={() => {
                        const allActive = canAccessMasterData && canAccessMasterParam && canAccessTemplate && canAccessAssignment;
                        const nextVal = !allActive;
                        setCanAccessMasterData(nextVal);
                        setCanAccessMasterParam(nextVal);
                        setCanAccessTemplate(nextVal);
                        setCanAccessAssignment(nextVal);
                      }}
                      className={`text-xs font-semibold cursor-pointer transition hover:underline shrink-0 ${
                        canAccessMasterData && canAccessMasterParam && canAccessTemplate && canAccessAssignment
                          ? "text-rose-600 hover:text-rose-800"
                          : "text-indigo-600 hover:text-indigo-800"
                      }`}
                    >
                      {canAccessMasterData && canAccessMasterParam && canAccessTemplate && canAccessAssignment ? "Batal Semua" : "Pilih Semua"}
                    </button>
                  </div>

                  <div className="space-y-0.5 divide-y divide-slate-100">
                    {[
                      { key: "canAccessMasterData", label: "Master Data", val: canAccessMasterData, setVal: setCanAccessMasterData },
                      { key: "canAccessMasterParam", label: "Master Parameter KPI", val: canAccessMasterParam, setVal: setCanAccessMasterParam },
                      { key: "canAccessTemplate", label: "Template KPI", val: canAccessTemplate, setVal: setCanAccessTemplate },
                      { key: "canAccessAssignment", label: "Assignment KPI", val: canAccessAssignment, setVal: setCanAccessAssignment },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center justify-between gap-2 py-1 px-1.5 rounded transition-colors cursor-pointer select-none text-xs ${
                          item.val ? "bg-indigo-50/30 hover:bg-indigo-50/50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={item.val}
                            onChange={(e) => item.setVal(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                          />
                          <span className={`truncate ${item.val ? "font-semibold text-slate-900" : "font-normal text-slate-600"}`}>
                            {item.label}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1 pl-2">
                          {item.val ? (
                            <span className="text-[10px] font-bold text-emerald-600">Aktif</span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">Off</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* KATEGORI 2: PENILAIAN & LAPORAN (FLAT, BATAS GARIS TIPIS) */}
                <div className="rounded-lg border border-slate-200/80 p-3 bg-white/40 flex flex-col">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200/70">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-slate-800">
                        2. Penilaian & Laporan
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        ({[canAccessInputAssessment, canAccessReviewAssessment, canAccessApprovalAssessment, canAccessReports].filter(Boolean).length}/4)
                      </span>
                    </div>
                    {/* 1 Button Action */}
                    <button
                      type="button"
                      onClick={() => {
                        const allActive = canAccessInputAssessment && canAccessReviewAssessment && canAccessApprovalAssessment && canAccessReports;
                        const nextVal = !allActive;
                        setCanAccessInputAssessment(nextVal);
                        setCanAccessReviewAssessment(nextVal);
                        setCanAccessApprovalAssessment(nextVal);
                        setCanAccessReports(nextVal);
                      }}
                      className={`text-xs font-semibold cursor-pointer transition hover:underline shrink-0 ${
                        canAccessInputAssessment && canAccessReviewAssessment && canAccessApprovalAssessment && canAccessReports
                          ? "text-rose-600 hover:text-rose-800"
                          : "text-indigo-600 hover:text-indigo-800"
                      }`}
                    >
                      {canAccessInputAssessment && canAccessReviewAssessment && canAccessApprovalAssessment && canAccessReports ? "Batal Semua" : "Pilih Semua"}
                    </button>
                  </div>

                  <div className="space-y-0.5 divide-y divide-slate-100">
                    {[
                      { key: "canAccessInputAssessment", label: "Input Assessment", val: canAccessInputAssessment, setVal: setCanAccessInputAssessment },
                      { key: "canAccessReviewAssessment", label: "Review Assessment", val: canAccessReviewAssessment, setVal: setCanAccessReviewAssessment },
                      { key: "canAccessApprovalAssessment", label: "Approval Assessment", val: canAccessApprovalAssessment, setVal: setCanAccessApprovalAssessment },
                      { key: "canAccessReports", label: "Laporan & Export", val: canAccessReports, setVal: setCanAccessReports },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center justify-between gap-2 py-1 px-1.5 rounded transition-colors cursor-pointer select-none text-xs ${
                          item.val ? "bg-indigo-50/30 hover:bg-indigo-50/50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={item.val}
                            onChange={(e) => item.setVal(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                          />
                          <span className={`truncate ${item.val ? "font-semibold text-slate-900" : "font-normal text-slate-600"}`}>
                            {item.label}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1 pl-2">
                          {item.val ? (
                            <span className="text-[10px] font-bold text-emerald-600">Aktif</span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">Off</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PEMBATASAN JANGKAUAN DATA (SCOPE) - FLAT */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
              Batasan Jangkauan Data (Scope)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SCOPE DEPARTEMEN */}
              <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-2">
                <span className="font-bold text-slate-800 text-xs block">
                  Jangkauan Departemen
                </span>
                <div className="space-y-1.5">
                  {[
                    { id: "ALL", label: "Semua Departemen (Lintas Divisi)" },
                    { id: "OWN_DEPT", label: "Hanya Departemen Sendiri" },
                    { id: "SELF_ONLY", label: "Hanya Data Pribadi" },
                    { id: "CUSTOM", label: "Pilih Departemen Tertentu (Custom)" },
                  ].map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 cursor-pointer text-slate-700"
                    >
                      <input
                        type="radio"
                        name="departmentScope"
                        value={d.id}
                        checked={departmentScope === d.id}
                        onChange={() => setDepartmentScope(d.id)}
                        className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                      />
                      <span className="text-xs">{d.label}</span>
                    </label>
                  ))}
                </div>

                {departmentScope === "CUSTOM" && (
                  <div className="mt-2 p-2 bg-white rounded border border-slate-200 max-h-32 overflow-y-auto space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Pilih Departemen:
                    </span>
                    {departments.map((dept) => (
                      <label
                        key={dept.id}
                        className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={customDepartmentIds.includes(dept.id)}
                          onChange={() => handleToggleDepartment(dept.id)}
                          className="h-3 w-3 rounded text-indigo-600 accent-indigo-600"
                        />
                        <span>
                          {dept.code} - {dept.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* SCOPE JOB LEVEL */}
              <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-2">
                <span className="font-bold text-slate-800 text-xs block">
                  Jangkauan Job Level
                </span>
                <div className="space-y-1.5">
                  {[
                    { id: "ALL", label: "Semua Job Level" },
                    { id: "SUBORDINATES", label: "Hanya Bawahan Langsung & Tidak Langsung" },
                    { id: "SAME_AND_BELOW", label: "Level yang Setara & Bawahan" },
                    { id: "SELF_ONLY", label: "Hanya Diri Sendiri" },
                    { id: "CUSTOM", label: "Pilih Job Level Tertentu (Custom)" },
                  ].map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 cursor-pointer text-slate-700"
                    >
                      <input
                        type="radio"
                        name="levelScope"
                        value={l.id}
                        checked={levelScope === l.id}
                        onChange={() => setLevelScope(l.id)}
                        className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                      />
                      <span className="text-xs">{l.label}</span>
                    </label>
                  ))}
                </div>

                {levelScope === "CUSTOM" && (
                  <div className="mt-2 p-2 bg-white rounded border border-slate-200 max-h-32 overflow-y-auto space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Pilih Job Level:
                    </span>
                    {allJobLevels.map((lvl) => (
                      <label
                        key={lvl.id}
                        className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={customJobLevelIds.includes(lvl.id)}
                          onChange={() => handleToggleJobLevel(lvl.id)}
                          className="h-3 w-3 rounded text-indigo-600 accent-indigo-600"
                        />
                        <span>
                          Rank {lvl.rank} ({lvl.code}) - {lvl.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SINKRONISASI ROLE KARYAWAN */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncRoleToEmployees}
                onChange={(e) => setSyncRoleToEmployees(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Perbarui role seluruh karyawan pada level ini menjadi &quot;{defaultRole}&quot;
                </span>
                <span className="text-[11px] text-slate-400">
                  Data role karyawan yang aktif di level ini akan langsung diselaraskan di database.
                </span>
              </div>
            </label>
          </div>
        </form>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 active:scale-95 transition cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}
