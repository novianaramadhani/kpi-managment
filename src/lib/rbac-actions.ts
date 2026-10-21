"use server";

import { db } from "@/db";
import { employees, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultPermissionsForRole } from "./rbac-catalog";

export interface SaveEmployeePermissionsInput {
  employeeId: number;
  isCustomRole: boolean;
  customPermissions: string[];
}

/**
 * Menyimpan preferensi hak akses custom (checklist) untuk seorang karyawan
 */
export async function saveEmployeePermissionsAction(input: SaveEmployeePermissionsInput) {
  try {
    const currentUser = await getCurrentUser();
    const actorName = currentUser ? `${currentUser.name} (${currentUser.nik})` : "Sistem";

    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, input.employeeId))
      .limit(1);

    if (!emp) {
      return { success: false, error: "Karyawan tidak ditemukan" };
    }

    await db
      .update(employees)
      .set({
        isCustomRole: input.isCustomRole,
        customPermissions: input.isCustomRole ? input.customPermissions : [],
      })
      .where(eq(employees.id, input.employeeId));

    // Audit log
    await db.insert(auditLogs).values({
      actor: actorName,
      action: "UPDATE",
      entity: "employee_permissions",
      entityId: input.employeeId,
      changes: {
        message: input.isCustomRole
          ? `Mengatur hak akses kustom (${input.customPermissions.length} fungsi aktif) untuk karyawan ${emp.name} (${emp.nik})`
          : `Mengembalikan hak akses karyawan ${emp.name} (${emp.nik}) ke standar Role: ${emp.role}`,
      },
    });

    revalidatePath(`/setup/karyawan/${input.employeeId}`);
    revalidatePath("/setup");
    return { success: true };
  } catch (error) {
    console.error("saveEmployeePermissionsAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Gagal menyimpan hak akses karyawan",
    };
  }
}

/**
 * Mendapatkan daftar permission efektif untuk seorang karyawan
 */
export async function getEmployeeEffectivePermissionsAction(employeeId: number): Promise<{
  isCustomRole: boolean;
  effectivePermissions: string[];
  role: string;
}> {
  try {
    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!emp) {
      return { isCustomRole: false, effectivePermissions: [], role: "KARYAWAN" };
    }

    const role = emp.role || "KARYAWAN";
    const isCustomRole = Boolean(emp.isCustomRole);

    if (isCustomRole && Array.isArray(emp.customPermissions) && emp.customPermissions.length > 0) {
      return {
        isCustomRole: true,
        effectivePermissions: emp.customPermissions,
        role,
      };
    }

    return {
      isCustomRole: false,
      effectivePermissions: getDefaultPermissionsForRole(role),
      role,
    };
  } catch (error) {
    console.error("getEmployeeEffectivePermissionsAction error:", error);
    return { isCustomRole: false, effectivePermissions: [], role: "KARYAWAN" };
  }
}
