"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { getReport } from "@/lib/report";
import { SummaryKpiView } from "./summary-kpi-view";
import { Badge, Card, PageHeader, StatCard, Table, statusTone, td, th } from "@/components/ui";
import { fmtPct, formatTenureYearsFromMonths, gradeOf } from "@/lib/scoring";

interface ReportPageClientProps {
  reportData: Awaited<ReturnType<typeof getReport>>;
}

export function ReportPageClient({ reportData }: ReportPageClientProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "analytics">("summary");
  const { period, periods, rows, byDept, byLevel, distribution, avg, scoredCount } = reportData;
  const maxDist = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Laporan & Management Summary KPI"
        subtitle={`Rekap penilaian kinerja komprehensif seluruh unit operasional · Periode ${period?.name ?? "-"}`}
        backHref="/dashboard"
        backLabel="Kembali ke Dashboard"
        actions={
          period && (
            <div className="flex items-center gap-2">
              <a
                href={`/api/report/export?periodId=${period.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer"
              >
                <svg className="w-4 h-4 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Excel (.xlsx)</span>
              </a>
              <a
                href={`/api/report?periodId=${period.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                JSON API
              </a>
            </div>
          )
        }
      />

      {/* 2. Top Navigation Tabs (Inspired by Reference Screenshot) */}
      <div className="flex items-center gap-1 bg-slate-900 text-slate-300 p-1.5 rounded-xl border border-slate-800 shadow-md overflow-x-auto">
        {/* Tab 1: Summary KPI */}
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === "summary"
              ? "bg-blue-600 text-white shadow-sm"
              : "hover:bg-slate-800 hover:text-white"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Summary KPI</span>
        </button>

        {/* Tab 2: Statistik & Analisis */}
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white shadow-sm"
              : "hover:bg-slate-800 hover:text-white"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span>Statistik & Analisis</span>
        </button>

        {/* Tab 3: Data Karyawan Direct Link */}
        <Link
          href="/setup"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 hover:text-white transition cursor-pointer shrink-0 text-slate-400"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span>Data Karyawan</span>
        </Link>
      </div>

      {/* 3. Periode Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-600 mr-1">Pilih Periode:</span>
        {periods.map((p) => {
          const isSelected = period?.id === p.id;
          return (
            <Link
              key={p.id}
              href={`/report?period=${p.id}`}
              className={`rounded-full px-3.5 py-1 font-semibold transition ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {p.name} {p.status === "ACTIVE" ? "(Aktif)" : ""}
            </Link>
          );
        })}
      </div>

      {/* 4. Tab 1: Summary KPI View (Table sesuai template spreadsheet) */}
      {activeTab === "summary" && (
        <SummaryKpiView
          rows={rows}
          period={period}
          periods={periods}
          selectedPeriodId={period?.id}
        />
      )}

      {/* 5. Tab 2: Statistik & Analisis */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Total Penilaian Final" value={rows.length} tone="green" />
            <StatCard label="Unit Operasional" value={new Set(rows.map((r) => r.operatingUnit)).size} tone="slate" />
            <StatCard label="Departemen" value={new Set(rows.map((r) => r.dept)).size} tone="slate" />
            <StatCard label="Rata-rata KPI Final" value={avg ? fmtPct(avg) : "-"} tone="blue" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Distribusi Grade">
              <div className="space-y-2">
                {distribution.map((d) => {
                  const g = gradeOf(
                    d.grade === "Outstanding"
                      ? 100
                      : d.grade === "Exceeds"
                      ? 90
                      : d.grade === "Meets"
                      ? 75
                      : d.grade === "Needs Improvement"
                      ? 60
                      : 0
                  );
                  return (
                    <div key={d.grade} className="text-sm">
                      <div className="flex justify-between">
                        <span>{d.grade}</span>
                        <b>{d.count}</b>
                      </div>
                      <div className="h-2 rounded bg-slate-100">
                        <div
                          className={`h-2 rounded ${g.color}`}
                          style={{ width: `${(d.count / maxDist) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Outstanding ≥100% · Exceeds ≥90% · Meets ≥75% · Needs Improvement ≥60% · Below &lt;60%
              </p>
            </Card>

            <Card title="Rekap per Departemen">
              <Table
                head={
                  <tr>
                    <th className={th}>Departemen</th>
                    <th className={th}>Eligible</th>
                    <th className={th}>Final</th>
                    <th className={`${th} text-right`}>Avg</th>
                    <th className={`${th} text-right`}>Min–Max</th>
                  </tr>
                }
              >
                {byDept.map((d) => (
                  <tr key={d.name}>
                    <td className={td}>{d.name}</td>
                    <td className={td}>
                      {d.eligible}/{d.total}
                    </td>
                    <td className={td}>{d.final}</td>
                    <td className={`${td} text-right font-semibold`}>
                      {d.avg ? fmtPct(d.avg) : "-"}
                    </td>
                    <td className={`${td} text-right text-xs`}>
                      {d.scored ? `${fmtPct(d.min)} – ${fmtPct(d.max)}` : "-"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card title="Rekap per Job Level">
              <Table
                head={
                  <tr>
                    <th className={th}>Job Level</th>
                    <th className={th}>Eligible</th>
                    <th className={th}>Final</th>
                    <th className={`${th} text-right`}>Avg</th>
                  </tr>
                }
              >
                {byLevel.map((d) => (
                  <tr key={d.name}>
                    <td className={td}>{d.name}</td>
                    <td className={td}>
                      {d.eligible}/{d.total}
                    </td>
                    <td className={td}>{d.final}</td>
                    <td className={`${td} text-right font-semibold`}>
                      {d.avg ? fmtPct(d.avg) : "-"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
