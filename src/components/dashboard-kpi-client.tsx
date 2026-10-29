"use client";

import React, { useState, useMemo } from "react";
import type { UserSession } from "@/lib/auth";

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

  const getScoreCategory = (score: number) => {
    if (score >= 90) return { label: "Sangat Baik" };
    if (score >= 80) return { label: "Baik" };
    if (score >= 70) return { label: "Cukup" };
    if (score > 0) return { label: "Perlu Peningkatan" };
    return { label: "Belum ada data" };
  };

  const avgCategory = getScoreCategory(avgScore);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8 pt-1">
      {/* 1. FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
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

      {/* 2. KARTU STATISTIK RINGKASAN (4 KARTU) - KOMBINASI BIRU, HIJAU, ORANGE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* TOTAL EMPLOYEE - BIRU */}
        <div className="rounded-xl border border-blue-100 bg-white p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Employee
            </span>
            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            {totalEmployeesCount}
          </div>
          <div className="w-full bg-blue-50 h-1 rounded-full overflow-hidden mb-1">
            <div className="bg-blue-500 h-full w-full rounded-full" />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Karyawan aktif terdaftar
          </div>
        </div>

        {/* SUDAH DINILAI - HIJAU */}
        <div className="rounded-xl border border-emerald-100 bg-white p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Sudah Dinilai
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {scoredPercentage}%
            </span>
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            <span className="text-emerald-700">{scoredCount}</span>
            <span className="text-slate-400 text-base font-bold">/{totalEmployeesCount}</span>
          </div>
          <div className="w-full bg-emerald-50 h-1 rounded-full overflow-hidden mb-1">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${scoredCount > 0 ? Math.max(2, scoredPercentage) : 0}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {scoredCount > 0 ? `${scoredPercentage}% selesai dinilai` : "Belum ada penilaian selesai"}
          </div>
        </div>

        {/* BELUM DINILAI - ORANGE */}
        <div className="rounded-xl border border-orange-100 bg-white p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Belum Dinilai
            </span>
            <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
              {unscoredPercentage}%
            </span>
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            <span className="text-orange-600">{unscoredCount}</span>
            <span className="text-slate-400 text-base font-bold">/{totalEmployeesCount}</span>
          </div>
          <div className="w-full bg-orange-50 h-1 rounded-full overflow-hidden mb-1">
            <div
              className="bg-orange-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${unscoredPercentage}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {unscoredCount > 0 ? `${unscoredPercentage}% perlu penilaian` : "Semua karyawan telah dinilai"}
          </div>
        </div>

        {/* RATA-RATA SCORE KPI - BIRU */}
        <div className="rounded-xl border border-blue-100 bg-white p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Rata-Rata Score KPI
            </span>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              {scoredCount > 0 ? avgCategory.label : "Belum dinilai"}
            </span>
          </div>
          <div className="my-1 text-2xl font-black text-slate-900 tracking-tight">
            {scoredCount > 0 ? (
              <>
                <span className="text-blue-700">{avgScore.toFixed(1)}</span>
                <span className="text-slate-400 text-sm font-semibold"> / 100</span>
              </>
            ) : (
              <span className="text-slate-400 font-bold">-</span>
            )}
          </div>
          <div className="w-full bg-blue-50 h-1 rounded-full overflow-hidden mb-1">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${scoredCount > 0 ? Math.min(100, avgScore) : 0}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {scoredCount > 0 ? `Berdasarkan ${scoredCount} karyawan dinilai` : "Belum ada data"}
          </div>
        </div>
      </div>

      {/* 3. DIAGRAM UTAMA: PENYELESAIAN KPI PER DEPARTEMEN (CLEAN & MINIMALIS) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Penyelesaian KPI per Departemen
              </h3>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                {showAllCompletion ? `Semua (${completionChartData.length})` : "5 Teratas"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Perbandingan persentase dan jumlah karyawan sudah dan belum dinilai per departemen
            </p>
          </div>

          <div className="flex items-center gap-2">
            {completionChartData.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllCompletion((prev) => !prev)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                {showAllCompletion ? "Tampilkan 5 Teratas" : `Lihat Semua (${completionChartData.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Legend: Biru, Hijau, Orange */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-4 px-1">
          <span className="text-slate-500 font-medium">
            Menampilkan {Math.min(showAllCompletion ? completionChartData.length : 5, completionChartData.length)} departemen teratas
          </span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500 inline-block" />
              Sudah Dinilai ({scoredCount})
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-orange-700">
              <span className="h-2.5 w-2.5 rounded-xs bg-orange-400 inline-block" />
              Belum Dinilai ({unscoredCount})
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
              <span className="h-2.5 w-2.5 rounded-xs bg-blue-600 inline-block" />
              Total ({totalEmployeesCount})
            </span>
          </div>
        </div>

        {completionChartData.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Tidak ada data departemen untuk filter yang dipilih.
          </div>
        ) : (
          <div>
            {/* Scale Header */}
            <div className="flex items-center gap-3 mb-2.5 text-[10px] font-semibold text-slate-400">
              <div className="w-40 sm:w-52 shrink-0">Departemen</div>
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
              <div className="w-32 sm:w-36 shrink-0 text-right">Progres & Total</div>
            </div>

            {/* Department Horizontal Bars */}
            <div className="space-y-3">
              {(showAllCompletion ? completionChartData : completionChartData.slice(0, 5)).map((dept) => {
                const hasData = dept.scoredCount > 0;
                const visualScoredWidth = hasData ? Math.max(4, dept.scoredPct) : 0;
                const visualUnscoredWidth = Math.max(0, 100 - visualScoredWidth);

                return (
                  <div
                    key={dept.deptId}
                    className="flex items-center gap-3 text-xs group"
                  >
                    {/* Department Name & Code */}
                    <div
                      className="w-40 sm:w-52 shrink-0 min-w-0"
                      title={`${dept.deptName} (${dept.totalEmployees} karyawan)`}
                    >
                      <div className="font-semibold text-slate-800 truncate">
                        {dept.deptName}
                      </div>
                      <div className="text-[10px] font-medium text-blue-600 flex items-center gap-1">
                        <span className="bg-blue-50 border border-blue-100 px-1.5 py-0.2 rounded">
                          {dept.deptCode !== "-" ? dept.deptCode : "DEPT"}
                        </span>
                        <span className="text-slate-400">({dept.totalEmployees} orang)</span>
                      </div>
                    </div>

                    {/* Clean Horizontal Bar Track */}
                    <div className="relative flex-1 h-6 rounded-md bg-slate-50 border border-slate-200/80 overflow-hidden flex items-center">
                      {/* Vertical Grid Lines */}
                      <div className="pointer-events-none absolute inset-0 flex justify-between">
                        {AXIS_TICKS.map((tick) => (
                          <span
                            key={tick}
                            className="h-full border-r border-dashed border-slate-200/60 first:border-none last:border-none"
                          />
                        ))}
                      </div>

                      {hasData ? (
                        <>
                          {/* Sudah Dinilai (Hijau) */}
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

                          {/* Belum Dinilai (Orange Muda) */}
                          {visualUnscoredWidth > 0 && (
                            <div
                              className="relative z-10 h-full bg-orange-100 transition-[width] duration-300 flex items-center px-2"
                              style={{ width: `${visualUnscoredWidth}%` }}
                              title={`${dept.deptName} - Belum Dinilai: ${dept.unscoredCount} orang (${dept.unscoredPct}%)`}
                            >
                              {visualUnscoredWidth >= 26 && (
                                <span className="text-[10px] font-medium text-orange-800/80 truncate leading-none">
                                  {dept.unscoredCount} belum
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="relative z-10 h-full w-full flex items-center px-3 bg-slate-50/80 text-[10px] text-slate-400 font-medium">
                          Belum ada data penilaian
                        </div>
                      )}
                    </div>

                    {/* Right-side Metrics */}
                    <div className="w-32 sm:w-36 shrink-0 text-right text-xs tabular-nums flex items-center justify-end gap-1.5">
                      {hasData ? (
                        <>
                          <span className="font-bold text-emerald-700">{dept.scoredCount}</span>
                          <span className="text-slate-400">/{dept.totalEmployees}</span>
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
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

            <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Diurutkan dari persentase penyelesaian tertinggi ke terendah berdasarkan data aktual database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

