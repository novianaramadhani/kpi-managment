"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import Swal from "sweetalert2";
import type { Department, Employee, Pit } from "@/db/schema";
import {
  type DepartmentMappingWithDetails,
  matchesSite,
  matchesDeptName,
} from "@/lib/department-mapping-utils";
import { getPitsAction } from "@/lib/pit-actions";
import { getDepartmentMappingsAction } from "@/lib/department-mapping-actions";
import {
  Building2,
  Users,
  Layers,
  MapPin,
  Mountain,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  FileSpreadsheet,
} from "lucide-react";
import { td, th, btnPrimary, btnSecondary, inputCls } from "./ui";

interface DepartmentDetailModalProps {
  isOpen: boolean;
  department: Department | null;
  departments?: Department[];
  mappings: DepartmentMappingWithDetails[];
  employees: Employee[];
  sites?: { id: number; code: string; name: string }[];
  pits?: Pit[];
  operatingUnits?: { id: string; name: string; status?: string }[];
  onClose: () => void;
  onEditDepartment?: (dept: Department) => void;
  createMappingAction?: (fd: FormData) => Promise<{ success: boolean; id: number; error?: string }>;
  updateMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
  deleteMappingAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}

export function DepartmentDetailModal({
  isOpen,
  department,
  mappings: initialMappings,
  employees,
  sites = [],
  pits = [],
  operatingUnits = [],
  onClose,
  onEditDepartment,
  createMappingAction,
  updateMappingAction,
  deleteMappingAction,
}: DepartmentDetailModalProps) {
  const [localMappings, setLocalMappings] = useState<DepartmentMappingWithDetails[]>(initialMappings);
  const [localPits, setLocalPits] = useState<Pit[]>(pits);
  const [isPending, startTransition] = useTransition();

  // Sub-modal Form Mapping (Tambah / Edit)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<DepartmentMappingWithDetails | null>(null);

  // Sync initialMappings saat prop berubah
  useEffect(() => {
    setLocalMappings(initialMappings);
  }, [initialMappings]);

  // Sync pits saat prop berubah
  useEffect(() => {
    if (pits && pits.length > 0) {
      setLocalPits(pits);
    }
  }, [pits]);

  // Tarik data PIT dan Mapping langsung dari database setiap kali modal dibuka
  useEffect(() => {
    if (isOpen) {
      getPitsAction()
        .then((freshPits) => {
          if (freshPits && freshPits.length > 0) {
            setLocalPits(freshPits);
          }
        })
        .catch(() => {});

      getDepartmentMappingsAction()
        .then((freshMappings) => {
          if (freshMappings && freshMappings.length > 0) {
            setLocalMappings(freshMappings);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Escape key listener untuk menutup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending && !isFormModalOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending, isFormModalOpen]);

  // Helper resolusi PIT dari database untuk ditampilkan di tabel mapping
  const getPitDisplay = (m: DepartmentMappingWithDetails) => {
    if (m.pitName || m.pitCode) {
      return { name: m.pitName || m.pitCode!, code: m.pitCode };
    }
    const currentPits = localPits.length > 0 ? localPits : pits;
    if (m.pitId) {
      const found = currentPits.find((p) => p.id === m.pitId);
      if (found) return { name: found.name, code: found.code };
    }
    if (m.originalUnitDetail || m.rawDepartmentName) {
      const targetDetail = (m.originalUnitDetail || "").toLowerCase().trim();
      const rawLow = m.rawDepartmentName.toLowerCase().trim();
      const found = currentPits.find((p) => {
        const pName = p.name.toLowerCase().trim();
        return (
          (targetDetail && (targetDetail === pName || targetDetail.includes(pName) || pName.includes(targetDetail))) ||
          rawLow.endsWith(` ${pName}`) ||
          rawLow.endsWith(`-${pName}`) ||
          rawLow.includes(`(${pName})`) ||
          rawLow.includes(` ${pName} `) ||
          rawLow === pName
        );
      });
      if (found) return { name: found.name, code: found.code };
    }
    return null;
  };

  // Daftar mapping khusus departemen ini
  const deptMappings = useMemo(() => {
    if (!department) return [];
    return localMappings.filter((m) => m.departmentId === department.id);
  }, [localMappings, department]);

  // Total karyawan dihitung berdasarkan data karyawan yang terhubung dengan mapping terkait & departemen
  const connectedEmployees = useMemo(() => {
    if (!department) return [];

    return employees.filter((emp) => {
      if (emp.isActive === false) return false;

      // 1. Karyawan yang departemen standarnya sudah mengarah ke departemen ini
      if (emp.departmentId === department.id) return true;

      // 2. Karyawan yang terhubung melalui aturan mapping nama asli & site
      if (emp.originalDepartment) {
        return deptMappings.some(
          (m) =>
            (m.site === "ALL" || matchesSite(m.site, emp.operatingUnit)) &&
            matchesDeptName(m.cleanRawName, emp.originalDepartment)
        );
      }

      return false;
    });
  }, [department, deptMappings, employees]);

  // Hitung jumlah karyawan per baris mapping
  const getEmployeeCountForMapping = (m: DepartmentMappingWithDetails) => {
    return employees.filter((emp) => {
      if (emp.isActive === false) return false;
      const matchSite = m.site === "ALL" || matchesSite(m.site, emp.operatingUnit);
      if (!matchSite) return false;

      if (emp.originalDepartment) {
        return matchesDeptName(m.cleanRawName, emp.originalDepartment);
      }

      return emp.departmentId === department?.id;
    }).length;
  };

  // Daftar opsi Site murni dinamis
  const dynamicSites = useMemo(() => {
    const list: { id: number; code: string; name: string }[] = [];
    const seen = new Set<string>();

    sites.forEach((s) => {
      const codeUpper = s.code.toUpperCase();
      if (!seen.has(codeUpper)) {
        seen.add(codeUpper);
        list.push({ id: s.id, code: codeUpper, name: s.name });
      }
    });

    operatingUnits.forEach((u) => {
      if (u.name) {
        const codeUpper = u.name.trim().toUpperCase();
        if (!seen.has(codeUpper)) {
          seen.add(codeUpper);
          list.push({
            id: 0,
            code: codeUpper,
            name: codeUpper === "HO" ? "Head Office" : `Site ${codeUpper}`,
          });
        }
      }
    });

    localMappings.forEach((m) => {
      if (m.site && m.site !== "ALL") {
        const codeUpper = m.site.trim().toUpperCase();
        if (!seen.has(codeUpper)) {
          seen.add(codeUpper);
          list.push({
            id: 0,
            code: codeUpper,
            name: `Site ${codeUpper}`,
          });
        }
      }
    });

    return list;
  }, [sites, operatingUnits, localMappings]);

  if (!isOpen || !department) return null;

  // Buka form tambah mapping
  const handleOpenAddMapping = () => {
    setEditingMapping(null);
    setIsFormModalOpen(true);
  };

  // Buka form edit mapping
  const handleOpenEditMapping = (m: DepartmentMappingWithDetails) => {
    setEditingMapping(m);
    setIsFormModalOpen(true);
  };

  // Hapus mapping
  const handleDeleteMapping = async (m: DepartmentMappingWithDetails) => {
    if (!deleteMappingAction) return;

    const res = await Swal.fire({
      title: "Hapus Aturan Mapping?",
      text: `Apakah Anda yakin ingin menghapus mapping untuk nama asli "${m.rawDepartmentName}" pada Site ${m.site}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
    });

    if (!res.isConfirmed) return;

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(m.id));
        const res = await deleteMappingAction(fd);
        if (res && !res.success && res.error) {
          void Swal.fire({
            icon: "error",
            title: "Gagal Menghapus",
            text: res.error,
            confirmButtonColor: "#0f172a",
          });
          return;
        }

        // Update local state
        setLocalMappings((prev) => prev.filter((item) => item.id !== m.id));

        void Swal.fire({
          icon: "success",
          title: "Berhasil",
          text: `Mapping "${m.rawDepartmentName}" berhasil dihapus.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus aturan mapping.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  return (
    <>
      {/* Modal Utama: Detail Departemen */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-detail-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Modal */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="dept-detail-modal-title" className="text-base font-bold text-slate-900">
                    {department.name}
                  </h3>
                  <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold border border-slate-200 text-slate-800">
                    {department.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Informasi master departemen dan daftar mapping nama asli dari file Excel.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body (Scrollable) */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* 1. Ringkasan Informasi Departemen (Kode, Nama, Total Karyawan) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Kode Departemen
                </span>
                <div className="font-mono font-bold text-base text-slate-900">
                  {department.code}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Nama Departemen Standar
                </span>
                <div className="font-bold text-base text-slate-900 truncate" title={department.name}>
                  {department.name}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-emerald-50/40 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block flex items-center justify-between">
                  <span>Total Karyawan</span>
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                </span>
                <div className="font-bold text-base text-emerald-950 flex items-baseline gap-1.5">
                  <span>{connectedEmployees.length}</span>
                  <span className="text-xs font-normal text-emerald-700">Karyawan Terhubung</span>
                </div>
              </div>
            </div>

            {/* 2. Daftar Mapping Nama Departemen Asli dari Data Excel */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                    <span>Daftar Mapping Nama Departemen Asli (Excel)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Aturan pemetaan nama departemen asli dari data Excel / Site yang diarahkan ke departemen ini.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddMapping}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-95 transition cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Mapping</span>
                </button>
              </div>

              {/* Tabel Mapping */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-700 font-bold">
                        <th className={`${th} py-2.5`}>Nama Departemen Asli</th>
                        <th className={`${th} py-2.5`}>Site</th>
                        <th className={`${th} py-2.5`}>PIT (Opsional)</th>
                        <th className={`${th} py-2.5 text-center`}>Karyawan Terkait</th>
                        <th className={`${th} py-2.5 text-right w-24`}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deptMappings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center space-y-1.5">
                              <ArrowRightLeft className="w-6 h-6 text-slate-300" />
                              <p className="font-semibold text-slate-700 text-xs">
                                Belum ada aturan mapping
                              </p>
                              <p className="text-[11px] text-slate-400 max-w-sm">
                                Departemen ini belum memiliki pemetaan nama asli dari file Excel. Klik tombol <strong>Tambah Mapping</strong> di atas untuk menambahkan.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        deptMappings.map((m) => {
                          const mappingEmpCount = getEmployeeCountForMapping(m);
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/60 transition">
                              {/* Nama Departemen Asli */}
                              <td className={`${td} py-2.5 font-medium text-slate-900`}>
                                <div className="flex items-center gap-1.5">
                                  <span>{m.rawDepartmentName}</span>
                                </div>
                              </td>

                              {/* Site */}
                              <td className={`${td} py-2.5`}>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    m.site.toUpperCase() === "GAM"
                                      ? "bg-teal-50 text-teal-700 border border-teal-200"
                                      : m.site.toUpperCase() === "AKP"
                                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                                      : "bg-slate-100 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  <MapPin className="w-2.5 h-2.5" />
                                  <span>{m.site === "ALL" ? "Semua Site" : `Site ${m.site}`}</span>
                                </span>
                              </td>

                              {/* PIT (Opsional) */}
                              <td className={`${td} py-2.5 text-slate-700`}>
                                {(() => {
                                  const pitInfo = getPitDisplay(m);
                                  if (pitInfo) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                        <Mountain className="w-2.5 h-2.5 text-slate-500" />
                                        <span>{pitInfo.name}</span>
                                      </span>
                                    );
                                  }
                                  return <span className="text-slate-400 text-[11px] italic">-</span>;
                                })()}
                              </td>

                              {/* Karyawan Terkait */}
                              <td className={`${td} py-2.5 text-center`}>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
                                  {mappingEmpCount} Karyawan
                                </span>
                              </td>

                              {/* Aksi (Edit & Hapus) */}
                              <td className={`${td} py-2.5 text-right`}>
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditMapping(m)}
                                    className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                                    title="Edit Mapping"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMapping(m)}
                                    disabled={isPending}
                                    className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                                    title="Hapus Mapping"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
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
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <span className="text-[11px] text-slate-500">
              {deptMappings.length} aturan mapping terdaftar untuk departemen ini
            </span>
            <div className="flex items-center gap-2">
              {onEditDepartment && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditDepartment(department);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Departemen</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 text-xs font-bold transition cursor-pointer shadow-2xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Modal Tambah / Edit Mapping */}
      {isFormModalOpen && (
        <MappingFormModal
          isOpen={isFormModalOpen}
          mapping={editingMapping}
          department={department}
          sites={dynamicSites}
          pits={localPits.length > 0 ? localPits : pits}
          existingMappings={localMappings}
          onClose={() => setIsFormModalOpen(false)}
          onSuccess={(newOrUpdatedMapping) => {
            setLocalMappings((prev) => {
              const idx = prev.findIndex(
                (item) =>
                  item.id === newOrUpdatedMapping.id ||
                  (item.site.toUpperCase() === newOrUpdatedMapping.site.toUpperCase() &&
                    item.cleanRawName.toUpperCase() === newOrUpdatedMapping.cleanRawName.toUpperCase())
              );
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = newOrUpdatedMapping;
                return next;
              }
              return [...prev, newOrUpdatedMapping];
            });
            setIsFormModalOpen(false);
          }}
          createAction={createMappingAction}
          updateAction={updateMappingAction}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// SUB-KOMPONEN: FORM MODAL TAMBAH / EDIT MAPPING
// -----------------------------------------------------------------------------
interface MappingFormModalProps {
  isOpen: boolean;
  mapping: DepartmentMappingWithDetails | null;
  department: Department;
  sites: { id: number; code: string; name: string }[];
  pits: Pit[];
  existingMappings: DepartmentMappingWithDetails[];
  onClose: () => void;
  onSuccess: (saved: DepartmentMappingWithDetails) => void;
  createAction?: (fd: FormData) => Promise<{ success: boolean; id: number; error?: string }>;
  updateAction?: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}

function MappingFormModal({
  isOpen,
  mapping,
  department,
  sites,
  pits,
  existingMappings,
  onClose,
  onSuccess,
  createAction,
  updateAction,
}: MappingFormModalProps) {
  const [rawDepartmentName, setRawDepartmentName] = useState(mapping?.rawDepartmentName || "");
  const [site, setSite] = useState(mapping?.site || (sites[0]?.code ?? "GAM"));
  const [siteId, setSiteId] = useState<number>(
    mapping?.site
      ? sites.find((s) => s.code === mapping.site)?.id ?? 0
      : sites[0]?.id ?? 0
  );

  // Inisialisasi pitId: jika belum ada pitId eksplisit, cari dari database yang cocok dengan nama / detail
  const initialPitId = useMemo(() => {
    if (mapping?.pitId) return mapping.pitId;
    if (mapping?.originalUnitDetail || mapping?.rawDepartmentName) {
      const targetDetail = (mapping.originalUnitDetail || "").toLowerCase().trim();
      const rawTarget = (mapping.rawDepartmentName || "").toLowerCase().trim();
      const found = pits.find((p) => {
        const pName = p.name.toLowerCase().trim();
        return (
          (targetDetail && (targetDetail === pName || targetDetail.includes(pName) || pName.includes(targetDetail))) ||
          rawTarget.endsWith(` ${pName}`) ||
          rawTarget.endsWith(`-${pName}`) ||
          rawTarget.includes(`(${pName})`) ||
          rawTarget.includes(` ${pName} `) ||
          rawTarget === pName
        );
      });
      if (found) return found.id;
    }
    return "";
  }, [mapping, pits]);

  const [pitId, setPitId] = useState<number | "">(initialPitId);
  const [isPending, startTransition] = useTransition();

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  // Dropdown PIT: Pisahkan PIT yang cocok dengan Site saat ini dan semua PIT aktif dari database
  const { sitePits, otherPits } = useMemo(() => {
    const activePits = pits.filter((p) => p.isActive !== false);
    if (!site || site === "ALL") {
      return { sitePits: activePits, otherPits: [] };
    }
    const matched: Pit[] = [];
    const others: Pit[] = [];
    activePits.forEach((p) => {
      if (matchesSite(p.site, site) || (siteId > 0 && p.siteId === siteId)) {
        matched.push(p);
      } else {
        others.push(p);
      }
    });
    return { sitePits: matched, otherPits: others };
  }, [pits, site, siteId]);

  // Reset pitId hanya jika pit tersebut sama sekali tidak terdaftar di database
  useEffect(() => {
    if (typeof pitId === "number") {
      const existsInDb = pits.some((p) => p.id === pitId);
      if (!existsInDb) {
        setPitId("");
      }
    }
  }, [pits, pitId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRaw = rawDepartmentName.trim().toUpperCase().replace(/\s+/g, " ");

    if (!cleanRaw) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Asli Wajib Diisi",
        text: "Silakan masukkan nama departemen asli dari data Excel.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    if (!site) {
      void Swal.fire({
        icon: "warning",
        title: "Site Wajib Dipilih",
        text: "Silakan pilih Site untuk aturan mapping ini.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    // Validasi duplikasi mapping:
    // Peringatkan jika kombinasi site + cleanRawName ini SUDAH dipakai oleh departemen LAIN.
    // Jika dipakai oleh departemen saat ini, izinkan update/upsert langsung tanpa memblokir!
    const conflictWithOtherDept = existingMappings.find(
      (m) =>
        m.id !== mapping?.id &&
        m.site.toUpperCase() === site.toUpperCase() &&
        m.cleanRawName.toUpperCase() === cleanRaw &&
        m.departmentId &&
        m.departmentId !== department.id
    );

    if (conflictWithOtherDept) {
      void Swal.fire({
        icon: "warning",
        title: "Mapping Sudah Terdaftar di Departemen Lain",
        text: `Aturan mapping untuk nama asli "${rawDepartmentName.trim()}" pada Site "${site}" saat ini sudah terhubung ke departemen "${conflictWithOtherDept.standardDepartmentName || 'Lain'}".`,
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        if (mapping) fd.append("id", String(mapping.id));
        fd.append("rawDepartmentName", rawDepartmentName.trim());
        fd.append("site", site);
        if (siteId) fd.append("siteId", String(siteId));
        fd.append("departmentId", String(department.id));
        const selectedPitObj = pits.find((p) => p.id === Number(pitId));
        if (pitId) {
          fd.append("pitId", String(pitId));
          fd.append("originalUnitDetail", selectedPitObj?.name || "");
        } else {
          fd.append("pitId", "");
          fd.append("originalUnitDetail", "");
        }
        fd.append("confirmDifferentSiteMapping", "true");

        let savedId = mapping?.id ?? 0;
        if (mapping && updateAction) {
          const res = await updateAction(fd);
          if (res && !res.success && res.error) {
            void Swal.fire({
              icon: "error",
              title: "Gagal Memperbarui",
              text: res.error,
              confirmButtonColor: "#0f172a",
            });
            return;
          }
        } else if (createAction) {
          const res = await createAction(fd);
          if (res && !res.success && res.error) {
            void Swal.fire({
              icon: "error",
              title: "Gagal Menyimpan",
              text: res.error,
              confirmButtonColor: "#0f172a",
            });
            return;
          }
          savedId = res?.id || savedId;
        }

        const savedObject: DepartmentMappingWithDetails = {
          id: savedId,
          site,
          rawDepartmentName: rawDepartmentName.trim(),
          cleanRawName: cleanRaw,
          departmentId: department.id,
          pitId: pitId ? Number(pitId) : null,
          originalUnitDetail: selectedPitObj?.name ?? null,
          status: "MAPPED",
          notes: null,
          createdAt: mapping?.createdAt || new Date(),
          updatedAt: new Date(),
          standardDepartmentName: department.name,
          standardDepartmentCode: department.code,
          pitName: selectedPitObj?.name,
          pitCode: selectedPitObj?.code,
          totalEmployees: mapping?.totalEmployees ?? 0,
          hasCrossSiteConflict: false,
        };

        void Swal.fire({
          icon: "success",
          title: "Berhasil",
          text: mapping
            ? `Aturan mapping "${rawDepartmentName.trim()}" diperbarui.`
            : `Aturan mapping "${rawDepartmentName.trim()}" berhasil disimpan.`,
          timer: 1500,
          showConfirmButton: false,
        });

        onSuccess(savedObject);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan aturan mapping.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapping-form-title"
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h4 id="mapping-form-title" className="text-sm font-bold text-slate-900">
              {mapping ? "Edit Aturan Mapping" : "Tambah Mapping Baru"}
            </h4>
            <p className="text-xs text-slate-500">
              Petakan nama asli departemen dari Excel ke departemen standar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 1. Nama Departemen Standar (Otomatis mengikuti departemen yang sedang dibuka) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Departemen Standar (Otomatis)
            </label>
            <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>{department.name}</span>
              <span className="font-mono text-[11px] text-slate-500">{department.code}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Aturan ini otomatis diarahkan ke departemen standar <strong>{department.name}</strong>.
            </p>
          </div>

          {/* 2. Nama Departemen Asli dari Excel */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Nama Departemen Asli (dari Excel) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={rawDepartmentName}
              onChange={(e) => setRawDepartmentName(e.target.value)}
              placeholder="Contoh: PRODUKSI, MINE OPERATION, HSE LAPANGAN"
              className={inputCls}
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ketikkan persis nama departemen sebagaimana tertera pada file data Excel atau Odoo.
            </p>
          </div>

          {/* 3. Site (dropdown dinamis dari Master Site) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Site <span className="text-rose-500">*</span>
            </label>
            <select
              value={site}
              onChange={(e) => {
                const val = e.target.value;
                setSite(val);
                const matched = sites.find((s) => s.code === val);
                if (matched) setSiteId(matched.id);
              }}
              className={inputCls}
              required
            >
              {sites.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Pilih Site asal data tersebut (satu departemen standar dapat memiliki nama berbeda per Site).
            </p>
          </div>

          {/* 4. PIT (opsional - ditarik langsung dari Master PIT database) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">
                PIT (Opsional)
              </label>
              <span className="text-[10px] text-slate-500 font-medium">
                {pits.filter((p) => p.isActive !== false).length} PIT terdaftar di Database
              </span>
            </div>
            <select
              value={pitId}
              onChange={(e) => setPitId(e.target.value ? Number(e.target.value) : "")}
              className={inputCls}
            >
              <option value="">-- Tanpa PIT / Tidak Terkait PIT --</option>
              {sitePits.length > 0 && (
                <optgroup label={`PIT di Site ${site} (${sitePits.length})`}>
                  {sitePits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </optgroup>
              )}
              {otherPits.length > 0 && (
                <optgroup label={sitePits.length > 0 ? "PIT Lainnya (Master PIT Database)" : "Semua PIT di Master Database"}>
                  {otherPits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — Site {p.site}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Pilihan PIT ditarik langsung dari Master PIT di database sehingga dapat dipetakan secara akurat.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={`${btnSecondary} text-xs px-4 py-2 cursor-pointer`}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={`${btnPrimary} text-xs px-4 py-2 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white`}
            >
              {isPending ? "Menyimpan..." : mapping ? "Simpan Perubahan" : "Simpan Mapping"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
