"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  X,
  Search,
  Users,
  UserCheck,
  Info,
  Download,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Edit3,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Swal from "sweetalert2";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import type {
  TemplateAssignmentDrawerData,
  DrawerEmployeeItem,
  DrawerNikOverrideItem,
} from "@/lib/template-assignment-service";

export interface DeptOuGroup {
  key: string;
  departmentId: number;
  departmentName: string;
  operatingUnit: string;
  employeeCount: number;
  employees: DrawerEmployeeItem[];
  defaultHeadDeptId: number | null;
  defaultHeadDeptName: string | null;
  defaultHeadDeptNik: string | null;
  defaultHeadDeptPosition: string | null;
  isHeadDeptFound: boolean;
  hasDelegation?: boolean;
  delegationDelegateeName?: string | null;
}

export interface GroupAssessorAssignment {
  assessorId: number;
  assessorName: string;
  assessorNik: string;
  assessorPosition?: string | null;
  isCustom: boolean;
}

interface TemplateAssignmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: number | null;
  periodId?: number;
  initialTab?: "EMPLOYEES" | "ASSESSORS" | "KARYAWAN" | "PENILAI";
  onSuccess?: () => void;
  onSaved?: (summary: { assignedCount: number }) => void;
}

// Client-side in-memory cache to eliminate loading delays when opening drawers
const drawerDataCache = new Map<string, TemplateAssignmentDrawerData>();

/**
 * Pre-fetch template assignment data so it is ready instantly when clicked.
 */
export async function prefetchTemplateAssignment(templateId: number, periodId?: number) {
  if (!templateId) return;
  const key = `${templateId}_${periodId || "default"}`;
  if (drawerDataCache.has(key)) return;

  try {
    let url = `/api/admin/template-assignment-drawer?templateId=${templateId}`;
    if (periodId) url += `&periodId=${periodId}`;
    const res = await fetch(url);
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      drawerDataCache.set(key, json.data);
    }
  } catch {
    // Silently ignore prefetch errors
  }
}

export function TemplateAssignmentDrawer({
  isOpen,
  onClose,
  templateId,
  periodId,
  initialTab = "PENILAI",
  onSuccess,
  onSaved,
}: TemplateAssignmentDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Cache key
  const cacheKey = templateId ? `${templateId}_${periodId || "default"}` : "";

  // Loading state (starts false if cached)
  const [isLoading, setIsLoading] = useState(!drawerDataCache.has(cacheKey));
  const [drawerData, setDrawerData] = useState<TemplateAssignmentDrawerData | null>(
    drawerDataCache.get(cacheKey) || null
  );

  // Active Tab: "KARYAWAN" (Assign ke Karyawan) | "PENILAI" (Review Penilai)
  const [activeTab, setActiveTab] = useState<"KARYAWAN" | "PENILAI">(
    initialTab === "KARYAWAN" || initialTab === "EMPLOYEES" ? "KARYAWAN" : "PENILAI"
  );

  // Tab 1 (Assign ke Karyawan) States
  const [selectedJobLevelFilter, setSelectedJobLevelFilter] = useState<number | "ALL">("ALL");
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);

  // Tab 2 (Review Penilai) States
  const [penilaiSearch, setPenilaiSearch] = useState("");
  const [penilaiStatusFilter, setPenilaiStatusFilter] = useState<"ALL" | "COMPLETE" | "CUSTOM" | "INCOMPLETE">("ALL");
  const [customGroupAssessors, setCustomGroupAssessors] = useState<Record<string, GroupAssessorAssignment>>({});
  const [editingGroup, setEditingGroup] = useState<DeptOuGroup | null>(null);
  const [selectedAssessorId, setSelectedAssessorId] = useState<number | "">("");
  const [assessorModalSearch, setAssessorModalSearch] = useState("");
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // Helper to initialize state from loaded data
  const applyDrawerData = (data: TemplateAssignmentDrawerData) => {
    setDrawerData(data);

    // Initial employee selection:
    const thisAssignedIds = data.employees.filter((e) => e.isAssignedToThisTemplate).map((e) => e.id);
    if (thisAssignedIds.length > 0) {
      setSelectedEmpIds(thisAssignedIds);
    } else {
      const matchingLevelUnassigned = data.employees
        .filter((e) => e.matchesJobLevel && !e.isAssignedToOtherTemplate)
        .map((e) => e.id);
      setSelectedEmpIds(matchingLevelUnassigned);
    }

    // Default Job Level Filter: match template's target level if available
    const hasMatchingLevel = data.employees.some((e) => e.matchesJobLevel);
    if (hasMatchingLevel && data.template.jobLevelId) {
      setSelectedJobLevelFilter(data.template.jobLevelId);
    } else {
      setSelectedJobLevelFilter("ALL");
    }

    // Initialize custom group assessors from existing nikOverrides
    const initialCustomAssessors: Record<string, GroupAssessorAssignment> = {};
    if (data.nikOverrides && data.nikOverrides.length > 0) {
      for (const ov of data.nikOverrides) {
        const emp = data.employees.find((e) => e.id === ov.employeeId);
        if (emp) {
          const ou = (emp.operatingUnit || "HO").trim().toUpperCase();
          const groupKey = `${emp.departmentId}_${ou}`;
          if (!initialCustomAssessors[groupKey]) {
            initialCustomAssessors[groupKey] = {
              assessorId: ov.assessorId,
              assessorName: ov.assessorName,
              assessorNik: ov.assessorNik,
              assessorPosition: "Penilai Disesuaikan",
              isCustom: true,
            };
          }
        }
      }
    }
    setCustomGroupAssessors(initialCustomAssessors);
  };

  // Fetch drawer data with zero-delay cache support
  const fetchDrawerData = async (forceSpinner = false) => {
    if (!templateId) return;
    const currentKey = `${templateId}_${periodId || "default"}`;
    const cached = drawerDataCache.get(currentKey);

    if (cached && !forceSpinner) {
      applyDrawerData(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      let url = `/api/admin/template-assignment-drawer?templateId=${templateId}`;
      if (periodId) url += `&periodId=${periodId}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal memuat data penugasan template.");
      }

      const data: TemplateAssignmentDrawerData = json.data;
      drawerDataCache.set(currentKey, data);

      if (!cached || forceSpinner) {
        applyDrawerData(data);
      } else {
        setDrawerData(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      if (!cached) {
        void Swal.fire({
          icon: "error",
          title: "Gagal Memuat",
          text: msg,
          confirmButtonColor: "#2563eb",
        });
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && templateId) {
      if (initialTab === "KARYAWAN" || initialTab === "EMPLOYEES") {
        setActiveTab("KARYAWAN");
      } else {
        setActiveTab("PENILAI");
      }
      setEmpSearch("");
      setPenilaiSearch("");
      setPenilaiStatusFilter("ALL");
      setEditingGroup(null);
      setSelectedAssessorId("");
      setAssessorModalSearch("");
      setExpandedGroupKeys(new Set());
      fetchDrawerData();
    }
  }, [isOpen, templateId, periodId, initialTab]);

  // Derived: Unique Job Levels available in this department
  const availableJobLevels = useMemo(() => {
    if (!drawerData) return [];
    const map = new Map<
      number,
      { id: number; name: string; count: number; isTemplateLevel: boolean }
    >();

    for (const emp of drawerData.employees) {
      const existing = map.get(emp.jobLevelId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(emp.jobLevelId, {
          id: emp.jobLevelId,
          name: emp.jobLevelName,
          count: 1,
          isTemplateLevel: emp.jobLevelId === drawerData.template.jobLevelId,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [drawerData]);

  // Derived: Filtered Employees in Tab Karyawan
  const filteredEmployees = useMemo(() => {
    if (!drawerData) return [];
    const q = empSearch.toLowerCase().trim();

    return drawerData.employees.filter((emp) => {
      if (selectedJobLevelFilter !== "ALL" && emp.jobLevelId !== selectedJobLevelFilter) {
        return false;
      }
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.nik.toLowerCase().includes(q) ||
        (emp.jobPosition && emp.jobPosition.toLowerCase().includes(q)) ||
        emp.jobLevelName.toLowerCase().includes(q) ||
        (emp.operatingUnit && emp.operatingUnit.toLowerCase().includes(q))
      );
    });
  }, [drawerData, selectedJobLevelFilter, empSearch]);

  const selectableFiltered = useMemo(
    () => filteredEmployees.filter((e) => !e.isAssignedToOtherTemplate),
    [filteredEmployees]
  );

  const isAllFilteredSelected = useMemo(
    () =>
      selectableFiltered.length > 0 &&
      selectableFiltered.every((e) => selectedEmpIds.includes(e.id)),
    [selectableFiltered, selectedEmpIds]
  );

  // Toggle single employee checkbox
  const handleToggleEmployee = (emp: DrawerEmployeeItem) => {
    if (emp.isAssignedToOtherTemplate) return;
    setSelectedEmpIds((prev) =>
      prev.includes(emp.id) ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]
    );
  };

  // Toggle select all visible selectable employees in current filter
  const handleToggleSelectFiltered = () => {
    const visibleIds = selectableFiltered.map((e) => e.id);
    if (isAllFilteredSelected) {
      setSelectedEmpIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedEmpIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Derived: Assigned Employees (Target of Penilai Review)
  const assignedEmployees = useMemo(() => {
    if (!drawerData) return [];
    return drawerData.employees.filter((e) => selectedEmpIds.includes(e.id));
  }, [drawerData, selectedEmpIds]);

  // Derived: Department & Operating Unit (OU) Groups for Tab 2
  const assignedDeptOuGroups = useMemo<DeptOuGroup[]>(() => {
    if (!drawerData) return [];
    const map = new Map<string, DeptOuGroup>();

    // If employees are assigned, group them. Otherwise group all department employees so user can preview default head depts.
    const empsToGroup = assignedEmployees.length > 0 ? assignedEmployees : drawerData.employees;

    for (const emp of empsToGroup) {
      const ou = (emp.operatingUnit || "HO").trim().toUpperCase();
      const key = `${emp.departmentId}_${ou}`;

      const existing = map.get(key);
      if (existing) {
        existing.employeeCount += 1;
        existing.employees.push(emp);
      } else {
        map.set(key, {
          key,
          departmentId: emp.departmentId,
          departmentName: emp.departmentName,
          operatingUnit: ou,
          employeeCount: 1,
          employees: [emp],
          defaultHeadDeptId: emp.headDeptId,
          defaultHeadDeptName: emp.headDeptName,
          defaultHeadDeptNik: emp.headDeptNik ?? null,
          defaultHeadDeptPosition: emp.headDeptPosition ?? null,
          isHeadDeptFound: emp.isHeadDeptFound,
          hasDelegation: emp.hasDelegation,
          delegationDelegateeName: emp.delegationDelegateeName ?? null,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName) || a.operatingUnit.localeCompare(b.operatingUnit)
    );
  }, [drawerData, assignedEmployees]);

  // Helper to get effective assessor for a group
  const getGroupEffectiveAssessor = (group: DeptOuGroup): GroupAssessorAssignment | null => {
    if (customGroupAssessors[group.key]) {
      return customGroupAssessors[group.key];
    }
    if (group.isHeadDeptFound && group.defaultHeadDeptId && group.defaultHeadDeptName) {
      return {
        assessorId: group.defaultHeadDeptId,
        assessorName: group.defaultHeadDeptName,
        assessorNik: group.defaultHeadDeptNik || "-",
        assessorPosition: group.defaultHeadDeptPosition || "Head Department",
        isCustom: false,
      };
    }
    return null;
  };

  // Metrics for Tab Penilai
  const completeGroupsCount = useMemo(() => {
    return assignedDeptOuGroups.filter((g) => {
      const eff = getGroupEffectiveAssessor(g);
      return eff !== null && !eff.isCustom;
    }).length;
  }, [assignedDeptOuGroups, customGroupAssessors]);

  const customGroupsCount = useMemo(() => {
    return assignedDeptOuGroups.filter((g) => {
      const eff = getGroupEffectiveAssessor(g);
      return eff !== null && eff.isCustom;
    }).length;
  }, [assignedDeptOuGroups, customGroupAssessors]);

  const incompleteGroupsCount = useMemo(() => {
    return assignedDeptOuGroups.filter((g) => getGroupEffectiveAssessor(g) === null).length;
  }, [assignedDeptOuGroups, customGroupAssessors]);

  const incompleteEmployeesCount = useMemo(() => {
    return assignedDeptOuGroups
      .filter((g) => getGroupEffectiveAssessor(g) === null)
      .reduce((sum, g) => sum + g.employeeCount, 0);
  }, [assignedDeptOuGroups, customGroupAssessors]);

  // Filtered review groups based on search and status
  const filteredGroups = useMemo(() => {
    const q = penilaiSearch.toLowerCase().trim();

    return assignedDeptOuGroups.filter((group) => {
      const eff = getGroupEffectiveAssessor(group);
      const status: "COMPLETE" | "CUSTOM" | "INCOMPLETE" = !eff
        ? "INCOMPLETE"
        : eff.isCustom
        ? "CUSTOM"
        : "COMPLETE";

      if (penilaiStatusFilter !== "ALL" && status !== penilaiStatusFilter) {
        return false;
      }

      if (!q) return true;

      const matchDept = group.departmentName.toLowerCase().includes(q);
      const matchOu = group.operatingUnit.toLowerCase().includes(q);
      const matchAssessor =
        eff &&
        (eff.assessorName.toLowerCase().includes(q) ||
          eff.assessorNik.toLowerCase().includes(q) ||
          (eff.assessorPosition && eff.assessorPosition.toLowerCase().includes(q)));
      const matchEmp = group.employees.some(
        (e) => e.name.toLowerCase().includes(q) || e.nik.toLowerCase().includes(q)
      );

      return matchDept || matchOu || matchAssessor || matchEmp;
    });
  }, [assignedDeptOuGroups, penilaiSearch, penilaiStatusFilter, customGroupAssessors]);

  // Filtered assessor options in modal
  const filteredAssessorOptions = useMemo(() => {
    if (!drawerData) return [];
    const q = assessorModalSearch.toLowerCase().trim();
    if (!q) return drawerData.assessorOptions;

    return drawerData.assessorOptions.filter((a) => {
      return (
        a.name.toLowerCase().includes(q) ||
        a.nik.toLowerCase().includes(q) ||
        (a.jobPosition && a.jobPosition.toLowerCase().includes(q)) ||
        (a.departmentName && a.departmentName.toLowerCase().includes(q))
      );
    });
  }, [drawerData, assessorModalSearch]);

  // Modal Handlers
  const handleOpenEditGroupModal = (group: DeptOuGroup) => {
    setEditingGroup(group);
    const eff = getGroupEffectiveAssessor(group);
    setSelectedAssessorId(eff ? eff.assessorId : "");
    setAssessorModalSearch("");
  };

  const handleSaveGroupAssessor = () => {
    if (!editingGroup || !selectedAssessorId || !drawerData) return;

    const assessorObj = drawerData.assessorOptions.find((a) => a.id === Number(selectedAssessorId));
    if (!assessorObj) return;

    const isDefault = editingGroup.defaultHeadDeptId === assessorObj.id;

    setCustomGroupAssessors((prev) => ({
      ...prev,
      [editingGroup.key]: {
        assessorId: assessorObj.id,
        assessorName: assessorObj.name,
        assessorNik: assessorObj.nik,
        assessorPosition: assessorObj.jobPosition,
        isCustom: !isDefault,
      },
    }));

    setEditingGroup(null);
    setSelectedAssessorId("");
    setAssessorModalSearch("");
  };

  const handleResetGroupAssessor = (groupKey: string) => {
    setCustomGroupAssessors((prev) => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  };

  // Export Review Excel Handler
  const handleExportReviewExcel = () => {
    if (!drawerData) return;

    if (assignedEmployees.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Tidak Ada Data",
        text: "Belum ada karyawan yang ditugaskan pada template ini.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const rows = assignedEmployees.map((emp, idx) => {
      const ou = (emp.operatingUnit || "HO").trim().toUpperCase();
      const groupKey = `${emp.departmentId}_${ou}`;
      const group = assignedDeptOuGroups.find((g) => g.key === groupKey);
      const eff = group ? getGroupEffectiveAssessor(group) : null;

      let penilaiNik = "-";
      let penilaiName = "Penilai belum ditentukan";
      let penilaiPosition = "-";
      let penilaiStatus = "Belum Ditentukan";
      let keterangan = "Belum ada Head Department aktif di unit ini";

      if (eff) {
        penilaiNik = eff.assessorNik;
        penilaiName = eff.assessorName;
        penilaiPosition = eff.assessorPosition || (eff.isCustom ? "Penilai Disesuaikan" : "Head Department");
        penilaiStatus = eff.isCustom ? "Penilai Disesuaikan" : "Lengkap (Head Dept)";
        keterangan = eff.isCustom
          ? "Ditetapkan melalui penyesuaian penilai unit"
          : emp.hasDelegation
          ? `Delegasi aktif ke: ${emp.delegationDelegateeName || "Asesor Pengganti"}`
          : "Sesuai Master Head Department";
      }

      return {
        "No": idx + 1,
        "NIK Karyawan": emp.nik,
        "Nama Karyawan": emp.name,
        "Jabatan Karyawan": emp.jobPosition || "-",
        "Job Level": emp.jobLevelName,
        "Departemen": emp.departmentName,
        "Site": emp.operatingUnit || "HO",
        "Status Penilai": penilaiStatus,
        "NIK Penilai": penilaiNik,
        "Nama Penilai": penilaiName,
        "Jabatan Penilai": penilaiPosition,
        "Keterangan / Delegasi": keterangan,
        "Template KPI": drawerData.template.name,
        "Periode": `${drawerData.period.year} (${drawerData.period.name})`,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 26 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 26 },
      { wch: 24 },
      { wch: 34 },
      { wch: 28 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Review Penilai KPI");
    const safeTemplateName = drawerData.template.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `Review_Penilai_${safeTemplateName}_Periode_${drawerData.period.year}.xlsx`);
  };

  // Primary Save Handler
  const handleSaveAssignment = async () => {
    if (!drawerData) return;

    if (selectedEmpIds.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Pilih Karyawan",
        text: "Pilih minimal 1 karyawan untuk ditugaskan template ini.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    // Check if there are groups with missing Head Department
    if (incompleteGroupsCount > 0) {
      const result = await Swal.fire({
        title: "Penilai Belum Ditentukan",
        html: `Terdapat <b>${incompleteGroupsCount} unit kerja (${incompleteEmployeesCount} karyawan)</b> yang belum memiliki penilai.<br/><br/>Penugasan tetap dapat disimpan, dan penilai akan otomatis aktif setelah Head Department diatur pada menu <b>Master Department &gt; Tab Head Department</b> atau ditentukan manual.<br/><br/>Lanjutkan simpan?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Ya, Tetap Simpan",
        cancelButtonText: "Batal (Lengkapi Dulu)",
      });

      if (!result.isConfirmed) return;
    }

    // Build effective NIK overrides for custom-assigned groups
    const effectiveNikOverrides: DrawerNikOverrideItem[] = [];
    for (const group of assignedDeptOuGroups) {
      const eff = getGroupEffectiveAssessor(group);
      if (eff && eff.isCustom) {
        for (const emp of group.employees) {
          effectiveNikOverrides.push({
            employeeId: emp.id,
            employeeName: emp.name,
            employeeNik: emp.nik,
            assessorId: eff.assessorId,
            assessorName: eff.assessorName,
            assessorNik: eff.assessorNik,
          });
        }
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/template-assignment-drawer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: drawerData.template.id,
            periodId: drawerData.period.id,
            assignedEmployeeIds: selectedEmpIds,
            nikOverrides: effectiveNikOverrides,
            scope: "ALL",
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Gagal menyimpan penugasan template & penilai.");
        }

        // Update local cache
        const updatedEmployees = drawerData.employees.map((e) => {
          const isAssigned = selectedEmpIds.includes(e.id);
          return {
            ...e,
            isAssignedToThisTemplate: isAssigned,
            isAssignedToOtherTemplate: isAssigned ? false : e.isAssignedToOtherTemplate,
            currentAssignedTemplateId: isAssigned
              ? drawerData.template.id
              : e.isAssignedToThisTemplate
              ? null
              : e.currentAssignedTemplateId,
            currentAssignedTemplateName: isAssigned
              ? drawerData.template.name
              : e.isAssignedToThisTemplate
              ? null
              : e.currentAssignedTemplateName,
          };
        });

        const updatedCacheData = {
          ...drawerData,
          employees: updatedEmployees,
          nikOverrides: effectiveNikOverrides,
        };

        drawerDataCache.set(cacheKey, updatedCacheData);
        setDrawerData(updatedCacheData);

        void Swal.fire({
          icon: "success",
          title: "Penugasan Berhasil Disimpan",
          text: `Template KPI berhasil ditugaskan kepada ${selectedEmpIds.length} karyawan dengan penilai yang telah ditentukan.`,
          timer: 2000,
          showConfirmButton: false,
        });

        onSuccess?.();
        onSaved?.({ assignedCount: selectedEmpIds.length });
        router.refresh();
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#2563eb",
        });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container (Right side, wide & comfortable for tables and lists) */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-4 sm:pl-8">
        <div className="w-screen max-w-md sm:max-w-2xl lg:max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-250">
          {/* 1. DRAWER HEADER */}
          <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {drawerData ? drawerData.template.name : "Memuat Template..."}
              </h2>

              {drawerData && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                  <span className="font-semibold text-slate-700">Periode {drawerData.period.year}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-medium text-slate-600">{drawerData.template.departmentName}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-medium text-slate-500">{drawerData.template.jobLevelName}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer shrink-0"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. LOADING SKELETON OR MAIN CONTENT */}
          {isLoading && !drawerData ? (
            <div className="flex-1 flex flex-col p-6 space-y-4 animate-pulse">
              <div className="h-10 bg-slate-100 rounded-xl w-full" />
              <div className="h-8 bg-slate-100 rounded-xl w-3/4" />
              <div className="space-y-2 pt-4">
                <div className="h-14 bg-slate-100 rounded-xl" />
                <div className="h-14 bg-slate-100 rounded-xl" />
                <div className="h-14 bg-slate-100 rounded-xl" />
              </div>
            </div>
          ) : (
            drawerData && (
              <div className="flex-1 flex flex-col overflow-hidden text-xs">
                {/* 2-TAB BAR: "Assign ke Karyawan" vs "Review Penilai" */}
                <div className="px-6 pt-3 bg-white border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-4">
                    {/* Tab 1: Assign ke Karyawan */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("KARYAWAN")}
                      className={`pb-3 px-1 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                        activeTab === "KARYAWAN"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>1. Assign ke Karyawan</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                          selectedEmpIds.length > 0
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {selectedEmpIds.length}
                      </span>
                    </button>

                    {/* Tab 2: Review Penilai (Head Department) */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("PENILAI")}
                      className={`pb-3 px-1 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                        activeTab === "PENILAI"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>2. Review Penilai</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                          incompleteEmployeesCount === 0 && assignedEmployees.length > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : incompleteEmployeesCount > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {incompleteEmployeesCount > 0
                          ? `${incompleteEmployeesCount} Belum Ditentukan`
                          : `${completeGroupsCount + customGroupsCount}/${assignedDeptOuGroups.length} Lengkap`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Tab 1: Assign ke Karyawan */}
                {activeTab === "KARYAWAN" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 overflow-y-auto space-y-4">
                      {/* Description & Instruction */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start gap-3">
                        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <div className="text-slate-600 text-xs leading-relaxed">
                          Pilih karyawan di departemen <b className="text-slate-900">{drawerData.template.departmentName}</b> yang
                          akan menggunakan template KPI ini. Penilai untuk tiap karyawan akan otomatis ditentukan dari{" "}
                          <b className="text-slate-900">Head Department</b> sesuai site masing-masing.
                        </div>
                      </div>

                      {/* Filter Bar (Search + Job Level + Pilih Semua) */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={empSearch}
                            onChange={(e) => setEmpSearch(e.target.value)}
                            placeholder="Cari NIK, nama karyawan, atau site..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                          />
                        </div>

                        {/* Level Filter Dropdown */}
                        <select
                          value={selectedJobLevelFilter}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedJobLevelFilter(val === "ALL" ? "ALL" : Number(val));
                          }}
                          className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 focus:outline-none cursor-pointer shrink-0"
                        >
                          <option value="ALL">Semua Job Level</option>
                          {availableJobLevels.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              {lvl.name} ({lvl.count})
                            </option>
                          ))}
                        </select>

                        {/* Pilih Semua Action */}
                        {selectableFiltered.length > 0 && (
                          <button
                            type="button"
                            onClick={handleToggleSelectFiltered}
                            className={`shrink-0 px-3.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                              isAllFilteredSelected
                                ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            {isAllFilteredSelected ? "Batal Pilih Semua" : "Pilih Semua Hasil"}
                          </button>
                        )}
                      </div>

                      {/* Employee Checklist Cards / List */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                        {filteredEmployees.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400">
                            Tidak ada karyawan yang sesuai kriteria filter.
                          </div>
                        ) : (
                          filteredEmployees.map((emp) => {
                            const isSelected = selectedEmpIds.includes(emp.id);
                            const isBlocked = emp.isAssignedToOtherTemplate;

                            return (
                              <label
                                key={emp.id}
                                className={`flex items-center justify-between px-4 py-3 transition select-none ${
                                  isBlocked
                                    ? "bg-slate-50/60 opacity-60 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-blue-50/50 hover:bg-blue-50/70 cursor-pointer"
                                    : "hover:bg-slate-50/80 cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isBlocked}
                                    onChange={() => !isBlocked && handleToggleEmployee(emp)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p
                                        className={`font-semibold text-xs truncate ${
                                          isBlocked ? "text-slate-500" : "text-slate-900"
                                        }`}
                                      >
                                        {emp.name}
                                      </p>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                        Unit: {emp.operatingUnit || "HO"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      NIK: {emp.nik} · {emp.jobPosition || "-"} · {emp.jobLevelName}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {isBlocked ? (
                                    <span
                                      className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                      title={`Karyawan ini sudah memiliki template: "${emp.currentAssignedTemplateName}"`}
                                    >
                                      Sudah di template lain
                                    </span>
                                  ) : isSelected ? (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded">
                                      Ditugaskan
                                    </span>
                                  ) : null}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Tab 1 Footer */}
                    <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                      <div className="text-xs text-slate-600">
                        Terpilih <span className="font-bold text-slate-900">{selectedEmpIds.length}</span> dari{" "}
                        <span className="font-semibold text-slate-700">{drawerData.employees.length}</span> karyawan
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab("PENILAI")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                        >
                          <span>Review Penilai</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAssignment}
                          disabled={isPending || selectedEmpIds.length === 0}
                          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isPending ? "Menyimpan..." : "Simpan Penugasan"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Review Penilai */}
                {activeTab === "PENILAI" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 overflow-y-auto space-y-4">
                      {/* Description & Instruction Banner */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start gap-3">
                        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <div className="text-slate-600 text-xs leading-relaxed">
                          Daftar penilai KPI berdasarkan site departemen{" "}
                          <b className="text-slate-900">{drawerData.template.departmentName}</b>. Secara default penilai
                          otomatis diambil dari nama <b className="text-slate-900">Head Department</b> masing-masing site dan
                          dapat disesuaikan atau diedit bila diperlukan.
                        </div>
                      </div>

                      {/* Incomplete Alert Banner (If any unit missing Head Dept) */}
                      {incompleteGroupsCount > 0 && (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800 leading-relaxed flex-1">
                            <span className="font-bold">Perhatian:</span> Terdapat{" "}
                            <b>{incompleteGroupsCount} unit kerja ({incompleteEmployeesCount} karyawan)</b> yang belum memiliki
                            penilai aktif karena Head Department belum ditentukan di Master Department. Anda dapat langsung
                            mengklik tombol <b>Pilih Penilai</b> di bawah untuk menentukan penilai pengganti.
                          </div>
                        </div>
                      )}

                      {/* Filter Bar (Search + Status Filter + Export Excel) */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={penilaiSearch}
                            onChange={(e) => setPenilaiSearch(e.target.value)}
                            placeholder="Cari departemen, unit, atau nama penilai..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                          />
                        </div>

                        {/* Status Filter Dropdown */}
                        <select
                          value={penilaiStatusFilter}
                          onChange={(e) =>
                            setPenilaiStatusFilter(e.target.value as "ALL" | "COMPLETE" | "CUSTOM" | "INCOMPLETE")
                          }
                          className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 focus:outline-none cursor-pointer shrink-0"
                        >
                          <option value="ALL">Semua Status Penilai</option>
                          <option value="COMPLETE">Head Dept Default ({completeGroupsCount})</option>
                          <option value="CUSTOM">Penilai Disesuaikan ({customGroupsCount})</option>
                          <option value="INCOMPLETE">Belum Ditentukan ({incompleteGroupsCount})</option>
                        </select>

                        {/* Export Review Excel Action */}
                        <button
                          type="button"
                          onClick={handleExportReviewExcel}
                          disabled={assignedEmployees.length === 0}
                          className="shrink-0 px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Download data review pemetaan penilai ke Excel (.xlsx)"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Export Excel</span>
                        </button>
                      </div>

                      {/* Department & OU List (Matching Tab 1 Container Style) */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                        {filteredGroups.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400">
                            {assignedDeptOuGroups.length === 0
                              ? "Belum ada karyawan yang dipilih. Silakan pilih karyawan di Tab 1 (Assign ke Karyawan)."
                              : "Tidak ada unit kerja yang sesuai kriteria filter."}
                          </div>
                        ) : (
                          filteredGroups.map((group) => {
                            const eff = getGroupEffectiveAssessor(group);
                            const isExpanded = expandedGroupKeys.has(group.key);
                            const isCustom = eff?.isCustom ?? false;

                            return (
                              <div
                                key={group.key}
                                className="px-4 py-3 hover:bg-slate-50/80 transition select-none flex flex-col justify-between"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  {/* Left: Assessor Avatar/Icon + Detail */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                                        !eff
                                          ? "bg-amber-50 border-amber-200 text-amber-600"
                                          : isCustom
                                          ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                                          : "bg-emerald-50 border-emerald-200 text-emerald-600"
                                      }`}
                                    >
                                      {!eff ? (
                                        <AlertTriangle className="w-4 h-4" />
                                      ) : (
                                        <UserCheck className="w-4 h-4" />
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      {/* Primary Title: Default Head Dept / Assessor Name */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p
                                          className={`font-semibold text-xs truncate ${
                                            !eff ? "text-amber-800" : "text-slate-900"
                                          }`}
                                        >
                                          {eff ? eff.assessorName : "Penilai Belum Ditentukan"}
                                        </p>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                          Unit: {group.operatingUnit || "HO"}
                                        </span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            !eff
                                              ? "bg-amber-50 text-amber-800 border-amber-300"
                                              : isCustom
                                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          }`}
                                        >
                                          {!eff
                                            ? "Belum Ditentukan"
                                            : isCustom
                                            ? "Penilai Disesuaikan"
                                            : "Head Department"}
                                        </span>
                                        {group.hasDelegation && !isCustom && (
                                          <span
                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                                            title={`Delegasi aktif ke: ${group.delegationDelegateeName || "Asesor Pengganti"}`}
                                          >
                                            Delegasi Aktif
                                          </span>
                                        )}
                                      </div>

                                      {/* Subtitle: Department · NIK · Position · Employee count */}
                                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                        {group.departmentName}
                                        {eff ? (
                                          <>
                                            {" "}· NIK: {eff.assessorNik} · {eff.assessorPosition || "Head Department"}
                                          </>
                                        ) : (
                                          <> · Belum ada Head Dept di Master Department</>
                                        )}
                                        {" "}· <span className="font-semibold text-slate-700">{group.employeeCount} karyawan</span>
                                      </p>
                                    </div>
                                  </div>

                                  {/* Right: Actions */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isCustom && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetGroupAssessor(group.key)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer"
                                        title="Kembalikan penilai ke Head Department default"
                                      >
                                        <RotateCcw className="w-3 h-3 text-slate-400" />
                                        <span>Reset</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditGroupModal(group)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition cursor-pointer shadow-2xs hover:border-slate-300"
                                      title="Ubah penilai untuk unit kerja ini"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                      <span>{eff ? "Edit Penilai" : "Pilih Penilai"}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Expandable Employee Toggle */}
                                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedGroupKeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(group.key)) next.delete(group.key);
                                        else next.add(group.key);
                                        return next;
                                      });
                                    }}
                                    className="text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer transition font-medium text-[10px]"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Sembunyikan {group.employeeCount} karyawan</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Lihat {group.employeeCount} karyawan yang dinilai</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                {/* Expanded Employee Chips */}
                                {isExpanded && (
                                  <div className="mt-2 pl-3 pt-2 border-l-2 border-blue-200 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                                    {group.employees.map((emp) => (
                                      <div
                                        key={emp.id}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700"
                                      >
                                        <span className="font-semibold text-slate-900">{emp.name}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">({emp.nik})</span>
                                        <span className="text-[10px] text-slate-400">· {emp.jobPosition || emp.jobLevelName}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Tab 2 Footer */}
                    <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab("KARYAWAN")}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                      >
                        &larr; Kembali ke Assign Karyawan
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-500 hidden sm:block">
                          <span className="font-semibold text-slate-900">{assignedEmployees.length}</span> karyawan ·{" "}
                          <span className="font-semibold text-slate-900">
                            {completeGroupsCount + customGroupsCount}/{assignedDeptOuGroups.length}
                          </span>{" "}
                          unit siap
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveAssignment}
                          disabled={isPending || selectedEmpIds.length === 0}
                          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isPending ? "Menyimpan..." : "Verifikasi & Simpan Penugasan"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL DIALOG: EDIT PENILAI DEPARTEMEN & UNIT */}
                {editingGroup && (
                  <div
                    className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingGroup(null);
                    }}
                  >
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
                      {/* Modal Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Ubah Penilai Departemen &amp; Unit</h4>
                          <p className="text-[11px] text-slate-500">
                            Tentukan penilai untuk seluruh karyawan pada unit kerja ini.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingGroup(null)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition cursor-pointer"
                          title="Tutup (Escape)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Group Info Summary Card */}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{editingGroup.departmentName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                            Unit: {editingGroup.operatingUnit || "HO"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Karyawan terdampak: <b className="text-slate-700">{editingGroup.employeeCount} karyawan</b>
                        </div>
                        <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                          Default Head Dept:{" "}
                          {editingGroup.defaultHeadDeptName ? (
                            <span className="font-semibold text-slate-800">
                              {editingGroup.defaultHeadDeptName} ({editingGroup.defaultHeadDeptNik || "-"})
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">Belum ada di Master Head Dept</span>
                          )}
                        </div>
                      </div>

                      {/* Assessor Search & Selection */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Pilih Penilai / Asesor Pengganti
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={assessorModalSearch}
                            onChange={(e) => setAssessorModalSearch(e.target.value)}
                            placeholder="Cari nama, NIK, atau departemen penilai..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                            autoFocus
                          />
                        </div>

                        {/* Scrollable Assessor List */}
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                          {filteredAssessorOptions.length === 0 ? (
                            <div className="py-6 text-center text-xs text-slate-400">
                              Tidak ada calon penilai yang cocok dengan pencarian.
                            </div>
                          ) : (
                            filteredAssessorOptions.map((assessor) => {
                              const isSelected = Number(selectedAssessorId) === assessor.id;
                              const isDefaultHead = editingGroup.defaultHeadDeptId === assessor.id;

                              return (
                                <button
                                  key={assessor.id}
                                  type="button"
                                  onClick={() => setSelectedAssessorId(assessor.id)}
                                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition cursor-pointer ${
                                    isSelected
                                      ? "bg-blue-50/80 hover:bg-blue-50"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-xs font-semibold ${
                                          isSelected ? "text-blue-900" : "text-slate-900"
                                        }`}
                                      >
                                        {assessor.name}
                                      </span>
                                      {isDefaultHead && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          Head Dept Unit
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                                      NIK: {assessor.nik} · {assessor.jobPosition || "-"} · {assessor.departmentName || "Umum"}
                                    </div>
                                  </div>

                                  <div className="shrink-0">
                                    <div
                                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        isSelected
                                          ? "border-blue-600 bg-blue-600 text-white"
                                          : "border-slate-300 bg-white"
                                      }`}
                                    >
                                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          {editingGroup.defaultHeadDeptId && (
                            <button
                              type="button"
                              onClick={() => setSelectedAssessorId(editingGroup.defaultHeadDeptId!)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                            >
                              Gunakan Default Head Dept
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingGroup(null)}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveGroupAssessor}
                            disabled={!selectedAssessorId}
                            className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Terapkan Penilai
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
