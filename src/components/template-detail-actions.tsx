"use client";

import React, { useState } from "react";
import type { KpiBand, KpiCategory, KpiParameter, KpiTemplate } from "@/db/schema";
import { exportKpiTemplateToExcel } from "@/lib/excel-template-kpi";
import { exportKpiTemplateToPdf } from "@/lib/pdf-template";
import { TemplateExcelModal } from "./template-excel-modal";
import type { ImportCategoryInput } from "@/lib/actions";
import { Download, Upload, FileText } from "lucide-react";

interface TemplateDetailActionsProps {
  template: KpiTemplate;
  departmentName: string;
  jobLevelName: string;
  categories: KpiCategory[];
  parameters: KpiParameter[];
  bands: KpiBand[];
  importAction: (
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
}

export function TemplateDetailActions({
  template,
  departmentName,
  jobLevelName,
  categories,
  parameters,
  bands,
  importAction,
}: TemplateDetailActionsProps) {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleExport = () => {
    exportKpiTemplateToExcel({
      template,
      departmentName,
      jobLevelName,
      categories,
      parameters,
      bands,
    });
  };

  const handleExportPdf = () => {
    exportKpiTemplateToPdf({
      template,
      departmentName,
      jobLevelName,
      categories,
      parameters,
      bands,
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-98 cursor-pointer"
          title="Download seluruh struktur parameter & indikator template ini ke Excel (.xlsx)"
        >
          <Download className="h-3.5 w-3.5 text-slate-600" />
          <span>Export Excel</span>
        </button>

        <button
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-98 cursor-pointer"
          title="Download seluruh struktur master template ini ke PDF (.pdf)"
        >
          <FileText className="h-3.5 w-3.5 text-rose-600" />
          <span>Export PDF</span>
        </button>

        <button
          type="button"
          onClick={() => setIsImportModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-100 hover:border-emerald-400 transition active:scale-98 cursor-pointer"
          title="Upload dan review struktur template KPI dari file Excel"
        >
          <Upload className="h-3.5 w-3.5 text-emerald-700" />
          <span>Import Excel</span>
        </button>
      </div>

      <TemplateExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        templateId={template.id}
        templateName={template.name}
        targetTotalWeight={Number(template.totalWeight)}
        importAction={importAction}
        onExportCurrent={handleExport}
      />
    </>
  );
}
