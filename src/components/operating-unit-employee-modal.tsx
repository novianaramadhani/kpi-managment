"use client";

import React, { useState, useMemo } from "react";
import type { Employee, Department } from "@/db/schema";
import { Table, td, th } from "./ui";

interface OperatingUnitEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: { id: string; name: string } | null;
  employees: Employee[];
  departments?: Department[];
}

export function OperatingUnitEmployeeModal({
  isOpen,
  onClose,
  unit,
  employees,
  departments = [],
}: OperatingUnitEmployeeModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const unitEmployees = useMemo(() => {
    if (!unit) return [];
    const target = unit.name.toUpperCase();
    return employees.filter(
      (e) => e.isActive !== false && (e.operatingUnit || "HO").toUpperCase() === target
    );
  }, [unit, employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return unitEmployees;
    return unitEmployees.filter((e) => {
      const dept = departments.find((d) => d.id === e.departmentId);
      return (
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.jobPosition && e.jobPosition.toLowerCase().includes(q)) ||
        (dept && dept.name.toLowerCase().includes(q)) ||
        (dept && dept.code.toLowerCase().includes(q))
      );
    });
  }, [unitEmployees, departments, searchQuery]);

  if (!isOpen || !unit) return null;

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
              Daftar Karyawan: {unit.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unit Operasional: <span className="font-mono font-semibold text-slate-700">{unit.id}</span> • Total {unitEmployees.length} karyawan terdaftar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
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
              placeholder="Cari NIK, nama, atau departemen..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Menampilkan <b>{filteredEmployees.length}</b> dari {unitEmployees.length} karyawan
          </span>
        </div>

        {/* TABLE CONTENT */}
        <div className="flex-1 overflow-y-auto min-h-[220px]">
          <Table
            head={
              <tr>
                <th className={th}>NIK</th>
                <th className={th}>Nama Karyawan</th>
                <th className={th}>Jabatan</th>
                <th className={th}>Departemen</th>
                <th className={th}>Status</th>
              </tr>
            }
          >
            {filteredEmployees.map((emp) => {
              const dept = departments.find((d) => d.id === emp.departmentId);
              return (
                <tr key={emp.id} className="hover:bg-slate-50 transition">
                  <td className={`${td} font-mono text-xs font-semibold text-slate-700`}>
                    {emp.nik}
                  </td>
                  <td className={td}>
                    <div className="font-semibold text-slate-900 text-xs">{emp.name}</div>
                    <div className="text-[11px] text-slate-400 capitalize">{emp.role?.toLowerCase() || "Employee"}</div>
                  </td>
                  <td className={`${td} text-xs text-slate-700`}>
                    {emp.jobPosition || "-"}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {dept?.name || emp.departmentId || "-"}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        emp.isActive
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {emp.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              );
            })}

            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-500 text-xs">
                  {searchQuery
                    ? `Tidak ada karyawan yang cocok dengan pencarian "${searchQuery}".`
                    : "Belum ada karyawan yang dialokasikan ke Operating Unit ini."}
                </td>
              </tr>
            )}
          </Table>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
          <span className="text-xs text-slate-400">
            Total {unitEmployees.length} karyawan
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
