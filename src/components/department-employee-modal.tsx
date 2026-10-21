"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { Employee, Department } from "@/db/schema";
import type { DepartmentMappingWithDetails } from "@/lib/department-mapping-utils";
import { matchesSite, matchesDeptName } from "@/lib/department-mapping-utils";
import { Eye, Search, X } from "lucide-react";

interface DepartmentEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  department: Department | null;
  employees: Employee[];
  mappings?: DepartmentMappingWithDetails[];
}

export function DepartmentEmployeeModal({
  isOpen,
  onClose,
  department,
  employees,
  mappings = [],
}: DepartmentEmployeeModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const deptEmployees = useMemo(() => {
    if (!department) return [];
    const deptMappings = mappings.filter((m) => m.departmentId === department.id);
    return employees.filter((e) => {
      if (e.isActive === false) return false;
      if (e.departmentId === department.id) return true;
      if (e.originalDepartment && deptMappings.length > 0) {
        return deptMappings.some(
          (m) =>
            (m.site === "ALL" || matchesSite(m.site, e.operatingUnit)) &&
            matchesDeptName(m.cleanRawName, e.originalDepartment)
        );
      }
      return false;
    });
  }, [department, employees, mappings]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return deptEmployees;
    return deptEmployees.filter((e) => {
      return (
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.operatingUnit && e.operatingUnit.toLowerCase().includes(q))
      );
    });
  }, [deptEmployees, searchQuery]);

  if (!isOpen || !department) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden my-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 font-mono font-bold text-xs border border-slate-200">
              {department.code}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Daftar Karyawan: {department.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Total {deptEmployees.length} karyawan terdaftar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TOOLBAR SEARCH */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIK, nama, atau site..."
              className="w-full rounded-md border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 bg-white transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus pencarian"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500">
            Menampilkan <b>{filteredEmployees.length}</b> dari {deptEmployees.length} karyawan
          </span>
        </div>

        {/* TABLE: NIK, Nama, Site, Aksi */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="w-36 px-4 py-2.5">NIK</th>
                <th className="px-4 py-2.5">Nama</th>
                <th className="w-28 px-4 py-2.5">Site</th>
                <th className="w-24 px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400">
                    {searchQuery
                      ? "Tidak ada karyawan yang cocok dengan pencarian."
                      : "Belum ada karyawan yang terdaftar pada departemen ini."}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* 1. NIK */}
                    <td className="w-36 px-4 py-2.5 font-mono font-medium text-slate-900">
                      {emp.nik || "-"}
                    </td>

                    {/* 2. Nama */}
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {emp.name || "-"}
                    </td>

                    {/* 3. Site */}
                    <td className="w-28 px-4 py-2.5 text-slate-600">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {emp.operatingUnit || "HO"}
                      </span>
                    </td>

                    {/* 4. Aksi (Button Detail) */}
                    <td className="w-24 px-4 py-2.5 text-right">
                      <Link
                        href={`/setup/karyawan/${emp.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                        title={`Lihat detail ${emp.name}`}
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Detail</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white shrink-0 text-xs">
          <span className="text-slate-500">
            Total {deptEmployees.length} karyawan di departemen {department.name}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
