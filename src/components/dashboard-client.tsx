"use client";

import React, { useState, useMemo } from "react";
import type { UserSession } from "@/lib/auth";

export interface DashboardClientProps {
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
  }>;
  systemDate?: string;
  templatesCount?: number;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export function DashboardClient({
  currentUser,
  activePeriod,
  periods,
  departments,
  allEmployees,
  allAppraisals,
}: DashboardClientProps) {
  // 1. FILTER STATES
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(activePeriod.id);
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL"); // 'ALL' (YTD) or '1'..'12'
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

  // Filtered employees according to department selection
  const filteredEmployees = useMemo(() => {
    if (selectedDeptId === "ALL") {
      return allEmployees;
    }
    const deptIdNum = Number(selectedDeptId);
    return allEmployees.filter((e) => e.departmentId === deptIdNum);
  }, [allEmployees, selectedDeptId]);

  // Appraisals matching the selected period and department
  const periodAppraisals = useMemo(() => {
    return allAppraisals.filter((a) => a.periodId === selectedPeriodId);
  }, [allAppraisals, selectedPeriodId]);

  const filteredAppraisals = useMemo(() => {
    if (selectedDeptId === "ALL") {
      return periodAppraisals;
    }
    const deptIdNum = Number(selectedDeptId);
    return periodAppraisals.filter((a) => a.deptId === deptIdNum);
  }, [periodAppraisals, selectedDeptId]);

  // Map for fast appraisal lookup by employeeId
  const appraisalByEmpId = useMemo(() => {
    const map = new Map<number, (typeof periodAppraisals)[0]>();
    for (const app of filteredAppraisals) {
      map.set(app.employeeId, app);
    }
    return map;
  }, [filteredAppraisals]);

  // 2. SUMMARY KPI CALCULATIONS
  const totalEmployeesCount = filteredEmployees.length;

  // Sudah Dinilai: has finalScore > 0
  const evaluatedEmployees = useMemo(() => {
    return filteredEmployees.filter((emp) => {
      const app = appraisalByEmpId.get(emp.id);
      return app && app.finalScore !== null && Number(app.finalScore) > 0;
    });
  }, [filteredEmployees, appraisalByEmpId]);

  const scoredCount = evaluatedEmployees.length;
  const unscoredCount = Math.max(0, totalEmployeesCount - scoredCount);
  const scoredPercentage = totalEmployeesCount > 0
    ? Math.round((scoredCount / totalEmployeesCount) * 100)
    : 0;
  const unscoredPercentage = totalEmployeesCount > 0
    ? Math.round((unscoredCount / totalEmployeesCount) * 100)
    : 0;

  // Average KPI Score
  const avgScore = useMemo(() => {
    if (scoredCount === 0) return 0;
    const totalScore = evaluatedEmployees.reduce((sum, emp) => {
      const app = appraisalByEmpId.get(emp.id);
      return sum + (app?.finalScore ? Number(app.finalScore) : 0);
    }, 0);
    return totalScore / scoredCount;
  }, [evaluatedEmployees, scoredCount, appraisalByEmpId]);

  // Score category label
  const getScoreCategory = (score: number) => {
    if (score >= 90) return { label: "Sangat Baik", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (score >= 80) return { label: "Baik", color: "text-sky-700 bg-sky-50 border-sky-200" };
    if (score >= 70) return { label: "Cukup", color: "text-amber-700 bg-amber-50 border-amber-200" };
    if (score > 0) return { label: "Perlu Peningkatan", color: "text-rose-700 bg-rose-50 border-rose-200" };
    return { label: "Belum ada data", color: "text-slate-600 bg-slate-100 border-slate-200" };
  };

  const avgCategory = getScoreCategory(avgScore);

  // 3. STATUS PENILAIAN BREAKDOWN (Final, Review, Draft, Belum Mulai)
  const statusCounts = useMemo(() => {
    let finalCount = 0;
    let reviewCount = 0;
    let draftCount = 0;
    let unstartedCount = 0;

    for (const emp of filteredEmployees) {
      const app = appraisalByEmpId.get(emp.id);
      if (!app) {
        unstartedCount++;
      } else if (app.status === "FINAL") {
        finalCount++;
      } else if (
        app.status === "REVIEWED" ||
        app.status === "SUBMITTED" ||
        app.status.startsWith("PENDING_")
      ) {
        reviewCount++;
      } else if (app.status === "DRAFT" || app.status.startsWith("REVISED_")) {
        draftCount++;
      } else {
        unstartedCount++;
      }
    }

    return {
      final: finalCount,
      review: reviewCount,
      draft: draftCount,
      unstarted: unstartedCount,
    };
  }, [filteredEmployees, appraisalByEmpId]);

  // 4. DISTRIBUSI SCORE (90-100, 80-89, 70-79, <70)
  const scoreDistribution = useMemo(() => {
    let range90_100 = 0;
    let range80_89 = 0;
    let range70_79 = 0;
    let rangeUnder70 = 0;

    for (const emp of evaluatedEmployees) {
      const app = appraisalByEmpId.get(emp.id);
      const score = app?.finalScore ? Number(app.finalScore) : 0;
      if (score >= 90) range90_100++;
      else if (score >= 80) range80_89++;
      else if (score >= 70) range70_79++;
      else if (score > 0) rangeUnder70++;
    }

    return {
      range90_100,
      range80_89,
      range70_79,
      rangeUnder70,
    };
  }, [evaluatedEmployees, appraisalByEmpId]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8 pt-1">
      {/* 1. FILTER BAR (COMPACT & INLINE) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Periode */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Periode:</span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status === "ACTIVE" ? "(Aktif)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Bulan */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Bulan:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer"
            >
              <option value="ALL">Semua Bulan (YTD)</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={String(idx + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Department:</span>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer"
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

        {/* Reset Filter Button if customized */}
        {(selectedDeptId !== "ALL" || selectedMonth !== "ALL" || selectedPeriodId !== activePeriod.id) && (
          <button
            type="button"
            onClick={() => {
              setSelectedDeptId("ALL");
              setSelectedMonth("ALL");
              setSelectedPeriodId(activePeriod.id);
            }}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
            title="Reset filter"
          >
            Reset Filter
          </button>
        )}
      </div>

      {/* 2. SUMMARY KPI (4 CARDS DALAM 1 BARIS COMPACT) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Employee */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Employee
          </span>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            {totalEmployeesCount}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Karyawan aktif terdaftar
          </div>
        </div>

        {/* Card 2: Sudah Dinilai */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Sudah Dinilai
            </span>
            <span className="text-[11px] font-bold text-emerald-700">
              {scoredPercentage}%
            </span>
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            <span className="text-emerald-700">{scoredCount}</span>
            <span className="text-slate-400 text-base font-bold">/{totalEmployeesCount}</span>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-1">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${scoredPercentage}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {scoredCount > 0 ? `${scoredPercentage}% selesai dinilai` : "Belum ada penilaian selesai"}
          </div>
        </div>

        {/* Card 3: Belum Dinilai */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Belum Dinilai
            </span>
            <span className="text-[11px] font-bold text-amber-700">
              {unscoredPercentage}%
            </span>
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            <span className="text-amber-700">{unscoredCount}</span>
            <span className="text-slate-400 text-base font-bold">/{totalEmployeesCount}</span>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-1">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${unscoredPercentage}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {unscoredCount > 0 ? `${unscoredPercentage}% perlu penilaian` : "Semua karyawan telah dinilai"}
          </div>
        </div>

        {/* Card 4: Rata-Rata Score KPI */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Rata-Rata Score KPI
          </span>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            {scoredCount > 0 ? (
              <>
                <span>{avgScore.toFixed(1)}</span>
                <span className="text-slate-400 text-sm font-semibold"> / 100</span>
              </>
            ) : (
              <span className="text-slate-400 font-bold">—</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {scoredCount > 0 ? `Kategori: ${avgCategory.label}` : "Belum ada data"}
          </div>
        </div>
      </div>

      {/* 3 & 4. STATUS PENILAIAN & DISTRIBUSI SCORE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* STATUS PENILAIAN */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Status Penilaian
                </h3>
                <p className="text-[11px] text-slate-500">
                  Progres tahapan penilaian karyawan di periode aktif
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                Total: {totalEmployeesCount}
              </span>
            </div>

            {/* Stacked Proportional Bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex mb-3.5">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{
                  width: `${totalEmployeesCount > 0 ? (statusCounts.final / totalEmployeesCount) * 100 : 0}%`,
                }}
                title={`Final: ${statusCounts.final}`}
              />
              <div
                className="bg-sky-500 h-full transition-all"
                style={{
                  width: `${totalEmployeesCount > 0 ? (statusCounts.review / totalEmployeesCount) * 100 : 0}%`,
                }}
                title={`Review: ${statusCounts.review}`}
              />
              <div
                className="bg-amber-400 h-full transition-all"
                style={{
                  width: `${totalEmployeesCount > 0 ? (statusCounts.draft / totalEmployeesCount) * 100 : 0}%`,
                }}
                title={`Draft: ${statusCounts.draft}`}
              />
              <div
                className="bg-slate-300 h-full transition-all"
                style={{
                  width: `${totalEmployeesCount > 0 ? (statusCounts.unstarted / totalEmployeesCount) * 100 : 0}%`,
                }}
                title={`Belum Mulai: ${statusCounts.unstarted}`}
              />
            </div>

            {/* 4 Status Cards */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {/* Final */}
              <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-800">Final</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-xl font-black text-emerald-900">
                    {statusCounts.final}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700">
                    {totalEmployeesCount > 0 ? Math.round((statusCounts.final / totalEmployeesCount) * 100) : 0}%
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700 block">Selesai & disetujui</span>
              </div>

              {/* Review */}
              <div className="p-2.5 rounded-lg border border-sky-200 bg-sky-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-800">Review</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-xl font-black text-sky-900">
                    {statusCounts.review}
                  </span>
                  <span className="text-[11px] font-bold text-sky-700">
                    {totalEmployeesCount > 0 ? Math.round((statusCounts.review / totalEmployeesCount) * 100) : 0}%
                  </span>
                </div>
                <span className="text-[10px] text-sky-700 block">Proses review atasan</span>
              </div>

              {/* Draft */}
              <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-800">Draft</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-xl font-black text-amber-900">
                    {statusCounts.draft}
                  </span>
                  <span className="text-[11px] font-bold text-amber-700">
                    {totalEmployeesCount > 0 ? Math.round((statusCounts.draft / totalEmployeesCount) * 100) : 0}%
                  </span>
                </div>
                <span className="text-[10px] text-amber-700 block">Form belum diajukan</span>
              </div>

              {/* Belum Mulai */}
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">Belum Mulai</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-xl font-black text-slate-900">
                    {statusCounts.unstarted}
                  </span>
                  <span className="text-[11px] font-bold text-slate-600">
                    {totalEmployeesCount > 0 ? Math.round((statusCounts.unstarted / totalEmployeesCount) * 100) : 0}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block">Belum dibuatkan form</span>
              </div>
            </div>
          </div>
        </div>

        {/* DISTRIBUSI SCORE */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Distribusi Score
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pengelompokan score karyawan yang telah dinilai ({scoredCount} orang)
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                Rata-rata: {scoredCount > 0 ? avgScore.toFixed(1) : "—"}
              </span>
            </div>

            {/* Distribution Rows */}
            <div className="space-y-2.5 text-xs">
              {/* Range 90 - 100 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>90 - 100 (Sangat Baik)</span>
                  </div>
                  <div className="font-semibold text-slate-700 text-[11px]">
                    <b className="text-emerald-700">{scoreDistribution.range90_100}</b> orang{" "}
                    <span className="text-slate-400">
                      ({scoredCount > 0 ? Math.round((scoreDistribution.range90_100 / scoredCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{
                      width: `${scoredCount > 0 ? (scoreDistribution.range90_100 / scoredCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Range 80 - 89 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    <span>80 - 89 (Baik)</span>
                  </div>
                  <div className="font-semibold text-slate-700 text-[11px]">
                    <b className="text-sky-700">{scoreDistribution.range80_89}</b> orang{" "}
                    <span className="text-slate-400">
                      ({scoredCount > 0 ? Math.round((scoreDistribution.range80_89 / scoredCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all"
                    style={{
                      width: `${scoredCount > 0 ? (scoreDistribution.range80_89 / scoredCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Range 70 - 79 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span>70 - 79 (Cukup)</span>
                  </div>
                  <div className="font-semibold text-slate-700 text-[11px]">
                    <b className="text-amber-700">{scoreDistribution.range70_79}</b> orang{" "}
                    <span className="text-slate-400">
                      ({scoredCount > 0 ? Math.round((scoreDistribution.range70_79 / scoredCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full rounded-full transition-all"
                    style={{
                      width: `${scoredCount > 0 ? (scoreDistribution.range70_79 / scoredCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Range < 70 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    <span>&lt; 70 (Perlu Peningkatan)</span>
                  </div>
                  <div className="font-semibold text-slate-700 text-[11px]">
                    <b className="text-rose-700">{scoreDistribution.rangeUnder70}</b> orang{" "}
                    <span className="text-slate-400">
                      ({scoredCount > 0 ? Math.round((scoreDistribution.rangeUnder70 / scoredCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all"
                    style={{
                      width: `${scoredCount > 0 ? (scoreDistribution.rangeUnder70 / scoredCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
