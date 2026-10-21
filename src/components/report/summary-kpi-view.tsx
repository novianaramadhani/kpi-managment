"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { SummaryKpiRow } from "@/lib/report";
import type { KpiPeriod } from "@/db/schema";
import { Table } from "@/components/ui";

interface SummaryKpiViewProps {
  rows: SummaryKpiRow[];
  period: KpiPeriod | null;
  periods: KpiPeriod[];
  selectedPeriodId?: number;
}

type SortField = "no" | "name" | "hireDate" | "score" | "pola" | "status";
type SortDirection = "asc" | "desc";

export function SummaryKpiView({
  rows,
  period,
  periods,
  selectedPeriodId,
}: SummaryKpiViewProps) {
  const [selectedUnit, setSelectedUnit] = useState<string>("ALL"); // Default ALL agar seluruh unit (HO, GAM, AKP) langsung muncul
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedPola, setSelectedPola] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("no");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Get distinct departments
  const departmentList = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => {
      if (r.deptId && r.dept) map.set(r.deptId, r.dept);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  // Filtered rows (Seluruh rows adalah data penilaian berstatus FINAL)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. Filter Operating Unit
      if (selectedUnit !== "ALL" && r.operatingUnit !== selectedUnit) {
        return false;
      }
      // 2. Filter Department
      if (selectedDept !== "ALL" && String(r.deptId) !== selectedDept) {
        return false;
      }
      // 3. Filter Pola Penggajian
      if (selectedPola !== "ALL" && (r.polaPenggajian || "All In") !== selectedPola) {
        return false;
      }
      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchNik = r.nik.toLowerCase().includes(q);
        const matchJob = r.jobPosition.toLowerCase().includes(q);
        const matchAppraiser = r.appraiserName.toLowerCase().includes(q);
        const matchPola = (r.polaPenggajian || "").toLowerCase().includes(q);
        if (!matchName && !matchNik && !matchJob && !matchAppraiser && !matchPola) return false;
      }
      return true;
    });
  }, [rows, selectedUnit, selectedDept, selectedPola, searchQuery]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      if (sortField === "name") {
        return sortDirection === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      if (sortField === "hireDate") {
        const timeA = a.dateOfHire ? new Date(a.dateOfHire).getTime() || 0 : 0;
        const timeB = b.dateOfHire ? new Date(b.dateOfHire).getTime() || 0 : 0;
        return sortDirection === "asc" ? timeA - timeB : timeB - timeA;
      }
      if (sortField === "score") {
        return sortDirection === "asc"
          ? a.scoreNumber - b.scoreNumber
          : b.scoreNumber - a.scoreNumber;
      }
      if (sortField === "pola") {
        return sortDirection === "asc"
          ? (a.polaPenggajian || "").localeCompare(b.polaPenggajian || "")
          : (b.polaPenggajian || "").localeCompare(a.polaPenggajian || "");
      }
      return sortDirection === "asc" ? a.id - b.id : b.id - a.id;
    });
    return list;
  }, [filteredRows, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Helper subtitle text
  const unitSubtitle = useMemo(() => {
    if (selectedUnit === "HO") return "Rekapitulasi Penilaian Kinerja Final Head Office • Rekapitulasi Tahunan";
    if (selectedUnit === "GAM") return "Rekapitulasi Penilaian Kinerja Final Site GAM • Rekapitulasi Tahunan";
    if (selectedUnit === "AKP") return "Rekapitulasi Penilaian Kinerja Final Site AKP • Rekapitulasi Tahunan";
    return "Rekapitulasi Penilaian Kinerja Final Seluruh Unit Operasional • Rekapitulasi Tahunan";
  }, [selectedUnit]);

  // Export link dengan filter unit
  const exportUrl = `/api/report/export?periodId=${period?.id ?? ""}&ou=${selectedUnit}`;

  return (
    <div className="space-y-4">
      {/* Control Bar & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Operating Unit Switcher Buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            {(["ALL", "HO", "GAM", "AKP"] as const).map((ou) => {
              const active = selectedUnit === ou;
              return (
                <button
                  key={ou}
                  type="button"
                  onClick={() => setSelectedUnit(ou)}
                  className={`rounded-md px-3 py-1 transition cursor-pointer ${
                    active
                      ? "bg-white text-slate-900 shadow-2xs font-bold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {ou === "ALL" ? "Semua Unit" : ou}
                </button>
              );
            })}
          </div>

          {/* Status Indicator Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Status: Final / Selesai</span>
          </div>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-slate-800 transition cursor-pointer"
          >
            <option value="ALL">Semua Departemen</option>
            {departmentList.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Pola Penggajian Filter */}
          <select
            value={selectedPola}
            onChange={(e) => setSelectedPola(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-slate-800 transition cursor-pointer"
          >
            <option value="ALL">Semua Pola Penggajian</option>
            <option value="All In">All In</option>
            <option value="OT">OT</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari nama, NIK, jabatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Counter and Export Action */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">
            Menampilkan <strong className="text-slate-800">{sortedRows.length}</strong> penilaian final
          </span>

          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer"
            title="Download Summary Penilaian KPI dalam format spreadsheet Excel .xlsx"
          >
            <svg
              className="w-4 h-4 text-emerald-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Export Excel (.xlsx)</span>
          </a>
        </div>
      </div>

      {/* Main Table Card Matching User Reference Spreadsheet */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Banner Header Card */}
        <div className="bg-gradient-to-b from-blue-50/70 via-slate-50/40 to-white px-6 py-5 text-center border-b border-slate-200/80">
          <h2 className="text-lg font-extrabold tracking-wide text-slate-900 uppercase">
            SUMMARY KPI {selectedUnit === "ALL" ? "SELURUH UNIT" : selectedUnit}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {unitSubtitle}
          </p>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#cbd5e1]/70 text-slate-800 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300">
                <th
                  onClick={() => handleSort("no")}
                  className="px-3 py-3 text-center border-r border-slate-300 w-12 cursor-pointer hover:bg-slate-300/60 select-none transition"
                >
                  NO {sortField === "no" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                </th>
                <th
                  onClick={() => handleSort("name")}
                  className="px-4 py-3 border-r border-slate-300 min-w-[170px] cursor-pointer hover:bg-slate-300/60 select-none transition"
                >
                  NAMA {sortField === "name" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                </th>
                <th
                  onClick={() => handleSort("pola")}
                  className="px-3 py-3 text-center border-r border-slate-300 w-32 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 select-none transition"
                >
                  POLA PENGGAJIAN {sortField === "pola" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 w-32 whitespace-nowrap">
                  NIK KARYAWAN
                </th>
                <th className="px-4 py-3 border-r border-slate-300 min-w-[170px]">
                  JABATAN
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 w-20 whitespace-nowrap">
                  UNIT
                </th>
                <th
                  onClick={() => handleSort("hireDate")}
                  className="px-3 py-3 text-center border-r border-slate-300 w-32 cursor-pointer hover:bg-slate-300/60 select-none transition whitespace-nowrap"
                >
                  TGL MASUK {sortField === "hireDate" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 min-w-[170px] whitespace-nowrap">
                  MASA KERJA
                </th>
                <th className="px-4 py-3 border-r border-slate-300 min-w-[130px] whitespace-nowrap">
                  DEPARTEMEN
                </th>
                <th className="px-4 py-3 border-r border-slate-300 min-w-[160px] whitespace-nowrap">
                  PENILAI
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 w-32 whitespace-nowrap">
                  STATUS
                </th>
                <th
                  onClick={() => handleSort("score")}
                  className="px-3 py-3 text-center border-r border-slate-300 w-24 cursor-pointer hover:bg-slate-300/60 select-none transition whitespace-nowrap"
                >
                  SKOR {sortField === "score" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 min-w-[130px] whitespace-nowrap">
                  GAJI POKOK
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 min-w-[130px] whitespace-nowrap">
                  T. JABATAN
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 min-w-[130px] whitespace-nowrap">
                  TOTAL
                </th>
                <th className="px-3 py-3 text-center border-r border-slate-300 w-28 whitespace-nowrap">
                  JLH BULAN
                </th>
                <th className="px-3 py-3 text-center w-28 whitespace-nowrap">
                  JLH HARI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada data penilaian KPI berstatus Final / Selesai yang cocok dengan filter yang dipilih.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r, idx) => {
                  const scoreNum = r.scoreNumber * 100;
                  const isHigh = scoreNum >= 100;
                  const isGood = scoreNum >= 80 && scoreNum < 100;
                  const isBelow = scoreNum > 0 && scoreNum < 80;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        r.isFinal
                          ? "bg-emerald-50/20"
                          : idx % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50/50"
                      }`}
                    >
                      {/* NO */}
                      <td className="px-3 py-3 text-center font-medium text-slate-500 border-r border-slate-200">
                        {idx + 1}
                      </td>

                      {/* NAMA */}
                      <td className="px-4 py-3 border-r border-slate-200 font-bold text-slate-900">
                        <Link
                          href={`/input-kpi?id=${r.id}`}
                          className="hover:text-emerald-700 hover:underline transition"
                          title="Buka detail penilaian karyawan"
                        >
                          {r.name}
                        </Link>
                      </td>

                      {/* POLA PENGGAJIAN */}
                      <td className="px-3 py-3 text-center border-r border-slate-200">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                          r.polaPenggajian === "OT" || r.polaPenggajian === "Non All In"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {r.polaPenggajian || "All In"}
                        </span>
                      </td>

                      {/* NIK KARYAWAN */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-[11px] text-slate-600">
                        {r.nik}
                      </td>

                      {/* JABATAN */}
                      <td className="px-4 py-3 border-r border-slate-200 font-semibold text-slate-800">
                        {r.jobPosition}
                      </td>

                      {/* UNIT */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-bold text-[11px] text-slate-700">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                          {r.operatingUnit}
                        </span>
                      </td>

                      {/* TGL MASUK */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 text-slate-600 whitespace-nowrap">
                        {r.hireDateFormatted}
                      </td>

                      {/* MASA KERJA */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {r.tenureFormatted}
                      </td>

                      {/* DEPARTEMEN */}
                      <td className="px-4 py-3 border-r border-slate-200 font-semibold text-slate-700 uppercase whitespace-nowrap">
                        {r.dept}
                      </td>

                      {/* PENILAI */}
                      <td className="px-4 py-3 border-r border-slate-200 text-slate-700 uppercase whitespace-nowrap font-medium">
                        {r.appraiserName}
                      </td>

                      {/* STATUS */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                            r.isFinal
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : r.status === "DRAFT"
                              ? "bg-slate-100 text-slate-600 border-slate-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              r.isFinal
                                ? "bg-emerald-500"
                                : r.status === "DRAFT"
                                ? "bg-slate-400"
                                : "bg-blue-500"
                            }`}
                          />
                          <span>{r.statusLabel}</span>
                        </span>
                      </td>

                      {/* SKOR */}
                      <td className="px-3 py-3 text-center font-bold border-r border-slate-200">
                        {r.scoreFormatted !== "-" ? (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-xs tabular-nums font-mono ${
                              isHigh
                                ? "text-emerald-800 bg-emerald-100 font-extrabold"
                                : isGood
                                ? "text-blue-800 bg-blue-100 font-bold"
                                : isBelow
                                ? "text-amber-800 bg-amber-100 font-bold"
                                : "text-slate-700 bg-slate-100"
                            }`}
                          >
                            {r.scoreFormatted}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* GAJI POKOK (Kosong - input di luar sistem) */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-xs text-slate-400 bg-slate-50/20">
                      </td>

                      {/* T. JABATAN (Kosong - input di luar sistem) */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-xs text-slate-400 bg-slate-50/20">
                      </td>

                      {/* TOTAL (Kosong - input di luar sistem) */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-xs text-slate-400 bg-slate-50/20">
                      </td>

                      {/* JLH BULAN (Kosong - input di luar sistem) */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 font-mono text-xs text-slate-400 bg-slate-50/20">
                      </td>

                      {/* JLH HARI (Kosong - input di luar sistem) */}
                      <td className="px-3 py-3 text-center font-mono text-xs text-slate-400 bg-slate-50/20">
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
