export interface RoleBadgeInfo {
  badgeClass: string;
  label: string;
}

/**
 * Memberikan styling badge soft capsule yang konsisten dan modern
 * untuk semua role user dalam sistem: ADMIN, HR, MANAGER, HEAD_DEPT, PENILAI, KARYAWAN.
 */
export function getRoleBadgeInfo(role?: string | null, isCustomRole?: boolean | null): RoleBadgeInfo {
  const normalized = (role || "KARYAWAN").toUpperCase().trim();
  const suffix = isCustomRole ? " (RBAC)" : "";
  const customBorder = isCustomRole ? " border-indigo-300 ring-1 ring-indigo-400/20" : "";
  switch (normalized) {
    case "ADMIN":
    case "SUPERADMIN":
      return {
        badgeClass: `bg-indigo-50 text-indigo-700 border-indigo-200/90 font-bold${customBorder}`,
        label: `ADMIN${suffix}`,
      };
    case "HR":
      return {
        badgeClass: `bg-sky-50 text-sky-700 border-sky-200/90 font-bold${customBorder}`,
        label: `HR${suffix}`,
      };
    case "MANAGER":
      return {
        badgeClass: `bg-purple-50 text-purple-700 border-purple-200/90 font-bold${customBorder}`,
        label: `MANAGER${suffix}`,
      };
    case "HEAD_DEPT":
    case "HEAD DEPT":
    case "HEADDEPARTMENT":
      return {
        badgeClass: `bg-emerald-50 text-emerald-700 border-emerald-200/90 font-bold${customBorder}`,
        label: `HEAD DEPT${suffix}`,
      };
    case "PENILAI":
      return {
        badgeClass: `bg-amber-50 text-amber-700 border-amber-200/90 font-bold${customBorder}`,
        label: `PENILAI${suffix}`,
      };
    case "KARYAWAN":
      return {
        badgeClass: `bg-blue-50 text-blue-700 border-blue-200/90 font-bold${customBorder}`,
        label: `KARYAWAN${suffix}`,
      };
    default:
      return {
        badgeClass: `bg-slate-100 text-slate-800 border-slate-200/90 font-bold${customBorder}`,
        label: `${normalized.replace(/_/g, " ")}${suffix}`,
      };
  }
}

