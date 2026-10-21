"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobLevelPermission, JobPosition, Pit, DepartmentMapping } from "@/db/schema";
import { matchesSite, matchesDeptName } from "@/lib/department-mapping-utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  KeyRound,
  ShieldCheck,
  User,
  History,
  Check,
  X,
  Lock,
  Search,
  RotateCcw,
  CheckSquare,
  Square,
  SlidersHorizontal,
} from "lucide-react";
import {
  RBAC_MODULES,
  SYSTEM_PERMISSIONS,
  getDefaultPermissionsForRole,
  getPermissionsGroupedByModule,
  RbacModuleKey,
} from "@/lib/rbac-catalog";

export interface UnifiedLogItem {
  id: string | number;
  category: "kpi" | "auth" | "profile";
  entity: string;
  action: string;
  actor: string;
  title: string;
  description: string;
  badgeText: string;
  badgeColor: string;
  createdAt: Date | string;
  rawDetails?: unknown;
}

interface Props {
  employee: Employee;
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  pits?: Pit[];
  mappings?: DepartmentMapping[];
  permission?: JobLevelPermission | null;
  auditLogs?: UnifiedLogItem[];
  upsertAction: (fd: FormData) => Promise<void>;
  resetPasswordAction: (
    employeeId: number
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export function EmployeeDetailClient({
  employee,
  departments,
  jobLevels,
  jobPositions = [],
  pits = [],
  mappings = [],
  permission,
  auditLogs = [],
  upsertAction,
  resetPasswordAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Unified Form State (pertahankan data & functionality asli 100%)
  const [departmentId, setDepartmentId] = useState(String(employee.departmentId));
  const [operatingUnit, setOperatingUnit] = useState(employee.operatingUnit || "HO");

  // Deteksi PIT awal: jika belum ada di record karyawan, cari kandidat mapping yang cocok
  const initialPitId = useMemo(() => {
    if (employee.pitId) return String(employee.pitId);
    if (!mappings || mappings.length === 0 || !pits || pits.length === 0) return "";
    const site = (employee.operatingUnit || "HO").toUpperCase();
    const rawDept = (employee.originalDepartment || "").trim();
    if (rawDept) {
      const match = mappings.find(
        (m) =>
          matchesSite(m.site, site) &&
          m.pitId &&
          (matchesDeptName(m.cleanRawName, rawDept) || matchesDeptName(m.rawDepartmentName, rawDept))
      );
      if (match?.pitId) return String(match.pitId);
    }
    if (employee.departmentId) {
      const matchDept = mappings.find(
        (m) => matchesSite(m.site, site) && m.departmentId === employee.departmentId && m.pitId
      );
      if (matchDept?.pitId) return String(matchDept.pitId);
    }
    return "";
  }, [employee, mappings, pits]);

  const [pitId, setPitId] = useState(initialPitId);
  const isPitAutoDetected = Boolean(!employee.pitId && pitId && pitId === initialPitId);

  const [jobLevelId, setJobLevelId] = useState(String(employee.jobLevelId));
  const [jobPosition, setJobPosition] = useState(employee.jobPosition || "");
  const [jobPositionId, setJobPositionId] = useState(
    employee.jobPositionId ? String(employee.jobPositionId) : ""
  );
  const [dateOfHire, setDateOfHire] = useState(
    employee.dateOfHire ? String(employee.dateOfHire).slice(0, 10) : ""
  );
  const [role, setRole] = useState(employee.role || "KARYAWAN");
  const [polaPenggajian, setPolaPenggajian] = useState(employee.polaPenggajian || "All In");

  // Memoized PIT
  const matchedPit = useMemo(() => {
    if (!pitId) return null;
    return pits.find((p) => String(p.id) === String(pitId)) || null;
  }, [pits, pitId]);

  const availablePits = useMemo(() => {
    if (!pits || pits.length === 0) return [];
    const active = pits.filter((p) => p.isActive !== false);
    if (!operatingUnit || operatingUnit === "ALL") return active;
    const sitePits = active.filter(
      (p) => (p.site || "").toUpperCase() === operatingUnit.toUpperCase()
    );
    return sitePits.length > 0 ? sitePits : active;
  }, [pits, operatingUnit]);

  // RBAC Checklist States
  const [isCustomRole, setIsCustomRole] = useState<boolean>(Boolean(employee.isCustomRole));
  const [customPermissions, setCustomPermissions] = useState<string[]>(() => {
    if (employee.isCustomRole && Array.isArray(employee.customPermissions) && employee.customPermissions.length > 0) {
      return employee.customPermissions;
    }
    return getDefaultPermissionsForRole(employee.role || "KARYAWAN");
  });
  const [rbacSearch, setRbacSearch] = useState<string>("");
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({
    DASHBOARD: true,
    INPUT_ASSESSMENT: true,
    REVIEW_APPROVAL: true,
  });

  // Accordion states
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(true);
  const [isLogsOpen, setIsLogsOpen] = useState(auditLogs.length > 0);

  // Tab Kategori & Pagination Log History
  const [logCategory, setLogCategory] = useState<"all" | "kpi" | "auth" | "profile">("all");
  const [logPage, setLogPage] = useState<number>(1);
  const logPageSize = 5;

  const logCounts = useMemo(() => {
    return {
      all: auditLogs.length,
      kpi: auditLogs.filter((l) => l.category === "kpi").length,
      auth: auditLogs.filter((l) => l.category === "auth").length,
      profile: auditLogs.filter((l) => l.category === "profile").length,
    };
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    if (logCategory === "all") return auditLogs;
    return auditLogs.filter((l) => l.category === logCategory);
  }, [auditLogs, logCategory]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));

  const paginatedLogs = useMemo(() => {
    const start = (logPage - 1) * logPageSize;
    return filteredLogs.slice(start, start + logPageSize);
  }, [filteredLogs, logPage, logPageSize]);

  const handleLogCategoryChange = (cat: "all" | "kpi" | "auth" | "profile") => {
    setLogCategory(cat);
    setLogPage(1);
  };

  // Efektif permissions saat ini
  const effectivePermissions = useMemo(() => {
    if (isCustomRole) {
      return customPermissions;
    }
    return getDefaultPermissionsForRole(role);
  }, [isCustomRole, customPermissions, role]);

  // Ketika role berubah dan mode role standar aktif, update default permissions
  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (!isCustomRole) {
      setCustomPermissions(getDefaultPermissionsForRole(newRole));
    }
  };

  const handleTogglePermission = (code: string) => {
    if (!isCustomRole) {
      // Otomatis aktifkan mode custom jika user mulai menceklis manual
      setIsCustomRole(true);
      const defaults = getDefaultPermissionsForRole(role);
      const updated = defaults.includes(code)
        ? defaults.filter((c) => c !== code)
        : [...defaults, code];
      setCustomPermissions(updated);
      return;
    }

    setCustomPermissions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Global & Category Matrix Handlers
  const handleSelectAllGlobal = () => {
    setIsCustomRole(true);
    setCustomPermissions(SYSTEM_PERMISSIONS.map((p) => p.code));
  };

  const handleDeselectAllGlobal = () => {
    setIsCustomRole(true);
    setCustomPermissions([]);
  };

  const handleSelectAllCategory = (codes: string[]) => {
    setIsCustomRole(true);
    setCustomPermissions((prev) => Array.from(new Set([...prev, ...codes])));
  };

  const handleDeselectAllCategory = (codes: string[]) => {
    setIsCustomRole(true);
    const set = new Set(codes);
    setCustomPermissions((prev) => prev.filter((code) => !set.has(code)));
  };

  const handleResetToRoleDefault = () => {
    setIsCustomRole(false);
    setCustomPermissions(getDefaultPermissionsForRole(role));
  };

  // Nama departemen terpilih
  const selectedDeptName = useMemo(() => {
    return departments.find((d) => String(d.id) === departmentId)?.name ?? "";
  }, [departments, departmentId]);

  // Filter cascading jabatan berdasarkan departemen terpilih + jabatan umum
  const { deptPositions, globalPositions } = useMemo(() => {
    if (!jobPositions || jobPositions.length === 0) return { deptPositions: [], globalPositions: [] };
    const deptIdNum = Number(departmentId);
    const activePositions = jobPositions.filter((p) => p.isActive !== false);

    const deptPositions = activePositions
      .filter((p) => Boolean(deptIdNum && p.departmentId === deptIdNum))
      .sort((a, b) => a.name.localeCompare(b.name));

    const globalPositions = activePositions
      .filter((p) => p.departmentId === null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { deptPositions, globalPositions };
  }, [jobPositions, departmentId]);

  // Deteksi jika ada data yang diubah / belum disimpan
  const isDirty = useMemo(() => {
    if (String(departmentId) !== String(employee.departmentId || "")) return true;
    if (pitId !== (employee.pitId ? String(employee.pitId) : "")) return true;
    if (String(jobLevelId) !== String(employee.jobLevelId || "")) return true;
    if (jobPosition !== (employee.jobPosition || "")) return true;
    if (jobPositionId !== (employee.jobPositionId ? String(employee.jobPositionId) : "")) return true;
    if (dateOfHire !== (employee.dateOfHire ? String(employee.dateOfHire).slice(0, 10) : "")) return true;
    if (operatingUnit !== (employee.operatingUnit || "HO")) return true;
    if (role !== (employee.role || "KARYAWAN")) return true;
    if (polaPenggajian !== (employee.polaPenggajian || "All In")) return true;
    if (isCustomRole !== Boolean(employee.isCustomRole)) return true;

    const initialPerms = Boolean(employee.isCustomRole) && Array.isArray(employee.customPermissions)
      ? employee.customPermissions
      : getDefaultPermissionsForRole(employee.role || "KARYAWAN");

    if (initialPerms.length !== effectivePermissions.length) return true;
    const setA = new Set(initialPerms);
    for (const p of effectivePermissions) {
      if (!setA.has(p)) return true;
    }
    return false;
  }, [
    departmentId,
    pitId,
    jobLevelId,
    jobPosition,
    jobPositionId,
    operatingUnit,
    role,
    polaPenggajian,
    isCustomRole,
    effectivePermissions,
    employee,
  ]);

  const handleResetAllChanges = () => {
    setDepartmentId(String(employee.departmentId || ""));
    setPitId(employee.pitId ? String(employee.pitId) : "");
    setJobLevelId(String(employee.jobLevelId || ""));
    setJobPosition(employee.jobPosition || "");
    setJobPositionId(employee.jobPositionId ? String(employee.jobPositionId) : "");
    setDateOfHire(employee.dateOfHire ? String(employee.dateOfHire).slice(0, 10) : "");
    setOperatingUnit(employee.operatingUnit || "HO");
    setRole(employee.role || "KARYAWAN");
    setPolaPenggajian(employee.polaPenggajian || "All In");
    setIsCustomRole(Boolean(employee.isCustomRole));
    setCustomPermissions(
      employee.isCustomRole && Array.isArray(employee.customPermissions) && employee.customPermissions.length > 0
        ? employee.customPermissions
        : getDefaultPermissionsForRole(employee.role || "KARYAWAN")
    );
  };

  const handleJobPositionChange = (posName: string) => {
    setJobPosition(posName);
    const matched = jobPositions.find((p) => p.name === posName);
    if (matched) {
      setJobPositionId(String(matched.id));
      if (matched.jobLevelId) {
        setJobLevelId(String(matched.jobLevelId));
      }
      if (matched.departmentId && String(matched.departmentId) !== departmentId) {
        setDepartmentId(String(matched.departmentId));
      }
    } else {
      setJobPositionId("");
    }
  };

  const handleSimpan = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("id", String(employee.id));
    fd.append("nik", employee.nik);
    fd.append("name", employee.name);
    fd.append("departmentId", departmentId);
    fd.append("pitId", pitId || "");
    fd.append("jobLevelId", jobLevelId);
    fd.append("operatingUnit", operatingUnit);
    fd.append("jobPosition", jobPosition.trim());
    if (jobPositionId) {
      fd.append("jobPositionId", jobPositionId);
    }
    fd.append("dateOfHire", dateOfHire.trim());
    fd.append("role", role);
    fd.append("polaPenggajian", polaPenggajian);
    fd.append("isCustomRole", String(isCustomRole));
    fd.append("customPermissions", JSON.stringify(isCustomRole ? customPermissions : []));

    startTransition(async () => {
      try {
        await upsertAction(fd);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Disimpan",
          text: "Data dan konfigurasi hak akses karyawan telah diperbarui.",
          timer: 1500,
          showConfirmButton: false,
        });
        router.push("/setup/master?tab=karyawan");
        router.refresh();
      } catch (err: any) {
        Swal.fire({ icon: "error", title: "Gagal Menyimpan", text: err.message });
      }
    });
  };

  const handleResetPassword = () => {
    Swal.fire({
      title: "Reset Kata Sandi?",
      text: `Password akan dikembalikan ke default (NIK: ${employee.nik}).`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Ya, Reset",
      cancelButtonText: "Batal",
    }).then((result) => {
      if (result.isConfirmed) {
        startTransition(async () => {
          try {
            const res = await resetPasswordAction(employee.id);
            if (res.success) {
              Swal.fire({
                icon: "success",
                title: "Berhasil",
                text: res.message,
                timer: 1500,
                showConfirmButton: false,
              });
            } else {
              Swal.fire({
                icon: "error",
                title: "Gagal",
                text: res.error || "Gagal mereset password",
              });
            }
          } catch (err: any) {
            Swal.fire({ icon: "error", title: "Gagal", text: err.message });
          }
        });
      }
    });
  };

  // Scope dan Hak Akses Real
  const isAdmin = role === "ADMIN";
  const deptScope = isAdmin
    ? "ALL"
    : permission?.departmentScope || (role === "HEAD_DEPT" ? "OWN_DEPT" : "SELF_ONLY");
  const levelScope = isAdmin
    ? "ALL"
    : permission?.levelScope || (role === "HEAD_DEPT" ? "SUBORDINATES" : "SELF_ONLY");

  const deptScopeLabel =
    deptScope === "ALL"
      ? "Semua Departemen"
      : deptScope === "OWN_DEPT"
      ? "Departemen Sendiri"
      : deptScope === "CUSTOM"
      ? "Kustom Departemen"
      : "Hanya Sendiri";

  const levelScopeLabel =
    levelScope === "ALL"
      ? "Semua Level"
      : levelScope === "SUBORDINATES"
      ? "Bawahan Langsung"
      : levelScope === "SAME_AND_BELOW"
      ? "Sederajat & di Bawahnya"
      : "Hanya Sendiri";

  const permissionsList = [
    {
      key: "canAccessMasterData",
      label: "Master Data",
      active: isAdmin || Boolean(permission?.canAccessMasterData),
    },
    {
      key: "canAccessMasterParam",
      label: "Master Parameter",
      active: isAdmin || Boolean(permission?.canAccessMasterParam),
    },
    {
      key: "canAccessTemplate",
      label: "Template KPI",
      active: isAdmin || Boolean(permission?.canAccessTemplate),
    },
    {
      key: "canAccessAssignment",
      label: "Penugasan KPI",
      active: isAdmin || Boolean(permission?.canAccessAssignment),
    },
    {
      key: "canAccessInputAssessment",
      label: "Input Penilaian KPI",
      active: isAdmin || Boolean(permission?.canAccessInputAssessment ?? true),
    },
    {
      key: "canAccessReviewAssessment",
      label: "Review Penilaian KPI",
      active:
        isAdmin ||
        Boolean(
          permission?.canAccessReviewAssessment ?? (role === "PENILAI" || role === "HEAD_DEPT")
        ),
    },
    {
      key: "canAccessApprovalAssessment",
      label: "Approval Penilaian",
      active: isAdmin || Boolean(permission?.canAccessApprovalAssessment ?? role === "HEAD_DEPT"),
    },
    {
      key: "canAccessReports",
      label: "Laporan & Rekap",
      active: isAdmin || Boolean(permission?.canAccessReports),
    },
  ];

  const activePermissionsCount = permissionsList.filter((p) => p.active).length;



  // Formatting date
  const formatDateTime = (val: Date | string | null | undefined): string => {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Compact field styles
  const inputBase =
    "w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all cursor-pointer";
  const labelBase = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1";

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12 antialiased">
      {/* 1. Header Navigation Link & Quick Save (Sticky at top) */}
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md py-2.5 -my-2 flex items-center justify-between">
        <Link
          href="/setup/master?tab=karyawan"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-400" />
          <span>Kembali ke Master Karyawan</span>
        </Link>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleResetAllChanges}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="submit"
            form="employee-detail-form"
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer ${
              isDirty
                ? "bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/25 active:scale-95"
                : "bg-sky-500 hover:bg-sky-600 text-white shadow-xs hover:shadow-sm active:scale-95"
            }`}
          >
            {isPending ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 text-white" />
            )}
            <span>{isPending ? "Menyimpan..." : isDirty ? "Simpan Perubahan *" : "Simpan Perubahan"}</span>
          </button>
        </div>
      </div>

      {/* Main Form Wrapping All Editable Sections */}
      <form id="employee-detail-form" onSubmit={handleSimpan} className="space-y-4">
        {/* ========================================================= */}
        {/* CARD 1: INFORMASI & PROFIL EMPLOYEE (Unified Single Card) */}
        {/* ========================================================= */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
          {/* Header Profil Employee: Nama, Jabatan, Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-4">
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate tracking-tight">
                {employee.name}
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {jobPosition || employee.jobPosition}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200/80">
                {role.replace("_", " ")}
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                SITE {operatingUnit}
              </span>
              {matchedPit && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200/80">
                  PIT: {matchedPit.name}
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${
                  polaPenggajian === "OT" || polaPenggajian === "Non All In"
                    ? "bg-amber-50 text-amber-800 border border-amber-200/80"
                    : "bg-blue-50 text-blue-800 border border-blue-200/80"
                }`}
              >
                {polaPenggajian.toUpperCase()}
              </span>
              {employee.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Aktif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Nonaktif
                </span>
              )}
            </div>
          </div>

          {/* Form Detail Employee (Compact 2 Kolom) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
            {/* Row 1: NIK & Tanggal Masuk */}
            <div>
              <label className={labelBase}>Nomor Induk Karyawan (NIK)</label>
              <div className="text-xs font-bold text-slate-900 py-1.5 px-3 rounded-lg bg-slate-100/70 border border-slate-200/60 font-mono">
                {employee.nik}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelBase} style={{ marginBottom: 0 }}>
                  Tanggal Bergabung (Arrival Date)
                </label>
                {!dateOfHire && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 rounded">
                    ⚠ Belum ada di Odoo
                  </span>
                )}
              </div>
              <input
                type="date"
                value={dateOfHire}
                onChange={(e) => setDateOfHire(e.target.value)}
                className={`${inputBase} ${
                  !dateOfHire ? "border-amber-300 bg-amber-50/30 text-slate-800" : "bg-white text-slate-900"
                }`}
              />
            </div>

            {/* Row 2: Departemen & PIT (Opsional) */}
            <div>
              <label className={labelBase}>Departemen</label>
              <select
                value={departmentId}
                onChange={(e) => {
                  const newDeptId = e.target.value;
                  setDepartmentId(newDeptId);
                  const posInNewDept = jobPositions.find(
                    (p) => String(p.departmentId) === String(newDeptId) && p.name === jobPosition
                  );
                  if (!posInNewDept && jobPosition) {
                    setJobPosition("");
                    setJobPositionId("");
                  }
                  // Auto-suggest PIT dari mapping departemen jika departemen baru memiliki mapping PIT di site saat ini
                  if (mappings && pits && mappings.length > 0) {
                    const site = (operatingUnit || "HO").toUpperCase();
                    const deptNum = Number(newDeptId);
                    const matchedMap = mappings.find(
                      (m) => matchesSite(m.site, site) && m.departmentId === deptNum && m.pitId
                    );
                    if (matchedMap?.pitId) {
                      setPitId(String(matchedMap.pitId));
                    }
                  }
                }}
                className={inputBase}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelBase} style={{ marginBottom: 0 }}>
                  PIT <span className="text-slate-400 font-normal text-xs">(Opsional)</span>
                </label>
                {pitId && (
                  <button
                    type="button"
                    onClick={() => setPitId("")}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Kosongkan PIT
                  </button>
                )}
              </div>
              <select
                value={pitId}
                onChange={(e) => setPitId(e.target.value)}
                className={inputBase}
              >
                <option value="">- Tidak Menggunakan PIT (cth: HO) -</option>
                {availablePits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {!pitId && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Karyawan ini tidak terikat PIT (nilai saat ini: -).
                </p>
              )}
            </div>

            <div>
              <label className={labelBase}>Jabatan (Job Position)</label>
              {jobPositions && jobPositions.length > 0 ? (
                <select
                  value={jobPosition}
                  onChange={(e) => handleJobPositionChange(e.target.value)}
                  className={inputBase}
                >
                  <option value="">-- Pilih Jabatan --</option>
                  {deptPositions.length > 0 && (
                    <optgroup label={`Jabatan di Departemen (${selectedDeptName || "Departemen"})`}>
                      {deptPositions.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} {p.code ? `[${p.code}]` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {jobPosition &&
                    !deptPositions.some((p) => p.name === jobPosition) && (
                      <optgroup label="Jabatan Lainnya">
                        <option value={jobPosition}>{jobPosition}</option>
                      </optgroup>
                    )}
                </select>
              ) : (
                <input
                  type="text"
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder="Nama Jabatan"
                  className={inputBase}
                />
              )}
            </div>

            {/* Row 3: Job Level & Operating Unit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelBase}>Job Level</label>
                <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">
                  Otomatis dari Jabatan
                </span>
              </div>
              <select
                value={jobLevelId}
                onChange={(e) => setJobLevelId(e.target.value)}
                className={inputBase}
              >
                {jobLevels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelBase}>Site</label>
              <select
                value={operatingUnit}
                onChange={(e) => {
                  const newSite = e.target.value;
                  setOperatingUnit(newSite);
                  if (newSite === "HO") {
                    setPitId("");
                  } else if (mappings && pits && departmentId) {
                    const deptNum = Number(departmentId);
                    const matchedMap = mappings.find(
                      (m) => matchesSite(m.site, newSite) && m.departmentId === deptNum && m.pitId
                    );
                    if (matchedMap?.pitId) {
                      setPitId(String(matchedMap.pitId));
                    }
                  }
                }}
                className={inputBase}
              >
                <option value="HO">HO (Head Office)</option>
                <option value="GAM">GAM (Ganda Alam Makmur)</option>
                <option value="AKP">AKP (Adhi Kartiko Pratama)</option>
              </select>
            </div>

            {/* Row 4: Pola Penggajian */}
            <div>
              <label className={labelBase}>Pola Penggajian</label>
              <select
                value={polaPenggajian}
                onChange={(e) => setPolaPenggajian(e.target.value)}
                className={inputBase}
              >
                <option value="All In">All In</option>
                <option value="OT">OT</option>
              </select>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: HAK AKSES (FLAT, BATAS GARIS TIPIS, 1 ACTION)  */}
        {/* ========================================================= */}
        <section className="space-y-3 pt-3 border-t border-slate-200/80">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/80 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Hak Akses & Otoritas (RBAC)
                </h2>
                {/* Standar Role: Keterangan Sederhana (Tanpa Card) */}
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                  <span>Standar Role: <strong className="text-slate-800 font-semibold">{role}</strong></span>
                  {isCustomRole ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80">
                      Kustomisasi Aktif ·
                      <button
                        type="button"
                        onClick={handleResetToRoleDefault}
                        className="underline font-semibold hover:text-amber-900 cursor-pointer ml-0.5"
                      >
                        Reset Default
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">(Default sistem aktif)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {effectivePermissions.length} / {SYSTEM_PERMISSIONS.length} Otoritas Aktif
              </span>
            </div>
          </div>

          {/* Quick Controls: 1 Button Action (Pilih/Batal Semua) & Search (Tanpa Card) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-0.5">
            {/* 1 Button Action Global */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={
                  SYSTEM_PERMISSIONS.every((p) => effectivePermissions.includes(p.code))
                    ? handleDeselectAllGlobal
                    : handleSelectAllGlobal
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
              >
                {SYSTEM_PERMISSIONS.every((p) => effectivePermissions.includes(p.code)) ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-rose-500" />
                    <span>Batal Semua</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Pilih Semua</span>
                  </>
                )}
              </button>
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rbacSearch}
                onChange={(e) => setRbacSearch(e.target.value)}
                placeholder="Filter fungsi..."
                className="w-full pl-8 pr-6 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {rbacSearch && (
                <button
                  type="button"
                  onClick={() => setRbacSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* AREA SCROLL SECTION HAK AKSES */}
          <div className="max-h-[380px] overflow-y-auto overscroll-contain pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: "dashboard",
                  title: "1. Dashboard & Analitik",
                  items: SYSTEM_PERMISSIONS.filter((p) => p.module === "DASHBOARD"),
                },
                {
                  id: "master_data",
                  title: "2. Master Data & Organisasi",
                  items: SYSTEM_PERMISSIONS.filter(
                    (p) => p.module === "MASTER_DATA" || p.module === "MASTER_PARAM"
                  ),
                },
                {
                  id: "template_kpi",
                  title: "3. Template & Penugasan KPI",
                  items: SYSTEM_PERMISSIONS.filter((p) => p.module === "TEMPLATE_KPI"),
                },
                {
                  id: "input_assessment",
                  title: "4. Input Penilaian KPI",
                  items: SYSTEM_PERMISSIONS.filter((p) => p.module === "INPUT_ASSESSMENT"),
                },
                {
                  id: "review_approval",
                  title: "5. Review & Approval",
                  items: SYSTEM_PERMISSIONS.filter((p) => p.module === "REVIEW_APPROVAL"),
                },
                {
                  id: "report_system",
                  title: "6. Laporan & Pengaturan Sistem",
                  items: SYSTEM_PERMISSIONS.filter(
                    (p) => p.module === "REPORT_ANALYTICS" || p.module === "SYSTEM_CONFIG"
                  ),
                },
              ].map((category) => {
                const categoryCodes = category.items.map((i) => i.code);
                const filteredItems = rbacSearch
                  ? category.items.filter(
                      (p) =>
                        p.name.toLowerCase().includes(rbacSearch.toLowerCase()) ||
                        p.code.toLowerCase().includes(rbacSearch.toLowerCase())
                    )
                  : category.items;

                if (filteredItems.length === 0) return null;

                const activeCount = category.items.filter((p) =>
                  effectivePermissions.includes(p.code)
                ).length;
                const isAllSelected = activeCount === category.items.length;

                return (
                  /* Batas garis tipis pemisah antar section modul */
                  <div key={category.id} className="rounded-lg border border-slate-200/80 p-3 bg-white/40 flex flex-col">
                    {/* Category Header: nama kategori + jumlah aktif + 1 BUTTON ACTION */}
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200/70">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className="text-xs font-bold text-slate-800 tracking-tight">
                          {category.title}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          ({activeCount}/{category.items.length})
                        </span>
                      </div>

                      {/* 1 BUTTON ACTION (Pilih / Batal) */}
                      <button
                        type="button"
                        onClick={() =>
                          isAllSelected
                            ? handleDeselectAllCategory(categoryCodes)
                            : handleSelectAllCategory(categoryCodes)
                        }
                        className={`text-xs font-semibold cursor-pointer transition hover:underline shrink-0 ${
                          isAllSelected
                            ? "text-rose-600 hover:text-rose-800"
                            : "text-indigo-600 hover:text-indigo-800"
                        }`}
                        title={isAllSelected ? "Batalkan semua di kategori ini" : "Pilih semua di kategori ini"}
                      >
                        {isAllSelected ? "Batal Semua" : "Pilih Semua"}
                      </button>
                    </div>

                    {/* Daftar Permission Flat */}
                    <div className="space-y-0.5 divide-y divide-slate-100">
                      {filteredItems.map((item) => {
                        const isChecked = effectivePermissions.includes(item.code);

                        return (
                          <label
                            key={item.code}
                            className={`flex items-center justify-between gap-2 py-1 px-1.5 rounded transition-colors cursor-pointer select-none text-xs ${
                              isChecked
                                ? "bg-indigo-50/30 hover:bg-indigo-50/50"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(item.code)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                              />
                              <span
                                className={`truncate ${
                                  isChecked
                                    ? "font-semibold text-slate-900"
                                    : "font-normal text-slate-600"
                                }`}
                              >
                                {item.name}
                              </span>
                            </div>

                            <div className="shrink-0 flex items-center gap-1 pl-2">
                              {isChecked ? (
                                <span className="text-[10px] font-bold text-emerald-600">
                                  Aktif
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400">
                                  Off
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>


        {/* ========================================================= */}
        {/* CARD 3: RESET AKUN (Ringkas & Efisien)                   */}
        {/* ========================================================= */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Reset Akun
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">
                  Jika pengguna lupa kata sandi, kembalikan kata sandi ke nilai default (NIK:{" "}
                  <span className="font-mono font-bold text-slate-700">{employee.nik}</span>).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-rose-700 px-4 py-2 text-xs font-semibold shadow-2xs transition active:scale-95 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-rose-500" />
              <span>Reset Kata Sandi</span>
            </button>
          </div>
        </section>

        {/* ========================================================= */}
        {/* CARD 4: LOG HISTORY DENGAN TAB KATEGORI & PAGINATION      */}
        {/* ========================================================= */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsLogsOpen(!isLogsOpen)}
              className="flex items-center gap-2 text-left group cursor-pointer"
            >
              <History className="w-4 h-4 text-slate-500 group-hover:text-indigo-600 transition" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider group-hover:text-indigo-600 transition">
                Log History Aktivitas
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {auditLogs.length} Total Catatan
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsLogsOpen(!isLogsOpen)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              title={isLogsOpen ? "Sembunyikan log" : "Tampilkan log"}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isLogsOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {isLogsOpen && (
            <div className="space-y-3.5 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
              {/* Tab Navigasi Kategori Halaman */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => handleLogCategoryChange("all")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                    logCategory === "all"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs font-bold"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60 font-semibold"
                  }`}
                >
                  <span>Semua Aktivitas</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      logCategory === "all"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {logCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLogCategoryChange("kpi")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                    logCategory === "kpi"
                      ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs font-bold"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60 font-semibold"
                  }`}
                >
                  <span>Penilaian KPI</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      logCategory === "kpi"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {logCounts.kpi}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLogCategoryChange("auth")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                    logCategory === "auth"
                      ? "bg-rose-50 text-rose-800 border border-rose-200/80 shadow-2xs font-bold"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60 font-semibold"
                  }`}
                >
                  <span>Login & Keamanan</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      logCategory === "auth"
                        ? "bg-rose-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {logCounts.auth}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLogCategoryChange("profile")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                    logCategory === "profile"
                      ? "bg-blue-50 text-blue-800 border border-blue-200/80 shadow-2xs font-bold"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60 font-semibold"
                  }`}
                >
                  <span>Perubahan Hak Akses & Profil</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      logCategory === "profile"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {logCounts.profile}
                  </span>
                </button>
              </div>

              {/* Tabel Log History */}
              {paginatedLogs.length > 0 ? (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border border-slate-200/70">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                          <th className="py-2.5 px-3 whitespace-nowrap">Waktu</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Kategori / Status</th>
                          <th className="py-2.5 px-3 min-w-[260px]">Aktivitas & Keterangan</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Pelaku</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedLogs.map((log) => {
                          const badgeColorClass =
                            log.badgeColor === "emerald"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                              : log.badgeColor === "blue"
                              ? "bg-blue-50 text-blue-700 border-blue-200/80"
                              : log.badgeColor === "indigo"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                              : log.badgeColor === "amber"
                              ? "bg-amber-50 text-amber-800 border-amber-200/80"
                              : log.badgeColor === "rose"
                              ? "bg-rose-50 text-rose-700 border-rose-200/80"
                              : "bg-slate-100 text-slate-700 border-slate-200";

                          return (
                            <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap align-top">
                                {formatDateTime(log.createdAt)}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap align-top">
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${badgeColorClass}`}
                                >
                                  {log.badgeText}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top">
                                <div className="font-semibold text-slate-900 text-xs">
                                  {log.title}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-normal">
                                  {log.description}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap align-top">
                                <span className="font-medium text-slate-700 text-xs">
                                  {log.actor}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Bar Navigasi Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1 text-xs text-slate-500">
                    <div>
                      Menampilkan{" "}
                      <span className="font-semibold text-slate-700">
                        {(logPage - 1) * logPageSize + 1}
                      </span>
                      -
                      <span className="font-semibold text-slate-700">
                        {Math.min(logPage * logPageSize, filteredLogs.length)}
                      </span>{" "}
                      dari{" "}
                      <span className="font-semibold text-slate-700">{filteredLogs.length}</span>{" "}
                      catatan · Halaman{" "}
                      <span className="font-semibold text-slate-700">{logPage}</span> dari{" "}
                      <span className="font-semibold text-slate-700">{totalLogPages}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                        disabled={logPage <= 1}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs shadow-2xs transition cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Sebelumnya</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                        disabled={logPage >= totalLogPages}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs shadow-2xs transition cursor-pointer"
                      >
                        <span>Selanjutnya</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  Belum ada catatan riwayat untuk kategori{" "}
                  <strong className="text-slate-600 font-semibold">
                    {logCategory === "all"
                      ? "ini"
                      : logCategory === "kpi"
                      ? "Penilaian KPI"
                      : logCategory === "auth"
                      ? "Login & Keamanan"
                      : "Perubahan Hak Akses & Profil"}
                  </strong>
                  .
                </div>
              )}
            </div>
          )}
        </section>

      </form>
    </div>
  );
}
