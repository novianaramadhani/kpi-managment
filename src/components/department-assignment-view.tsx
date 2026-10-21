"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Department, Employee, JobLevel, KpiPeriod, KpiTemplate } from "@/db/schema";
import {
  Search,
  ChevronDown,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { TemplateAssignmentDrawer, prefetchTemplateAssignment } from "@/components/template-assignment-drawer";

export interface InstalledTemplateItem {
  deptId: number | null;
  templateId: number | null;
  templateName: string;
  employeeCount: number;
}

export interface ParameterItem {
  id: number;
  name: string;
  weight: string | number;
  templateId: number;
  templateName: string;
  indicatorCount?: number;
}

interface DepartmentAssignmentViewProps {
  periods: KpiPeriod[];
  departments: Department[];
  jobLevels: JobLevel[];
  employees?: Employee[];
  templates: KpiTemplate[];
  parameters?: ParameterItem[];
  installedTemplates: InstalledTemplateItem[];
}

export function DepartmentAssignmentView({
  periods,
  departments,
  jobLevels,
  templates,
  installedTemplates: initialInstalled,
}: DepartmentAssignmentViewProps) {
  const router = useRouter();
  const activePeriod = periods.find((p) => p.status === "ACTIVE") || periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod ? activePeriod.id : 0);

  // Prefetch active templates on mount to eliminate drawer loading latency
  React.useEffect(() => {
    const published = templates.filter((t) => t.isActive);
    for (const t of published) {
      prefetchTemplateAssignment(t.id, selectedPeriodId);
    }
  }, [templates, selectedPeriodId]);

  // Top Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [installed, setInstalled] = useState<InstalledTemplateItem[]>(initialInstalled);

  // Drawer state for unified TemplateAssignmentDrawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDrawerTemplateId, setSelectedDrawerTemplateId] = useState<number | null>(null);
  const [initialDrawerTab, setInitialDrawerTab] = useState<"EMPLOYEES" | "ASSESSORS">("EMPLOYEES");

  // Maps
  const jobLevelMap = useMemo(() => {
    const map = new Map<number, JobLevel>();
    for (const lvl of jobLevels) map.set(lvl.id, lvl);
    return map;
  }, [jobLevels]);

  const installedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of installed) {
      if (item.deptId !== null && item.templateId !== null) {
        map.set(`${item.deptId}_${item.templateId}`, item.employeeCount);
      }
    }
    return map;
  }, [installed]);

  // Group templates by department
  const templatesByDept = useMemo(() => {
    const map = new Map<number, KpiTemplate[]>();
    for (const t of templates) {
      if (t.departmentId) {
        if (!map.has(t.departmentId)) map.set(t.departmentId, []);
        map.get(t.departmentId)!.push(t);
      }
    }
    return map;
  }, [templates]);

  // Accordion state
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (const d of departments) {
      const tpls = templatesByDept.get(d.id) || [];
      if (tpls.length > 0) initial.add(d.id);
    }
    return initial;
  });

  const toggleDeptExpand = (deptId: number) => {
    setExpandedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  // Filtered departments and templates
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return departments.filter((d) => {
      if (deptFilter !== "ALL" && d.id !== Number(deptFilter)) return false;

      let deptTpls = templatesByDept.get(d.id) || [];

      if (levelFilter !== "ALL") {
        deptTpls = deptTpls.filter((t) => t.jobLevelId === Number(levelFilter));
      }
      if (statusFilter !== "ALL") {
        const isTargetActive = statusFilter === "ACTIVE";
        deptTpls = deptTpls.filter((t) => t.isActive === isTargetActive);
      }

      if (!q) {
        if (levelFilter !== "ALL" || statusFilter !== "ALL") {
          return deptTpls.length > 0;
        }
        return true;
      }

      const matchDept = d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
      const matchTpl = deptTpls.some((t) => t.name.toLowerCase().includes(q));
      return matchDept || matchTpl;
    });
  }, [departments, searchQuery, deptFilter, levelFilter, statusFilter, templatesByDept]);

  const handleOpenAssignTemplate = (templateId: number) => {
    setSelectedDrawerTemplateId(templateId);
    setInitialDrawerTab("EMPLOYEES");
    setIsDrawerOpen(true);
  };

  const handleOpenAssignPenilai = (templateId: number) => {
    setSelectedDrawerTemplateId(templateId);
    setInitialDrawerTab("ASSESSORS");
    setIsDrawerOpen(true);
  };

  const handleDrawerSaved = (summary: { assignedCount: number }) => {
    if (selectedDrawerTemplateId) {
      const tpl = templates.find((t) => t.id === selectedDrawerTemplateId);
      if (tpl && tpl.departmentId) {
        setInstalled((prev) => {
          const filtered = prev.filter(
            (p) => !(p.deptId === tpl.departmentId && p.templateId === tpl.id)
          );
          return [
            ...filtered,
            {
              deptId: tpl.departmentId,
              templateId: tpl.id,
              templateName: tpl.name,
              employeeCount: summary.assignedCount,
            },
          ];
        });
      }
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* FILTER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari departemen atau template..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Departemen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>

          {/* Job Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Job Level</option>
            {jobLevels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif (Published)</option>
            <option value="INACTIVE">Draft (Nonaktif)</option>
          </select>
        </div>

        {/* Periode Indicator */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-500">
          <span>Periode:</span>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="font-semibold text-slate-800 bg-slate-100 rounded-lg px-2 py-1 text-xs border border-slate-200 focus:outline-none cursor-pointer"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.year} {p.status === "ACTIVE" ? "(Aktif)" : `(${p.status})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DEPARTMENT ACCORDION LIST */}
      <div className="space-y-3">
        {filteredDepartments.map((dept) => {
          let deptTpls = templatesByDept.get(dept.id) || [];
          if (levelFilter !== "ALL") {
            deptTpls = deptTpls.filter((t) => t.jobLevelId === Number(levelFilter));
          }
          if (statusFilter !== "ALL") {
            deptTpls = deptTpls.filter((t) => t.isActive === (statusFilter === "ACTIVE"));
          }
          const isExpanded = expandedDeptIds.has(dept.id);

          return (
            <div
              key={dept.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
            >
              {/* Department Header */}
              <button
                type="button"
                onClick={() => toggleDeptExpand(dept.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-slate-50/70 transition text-left cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{dept.name}</span>
                  <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {dept.code}
                  </span>
                </div>

                <div className="text-xs text-slate-400 font-medium">
                  {deptTpls.length} template
                </div>
              </button>

              {/* Template Items */}
              {isExpanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {deptTpls.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Belum ada template KPI pada departemen ini.
                    </div>
                  ) : (
                    deptTpls.map((tpl) => {
                      const levelName = tpl.jobLevelId ? jobLevelMap.get(tpl.jobLevelId)?.name || "Semua Level" : "Semua Level";
                      const assignedCount = installedCountMap.get(`${dept.id}_${tpl.id}`) || 0;

                      return (
                        <div
                          key={tpl.id}
                          className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition group"
                        >
                          {/* Left: Template Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-900 truncate">{tpl.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                <span>{levelName}</span>
                                <span>·</span>
                                <span className={tpl.isActive ? "text-emerald-600 font-medium" : "text-slate-400 font-medium"}>
                                  {tpl.isActive ? "Published" : "Draft"}
                                </span>
                                {assignedCount > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="text-slate-400 font-normal">
                                      Terpasang: <b className="text-slate-600 font-semibold">{assignedCount}</b> karyawan
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Penilai Action */}
                            <button
                              type="button"
                              onMouseEnter={() => tpl.isActive && prefetchTemplateAssignment(tpl.id, selectedPeriodId)}
                              onClick={() => handleOpenAssignPenilai(tpl.id)}
                              title="Konfigurasi Asesor Penilai"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-medium transition cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Penilai</span>
                            </button>

                            {/* Assign Template Primary Action */}
                            <button
                              type="button"
                              onMouseEnter={() => tpl.isActive && prefetchTemplateAssignment(tpl.id, selectedPeriodId)}
                              onClick={() => handleOpenAssignTemplate(tpl.id)}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50/80 text-blue-600 text-xs font-semibold transition active:scale-95 cursor-pointer"
                            >
                              <span>Tugaskan</span>
                              <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredDepartments.length === 0 && (
          <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-400">
            Tidak ada departemen yang sesuai dengan kriteria filter.
          </div>
        )}
      </div>

      {/* UNIFIED TEMPLATE & ASSESSOR ASSIGNMENT DRAWER */}
      <TemplateAssignmentDrawer
        templateId={selectedDrawerTemplateId}
        isOpen={isDrawerOpen}
        initialTab={initialDrawerTab}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDrawerTemplateId(null);
        }}
        onSaved={handleDrawerSaved}
      />
    </div>
  );
}
