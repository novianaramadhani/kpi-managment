"use client";

import React, { useState, useMemo } from "react";
import type { UserSession } from "@/lib/auth";
import {
  Users,
  CheckCircle2,
  Clock,
  Award,
  Calendar,
  Building2,
  CalendarDays,
  RotateCcw,
  PieChart,
  BarChart3,
  TrendingUp,
  ChevronRight,
  Filter,
} from "lucide-react";

export interface DashboardKpiClientProps {
  currentUser: UserSession | null;
  activePeriod: {
    id: number;
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    evaluationDate: string;
    status: string;
    inputStartMonth?: number;
    cutoffMonth?: number;
    minTenureMonths?: number;
  };
  periods: Array<{
    id: number;
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    evaluationDate: string;
    status: string;
  }>;
  departments: Array<{
    id: number;
    name: string;
    code: string;
  }>;
  allEmployees: Array<{
    id: number;
    nik: string;
    name: string;
    departmentId: number;
    deptName?: string | null;
    jobLevelId: number;
    levelName?: string | null;
    jobPosition?: string | null;
    operatingUnit?: string | null;
    dateOfHire?: string | null;
    role?: string | null;
    headDeptId?: number | null;
    appraiserId?: number | null;
    isActive: boolean;
  }>;
  allAppraisals: Array<{
    id: number;
    periodId: number;
    employeeId: number;
    status: string;
    finalScore: string | null;
    isEligible: boolean;
    empName: string;
    nik: string;
    jobPosition?: string | null;
    operatingUnit?: string | null;
    deptName: string;
    deptId: number;
    levelName?: string | null;
    headDeptId?: number | null;
    appraiserId?: number | null;
    updatedAt: Date | string | null;
    currentStage?: string | null;
    monthlyScores?: Record<number, number> | null;
  }>;
  systemDate?: string;
  templatesCount?: number;
}

interface DepartmentStatRow {
  deptId: number;
  deptName: string;
  deptCode: string;
  totalEmployees: number;
  scoredCount: number;
  unscoredCount: number;
  scoredPct: number;
  unscoredPct: number;
  totalScore: number;
  avgScore: number;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const AXIS_TICKS = [0, 25, 50, 75, 100];

function normalizeKpiScore(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num <= 2.0 ? num * 100 : num;
}

function calcPercentage(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  if (count >= total) return 100;
  const raw = (count / total) * 100;
  if (raw < 1) return Math.max(0.1, Number(raw.toFixed(1)));
  if (raw > 99) return 99.9;
  return Number(raw.toFixed(1));
}

export function DashboardKpiClient({
  currentUser,
  activePeriod,
  periods,
  departments,
  allEmployees,
  allAppraisals,
}: DashboardKpiClientProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod.id);
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [showAllCompletion, setShowAllCompletion] = useState<boolean>(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => {
    if (currentUser?.departmentName) {
      const match = departments.find(
        (d) => d.name.toLowerCase() === currentUser.departmentName?.toLowerCase()
      );
      if (match && currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
        return String(match.id);
      }
    }
    return "ALL";
  });

  const appraisalByEmpId = useMemo(() => {
    const map = new Map<number, DashboardKpiClientProps["allAppraisals"][0]>();
    for (let i = 0; i < allAppraisals.length; i++) {
      const app = allAppraisals[i];
      if (app.periodId === selectedPeriodId && !map.has(app.employeeId)) {
        map.set(app.employeeId, app);
      }
    }
    return map;
  }, [allAppraisals, selectedPeriodId]);

  const {
    totalEmployeesCount,
    scoredCount,
    unscoredCount,
    scoredPercentage,
    unscoredPercentage,
    avgScore,
    completionChartData,
  } = useMemo(() => {
    const filterDeptNum = selectedDeptId === "ALL" ? null : Number(selectedDeptId);
    const filterMonthNum = selectedMonth === "ALL" ? null : Number(selectedMonth);

    const deptMap = new Map<number, DepartmentStatRow>();
    for (let i = 0; i < departments.length; i++) {
      const d = departments[i];
      if (filterDeptNum !== null && d.id !== filterDeptNum) continue;
      deptMap.set(d.id, {
        deptId: d.id,
        deptName: d.name,
        deptCode: d.code,
        totalEmployees: 0,
        scoredCount: 0,
        unscoredCount: 0,
        scoredPct: 0,
        unscoredPct: 0,
        totalScore: 0,
        avgScore: 0,
      });
    }

    let totalEmp = 0;
    let totalScored = 0;
    let grandTotalScore = 0;

    for (let i = 0; i < allEmployees.length; i++) {
      const emp = allEmployees[i];
      if (filterDeptNum !== null && emp.departmentId !== filterDeptNum) continue;

      let dStat = deptMap.get(emp.departmentId);
      if (!dStat) {
        dStat = {
          deptId: emp.departmentId,
          deptName: emp.deptName || `Dept #${emp.departmentId}`,
          deptCode: "-",
          totalEmployees: 0,
          scoredCount: 0,
          unscoredCount: 0,
          scoredPct: 0,
          unscoredPct: 0,
          totalScore: 0,
          avgScore: 0,
        };
        deptMap.set(emp.departmentId, dStat);
      }

      totalEmp++;
      dStat.totalEmployees++;

      const app = appraisalByEmpId.get(emp.id);
      let empScore = 0;

      if (app) {
        if (filterMonthNum === null) {
          empScore = normalizeKpiScore(app.finalScore);
        } else {
          const mScores = app.monthlyScores;
          if (mScores && mScores[filterMonthNum] !== undefined) {
            empScore = normalizeKpiScore(mScores[filterMonthNum]);
          } else if (!mScores || Object.keys(mScores).length === 0) {
            if (app.updatedAt) {
              const updMonth = new Date(app.updatedAt).getMonth() + 1;
              if (updMonth === filterMonthNum) {
                empScore = normalizeKpiScore(app.finalScore);
              }
            }
          }
        }
      }

      if (empScore > 0) {
        totalScored++;
        grandTotalScore += empScore;
        dStat.scoredCount++;
        dStat.totalScore += empScore;
      }
    }

    const deptRows: DepartmentStatRow[] = [];

    for (const dStat of deptMap.values()) {
      dStat.unscoredCount = Math.max(0, dStat.totalEmployees - dStat.scoredCount);
      dStat.scoredPct = calcPercentage(dStat.scoredCount, dStat.totalEmployees);
      dStat.unscoredPct =
        dStat.totalEmployees > 0
          ? Number(Math.max(0, 100 - dStat.scoredPct).toFixed(1))
          : 0;
      dStat.avgScore =
        dStat.scoredCount > 0 ? dStat.totalScore / dStat.scoredCount : 0;
      deptRows.push(dStat);
    }

    const completionSorted = [...deptRows].sort((a, b) => {
      if (b.scoredPct !== a.scoredPct) return b.scoredPct - a.scoredPct;
      if (b.scoredCount !== a.scoredCount) return b.scoredCount - a.scoredCount;
      if (b.totalEmployees !== a.totalEmployees) return b.totalEmployees - a.totalEmployees;
      return a.deptName.localeCompare(b.deptName);
    });

    const totalUnscored = Math.max(0, totalEmp - totalScored);
    const sPct = calcPercentage(totalScored, totalEmp);
    const uPct = totalEmp > 0 ? Number(Math.max(0, 100 - sPct).toFixed(1)) : 0;
    const overallAvg = totalScored > 0 ? grandTotalScore / totalScored : 0;

    return {
      totalEmployeesCount: totalEmp,
      scoredCount: totalScored,
      unscoredCount: totalUnscored,
      scoredPercentage: sPct,
      unscoredPercentage: uPct,
      avgScore: overallAvg,
      completionChartData: completionSorted,
    };
  }, [allEmployees, departments, appraisalByEmpId, selectedDeptId, selectedMonth]);

  // Actual DB Grade distribution for the selected filters
  const gradeDistribution = useMemo(() => {
    let sangatBaik = 0; // >= 90
    let baik = 0;       // >= 80 & < 90
    let cukup = 0;      // >= 70 & < 80
    let perluPeningkatan = 0; // < 70 & > 0

    const filterDeptNum = selectedDeptId === "ALL" ? null : Number(selectedDeptId);
    const filterMonthNum = selectedMonth === "ALL" ? null : Number(selectedMonth);

    for (let i = 0; i < allEmployees.length; i++) {
      const emp = allEmployees[i];
      if (filterDeptNum !== null && emp.departmentId !== filterDeptNum) continue;

      const app = appraisalByEmpId.get(emp.id);
      if (!app) continue;

      let empScore = 0;
      if (filterMonthNum === null) {
        empScore = normalizeKpiScore(app.finalScore);
      } else {
        const mScores = app.monthlyScores;
        if (mScores && mScores[filterMonthNum] !== undefined) {
          empScore = normalizeKpiScore(mScores[filterMonthNum]);
        } else if (!mScores || Object.keys(mScores).length === 0) {
          if (app.updatedAt) {
            const updMonth = new Date(app.updatedAt).getMonth() + 1;
            if (updMonth === filterMonthNum) {
              empScore = normalizeKpiScore(app.finalScore);
            }
          }
        }
      }

      if (empScore >= 90) sangatBaik++;
      else if (empScore >= 80) baik++;
      else if (empScore >= 70) cukup++;
      else if (empScore > 0) perluPeningkatan++;
    }

    return { sangatBaik, baik, cukup, perluPeningkatan };
  }, [allEmployees, appraisalByEmpId, selectedDeptId, selectedMonth]);

  const getScoreCategory = (score: number) => {
    if (score >= 90) return { label: "Sangat Baik", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (score >= 80) return { label: "Baik", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" };
    if (score >= 70) return { label: "Cukup", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" };
    if (score > 0) return { label: "Perlu Peningkatan", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" };
    return { label: "Belum dinilai", badgeClass: "bg-slate-100 text-slate-500 border-slate-200" };
  };

  const avgCategory = getScoreCategory(avgScore);

  // SVG Doughnut Chart parameters
  const doughnutRadius = 66;
  const circumference = 2 * Math.PI * doughnutRadius;
  const scoredStrokeLength = totalEmployeesCount > 0 ? (scoredCount / totalEmployeesCount) * circumference : 0;
  const unscoredStrokeLength = totalEmployeesCount > 0 ? (unscoredCount / totalEmployeesCount) * circumference : 0;

  const selectedDeptName = useMemo(() => {
    if (selectedDeptId === "ALL") return "Semua Departemen";
    const found = departments.find((d) => String(d.id) === selectedDeptId);
    return found ? `${found.name} (${found.code})` : "Departemen Terpilih";
  }, [departments, selectedDeptId]);

  const isFiltered = selectedDeptId !== "ALL" || selectedMonth !== "ALL" || selectedPeriodId !== activePeriod.id;

  const displayedDepartmentList = useMemo(() => {
    if (selectedDeptId !== "ALL" || showAllCompletion) {
      return completionChartData;
    }
    return completionChartData.slice(0, 5);
  }, [completionChartData, selectedDeptId, showAllCompletion]);

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-10 pt-1">
      {/* 1. FILTER BAR (MODERN ENTERPRISE FILTER HEADER) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Label */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1 shrink-0">
              <Filter className="w-4 h-4 text-sky-600" />
              <span>Filter:</span>
            </div>

            {/* Periode Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50/80 rounded-xl border border-slate-200/90 px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500">Periode</span>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
                title="Pilih Periode KPI"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.status === "ACTIVE" ? "(Aktif)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulan Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50/80 rounded-xl border border-slate-200/90 px-2.5 py-1">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500">Bulan</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
                title="Pilih Bulan Evaluasi"
              >
                <option value="ALL">Semua Bulan (YTD)</option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={String(idx + 1)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Departemen Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50/80 rounded-xl border border-slate-200/90 px-2.5 py-1">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500">Departemen</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-[200px] truncate"
                title="Pilih Departemen"
              >
                <option value="ALL">Semua Departemen ({departments.length})</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Current Context Pill */}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100/80 border border-slate-200/60 px-2.5 py-1 rounded-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              <span className="truncate max-w-[180px]">{selectedDeptName}</span>
            </span>

            {/* Reset Filter Button */}
            {isFiltered && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDeptId("ALL");
                  setSelectedMonth("ALL");
                  setSelectedPeriodId(activePeriod.id);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl px-2.5 py-1 transition cursor-pointer active:scale-95"
                title="Reset semua filter ke default"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. RINGKASAN KPI (3 SUMMARY CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* CARD 1: TOTAL EMPLOYEE */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Employee
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Users className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="my-2.5">
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {totalEmployeesCount.toLocaleString("id-ID")}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 truncate">Karyawan aktif terdaftar</span>
            <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              100%
            </span>
          </div>
        </div>

        {/* CARD 2: SUDAH DINILAI */}
        <div className="rounded-2xl border border-emerald-200/80 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sudah Dinilai
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="my-2.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-emerald-600 tracking-tight">
              {scoredCount.toLocaleString("id-ID")}
            </span>
            <span className="text-sm font-bold text-slate-400">
              / {totalEmployeesCount.toLocaleString("id-ID")}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 truncate">
              {scoredCount > 0 ? "Evaluasi selesai" : "Belum ada evaluasi"}
            </span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {scoredPercentage}%
            </span>
          </div>
        </div>

        {/* CARD 3: BELUM DINILAI */}
        <div className="rounded-2xl border border-amber-200/80 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Belum Dinilai
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="my-2.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-amber-600 tracking-tight">
              {unscoredCount.toLocaleString("id-ID")}
            </span>
            <span className="text-sm font-bold text-slate-400">
              / {totalEmployeesCount.toLocaleString("id-ID")}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 truncate">
              {unscoredCount > 0 ? "Perlu penilaian" : "Semua selesai dinilai"}
            </span>
            <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {unscoredPercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* 3. MULTI-VISUAL SECTION: KOMBINASI GRID HORIZONTAL BAR CHART & DOUGHNUT CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* KOLOM KIRI (7/12 atau 8/12): DIAGRAM BAR HORIZONTAL PENYELESAIAN PER DEPARTEMEN */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          {/* Header Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BarChart3 className="w-4.5 h-4.5 text-sky-600 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Penyelesaian KPI per Departemen
                </h3>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  {selectedDeptId !== "ALL"
                    ? "Departemen Terpilih"
                    : showAllCompletion
                    ? `Semua (${completionChartData.length})`
                    : "5 Teratas"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Perbandingan progres penilaian dan jumlah karyawan antar-departemen
              </p>
            </div>

            {/* Tombol Lihat Semua / 5 Teratas */}
            {selectedDeptId === "ALL" && completionChartData.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllCompletion((prev) => !prev)}
                className="text-xs font-semibold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100/80 border border-sky-200 px-3 py-1.5 rounded-xl transition cursor-pointer active:scale-95"
              >
                {showAllCompletion ? "Tampilkan 5 Teratas" : `Lihat Semua (${completionChartData.length})`}
              </button>
            )}

            {/* Quick reset if filtered to 1 dept */}
            {selectedDeptId !== "ALL" && (
              <button
                type="button"
                onClick={() => setSelectedDeptId("ALL")}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
              >
                Tampilkan Semua Departemen
              </button>
            )}
          </div>

          {/* Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-3.5 px-1">
            <span className="text-slate-500 font-medium text-[11px]">
              Menampilkan {displayedDepartmentList.length} departemen
            </span>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500 inline-block" />
                Sudah Dinilai ({scoredCount})
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-400 inline-block" />
                Belum Dinilai ({unscoredCount})
              </span>
            </div>
          </div>

          {displayedDepartmentList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Tidak ada data departemen untuk filter yang dipilih.
            </div>
          ) : (
            <div>
              {/* Scale Header */}
              <div className="flex items-center gap-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div className="w-36 sm:w-48 shrink-0">Departemen</div>
                <div className="relative flex-1 h-4">
                  {AXIS_TICKS.map((tick) => (
                    <span
                      key={tick}
                      className="absolute -translate-x-1/2"
                      style={{
                        left: `${tick}%`,
                        ...(tick === 0 ? { transform: "none" } : {}),
                        ...(tick === 100 ? { transform: "translateX(-100%)" } : {}),
                      }}
                    >
                      {tick}%
                    </span>
                  ))}
                </div>
                <div className="w-28 sm:w-36 shrink-0 text-right">Progres</div>
              </div>

              {/* Department Horizontal Bars List */}
              <div className="space-y-2.5">
                {displayedDepartmentList.map((dept) => {
                  const hasData = dept.scoredCount > 0;
                  const visualScoredWidth = hasData ? Math.max(4, dept.scoredPct) : 0;
                  const visualUnscoredWidth = Math.max(0, 100 - visualScoredWidth);

                  return (
                    <div
                      key={dept.deptId}
                      className="flex items-center gap-3 text-xs group hover:bg-slate-50/60 p-1.5 rounded-xl transition-colors"
                    >
                      {/* Department Name & Code */}
                      <div
                        className="w-36 sm:w-48 shrink-0 min-w-0"
                        title={`${dept.deptName} (${dept.totalEmployees} karyawan)`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDeptId(String(dept.deptId))}
                          className="font-bold text-slate-800 hover:text-sky-700 truncate block text-left w-full cursor-pointer transition-colors"
                        >
                          {dept.deptName}
                        </button>
                        <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px]">
                            {dept.deptCode !== "-" ? dept.deptCode : "DEPT"}
                          </span>
                          <span>{dept.totalEmployees} karyawan</span>
                        </div>
                      </div>

                      {/* Clean Horizontal Stacked Bar */}
                      <div className="relative flex-1 h-7 rounded-lg bg-slate-100/90 border border-slate-200/80 overflow-hidden flex items-center">
                        {/* Grid Vertical Dashes */}
                        <div className="pointer-events-none absolute inset-0 flex justify-between">
                          {AXIS_TICKS.map((tick) => (
                            <span
                              key={tick}
                              className="h-full border-r border-dashed border-slate-200 first:border-none last:border-none"
                            />
                          ))}
                        </div>

                        {hasData ? (
                          <>
                            {/* Sudah Dinilai (Emerald) */}
                            <div
                              className="relative z-10 h-full bg-emerald-500 transition-[width] duration-300 flex items-center justify-end pr-1.5"
                              style={{ width: `${visualScoredWidth}%` }}
                              title={`${dept.deptName} - Sudah Dinilai: ${dept.scoredCount} orang (${dept.scoredPct}%)`}
                            >
                              {visualScoredWidth >= 12 && (
                                <span className="text-[10px] font-bold text-white leading-none">
                                  {dept.scoredPct}%
                                </span>
                              )}
                            </div>

                            {/* Belum Dinilai (Amber Muda) */}
                            {visualUnscoredWidth > 0 && (
                              <div
                                className="relative z-10 h-full bg-amber-100/90 transition-[width] duration-300 flex items-center px-2"
                                style={{ width: `${visualUnscoredWidth}%` }}
                                title={`${dept.deptName} - Belum Dinilai: ${dept.unscoredCount} orang (${dept.unscoredPct}%)`}
                              >
                                {visualUnscoredWidth >= 28 && (
                                  <span className="text-[10px] font-medium text-amber-900/80 truncate leading-none">
                                    {dept.unscoredCount} pending
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="relative z-10 h-full w-full flex items-center px-3 text-[10px] text-slate-400 font-medium">
                            Belum ada penilaian (0%)
                          </div>
                        )}
                      </div>

                      {/* Right-side Metrics */}
                      <div className="w-28 sm:w-36 shrink-0 text-right text-xs tabular-nums flex items-center justify-end gap-1.5">
                        {hasData ? (
                          <>
                            <span className="font-bold text-emerald-700">{dept.scoredCount}</span>
                            <span className="text-slate-400 text-[11px]">/{dept.totalEmployees}</span>
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {dept.scoredPct}%
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400 font-medium">0/{dept.totalEmployees}</span>
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-400">
                              0%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Diurutkan berdasarkan persentase penyelesaian tertinggi.</span>
                {selectedDeptId === "ALL" && completionChartData.length > 5 && !showAllCompletion && (
                  <button
                    type="button"
                    onClick={() => setShowAllCompletion(true)}
                    className="font-semibold text-sky-700 hover:underline cursor-pointer"
                  >
                    Tampilkan {completionChartData.length - 5} departemen lainnya &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* KOLOM KANAN (5/12 atau 4/12): DIAGRAM DONAT KOMPOSISI & DISTRIBUSI PREDIKAT SKOR */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
          {/* CARD A: DOUGHNUT CHART (KOMPOSISI SUDAH VS BELUM DINILAI) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <PieChart className="w-4.5 h-4.5 text-sky-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Komposisi Penilaian KPI
                </h3>
                <p className="text-[11px] text-slate-500">
                  Proporsi penyelesaian evaluasi seluruh karyawan
                </p>
              </div>
            </div>

            {/* Doughnut Chart Canvas */}
            <div className="relative flex items-center justify-center my-2">
              <div className="relative w-44 h-44">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 160 160">
                  {/* Background Track */}
                  <circle
                    cx="80"
                    cy="80"
                    r={doughnutRadius}
                    className="stroke-slate-100"
                    strokeWidth="18"
                    fill="transparent"
                  />

                  {totalEmployeesCount > 0 && (
                    <>
                      {/* Scored Arc (Emerald) */}
                      {scoredCount > 0 && (
                        <circle
                          cx="80"
                          cy="80"
                          r={doughnutRadius}
                          className="stroke-emerald-500 transition-all duration-500"
                          strokeWidth="18"
                          strokeDasharray={`${scoredStrokeLength} ${circumference}`}
                          strokeDashoffset={0}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      )}

                      {/* Unscored Arc (Amber) */}
                      {unscoredCount > 0 && (
                        <circle
                          cx="80"
                          cy="80"
                          r={doughnutRadius}
                          className="stroke-amber-400 transition-all duration-500"
                          strokeWidth="18"
                          strokeDasharray={`${unscoredStrokeLength} ${circumference}`}
                          strokeDashoffset={-scoredStrokeLength}
                          strokeLinecap={scoredCount > 0 ? "butt" : "round"}
                          fill="transparent"
                        />
                      )}
                    </>
                  )}
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {scoredPercentage}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Selesai
                  </span>
                </div>
              </div>
            </div>

            {/* Doughnut Legend & Detail Breakdowns */}
            <div className="space-y-2 mt-4 pt-3.5 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-slate-700">Sudah Dinilai</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-700">{scoredCount}</span>
                  <span className="text-slate-400 text-[11px] ml-1">({scoredPercentage}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="font-semibold text-slate-700">Belum Dinilai</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-amber-700">{unscoredCount}</span>
                  <span className="text-slate-400 text-[11px] ml-1">({unscoredPercentage}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-500">
                <span>Total Target Karyawan</span>
                <span className="font-bold text-slate-800">{totalEmployeesCount} orang</span>
              </div>
            </div>
          </div>

          {/* CARD B: DISTRIBUSI PREDIKAT SKOR (GRADE DISTRIBUTION) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <TrendingUp className="w-4.5 h-4.5 text-sky-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Distribusi Predikat Skor
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pencapaian nilai karyawan terevaluasi ({scoredCount} orang)
                </p>
              </div>
            </div>

            {scoredCount === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Belum ada data nilai pada periode/filter ini.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* Sangat Baik */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Sangat Baik (&ge; 90)
                    </span>
                    <span className="font-bold text-slate-800">
                      {gradeDistribution.sangatBaik}{" "}
                      <span className="text-slate-400 font-normal">
                        ({calcPercentage(gradeDistribution.sangatBaik, scoredCount)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${calcPercentage(gradeDistribution.sangatBaik, scoredCount)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Baik */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Baik (80 - 89.9)
                    </span>
                    <span className="font-bold text-slate-800">
                      {gradeDistribution.baik}{" "}
                      <span className="text-slate-400 font-normal">
                        ({calcPercentage(gradeDistribution.baik, scoredCount)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${calcPercentage(gradeDistribution.baik, scoredCount)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Cukup */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Cukup (70 - 79.9)
                    </span>
                    <span className="font-bold text-slate-800">
                      {gradeDistribution.cukup}{" "}
                      <span className="text-slate-400 font-normal">
                        ({calcPercentage(gradeDistribution.cukup, scoredCount)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${calcPercentage(gradeDistribution.cukup, scoredCount)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Perlu Peningkatan */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Perlu Peningkatan (&lt; 70)
                    </span>
                    <span className="font-bold text-slate-800">
                      {gradeDistribution.perluPeningkatan}{" "}
                      <span className="text-slate-400 font-normal">
                        ({calcPercentage(gradeDistribution.perluPeningkatan, scoredCount)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${calcPercentage(gradeDistribution.perluPeningkatan, scoredCount)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
