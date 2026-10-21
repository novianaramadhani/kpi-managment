"use client";

import React, { useState, useMemo, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { deleteAppraisalById, deleteAppraisalsByIds, generateAppraisalsBatchAction } from "@/lib/actions";
import type { EmployeeProgressItem } from "@/types/monthly-assessment";
import { HeaderFilterSelect } from "@/components/ui/header-filter-select";

export type StagingTabKey = "ALL" | "DRAFT" | "IN_REVIEW" | "REVISION" | "APPROVED" | "FINAL";

interface KpiAssessmentListViewProps {
  employees: EmployeeProgressItem[];
  availableYears: number[];
  currentYear: number;
  currentMonth?: number;
  departments: { id: number; name: string }[];
  userRole?: string;
  userDeptName?: string;
}

interface StagingConfig {
  key: StagingTabKey;
  label: string;
  shortDesc: string;
  actionText: string;
  actionClass: string;
  accentBg: string;
  accentText: string;
  badgeBg: string;
  badgeText: string;
  iconType: "users" | "document" | "eye" | "refresh" | "check" | "flag";
}

const STAGING_CONFIGS: Record<StagingTabKey, StagingConfig> = {
  ALL: {
    key: "ALL",
    label: "Semua",
    shortDesc: "Seluruh data penilaian KPI karyawan dalam semua tahapan workflow.",
    actionText: "Lihat",
    actionClass: "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700",
    accentBg: "bg-blue-600",
    accentText: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-600",
    iconType: "users",
  },
  DRAFT: {
    key: "DRAFT",
    label: "Draft",
    shortDesc: "Penilaian masih dikerjakan dan belum dikirim ke assessor.",
    actionText: "Lanjutkan",
    actionClass: "border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700",
    accentBg: "bg-blue-600",
    accentText: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-600",
    iconType: "document",
  },
  IN_REVIEW: {
    key: "IN_REVIEW",
    label: "In Review",
    shortDesc: "Penilaian telah dikirim dan sedang dalam proses review oleh atasan/reviewer.",
    actionText: "Lihat/Review",
    actionClass: "border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700",
    accentBg: "bg-sky-600",
    accentText: "text-sky-600",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-600",
    iconType: "eye",
  },
  REVISION: {
    key: "REVISION",
    label: "Revision",
    shortDesc: "Penilaian dikembalikan oleh reviewer untuk diperbaiki sesuai catatan evaluasi.",
    actionText: "Perbaiki",
    actionClass: "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800",
    accentBg: "bg-amber-600",
    accentText: "text-amber-600",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-600",
    iconType: "refresh",
  },
  APPROVED: {
    key: "APPROVED",
    label: "Approved",
    shortDesc: "Penilaian telah disetujui oleh atasan dan siap menuju tahap finalisasi.",
    actionText: "Lihat",
    actionClass: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800",
    accentBg: "bg-emerald-600",
    accentText: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-600",
    iconType: "check",
  },
  FINAL: {
    key: "FINAL",
    label: "Final",
    shortDesc: "Penilaian telah selesai secara resmi, terkunci, dan siap untuk pelaporan akhir.",
    actionText: "Detail",
    actionClass: "border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800",
    accentBg: "bg-purple-600",
    accentText: "text-purple-600",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-600",
    iconType: "flag",
  },
};

export function getEmployeeStagingKey(emp: EmployeeProgressItem): "DRAFT" | "IN_REVIEW" | "REVISION" | "APPROVED" | "FINAL" {
  const status = (emp.appraisalStatus || emp.monthlyStatus || "DRAFT").toUpperCase();

  if (status === "FINAL") return "FINAL";
  if (status === "APPROVED") return "APPROVED";
  if (
    status === "REVISED_PENILAI" ||
    status === "REVISED_HEAD" ||
    status === "REVISION" ||
    status === "REJECTED" ||
    Boolean(emp.rejectionReason)
  ) {
    return "REVISION";
  }
  if (
    status === "SUBMITTED" ||
    status.startsWith("PENDING_") ||
    status === "REVIEWED" ||
    status === "IN_REVIEW"
  ) {
    return "IN_REVIEW";
  }
  return "DRAFT";
}

export function KpiAssessmentListView({
  employees,
  availableYears,
  currentYear,
  currentMonth = 1,
  departments,
  userRole = "ADMIN",
  userDeptName,
}: KpiAssessmentListViewProps) {
  const router = useRouter();

  // State Filter & Staging
  const [activeStaging, setActiveStaging] = useState<StagingTabKey>("DRAFT");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>(
    currentMonth !== undefined ? String(currentMonth) : "ALL"
  );

  // State Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // State Checkbox Selection & Actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [openRowActionId, setOpenRowActionId] = useState<number | null>(null);

  const actionsDropdownRef = useRef<HTMLDivElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        actionsDropdownRef.current &&
        !actionsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsActionsDropdownOpen(false);
      }
      setOpenRowActionId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeStaging, searchQuery, selectedDept, selectedMonth]);

  // Hitung jumlah karyawan per staging tab
  const stagingCounts = useMemo(() => {
    const counts: Record<StagingTabKey, number> = {
      ALL: employees.length,
      DRAFT: 0,
      IN_REVIEW: 0,
      REVISION: 0,
      APPROVED: 0,
      FINAL: 0,
    };

    for (const emp of employees) {
      const stage = getEmployeeStagingKey(emp);
      counts[stage] = (counts[stage] || 0) + 1;
    }

    return counts;
  }, [employees]);

  // Filter baris karyawan sesuai Staging yang aktif dan filter lainnya
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Filter 1: Staging Workflow (Semua vs spesifik status)
      if (activeStaging !== "ALL") {
        const empStage = getEmployeeStagingKey(emp);
        if (empStage !== activeStaging) return false;
      }

      // Filter 2: Department
      if (selectedDept !== "ALL" && String(emp.departmentId) !== selectedDept) {
        return false;
      }

      // Filter 3: Search Query (Nama, NIK, Jabatan, Departemen)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchNik = emp.nik.toLowerCase().includes(q);
        const matchPos = (emp.jobPosition || "").toLowerCase().includes(q);
        const matchDept = (emp.departmentName || "").toLowerCase().includes(q);
        if (!matchName && !matchNik && !matchPos && !matchDept) return false;
      }

      return true;
    });
  }, [employees, activeStaging, selectedDept, searchQuery]);

  // Pagination Slice
  const totalItems = filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + pageSize);

  // Checkbox selection state
  const selectedEmployees = useMemo(() => {
    return employees.filter((e) => selectedIds.includes(e.employeeId));
  }, [employees, selectedIds]);

  const isAllSelected =
    paginatedEmployees.length > 0 &&
    paginatedEmployees.every((e) => selectedIds.includes(e.employeeId));
  const isSomeSelected =
    paginatedEmployees.some((e) => selectedIds.includes(e.employeeId)) && !isAllSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(paginatedEmployees.map((e) => e.employeeId));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = Array.from(
        new Set([...selectedIds, ...paginatedEmployees.map((e) => e.employeeId)])
      );
      setSelectedIds(newIds);
    }
  };

  const handleToggleSelect = (empId: number) => {
    setSelectedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleResetFilters = () => {
    setActiveStaging("ALL");
    setSearchQuery("");
    setSelectedDept("ALL");
    setSelectedMonth("ALL");
    setSelectedIds([]);
  };

  const handleGenerateBatch = () => {
    Swal.fire({
      title: "Generate Penilaian Massal",
      text: `Generate lembar penilaian KPI periode ${currentYear} untuk semua karyawan yang belum memilikinya?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Generate!",
      cancelButtonText: "Batal",
      confirmButtonColor: "#2563eb",
    }).then((result) => {
      if (result.isConfirmed) {
        startTransition(async () => {
          const fd = new FormData();
          fd.append("periodYear", String(currentYear));
          const res = await generateAppraisalsBatchAction(fd);
          if (res?.success) {
            Swal.fire("Berhasil", `Berhasil membuat ${res.count} lembar penilaian baru.`, "success");
            router.refresh();
          } else {
            Swal.fire("Gagal", res?.error || "Terjadi kesalahan.", "error");
          }
        });
      }
    });
  };

  const handleExportExcel = (targetList?: EmployeeProgressItem[]) => {
    const list =
      targetList && targetList.length > 0
        ? targetList
        : selectedEmployees.length > 0
        ? selectedEmployees
        : filteredEmployees;

    if (list.length === 0) return;

    const wb = XLSX.utils.book_new();
    const headers = [
      "No",
      "NIK",
      "Nama Karyawan",
      "Jabatan",
      "Departemen",
      "Penilai",
      "Template KPI",
      "Status Workflow",
      "Progress Parameter",
      "Skor Akhir (%)",
      "Grade",
    ];

    const rows = list.map((emp, idx) => {
      const stage = getEmployeeStagingKey(emp);
      const stageConfig = STAGING_CONFIGS[stage];
      const filledP = emp.filledParameters ?? emp.filledCount ?? 0;
      const totalP = emp.totalParameters ?? 5;
      return [
        idx + 1,
        emp.nik,
        emp.name,
        emp.jobPosition,
        emp.departmentName || "-",
        emp.appraiserName || "-",
        emp.templateName || "-",
        stageConfig.label,
        `${filledP}/${totalP}`,
        emp.finalScore !== null && emp.finalScore !== undefined ? `${emp.finalScore}%` : "-",
        emp.grade || "-",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 28 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
    ];

    const stageSuffix = activeStaging !== "ALL" ? `_${activeStaging}` : "";
    XLSX.utils.book_append_sheet(wb, ws, `KPI_${currentYear}`);
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Rekap_KPI_${currentYear}${stageSuffix}_${dateStr}.xlsx`);
    setIsActionsDropdownOpen(false);
  };

  const handleExportCSV = (targetList?: EmployeeProgressItem[]) => {
    const list =
      targetList && targetList.length > 0
        ? targetList
        : selectedEmployees.length > 0
        ? selectedEmployees
        : filteredEmployees;

    if (list.length === 0) return;

    const headers = [
      "No",
      "NIK",
      "Nama",
      "Jabatan",
      "Departemen",
      "Penilai",
      "Template",
      "Status",
      "Progress",
      "Skor Akhir",
      "Grade",
    ];

    const csvRows = [
      headers.join(","),
      ...list.map((emp, idx) => {
        const stage = getEmployeeStagingKey(emp);
        const stageConfig = STAGING_CONFIGS[stage];
        const filledP = emp.filledParameters ?? emp.filledCount ?? 0;
        const totalP = emp.totalParameters ?? 5;
        return [
          idx + 1,
          `"${emp.nik}"`,
          `"${emp.name.replace(/"/g, '""')}"`,
          `"${emp.jobPosition.replace(/"/g, '""')}"`,
          `"${(emp.departmentName || "").replace(/"/g, '""')}"`,
          `"${(emp.appraiserName || "-").replace(/"/g, '""')}"`,
          `"${(emp.templateName || "-").replace(/"/g, '""')}"`,
          `"${stageConfig.label}"`,
          `"${filledP}/${totalP}"`,
          `"${emp.finalScore !== null && emp.finalScore !== undefined ? emp.finalScore + "%" : "-"}"`,
          `"${emp.grade || "-"}"`,
        ].join(",");
      }),
    ];

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Rekap_KPI_${currentYear}_${activeStaging}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsActionsDropdownOpen(false);
  };

  const handlePrint = () => {
    window.print();
    setIsActionsDropdownOpen(false);
  };

  const handleDeleteSingle = async (emp: EmployeeProgressItem) => {
    if (!emp.appraisalId) return;
    const result = await Swal.fire({
      title: "Hapus Penilaian?",
      html: `Hapus lembar penilaian untuk <b>${emp.name}</b> (NIK: ${emp.nik}) periode ${currentYear}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (result.isConfirmed) {
      try {
        await deleteAppraisalById(emp.appraisalId);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Dihapus",
          text: `Data penilaian ${emp.name} berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus penilaian.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
        });
      }
    }
  };

  const handleBatchDelete = async () => {
    if (selectedEmployees.length === 0) return;
    const appraisalIds = selectedEmployees
      .map((e) => e.appraisalId)
      .filter((id): id is number => typeof id === "number");

    const result = await Swal.fire({
      title: `Hapus ${appraisalIds.length} Penilaian?`,
      html: `Apakah Anda yakin ingin menghapus <b>${appraisalIds.length} data penilaian terpilih</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus Semua",
      cancelButtonText: "Batal",
    });

    if (result.isConfirmed) {
      try {
        await deleteAppraisalsByIds(appraisalIds);
        setSelectedIds([]);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Dihapus",
          text: `${appraisalIds.length} data penilaian berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus penilaian.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
        });
      }
    }
  };

  // Helper render Icon per status (seperti referensi: people, document, eye, refresh, check, flag)
  const renderStagingIcon = (type: StagingConfig["iconType"], className = "h-5 w-5") => {
    switch (type) {
      case "users":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        );
      case "document":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        );
      case "eye":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case "refresh":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        );
      case "check":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "flag":
        return (
          <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a.75.75 0 00.572-.731V4.26a.75.75 0 00-.922-.728l-3.37.794a9 9 0 01-6.086-.71l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
          </svg>
        );
    }
  };

  const activeConfig = STAGING_CONFIGS[activeStaging];

  return (
    <div className="space-y-6 pb-24 text-slate-800 antialiased">
      {/* ================================================== */}
      {/* 1. HEADER (Breadcrumbs, Judul & Subtitle) */}
      {/* ================================================== */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1.5">
          <span>KPI System</span>
          <span>/</span>
          <span className="text-slate-600 font-semibold">Input KPI Bulanan</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Input KPI Bulanan
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kelola dan pantau proses input penilaian KPI karyawan sesuai periode yang berjalan.
            </p>
          </div>

          {userRole === "HEAD_DEPT" && userDeptName && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 self-start sm:self-auto">
              <span>Departemen:</span>
              <span className="font-bold">{userDeptName}</span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* 2. TOP FILTER BAR (1 Baris Sejajar Horizontal) */}
      {/* ================================================== */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white px-5 py-3.5 shadow-xs overflow-x-auto whitespace-nowrap">
        <div className="flex items-center gap-5 text-sm shrink-0">
          {/* Periode Selector */}
          <HeaderFilterSelect
            label="Periode"
            value={currentYear}
            onChange={(e) => {
              const yr = e.target.value;
              const mParam = selectedMonth !== "ALL" ? `&month=${selectedMonth}` : "";
              router.push(`/input-kpi?year=${yr}${mParam}`);
            }}
            className="max-w-[210px]"
            leftIcon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
            }
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                KPI Tahun {yr} {yr === currentYear ? "(Aktif)" : ""}
              </option>
            ))}
          </HeaderFilterSelect>

          {/* Bulan Selector */}
          <HeaderFilterSelect
            label="Bulan"
            value={selectedMonth}
            onChange={(e) => {
              const m = e.target.value;
              setSelectedMonth(m);
              if (m !== "ALL") {
                router.push(`/input-kpi?year=${currentYear}&month=${m}`);
              } else {
                router.push(`/input-kpi?year=${currentYear}`);
              }
            }}
            className="max-w-[190px]"
            leftIcon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
            }
          >
            <option value="ALL">Semua Bulan (YTD)</option>
            <option value="1">Januari</option>
            <option value="2">Februari</option>
            <option value="3">Maret</option>
            <option value="4">April</option>
            <option value="5">Mei</option>
            <option value="6">Juni</option>
            <option value="7">Juli</option>
            <option value="8">Agustus</option>
            <option value="9">September</option>
            <option value="10">Oktober</option>
            <option value="11">November</option>
            <option value="12">Desember</option>
          </HeaderFilterSelect>

          {/* Department Filter (Admin & Management) */}
          {userRole === "ADMIN" && (
            <HeaderFilterSelect
              label="Department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="max-w-[220px]"
              leftIcon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              }
            >
              <option value="ALL">Semua Department</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </HeaderFilterSelect>
          )}
        </div>

        {/* Reset Filter Button */}
        <button
          type="button"
          onClick={handleResetFilters}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
          title="Reset semua filter ke default"
        >
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>Reset Filter</span>
        </button>
      </div>

      {/* ================================================== */}
      {/* 3. STAGING TABS (100% Flex Row Horizontal Kesamping) */}
      {/* ================================================== */}
      <div className="flex flex-row flex-nowrap items-center gap-2.5 w-full overflow-x-auto pb-1">
        {(
          [
            "ALL",
            "DRAFT",
            "IN_REVIEW",
            "REVISION",
            "APPROVED",
            "FINAL",
          ] as StagingTabKey[]
        ).map((key) => {
          const cfg = STAGING_CONFIGS[key];
          const count = stagingCounts[key] || 0;
          const isActive = activeStaging === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveStaging(key)}
              className={`flex flex-row flex-nowrap items-center justify-between gap-2 h-11 flex-1 shrink-0 min-w-[130px] rounded-xl px-3 transition-all cursor-pointer select-none whitespace-nowrap ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs border border-blue-600"
                  : "bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
              }`}
            >
              {/* Icon & Label Status Sejajar Horizontal */}
              <div className="flex flex-row items-center gap-2 min-w-0">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? "bg-white/20 text-white"
                      : `${cfg.badgeBg} ${cfg.badgeText}`
                  }`}
                >
                  {renderStagingIcon(cfg.iconType, "h-3.5 w-3.5")}
                </div>

                <span className={`text-xs font-semibold whitespace-nowrap ${isActive ? "text-white" : "text-slate-700"}`}>
                  {cfg.label}
                </span>
              </div>

              {/* Jumlah Data Pill di Kanan */}
              <span
                className={`ml-1 shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ================================================== */}
      {/* 4. AREA STAGING AKTIF (Card Container Sesuai Referensi) */}
      {/* ================================================== */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        {/* Header Staging Aktif */}
        <div className="flex items-center gap-3.5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${activeConfig.badgeBg} ${activeConfig.badgeText} border border-slate-200/80`}>
            {renderStagingIcon(activeConfig.iconType, "h-5 w-5")}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {activeConfig.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeConfig.shortDesc}
            </p>
          </div>
        </div>

        {/* Toolbar: Search (Lebar & Elemen Utama) & Menu Aksi */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          {/* Search Bar (Lebar & Dominan) */}
          <div className="relative flex-1 w-full">
            <svg className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama karyawan, NIK, jabatan, atau departemen..."
              className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none transition shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Menu Aksi Dropdown (Menggabungkan Export, Cetak, Batch Action) */}
          <div className="relative shrink-0 w-full sm:w-auto" ref={actionsDropdownRef}>
            <button
              type="button"
              onClick={() => setIsActionsDropdownOpen((prev) => !prev)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 text-xs font-bold text-slate-700 shadow-2xs transition active:scale-95 cursor-pointer"
              title="Menu Aksi & Ekspor Data"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              <span>Aksi</span>
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {selectedIds.length}
                </span>
              )}
              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

              {isActionsDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5 z-30">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {selectedIds.length > 0
                      ? `${selectedIds.length} Baris Terpilih`
                      : `Semua Data Staging (${filteredEmployees.length})`}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportExcel()}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition"
                  >
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span>Export Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportCSV()}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  >
                    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrint()}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  >
                    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.672-2.14-1.282-3.143m1.282 3.143l2.84 2.84m-2.84-2.84l-2.84-2.84m6.84 2.84l2.84-2.84m-2.84 2.84l2.84 2.84M17.28 13.829c.24-1.076.672-2.14 1.282-3.143m-1.282 3.143l-2.84 2.84m2.84-2.84l2.84-2.84m-6.84 2.84l-2.84-2.84m2.84 2.84l-2.84 2.84M3.75 3v18h16.5V3H3.75z" />
                    </svg>
                    <span>Cetak Rekap</span>
                  </button>

                  {userRole === "ADMIN" && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={handleGenerateBatch}
                        disabled={isPending}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition disabled:opacity-50"
                      >
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span>{isPending ? "Generating..." : "Generate Massal"}</span>
                      </button>
                    </>
                  )}

                  {selectedIds.length > 0 && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={handleBatchDelete}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      >
                        <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        <span>Hapus Terpilih ({selectedIds.length})</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* ================================================== */}
        {/* 5. TABEL DAFTAR KARYAWAN (SPACIOUS & CLEAN SESUAI REFERENSI) */}
        {/* ================================================== */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
                  {/* Checkbox Header */}
                  <th className="px-4 py-3.5 w-10 text-center">
                    <div className="flex items-center justify-center">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition"
                        title={isAllSelected ? "Batalkan semua pilihan" : "Pilih semua baris di halaman ini"}
                      />
                    </div>
                  </th>
                  <th className="px-3 py-3.5 font-bold w-12 text-center text-slate-500">No</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700">Nama</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700">NIK</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700">Jabatan</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700">Department</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700">Progress</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-slate-700 text-center w-36">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEmployees.length > 0 ? (
                  paginatedEmployees.map((emp, idx) => {
                    const isSelected = selectedIds.includes(emp.employeeId);
                    const rowNumber = startIndex + idx + 1;

                    // Tentukan status staging baris ini
                    const rowStage = getEmployeeStagingKey(emp);
                    const stageConfig = STAGING_CONFIGS[rowStage];

                    // Hitung progress
                    const filledParams = emp.filledParameters ?? emp.filledCount ?? 0;
                    const totalParams = emp.totalParameters ?? 5;
                    const progressPercent =
                      typeof emp.completionRate === "number" && !isNaN(emp.completionRate) && emp.completionRate > 0
                        ? Math.round(emp.completionRate)
                        : totalParams > 0
                        ? Math.min(100, Math.round((filledParams / totalParams) * 100))
                        : 0;

                    // Tentukan teks aksi per staging
                    let actionLabel = stageConfig.actionText;
                    let actionBtnClass = stageConfig.actionClass;
                    if (activeStaging !== "ALL") {
                      actionLabel = activeConfig.actionText;
                      actionBtnClass = activeConfig.actionClass;
                    }

                    const targetUrl = `/input-kpi?employeeId=${emp.employeeId}&year=${currentYear}${
                      selectedMonth !== "ALL" ? `&month=${selectedMonth}` : ""
                    }`;

                    return (
                      <tr
                        key={emp.appraisalId || emp.employeeId}
                        className={`transition-colors group ${
                          isSelected
                            ? "bg-blue-50/50 hover:bg-blue-50/70"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(emp.employeeId)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition"
                              title={`Pilih ${emp.name}`}
                            />
                          </div>
                        </td>

                        {/* Nomor Urut */}
                        <td className="px-3 py-4 text-center text-slate-400 font-mono text-xs">
                          {rowNumber}
                        </td>

                        {/* Nama Karyawan (Plain text langsung tanpa avatar/inisial/icon) */}
                        <td className="px-4 py-4">
                          <Link
                            href={targetUrl}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                          >
                            {emp.name}
                          </Link>
                        </td>

                        {/* NIK */}
                        <td className="px-4 py-4 font-mono text-slate-500 text-xs">
                          {emp.nik}
                        </td>

                        {/* Jabatan */}
                        <td className="px-4 py-4 font-medium text-slate-700 text-xs">
                          {emp.jobPosition}
                        </td>

                        {/* Department */}
                        <td className="px-4 py-4 text-slate-600 text-xs">
                          {emp.departmentName || "-"}
                        </td>

                        {/* Progress Bar & Persentase */}
                        <td className="px-4 py-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700">{progressPercent}%</span>
                            </div>
                            <div className="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  progressPercent >= 100
                                    ? "bg-emerald-500"
                                    : progressPercent >= 50
                                    ? "bg-blue-500"
                                    : "bg-amber-500"
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Aksi Sesuai Staging */}
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 justify-center">
                            <Link
                              href={targetUrl}
                              className={`inline-flex items-center justify-center rounded-xl border px-3.5 py-1.5 text-xs font-bold transition active:scale-95 shadow-2xs ${actionBtnClass}`}
                            >
                              {actionLabel}
                            </Link>

                            {/* Secondary 3-Dots Menu */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRowActionId((prev) => (prev === emp.employeeId ? null : emp.employeeId));
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
                                title="Opsi aksi lainnya"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                </svg>
                              </button>

                              {openRowActionId === emp.employeeId && (
                                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 z-20">
                                  <Link
                                    href={targetUrl}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                                  >
                                    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                    </svg>
                                    <span>Buka Penilaian</span>
                                  </Link>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenRowActionId(null);
                                      handleExportExcel([emp]);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                                  >
                                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    <span>Export Excel</span>
                                  </button>

                                  {userRole === "ADMIN" && (
                                    <>
                                      <div className="my-1 border-t border-slate-100" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenRowActionId(null);
                                          handleDeleteSingle(emp);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition"
                                      >
                                        <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                        <span>Hapus Data</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-14 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
                          {renderStagingIcon(activeConfig.iconType, "h-6 w-6")}
                        </div>
                        <div className="text-sm font-semibold text-slate-700">
                          Tidak ada karyawan di status {activeConfig.label}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 max-w-sm">
                          Tidak ada lembar penilaian yang cocok dengan filter atau pencarian saat ini.
                        </div>
                        {(searchQuery || selectedDept !== "ALL") && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <span>Reset Filter</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ================================================== */}
          {/* 6. PAGINATION FOOTER */}
          {/* ================================================== */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 text-xs text-slate-600">
              <div>
                Menampilkan <span className="font-semibold text-slate-900">{startIndex + 1}</span> -{" "}
                <span className="font-semibold text-slate-900">{Math.min(startIndex + pageSize, totalItems)}</span> dari{" "}
                <span className="font-semibold text-slate-900">{totalItems}</span> data
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                {/* Prev Button */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validPage <= 1}
                  className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600"
                  title="Halaman Sebelumnya"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>

                {/* Page Numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  if (
                    totalPages > 7 &&
                    pageNum !== 1 &&
                    pageNum !== totalPages &&
                    Math.abs(pageNum - validPage) > 1
                  ) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return (
                        <span key={pageNum} className="px-1 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    return null;
                  }

                  const isCurrent = pageNum === validPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`inline-flex h-8.5 min-w-8.5 px-2.5 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isCurrent
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Next Button */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validPage >= totalPages}
                  className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600"
                  title="Halaman Selanjutnya"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* 7. FLOATING BATCH ACTIONS BAR (KETIKA CEKLIS DIPILIH) */}
      {/* ================================================== */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 rounded-2xl bg-white text-slate-800 px-4 py-2.5 shadow-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 border-r border-slate-200 pr-3.5">
            <span className="flex h-5.5 min-w-5.5 px-2 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 border border-blue-200/60">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Karyawan Terpilih
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Export Excel Button */}
            <button
              type="button"
              onClick={() => handleExportExcel()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 cursor-pointer shadow-2xs"
              title="Download File Excel (.xlsx)"
            >
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Excel</span>
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={() => handleExportCSV()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-medium transition active:scale-95 cursor-pointer shadow-2xs"
              title="Download CSV"
            >
              <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>CSV</span>
            </button>

            {/* Print / Rekap Button */}
            <button
              type="button"
              onClick={() => handlePrint()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-medium transition active:scale-95 cursor-pointer shadow-2xs"
              title="Cetak Rekap"
            >
              <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.672-2.14-1.282-3.143m1.282 3.143l2.84 2.84m-2.84-2.84l-2.84-2.84m6.84 2.84l2.84-2.84m-2.84 2.84l2.84 2.84M17.28 13.829c.24-1.076.672-2.14 1.282-3.143m-1.282 3.143l-2.84 2.84m2.84-2.84l2.84-2.84m-6.84 2.84l-2.84-2.84m2.84 2.84l-2.84 2.84M3.75 3v18h16.5V3H3.75z" />
              </svg>
              <span>Cetak</span>
            </button>

            {/* Batch Delete Button (Admin) */}
            {userRole === "ADMIN" && (
              <button
                type="button"
                onClick={() => handleBatchDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 px-3 py-1.5 text-xs font-medium transition active:scale-95 cursor-pointer shadow-2xs"
                title={`Hapus ${selectedIds.length} Data Terpilih`}
              >
                <svg className="h-3.5 w-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                <span>Hapus</span>
              </button>
            )}

            {/* Divider */}
            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Clear Selection */}
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              title="Batalkan Pilihan"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
