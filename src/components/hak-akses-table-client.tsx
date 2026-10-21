"use client";

import React, { useState, useMemo, useTransition } from "react";
import type { Department, JobLevel, JobLevelPermission } from "@/db/schema";
import { Table, td, th } from "./ui";
import { JobLevelAccessModal } from "./job-level-access-modal";
import {
  SaveJobLevelPermissionInput,
  saveJobLevelPermissionsAction,
  deleteJobLevelPermissionAction,
} from "@/lib/actions";
import Swal from "sweetalert2";
import { Pencil, Trash2 } from "lucide-react";

interface HakAksesTableClientProps {
  jobLevels: JobLevel[];
  departments: Department[];
  permissions: JobLevelPermission[];
  savePermissionsAction?: (input: SaveJobLevelPermissionInput) => Promise<{ success: boolean }>;
  deletePermissionsAction?: (jobLevelId: number) => Promise<{ success: boolean }>;
}

export function HakAksesTableClient({
  jobLevels,
  departments,
  permissions = [],
  savePermissionsAction = saveJobLevelPermissionsAction,
  deletePermissionsAction = deleteJobLevelPermissionAction,
}: HakAksesTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("ALL");
  const [, startTransition] = useTransition();

  // Modal state for Edit
  const [selectedLevelForAccess, setSelectedLevelForAccess] = useState<JobLevel | null>(null);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  // Filtering
  const filteredLevels = useMemo(() => {
    return jobLevels.filter((lvl) => {
      const q = searchQuery.toLowerCase().trim();
      const perm = permissions.find((p) => p.jobLevelId === lvl.id);
      const role =
        perm?.defaultRole ||
        (lvl.rank >= 4 ? "MANAGER" : lvl.rank === 3 ? "HEAD_DEPT" : lvl.rank === 2 ? "PENILAI" : "KARYAWAN");

      const matchQuery =
        !q ||
        lvl.code.toLowerCase().includes(q) ||
        lvl.name.toLowerCase().includes(q) ||
        role.toLowerCase().includes(q) ||
        String(lvl.rank).includes(q);

      const matchRole = selectedRoleFilter === "ALL" || role === selectedRoleFilter;

      return matchQuery && matchRole;
    });
  }, [jobLevels, permissions, searchQuery, selectedRoleFilter]);

  const handleEdit = (lvl: JobLevel) => {
    setSelectedLevelForAccess(lvl);
    setIsAccessModalOpen(true);
  };

  const handleDelete = async (lvl: JobLevel) => {
    const confirm = await Swal.fire({
      title: "Hapus Hak Akses?",
      text: `Konfigurasi hak akses khusus untuk Job Level "${lvl.name}" (${lvl.code}) akan dihapus dan dikembalikan ke default.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        await deletePermissionsAction(lvl.id);
        await Swal.fire({
          icon: "success",
          title: "Hak Akses Dihapus",
          text: `Konfigurasi hak akses untuk level ${lvl.name} telah direset.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus hak akses";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* TOOLBAR: SEARCH & FILTER (CLEAN, NO CARDS, NO ICONS) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari level, kode, atau role..."
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
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

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <span>Filter Role:</span>
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Role</option>
              <option value="ADMIN">ADMIN</option>
              <option value="HR">HR</option>
              <option value="HEAD_DEPT">HEAD_DEPT</option>
              <option value="MANAGER">MANAGER</option>
              <option value="PENILAI">PENILAI</option>
              <option value="KARYAWAN">KARYAWAN</option>
            </select>
          </div>

          {(searchQuery || selectedRoleFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedRoleFilter("ALL");
              }}
              className="text-xs text-slate-600 font-semibold hover:underline cursor-pointer px-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* FULL MATRIX TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table
          head={
            <tr>
              <th className={th}>Rank</th>
              <th className={th}>Kode Level</th>
              <th className={th}>Nama Job Level</th>
              <th className={th}>Role Default</th>
              <th className={th}>Hak Akses Modul</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          }
        >
          {filteredLevels.map((l) => {
            const perm = permissions.find((p) => p.jobLevelId === l.id);
            const role =
              perm?.defaultRole ||
              (l.rank >= 4 ? "MANAGER" : l.rank === 3 ? "HEAD_DEPT" : l.rank === 2 ? "PENILAI" : "KARYAWAN");

            // Categorized active modules for clean display
            const mgmtModules = [
              perm?.canAccessMasterData && "Master Data",
              perm?.canAccessMasterParam && "Param KPI",
              perm?.canAccessTemplate && "Template",
              perm?.canAccessAssignment && "Assignment",
            ].filter(Boolean) as string[];

            const assessModules = [
              (perm?.canAccessInputAssessment ?? true) && "Input",
              perm?.canAccessReviewAssessment && "Review",
              perm?.canAccessApprovalAssessment && "Approval",
              perm?.canAccessReports && "Laporan",
            ].filter(Boolean) as string[];

            const totalActive = mgmtModules.length + assessModules.length;

            return (
              <tr key={l.id} className="hover:bg-slate-50 transition">
                <td className={td}>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200">
                    {l.rank}
                  </span>
                </td>
                <td className={`${td} font-mono font-bold text-slate-800`}>
                  <span className="bg-slate-50 px-2 py-0.5 rounded text-xs border border-slate-200">
                    {l.code}
                  </span>
                </td>
                <td className={`${td} font-semibold text-slate-900`}>{l.name}</td>
                <td className={td}>
                  <span className="inline-flex px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                    {role}
                  </span>
                </td>
                <td className={td}>
                  {totalActive === 8 ? (
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Semua Modul (8 Modul)
                    </span>
                  ) : totalActive > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {mgmtModules.map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {m}
                        </span>
                      ))}
                      {assessModules.map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Belum diset</span>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(l)}
                      className="p-1.5 text-slate-400 hover:text-sky-600 transition cursor-pointer"
                      title="Edit Hak Akses"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(l)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="Hapus / Reset Hak Akses"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredLevels.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">
                Tidak ada data hak akses yang cocok dengan pencarian.
              </td>
            </tr>
          )}
        </Table>
      </div>

      {/* MODAL EDIT HAK AKSES */}
      <JobLevelAccessModal
        isOpen={isAccessModalOpen}
        onClose={() => {
          setIsAccessModalOpen(false);
          setSelectedLevelForAccess(null);
        }}
        jobLevel={selectedLevelForAccess}
        currentPermission={
          selectedLevelForAccess
            ? permissions.find((p) => p.jobLevelId === selectedLevelForAccess.id) || null
            : null
        }
        departments={departments}
        allJobLevels={jobLevels}
        onSave={savePermissionsAction}
      />
    </div>
  );
}
