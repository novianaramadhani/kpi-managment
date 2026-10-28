"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type {
  Department,
  JobLevel,
  KpiBand,
  KpiCategory,
  KpiParameter,
  KpiTemplate,
  KpiCalculationRule,
} from "@/db/schema";
import { TemplateHeader } from "./template-header";
import { KpiStructureForm } from "./kpi-structure-form";
import { TemplateViewModal } from "../template-view-modal";
import { TemplateExcelModal } from "../template-excel-modal";
import { exportKpiTemplateToExcel, type MasterParamItem } from "@/lib/excel-template-kpi";
import { importTemplateStructure, syncTemplateToEmployeeAppraisalsAction, type ImportCategoryInput } from "@/lib/actions";

export interface TemplateEditorProps {
  template: KpiTemplate;
  employee?: {
    id?: number;
    nik?: string | null;
    name?: string | null;
    jobPosition?: string | null;
    departmentId?: number | null;
    departmentName?: string | null;
  } | null;
  departments: Department[];
  jobLevels: JobLevel[];
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
  calculationRules?: KpiCalculationRule[];
  templateTargetPct?: number;
  updateTemplateAction: (fd: FormData) => Promise<void>;
  addCategoryAction: (fd: FormData) => Promise<void>;
  updateCategoryAction: (fd: FormData) => Promise<void>;
  deleteCategoryAction: (fd: FormData) => Promise<void>;
  addParameterAction: (fd: FormData) => Promise<void>;
  updateParameterAction: (fd: FormData) => Promise<void>;
  deleteParameterAction: (fd: FormData) => Promise<void>;
  duplicateParameterAction?: (fd: FormData) => Promise<void>;
  addBandAction: (fd: FormData) => Promise<void>;
  updateBandAction?: (fd: FormData) => Promise<void>;
  deleteBandAction: (fd: FormData) => Promise<void>;
  importTemplateStructureAction?: (
    templateId: number,
    categories: ImportCategoryInput[],
    mode: "REPLACE" | "APPEND"
  ) => Promise<{
    catCount: number;
    paramCount: number;
    bandCount: number;
    newMasterCount?: number;
    updatedCount?: number;
    createdCount?: number;
  }>;
  masterParams?: MasterParamItem[];
}

export function TemplateEditor({
  template,
  employee,
  departments,
  jobLevels,
  categories,
  parameters,
  bands,
  calculationRules = [],
  masterParams = [],
  updateTemplateAction,
  addCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  addParameterAction,
  updateParameterAction,
  deleteParameterAction,
  addBandAction,
  updateBandAction,
  deleteBandAction,
  importTemplateStructureAction,
  templateTargetPct = 115,
}: TemplateEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Template metadata state
  const [templateName, setTemplateName] = useState(template.name);
  const [departmentId, setDepartmentId] = useState(template.departmentId);
  const [jobLevelId, setJobLevelId] = useState(template.jobLevelId);
  const [periodYear, setPeriodYear] = useState("2026");
  const [isActiveStatus, setIsActiveStatus] = useState(template.isActive);

  // Modals & Mode
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isEditInfoModalOpen, setIsEditInfoModalOpen] = useState(false);
  const [isEditTemplateMode, setIsEditTemplateMode] = useState(false);
  const [isSyncingToEmployees, setIsSyncingToEmployees] = useState(false);

  // Lookup maps
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const levelMap = useMemo(() => new Map(jobLevels.map((l) => [l.id, l])), [jobLevels]);

  const currentDept = deptMap.get(departmentId);
  const currentLevel = levelMap.get(jobLevelId);

  // Calculations
  const totalCatWeightPct = useMemo(() => {
    return categories.reduce((sum, c) => sum + Math.round(Number(c.weight) * 100), 0);
  }, [categories]);

  // Validation for Publish (Total parameter weight must equal templateTargetPct = 115%)
  const isValidToPublish = useMemo(() => {
    if (categories.length === 0) return false;
    if (totalCatWeightPct !== templateTargetPct) return false;
    return true;
  }, [categories, totalCatWeightPct, templateTargetPct]);

  // Handle Publish
  const handlePublish = () => {
    if (!isValidToPublish) {
      void Swal.fire({
        icon: "warning",
        title: "Belum Siap Dipublish",
        text: `Publish hanya aktif jika struktur KPI valid dan total bobot parameter = ${templateTargetPct}% (saat ini ${totalCatWeightPct}%).`,
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(template.id));
        fd.append("name", templateName);
        fd.append("departmentId", String(departmentId));
        fd.append("jobLevelId", String(jobLevelId));
        fd.append("isActive", "true");
        await updateTemplateAction(fd);
        setIsActiveStatus(true);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Dipublish!",
          text: "Template KPI berhasil dipublish dan siap digunakan untuk penilaian.",
          confirmButtonColor: "#059669",
          confirmButtonText: "Ke Halaman Master Template",
        });
        router.push("/setup/templates");
      } catch (err: any) {
        void Swal.fire({
          icon: "error",
          title: "Gagal Publish",
          text: err?.message || "Terjadi kesalahan saat publish template.",
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Handle Sinkronisasi Perubahan Template ke Karyawan
  const handleSyncToEmployees = async () => {
    const confirmRes = await Swal.fire({
      title: "Update Kriteria ke Karyawan?",
      html: `
        <div class="text-left text-xs text-slate-600 space-y-2">
          <p>Anda akan menyinkronkan seluruh revisi kriteria penilaian dan struktur pada <strong>"${templateName}"</strong> ke dokumen penilaian karyawan terkait.</p>
          <div class="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-indigo-900 space-y-1">
            <span class="font-bold block">Pembaruan yang diterapkan:</span>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>Skor &amp; rentang kriteria penilaian terbaru (scoring rules snapshot)</li>
              <li>Target, satuan, dan pembobotan parameter terbaru</li>
              <li>Rekalkulasi otomatis nilai &amp; skor akhir karyawan</li>
            </ul>
          </div>
          <p class="text-[11px] text-slate-500 italic">
            *Nilai aktual bulanan yang sudah diisi oleh penilai tetap tersimpan aman.
          </p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Update ke Karyawan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#4f46e5",
      cancelButtonColor: "#64748b",
    });

    if (!confirmRes.isConfirmed) return;

    setIsSyncingToEmployees(true);
    try {
      const res = await syncTemplateToEmployeeAppraisalsAction(template.id);
      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: "Berhasil Diperbarui!",
          text: res.message || "Form penilaian karyawan berhasil diperbarui sesuai Master Template.",
          confirmButtonColor: "#4f46e5",
        });
        router.refresh();
      } else {
        await Swal.fire({
          icon: "error",
          title: "Gagal Memperbarui",
          text: res.error || "Terjadi kesalahan saat menyinkronkan ke karyawan.",
          confirmButtonColor: "#4f46e5",
        });
      }
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "Kesalahan",
        text: err?.message || "Terjadi kesalahan koneksi atau server.",
        confirmButtonColor: "#4f46e5",
      });
    } finally {
      setIsSyncingToEmployees(false);
    }
  };

  // Handle Save Template Info
  const handleSaveTemplateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(template.id));
        fd.append("name", templateName);
        fd.append("departmentId", String(departmentId));
        fd.append("jobLevelId", String(jobLevelId));
        fd.append("isActive", isActiveStatus ? "true" : "false");
        await updateTemplateAction(fd);
        setIsEditInfoModalOpen(false);
        void Swal.fire({
          icon: "success",
          title: "Informasi Disimpan",
          confirmButtonColor: "#0f172a",
        });
      } catch (err: any) {
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: err?.message || "Terjadi kesalahan.",
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  const handleExportExcel = () => {
    exportKpiTemplateToExcel({
      template,
      departmentName: currentDept?.name,
      jobLevelName: currentLevel?.name,
      periodYear,
      employee,
      categories,
      parameters,
      bands,
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-3 pb-12">
      {/* 1. HEADER HALAMAN (Baris Judul + Metadata & Ubah Info) */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
        <TemplateHeader
          template={template}
          templateName={templateName}
          department={currentDept}
          jobLevel={currentLevel}
          employee={employee}
          periodYear={periodYear}
          isActive={isActiveStatus}
          isValidToPublish={isValidToPublish}
          isPending={isPending}
          templateTargetPct={templateTargetPct}
          isEditTemplateMode={isEditTemplateMode}
          onToggleEditTemplate={() => setIsEditTemplateMode((prev) => !prev)}
          onPreview={() => setIsPreviewOpen(true)}
          onPublish={handlePublish}
          onEditInfo={() => setIsEditInfoModalOpen(true)}
          onSyncToEmployees={handleSyncToEmployees}
          isSyncingToEmployees={isSyncingToEmployees}
          onExportExcel={handleExportExcel}
          onImportExcel={() => setIsExcelModalOpen(true)}
        />
      </div>

      {/* STRUKTUR KPI (3-LEVEL TREE HIERARCHY) */}
      <KpiStructureForm
        templateId={template.id}
        categories={categories}
        parameters={parameters}
        bands={bands}
        department={currentDept}
        templateTargetPct={templateTargetPct}
        masterParams={masterParams}
        calculationRules={calculationRules}
        isEditTemplateMode={isEditTemplateMode}
        onToggleEditTemplateMode={() => setIsEditTemplateMode((prev) => !prev)}
        addCategoryAction={addCategoryAction}
        updateCategoryAction={updateCategoryAction}
        deleteCategoryAction={deleteCategoryAction}
        addParameterAction={addParameterAction}
        updateParameterAction={updateParameterAction}
        deleteParameterAction={deleteParameterAction}
        addBandAction={addBandAction}
        updateBandAction={updateBandAction}
        deleteBandAction={deleteBandAction}
      />

      {/* MODAL UBAH INFORMASI TEMPLATE */}
      {isEditInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">Ubah Informasi Template</h3>
              <button
                type="button"
                onClick={() => setIsEditInfoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveTemplateInfo} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Template
                </label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Departemen
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Job Level
                  </label>
                  <select
                    value={jobLevelId}
                    onChange={(e) => setJobLevelId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {jobLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Periode
                  </label>
                  <input
                    type="text"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={isActiveStatus ? "true" : "false"}
                    onChange={(e) => setIsActiveStatus(e.target.value === "true")}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="false">Draft</option>
                    <option value="true">Published</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditInfoModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      <TemplateViewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={template}
        department={currentDept}
        jobLevel={currentLevel}
        employee={employee}
        categories={categories}
        parameters={parameters}
        bands={bands}
      />

      {/* EXCEL MODAL */}
      <TemplateExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        templateId={template.id}
        templateName={templateName}
        targetTotalWeight={templateTargetPct / 100}
        departmentId={template.departmentId}
        departmentName={currentDept?.name}
        masterParams={masterParams}
        importAction={importTemplateStructureAction ?? importTemplateStructure}
        onExportCurrent={handleExportExcel}
      />
    </div>
  );
}
