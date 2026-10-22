import { getCurrentUser, type UserSession, type RoleType } from "@/lib/auth";

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * Memastikan pengguna memiliki sesi aktif yang terverifikasi.
 * Melempar AuthError (401) jika sesi tidak ditemukan atau tidak valid.
 */
export async function requireAuth(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Sesi login Anda tidak valid atau telah kedaluwarsa. Silakan masuk kembali.", 401);
  }
  return user;
}

/**
 * Memastikan pengguna memiliki salah satu role yang diizinkan.
 * Melempar AuthError (403) jika role tidak memenuhi syarat.
 */
export async function requireRole(allowedRoles: RoleType[]): Promise<UserSession> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError("Akses ditolak: Anda tidak memiliki wewenang untuk tindakan ini.", 403);
  }
  return user;
}

/**
 * Shortcut untuk otorisasi khusus Administrator.
 */
export async function requireAdmin(): Promise<UserSession> {
  return requireRole(["ADMIN"]);
}

/**
 * Shortcut untuk otorisasi Administrator atau HR.
 */
export async function requireAdminOrHr(): Promise<UserSession> {
  return requireRole(["ADMIN", "HR"]);
}
