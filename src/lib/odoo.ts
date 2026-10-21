import crypto from "crypto";
import { db } from "@/db";
import { employees, departments, jobLevels, jobPositions, departmentMappings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const ODOO_CONFIG = {
  authMode: process.env.AUTH_MODE || "odoo",
  baseUrl: (process.env.ODOO_BASE_URL || "").replace(/\/+$/, ""),
  apiVersion: process.env.ODOO_API_VERSION || "v1",
  adminUser: process.env.ODOO_ADMIN_USER || "",
  adminPassword: process.env.ODOO_ADMIN_PASSWORD || "",
  serviceNik: process.env.ODOO_SERVICE_NIK || "",
  servicePassword: process.env.ODOO_SERVICE_PASSWORD || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  devSuperadminNik: process.env.DEV_SUPERADMIN_NIK || "",
};

export interface OdooEmployeeProfile {
  nik: string;
  name: string;
  jobPosition?: string;
  departmentName?: string;
  operatingUnit?: string;
  workEmail?: string;
  arrivalDate?: string;
  isActive?: boolean;
  isAdmin?: boolean;
}

/**
 * Buat JSON Web Token (JWT) standar HS256 menggunakan modul bawaan Node.js Crypto
 */
export function signJwt(payload: Record<string, unknown>): string {
  // Hitung durasi expired (misal "8h" -> 8 * 3600 detik)
  let expSeconds = 8 * 3600;
  if (ODOO_CONFIG.jwtExpiresIn.endsWith("h")) {
    expSeconds = parseInt(ODOO_CONFIG.jwtExpiresIn, 10) * 3600;
  } else if (ODOO_CONFIG.jwtExpiresIn.endsWith("d")) {
    expSeconds = parseInt(ODOO_CONFIG.jwtExpiresIn, 10) * 86400;
  } else if (ODOO_CONFIG.jwtExpiresIn.endsWith("m")) {
    expSeconds = parseInt(ODOO_CONFIG.jwtExpiresIn, 10) * 60;
  }

  const exp = Math.floor(Date.now() / 1000) + expSeconds;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ODOO_CONFIG.jwtSecret)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

/**
 * Verifikasi dan decode JSON Web Token (JWT)
 */
export function verifyJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", ODOO_CONFIG.jwtSecret)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Token kedaluwarsa
    }

    return payload;
  } catch {
    return null;
  }
}

let cachedAdminToken: { token: string; expiresAt: number } | null = null;

/**
 * Autentikasi kredensial karyawan langsung ke API Odoo (auth/employee-login).
 * STRICT: Jika password salah atau gagal, fungsi ini WAJIB mengembalikan null.
 * DILARANG menggunakan service account admin untuk membobol validasi password!
 */
export async function authenticateOdooEmployee(
  nik: string,
  passwordInput: string
): Promise<OdooEmployeeProfile | null> {
  const cleanNik = (nik || "").trim();
  const cleanPassword = (passwordInput || "").trim();
  if (!cleanNik || !cleanPassword) return null;

  try {
    const loginUrl = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/auth/employee-login`;
    const res = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        nik: cleanNik,
        password: cleanPassword,
        ttl_hours: "24",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.success || !json.data?.token) {
      // Password salah atau NIK tidak terdaftar di Odoo
      return null;
    }

    const token = json.data.token as string;

    // Cek profile 'me' untuk mengetahui flag is_admin/is_super_admin
    let isAdmin = cleanNik === ODOO_CONFIG.devSuperadminNik;
    try {
      const meRes = await fetch(`${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });
      const meJson = await meRes.json().catch(() => null);
      if (meJson?.data?.is_admin || meJson?.data?.is_super_admin) {
        isAdmin = true;
      }
    } catch {
      // ignore
    }

    // Ambil data detail karyawan dari /employee?f_nik= menggunakan token login milik karyawan
    try {
      const empRes = await fetch(
        `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/employee?f_nik=${encodeURIComponent(cleanNik)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3500),
        }
      );
      const empJson = await empRes.json().catch(() => null);
      if (empJson?.data?.[0]) {
        const prof = mapOdooDataToProfile(empJson.data[0], cleanNik);
        prof.isAdmin = isAdmin;
        return prof;
      }
    } catch {
      // ignore
    }

    return {
      nik: cleanNik,
      name: String(json.data.name || "Karyawan Odoo"),
      operatingUnit: String(json.data.operating_unit || "HO"),
      jobPosition: "Staff",
      departmentName: "General",
      isActive: true,
      isAdmin,
    };
  } catch (err) {
    console.error("Gagal autentikasi ke Odoo:", err);
    return null;
  }
}

/**
 * Mencari data karyawan dari Odoo berdasarkan NIK menggunakan Service Token (Khusus Sync Admin).
 * Fungsi ini BUKAN untuk autentikasi login user!
 */
export async function lookupOdooEmployeeByNik(nik: string): Promise<OdooEmployeeProfile | null> {
  const cleanNik = (nik || "").trim();
  if (!cleanNik) return null;

  try {
    const serviceToken = await getOdooAdminToken();
    const lookupUrl = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/employee?f_nik=${encodeURIComponent(cleanNik)}`;
    const res = await fetch(lookupUrl, {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    const json = await res.json().catch(() => null);
    if (res.ok && json && json.success && Array.isArray(json.data) && json.data.length > 0) {
      const prof = mapOdooDataToProfile(json.data[0], cleanNik);
      if (cleanNik === ODOO_CONFIG.devSuperadminNik) {
        prof.isAdmin = true;
      }
      return prof;
    }
  } catch (err) {
    console.error("Gagal fetch employee dari Odoo:", err);
  }

  return null;
}

/**
 * Mengambil data karyawan dari API Odoo ERP berdasarkan NIK.
 */
export async function fetchEmployeeFromOdoo(
  nik: string,
  passwordInput?: string
): Promise<OdooEmployeeProfile | null> {
  if (passwordInput && passwordInput.trim()) {
    return authenticateOdooEmployee(nik, passwordInput);
  }
  return lookupOdooEmployeeByNik(nik);
}

/**
 * Mendapatkan estimasi tanggal mulai kerja (hire date) dari struktur NIK: XX.MMYY.ZZZZ
 * Contoh:
 * - 82.0924.4626 -> 2024-09-01 (Bulan 09, Tahun 2024)
 * - 15.0525.645  -> 2025-05-01 (Bulan 05, Tahun 2025)
 * - 1.1025.273   -> 2025-10-01 (Bulan 10, Tahun 2025)
 */
export function deriveHireDateFromNik(nik: string): string | null {
  if (!nik) return null;
  const match = nik.trim().match(/^\d+\.(\d{2})(\d{2})\.\d+$/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const year2Digits = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  const fullYear = 2000 + year2Digits;
  const mm = String(month).padStart(2, "0");
  return `${fullYear}-${mm}-01`;
}

function mapOdooDataToProfile(raw: Record<string, unknown>, fallbackNik: string): OdooEmployeeProfile {
  const nik = String(raw.nik || raw.badge_id || raw.identification_id || fallbackNik);
  const name = String(raw.name || raw.display_name || "Karyawan Odoo");

  let deptName = "General";
  if (Array.isArray(raw.department_id) && raw.department_id.length > 1) {
    deptName = String(raw.department_id[1]);
  } else if (raw.department_id && typeof raw.department_id === "object" && "name" in (raw.department_id as any)) {
    deptName = String((raw.department_id as any).name);
  } else if (typeof raw.department === "string") {
    deptName = raw.department;
  }

  let jobPosition = "Staff";
  if (Array.isArray(raw.job_id) && raw.job_id.length > 1) {
    jobPosition = String(raw.job_id[1]);
  } else if (raw.job_id && typeof raw.job_id === "object" && "name" in (raw.job_id as any)) {
    jobPosition = String((raw.job_id as any).name);
  } else if (typeof raw.job_position === "string") {
    jobPosition = raw.job_position;
  } else if (typeof raw.job_title === "string") {
    jobPosition = raw.job_title;
  }

  let operatingUnit = "HO";
  let ouStr = "";
  if (Array.isArray(raw.operating_unit) && raw.operating_unit.length > 1) {
    ouStr = String(raw.operating_unit[1]).toUpperCase();
  } else if (raw.operating_unit && typeof raw.operating_unit === "object" && "name" in (raw.operating_unit as any)) {
    ouStr = String((raw.operating_unit as any).name).toUpperCase();
  } else if (typeof raw.operating_unit === "string") {
    ouStr = raw.operating_unit.toUpperCase();
  }

  if (ouStr.includes("GAM")) operatingUnit = "GAM";
  else if (ouStr.includes("AKP")) operatingUnit = "AKP";
  else operatingUnit = "HO";

  const rawArrival =
    raw.hired_date ||
    raw.date_of_hire ||
    raw.arrival_date ||
    raw.fal_arrival_date ||
    raw.date_arrival ||
    raw.fal_date_arrival ||
    raw.fal_date_of_hire ||
    raw.start_date ||
    raw.join_date;

  const arrivalDate = typeof rawArrival === "string" && rawArrival.trim()
    ? rawArrival.trim().slice(0, 10)
    : undefined;

  return {
    nik,
    name,
    jobPosition,
    departmentName: deptName,
    operatingUnit,
    workEmail: typeof raw.work_email === "string" ? raw.work_email : undefined,
    arrivalDate,
    isActive: raw.active !== false,
    isAdmin: nik === ODOO_CONFIG.devSuperadminNik,
  };
}

/**
 * Menentukan Job Level dan Role secara akurat berdasarkan nama posisi pekerjaan (real data, bukan dummy/default)
 */
export function resolveJobLevelAndRole(
  jobPositionName: string,
  allLevels: Array<{ id: number; code: string; name: string; rank: number }>
): { levelId: number; role: "ADMIN" | "HEAD_DEPT" | "PENILAI" | "KARYAWAN" } {
  const posLower = (jobPositionName || "").toLowerCase().trim();

  const nonStaffLevel = allLevels.find((l) => l.code === "NON_STAFF" || l.rank === 0);
  const staffLevel = allLevels.find((l) => l.code === "STAFF" || l.rank === 1) || allLevels[0];
  const spvLevel = allLevels.find((l) => l.code === "SPV" || l.rank === 2) || staffLevel;
  const suptLevel = allLevels.find((l) => l.code === "SUPT" || l.rank === 3) || spvLevel;
  const mgrLevel = allLevels.find((l) => l.code === "MGR" || l.rank === 4) || suptLevel;

  if (
    posLower.includes("manager") ||
    posLower.includes("direktur") ||
    posLower.includes("director") ||
    posLower.includes("gm") ||
    posLower.includes("general manager")
  ) {
    return { levelId: mgrLevel?.id || 1, role: "HEAD_DEPT" };
  }

  if (
    posLower.includes("superintendent") ||
    posLower.includes("head") ||
    posLower.includes("kabag") ||
    posLower.includes("kepala bagian") ||
    posLower.includes("dept head") ||
    posLower.includes("department head")
  ) {
    return { levelId: suptLevel?.id || 1, role: "HEAD_DEPT" };
  }

  if (
    posLower.includes("supervisor") ||
    posLower.includes("spv") ||
    posLower.includes("foreman") ||
    posLower.includes("koordinator") ||
    posLower.includes("coordinator") ||
    posLower.includes("team leader") ||
    posLower.includes("leader")
  ) {
    return { levelId: spvLevel?.id || 1, role: "PENILAI" };
  }

  // Non Staff: operator, driver, mekanik, helper, welder, tyreman, cleaner, security, satpam, ojt
  if (
    nonStaffLevel &&
    (posLower.includes("non staff") ||
      posLower.includes("non-staff") ||
      posLower.includes("nonstaff") ||
      posLower.includes("operator") ||
      posLower.includes("driver") ||
      posLower.includes("mekanik") ||
      posLower.includes("mechanic") ||
      posLower.includes("helper") ||
      posLower.includes("welder") ||
      posLower.includes("tyreman") ||
      posLower.includes("cleaner") ||
      posLower.includes("security") ||
      posLower.includes("satpam") ||
      posLower.includes("ojt"))
  ) {
    return { levelId: nonStaffLevel.id, role: "KARYAWAN" };
  }

  // Default: Staff
  return { levelId: staffLevel?.id || 1, role: "KARYAWAN" };
}

/**
 * Mencocokkan nama / kode departemen secara dinamis ke master tabel departments lokal
 */
export function matchDepartment(
  rawInput: { code?: string; name?: string } | string,
  allDepts: Array<{ id: number; code: string; name: string }>
): { id: number; code: string; name: string } | null {
  if (!allDepts || allDepts.length === 0) return null;

  const codeStr = typeof rawInput === "string" ? "" : (rawInput.code || "").trim().toUpperCase();
  const nameStr = typeof rawInput === "string" ? rawInput.trim() : (rawInput.name || "").trim();
  const nameLower = nameStr.toLowerCase();
  const cleanCode = codeStr.replace(/[^A-Z0-9]/g, "");
  const cleanName = nameLower.replace(/[^a-z0-9]/g, "");

  // 1. Direct code match (e.g. "ACC", "HRD", "IT", "D06")
  if (codeStr) {
    const byCode = allDepts.find(
      (d) =>
        d.code.toUpperCase() === codeStr ||
        (cleanCode && d.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanCode)
    );
    if (byCode) return byCode;
  }

  // 2. Direct exact name match
  if (nameStr) {
    const byName = allDepts.find(
      (d) =>
        d.name.toLowerCase() === nameLower ||
        (cleanName && d.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanName)
    );
    if (byName) return byName;
  }

  // 3. Dynamic contains match pada nama atau kode
  if (cleanName && cleanName.length >= 3) {
    const containsMatch = allDepts.find((d) => {
      const dClean = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return dClean.includes(cleanName) || cleanName.includes(dClean);
    });
    if (containsMatch) return containsMatch;
  }

  return null;
}

/**
 * Sinkronisasi profil karyawan Odoo ke database lokal PostgreSQL jika belum ada
 */
export async function syncOdooEmployeeToDb(profile: OdooEmployeeProfile) {
  try {
    // Cari apakah sudah ada di tabel employees
    const [existing] = await db
      .select()
      .from(employees)
      .where(eq(employees.nik, profile.nik));

    if (existing) {
      if (profile.arrivalDate && profile.arrivalDate !== existing.dateOfHire) {
        await db.update(employees).set({ dateOfHire: profile.arrivalDate }).where(eq(employees.id, existing.id));
      }
      return existing;
    }

    // Ambil atau cocokkan departemen
    const allDepts = await db.select().from(departments);
    let deptId = allDepts[0]?.id || 1;

    if (profile.departmentName) {
      // 1. Cek query mapping pada tabel department_mappings
      const cleanDept = profile.departmentName.trim().replace(/\s+/g, " ").toUpperCase();
      const [dbMapping] = await db
        .select()
        .from(departmentMappings)
        .where(eq(departmentMappings.cleanRawName, cleanDept));

      if (dbMapping && dbMapping.departmentId) {
        deptId = dbMapping.departmentId;
      } else {
        // 2. Fallback pencocokan dinamis ke master departemen yang ada di DB
        const matchedDept = matchDepartment(profile.departmentName, allDepts);
        if (matchedDept) {
          deptId = matchedDept.id;
        } else if (allDepts.length === 0) {
          const [newDept] = await db
            .insert(departments)
            .values({
              code: (profile.departmentName || "GEN").slice(0, 4).toUpperCase(),
              name: profile.departmentName || "General",
            })
            .returning();
          deptId = newDept.id;
        }
      }
    }

    // Pastikan Job Levels standard tersedia
    let allLevels = await db.select().from(jobLevels);
    if (allLevels.length < 5) {
      const standardLevels = [
        { code: "NON_STAFF", name: "Non Staff", rank: 0 },
        { code: "STAFF", name: "Staff", rank: 1 },
        { code: "SPV", name: "Supervisor", rank: 2 },
        { code: "SUPT", name: "Superintendent", rank: 3 },
        { code: "MGR", name: "Manager", rank: 4 },
      ];
      for (const std of standardLevels) {
        if (!allLevels.some((l) => l.code === std.code || l.rank === std.rank)) {
          await db.insert(jobLevels).values(std);
        }
      }
      allLevels = await db.select().from(jobLevels);
    }

    // Tentukan Level & Role secara akurat berdasarkan posisi
    const { levelId, role: detectedRole } = resolveJobLevelAndRole(profile.jobPosition || "Staff", allLevels);

    // Tentukan role akhir: prioritas pada Superadmin
    const isSuperadmin = profile.nik === ODOO_CONFIG.devSuperadminNik || profile.isAdmin === true;
    const role = isSuperadmin ? "ADMIN" : detectedRole;

    // Ambil atau buat Job Position master
    const posName = (profile.jobPosition || "Staff").trim();
    let posId: number | null = null;
    const allPositions = await db.select().from(jobPositions);
    const matchedPos = allPositions.find(
      (p) => p.name.toLowerCase() === posName.toLowerCase() && p.departmentId === deptId
    ) || allPositions.find((p) => p.name.toLowerCase() === posName.toLowerCase());

    if (matchedPos) {
      posId = matchedPos.id;
    } else {
      const [newPos] = await db
        .insert(jobPositions)
        .values({
          name: posName,
          departmentId: deptId,
          jobLevelId: levelId,
          isActive: true,
          updatedAt: new Date(),
        })
        .returning();
      posId = newPos.id;
    }

    const [inserted] = await db
      .insert(employees)
      .values({
        nik: profile.nik,
        name: profile.name,
        departmentId: deptId,
        jobLevelId: levelId,
        jobPositionId: posId,
        jobPosition: posName,
        operatingUnit: profile.operatingUnit || "HO",
        role,
        password: profile.nik, // Default password adalah NIK
        isActive: profile.isActive ?? true,
        dateOfHire: profile.arrivalDate || null,
      })
      .returning();

    return inserted;
  } catch (err) {
    console.error("Error syncing Odoo employee to local DB:", err);
    return null;
  }
}

/**
 * Mendapatkan Bearer Access Token dari Odoo 10 Live API
 */
export async function getOdooAdminToken(customUser?: string, customPass?: string): Promise<string> {
  if (!customUser && !customPass && cachedAdminToken && Date.now() < cachedAdminToken.expiresAt - 300000) {
    return cachedAdminToken.token;
  }

  // 1. Coba employee-login terlebih dahulu menggunakan service account
  const serviceNik = customUser || ODOO_CONFIG.serviceNik;
  const servicePass = customPass || ODOO_CONFIG.servicePassword;

  try {
    const empLoginUrl = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/auth/employee-login`;
    const resEmp = await fetch(empLoginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        nik: serviceNik,
        password: servicePass,
        ttl_hours: "24",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    const jsonEmp = await resEmp.json().catch(() => null);
    if (resEmp.ok && jsonEmp && jsonEmp.success && jsonEmp.data?.token) {
      const token = jsonEmp.data.token as string;
      cachedAdminToken = {
        token,
        expiresAt: Date.now() + 23 * 3600 * 1000,
      };
      return token;
    }
  } catch (err) {
    console.warn("Gagal employee-login service Odoo:", err);
  }

  // 2. Fallback: coba auth/login standar
  const username = customUser || ODOO_CONFIG.adminUser;
  const password = customPass || ODOO_CONFIG.adminPassword;

  const url = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/auth/login`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username,
      password,
      ttl_hours: "24",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.success || !json.data?.token) {
    const errorMsg = json?.message || json?.code || `Status HTTP ${res.status}`;
    throw new Error(`Gagal otentikasi admin ke Odoo (${ODOO_CONFIG.baseUrl}): ${errorMsg}`);
  }

  const token = json.data.token as string;
  cachedAdminToken = {
    token,
    expiresAt: Date.now() + 23 * 3600 * 1000,
  };
  return token;
}

/**
 * Menarik daftar departemen dari Odoo 10 Live API
 */
export async function fetchOdooDepartments(token: string): Promise<Array<Record<string, unknown>>> {
  const url = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/hr-department`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.success) {
    const msg = json?.message || `Gagal mengambil departemen dari Odoo (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Menarik daftar karyawan dari Odoo 10 Live API dengan pagination batch
 */
export async function fetchOdooEmployees(token: string, limit = 5000): Promise<Array<Record<string, unknown>>> {
  const allEmployees: Array<Record<string, unknown>> = [];
  const batchSize = 500;
  let offset = 0;

  while (allEmployees.length < limit) {
    const fetchLimit = Math.min(batchSize, limit - allEmployees.length);
    const url = `${ODOO_CONFIG.baseUrl}/api/${ODOO_CONFIG.apiVersion}/employee?limit=${fetchLimit}&offset=${offset}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.success) {
      break;
    }

    const batch = Array.isArray(json.data) ? json.data : [];
    if (batch.length === 0) break;

    allEmployees.push(...batch);
    offset += batch.length;

    // Jika sudah mencapai total record dari meta
    if (json.meta && typeof json.meta.total === "number" && offset >= json.meta.total) {
      break;
    }
  }

  return allEmployees;
}

/**
 * Menjalankan sinkronisasi massal seluruh Departemen dan Karyawan dari Odoo ke DB Lokal
 */
export async function syncAllFromOdoo(customUser?: string, customPass?: string) {
  const token = await getOdooAdminToken(customUser, customPass);

  // Ambil mapping departemen aktif dari DB untuk referensi sinkronisasi
  const dbMappings = await db.select().from(departmentMappings);
  const mappingMap = new Map(
    dbMappings
      .filter((m) => m.departmentId)
      .map((m) => [m.cleanRawName, m.departmentId!])
  );

  // 1. Sync Departemen
  const odooDepts = await fetchOdooDepartments(token);
  let syncedDeptCount = 0;
  const currentDepts = await db.select().from(departments);

  for (const od of odooDepts) {
    const name = String(od.name || "").trim();
    const code = String(od.code || "").trim();
    if (!name && !code) continue;

    // Jika sudah ada di mapping DB, lewati pembuatan master baru
    const cleanOdooName = name.trim().replace(/\s+/g, " ").toUpperCase();
    if (mappingMap.has(cleanOdooName)) continue;

    const matched = matchDepartment({ code, name }, currentDepts);
    if (!matched) {
      const baseCode = String(code || od.complete_name || name.slice(0, 4))
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .slice(0, 10);

      const [codeTaken] = await db.select().from(departments).where(eq(departments.code, baseCode));
      const finalCode = codeTaken ? `${baseCode.slice(0, 6)}_${Math.floor(Math.random() * 899 + 100)}` : baseCode;

      const [newDept] = await db.insert(departments).values({
        code: finalCode,
        name,
      }).returning();
      currentDepts.push(newDept);
      syncedDeptCount++;
    }
  }

  // 2. Refresh cache job levels lokal
  let currentLevels = await db.select().from(jobLevels);
  if (currentLevels.length < 5) {
    const standardLevels = [
      { code: "NON_STAFF", name: "Non Staff", rank: 0 },
      { code: "STAFF", name: "Staff", rank: 1 },
      { code: "SPV", name: "Supervisor", rank: 2 },
      { code: "SUPT", name: "Superintendent", rank: 3 },
      { code: "MGR", name: "Manager", rank: 4 },
    ];
    for (const std of standardLevels) {
      if (!currentLevels.some((l) => l.code === std.code || l.rank === std.rank)) {
        await db.insert(jobLevels).values(std);
      }
    }
    currentLevels = await db.select().from(jobLevels);
  }

  // 3. Sync Karyawan
  const odooEmployees = await fetchOdooEmployees(token, 5000);
  let syncedEmpCount = 0;
  let newEmpCount = 0;
  let updatedEmpCount = 0;

  for (const oe of odooEmployees) {
    const rawNik = oe.nik || oe.badge_id || oe.identification_id || oe.barcode;
    const nik = String(rawNik || "").trim();
    const name = String(oe.name || oe.display_name || "").trim();
    if (!nik || !name) continue;

    // Cari departemen yang cocok
    let deptName = "";
    if (Array.isArray(oe.department_id) && oe.department_id.length > 1) {
      deptName = String(oe.department_id[1]).trim();
    } else if (oe.department_id && typeof oe.department_id === "object" && "name" in (oe.department_id as any)) {
      deptName = String((oe.department_id as any).name).trim();
    } else if (typeof oe.department === "string") {
      deptName = oe.department.trim();
    }

    let deptId = currentDepts[0]?.id || 1;
    if (deptName) {
      const cleanDept = deptName.trim().replace(/\s+/g, " ").toUpperCase();
      const mappedId = mappingMap.get(cleanDept);
      if (mappedId) {
        deptId = mappedId;
      } else {
        const matched = matchDepartment(deptName, currentDepts);
        if (matched) deptId = matched.id;
      }
    }

    // Job position & Operating unit
    let jobPosition = "Staff";
    if (Array.isArray(oe.job_id) && oe.job_id.length > 1) {
      jobPosition = String(oe.job_id[1]).trim();
    } else if (oe.job_id && typeof oe.job_id === "object" && "name" in (oe.job_id as any)) {
      jobPosition = String((oe.job_id as any).name).trim();
    } else if (oe.job_position || oe.job_title) {
      jobPosition = String(oe.job_position || oe.job_title).trim();
    }

    let operatingUnit = "HO";
    let ouStr = "";
    if (Array.isArray(oe.operating_unit) && oe.operating_unit.length > 1) {
      ouStr = String(oe.operating_unit[1]).toUpperCase();
    } else if (oe.operating_unit && typeof oe.operating_unit === "object" && "name" in (oe.operating_unit as any)) {
      ouStr = String((oe.operating_unit as any).name).toUpperCase();
    } else if (typeof oe.operating_unit === "string") {
      ouStr = oe.operating_unit.toUpperCase();
    }
    if (ouStr.includes("GAM")) operatingUnit = "GAM";
    else if (ouStr.includes("AKP")) operatingUnit = "AKP";
    else operatingUnit = "HO";

    // Tentukan Level & Role secara akurat berdasarkan posisi jabatan riil
    const { levelId, role: detectedRole } = resolveJobLevelAndRole(jobPosition, currentLevels);
    const isSuperadmin = nik === ODOO_CONFIG.devSuperadminNik;
    const role = isSuperadmin ? "ADMIN" : detectedRole;

    const rawArrivalDate =
      oe.hired_date ||
      oe.date_of_hire ||
      oe.arrival_date ||
      oe.fal_arrival_date ||
      oe.date_arrival ||
      oe.fal_date_arrival ||
      oe.fal_date_of_hire ||
      oe.start_date ||
      oe.join_date;

    const arrivalDate =
      typeof rawArrivalDate === "string" &&
      rawArrivalDate.trim() &&
      rawArrivalDate.trim() !== "false" &&
      rawArrivalDate.trim() !== "null" &&
      rawArrivalDate.trim() !== "0000-00-00" &&
      !isNaN(new Date(rawArrivalDate.trim()).getTime())
        ? rawArrivalDate.trim().slice(0, 10)
        : null;

    const [existingEmp] = await db.select().from(employees).where(eq(employees.nik, nik));

    if (existingEmp) {
      const updateData: Record<string, unknown> = {
        name,
        departmentId: deptId,
        jobPosition,
        jobLevelId: levelId,
        operatingUnit,
        role: isSuperadmin ? "ADMIN" : (existingEmp.role === "ADMIN" ? "ADMIN" : detectedRole),
        isActive: oe.active !== false,
      };
      if (arrivalDate && existingEmp.dateOfHire !== arrivalDate) {
        updateData.dateOfHire = arrivalDate;
      }
      await db
        .update(employees)
        .set(updateData)
        .where(eq(employees.id, existingEmp.id));
      updatedEmpCount++;
    } else {
      await db.insert(employees).values({
        nik,
        name,
        departmentId: deptId,
        jobLevelId: levelId,
        jobPosition,
        operatingUnit,
        role,
        password: nik, // Default password adalah NIK
        isActive: oe.active !== false,
        dateOfHire: arrivalDate || null,
      });
      newEmpCount++;
    }

    syncedEmpCount++;
  }

  return {
    success: true,
    count: {
      departmentsSynced: syncedDeptCount,
      totalOdooEmployees: odooEmployees.length,
      employeesSynced: syncedEmpCount,
      newEmployees: newEmpCount,
      updatedEmployees: updatedEmpCount,
    },
  };
}
