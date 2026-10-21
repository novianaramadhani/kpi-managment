"use server";

import { cookies } from "next/headers";
import { db } from "@/db";
import { employees, departments, jobLevels, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  ODOO_CONFIG,
  signJwt,
  verifyJwt,
  fetchEmployeeFromOdoo,
  authenticateOdooEmployee,
  syncOdooEmployeeToDb,
} from "@/lib/odoo";
import { getEmployeeApprovalLine } from "@/lib/employee-hierarchy";

export type RoleType = "ADMIN" | "HR" | "MANAGER" | "HEAD_DEPT" | "PENILAI" | "KARYAWAN";

export interface UserSession {
  id: number;
  nik: string;
  name: string;
  role: RoleType;
  departmentId: number;
  departmentName?: string;
  jobPosition: string;
  operatingUnit: string;
  mustChangePassword?: boolean;
}

const COOKIE_NAME = "kpi_user_session";

export async function getCurrentUser(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (!sessionCookie?.value) return null;

    // Verifikasi JWT terlebih dahulu
    const jwtPayload = verifyJwt<UserSession>(sessionCookie.value);
    if (jwtPayload && jwtPayload.nik) {
      return jwtPayload;
    }

    // Hanya izinkan session cookie bertanda tangan kriptografis JWT yang valid
    return null;
  } catch {
    return null;
  }
}

/**
 * Memastikan NIK Superadmin (DEV_SUPERADMIN_NIK) ada di database lokal
 */
async function ensureSuperadminExists(nik: string): Promise<UserSession> {
  const [existing] = await db
    .select({
      emp: employees,
      dept: departments,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.nik, nik));

  if (existing) {
    return {
      id: existing.emp.id,
      nik: existing.emp.nik,
      name: existing.emp.name,
      role: "ADMIN",
      departmentId: existing.emp.departmentId || 0,
      departmentName: existing.dept?.name || "IT",
      jobPosition: existing.emp.jobPosition,
      operatingUnit: existing.emp.operatingUnit || "HO",
    };
  }

  // Jika belum ada, buat departemen default & record Superadmin
  let deptId = 1;
  const depts = await db.select().from(departments);
  if (depts.length > 0) {
    deptId = depts[0].id;
  } else {
    const [d] = await db
      .insert(departments)
      .values({ code: "IT", name: "Information Technology" })
      .returning();
    deptId = d.id;
  }

  let levelId = 1;
  const levels = await db.select().from(jobLevels);
  if (levels.length > 0) {
    levelId = levels[0].id;
  } else {
    const [l] = await db
      .insert(jobLevels)
      .values({ code: "MGR", name: "Manager", rank: 4 })
      .returning();
    levelId = l.id;
  }

  const [superadmin] = await db
    .insert(employees)
    .values({
      nik,
      name: "Superadmin System",
      departmentId: deptId,
      jobLevelId: levelId,
      jobPosition: "System Administrator",
      operatingUnit: "HO",
      role: "ADMIN",
      isActive: true,
      dateOfHire: "2020-01-01",
    })
    .returning();

  return {
    id: superadmin.id,
    nik: superadmin.nik,
    name: superadmin.name,
    role: "ADMIN",
    departmentId: superadmin.departmentId,
    departmentName: depts.find((d) => d.id === deptId)?.name || "IT",
    jobPosition: superadmin.jobPosition,
    operatingUnit: superadmin.operatingUnit || "HO",
  };
}

export async function loginWithNik(nikInput: string, passwordInput?: string) {
  const nik = (nikInput || "").trim();
  const password = (passwordInput || "").trim();

  if (!nik) {
    return { success: false, error: "Nomor Induk Karyawan (NIK) wajib diisi!" };
  }
  if (!password) {
    return { success: false, error: "Kata sandi atau PIN wajib diisi!" };
  }

  let session: UserSession | null = null;

  // 1. Cari di database lokal terlebih dahulu
  let [localRecord] = await db
    .select({
      emp: employees,
      dept: departments,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.nik, nik));

  // 2. Jika belum ada di lokal, coba verifikasi langsung ke Odoo ERP
  if (!localRecord) {
    if (ODOO_CONFIG.authMode === "odoo") {
      const odooEmployee = await authenticateOdooEmployee(nik, password);
      if (odooEmployee) {
        const synced = await syncOdooEmployeeToDb(odooEmployee);
        if (synced) {
          const [newLocal] = await db
            .select({
              emp: employees,
              dept: departments,
            })
            .from(employees)
            .leftJoin(departments, eq(employees.departmentId, departments.id))
            .where(eq(employees.nik, nik));

          localRecord = newLocal;
        }
      }
    }

    // Fallback jika NIK superadmin dan Odoo belum merespons
    if (!localRecord && nik === ODOO_CONFIG.devSuperadminNik) {
      if (
        password === ODOO_CONFIG.servicePassword ||
        password === ODOO_CONFIG.adminPassword ||
        password === nik
      ) {
        session = await ensureSuperadminExists(nik);
      }
    }
  }

  // 3. Jika record ditemukan di lokal
  if (localRecord) {
    if (!localRecord.emp.isActive) {
      return {
        success: false,
        error: `Akun karyawan dengan NIK "${nik}" berstatus non-aktif. Silakan hubungi HR.`,
      };
    }

    // 3.1 Ambil record user terlebih dahulu untuk pengecekan kata sandi lokal
    let userRec: (typeof users.$inferSelect) | undefined;
    try {
      const [existingUser] = await db.select().from(users).where(eq(users.nik, nik));
      userRec = existingUser;
    } catch (err) {
      console.error("Gagal membaca tabel users:", err);
    }

    // Validasi Password (Strict)
    // Password lokal valid: jika sesuai userRec.password, atau employees.password, atau default NIK
    const isMatchLocal =
      (userRec?.password && password === userRec.password) ||
      (localRecord.emp.password && password === localRecord.emp.password) ||
      (!localRecord.emp.password && password === localRecord.emp.nik);

    if (!isMatchLocal) {
      // Coba verifikasi langsung ke Odoo employee-login (Strict: hanya berhasil jika credentials benar)
      const odooEmp = await authenticateOdooEmployee(nik, password);
      if (!odooEmp) {
        return {
          success: false,
          error: "Nomor Induk Karyawan (NIK) atau kata sandi tidak sesuai.",
        };
      } else {
        // Update password lokal sesuai password Odoo yang valid
        await db
          .update(employees)
          .set({ password })
          .where(eq(employees.id, localRecord.emp.id));

        if (userRec) {
          await db
            .update(users)
            .set({ password })
            .where(eq(users.id, userRec.id));
        }
      }
    }

    // Jika akun adalah DEV_SUPERADMIN_NIK, pastikan rolenya ADMIN
    let role = (localRecord.emp.role as RoleType) || "KARYAWAN";
    if (nik === ODOO_CONFIG.devSuperadminNik && role !== "ADMIN") {
      role = "ADMIN";
      await db
        .update(employees)
        .set({ role: "ADMIN" })
        .where(eq(employees.id, localRecord.emp.id));
    }

    // 4. Sinkronkan dengan tabel users untuk mengontrol must_change_password
    let mustChangePassword = false;
    try {
      if (userRec) {
        mustChangePassword = userRec.mustChangePassword;
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userRec.id));
      } else {
        const isDefault = !localRecord.emp.password || localRecord.emp.password === nik;
        const [newUser] = await db
          .insert(users)
          .values({
            employeeId: localRecord.emp.id,
            nik: localRecord.emp.nik,
            password: localRecord.emp.password || nik,
            mustChangePassword: isDefault,
            lastLoginAt: new Date(),
          })
          .returning();
        mustChangePassword = newUser?.mustChangePassword ?? isDefault;
      }
    } catch (err) {
      console.error("Gagal sinkronisasi tabel users:", err);
    }

    session = {
      id: localRecord.emp.id,
      nik: localRecord.emp.nik,
      name: localRecord.emp.name,
      role,
      departmentId: localRecord.emp.departmentId || 0,
      departmentName: localRecord.dept?.name || "General",
      jobPosition: localRecord.emp.jobPosition,
      operatingUnit: localRecord.emp.operatingUnit || "HO",
      mustChangePassword,
    };
  }

  if (!session) {
    return {
      success: false,
      error: "Nomor Induk Karyawan (NIK) atau kata sandi tidak sesuai.",
    };
  }

  // 5. Buat JWT Token aman menggunakan JWT_SECRET
  const token = signJwt(session as unknown as Record<string, unknown>);

  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 jam sesuai JWT_EXPIRES_IN
    });
  } catch {
    // Mengabaikan error cookies jika dijalankan di luar request context Next.js
  }

  // Catat riwayat login ke audit_logs
  try {
    await db.insert(auditLogs).values({
      entity: "auth",
      entityId: session.id,
      action: "LOGIN",
      actor: session.name,
      changes: {
        nik: session.nik,
        role: session.role,
        operatingUnit: session.operatingUnit,
        message: `Berhasil masuk ke sistem (${session.role})`,
      },
    });
  } catch (logErr) {
    console.error("Gagal mencatat audit log login:", logErr);
  }

  try {
    revalidatePath("/dashboard");
  } catch {
    // ignore
  }
  return { success: true, session };
}

export async function logoutUser() {
  const session = await getCurrentUser();
  if (session) {
    try {
      await db.insert(auditLogs).values({
        entity: "auth",
        entityId: session.id,
        action: "LOGOUT",
        actor: session.name,
        changes: {
          nik: session.nik,
          message: "Pengguna keluar dari sistem (logout)",
        },
      });
    } catch (logErr) {
      console.error("Gagal mencatat audit log logout:", logErr);
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  cookieStore.delete(COOKIE_NAME);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function switchDemoRole(role: RoleType, customNik?: string) {
  let nik = customNik || ODOO_CONFIG.devSuperadminNik; // Default Admin NIK: 1.1025.273
  if (!customNik) {
    if (role === "HEAD_DEPT") nik = "10010"; // Gunawan Prasetya (Manager Logistik GAM)
    if (role === "PENILAI") nik = "20101"; // Noviana Ramadhani (SPV Logistik GAM)
    if (role === "KARYAWAN") nik = "80002"; // Zendaya (Staff Logistik GAM)
  }

  return await loginWithNik(nik);
}

/**
 * Server Action: Mengubah kata sandi mandiri oleh pengguna yang sedang login
 */
export async function changeUserPasswordAction(newPassword: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Sesi Anda telah kedaluwarsa. Silakan login kembali." };
  }

  const cleanPass = (newPassword || "").trim();
  if (!cleanPass || cleanPass.length < 4) {
    return { success: false, error: "Kata sandi baru minimal harus 4 karakter." };
  }

  try {
    // 1. Update tabel users
    const [userRec] = await db.select().from(users).where(eq(users.nik, currentUser.nik));
    if (userRec) {
      await db
        .update(users)
        .set({
          password: cleanPass,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRec.id));
    } else {
      await db.insert(users).values({
        employeeId: currentUser.id,
        nik: currentUser.nik,
        password: cleanPass,
        mustChangePassword: false,
      });
    }

    // 2. Update tabel employees
    await db
      .update(employees)
      .set({ password: cleanPass })
      .where(eq(employees.id, currentUser.id));

    // 3. Update cookie session dengan mustChangePassword = false
    const updatedSession: UserSession = {
      ...currentUser,
      mustChangePassword: false,
    };
    const token = signJwt(updatedSession as unknown as Record<string, unknown>);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    revalidatePath("/", "layout");
    return { success: true, message: "Kata sandi Anda berhasil diperbarui!" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui kata sandi";
    return { success: false, error: msg };
  }
}

/**
 * Server Action: Reset kata sandi karyawan ke default NIK oleh HR / Admin
 */
export async function resetEmployeePasswordAction(employeeId: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return { success: false, error: "Hanya Admin yang berwenang mereset kata sandi karyawan." };
  }

  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) {
    return { success: false, error: "Data karyawan tidak ditemukan." };
  }

  const defaultPassword = emp.nik;

  try {
    // 1. Update tabel employees
    await db
      .update(employees)
      .set({ password: defaultPassword })
      .where(eq(employees.id, emp.id));

    // 2. Update atau insert tabel users dengan mustChangePassword = true
    const [userRec] = await db.select().from(users).where(eq(users.nik, emp.nik));
    if (userRec) {
      await db
        .update(users)
        .set({
          password: defaultPassword,
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRec.id));
    } else {
      await db.insert(users).values({
        employeeId: emp.id,
        nik: emp.nik,
        password: defaultPassword,
        mustChangePassword: true,
      });
    }

    // Catat riwayat reset password ke audit_logs
    try {
      await db.insert(auditLogs).values({
        entity: "auth",
        entityId: emp.id,
        action: "RESET_PASSWORD",
        actor: "Admin",
        changes: {
          nik: emp.nik,
          name: emp.name,
          message: `Kata sandi akun direset ke default (NIK: ${emp.nik}) oleh Admin`,
        },
      });
    } catch (logErr) {
      console.error("Gagal mencatat audit log reset password:", logErr);
    }

    revalidatePath("/setup", "page");
    return {
      success: true,
      message: `Kata sandi ${emp.name} (NIK: ${emp.nik}) berhasil direset ke NIK default. Karyawan wajib mengubah kata sandi baru pada login berikutnya.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal mereset kata sandi";
    return { success: false, error: msg };
  }
}

export interface UserProfileDetail extends UserSession {
  jobLevelName?: string;
  dateOfHire?: string;
  polaPenggajian?: string;
  appraiserName?: string;
  appraiserPosition?: string;
  headDeptName?: string;
  headDeptPosition?: string;
  managerName?: string;
  managerPosition?: string;
}

/**
 * Server Action: Mengambil informasi lengkap profil employee user yang sedang login
 * untuk ditampilkan pada popup profile di pojok kanan atas.
 */
export async function getCurrentUserProfileDetailAction(): Promise<UserProfileDetail | null> {
  const session = await getCurrentUser();
  if (!session) return null;

  try {
    const [emp] = await db
      .select({
        emp: employees,
        dept: departments,
        lvl: jobLevels,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
      .where(eq(employees.id, session.id))
      .limit(1);

    if (!emp) return session;

    const approvalLine = await getEmployeeApprovalLine(session.id);

    return {
      ...session,
      name: emp.emp.name || session.name,
      nik: emp.emp.nik || session.nik,
      departmentName: emp.dept?.name || session.departmentName || "-",
      jobPosition: emp.emp.jobPosition || session.jobPosition || "-",
      operatingUnit: emp.emp.operatingUnit || session.operatingUnit || "HO",
      jobLevelName: emp.lvl?.name || "-",
      dateOfHire: emp.emp.dateOfHire || undefined,
      polaPenggajian: emp.emp.polaPenggajian || undefined,
      appraiserName: approvalLine?.appraiser?.name,
      appraiserPosition: approvalLine?.appraiser?.jobPosition,
      headDeptName: approvalLine?.headDept?.name,
      headDeptPosition: approvalLine?.headDept?.jobPosition,
      managerName: approvalLine?.manager?.name,
      managerPosition: approvalLine?.manager?.jobPosition,
    };
  } catch (err) {
    console.error("Gagal load profile detail:", err);
    return session;
  }
}
