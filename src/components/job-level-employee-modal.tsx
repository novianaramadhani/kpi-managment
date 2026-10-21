"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { Employee, JobLevel, Department } from "@/db/schema";
import { Table, td, th } from "./ui";

interface JobLevelEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobLevel: JobLevel | null;
  employees: Employee[];
  departments?: Department[];
}

export function JobLevelEmployeeModal({
  isOpen,
  onClose,
  jobLevel,
  employees,
  departments = [],
}: JobLevelEmployeeModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const levelEmployees = useMemo(() => {
    if (!jobLevel) return [];
    return employees.filter((e) => e.jobLevelId === jobLevel.id && e.isActive !== false);
  }, [jobLevel, employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return levelEmployees;
    return levelEmployees.filter((e) => {
      const dept = departments.find((d) => d.id === e.departmentId);
      return (
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.jobPosition && e.jobPosition.toLowerCase().includes(q)) ||
        (dept && dept.name.toLowerCase().includes(q)) ||
        (dept && dept.code.toLowerCase().includes(q)) ||
        (e.operatingUnit && e.operatingUnit.toLowerCase().includes(q)) ||
        (e.role && e.role.toLowerCase().includes(q))
      );
    });
  }, [levelEmployees, departments, searchQuery]);

  if (!isOpen || !jobLevel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Daftar Karyawan: {jobLevel.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kode Level: <span className="font-semibold text-slate-700">{jobLevel.code}</span> · Total:{" "}
              <span className="font-semibold text-slate-700">{levelEmployees.length} Karyawan</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIK, nama, departemen, atau jabatan..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500">
            Menampilkan <b>{filteredEmployees.length}</b> dari {levelEmployees.length} karyawan
          </span>
        </div>

        {/* TABLE CONTENT */}
        <div className="flex-1 overflow-y-auto">
          <Table
            head={
              <tr>
                <th className={th}>NIK</th>
                <th className={th}>Nama Karyawan</th>
                <th className={th}>Departemen</th>
                <th className={th}>Posisi / Jabatan</th>
                <th className={th}>Unit</th>
                <th className={th}>Role Sistem</th>
                <th className={`${th} text-right`}>Aksi</th>
              </tr>
            }
          >
            {filteredEmployees.map((emp) => {
              const dept = departments.find((d) => d.id === emp.departmentId);
              return (
                <tr key={emp.id} className="hover:bg-slate-50 transition">
                  <td className={`${td} font-mono font-bold text-slate-800 text-xs`}>
                    {emp.nik}
                  </td>
                  <td className={`${td} font-semibold text-slate-900 text-xs`}>
                    {emp.name}
                  </td>
                  <td className={td}>
                    <span className="text-xs text-slate-700">
                      {dept ? `${dept.code} - ${dept.name}` : "-"}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="text-xs text-slate-600">
                      {emp.jobPosition || "-"}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="text-xs text-slate-600">
                      {emp.operatingUnit || "HO"}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {emp.role || "KARYAWAN"}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    <Link
                      href={`/setup/karyawan/${emp.id}`}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                  {searchQuery
                    ? "Tidak ada karyawan yang cocok dengan pencarian."
                    : "Belum ada karyawan yang terdaftar pada job level ini."}
                </td>
              </tr>
            )}
          </Table>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
