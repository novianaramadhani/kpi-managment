"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Department, Employee, DepartmentHead, Pit } from "@/db/schema";
import { DepartmentTableClient } from "./master-tables-client";
import { HeadDepartmentTableClient } from "./head-department-table-client";
import { Building2, UserCheck } from "lucide-react";

import type { ParsedHeadDepartmentRow } from "@/lib/excel-master";
import type {
  DepartmentMappingWithDetails,
  ParsedDepartmentMappingItem,
  SmartDepartmentImportPayload,
  SmartDepartmentImportResult,
} from "@/lib/department-mapping-utils";

interface MasterDepartmentViewProps {
  departments: Department[];
  employees: Employee[];
  departmentHeads: DepartmentHead[];
  mappings?: DepartmentMappingWithDetails[];
  pits?: Pit[];
  sites?: { id: number; code: string; name: string }[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  initialSubtab?: string;
  initialDeptId?: number | null;
  createDepartmentAction: (fd: FormData) => Promise<void>;
  updateDepartmentAction?: (fd: FormData) => Promise<void>;
  deleteDepartmentAction: (fd: FormData) => Promise<void>;
  batchDeleteDepartmentAction?: (ids: number[]) => Promise<{ count: number; skipped: number; errors: string[] }>;
  importDepartmentsAction?: (items: { code: string; name: string }[]) => Promise<{ count: number }>;
  smartImportDepartmentAction?: (payload: SmartDepartmentImportPayload) => Promise<SmartDepartmentImportResult>;
  createHeadDeptAction: (fd: FormData) => Promise<{ success: boolean; id?: number }>;
  updateHeadDeptAction: (fd: FormData) => Promise<{ success: boolean }>;
  deleteHeadDeptAction: (fd: FormData) => Promise<{ success: boolean }>;
  toggleHeadDeptStatusAction: (id: number, status: string) => Promise<{ success: boolean }>;
  importHeadDeptAction?: (items: ParsedHeadDepartmentRow[]) => Promise<{ count: number }>;
  createMappingAction?: (fd: FormData) => Promise<{ success: boolean; id: number; error?: string }>;
  updateMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
  deleteMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
  batchDeleteMappingAction?: (ids: number[]) => Promise<{ count: number }>;
  batchAssignMappingAction?: (mappingIds: number[], departmentId: number) => Promise<{ count: number }>;
  importMappingAction?: (
    items: ParsedDepartmentMappingItem[]
  ) => Promise<{ count: number; updatedCount: number; errors: string[] }>;
}

export function MasterDepartmentView({
  departments,
  employees,
  departmentHeads,
  mappings = [],
  pits = [],
  sites,
  operatingUnits,
  initialSubtab = "department",
  createDepartmentAction,
  updateDepartmentAction,
  deleteDepartmentAction,
  batchDeleteDepartmentAction,
  importDepartmentsAction,
  smartImportDepartmentAction,
  createHeadDeptAction,
  updateHeadDeptAction,
  deleteHeadDeptAction,
  toggleHeadDeptStatusAction,
  importHeadDeptAction,
  createMappingAction,
  updateMappingAction,
  deleteMappingAction,
  batchDeleteMappingAction,
  batchAssignMappingAction,
  importMappingAction,
}: MasterDepartmentViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Normalize subtab
  const currentSubtabFromUrl = searchParams.get("subtab");
  const normalizedInitial =
    currentSubtabFromUrl === "head-department" || currentSubtabFromUrl === "head_dept"
      ? "head-department"
      : initialSubtab === "head-department"
      ? "head-department"
      : "department";

  const [activeSubtab, setActiveSubtab] = useState<"department" | "head-department">(normalizedInitial);
  const [filterDeptIdForHeadTab, setFilterDeptIdForHeadTab] = useState<number | null>(null);

  // Sync state with URL when back/forward is used
  useEffect(() => {
    const s = searchParams.get("subtab");
    if (s === "head-department" || s === "head_dept") {
      setActiveSubtab("head-department");
    } else {
      setActiveSubtab("department");
    }
  }, [searchParams]);

  const handleTabChange = (tab: "department" | "head-department") => {
    setActiveSubtab(tab);
    setFilterDeptIdForHeadTab(null);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "departemen");
    params.set("subtab", tab);
    params.delete("dept");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleManageHeadDeptFromDeptTab = (deptId: number) => {
    setFilterDeptIdForHeadTab(deptId);
    setActiveSubtab("head-department");

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "departemen");
    params.set("subtab", "head-department");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      {/* 2 Tabs Navigation for Master Department (Mapping Departemen terintegrasi di dalam Detail Departemen) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div
          role="tablist"
          aria-label="Master Department Subtabs"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-2xs flex-wrap sm:flex-nowrap"
        >
          {/* Tab 1: Department */}
          <button
            type="button"
            role="tab"
            aria-selected={activeSubtab === "department"}
            onClick={() => handleTabChange("department")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition cursor-pointer ${
              activeSubtab === "department"
                ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 font-medium hover:bg-white/50"
            }`}
          >
            <Building2 className={`w-3.5 h-3.5 ${activeSubtab === "department" ? "text-slate-900" : "text-slate-500"}`} />
            <span>Departemen</span>
          </button>

          {/* Tab 2: Head Department */}
          <button
            type="button"
            role="tab"
            aria-selected={activeSubtab === "head-department"}
            onClick={() => handleTabChange("head-department")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition cursor-pointer ${
              activeSubtab === "head-department"
                ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 font-medium hover:bg-white/50"
            }`}
          >
            <UserCheck
              className={`w-3.5 h-3.5 ${activeSubtab === "head-department" ? "text-slate-900" : "text-slate-500"}`}
            />
            <span>Head Department</span>
          </button>
        </div>

        {/* Tab Context Helper Note */}
        <div className="text-[11px] text-slate-500 hidden md:block">
          {activeSubtab === "department" ? (
            <span>Master data resmi departemen, jumlah karyawan, dan kelola mapping nama asli.</span>
          ) : (
            <span>Penugasan pejabat Head Department per Site.</span>
          )}
        </div>
      </div>

      {/* Tab 1 Content: Department (Master Data: Kode | Nama Departemen | Total Karyawan | Aksi) */}
      {activeSubtab === "department" && (
        <DepartmentTableClient
          departments={departments}
          employees={employees}
          departmentHeads={departmentHeads}
          mappings={mappings}
          pits={pits}
          sites={sites}
          operatingUnits={operatingUnits}
          createAction={createDepartmentAction}
          updateAction={updateDepartmentAction}
          deleteAction={deleteDepartmentAction}
          batchDeleteAction={batchDeleteDepartmentAction}
          importAction={importDepartmentsAction}
          smartImportAction={smartImportDepartmentAction}
          onManageHeadDept={handleManageHeadDeptFromDeptTab}
          createMappingAction={createMappingAction}
          updateMappingAction={updateMappingAction}
          deleteMappingAction={deleteMappingAction}
        />
      )}

      {/* Tab 2 Content: Head Department (Assignment per OU & CRUD) */}
      {activeSubtab === "head-department" && (
        <HeadDepartmentTableClient
          departmentHeads={departmentHeads}
          departments={departments}
          employees={employees}
          operatingUnits={operatingUnits}
          initialDepartmentFilter={filterDeptIdForHeadTab}
          createAction={createHeadDeptAction}
          updateAction={updateHeadDeptAction}
          deleteAction={deleteHeadDeptAction}
          toggleStatusAction={toggleHeadDeptStatusAction}
          importAction={importHeadDeptAction}
          onSwitchToDepartmentTab={() => handleTabChange("department")}
        />
      )}
    </div>
  );
}
