"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Employee, Department, JobLevel, JobPosition } from "@/db/schema";
import { Table, td, th } from "./ui";

interface JobPositionEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: JobPosition | null;
  employees: Employee[];
  departments?: Department[];
  jobLevels?: JobLevel[];
}

export function JobPositionEmployeeModal({
  isOpen,
  onClose,
  position,
  employees,
  departments = [],
  jobLevels = [],
}: JobPositionEmployeeModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Tutup dengan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const levelMap = useMemo(() => new Map(jobLevels.map((l) => [l.id, l])), [jobLevels]);

  const positionEmployees = useMemo(() => {
    if (!position) return [];
    return employees.filter((e) => {
      if (e.isActive === false) return false;
      if (e.jobPositionId === position.id) return true;
      // Fallback matching by name
      if (
        e.jobPosition &&
        e.jobPosition.trim().toLowerCase() === position.name.trim().toLowerCase() &&
        (!position.departmentId || e.departmentId === position.departmentId)
      ) {
        return true;
      }
      return false;
    });
  }, [position, employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return positionEmployees;
    return positionEmployees.filter((e) => {
      const dept = deptMap.get(e.departmentId);
      const lvl = levelMap.get(e.jobLevelId);
      return (
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.operatingUnit && e.operatingUnit.toLowerCase().includes(q)) ||
        (dept && (dept.name.toLowerCase().includes(q) || dept.code.toLowerCase().includes(q))) ||
        (lvl && lvl.name.toLowerCase().includes(q))
      );
    });
  }, [positionEmployees, searchQuery, deptMap, levelMap]);

  if (!isOpen || !position) return null;

  const currentDept = position.departmentId ? deptMap.get(position.departmentId) : null;
  const currentLevel = position.jobLevelId ? levelMap.get(position.jobLevelId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-800 border border-slate-200">
                {position.code || "JABATAN"}
              </span>
              <h2 className="text-base font-bold text-slate-900">
                {position.name}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span>Departemen: <b>{currentDept?.name || "-"}</b></span>
              <span>•</span>
              <span>Level: <b>{currentLevel?.name || "-"}</b></span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold">Total {positionEmployees.length} Karyawan Terdaftar</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            title="Tutup (Esc)"
          >
            ✕
          </button>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIK, nama karyawan, unit, atau level..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition bg-white shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Menampilkan <b>{filteredEmployees.length}</b> dari {positionEmployees.length} karyawan
          </span>
        </div>

        {/* TABLE CONTENT */}
        <div className="flex-1 overflow-y-auto min-h-[260px]">
          <Table
            head={
              <tr>
                <th className={`${th} w-32`}>NIK</th>
                <th className={th}>Nama Karyawan</th>
                <th className={th}>Departemen</th>
                <th className={`${th} text-center`}>Job Level</th>
                <th className={`${th} text-center`}>Unit</th>
                <th className={`${th} text-center`}>Status</th>
                <th className={`${th} text-right`}>Detail</th>
              </tr>
            }
          >
            {filteredEmployees.map((emp) => {
              const dept = deptMap.get(emp.departmentId);
              const lvl = levelMap.get(emp.jobLevelId);

              return (
                <tr key={emp.id} className="hover:bg-slate-50 transition">
                  <td className={`${td} font-mono text-xs font-bold text-slate-700`}>
                    {emp.nik}
                  </td>
                  <td className={td}>
                    <div className="font-bold text-slate-900 text-xs">{emp.name}</div>
                    <div className="text-[11px] text-slate-400 font-medium">{emp.role}</div>
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {dept?.name || "-"}
                    </span>
                  </td>
                  <td className={`${td} text-center`}>
                    <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200/60">
                      {lvl?.name || `Level ${emp.jobLevelId}`}
                    </span>
                  </td>
                  <td className={`${td} text-center`}>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                      {emp.operatingUnit || "HO"}
                    </span>
                  </td>
                  <td className={`${td} text-center`}>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        emp.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {emp.isActive !== false ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    <Link
                      href={`/setup/karyawan/${emp.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      <span>Lihat Profil</span>
                      <span>→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                  {searchQuery
                    ? `Tidak ada karyawan yang cocok dengan pencarian "${searchQuery}".`
                    : "Belum ada karyawan yang memegang posisi jabatan ini."}
                </td>
              </tr>
            )}
          </Table>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
          <span className="text-xs text-slate-500">
            Total {positionEmployees.length} karyawan terdaftar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition cursor-pointer shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
