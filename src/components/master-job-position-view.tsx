"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Department, Employee, JobLevel, JobPosition, JobCategory } from "@/db/schema";
import type { JobPositionMappingWithDetails } from "@/lib/job-position-mapping-actions";
import { JobPositionTableClient } from "./master-tables-client";
import { JobPositionMappingTableClient } from "./job-position-mapping-table-client";
import { Briefcase, Network } from "lucide-react";

interface MasterJobPositionViewProps {
  jobPositions: JobPosition[];
  departments: Department[];
  jobLevels: JobLevel[];
  employees: Employee[];
  jobCategories: JobCategory[];
  mappings: JobPositionMappingWithDetails[];
  initialSubtab?: string;
  createAction: (fd: FormData) => Promise<void>;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  importAction?: (
    items: { code?: string; name: string; departmentCode?: string; jobLevelCode?: string; description?: string }[]
  ) => Promise<{ count: number }>;
}

export function MasterJobPositionView({
  jobPositions,
  departments,
  jobLevels,
  employees,
  jobCategories,
  mappings,
  initialSubtab = "positions",
  createAction,
  updateAction,
  deleteAction,
  importAction,
}: MasterJobPositionViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSubtabFromUrl = searchParams.get("subtab");
  const normalizedInitial =
    currentSubtabFromUrl === "mapping" || currentSubtabFromUrl === "mapping-job-level"
      ? "mapping"
      : initialSubtab === "mapping"
      ? "mapping"
      : "positions";

  const [activeSubtab, setActiveSubtab] = useState<"positions" | "mapping">(normalizedInitial);

  useEffect(() => {
    const s = searchParams.get("subtab");
    if (s === "mapping" || s === "mapping-job-level") {
      setActiveSubtab("mapping");
    } else {
      setActiveSubtab("positions");
    }
  }, [searchParams]);

  const handleTabChange = (tab: "positions" | "mapping") => {
    setActiveSubtab(tab);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "jabatan");
    params.set("subtab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const unmappedCount = mappings.filter((m) => !m.isMapped).length;

  return (
    <div className="space-y-4">
      {/* Subtab Navigation: Clean, High Contrast, No excessive icon slop */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div
          role="tablist"
          aria-label="Master Job Position Subtabs"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-2xs flex-wrap sm:flex-nowrap"
        >
          {/* Subtab 1: Daftar Job Position */}
          <button
            type="button"
            role="tab"
            aria-selected={activeSubtab === "positions"}
            onClick={() => handleTabChange("positions")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition cursor-pointer ${
              activeSubtab === "positions"
                ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 font-medium hover:bg-white/50"
            }`}
          >
            <Briefcase className={`w-3.5 h-3.5 ${activeSubtab === "positions" ? "text-slate-900" : "text-slate-500"}`} />
            <span>Job Position</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              {jobPositions.length}
            </span>
          </button>

          {/* Subtab 2: Mapping Job Level */}
          <button
            type="button"
            role="tab"
            aria-selected={activeSubtab === "mapping"}
            onClick={() => handleTabChange("mapping")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition cursor-pointer ${
              activeSubtab === "mapping"
                ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 font-medium hover:bg-white/50"
            }`}
          >
            <Network className={`w-3.5 h-3.5 ${activeSubtab === "mapping" ? "text-slate-900" : "text-slate-500"}`} />
            <span>Mapping Job Level</span>
            {unmappedCount > 0 ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {unmappedCount} Belum Lengkap
              </span>
            ) : (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                Lengkap
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content Rendering based on Active Subtab */}
      {activeSubtab === "positions" && (
        <JobPositionTableClient
          jobPositions={jobPositions}
          departments={departments}
          jobLevels={jobLevels}
          employees={employees}
          createAction={createAction}
          updateAction={updateAction}
          deleteAction={deleteAction}
          importAction={importAction}
        />
      )}

      {activeSubtab === "mapping" && (
        <JobPositionMappingTableClient
          initialMappings={mappings}
          departments={departments}
          jobLevels={jobLevels}
          jobCategories={jobCategories}
        />
      )}
    </div>
  );
}
