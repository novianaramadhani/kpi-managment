"use client";

import React, { useState } from "react";
import { LayoutTemplate, Sliders } from "lucide-react";
import { PageHeader } from "@/components/ui";
import type {
  Appraisal,
  Department,
  Employee,
  JobLevel,
  JobPosition,
  KpiBand,
  KpiCategory,
  KpiParameter,
  KpiPeriod,
  KpiTemplate,
  Pit,
  DepartmentMapping,
} from "@/db/schema";
import type { MasterParamItem } from "@/lib/excel-template-kpi";
import { TemplateListClient } from "./template-list-client";
import { MasterParametersTableClient } from "./master-parameters-table-client";

interface TemplateHubClientProps {
  templates: KpiTemplate[];
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  categories: KpiCategory[];
  parameters?: KpiParameter[];
  bands?: KpiBand[];
  employees?: Employee[];
  activePeriod?: KpiPeriod;
  periods?: KpiPeriod[];
  existingAppraisals?: Appraisal[];
  templateUsageMap?: Record<number, number>;
  assignmentOverview?: Record<number, any>;
  masterParameters: MasterParamItem[];
  pits?: Pit[];
  departmentMappings?: DepartmentMapping[];
  // Template actions
  createTemplateAction: (fd: FormData) => Promise<void>;
  deleteTemplateAction?: (fd: FormData) => Promise<void>;
  deleteTemplatesBulkAction?: (ids: number[]) => Promise<void>;
  updateTemplateAction?: (fd: FormData) => Promise<void>;
  assignTemplateAction?: (fd: FormData) => Promise<void>;
  duplicateTemplateAction?: (fd: FormData) => Promise<void>;
  // Master parameter actions
  createMasterParamAction: (fd: FormData) => Promise<any>;
  updateMasterParamAction: (fd: FormData) => Promise<any>;
  deleteMasterParamAction: (fd: FormData) => Promise<any>;
  deleteMasterParamBulkAction?: (ids: number[]) => Promise<any>;
  importBulkMasterParamAction: (
    items: any[],
    options?: { duplicateMode?: "UPDATE" | "SKIP" | "RENAME" }
  ) => Promise<{ createdCount: number; updatedCount: number; skippedCount?: number }>;
  resetAndSyncFromTemplatesAction?: () => Promise<{ success: boolean; count: number }>;
  // Initial options
  initialView?: string;
  initialDept?: string;
}

export function TemplateHubClient({
  templates,
  departments,
  jobLevels,
  jobPositions = [],
  categories,
  parameters = [],
  bands = [],
  employees = [],
  activePeriod,
  periods = [],
  existingAppraisals = [],
  templateUsageMap = {},
  assignmentOverview = {},
  masterParameters,
  pits = [],
  departmentMappings = [],
  createTemplateAction,
  deleteTemplateAction,
  deleteTemplatesBulkAction,
  updateTemplateAction,
  assignTemplateAction,
  duplicateTemplateAction,
  createMasterParamAction,
  updateMasterParamAction,
  deleteMasterParamAction,
  deleteMasterParamBulkAction,
  importBulkMasterParamAction,
  resetAndSyncFromTemplatesAction,
  initialView,
  initialDept = "",
}: TemplateHubClientProps) {
  const [activeView, setActiveView] = useState<"templates" | "parameters">(() => {
    if (initialView === "parameter" || initialView === "parameters") {
      return "parameters";
    }
    return "templates";
  });

  const [selectedDept, setSelectedDept] = useState<string>(initialDept || "");

  // Keep URL in sync with activeView without reloading
  const handleSwitchView = (view: "templates" | "parameters") => {
    setActiveView(view);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (view === "parameters") {
        url.searchParams.set("view", "parameters");
      } else {
        url.searchParams.delete("view");
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleDeptChange = (dept: string) => {
    setSelectedDept(dept);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (dept === "ALL" || !dept) {
        url.searchParams.delete("dept");
      } else {
        url.searchParams.set("dept", dept);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. SINGLE UNIFIED HEADER WITH TAB SWITCHER */}
      <PageHeader
        title={activeView === "templates" ? "Master Template KPI" : "Kamus Master Parameter"}
        subtitle={
          activeView === "templates"
            ? "Kelola template KPI berdasarkan kombinasi departemen dan level jabatan."
            : "Daftar indikator standar KPI terpusat untuk seluruh departemen."
        }
        backHref="/admin"
        backLabel="Kembali ke Admin Menu"
        actions={
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleSwitchView("templates")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeView === "templates"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span>Master Template ({templates.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchView("parameters")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeView === "parameters"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Kamus Parameter ({masterParameters.length})</span>
            </button>
          </div>
        }
      />

      {/* ==================================================================== */}
      {/* 2. DETAIL MASTER TEMPLATE (FOKUS KE MASTER INI SAJA)                 */}
      {/* ==================================================================== */}
      {activeView === "templates" && (
        <TemplateListClient
          templates={templates}
          departments={departments}
          jobLevels={jobLevels}
          jobPositions={jobPositions}
          categories={categories}
          parameters={parameters}
          bands={bands}
          employees={employees}
          activePeriod={activePeriod}
          periods={periods}
          existingAppraisals={existingAppraisals}
          templateUsageMap={templateUsageMap}
          assignmentOverview={assignmentOverview}
          createAction={createTemplateAction}
          deleteAction={deleteTemplateAction}
          deleteBulkAction={deleteTemplatesBulkAction}
          updateAction={updateTemplateAction}
          assignAction={assignTemplateAction}
          duplicateAction={duplicateTemplateAction}
          selectedDept={selectedDept}
          onDeptChange={handleDeptChange}
          pits={pits}
          departmentMappings={departmentMappings}
        />
      )}

      {/* ==================================================================== */}
      {/* 3. DETAIL MASTER PARAMETER (FOKUS KE MASTER INI SAJA)                */}
      {/* ==================================================================== */}
      {activeView === "parameters" && (
        <MasterParametersTableClient
          parameters={masterParameters}
          departments={departments}
          createAction={createMasterParamAction}
          updateAction={updateMasterParamAction}
          deleteAction={deleteMasterParamAction}
          deleteBulkAction={deleteMasterParamBulkAction}
          importBulkAction={importBulkMasterParamAction}
          resetAndSyncFromTemplatesAction={resetAndSyncFromTemplatesAction}
          selectedDeptFilter={selectedDept}
          onDeptFilterChange={handleDeptChange}
        />
      )}
    </div>
  );
}
