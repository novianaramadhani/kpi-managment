"use server";

import { db } from "@/db";
import {
  systemConfig,
  departments,
  jobLevels,
  employees,
  kpiPeriods,
  kpiTemplates,
  kpiCategories,
  kpiParameters,
  kpiBands,
  masterParameters,
  appraisals,
  appraisalItems,
  auditLogs,
  jobLevelPermissions,
  jobPositions,
  kpiAssessorAssignments,
  users,
  kpiCalculationRules,
  departmentHeads,
  jobLevelParameterWeights,
  departmentMappings,
  sites,
  jobPositionSequences,
  pits,
} from "@/db/schema";
import { and, eq, inArray, or, ilike, isNull, sql, asc, desc, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scoreItem, tenureMonths, type ItemInput } from "./scoring";
import { recalculateAppraisal as recalculateAppraisalUnified } from "./monthly-assessment-service";
import { seedDemoData } from "@/db/seed-data";
import { syncAllFromOdoo, ODOO_CONFIG } from "@/lib/odoo";
import { matchesSite, matchesDeptName } from "./department-mapping-utils";
import { parseConditionString } from "./excel-template-kpi";

const s = (fd: FormData, k: string) => (fd.get(k)?.toString().trim() ?? "");
const n = (fd: FormData, k: string): number | null => {
  const v = s(fd, k);
  if (v === "") return null;
  const x = Number(v.replace(/,/g, ""));
  return Number.isNaN(x) ? null : x;
};
const i = (fd: FormData, k: string) => Number(s(fd, k)) || 0;

async function audit(entity: string, entityId: number | null, action: string, changes?: unknown, actor = "admin", client: any = db) {
  await client.insert(auditLogs).values({ entity, entityId, action, changes: changes ?? null, actor });
}

function safeRevalidate(path: string, type?: "page" | "layout") {
  try {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  } catch {
    // Safe when called outside Next.js request context
  }
}

function revalidateAll() {
  safeRevalidate("/dashboard", "page");
  safeRevalidate("/report", "page");
  safeRevalidate("/input-kpi", "page");
  safeRevalidate("/setup", "page");
  safeRevalidate("/setup/templates", "page");
  safeRevalidate("/review", "page");
}

// ---------- SYSTEM CONFIG ----------
export async function getConfig(key: string, fallback: string) {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  return row?.value ?? fallback;
}

export async function getSystemDate(): Promise<string> {
  const v = await getConfig("system_clock_date", "");
  return v || new Date().toISOString().slice(0, 10);
}

export async function updateConfig(fd: FormData) {
  const key = s(fd, "key");
  const value = s(fd, "value");
  await db
    .insert(systemConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
  await audit("system_config", null, "UPDATE", { key, value });
  revalidateAll();
}

// ---------- MASTER ----------
export async function createDepartment(fd: FormData) {
  const code = s(fd, "code").toUpperCase();
  const name = s(fd, "name");

  const [row] = await db.insert(departments).values({
    code,
    name,
  }).returning();

  await audit("departments", row?.id ?? null, "CREATE", { code, name });
  revalidateAll();
}

export async function updateDepartment(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID Departemen wajib ada untuk update.");
  const code = s(fd, "code").toUpperCase();
  const name = s(fd, "name");

  await db.update(departments).set({
    code,
    name,
  }).where(eq(departments.id, id));

  await audit("departments", id, "UPDATE", { code, name });
  revalidateAll();
}

async function cleanupDepartmentRelations(departmentId: number) {
  const [empCheck] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(eq(employees.departmentId, departmentId));

  if (Number(empCheck?.count || 0) > 0) {
    throw new Error(
      `Tidak dapat menghapus departemen karena masih memiliki ${empCheck.count} karyawan terdaftar.`
    );
  }

  const [tplCheck] = await db
    .select({ count: sql<number>`count(*)` })
    .from(kpiTemplates)
    .where(eq(kpiTemplates.departmentId, departmentId));

  if (Number(tplCheck?.count || 0) > 0) {
    throw new Error(
      `Tidak dapat menghapus departemen karena masih terikat dengan ${tplCheck.count} template KPI.`
    );
  }

  await db
    .delete(departmentMappings)
    .where(eq(departmentMappings.departmentId, departmentId));

  await db
    .delete(jobPositions)
    .where(eq(jobPositions.departmentId, departmentId));

  await db
    .delete(departmentHeads)
    .where(eq(departmentHeads.departmentId, departmentId));

  await db
    .update(masterParameters)
    .set({ departmentId: null })
    .where(eq(masterParameters.departmentId, departmentId));

  await db
    .delete(jobLevelParameterWeights)
    .where(eq(jobLevelParameterWeights.departmentId, departmentId));

  await db.delete(departments).where(eq(departments.id, departmentId));
}

export async function deleteDepartment(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID departemen tidak valid.");

  await cleanupDepartmentRelations(id);
  await audit("departments", id, "DELETE", null);
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function batchDeleteDepartmentsAction(
  ids: number[]
): Promise<{ count: number; skipped: number; errors: string[] }> {
  if (!ids || ids.length === 0) return { count: 0, skipped: 0, errors: [] };

  let count = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      await cleanupDepartmentRelations(id);
      await audit("departments", id, "BATCH_DELETE", null);
      count++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      if (msg.includes("karyawan terdaftar") || msg.includes("template KPI")) {
        skipped++;
      } else {
        errors.push(`ID ${id}: ${msg}`);
      }
    }
  }

  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count, skipped, errors };
}

// ---------- HEAD DEPARTMENT ACTIONS ----------
export async function createHeadDepartmentAction(fd: FormData) {
  const departmentId = i(fd, "departmentId");
  const employeeId = i(fd, "employeeId");
  const operatingUnit = s(fd, "operatingUnit") || "HO";
  const status = s(fd, "status") || "Active";

  if (!departmentId) throw new Error("Departemen wajib dipilih.");
  if (!employeeId) throw new Error("Head Department (Karyawan) wajib dipilih.");

  const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
  if (!dept) throw new Error("Departemen yang dipilih tidak valid.");

  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new Error("Karyawan yang dipilih tidak valid.");

  const existing = await db
    .select()
    .from(departmentHeads)
    .where(
      and(
        eq(departmentHeads.departmentId, departmentId),
        eq(departmentHeads.operatingUnit, operatingUnit)
      )
    );

  if (existing.length > 0) {
    throw new Error(
      `Departemen "${dept.name}" untuk Operating Unit "${operatingUnit}" sudah memiliki Head Department. Silakan edit data yang sudah ada.`
    );
  }

  const [row] = await db
    .insert(departmentHeads)
    .values({
      departmentId,
      operatingUnit,
      employeeId,
      status,
    })
    .returning();

  await audit("department_heads", row?.id ?? null, "CREATE", {
    departmentId,
    operatingUnit,
    employeeId,
    status,
  });

  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { success: true, id: row?.id };
}

export async function updateHeadDepartmentAction(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID Head Department wajib ada untuk update.");

  const departmentId = i(fd, "departmentId");
  const employeeId = i(fd, "employeeId");
  const operatingUnit = s(fd, "operatingUnit") || "HO";
  const status = s(fd, "status") || "Active";

  if (!departmentId) throw new Error("Departemen wajib dipilih.");
  if (!employeeId) throw new Error("Head Department (Karyawan) wajib dipilih.");

  const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
  if (!dept) throw new Error("Departemen yang dipilih tidak valid.");

  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new Error("Karyawan yang dipilih tidak valid.");

  const duplicate = await db
    .select()
    .from(departmentHeads)
    .where(
      and(
        ne(departmentHeads.id, id),
        eq(departmentHeads.departmentId, departmentId),
        eq(departmentHeads.operatingUnit, operatingUnit)
      )
    );

  if (duplicate.length > 0) {
    throw new Error(
      `Departemen "${dept.name}" untuk Operating Unit "${operatingUnit}" sudah digunakan oleh data Head Department lain.`
    );
  }

  await db
    .update(departmentHeads)
    .set({
      departmentId,
      operatingUnit,
      employeeId,
      status,
      updatedAt: new Date(),
    })
    .where(eq(departmentHeads.id, id));

  await audit("department_heads", id, "UPDATE", {
    departmentId,
    operatingUnit,
    employeeId,
    status,
  });

  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { success: true };
}

export async function deleteHeadDepartmentAction(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID Head Department wajib diisi.");

  await db.delete(departmentHeads).where(eq(departmentHeads.id, id));
  await audit("department_heads", id, "DELETE", null);

  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { success: true };
}

export async function toggleHeadDepartmentStatusAction(id: number, nextStatus: string) {
  if (!id) throw new Error("ID Head Department wajib diisi.");

  await db
    .update(departmentHeads)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(departmentHeads.id, id));

  await audit("department_heads", id, "TOGGLE_STATUS", { status: nextStatus });

  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { success: true };
}

export async function createJobLevel(fd: FormData) {
  await db.insert(jobLevels).values({ code: s(fd, "code").toUpperCase(), name: s(fd, "name"), rank: i(fd, "rank") });
  revalidateAll();
}
export async function deleteJobLevel(fd: FormData) {
  await db.delete(jobLevels).where(eq(jobLevels.id, i(fd, "id")));
  revalidateAll();
}

export async function generateNextJobPositionCode(departmentId: number): Promise<string> {
  const [dept] = await db
    .select({ id: departments.id, code: departments.code })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);

  if (!dept) {
    throw new Error(`Departemen dengan ID ${departmentId} tidak ditemukan.`);
  }

  const deptCode = dept.code.trim().toUpperCase();

  // 1. Ambil nomor terakhir dari counter sequence tabel
  const [seqRecord] = await db
    .select({ lastNumber: jobPositionSequences.lastNumber })
    .from(jobPositionSequences)
    .where(eq(jobPositionSequences.departmentId, departmentId))
    .limit(1);

  // 2. Ambil juga nomor maksimum dari kode job_positions yang ada saat ini
  const existingPositions = await db
    .select({ code: jobPositions.code })
    .from(jobPositions)
    .where(eq(jobPositions.departmentId, departmentId));

  let maxInTable = 0;
  const escapedDept = deptCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedDept}-(\\d+)$`, "i");

  for (const pos of existingPositions) {
    if (pos.code) {
      const match = pos.code.trim().match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxInTable) maxInTable = num;
      }
    }
  }

  // Nomor acuan adalah yang tertinggi antara counter sequence dan data yang ada
  const baseNumber = Math.max(seqRecord?.lastNumber ?? 0, maxInTable);
  let nextNum = baseNumber + 1;
  let candidateCode = `${deptCode}-${String(nextNum).padStart(3, "0")}`;

  // Pastikan kandidat kode benar-benar unik di tabel job_positions
  while (true) {
    const [conflict] = await db
      .select({ id: jobPositions.id })
      .from(jobPositions)
      .where(eq(jobPositions.code, candidateCode))
      .limit(1);

    if (!conflict) break;
    nextNum++;
    candidateCode = `${deptCode}-${String(nextNum).padStart(3, "0")}`;
  }

  // 3. Simpan nomor urut yang digunakan ke sequence counter agar nomor tidak pernah dipakai ulang
  await db
    .insert(jobPositionSequences)
    .values({
      departmentId,
      lastNumber: nextNum,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: jobPositionSequences.departmentId,
      set: {
        lastNumber: sql`GREATEST(${jobPositionSequences.lastNumber}, ${nextNum})`,
        updatedAt: new Date(),
      },
    });

  return candidateCode;
}

export async function createJobPosition(fd: FormData) {
  const name = s(fd, "name").trim();
  const departmentId = i(fd, "departmentId");
  const jobLevelId = i(fd, "jobLevelId");
  const description = s(fd, "description").trim() || null;
  const isActive = s(fd, "isActive") !== "false";

  if (!name) throw new Error("Nama Job Position wajib diisi!");
  if (!departmentId) throw new Error("Departemen wajib dipilih!");
  if (!jobLevelId) throw new Error("Job Level wajib dipilih!");

  // Kode dibuat otomatis berurutan khusus untuk masing-masing departemen
  const code = await generateNextJobPositionCode(departmentId);

  // Validasi duplikasi
  const [duplicate] = await db
    .select({ id: jobPositions.id })
    .from(jobPositions)
    .where(eq(jobPositions.code, code))
    .limit(1);

  if (duplicate) {
    throw new Error(`Kode jabatan "${code}" sudah digunakan. Silakan coba lagi.`);
  }

  const [row] = await db
    .insert(jobPositions)
    .values({
      code,
      name,
      departmentId,
      jobLevelId,
      description,
      isActive,
      updatedAt: new Date(),
    })
    .returning();

  await audit("job_positions", row?.id ?? null, "CREATE", { code, name, departmentId, jobLevelId });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function updateJobPosition(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID Job Position wajib ada untuk update.");
  const name = s(fd, "name").trim();
  const departmentId = i(fd, "departmentId");
  const jobLevelId = i(fd, "jobLevelId");
  const description = s(fd, "description").trim() || null;
  const isActive = s(fd, "isActive") !== "false";

  if (!name) throw new Error("Nama Job Position wajib diisi!");
  if (!departmentId) throw new Error("Departemen wajib dipilih!");
  if (!jobLevelId) throw new Error("Job Level wajib dipilih!");

  // 1. Ambil data jabatan saat ini
  const [existing] = await db
    .select()
    .from(jobPositions)
    .where(eq(jobPositions.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("Job Position tidak ditemukan.");
  }

  let code = existing.code;
  const isDeptChanged = existing.departmentId !== departmentId;

  // 2. Jika departemen berubah, generate kode baru sesuai departemen tujuan
  // Jika departemen tidak berubah, kode TETAP SAMA (tidak berubah ketika nama jabatan/level diedit)
  if (isDeptChanged || !code) {
    code = await generateNextJobPositionCode(departmentId);
  }

  // Validasi kode duplikat jika terjadi perubahan kode
  if (code !== existing.code) {
    const [conflict] = await db
      .select({ id: jobPositions.id })
      .from(jobPositions)
      .where(eq(jobPositions.code, code))
      .limit(1);

    if (conflict && conflict.id !== id) {
      throw new Error(`Kode jabatan "${code}" sudah digunakan oleh jabatan lain.`);
    }
  }

  // 3. Update data master job position
  await db
    .update(jobPositions)
    .set({
      code,
      name,
      departmentId,
      jobLevelId,
      description,
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(jobPositions.id, id));

  // 4. Sinkronisasi data karyawan yang terhubung tanpa merusak relasi
  // (karyawan tetap terhubung via jobPositionId, nama jabatan, departemen, dan level diselaraskan)
  await db
    .update(employees)
    .set({
      jobPosition: name,
      departmentId,
      jobLevelId,
    })
    .where(eq(employees.jobPositionId, id));

  // 5. Sinkronisasi KPI template jika ada yang terhubung ke job position ini
  if (isDeptChanged) {
    await db
      .update(kpiTemplates)
      .set({
        departmentId,
      })
      .where(eq(kpiTemplates.jobPositionId, id));
  }

  await audit("job_positions", id, "UPDATE", {
    code,
    previousCode: existing.code,
    name,
    departmentId,
    previousDepartmentId: existing.departmentId,
    jobLevelId,
    isDeptChanged,
  });

  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function deleteJobPosition(fd: FormData) {
  const id = i(fd, "id");
  if (!id) throw new Error("ID Job Position wajib ada untuk delete.");

  const [existing] = await db
    .select()
    .from(jobPositions)
    .where(eq(jobPositions.id, id))
    .limit(1);

  if (existing) {
    // Pastikan sequence counter department tetap mencatat nomor kode jabatan ini agar TIDAK dipinjam ulang
    if (existing.code && existing.departmentId) {
      const match = existing.code.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        await db
          .insert(jobPositionSequences)
          .values({
            departmentId: existing.departmentId,
            lastNumber: num,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: jobPositionSequences.departmentId,
            set: {
              lastNumber: sql`GREATEST(${jobPositionSequences.lastNumber}, ${num})`,
              updatedAt: new Date(),
            },
          });
      }
    }
  }

  await db.delete(jobPositions).where(eq(jobPositions.id, id));
  await audit("job_positions", id, "DELETE", existing);
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function importJobPositionsBatch(
  items: { code?: string; name: string; departmentCode?: string; jobLevelCode?: string; description?: string }[]
) {
  if (!items || items.length === 0) return { count: 0 };
  const allDepts = await db.select().from(departments);
  const deptCodeMap = new Map(allDepts.map((d) => [d.code.toUpperCase().trim(), d.id]));

  const allLevels = await db.select().from(jobLevels);
  const levelCodeMap = new Map(allLevels.map((l) => [l.code.toUpperCase().trim(), l.id]));
  const defaultLevelId = allLevels[0]?.id ?? 1;
  const defaultDeptId = allDepts[0]?.id ?? 1;

  let count = 0;
  for (const item of items) {
    const name = (item.name || "").trim();
    if (!name) continue;

    const departmentId = item.departmentCode
      ? deptCodeMap.get(item.departmentCode.trim().toUpperCase()) ?? defaultDeptId
      : defaultDeptId;
    const jobLevelId = item.jobLevelCode
      ? levelCodeMap.get(item.jobLevelCode.trim().toUpperCase()) ?? defaultLevelId
      : defaultLevelId;
    const description = (item.description || "").trim() || null;

    let code = (item.code || "").trim().toUpperCase() || null;

    const existing = await db
      .select()
      .from(jobPositions)
      .where(eq(jobPositions.name, name))
      .limit(1);

    if (existing.length > 0) {
      // Data lama sudah ada: pertahankan kodenya jika departemen sama, atau perbarui jika departemen berubah
      if (!code) {
        if (existing[0].departmentId === departmentId && existing[0].code) {
          code = existing[0].code;
        } else {
          code = await generateNextJobPositionCode(departmentId);
        }
      }
      await db
        .update(jobPositions)
        .set({ code, departmentId, jobLevelId, description, updatedAt: new Date() })
        .where(eq(jobPositions.id, existing[0].id));

      await db
        .update(employees)
        .set({ jobPosition: name, departmentId, jobLevelId })
        .where(eq(employees.jobPositionId, existing[0].id));
    } else {
      if (!code) {
        code = await generateNextJobPositionCode(departmentId);
      } else {
        // Jika ada kode eksplisit, update sequence counter agar tidak terulang
        const deptObj = allDepts.find((d) => d.id === departmentId);
        if (deptObj) {
          const match = code.match(new RegExp(`^${deptObj.code.toUpperCase()}-(\\d+)$`, "i"));
          if (match) {
            const num = parseInt(match[1], 10);
            await db
              .insert(jobPositionSequences)
              .values({ departmentId, lastNumber: num, updatedAt: new Date() })
              .onConflictDoUpdate({
                target: jobPositionSequences.departmentId,
                set: {
                  lastNumber: sql`GREATEST(${jobPositionSequences.lastNumber}, ${num})`,
                  updatedAt: new Date(),
                },
              });
          }
        }
      }

      await db.insert(jobPositions).values({
        code,
        name,
        departmentId,
        jobLevelId,
        description,
        isActive: true,
        updatedAt: new Date(),
      });
    }
    count++;
  }
  await audit("job_positions", null, "IMPORT_BATCH", { count });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count };
}

export async function importDepartmentsBatch(items: { code: string; name: string }[]) {
  if (!items || items.length === 0) return { count: 0 };
  let count = 0;
  for (const item of items) {
    const code = (item.code || "").trim().toUpperCase();
    const name = (item.name || "").trim();
    if (!code || !name) continue;

    await db
      .insert(departments)
      .values({ code, name })
      .onConflictDoUpdate({
        target: departments.code,
        set: { name },
      });
    count++;
  }
  await audit("departments", null, "IMPORT_BATCH", { count });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count };
}

export async function importHeadDepartmentsBatch(
  items: {
    deptCode?: string;
    deptName?: string;
    operatingUnit?: string;
    nik?: string;
    employeeName?: string;
    status?: string;
  }[]
) {
  if (!items || items.length === 0) return { count: 0 };

  const allDepts = await db.select().from(departments);
  const deptByCode = new Map(allDepts.map((d) => [d.code.trim().toUpperCase(), d]));
  const deptByName = new Map(allDepts.map((d) => [d.name.trim().toLowerCase(), d]));

  const allEmps = await db.select().from(employees);
  const empByNik = new Map(allEmps.map((e) => [(e.nik || "").trim().toLowerCase(), e]));
  const empByName = new Map(allEmps.map((e) => [(e.name || "").trim().toLowerCase(), e]));

  const allHeads = await db.select().from(departmentHeads);

  let count = 0;
  for (const item of items) {
    const rawDeptCode = (item.deptCode || "").trim().toUpperCase();
    const rawDeptName = (item.deptName || "").trim().toLowerCase();
    const dept =
      deptByCode.get(rawDeptCode) || (rawDeptName ? deptByName.get(rawDeptName) : undefined);
    if (!dept) continue;

    const rawOU = (item.operatingUnit || "HO").trim().toUpperCase();
    if (!rawOU) continue;

    const rawNik = (item.nik || "").trim().toLowerCase();
    const rawEmpName = (item.employeeName || "").trim().toLowerCase();
    const emp =
      (rawNik ? empByNik.get(rawNik) : undefined) ||
      (rawEmpName ? empByName.get(rawEmpName) : undefined);
    if (!emp) continue;

    const rawStatus = (item.status || "").trim().toLowerCase();
    const status =
      rawStatus === "inactive" || rawStatus === "nonaktif" ? "Inactive" : "Active";

    const existing = allHeads.find(
      (h) => h.departmentId === dept.id && h.operatingUnit.trim().toUpperCase() === rawOU
    );

    if (existing) {
      await db
        .update(departmentHeads)
        .set({
          employeeId: emp.id,
          status,
          updatedAt: new Date(),
        })
        .where(eq(departmentHeads.id, existing.id));
      existing.employeeId = emp.id;
      existing.status = status;
    } else {
      const [inserted] = await db
        .insert(departmentHeads)
        .values({
          departmentId: dept.id,
          operatingUnit: rawOU,
          employeeId: emp.id,
          status,
        })
        .returning();
      if (inserted) {
        allHeads.push(inserted);
      }
    }
    count++;
  }

  await audit("department_heads", null, "IMPORT_BATCH", { count });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count };
}

export async function importJobLevelsBatch(items: { code: string; name: string; rank?: number }[]) {
  if (!items || items.length === 0) return { count: 0 };
  let count = 0;
  for (const item of items) {
    const code = (item.code || "").trim().toUpperCase();
    const name = (item.name || "").trim();
    const rank = Number(item.rank) || 0;
    if (!code || !name) continue;

    await db
      .insert(jobLevels)
      .values({ code, name, rank })
      .onConflictDoUpdate({
        target: jobLevels.code,
        set: { name, rank },
      });
    count++;
  }
  await audit("job_levels", null, "IMPORT_BATCH", { count });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count };
}

export async function saveOperatingUnitsAction(units: { id: string; name: string; status?: string }[]) {
  const value = JSON.stringify(units);
  await db
    .insert(systemConfig)
    .values({ key: "master_operating_units", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });

  // Sinkronkan ke tabel database `sites`
  for (const u of units) {
    const code = (u.name || "").trim().toUpperCase();
    if (code) {
      await db
        .insert(sites)
        .values({
          code,
          name: code === "HO" ? "Head Office" : `Site ${code}`,
          description: `Unit Operasional ${code}`,
          isActive: u.status !== "Inactive",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sites.code,
          set: {
            name: code === "HO" ? "Head Office" : `Site ${code}`,
            isActive: u.status !== "Inactive",
            updatedAt: new Date(),
          },
        });
    }
  }

  await audit("system_config", null, "UPDATE_OPERATING_UNITS", { count: units.length });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
  return { count: units.length };
}

export interface SaveJobLevelPermissionInput {
  jobLevelId: number;
  defaultRole: string;
  canAccessMasterData: boolean;
  canAccessMasterParam: boolean;
  canAccessTemplate: boolean;
  canAccessAssignment: boolean;
  canAccessInputAssessment: boolean;
  canAccessReviewAssessment: boolean;
  canAccessApprovalAssessment: boolean;
  canAccessReports: boolean;
  departmentScope: string;
  levelScope: string;
  customDepartmentIds?: number[];
  customJobLevelIds?: number[];
  syncRoleToEmployees?: boolean;
}

export async function saveJobLevelPermissionsAction(input: SaveJobLevelPermissionInput) {
  const {
    jobLevelId,
    defaultRole,
    canAccessMasterData,
    canAccessMasterParam,
    canAccessTemplate,
    canAccessAssignment,
    canAccessInputAssessment,
    canAccessReviewAssessment,
    canAccessApprovalAssessment,
    canAccessReports,
    departmentScope,
    levelScope,
    customDepartmentIds = [],
    customJobLevelIds = [],
    syncRoleToEmployees = false,
  } = input;

  const [existing] = await db
    .select()
    .from(jobLevelPermissions)
    .where(eq(jobLevelPermissions.jobLevelId, jobLevelId));

  if (existing) {
    await db
      .update(jobLevelPermissions)
      .set({
        defaultRole,
        canAccessMasterData,
        canAccessMasterParam,
        canAccessTemplate,
        canAccessAssignment,
        canAccessInputAssessment,
        canAccessReviewAssessment,
        canAccessApprovalAssessment,
        canAccessReports,
        departmentScope,
        levelScope,
        customDepartmentIds,
        customJobLevelIds,
        updatedAt: new Date(),
      })
      .where(eq(jobLevelPermissions.jobLevelId, jobLevelId));
  } else {
    await db.insert(jobLevelPermissions).values({
      jobLevelId,
      defaultRole,
      canAccessMasterData,
      canAccessMasterParam,
      canAccessTemplate,
      canAccessAssignment,
      canAccessInputAssessment,
      canAccessReviewAssessment,
      canAccessApprovalAssessment,
      canAccessReports,
      departmentScope,
      levelScope,
      customDepartmentIds,
      customJobLevelIds,
    });
  }

  if (syncRoleToEmployees && defaultRole) {
    await db
      .update(employees)
      .set({ role: defaultRole })
      .where(eq(employees.jobLevelId, jobLevelId));
  }

  await audit("job_level_permission", jobLevelId, "UPDATE_PERMISSIONS", {
    defaultRole,
    departmentScope,
    levelScope,
    syncRoleToEmployees,
  });

  revalidateAll();

  return { success: true };
}

export async function deleteJobLevelPermissionAction(jobLevelId: number) {
  await db.delete(jobLevelPermissions).where(eq(jobLevelPermissions.jobLevelId, jobLevelId));
  await audit("job_level_permission", jobLevelId, "DELETE_PERMISSIONS", {});
  revalidateAll();
  return { success: true };
}
export async function updateJobLevelHierarchy(fd: FormData) {
  const id = i(fd, "id");
  const appraiser1 = s(fd, "appraiser1") || null;
  const appraiser2 = s(fd, "appraiser2") || null;
  const jobLevelName = s(fd, "jobLevelName") || null;
  const hierarchyStatus = s(fd, "hierarchyStatus") || "Active";

  const list = [appraiser1, appraiser2].filter(Boolean);
  const appraiserLevel = list.length > 0 ? list.join(", ") : null;

  const updateData: Record<string, unknown> = {
    appraiser1,
    appraiser2,
    appraiserLevel,
    hierarchyStatus,
  };
  if (jobLevelName) {
    updateData.name = jobLevelName;
  }

  await db
    .update(jobLevels)
    .set(updateData)
    .where(eq(jobLevels.id, id));
  await audit("job_level", id, "UPDATE_HIERARCHY", { appraiser1, appraiser2, hierarchyStatus });
  revalidateAll();
}

export async function createJobLevelHierarchy(fd: FormData) {
  const code = (s(fd, "code") || `JL${Date.now().toString().slice(-4)}`).toUpperCase();
  const name = s(fd, "name");
  const appraiser1 = s(fd, "appraiser1") || null;
  const appraiser2 = s(fd, "appraiser2") || null;
  const hierarchyStatus = s(fd, "hierarchyStatus") || "Active";

  if (!name) throw new Error("Nama Job Level wajib dipilih!");

  const list = [appraiser1, appraiser2].filter(Boolean);
  const appraiserLevel = list.length > 0 ? list.join(", ") : null;

  const [existing] = await db.select().from(jobLevels).where(eq(jobLevels.name, name));
  if (existing) {
    await db.update(jobLevels).set({
      appraiser1,
      appraiser2,
      appraiserLevel,
      hierarchyStatus,
    }).where(eq(jobLevels.id, existing.id));
    await audit("job_level", existing.id, "UPDATE_HIERARCHY", { appraiser1, appraiser2, hierarchyStatus });
  } else {
    const [inserted] = await db.insert(jobLevels).values({
      code,
      name,
      rank: 0,
      appraiser1,
      appraiser2,
      appraiserLevel,
      hierarchyStatus,
    }).returning();
    await audit("job_level", inserted.id, "CREATE_HIERARCHY", { appraiser1, appraiser2, hierarchyStatus });
  }
  revalidateAll();
}

export async function upsertEmployee(fd: FormData) {
  const id = i(fd, "id");
  let jobPositionId = i(fd, "jobPositionId") || null;
  let jobPosition = s(fd, "jobPosition").trim();
  let departmentId = i(fd, "departmentId");
  let jobLevelId = i(fd, "jobLevelId");

  // If jobPositionId is given, fetch its canonical name, department, and job level
  if (jobPositionId) {
    const [matched] = await db.select().from(jobPositions).where(eq(jobPositions.id, jobPositionId));
    if (matched) {
      jobPosition = matched.name;
      departmentId = matched.departmentId;
      jobLevelId = matched.jobLevelId;
    }
  } else if (jobPosition) {
    // If only text is given, lookup from master jobPositions
    const [matched] = await db.select().from(jobPositions).where(eq(jobPositions.name, jobPosition));
    if (matched) {
      jobPositionId = matched.id;
      departmentId = matched.departmentId;
      jobLevelId = matched.jobLevelId;
    }
  }

  const data = {
    nik: s(fd, "nik").trim(),
    name: s(fd, "name").trim(),
    departmentId,
    jobLevelId,
    jobPositionId,
    jobPosition,
    operatingUnit: (s(fd, "operatingUnit") || "HO").toUpperCase(),
    dateOfHire: s(fd, "dateOfHire") || null,
    appraiserId: i(fd, "appraiserId") || null,
    headDeptId: i(fd, "headDeptId") || null,
    managerId: i(fd, "managerId") || null,
    role: s(fd, "role") || "KARYAWAN",
    isCustomRole: s(fd, "isCustomRole") === "true",
    customPermissions: (() => {
      const raw = s(fd, "customPermissions");
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    password: s(fd, "password") || s(fd, "nik").trim() || "123456",
    polaPenggajian: s(fd, "polaPenggajian") || "All In",
    pitId: i(fd, "pitId") || null,
    isActive: s(fd, "isActive") !== "false",
  };
  if (!data.nik) throw new Error("NIK wajib diisi!");
  if (!data.name) throw new Error("Nama karyawan wajib diisi!");
  if (!data.departmentId) throw new Error("Departemen wajib dipilih!");
  if (!data.jobLevelId) throw new Error("Job level wajib dipilih!");
  if (!data.jobPosition) throw new Error("Jabatan (Job Title) wajib diisi / dipilih!");

  // Validasi duplikasi NIK (unik case-insensitive dan trim)
  const existingEmployee = await db
    .select({
      id: employees.id,
      name: employees.name,
      nik: employees.nik,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(
      and(
        sql`LOWER(TRIM(${employees.nik})) = LOWER(${data.nik})`,
        id ? ne(employees.id, id) : undefined
      )
    )
    .limit(1);

  if (existingEmployee.length > 0) {
    const existing = existingEmployee[0];
    const statusText = existing.isActive ? "aktif" : "non-aktif";
    throw new Error(
      `NIK "${data.nik}" sudah terdaftar untuk karyawan "${existing.name}" (Status: ${statusText}). NIK tidak boleh duplikat.`
    );
  }

  if (id) {
    await db.update(employees).set(data).where(eq(employees.id, id));
    await audit("employee", id, "UPDATE", data);
  } else {
    const [row] = await db.insert(employees).values(data).returning();
    await audit("employee", row.id, "CREATE", data);
  }
  revalidateAll();
}

export interface EmployeeBatchInput {
  nik: string;
  name: string;
  departmentId: number;
  jobLevelId: number;
  jobPosition: string;
  operatingUnit: string;
  dateOfHire: string;
  polaPenggajian?: string;
  role?: string;
  originalDepartment?: string;
  appraiserId?: number | null;
  headDeptId?: number | null;
  appraiserNik?: string;
  headDeptNik?: string;
  password?: string;
  pitId?: number | null;
}

export async function importEmployeesBatch(items: EmployeeBatchInput[]) {
  if (!items || items.length === 0) return { count: 0 };
  const allPositions = await db.select().from(jobPositions);
  const posMap = new Map(allPositions.map((p) => [p.name.toLowerCase().trim(), p]));

  // Ambil data PIT karyawan eksisting untuk mematuhi Ketentuan 6:
  // "Jika kolom atau informasi PIT tidak disertakan dalam file import, pertahankan PIT yang sudah tersimpan."
  const existingEmps = await db
    .select({ nik: employees.nik, pitId: employees.pitId })
    .from(employees);
  const existingPitMap = new Map<string, number | null>(
    existingEmps.map((e) => [e.nik.toLowerCase().trim(), e.pitId])
  );

  let count = 0;
  for (const item of items) {
    const rawPos = item.jobPosition ? item.jobPosition.trim() : "Staff";
    let matchedPos = posMap.get(rawPos.toLowerCase());

    // Jika jabatan belum terdaftar di Master Jabatan, daftarkan otomatis agar sinkron
    if (!matchedPos && rawPos) {
      try {
        const cleanCode = `POS-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
        const [newPos] = await db
          .insert(jobPositions)
          .values({
            code: cleanCode,
            name: rawPos,
            departmentId: item.departmentId,
            jobLevelId: item.jobLevelId,
          })
          .returning();
        if (newPos) {
          matchedPos = newPos;
          posMap.set(rawPos.toLowerCase(), newPos);
        }
      } catch (e) {
        // Fallback jika ada constraint; matchedPos tetap null dan tidak membatalkan import
        console.warn("Auto-create jobPosition note:", e);
      }
    } else if (matchedPos && item.jobLevelId && matchedPos.jobLevelId !== item.jobLevelId) {
      // Sesuaikan di master jabatan jika level jabatan berbeda dengan yang di-import
      try {
        await db
          .update(jobPositions)
          .set({ jobLevelId: item.jobLevelId })
          .where(eq(jobPositions.id, matchedPos.id));
        matchedPos.jobLevelId = item.jobLevelId;
      } catch (e) {
        console.warn("Update jobPosition level note:", e);
      }
    }

    const cleanDateOfHire = item.dateOfHire && item.dateOfHire.trim() !== "" ? item.dateOfHire.trim() : null;
    const cleanNik = item.nik.trim();
    const isExisting = existingPitMap.has(cleanNik.toLowerCase());
    const existingPitId = existingPitMap.get(cleanNik.toLowerCase()) ?? null;

    // Ketentuan 6:
    // Update PIT jika informasi PIT tersedia (item.pitId !== undefined).
    // Pertahankan PIT yang sudah tersimpan jika info PIT tidak disertakan (item.pitId === undefined) pada karyawan yang sudah ada.
    let resolvedPitId: number | null = null;
    if (item.pitId !== undefined) {
      resolvedPitId = item.pitId;
    } else if (isExisting) {
      resolvedPitId = existingPitId;
    } else {
      resolvedPitId = null;
    }

    const data = {
      nik: cleanNik,
      name: item.name.trim(),
      departmentId: item.departmentId,
      originalDepartment: item.originalDepartment ? item.originalDepartment.trim() : null,
      jobLevelId: item.jobLevelId,
      jobPositionId: matchedPos?.id || null,
      jobPosition: matchedPos?.name || rawPos,
      operatingUnit: (item.operatingUnit || "HO").toUpperCase(),
      dateOfHire: cleanDateOfHire,
      polaPenggajian: item.polaPenggajian || "All In",
      role: item.role || "KARYAWAN",
      appraiserId: item.appraiserId ?? null,
      headDeptId: item.headDeptId ?? null,
      password: item.password || item.nik.trim() || "123456",
      pitId: resolvedPitId,
      isActive: true,
    };

    await db.insert(employees).values(data).onConflictDoUpdate({
      target: employees.nik,
      set: data,
    });
    count++;
  }

  // Pass 2: Hubungkan NIK Penilai dan NIK Head Dept yang mungkin baru diinsert dalam batch yang sama
  try {
    const niksToResolve = new Set<string>();
    for (const item of items) {
      if (item.appraiserNik?.trim()) niksToResolve.add(item.appraiserNik.trim().toLowerCase());
      if (item.headDeptNik?.trim()) niksToResolve.add(item.headDeptNik.trim().toLowerCase());
    }

    if (niksToResolve.size > 0) {
      const empList = await db.select({ id: employees.id, nik: employees.nik }).from(employees);
      const nikToIdMap = new Map(empList.map((e) => [e.nik.toLowerCase().trim(), e.id]));

      for (const item of items) {
        const aNik = item.appraiserNik?.trim().toLowerCase();
        const hNik = item.headDeptNik?.trim().toLowerCase();
        const resolvedAppraiserId = item.appraiserId ?? (aNik ? nikToIdMap.get(aNik) ?? null : null);
        const resolvedHeadDeptId = item.headDeptId ?? (hNik ? nikToIdMap.get(hNik) ?? null : null);

        if (resolvedAppraiserId !== null || resolvedHeadDeptId !== null) {
          await db
            .update(employees)
            .set({
              ...(resolvedAppraiserId !== null ? { appraiserId: resolvedAppraiserId } : {}),
              ...(resolvedHeadDeptId !== null ? { headDeptId: resolvedHeadDeptId } : {}),
            })
            .where(eq(employees.nik, item.nik.trim()));
        }
      }
    }
  } catch (err) {
    console.warn("Pass 2 appraiser/headDept resolution error:", err);
  }

  await audit("employee", null, "IMPORT_EXCEL_BATCH", { count });
  revalidateAll();
  return { count };
}

/**
 * Sinkronisasi otomatis PIT untuk data karyawan yang sudah ada di database berdasarkan Mapping Departemen.
 * Memanfaatkan data originalDepartment dan Site karyawan tanpa mengharuskan pengguna upload ulang Excel.
 */
export async function syncExistingEmployeesPitAction(): Promise<{
  success: boolean;
  totalUpdated: number;
  details: Record<string, number>;
}> {
  const allEmps = await db.select().from(employees);
  const mappings = await db.select().from(departmentMappings);
  const allPits = await db.select().from(pits);

  const pitMap = new Map(allPits.map((p) => [p.id, p]));
  const details: Record<string, number> = {};
  let totalUpdated = 0;

  for (const emp of allEmps) {
    if (!emp.originalDepartment) continue;
    const site = (emp.operatingUnit || "HO").toUpperCase();
    const raw = emp.originalDepartment.trim();

    // Cari mapping yang sesuai site & raw department
    const m = mappings.find(
      (map) =>
        matchesSite(map.site, site) &&
        map.pitId &&
        (matchesDeptName(map.cleanRawName, raw) || matchesDeptName(map.rawDepartmentName, raw))
    );

    if (m && m.pitId && emp.pitId !== m.pitId) {
      await db.update(employees).set({ pitId: m.pitId }).where(eq(employees.id, emp.id));
      totalUpdated++;
      const p = pitMap.get(m.pitId);
      const label = p ? `${p.name} (${p.code})` : `PIT #${m.pitId}`;
      details[label] = (details[label] || 0) + 1;
    }
  }

  await audit("employee", null, "SYNC_EMPLOYEES_PIT", { totalUpdated, details });
  revalidateAll();
  return { success: true, totalUpdated, details };
}

export async function assignAppraiser(fd: FormData) {
  const id = i(fd, "id");
  const data = { appraiserId: i(fd, "appraiserId") || null, headDeptId: i(fd, "headDeptId") || null };
  await db.update(employees).set(data).where(eq(employees.id, id));
  await audit("employee", id, "ASSIGN_APPRAISER", data);
  revalidateAll();
}

export async function deleteEmployee(fd: FormData) {
  const id = i(fd, "id");
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
  await audit("employee", id, "DEACTIVATE", { isActive: false });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function reactivateEmployee(fd: FormData) {
  const id = i(fd, "id");
  await db.update(employees).set({ isActive: true }).where(eq(employees.id, id));
  await audit("employee", id, "REACTIVATE", { isActive: true });
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function permanentDeleteEmployee(fd: FormData) {
  const id = i(fd, "id");
  await db.delete(employees).where(eq(employees.id, id));
  await audit("employee", id, "PERMANENT_DELETE", null);
  revalidateAll();
  safeRevalidate("/setup/master", "page");
}

export async function deleteEmployeeFromImportAction({
  id,
  nik,
}: {
  id?: number;
  nik?: string;
}): Promise<{ success: boolean; message: string; employeeId?: number; nik?: string }> {
  try {
    let targetEmployee = null;
    if (id) {
      const [emp] = await db.select().from(employees).where(eq(employees.id, id));
      targetEmployee = emp;
    } else if (nik && nik.trim()) {
      const [emp] = await db.select().from(employees).where(eq(employees.nik, nik.trim()));
      targetEmployee = emp;
    }

    if (!targetEmployee) {
      return { success: false, message: "Data karyawan tidak ditemukan di database." };
    }

    const targetId = targetEmployee.id;
    const targetNik = targetEmployee.nik;

    // Bersihkan referensi atasan dan bawahan agar tidak terkena constraint foreign key
    await db.update(employees).set({ appraiserId: null }).where(eq(employees.appraiserId, targetId));
    await db.update(employees).set({ headDeptId: null }).where(eq(employees.headDeptId, targetId));
    await db.update(employees).set({ managerId: null }).where(eq(employees.managerId, targetId));

    // Bersihkan referensi penugasan department_heads jika ada
    await db.delete(departmentHeads).where(eq(departmentHeads.employeeId, targetId));

    // Bersihkan penugasan KPI jika ada
    await db
      .delete(kpiAssessorAssignments)
      .where(
        or(
          eq(kpiAssessorAssignments.assessorEmployeeId, targetId),
          eq(kpiAssessorAssignments.targetEmployeeId, targetId)
        )
      );

    // Bersihkan riwayat penilaian jika ada
    const empAppraisals = await db
      .select({ id: appraisals.id })
      .from(appraisals)
      .where(or(eq(appraisals.employeeId, targetId), eq(appraisals.appraiserId, targetId)));
    const appraisalIds = empAppraisals.map((a) => a.id);
    if (appraisalIds.length > 0) {
      await db.delete(appraisalItems).where(inArray(appraisalItems.appraisalId, appraisalIds));
      await db.delete(appraisals).where(inArray(appraisals.id, appraisalIds));
    }

    // Bersihkan akun user login jika ada
    await db.delete(users).where(eq(users.nik, targetNik));

    // Hapus permanen dari master karyawan
    await db.delete(employees).where(eq(employees.id, targetId));

    await audit("employee", targetId, "PERMANENT_DELETE_FROM_IMPORT", {
      nik: targetNik,
      name: targetEmployee.name,
    });

    revalidateAll();
    safeRevalidate("/setup/master", "page");

    return {
      success: true,
      message: `Karyawan ${targetEmployee.name} (${targetNik}) berhasil dihapus dari database.`,
      employeeId: targetId,
      nik: targetNik,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Gagal menghapus data dari database.";
    console.error("Error deleteEmployeeFromImportAction:", err);
    return { success: false, message: errorMsg };
  }
}

export async function batchDeleteEmployeesFromImportAction({
  niks = [],
  ids = [],
}: {
  niks?: string[];
  ids?: number[];
}): Promise<{ success: boolean; count: number; message: string }> {
  try {
    let targetEmployees: (typeof employees.$inferSelect)[] = [];
    if (ids.length > 0) {
      targetEmployees = await db.select().from(employees).where(inArray(employees.id, ids));
    } else if (niks.length > 0) {
      targetEmployees = await db.select().from(employees).where(inArray(employees.nik, niks));
    }

    if (targetEmployees.length === 0) {
      return { success: true, count: 0, message: "Tidak ada data karyawan di database yang cocok." };
    }

    const targetIds = targetEmployees.map((e) => e.id);
    const targetNiks = targetEmployees.map((e) => e.nik);

    await db.update(employees).set({ appraiserId: null }).where(inArray(employees.appraiserId, targetIds));
    await db.update(employees).set({ headDeptId: null }).where(inArray(employees.headDeptId, targetIds));
    await db.update(employees).set({ managerId: null }).where(inArray(employees.managerId, targetIds));

    await db.delete(departmentHeads).where(inArray(departmentHeads.employeeId, targetIds));

    await db
      .delete(kpiAssessorAssignments)
      .where(
        or(
          inArray(kpiAssessorAssignments.assessorEmployeeId, targetIds),
          inArray(kpiAssessorAssignments.targetEmployeeId, targetIds)
        )
      );

    const empAppraisals = await db
      .select({ id: appraisals.id })
      .from(appraisals)
      .where(or(inArray(appraisals.employeeId, targetIds), inArray(appraisals.appraiserId, targetIds)));
    const appraisalIds = empAppraisals.map((a) => a.id);
    if (appraisalIds.length > 0) {
      await db.delete(appraisalItems).where(inArray(appraisalItems.appraisalId, appraisalIds));
      await db.delete(appraisals).where(inArray(appraisals.id, appraisalIds));
    }

    await db.delete(users).where(inArray(users.nik, targetNiks));
    await db.delete(employees).where(inArray(employees.id, targetIds));

    await audit("employee", null, "BATCH_PERMANENT_DELETE_FROM_IMPORT", {
      count: targetIds.length,
      niks: targetNiks,
    });

    revalidateAll();
    safeRevalidate("/setup/master", "page");

    return {
      success: true,
      count: targetIds.length,
      message: `${targetIds.length} data karyawan berhasil dihapus dari database.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Gagal menghapus data dari database.";
    console.error("Error batchDeleteEmployeesFromImportAction:", err);
    return { success: false, count: 0, message: errorMsg };
  }
}


/** Import karyawan dari CSV (NIK;Nama;KodeDept;KodeLevel;Jabatan;DateOfHire) */
export async function importEmployeesCsv(fd: FormData) {
  const raw = s(fd, "csv");
  const deps = await db.select().from(departments);
  const lvls = await db.select().from(jobLevels);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const parts = line.split(/[;,\t]/).map((p) => p.trim());
    if (parts.length < 6 || parts[0].toLowerCase() === "nik") continue;
    const [nik, name, deptCode, lvlCode, jobPosition, dateOfHire] = parts;
    const dep = deps.find((d) => d.code.toLowerCase() === deptCode.toLowerCase());
    const lvl = lvls.find((l) => l.code.toLowerCase() === lvlCode.toLowerCase());
    if (!dep || !lvl) continue;
    const data = { nik, name, departmentId: dep.id, jobLevelId: lvl.id, jobPosition, operatingUnit: "HO", dateOfHire, isActive: true };
    await db.insert(employees).values(data).onConflictDoUpdate({ target: employees.nik, set: data });
    count++;
  }
  await audit("employee", null, "IMPORT_CSV", { count });
  revalidateAll();
}

// ---------- PERIODS ----------
export async function createPeriod(fd: FormData) {
  const year = i(fd, "year");
  await db.insert(kpiPeriods).values({
    name: s(fd, "name") || `KPI Tahun ${year}`,
    year,
    startDate: s(fd, "startDate") || `${year}-01-01`,
    endDate: s(fd, "endDate") || `${year}-12-31`,
    evaluationDate: s(fd, "evaluationDate") || `${year}-12-31`,
    inputStartMonth: i(fd, "inputStartMonth") || 11,
    cutoffMonth: i(fd, "cutoffMonth") || 12,
    minTenureMonths: i(fd, "minTenureMonths") || 6,
    status: "ACTIVE",
  });
  revalidateAll();
}
export async function setPeriodStatus(fd: FormData) {
  const id = i(fd, "id");
  const status = s(fd, "status") as "DRAFT" | "ACTIVE" | "CLOSED";
  await db.update(kpiPeriods).set({ status }).where(eq(kpiPeriods.id, id));
  await audit("period", id, "STATUS", { status });
  revalidateAll();
}

export async function deletePeriod(fd: FormData) {
  const id = i(fd, "id");
  const linked = await db.select().from(appraisals).where(eq(appraisals.periodId, id)).limit(1);
  if (linked.length > 0) {
    throw new Error("Tidak dapat menghapus periode ini karena sudah terdapat data penilaian KPI terkait!");
  }
  await db.delete(kpiPeriods).where(eq(kpiPeriods.id, id));
  await audit("period", id, "DELETE", {});
  revalidateAll();
}

// ---------- TEMPLATES ----------
export async function createTemplate(fd: FormData) {
  const deptId = i(fd, "departmentId");
  const lvlId = i(fd, "jobLevelId");
  const posIdRaw = fd.get("jobPositionId");
  const periodIdRaw = fd.get("periodId");
  const effectiveDateRaw = fd.get("effectiveDate");
  const descriptionRaw = fd.get("description");

  // Lookup department and job level codes for professional auto-generated template code
  const [dept] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, deptId)).limit(1);
  const [lvl] = await db.select({ code: jobLevels.code }).from(jobLevels).where(eq(jobLevels.id, lvlId)).limit(1);

  const deptPart = (dept?.code || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lvlPart = (lvl?.code || "LVL").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const generatedCode = `TPL-${deptPart}-${lvlPart}-${randSuffix}`;

  const siteRaw = s(fd, "site");
  const pitIdRaw = fd.get("pitId");
  const mappingIdRaw = fd.get("departmentMappingId");
  const site = siteRaw && siteRaw !== "ALL" ? siteRaw.toUpperCase() : null;
  const pitId = pitIdRaw && pitIdRaw !== "" && pitIdRaw !== "ALL" ? Number(pitIdRaw) : null;
  const departmentMappingId = mappingIdRaw && mappingIdRaw !== "" && mappingIdRaw !== "ALL" ? Number(mappingIdRaw) : null;

  const [row] = await db
    .insert(kpiTemplates)
    .values({
      name: s(fd, "name"),
      code: generatedCode,
      departmentId: deptId,
      jobLevelId: lvlId,
      jobPositionId: posIdRaw && posIdRaw !== "ALL" && posIdRaw !== "" ? Number(posIdRaw) : null,
      periodId: periodIdRaw && periodIdRaw !== "ALL" && periodIdRaw !== "" ? Number(periodIdRaw) : null,
      site,
      pitId,
      departmentMappingId,
      effectiveDate: effectiveDateRaw ? String(effectiveDateRaw) : new Date().toISOString().split("T")[0],
      description: descriptionRaw ? String(descriptionRaw).trim() : null,
      totalWeight: "1.1500",
      isActive: false, // Otomatis berstatus Draft saat dibuat
      version: 1, // Otomatis versi v1.0
    })
    .returning();

  await audit("template", row.id, "CREATE", { name: row.name, code: generatedCode, status: "Draft", version: "v1.0" });
  revalidateAll();
  redirect(`/setup/templates/${row.id}`);
}

export async function duplicateTemplate(fd: FormData) {
  const srcId = i(fd, "id");
  const [src] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, srcId));
  if (!src) return;
  const [tpl] = await db
    .insert(kpiTemplates)
    .values({
      name: s(fd, "name") || `${src.name} (copy)`,
      departmentId: i(fd, "departmentId"),
      jobLevelId: i(fd, "jobLevelId"),
      site: src.site,
      pitId: src.pitId,
      departmentMappingId: src.departmentMappingId,
      totalWeight: src.totalWeight,
    })
    .returning();
  const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, srcId));
  for (const c of cats) {
    const [nc] = await db.insert(kpiCategories).values({ ...c, id: undefined, templateId: tpl.id }).returning();
    const params = await db.select().from(kpiParameters).where(eq(kpiParameters.categoryId, c.id));
    for (const p of params) {
      const [np] = await db.insert(kpiParameters).values({ ...p, id: undefined, categoryId: nc.id }).returning();
      const bands = await db.select().from(kpiBands).where(eq(kpiBands.parameterId, p.id));
      if (bands.length)
        await db.insert(kpiBands).values(bands.map((b) => ({ ...b, id: undefined, parameterId: np.id })));
    }
  }
  await audit("template", tpl.id, "DUPLICATE", { from: srcId });
  revalidateAll();
  redirect(`/setup/templates/${tpl.id}`);
}

async function bumpTemplate(templateId: number, action: string, changes: unknown, client: any = db) {
  const [t] = await client.select().from(kpiTemplates).where(eq(kpiTemplates.id, templateId));
  if (!t) return;
  await client
    .update(kpiTemplates)
    .set({ updatedAt: new Date() })
    .where(eq(kpiTemplates.id, templateId));
  await audit("template", templateId, action, { ...(changes as object), version: t.version }, "admin", client);
}

export async function updateTemplate(fd: FormData) {
  const id = i(fd, "id");
  const isPublish = s(fd, "isPublish") === "true";
  const [t] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
  if (!t) return;

  let newVersion = t.version;
  let isActive = t.isActive;

  if (isPublish) {
    // ─── VALIDASI PUBLISH ────────────────────────────────────────────────────
    // Ambil target bobot dari system config (default 115)
    const maxWeightCfg = await getConfig("max_kpi_category_weight", "115");
    const targetPct = Number(maxWeightCfg) || 115;

    const cats = await db
      .select()
      .from(kpiCategories)
      .where(eq(kpiCategories.templateId, id))
      .orderBy(asc(kpiCategories.sortOrder));

    // 1. Minimal 1 parameter
    if (cats.length === 0) {
      throw new Error("Template belum memiliki Parameter. Tambahkan minimal 1 Parameter sebelum dipublish.");
    }

    // 2. Total bobot parameter harus = target
    const totalWeightPct = Math.round(
      cats.reduce((sum, c) => sum + Math.round(Number(c.weight) * 100), 0)
    );
    if (totalWeightPct !== targetPct) {
      const diff = targetPct - totalWeightPct;
      throw new Error(
        `Total bobot Parameter adalah ${totalWeightPct}%, harus tepat ${targetPct}%. ` +
        (diff > 0 ? `Kurang ${diff}%.` : `Kelebihan ${Math.abs(diff)}%.`) +
        ` Sesuaikan bobot Parameter sebelum publish.`
      );
    }

    // 3. Validasi per parameter
    const catIds = cats.map((c) => c.id);
    const allParams = catIds.length
      ? await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, catIds))
      : [];
    const paramIds = allParams.map((p) => p.id);
    const allBands = paramIds.length
      ? await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramIds))
      : [];

    const errors: string[] = [];

    for (const cat of cats) {
      const catParams = allParams.filter((p) => p.categoryId === cat.id);

      if (cat.categoryType === "DIRECT") {
        // Mode DIRECT: wajib punya setidaknya 1 band
        const directParam = catParams[0];
        if (!directParam) {
          errors.push(`Parameter "${cat.name}" (DIRECT) tidak memiliki data indikator internal.`);
          continue;
        }
        const catBands = allBands.filter((b) => b.parameterId === directParam.id);
        if (catBands.length === 0) {
          errors.push(`Parameter "${cat.name}" belum memiliki Kriteria Scoring. Tambahkan minimal 1 kriteria.`);
        }
      } else {
        // Mode SUB_ITEMS: wajib punya indikator, total bobot = 100%, tiap indikator punya band
        if (catParams.length === 0) {
          errors.push(`Parameter "${cat.name}" belum memiliki Indikator. Tambahkan setidaknya 1 Indikator.`);
          continue;
        }

        const totalIndWeightPct = Math.round(
          catParams.reduce((sum, p) => sum + Math.round(Number(p.weight) * 100), 0)
        );
        if (totalIndWeightPct !== 100) {
          const diff = 100 - totalIndWeightPct;
          errors.push(
            `Parameter "${cat.name}": total bobot Indikator ${totalIndWeightPct}%, harus tepat 100%. ` +
            (diff > 0 ? `Kurang ${diff}%.` : `Kelebihan ${Math.abs(diff)}%.`)
          );
        }

        for (const param of catParams) {
          const paramBands = allBands.filter((b) => b.parameterId === param.id);
          if (paramBands.length === 0) {
            errors.push(
              `Indikator "${param.name}" di Parameter "${cat.name}" belum memiliki Kriteria Scoring.`
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Template tidak dapat dipublish karena ada ${errors.length} masalah:\n\n` +
        errors.map((e, i) => `${i + 1}. ${e}`).join("\n")
      );
    }
    // ─── AKHIR VALIDASI ──────────────────────────────────────────────────────

    isActive = true;
    newVersion = !t.isActive ? 1 : Math.max(1, t.version + 1);
  } else if (fd.has("isActive")) {
    isActive = s(fd, "isActive") !== "false";
  }

  const data: Record<string, any> = {
    name: s(fd, "name") || t.name,
    totalWeight: String(n(fd, "totalWeight") ?? t.totalWeight),
    isActive,
    version: newVersion,
    updatedAt: new Date(),
  };

  if (fd.has("site")) {
    const sVal = s(fd, "site");
    data.site = sVal && sVal !== "ALL" ? sVal.toUpperCase() : null;
  }
  if (fd.has("pitId")) {
    const pVal = fd.get("pitId");
    data.pitId = pVal && pVal !== "" && pVal !== "ALL" ? Number(pVal) : null;
  }
  if (fd.has("departmentMappingId")) {
    const mVal = fd.get("departmentMappingId");
    data.departmentMappingId = mVal && mVal !== "" && mVal !== "ALL" ? Number(mVal) : null;
  }

  await db.update(kpiTemplates).set(data).where(eq(kpiTemplates.id, id));
  await audit("template", id, isPublish ? "PUBLISH" : "UPDATE", { ...data, version: newVersion });
  revalidateAll();
}


export async function publishTemplate(fd: FormData) {
  fd.set("isPublish", "true");
  return updateTemplate(fd);
}
export async function deleteTemplate(fd: FormData) {
  const id = i(fd, "id");
  if (!id) return;

  const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
  if (!tpl) throw new Error("Template tidak ditemukan.");

  // Guard 1: Cek apakah template sudah di-assign ke penilaian karyawan
  const linkedAppraisals = await db
    .select({
      id: appraisals.id,
      employeeName: employees.name,
      employeeNik: employees.nik,
    })
    .from(appraisals)
    .innerJoin(employees, eq(appraisals.employeeId, employees.id))
    .where(eq(appraisals.templateId, id));

  if (linkedAppraisals.length > 0) {
    const sampleNames = linkedAppraisals
      .slice(0, 3)
      .map((a) => `${a.employeeName} (${a.employeeNik})`)
      .join(", ");
    const moreSuffix = linkedAppraisals.length > 3 ? ` dan ${linkedAppraisals.length - 3} lainnya` : "";
    throw new Error(
      `Template "${tpl.name}" tidak dapat dihapus karena sudah di-assign ke ${linkedAppraisals.length} penilaian karyawan (${sampleNames}${moreSuffix}). Silakan nonaktifkan template ini jika sudah tidak berlaku.`
    );
  }

  // Guard 2: Cek apakah template memiliki konfigurasi penilai (assessor assignments)
  const linkedAssignments = await db
    .select({ id: kpiAssessorAssignments.id })
    .from(kpiAssessorAssignments)
    .innerJoin(kpiCategories, eq(kpiAssessorAssignments.categoryId, kpiCategories.id))
    .where(eq(kpiCategories.templateId, id));

  if (linkedAssignments.length > 0) {
    throw new Error(
      `Template "${tpl.name}" tidak dapat dihapus karena sudah memiliki ${linkedAssignments.length} konfigurasi penugasan penilai. Silakan batalkan penugasan penilai terlebih dahulu atau nonaktifkan template ini.`
    );
  }

  await db.delete(kpiTemplates).where(eq(kpiTemplates.id, id));
  await audit("template", id, "DELETE");
  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  safeRevalidate("/review");
  safeRevalidate("/dashboard");
  revalidateAll();
}

export async function deleteTemplatesBulk(ids: number[]) {
  if (!ids || ids.length === 0) return;

  // Guard 1: Cek appraisals
  const inUseByAppraisals = await db
    .select({
      id: kpiTemplates.id,
      name: kpiTemplates.name,
      count: sql<number>`count(distinct ${appraisals.id})::int`,
    })
    .from(kpiTemplates)
    .innerJoin(appraisals, eq(appraisals.templateId, kpiTemplates.id))
    .where(inArray(kpiTemplates.id, ids))
    .groupBy(kpiTemplates.id, kpiTemplates.name);

  // Guard 2: Cek assessor assignments
  const inUseByAssignments = await db
    .select({
      id: kpiTemplates.id,
      name: kpiTemplates.name,
      count: sql<number>`count(distinct ${kpiAssessorAssignments.id})::int`,
    })
    .from(kpiTemplates)
    .innerJoin(kpiCategories, eq(kpiCategories.templateId, kpiTemplates.id))
    .innerJoin(kpiAssessorAssignments, eq(kpiAssessorAssignments.categoryId, kpiCategories.id))
    .where(inArray(kpiTemplates.id, ids))
    .groupBy(kpiTemplates.id, kpiTemplates.name);

  const blockedMap = new Map<number, { name: string; reasons: string[] }>();
  for (const item of inUseByAppraisals) {
    blockedMap.set(item.id, {
      name: item.name,
      reasons: [`${item.count} penilaian karyawan`],
    });
  }
  for (const item of inUseByAssignments) {
    const existing = blockedMap.get(item.id);
    if (existing) {
      existing.reasons.push(`${item.count} assignment penilai`);
    } else {
      blockedMap.set(item.id, {
        name: item.name,
        reasons: [`${item.count} assignment penilai`],
      });
    }
  }

  if (blockedMap.size > 0) {
    const details = Array.from(blockedMap.values())
      .map((b) => `"${b.name}" (${b.reasons.join(", ")})`)
      .join("; ");
    throw new Error(
      `Sebagian atau seluruh template tidak dapat dihapus karena sudah digunakan: ${details}. Silakan batalkan pilihan template tersebut atau nonaktifkan statusnya.`
    );
  }

  await db.delete(kpiTemplates).where(inArray(kpiTemplates.id, ids));
  for (const id of ids) {
    await audit("template", id, "DELETE_BULK");
  }
  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  safeRevalidate("/review");
  safeRevalidate("/dashboard");
  revalidateAll();
}

export async function normalizeTemplateSortOrders(templateId: number) {
  const cats = await db
    .select()
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, templateId))
    .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

  for (let cIdx = 0; cIdx < cats.length; cIdx++) {
    const cat = cats[cIdx];
    const expectedCatSort = cIdx + 1;
    if (cat.sortOrder !== expectedCatSort) {
      await db
        .update(kpiCategories)
        .set({ sortOrder: expectedCatSort })
        .where(eq(kpiCategories.id, cat.id));
    }

    const params = await db
      .select()
      .from(kpiParameters)
      .where(eq(kpiParameters.categoryId, cat.id))
      .orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id));

    for (let pIdx = 0; pIdx < params.length; pIdx++) {
      const param = params[pIdx];
      const expectedParamSort = pIdx + 1;
      if (param.sortOrder !== expectedParamSort) {
        await db
          .update(kpiParameters)
          .set({ sortOrder: expectedParamSort })
          .where(eq(kpiParameters.id, param.id));
      }

      const bands = await db
        .select()
        .from(kpiBands)
        .where(eq(kpiBands.parameterId, param.id))
        .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id));

      for (let bIdx = 0; bIdx < bands.length; bIdx++) {
        const band = bands[bIdx];
        if (band.sortOrder !== bIdx) {
          await db
            .update(kpiBands)
            .set({ sortOrder: bIdx })
            .where(eq(kpiBands.id, band.id));
        }
      }
    }
  }
}

export async function addCategory(fd: FormData) {
  const templateId = i(fd, "templateId");
  const name = s(fd, "name").trim();
  if (!name) throw new Error("Nama parameter wajib diisi!");
  const weightNum = n(fd, "weight");
  if (weightNum === null || weightNum <= 0) throw new Error("Bobot parameter harus diisi angka lebih dari 0%!");
  const categoryType = (s(fd, "categoryType") || "SUB_ITEMS") as "DIRECT" | "SUB_ITEMS";

  // Calculate highest sortOrder within this template so new category goes to the VERY END
  let sortOrder: number;
  if (fd.has("sortOrder") && i(fd, "sortOrder") > 0) {
    sortOrder = i(fd, "sortOrder");
  } else {
    const existingCats = await db
      .select({ sortOrder: kpiCategories.sortOrder })
      .from(kpiCategories)
      .where(eq(kpiCategories.templateId, templateId));
    const maxSort = existingCats.reduce((max, c) => Math.max(max, c.sortOrder ?? 0), 0);
    sortOrder = maxSort + 1;
  }

  const data = {
    templateId,
    name,
    weight: String(weightNum / 100),
    categoryType,
    sortOrder,
  };
  const [c] = await db.insert(kpiCategories).values(data).returning();

  // If DIRECT mode, create the direct parameter and scoring bands
  if (categoryType === "DIRECT") {
    const unit = s(fd, "unit") || "%";
    const measurementType = s(fd, "measurementType") || "PERCENTAGE";
    const direction = s(fd, "direction") || "HIGHER_IS_BETTER";
    const scoringMethod = s(fd, "scoringMethod") || "CRITERIA_BASED";
    const target = s(fd, "target") || "100";
    const calculationRuleId =
      fd.has("calculationRuleId") && i(fd, "calculationRuleId") > 0
        ? i(fd, "calculationRuleId")
        : null;

    let inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE" = "NUMBER";
    if (measurementType === "PERCENTAGE") inputType = "PERCENTAGE";
    else if (measurementType === "CURRENCY") inputType = "CURRENCY";
    else if (measurementType === "TEXT") inputType = "QUALITATIVE";

    const picRole = (s(fd, "picRole") || "HEAD_DEPT") as
      | "HEAD_DEPT"
      | "HR"
      | "HSE"
      | "SUPERINTENDENT";

    const [p] = await db
      .insert(kpiParameters)
      .values({
        categoryId: c.id,
        name,
        weight: "1.0000",
        maxScore: "25",
        inputType,
        unit,
        target,
        measurementType,
        direction,
        scoringMethod,
        calculationRuleId,
        picRole,
        sortOrder: 0,
      })
      .returning();

    if (scoringMethod === "CRITERIA_BASED" || scoringMethod === "RATING_BASED") {
      if (fd.has("bands")) {
        try {
          const bandsData = JSON.parse(s(fd, "bands"));
          if (Array.isArray(bandsData) && bandsData.length > 0) {
            for (let idx = 0; idx < bandsData.length; idx++) {
              const b = bandsData[idx];
              await db.insert(kpiBands).values({
                parameterId: p.id,
                label: b.label || `Kriteria ${idx + 1}`,
                operator: (b.operator || "GTE") as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT",
                minValue: b.minValue ? String(b.minValue) : null,
                maxValue: b.maxValue ? String(b.maxValue) : null,
                score: String(b.score ?? 25),
                sortOrder: idx,
              });
            }
          }
        } catch {
          // fallback
        }
      } else {
        await db.insert(kpiBands).values([
          { parameterId: p.id, label: "≥ 98% (Sangat Baik)", operator: "GTE", minValue: "98", score: "25", sortOrder: 0 },
          { parameterId: p.id, label: "95% - 97% (Baik)", operator: "BETWEEN", minValue: "95", maxValue: "97", score: "15", sortOrder: 1 },
          { parameterId: p.id, label: "< 95% (Kurang)", operator: "LT", maxValue: "95", score: "5", sortOrder: 2 },
        ]);
      }
    }
  }

  await bumpTemplate(templateId, "ADD_CATEGORY", { categoryId: c.id, ...data });
  revalidateAll();
}

export async function updateCategory(fd: FormData) {
  const id = i(fd, "id");
  const name = s(fd, "name").trim();
  if (!name) throw new Error("Nama parameter wajib diisi!");
  const weightNum = n(fd, "weight");
  if (weightNum === null || weightNum <= 0) throw new Error("Bobot parameter harus diisi angka lebih dari 0%!");

  const existingParams = await db
    .select()
    .from(kpiParameters)
    .where(eq(kpiParameters.categoryId, id));

  const categoryType = (s(fd, "categoryType") || (existingParams.length <= 1 ? "DIRECT" : "SUB_ITEMS")) as "DIRECT" | "SUB_ITEMS";

  const data: Partial<typeof kpiCategories.$inferInsert> = {
    name,
    weight: String(weightNum / 100),
    categoryType,
    ...(fd.has("sortOrder") ? { sortOrder: i(fd, "sortOrder") } : {}),
  };

  await db.update(kpiCategories).set(data).where(eq(kpiCategories.id, id));

  // If switched to or is DIRECT, make sure direct parameter exists and has same name
  if (categoryType === "DIRECT") {
    let directParam = existingParams[0];
    if (!directParam) {
      const [newP] = await db
        .insert(kpiParameters)
        .values({
          categoryId: id,
          name,
          weight: "1.0000",
          maxScore: "25",
          inputType: "PERCENTAGE",
          unit: "%",
          picRole: "HEAD_DEPT",
          sortOrder: 0,
        })
        .returning();
      directParam = newP;
      await db.insert(kpiBands).values([
        { parameterId: directParam.id, label: "≥ 98% (Sangat Baik)", operator: "GTE", minValue: "98", score: "25", sortOrder: 0 },
        { parameterId: directParam.id, label: "95% – 97% (Baik)", operator: "BETWEEN", minValue: "95", maxValue: "97", score: "15", sortOrder: 1 },
        { parameterId: directParam.id, label: "< 95% (Kurang)", operator: "LT", maxValue: "95", score: "5", sortOrder: 2 },
      ]);
    } else {
      await db
        .update(kpiParameters)
        .set({ name, weight: "1.0000" })
        .where(eq(kpiParameters.id, directParam.id));
    }
  }

  await bumpTemplate(i(fd, "templateId"), "UPDATE_CATEGORY", { categoryId: id, ...data });
  revalidateAll();
}
export async function deleteCategory(fd: FormData) {
  const id = i(fd, "id");
  await db.delete(kpiCategories).where(eq(kpiCategories.id, id));
  await bumpTemplate(i(fd, "templateId"), "DELETE_CATEGORY", { categoryId: id });
  revalidateAll();
}

function paramData(fd: FormData) {
  const name = s(fd, "name").trim();
  if (!name) throw new Error("Nama parameter wajib diisi!");
  const weightNum = n(fd, "weight");
  if (weightNum === null || weightNum <= 0) throw new Error("Bobot parameter (Bobot P) harus diisi angka lebih dari 0%!");
  if (weightNum > 100) throw new Error("Bobot parameter (Bobot P) maksimal 100%!");
  const maxScoreRaw = n(fd, "maxScore");
  const maxScoreNum = maxScoreRaw !== null ? maxScoreRaw : 25;
  if (maxScoreNum <= 0) throw new Error("Skor maksimal harus diisi angka lebih dari 0!");

  const measurementType = s(fd, "measurementType") || null;
  const direction = s(fd, "direction") || null;
  const scoringMethod = s(fd, "scoringMethod") || null;

  let inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE" = "NUMBER";
  if (measurementType === "PERCENTAGE") inputType = "PERCENTAGE";
  else if (measurementType === "CURRENCY") inputType = "CURRENCY";
  else if (measurementType === "TEXT") inputType = "QUALITATIVE";
  else if (fd.has("inputType")) {
    inputType = (s(fd, "inputType") || "NUMBER") as any;
  }

  const parentParameterId = fd.has("parentParameterId") && s(fd, "parentParameterId") ? i(fd, "parentParameterId") : null;
  const calculationRuleId = fd.has("calculationRuleId") && s(fd, "calculationRuleId").trim() ? i(fd, "calculationRuleId") : null;

  return {
    name,
    description: s(fd, "description") || null,
    weight: String(weightNum / 100),
    maxScore: String(maxScoreNum),
    inputType,
    aggregation: (s(fd, "aggregation") || "AVERAGE") as "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO",
    compareBasis: (s(fd, "compareBasis") || "ACTUAL") as "ACTUAL" | "ACHIEVEMENT",
    unit: s(fd, "unit") || null,
    target: fd.has("target") && s(fd, "target").trim() ? s(fd, "target").trim() : null,
    picRole: (s(fd, "picRole") || "HEAD_DEPT") as "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT",
    isMonthly: inputType === "MONTHLY_ACTUAL" || s(fd, "isMonthly") === "on",
    sortOrder: i(fd, "sortOrder"),
    parentParameterId,
    calculationRuleId,
    measurementType,
    direction,
    scoringMethod,
  };
}
function getDepartmentPrefix(dept: { code?: string | null; name?: string | null } | null | undefined): string {
  if (!dept) return "Corp";
  const code = (dept.code || "").trim();
  if (code) {
    return code;
  }
  const name = (dept.name || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  if (name) {
    return name.slice(0, 4).toUpperCase();
  }
  return "Dept";
}

export async function generateMasterParamCode(deptId: number | null | undefined, client: any = db): Promise<string> {
  let prefix = "Corp";
  if (deptId) {
    const [dept] = await client
      .select({ code: departments.code, name: departments.name })
      .from(departments)
      .where(eq(departments.id, deptId));
    prefix = getDepartmentPrefix(dept);
  }

  const existing = await client
    .select({ code: masterParameters.code })
    .from(masterParameters)
    .where(deptId ? eq(masterParameters.departmentId, deptId) : isNull(masterParameters.departmentId));

  let maxNum = 0;
  for (const item of existing) {
    if (!item.code) continue;
    const match = item.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(2, "0")}`;
}

export async function addParameter(fd: FormData) {
  const categoryId = i(fd, "categoryId");
  let masterParameterId = fd.has("masterParameterId") && s(fd, "masterParameterId") ? i(fd, "masterParameterId") : null;
  const pData = paramData(fd);

  // Calculate highest sortOrder within this category so new indicator goes to the VERY END
  let sortOrder: number;
  if (fd.has("sortOrder") && i(fd, "sortOrder") > 0) {
    sortOrder = i(fd, "sortOrder");
  } else {
    const existingParams = await db
      .select({ sortOrder: kpiParameters.sortOrder })
      .from(kpiParameters)
      .where(eq(kpiParameters.categoryId, categoryId));
    const maxSort = existingParams.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);
    sortOrder = maxSort + 1;
  }

  // If user requested to save this indicator to Master Parameters dictionary
  if (s(fd, "saveToMaster") === "true" || s(fd, "saveToMaster") === "on") {
    try {
      const templateId = i(fd, "templateId");
      let deptId: number | null = null;
      if (templateId) {
        const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, templateId));
        deptId = tpl?.departmentId ?? null;
      }
      const isGeneral = s(fd, "isGeneralMaster") === "true";
      const targetDeptId = isGeneral ? null : deptId;
      const code = await generateMasterParamCode(targetDeptId);

      let defaultBands = null;
      if (fd.has("bands")) {
        try {
          const parsed = JSON.parse(s(fd, "bands"));
          defaultBands = sanitizeScoringBands(parsed);
        } catch {}
      }

      const [newMaster] = await db.insert(masterParameters).values({
        code,
        name: pData.name,
        description: pData.description,
        departmentId: targetDeptId,
        categoryName: s(fd, "categoryName") || null,
        unit: pData.unit || "%",
        inputType: pData.inputType as any,
        aggregation: pData.aggregation as any,
        compareBasis: pData.compareBasis as any,
        picRole: pData.picRole as any,
        defaultBands: defaultBands as any,
        isActive: true,
      }).returning();

      masterParameterId = newMaster.id;
    } catch {
      // Ignore master insert errors to not block template editing
    }
  }

  const data = { categoryId, ...pData, sortOrder, masterParameterId };
  const [p] = await db.insert(kpiParameters).values(data).returning();

  if (fd.has("bands")) {
    try {
      const bandsData = JSON.parse(s(fd, "bands"));
      if (Array.isArray(bandsData) && bandsData.length > 0) {
        for (let idx = 0; idx < bandsData.length; idx++) {
          const b = bandsData[idx];
          const hasMin = b.minValue !== null && b.minValue !== undefined && b.minValue !== "" && !isNaN(Number(b.minValue));
          const hasMax = b.maxValue !== null && b.maxValue !== undefined && b.maxValue !== "" && !isNaN(Number(b.maxValue));
          let finalMin: string | null = hasMin ? String(Number(b.minValue)) : null;
          let finalMax: string | null = hasMax ? String(Number(b.maxValue)) : null;
          if ((b.operator === "LT" || b.operator === "LTE") && !finalMax && finalMin) {
            finalMax = finalMin;
            finalMin = null;
          }
          await db.insert(kpiBands).values({
            parameterId: p.id,
            label: b.label || `Kriteria ${idx + 1}`,
            operator: (b.operator || "GTE") as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT",
            minValue: finalMin,
            maxValue: finalMax,
            score: String(!isNaN(Number(b.score)) ? Number(b.score) : 25),
            sortOrder: b.sortOrder ?? idx,
          });
        }
      }
    } catch {
      // fallback below if parse fails
    }
  } else if (p.parentParameterId !== null) {
    // Default bands for newly created Indicator / Sub-Point
    await db.insert(kpiBands).values([
      { parameterId: p.id, label: "Sangat Baik", operator: "GTE", minValue: "98", score: "25", sortOrder: 0 },
      { parameterId: p.id, label: "Baik", operator: "BETWEEN", minValue: "95", maxValue: "97", score: "15", sortOrder: 1 },
      { parameterId: p.id, label: "Kurang", operator: "LT", maxValue: "95", score: "5", sortOrder: 2 },
    ]);
  }

  await bumpTemplate(i(fd, "templateId"), "ADD_PARAMETER", { parameterId: p.id, ...data });
  revalidateAll();
}
export async function updateParameter(fd: FormData) {
  const id = i(fd, "id");
  const [existing] = await db.select().from(kpiParameters).where(eq(kpiParameters.id, id));
  if (!existing) throw new Error("Parameter tidak ditemukan");

  const name = s(fd, "name").trim() || existing.name;
  const weightNum = n(fd, "weight") ?? Number(existing.weight) * 100;
  if (weightNum <= 0 || weightNum > 100) {
    throw new Error("Bobot harus bernilai antara 1% sampai 100%!");
  }
  const maxScoreRaw = n(fd, "maxScore");
  const maxScoreNum = maxScoreRaw !== null ? maxScoreRaw : (Number(existing.maxScore) || 25);
  if (maxScoreNum <= 0) throw new Error("Skor maksimal harus diisi angka lebih dari 0!");

  const measurementType = fd.has("measurementType")
    ? (s(fd, "measurementType") || null)
    : existing.measurementType;
  const direction = fd.has("direction")
    ? (s(fd, "direction") || null)
    : existing.direction;
  const scoringMethod = fd.has("scoringMethod")
    ? (s(fd, "scoringMethod") || null)
    : existing.scoringMethod;

  let inputType = existing.inputType;
  if (measurementType === "PERCENTAGE") inputType = "PERCENTAGE";
  else if (measurementType === "CURRENCY") inputType = "CURRENCY";
  else if (measurementType === "TEXT") inputType = "QUALITATIVE";
  else if (fd.has("inputType")) {
    inputType = (s(fd, "inputType") || existing.inputType) as any;
  }

  const parentParameterId = fd.has("parentParameterId") ? (s(fd, "parentParameterId") ? i(fd, "parentParameterId") : null) : existing.parentParameterId;

  const data = {
    name,
    description: fd.has("description") ? (s(fd, "description") || null) : existing.description,
    weight: String(weightNum / 100),
    maxScore: String(maxScoreNum),
    inputType,
    aggregation: (s(fd, "aggregation") || existing.aggregation) as "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO",
    compareBasis: (s(fd, "compareBasis") || existing.compareBasis) as "ACTUAL" | "ACHIEVEMENT",
    unit: fd.has("unit") ? (s(fd, "unit") || null) : existing.unit,
    target: fd.has("target") ? (s(fd, "target").trim() ? String(n(fd, "target") ?? s(fd, "target").trim()) : null) : existing.target,
    picRole: (s(fd, "picRole") || existing.picRole) as "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT",
    isMonthly: inputType === "MONTHLY_ACTUAL" || (fd.has("isMonthly") ? s(fd, "isMonthly") === "on" : existing.isMonthly),
    sortOrder: fd.has("sortOrder") ? i(fd, "sortOrder") : existing.sortOrder,
    parentParameterId,
    calculationRuleId: fd.has("calculationRuleId")
      ? (s(fd, "calculationRuleId").trim() ? i(fd, "calculationRuleId") : null)
      : existing.calculationRuleId,
    measurementType,
    direction,
    scoringMethod,
  };
  await db.update(kpiParameters).set(data).where(eq(kpiParameters.id, id));

  if (fd.has("bands")) {
    try {
      const bandsData = JSON.parse(s(fd, "bands"));
      if (Array.isArray(bandsData)) {
        await db.delete(kpiBands).where(eq(kpiBands.parameterId, id));
        for (let idx = 0; idx < bandsData.length; idx++) {
          const b = bandsData[idx];
          const hasMin = b.minValue !== null && b.minValue !== undefined && b.minValue !== "" && !isNaN(Number(b.minValue));
          const hasMax = b.maxValue !== null && b.maxValue !== undefined && b.maxValue !== "" && !isNaN(Number(b.maxValue));
          let finalMin: string | null = hasMin ? String(Number(b.minValue)) : null;
          let finalMax: string | null = hasMax ? String(Number(b.maxValue)) : null;
          if ((b.operator === "LT" || b.operator === "LTE") && !finalMax && finalMin) {
            finalMax = finalMin;
            finalMin = null;
          }
          await db.insert(kpiBands).values({
            parameterId: id,
            label: b.label || `Kriteria ${idx + 1}`,
            operator: (b.operator || "GTE") as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT",
            minValue: finalMin,
            maxValue: finalMax,
            score: String(!isNaN(Number(b.score)) ? Number(b.score) : 25),
            sortOrder: b.sortOrder ?? idx,
          });
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  await bumpTemplate(i(fd, "templateId"), "UPDATE_PARAMETER", { parameterId: id, ...data });
  revalidateAll();
}
export async function deleteParameter(fd: FormData) {
  const id = i(fd, "id");
  await db.delete(kpiParameters).where(eq(kpiParameters.id, id));
  await bumpTemplate(i(fd, "templateId"), "DELETE_PARAMETER", { parameterId: id });
  revalidateAll();
}

export async function addBand(fd: FormData) {
  const parameterId = i(fd, "parameterId");
  const operator = s(fd, "operator") as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  let sortOrder: number;
  if (fd.has("sortOrder") && i(fd, "sortOrder") >= 0) {
    sortOrder = i(fd, "sortOrder");
  } else {
    const existingBands = await db
      .select({ sortOrder: kpiBands.sortOrder })
      .from(kpiBands)
      .where(eq(kpiBands.parameterId, parameterId));
    const maxSort = existingBands.reduce((max, b) => Math.max(max, b.sortOrder ?? 0), -1);
    sortOrder = maxSort + 1;
  }

  const data = {
    parameterId,
    label: s(fd, "label"),
    operator,
    minValue: n(fd, "minValue") !== null ? String(n(fd, "minValue")) : null,
    maxValue: n(fd, "maxValue") !== null ? String(n(fd, "maxValue")) : null,
    score: String(n(fd, "score") ?? 0),
    sortOrder,
  };
  const [b] = await db.insert(kpiBands).values(data).returning();
  await bumpTemplate(i(fd, "templateId"), "ADD_BAND", { bandId: b.id, ...data });
  revalidateAll();
}

export async function updateBand(fd: FormData) {
  const id = i(fd, "id");
  const operator = s(fd, "operator") as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  const data = {
    label: s(fd, "label"),
    operator,
    minValue: n(fd, "minValue") !== null ? String(n(fd, "minValue")) : null,
    maxValue: n(fd, "maxValue") !== null ? String(n(fd, "maxValue")) : null,
    score: String(n(fd, "score") ?? 0),
  };
  await db.update(kpiBands).set(data).where(eq(kpiBands.id, id));
  await bumpTemplate(i(fd, "templateId"), "UPDATE_BAND", { bandId: id, ...data });
  revalidateAll();
}

export async function duplicateParameter(fd: FormData) {
  const paramId = i(fd, "id");
  const templateId = i(fd, "templateId");
  const [param] = await db.select().from(kpiParameters).where(eq(kpiParameters.id, paramId));
  if (!param) return;

  const existingParams = await db
    .select({ sortOrder: kpiParameters.sortOrder })
    .from(kpiParameters)
    .where(eq(kpiParameters.categoryId, param.categoryId));
  const maxSort = existingParams.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);

  const [newParam] = await db
    .insert(kpiParameters)
    .values({
      categoryId: param.categoryId,
      name: `${param.name} (Copy)`,
      description: param.description,
      weight: param.weight,
      maxScore: param.maxScore,
      inputType: param.inputType,
      aggregation: param.aggregation,
      compareBasis: param.compareBasis,
      unit: param.unit,
      target: param.target,
      picRole: param.picRole,
      isMonthly: param.isMonthly,
      calculationRuleId: param.calculationRuleId,
      sortOrder: maxSort + 1,
    })
    .returning();

  const bands = await db.select().from(kpiBands).where(eq(kpiBands.parameterId, paramId));
  if (bands.length > 0) {
    await db.insert(kpiBands).values(
      bands.map((b) => ({
        parameterId: newParam.id,
        label: b.label,
        operator: b.operator,
        minValue: b.minValue,
        maxValue: b.maxValue,
        score: b.score,
        sortOrder: b.sortOrder,
      }))
    );
  }

  await bumpTemplate(templateId, "DUPLICATE_PARAMETER", { fromId: paramId, newId: newParam.id });
  revalidateAll();
}

export async function deleteBand(fd: FormData) {
  const id = i(fd, "id");
  await db.delete(kpiBands).where(eq(kpiBands.id, id));
  await bumpTemplate(i(fd, "templateId"), "DELETE_BAND", { bandId: id });
  revalidateAll();
}

export interface BatchBandUpdatePayload {
  id: number;
  operatorSymbol: string;
  criteriaValue: string;
  score: string;
}

export interface BatchTemplateUpdatePayload {
  bands?: BatchBandUpdatePayload[];
  categories?: Array<{ id: number; name?: string; weight?: number }>;
  indicators?: Array<{ id: number; name?: string; weight?: number }>;
}

export async function batchUpdateTemplateStructure(
  templateId: number,
  payload: BatchTemplateUpdatePayload
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let updatedBandsCount = 0;
    if (payload.bands && payload.bands.length > 0) {
      for (const item of payload.bands) {
        const val = (item.criteriaValue || "").trim();
        const rawScore = String(item.score ?? "0").trim();

        let fullLabel = val;
        const op = item.operatorSymbol;
        if (op === "<") {
          fullLabel = `< ${val.replace(/^[<>=≤≥\s]+/, "")}`;
        } else if (op === "<=") {
          fullLabel = `≤ ${val.replace(/^(?:<=|>=|≤|≥|=<|=>|\s)+/, "")}`;
        } else if (op === ">") {
          fullLabel = `> ${val.replace(/^[<>=≤≥\s]+/, "")}`;
        } else if (op === ">=") {
          fullLabel = `≥ ${val.replace(/^(?:<=|>=|≤|≥|=<|=>|\s)+/, "")}`;
        } else if (op === "=") {
          fullLabel = `= ${val.replace(/^[<>=≤≥\s]+/, "")}`;
        } else if (op === "Rentang") {
          fullLabel = val;
        } else if (op === "Teks") {
          fullLabel = val;
        }

        const parsed = parseConditionString(fullLabel);
        const data = {
          operator: parsed.operator as "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT",
          label: fullLabel,
          minValue: parsed.minValue !== null && parsed.minValue !== undefined ? String(parsed.minValue) : null,
          maxValue: parsed.maxValue !== null && parsed.maxValue !== undefined ? String(parsed.maxValue) : null,
          score: rawScore,
        };

        await db.update(kpiBands).set(data).where(eq(kpiBands.id, item.id));
        updatedBandsCount++;
      }
    }

    if (payload.categories && payload.categories.length > 0) {
      for (const cat of payload.categories) {
        const updateData: { name?: string; weight?: string } = {};
        if (cat.name !== undefined) updateData.name = cat.name.trim();
        if (cat.weight !== undefined) updateData.weight = String(cat.weight / 100);
        if (Object.keys(updateData).length > 0) {
          await db.update(kpiCategories).set(updateData).where(eq(kpiCategories.id, cat.id));
        }
      }
    }

    if (payload.indicators && payload.indicators.length > 0) {
      for (const ind of payload.indicators) {
        const updateData: { name?: string; weight?: string } = {};
        if (ind.name !== undefined) updateData.name = ind.name.trim();
        if (ind.weight !== undefined) updateData.weight = String(ind.weight / 100);
        if (Object.keys(updateData).length > 0) {
          await db.update(kpiParameters).set(updateData).where(eq(kpiParameters.id, ind.id));
        }
      }
    }

    await bumpTemplate(templateId, "BATCH_UPDATE_STRUCTURE", {
      bandsCount: updatedBandsCount,
      categoriesCount: payload.categories?.length ?? 0,
      indicatorsCount: payload.indicators?.length ?? 0,
    });
    revalidateAll();

    return { success: true, count: updatedBandsCount };
  } catch (err: any) {
    console.error("Error in batchUpdateTemplateStructure:", err);
    return { success: false, count: 0, error: err?.message || "Gagal menyimpan perubahan template." };
  }
}

export interface ImportCategoryInput {
  id?: number | null;
  masterParameterId?: number | null;
  name: string;
  weight: number;
  categoryType?: "DIRECT" | "SUB_ITEMS";
  sortOrder: number;
  params: {
    id?: number | null;
    masterParameterId?: number | null;
    name: string;
    description?: string | null;
    target?: string | null;
    unit?: string | null;
    weight: number;
    maxScore: number;
    inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE";
    aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
    compareBasis?: "ACTUAL" | "ACHIEVEMENT";
    picRole?: "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
    sortOrder: number;
    bands: {
      id?: number | null;
      label: string;
      operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
      minValue?: number | null;
      maxValue?: number | null;
      score: number;
      sortOrder: number;
    }[];
    indicatorName?: string;
    indicatorNumber?: string;
    subParamNumber?: string;
    indicatorWeight?: number;
  }[];
}

function normalizeToBandOperatorEnum(rawOp: string | undefined): "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT" {
  if (!rawOp) return "GTE";
  const upper = rawOp.trim().toUpperCase();
  if (upper === "GTE" || upper === ">=" || upper === "≥") return "GTE";
  if (upper === "GT" || upper === ">") return "GT";
  if (upper === "LTE" || upper === "<=" || upper === "≤") return "LTE";
  if (upper === "LT" || upper === "<") return "LT";
  if (upper === "EQ" || upper === "=" || upper === "==") return "EQ";
  if (upper === "BETWEEN" || upper === "RANGE" || upper === "RENTANG") return "BETWEEN";
  if (upper === "TEXT") return "TEXT";
  return "GTE";
}

export async function importTemplateStructure(
  templateId: number,
  categories: ImportCategoryInput[],
  mode: "REPLACE" | "APPEND" = "REPLACE",
  options?: { skipRevalidate?: boolean; tx?: any }
) {
  const client: any = options?.tx ?? db;
  const [template] = await client.select().from(kpiTemplates).where(eq(kpiTemplates.id, templateId));
  const deptId = template?.departmentId;

  // Cek apakah data import membawa ID existing dari sheet _SYSTEM_MAPPING
  const hasExistingMappingIds = categories.some(
    (c) => c.id || c.params.some((p) => p.id || p.bands.some((b) => b.id))
  );

  // Ambil data existing dari database untuk template ini
  const existingCats: Array<typeof kpiCategories.$inferSelect> = await client
    .select()
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, templateId));
  const existingCatMap = new Map(existingCats.map((c) => [c.id, c]));

  const catIds = existingCats.map((c) => c.id);
  const existingParams: Array<typeof kpiParameters.$inferSelect> =
    catIds.length > 0
      ? await client.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, catIds))
      : [];
  const existingParamMap = new Map(existingParams.map((p) => [p.id, p]));

  const paramIds = existingParams.map((p) => p.id);
  const existingBands: Array<typeof kpiBands.$inferSelect> =
    paramIds.length > 0
      ? await client.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramIds))
      : [];
  const existingBandMap = new Map(existingBands.map((b) => [b.id, b]));

  let baseCatSort = 0;
  if (mode === "APPEND") {
    baseCatSort = existingCats.reduce((max: number, c) => Math.max(max, c.sortOrder ?? 0), 0);
  }

  // Jika mode REPLACE tetapi TIDAK memiliki mapping ID (misal file baru dibuat dari nol)
  if (mode === "REPLACE" && !hasExistingMappingIds) {
    await client.delete(kpiCategories).where(eq(kpiCategories.templateId, templateId));
  }

  let catCount = 0;
  let paramCount = 0;
  let bandCount = 0;
  let newMasterCount = 0;
  let updatedCount = 0;
  let createdCount = 0;

  const touchedCatIds = new Set<number>();
  const touchedParamIds = new Set<number>();
  const touchedBandIds = new Set<number>();

  // Formula engine rules lookup for imported parameters
  const calcRules: Array<typeof kpiCalculationRules.$inferSelect> = await client
    .select()
    .from(kpiCalculationRules)
    .where(eq(kpiCalculationRules.status, "ACTIVE"));
  const normalRule = calcRules.find((r) => r.code === "ACH-NORMAL-V1");
  const inverseRule = calcRules.find((r) => r.code === "ACH-INVERSE-V1");

  // Pre-fetch Master Parameters untuk departemen atau umum dalam 1 query tunggal (O(1) in-memory lookup)
  const existingMasterList = await client
    .select()
    .from(masterParameters)
    .where(
      or(
        deptId ? eq(masterParameters.departmentId, deptId) : isNull(masterParameters.departmentId),
        isNull(masterParameters.departmentId)
      )
    );
  const masterParamMap = new Map<string, typeof masterParameters.$inferSelect>();
  for (const m of existingMasterList) {
    const key = m.name.trim().toLowerCase();
    if (!masterParamMap.has(key) || (m.departmentId && !masterParamMap.get(key)?.departmentId)) {
      masterParamMap.set(key, m);
    }
  }

  const finalCategories: Array<{
    id: number;
    name: string;
    weight: string;
    categoryType: string;
  }> = [];

  const finalParameters: Array<{
    id: number;
    categoryId: number;
    name: string;
    description: string | null;
    target: string | null;
    unit: string | null;
    weight: string;
    maxScore: string;
    sortOrder: number;
  }> = [];

  const finalBands: Array<{
    id: number;
    parameterId: number;
    label: string;
    operator: string;
    minValue: number | null;
    maxValue: number | null;
    score: number;
    sortOrder: number;
  }> = [];

  const newBandsToInsert: Array<{
    parameterId: number;
    label: string;
    operator: any;
    minValue: string | null;
    maxValue: string | null;
    score: string;
    sortOrder: number;
  }> = [];

  for (const c of categories) {
    const determinedType =
      c.categoryType ||
      (c.params.length === 1 &&
      (c.params[0].name.trim().toLowerCase() === c.name.trim().toLowerCase() || Number(c.params[0].weight) === 1)
        ? "DIRECT"
        : "SUB_ITEMS");

    catCount++;
    let targetCatId: number;

    if (hasExistingMappingIds && c.id && existingCatMap.has(c.id)) {
      await client
        .update(kpiCategories)
        .set({
          name: c.name,
          weight: String(c.weight),
          categoryType: determinedType,
          sortOrder: baseCatSort + (c.sortOrder ?? catCount),
        })
        .where(eq(kpiCategories.id, c.id));
      targetCatId = c.id;
      updatedCount++;
    } else {
      const [insertedCat] = await client
        .insert(kpiCategories)
        .values({
          templateId,
          name: c.name,
          weight: String(c.weight),
          categoryType: determinedType,
          sortOrder: baseCatSort + (c.sortOrder ?? catCount),
        })
        .returning();
      targetCatId = insertedCat.id;
      createdCount++;
    }
    touchedCatIds.add(targetCatId);
    finalCategories.push({
      id: targetCatId,
      name: c.name,
      weight: String(c.weight),
      categoryType: determinedType,
    });

    for (const p of c.params) {
      const inputType = p.inputType || "MONTHLY_ACTUAL";

      // Match or Auto-Sync to Master Parameters via in-memory Map
      let matchedMasterId: number | null = p.masterParameterId ?? c.masterParameterId ?? null;
      const lowerName = p.name.trim().toLowerCase();

      if (!matchedMasterId) {
        const cachedMaster = masterParamMap.get(lowerName);
        if (cachedMaster) {
          matchedMasterId = cachedMaster.id;
        }
      }

      if (!matchedMasterId) {
        const isGeneral =
          lowerName.includes("kehadiran") ||
          lowerName.includes("disiplin") ||
          lowerName.includes("k3") ||
          lowerName.includes("hse") ||
          lowerName.includes("core value") ||
          lowerName.includes("5r") ||
          lowerName.includes("nilai");

        const targetDeptId = isGeneral ? null : (deptId ?? null);
        const autoCode = await generateMasterParamCode(targetDeptId, client);

        const [newMaster] = await client
          .insert(masterParameters)
          .values({
            code: autoCode,
            name: p.name.trim(),
            description: p.description || null,
            departmentId: targetDeptId,
            categoryName: c.name.trim(),
            unit: p.unit || "%",
            inputType: inputType as any,
            aggregation: (p.aggregation || "AVERAGE") as any,
            compareBasis: (p.compareBasis || "ACTUAL") as any,
            picRole: (p.picRole || "HEAD_DEPT") as any,
            defaultBands: p.bands && p.bands.length > 0 ? (sanitizeScoringBands(p.bands) as any) : null,
            isActive: true,
          })
          .returning();

        matchedMasterId = newMaster.id;
        masterParamMap.set(lowerName, newMaster);
        newMasterCount++;
      }

      const isInverse =
        lowerName.includes("sp") ||
        lowerName.includes("surat peringatan") ||
        lowerName.includes("pelanggaran") ||
        lowerName.includes("insiden") ||
        lowerName.includes("accident") ||
        lowerName.includes("kepatuhan") ||
        lowerName.includes("absensi") ||
        lowerName.includes("terlambat") ||
        c.name.toLowerCase().includes("sp") ||
        c.name.toLowerCase().includes("kepatuhan");

      const calcRuleId = isInverse ? (inverseRule?.id ?? null) : (normalRule?.id ?? null);
      paramCount++;
      let targetParamId: number;

      if (hasExistingMappingIds && p.id && existingParamMap.has(p.id)) {
        await client
          .update(kpiParameters)
          .set({
            categoryId: targetCatId,
            name: p.name,
            description: p.description || null,
            target: p.target || null,
            unit: p.unit || null,
            weight: String(p.weight),
            maxScore: String(p.maxScore || 25),
            inputType: inputType as any,
            aggregation: (p.aggregation || "AVERAGE") as any,
            compareBasis: (p.compareBasis || "ACTUAL") as any,
            picRole: (p.picRole || "HEAD_DEPT") as any,
            isMonthly: inputType === "MONTHLY_ACTUAL",
            sortOrder: p.sortOrder ?? paramCount,
            masterParameterId: matchedMasterId,
            calculationRuleId: calcRuleId,
          })
          .where(eq(kpiParameters.id, p.id));
        targetParamId = p.id;
        updatedCount++;
      } else {
        const [insertedParam] = await client
          .insert(kpiParameters)
          .values({
            categoryId: targetCatId,
            name: p.name,
            description: p.description || null,
            target: p.target || null,
            unit: p.unit || null,
            weight: String(p.weight),
            maxScore: String(p.maxScore || 25),
            inputType: inputType as any,
            aggregation: (p.aggregation || "AVERAGE") as any,
            compareBasis: (p.compareBasis || "ACTUAL") as any,
            picRole: (p.picRole || "HEAD_DEPT") as any,
            isMonthly: inputType === "MONTHLY_ACTUAL",
            sortOrder: p.sortOrder ?? paramCount,
            masterParameterId: matchedMasterId,
            calculationRuleId: calcRuleId,
          })
          .returning();
        targetParamId = insertedParam.id;
        createdCount++;
      }
      touchedParamIds.add(targetParamId);
      finalParameters.push({
        id: targetParamId,
        categoryId: targetCatId,
        name: p.name,
        description: p.description || null,
        target: p.target || null,
        unit: p.unit || null,
        weight: String(p.weight),
        maxScore: String(p.maxScore || 25),
        sortOrder: p.sortOrder ?? paramCount,
      });

      for (const b of p.bands) {
        bandCount++;
        const normalizedOp = normalizeToBandOperatorEnum(b.operator);

        if (hasExistingMappingIds && b.id && existingBandMap.has(b.id)) {
          await client
            .update(kpiBands)
            .set({
              parameterId: targetParamId,
              label: b.label,
              operator: normalizedOp,
              minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
              maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
              score: String(b.score),
              sortOrder: b.sortOrder ?? bandCount,
            })
            .where(eq(kpiBands.id, b.id));
          updatedCount++;
          touchedBandIds.add(b.id);
          finalBands.push({
            id: b.id,
            parameterId: targetParamId,
            label: b.label,
            operator: normalizedOp,
            minValue: b.minValue !== null && b.minValue !== undefined ? Number(b.minValue) : null,
            maxValue: b.maxValue !== null && b.maxValue !== undefined ? Number(b.maxValue) : null,
            score: Number(b.score),
            sortOrder: b.sortOrder ?? bandCount,
          });
        } else {
          newBandsToInsert.push({
            parameterId: targetParamId,
            label: b.label,
            operator: normalizedOp,
            minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
            maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
            score: String(b.score),
            sortOrder: b.sortOrder ?? bandCount,
          });
        }
      }
    }
  }

  // Batch insert untuk semua baris kriteria rentang baru (1 query tunggal)
  if (newBandsToInsert.length > 0) {
    const insertedBands = await client
      .insert(kpiBands)
      .values(newBandsToInsert)
      .returning();

    for (const ib of insertedBands) {
      touchedBandIds.add(ib.id);
      createdCount++;
      finalBands.push({
        id: ib.id,
        parameterId: ib.parameterId,
        label: ib.label,
        operator: ib.operator,
        minValue: ib.minValue !== null ? Number(ib.minValue) : null,
        maxValue: ib.maxValue !== null ? Number(ib.maxValue) : null,
        score: Number(ib.score),
        sortOrder: ib.sortOrder,
      });
    }
  }

  // Jika mode REPLACE dan berbasis mapping ID, hapus elemen yang dihapus di file Excel
  if (mode === "REPLACE" && hasExistingMappingIds) {
    const bandsToDelete = existingBands.filter((b: typeof kpiBands.$inferSelect) => !touchedBandIds.has(b.id)).map((b: typeof kpiBands.$inferSelect) => b.id);
    if (bandsToDelete.length > 0) {
      await client.delete(kpiBands).where(inArray(kpiBands.id, bandsToDelete));
    }

    const paramsToDelete = existingParams.filter((p: typeof kpiParameters.$inferSelect) => !touchedParamIds.has(p.id)).map((p: typeof kpiParameters.$inferSelect) => p.id);
    if (paramsToDelete.length > 0) {
      await client.delete(kpiParameters).where(inArray(kpiParameters.id, paramsToDelete));
    }

    const catsToDelete = existingCats.filter((c: typeof kpiCategories.$inferSelect) => !touchedCatIds.has(c.id)).map((c: typeof kpiCategories.$inferSelect) => c.id);
    if (catsToDelete.length > 0) {
      await client.delete(kpiCategories).where(inArray(kpiCategories.id, catsToDelete));
    }
  }

  await bumpTemplate(templateId, "IMPORT_EXCEL_STRUCTURE", {
    mode,
    categoriesCount: catCount,
    parametersCount: paramCount,
    bandsCount: bandCount,
    newMasterCount,
    updatedCount,
    createdCount,
  }, client);

  if (!options?.skipRevalidate) {
    safeRevalidate("/setup/templates");
    safeRevalidate(`/setup/templates/${templateId}`);
  }

  return {
    catCount,
    paramCount,
    bandCount,
    newMasterCount,
    updatedCount,
    createdCount,
    structure: {
      categories: finalCategories,
      parameters: finalParameters,
      bands: finalBands,
    },
  };
}

export async function createTemplateFromExcel(
  name: string,
  departmentId: number,
  jobLevelId: number,
  categories: ImportCategoryInput[],
  periodYearOrId?: string | number | null,
  jobPositionId?: number | null,
  autoPublish = true,
  options?: { tx?: any }
) {
  const client: any = options?.tx ?? db;

  let periodId: number | null = null;
  if (typeof periodYearOrId === "number") {
    periodId = periodYearOrId;
  } else if (typeof periodYearOrId === "string" && periodYearOrId.trim()) {
    const yearNum = parseInt(periodYearOrId.trim(), 10);
    if (!isNaN(yearNum)) {
      const [p] = await client
        .select({ id: kpiPeriods.id })
        .from(kpiPeriods)
        .where(eq(kpiPeriods.year, yearNum))
        .limit(1);
      if (p) periodId = p.id;
    }
  }

  // Fallback ke periode aktif atau periode terbaru jika belum terpetakan
  if (!periodId) {
    const [activeP] = await client
      .select({ id: kpiPeriods.id })
      .from(kpiPeriods)
      .where(eq(kpiPeriods.status, "ACTIVE"))
      .limit(1);
    if (activeP) {
      periodId = activeP.id;
    } else {
      const [latestP] = await client
        .select({ id: kpiPeriods.id })
        .from(kpiPeriods)
        .orderBy(desc(kpiPeriods.year))
        .limit(1);
      if (latestP) periodId = latestP.id;
    }
  }

  const [row] = await client
    .insert(kpiTemplates)
    .values({
      name,
      departmentId,
      jobLevelId,
      jobPositionId: jobPositionId || null,
      periodId,
      description: typeof periodYearOrId === "string" ? `Periode ${periodYearOrId}` : undefined,
      totalWeight:
        categories && categories.length > 0
          ? categories.reduce((sum, c) => sum + Number(c.weight || 0), 0).toFixed(4)
          : "1.0000",
      isActive: autoPublish ? true : false,
      version: 1,
    })
    .returning();

  await audit("template", row.id, autoPublish ? "PUBLISH" : "CREATE", {
    name: row.name,
    source: "IMPORT_EXCEL",
    isActive: autoPublish,
  }, "admin", client);

  let importRes: Awaited<ReturnType<typeof importTemplateStructure>> | undefined;
  if (categories && categories.length > 0) {
    importRes = await importTemplateStructure(row.id, categories, "REPLACE", { skipRevalidate: true, tx: client });
  }

  if (!options?.tx) {
    safeRevalidate("/setup/templates");
  }
  return { id: row.id, name: row.name, periodId, structure: importRes?.structure };
}

export async function saveImportedMasterTemplateAction(input: {
  name: string;
  departmentId: number;
  jobLevelId: number;
  jobPositionId?: number | null;
  periodYear?: string;
  categories: ImportCategoryInput[];
  employeeNik?: string | null;
  employeeName?: string | null;
  employeeId?: number | null;
  autoPublish?: boolean;
  fileMetadata?: {
    fileName?: string;
    fileSize?: number;
    sheetName?: string;
  };
}): Promise<{
  success: boolean;
  templateId?: number;
  templateName?: string;
  assignedEmployee?: {
    id: number;
    nik: string;
    name: string;
  };
  appraisalId?: number;
  isUpdatedExisting?: boolean;
  error?: string;
}> {
  try {
    // 1. Validasi Pra-Simpan (Validation Gate): Verifikasi kelayakan data sebelum menyentuh database
    if (!input.name?.trim()) {
      return { success: false, error: "Nama Master Template wajib diisi." };
    }
    if (!input.departmentId) {
      return { success: false, error: "Departemen wajib dipilih." };
    }
    if (!input.jobLevelId) {
      return { success: false, error: "Job Level wajib dipilih." };
    }
    if (!input.categories || input.categories.length === 0) {
      return { success: false, error: "Data parameter KPI tidak boleh kosong." };
    }

    // Validasi kelengkapan kategori dan indikator
    for (const c of input.categories) {
      if (!c.name?.trim()) {
        return { success: false, error: "Setiap kategori wajib memiliki nama yang valid." };
      }
      if (!c.params || c.params.length === 0) {
        return { success: false, error: `Kategori "${c.name}" tidak memiliki indikator/parameter.` };
      }
      for (const p of c.params) {
        if (!p.name?.trim()) {
          return { success: false, error: `Terdapat indikator tanpa nama pada kategori "${c.name}".` };
        }
        if (!p.bands || p.bands.length === 0) {
          return { success: false, error: `Indikator "${p.name}" wajib memiliki kriteria rentang nilai (bands).` };
        }
      }
    }

    const autoPublish = input.autoPublish !== false;

    // 2. Eksekusi Atomik dalam DB Transaction: Mencegah data master parsial jika terjadi kegagalan
    const txResult = await db.transaction(async (tx) => {
      // A. Resolve Periode Evaluasi
      let periodId: number | null = null;
      if (typeof input.periodYear === "string" && input.periodYear.trim()) {
        const yearNum = parseInt(input.periodYear.trim(), 10);
        if (!isNaN(yearNum)) {
          const [p] = await tx
            .select({ id: kpiPeriods.id })
            .from(kpiPeriods)
            .where(eq(kpiPeriods.year, yearNum))
            .limit(1);
          if (p) periodId = p.id;
        }
      }

      if (!periodId) {
        const [activeP] = await tx
          .select({ id: kpiPeriods.id })
          .from(kpiPeriods)
          .where(eq(kpiPeriods.status, "ACTIVE"))
          .limit(1);
        if (activeP) {
          periodId = activeP.id;
        } else {
          const [latestP] = await tx
            .select({ id: kpiPeriods.id })
            .from(kpiPeriods)
            .orderBy(desc(kpiPeriods.year))
            .limit(1);
          if (latestP) periodId = latestP.id;
        }
      }

      const totalWeightStr = input.categories
        .reduce((sum, c) => sum + Number(c.weight || 0), 0)
        .toFixed(4);

      // B. Proteksi Duplikasi Master Template:
      // Periksa apakah template dengan kombinasi departemen, job level, jabatan, dan nama sudah ada
      const [existingTemplate] = await tx
        .select()
        .from(kpiTemplates)
        .where(
          and(
            eq(kpiTemplates.departmentId, input.departmentId),
            eq(kpiTemplates.jobLevelId, input.jobLevelId),
            input.jobPositionId ? eq(kpiTemplates.jobPositionId, input.jobPositionId) : isNull(kpiTemplates.jobPositionId),
            ilike(kpiTemplates.name, input.name.trim())
          )
        )
        .limit(1);

      let targetTemplateId: number;
      let isUpdated = false;

      if (existingTemplate) {
        // Update template yang ada secara in-place (mencegah duplikasi baris master template)
        const nextVersion = (existingTemplate.version || 1) + 1;
        await tx
          .update(kpiTemplates)
          .set({
            periodId,
            description: input.periodYear ? `Periode ${input.periodYear}` : existingTemplate.description,
            totalWeight: totalWeightStr,
            isActive: autoPublish ? true : false,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(kpiTemplates.id, existingTemplate.id));

        targetTemplateId = existingTemplate.id;
        isUpdated = true;
      } else {
        // Buat entri template baru
        const [newTpl] = await tx
          .insert(kpiTemplates)
          .values({
            name: input.name.trim(),
            departmentId: input.departmentId,
            jobLevelId: input.jobLevelId,
            jobPositionId: input.jobPositionId || null,
            periodId,
            description: input.periodYear ? `Periode ${input.periodYear}` : undefined,
            totalWeight: totalWeightStr,
            isActive: autoPublish ? true : false,
            version: 1,
          })
          .returning();

        targetTemplateId = newTpl.id;
      }

      // C. Impor struktur kategori, parameter, dan kriteria bands secara atomik dalam tx
      const importRes = await importTemplateStructure(
        targetTemplateId,
        input.categories,
        "REPLACE",
        { skipRevalidate: true, tx }
      );

      // D. Pencocokan & Penugasan Karyawan Default (Appraisal & Appraisal Items)
      let assignedEmp: { id: number; nik: string; name: string } | undefined;
      let activeAppraisalId: number | undefined;

      let targetEmployee: typeof employees.$inferSelect | undefined;
      if (input.employeeId) {
        const [e] = await tx
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        targetEmployee = e;
      } else if (input.employeeNik?.trim()) {
        const cleanNik = input.employeeNik.trim();
        const [e] = await tx
          .select()
          .from(employees)
          .where(eq(employees.nik, cleanNik))
          .limit(1);
        targetEmployee = e;
      }

      if (!targetEmployee && input.employeeName?.trim()) {
        const cleanName = input.employeeName.trim();
        const [e] = await tx
          .select()
          .from(employees)
          .where(ilike(employees.name, cleanName))
          .limit(1);
        targetEmployee = e;
      }

      if (targetEmployee && periodId) {
        const empId = targetEmployee.id;

        const [period] = await tx
          .select()
          .from(kpiPeriods)
          .where(eq(kpiPeriods.id, periodId))
          .limit(1);

        const tenure = tenureMonths(targetEmployee.dateOfHire, period?.evaluationDate ?? new Date());
        const eligible = period ? tenure >= (period.minTenureMonths ?? 0) : true;

        const [existingAppraisal] = await tx
          .select()
          .from(appraisals)
          .where(
            and(
              eq(appraisals.employeeId, empId),
              eq(appraisals.periodId, periodId)
            )
          )
          .limit(1);

        if (existingAppraisal) {
          await tx
            .update(appraisals)
            .set({
              templateId: targetTemplateId,
              tenureMonths: tenure,
              isEligible: eligible,
              updatedAt: new Date(),
            })
            .where(eq(appraisals.id, existingAppraisal.id));

          activeAppraisalId = existingAppraisal.id;
          await tx.delete(appraisalItems).where(eq(appraisalItems.appraisalId, existingAppraisal.id));
        } else {
          const [insertedAppraisal] = await tx
            .insert(appraisals)
            .values({
              periodId,
              employeeId: empId,
              templateId: targetTemplateId,
              appraiserId: targetEmployee.appraiserId ?? null,
              tenureMonths: tenure,
              isEligible: eligible,
              status: "DRAFT",
              currentStage: "PENILAI",
            })
            .returning();

          activeAppraisalId = insertedAppraisal.id;
        }

        // Isi snapshot appraisalItems dari in-memory structure hasil import (0 select query)
        const struct = importRes.structure;
        if (struct && struct.categories.length > 0 && struct.parameters.length > 0) {
          const catWeightMap = new Map(struct.categories.map((c) => [c.id, c.weight]));
          const bandsMap = new Map<number, Array<{ id: number; label: string; operator: string; minValue: number | null; maxValue: number | null; score: number; sortOrder: number }>>();
          for (const b of struct.bands) {
            const list = bandsMap.get(b.parameterId) || [];
            list.push(b);
            bandsMap.set(b.parameterId, list);
          }

          await tx.insert(appraisalItems).values(
            struct.parameters.map((p) => ({
              appraisalId: activeAppraisalId!,
              parameterId: p.id,
              indicatorNameSnapshot: p.name,
              parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
              target: p.target,
              targetSnapshot: p.target,
              unitSnapshot: p.unit,
              weightSnapshot: p.weight,
              scoringRulesSnapshot: bandsMap.get(p.id) || [],
              monthlyTargets: p.target !== null && p.target !== undefined && !isNaN(Number(p.target)) ? Array(12).fill(Number(p.target)) : null,
            }))
          );
        }

        assignedEmp = {
          id: targetEmployee.id,
          nik: targetEmployee.nik,
          name: targetEmployee.name,
        };

        await audit("appraisal", activeAppraisalId, "CREATE_FROM_IMPORT", {
          employeeId: targetEmployee.id,
          nik: targetEmployee.nik,
          templateId: targetTemplateId,
          periodId,
        }, "admin", tx);
      }

      // E. Audit Log Metadata File Excel (Penyimpanan metadata audit tanpa menyimpan file biner permanen)
      await audit("template", targetTemplateId, autoPublish ? "PUBLISH_FROM_EXCEL" : "IMPORT_EXCEL", {
        name: input.name.trim(),
        departmentId: input.departmentId,
        jobLevelId: input.jobLevelId,
        jobPositionId: input.jobPositionId || null,
        periodId,
        isUpdated,
        assignedEmployee: assignedEmp ? { nik: assignedEmp.nik, name: assignedEmp.name } : null,
        categoriesCount: input.categories.length,
        fileMetadata: input.fileMetadata ? {
          fileName: input.fileMetadata.fileName,
          fileSize: input.fileMetadata.fileSize,
          sheetName: input.fileMetadata.sheetName,
          importedAt: new Date().toISOString(),
          retentionPolicy: "TEMPORARY_BUFFER_CLEARED",
        } : null,
      }, "admin", tx);

      return {
        templateId: targetTemplateId,
        templateName: input.name.trim(),
        assignedEmployee: assignedEmp,
        appraisalId: activeAppraisalId,
        isUpdatedExisting: isUpdated,
      };
    });

    // 3. Revalidasi Terarah Setelah Transaksi Sukses Berkomitmen
    safeRevalidate("/setup/templates");
    safeRevalidate("/setup/templates/import");
    safeRevalidate("/setup/assignments");

    return {
      success: true,
      ...txResult,
    };
  } catch (err: unknown) {
    console.error("Gagal menyimpan Master Template (transaksi dibatalkan):", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat menyimpan template.",
    };
  }
}

export interface ExistingTemplateComparisonData {
  found: boolean;
  template?: {
    id: number;
    name: string;
    code?: string | null;
    totalWeight: string;
    isActive: boolean;
  };
  categories?: Array<{
    id: number;
    name: string;
    weight: number;
    categoryType: string;
    params: Array<{
      id: number;
      name: string;
      target: string | null;
      unit: string | null;
      weight: number;
      maxScore: number;
      inputType: string;
      bands: Array<{
        score: number;
        label: string;
        operator: string;
        minValue: number | null;
        maxValue: number | null;
      }>;
    }>;
  }>;
}

export async function getExistingMasterTemplateForComparisonAction(input: {
  departmentId: number;
  jobLevelId: number;
  jobPositionId?: number | null;
  periodYear?: string;
}): Promise<ExistingTemplateComparisonData> {
  try {
    if (!input.departmentId || !input.jobLevelId) {
      return { found: false };
    }

    // Jika jobPositionId diberikan, cari template spesifik untuk jabatan tersebut terlebih dahulu
    let templates = input.jobPositionId
      ? await db
          .select()
          .from(kpiTemplates)
          .where(
            and(
              eq(kpiTemplates.departmentId, input.departmentId),
              eq(kpiTemplates.jobLevelId, input.jobLevelId),
              eq(kpiTemplates.jobPositionId, input.jobPositionId)
            )
          )
          .orderBy(desc(kpiTemplates.isActive), desc(kpiTemplates.id))
          .limit(1)
      : [];

    if (templates.length === 0) {
      templates = await db
        .select()
        .from(kpiTemplates)
        .where(
          and(
            eq(kpiTemplates.departmentId, input.departmentId),
            eq(kpiTemplates.jobLevelId, input.jobLevelId)
          )
        )
        .orderBy(desc(kpiTemplates.isActive), desc(kpiTemplates.id))
        .limit(1);
    }

    if (templates.length === 0) {
      return { found: false };
    }

    const tpl = templates[0];

    const cats = await db
      .select()
      .from(kpiCategories)
      .where(eq(kpiCategories.templateId, tpl.id))
      .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

    const catIds = cats.map((c) => c.id);
    const paramsList = catIds.length
      ? await db
          .select()
          .from(kpiParameters)
          .where(inArray(kpiParameters.categoryId, catIds))
          .orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id))
      : [];

    const paramIds = paramsList.map((p) => p.id);
    const bandsList = paramIds.length
      ? await db
          .select()
          .from(kpiBands)
          .where(inArray(kpiBands.parameterId, paramIds))
          .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
      : [];

    const structuredCategories = cats.map((c) => {
      const cParams = paramsList.filter((p) => p.categoryId === c.id);
      return {
        id: c.id,
        name: c.name,
        weight: Number(c.weight || 0),
        categoryType: c.categoryType,
        params: cParams.map((p) => {
          const pBands = bandsList.filter((b) => b.parameterId === p.id);
          return {
            id: p.id,
            name: p.name,
            target: p.target,
            unit: p.unit,
            weight: Number(p.weight || 0),
            maxScore: Number(p.maxScore || 25),
            inputType: p.inputType,
            bands: pBands.map((b) => ({
              score: Number(b.score),
              label: b.label,
              operator: b.operator,
              minValue: b.minValue ? Number(b.minValue) : null,
              maxValue: b.maxValue ? Number(b.maxValue) : null,
            })),
          };
        }),
      };
    });

    return {
      found: true,
      template: {
        id: tpl.id,
        name: tpl.name,
        code: tpl.code,
        totalWeight: tpl.totalWeight,
        isActive: tpl.isActive,
      },
      categories: structuredCategories,
    };
  } catch (err) {
    console.error("Gagal mengambil master template untuk komparasi:", err);
    return { found: false };
  }
}

export interface ResolvedExcelTargetResult {
  departmentId?: number;
  departmentName?: string;
  jobLevelId?: number;
  jobLevelName?: string;
  jobPositionId?: number;
  jobPositionName?: string;
  matchedEmployee?: {
    id: number;
    name: string;
    nik: string;
    jobPositionName?: string;
    deptName?: string;
    levelName?: string;
  };
  extractedFields: {
    name?: string;
    nik?: string;
    jobPosition?: string;
    department?: string;
  };
}

export async function resolveExcelHeaderTargetAction(input: {
  name?: string;
  nik?: string;
  jobPosition?: string;
  department?: string;
  fileName?: string;
  sheetName?: string;
}): Promise<ResolvedExcelTargetResult> {
  const result: ResolvedExcelTargetResult = {
    extractedFields: {
      name: input.name?.trim(),
      nik: input.nik?.trim(),
      jobPosition: input.jobPosition?.trim(),
      department: input.department?.trim(),
    },
  };

  try {
    const cleanNik = input.nik?.trim();
    const cleanName = input.name?.trim();

    // 1. Prioritas 1: Cari Karyawan di database berdasarkan NIK atau Nama
    if (cleanNik || cleanName) {
      let matchedEmpRows: Array<{
        id: number;
        name: string;
        nik: string;
        departmentId: number | null;
        jobPositionId: number | null;
        jobLevelId: number | null;
        deptName: string | null;
        positionName: string | null;
        levelName: string | null;
      }> = [];

      if (cleanNik) {
        matchedEmpRows = await db
          .select({
            id: employees.id,
            name: employees.name,
            nik: employees.nik,
            departmentId: employees.departmentId,
            jobPositionId: employees.jobPositionId,
            jobLevelId: employees.jobLevelId,
            deptName: departments.name,
            positionName: jobPositions.name,
            levelName: jobLevels.name,
          })
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .leftJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
          .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
          .where(eq(employees.nik, cleanNik))
          .limit(1);
      }

      if (matchedEmpRows.length === 0 && cleanName && cleanName.length >= 3) {
        matchedEmpRows = await db
          .select({
            id: employees.id,
            name: employees.name,
            nik: employees.nik,
            departmentId: employees.departmentId,
            jobPositionId: employees.jobPositionId,
            jobLevelId: employees.jobLevelId,
            deptName: departments.name,
            positionName: jobPositions.name,
            levelName: jobLevels.name,
          })
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .leftJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
          .leftJoin(jobLevels, eq(employees.jobLevelId, jobLevels.id))
          .where(ilike(employees.name, `%${cleanName}%`))
          .limit(1);
      }

      if (matchedEmpRows.length > 0) {
        const emp = matchedEmpRows[0];
        result.matchedEmployee = {
          id: emp.id,
          name: emp.name,
          nik: emp.nik,
          jobPositionName: emp.positionName || undefined,
          deptName: emp.deptName || undefined,
          levelName: emp.levelName || undefined,
        };
        if (emp.departmentId) {
          result.departmentId = emp.departmentId;
          result.departmentName = emp.deptName || undefined;
        }
        if (emp.jobLevelId) {
          result.jobLevelId = emp.jobLevelId;
          result.jobLevelName = emp.levelName || undefined;
        }
        if (emp.jobPositionId) {
          result.jobPositionId = emp.jobPositionId;
          result.jobPositionName = emp.positionName || undefined;
        }
        return result;
      }
    }

    // 2. Prioritas 2: Cari Jabatan (Job Position) di database
    const cleanPos = input.jobPosition?.trim();
    if (cleanPos && cleanPos.length >= 3) {
      const matchedPos = await db
        .select({
          id: jobPositions.id,
          name: jobPositions.name,
          departmentId: jobPositions.departmentId,
          jobLevelId: jobPositions.jobLevelId,
          deptName: departments.name,
          levelName: jobLevels.name,
        })
        .from(jobPositions)
        .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
        .leftJoin(jobLevels, eq(jobPositions.jobLevelId, jobLevels.id))
        .where(ilike(jobPositions.name, `%${cleanPos}%`))
        .limit(1);

      if (matchedPos.length > 0) {
        const pos = matchedPos[0];
        result.jobPositionId = pos.id;
        result.jobPositionName = pos.name;
        if (!result.departmentId && pos.departmentId) {
          result.departmentId = pos.departmentId;
          result.departmentName = pos.deptName || undefined;
        }
        if (!result.jobLevelId && pos.jobLevelId) {
          result.jobLevelId = pos.jobLevelId;
          result.jobLevelName = pos.levelName || undefined;
        }
      }
    }

    // 3. Prioritas 3: Cari Departemen berdasarkan nama, kode, atau alias
    if (!result.departmentId) {
      const candDept = (input.department || input.fileName || input.sheetName || "").trim().toLowerCase();
      const allDepts = await db.select().from(departments);

      // Cek alias umum terlebih dahulu
      if (candDept.includes("procure") || candDept.includes("purchas")) {
        const found = allDepts.find(
          (d) =>
            d.name.toLowerCase().includes("purchas") ||
            d.name.toLowerCase().includes("procure") ||
            d.code?.toLowerCase() === "pur"
        );
        if (found) {
          result.departmentId = found.id;
          result.departmentName = found.name;
        }
      } else if (candDept.includes("logis") || candDept.includes("gudang")) {
        const found = allDepts.find((d) => d.name.toLowerCase().includes("logis"));
        if (found) {
          result.departmentId = found.id;
          result.departmentName = found.name;
        }
      } else if (candDept.includes("prod") || candDept.includes("mining")) {
        const found = allDepts.find((d) => d.name.toLowerCase().includes("prod"));
        if (found) {
          result.departmentId = found.id;
          result.departmentName = found.name;
        }
      } else if (candDept.includes("finan") || candDept.includes("keuangan")) {
        const found = allDepts.find(
          (d) => d.name.toLowerCase().includes("keuangan") || d.name.toLowerCase().includes("finance")
        );
        if (found) {
          result.departmentId = found.id;
          result.departmentName = found.name;
        }
      } else {
        // Cek exact match
        for (const d of allDepts) {
          const dName = d.name.toLowerCase();
          const dCode = d.code ? d.code.toLowerCase() : "";
          if (candDept === dName || (dCode && candDept === dCode)) {
            result.departmentId = d.id;
            result.departmentName = d.name;
            break;
          }
          if (dName.length >= 4 && candDept.includes(dName)) {
            result.departmentId = d.id;
            result.departmentName = d.name;
            break;
          }
        }
      }
    }

    // 4. Prioritas 4: Resolusi Job Level jika belum terisi
    if (!result.jobLevelId) {
      const allLevels = await db.select().from(jobLevels);
      const candPos = (input.jobPosition || "").toLowerCase();

      if (candPos.includes("non-staff") || candPos.includes("non staff")) {
        const found = allLevels.find((l) => l.name.toLowerCase().includes("non"));
        if (found) {
          result.jobLevelId = found.id;
          result.jobLevelName = found.name;
        }
      } else if (candPos.includes("staff") && !candPos.includes("non")) {
        const found = allLevels.find(
          (l) => l.name.toLowerCase() === "staff" || l.code?.toLowerCase() === "stf"
        );
        if (found) {
          result.jobLevelId = found.id;
          result.jobLevelName = found.name;
        }
      } else if (candPos.includes("supervisor") || candPos.includes("spv")) {
        const found = allLevels.find((l) => l.name.toLowerCase().includes("supervisor"));
        if (found) {
          result.jobLevelId = found.id;
          result.jobLevelName = found.name;
        }
      } else if (candPos.includes("superintendent") || candPos.includes("supt")) {
        const found = allLevels.find((l) => l.name.toLowerCase().includes("superintendent"));
        if (found) {
          result.jobLevelId = found.id;
          result.jobLevelName = found.name;
        }
      } else if (candPos.includes("manager") || candPos.includes("dept. head") || candPos.includes("dept head")) {
        const found = allLevels.find(
          (l) => l.name.toLowerCase() === "manager" || l.code?.toLowerCase() === "mgr"
        );
        if (found) {
          result.jobLevelId = found.id;
          result.jobLevelName = found.name;
        }
      }
    }

    return result;
  } catch (err) {
    console.error("Gagal resolve excel header target:", err);
    return result;
  }
}



export async function createMasterParameterFromImportAction(input: {
  name: string;
  departmentId: number;
  categoryName?: string;
  unit?: string;
  description?: string;
  inputType?: string;
  bands?: Array<{
    score: number;
    label: string;
    operator: string;
    minValue?: number | null;
    maxValue?: number | null;
  }>;
}): Promise<{
  success: boolean;
  masterParameter?: {
    id: number;
    code: string | null;
    name: string;
    departmentId: number | null;
    unit: string | null;
    categoryName: string | null;
    description: string | null;
  };
  error?: string;
}> {
  try {
    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Nama indikator tidak boleh kosong." };
    }
    if (!input.departmentId) {
      return { success: false, error: "Departemen wajib dipilih." };
    }

    const existing = await db
      .select()
      .from(masterParameters)
      .where(
        and(
          ilike(masterParameters.name, name),
          eq(masterParameters.departmentId, input.departmentId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        success: true,
        masterParameter: {
          id: existing[0].id,
          code: existing[0].code,
          name: existing[0].name,
          departmentId: existing[0].departmentId,
          unit: existing[0].unit,
          categoryName: existing[0].categoryName,
          description: existing[0].description,
        },
      };
    }

    const autoCode = await generateMasterParamCode(input.departmentId);
    const bands = input.bands && input.bands.length > 0 ? sanitizeScoringBands(input.bands) : null;

    const [created] = await db
      .insert(masterParameters)
      .values({
        code: autoCode,
        name,
        description: input.description || null,
        departmentId: input.departmentId,
        categoryName: input.categoryName || "Target Kerja",
        unit: input.unit || "%",
        inputType: (input.inputType as any) || "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        picRole: "HEAD_DEPT",
        defaultBands: bands as any,
        isActive: true,
      })
      .returning();

    await audit("master_parameters", created.id, "CREATE", {
      name: created.name,
      source: "IMPORT_EXCEL_QUICK_ADD",
    });

    safeRevalidate("/setup/templates");
    safeRevalidate("/setup/templates/import");

    return {
      success: true,
      masterParameter: {
        id: created.id,
        code: created.code,
        name: created.name,
        departmentId: created.departmentId,
        unit: created.unit,
        categoryName: created.categoryName,
        description: created.description,
      },
    };
  } catch (err: unknown) {
    console.error("Gagal menambahkan parameter ke kamus:", err);
    const msg = err instanceof Error ? err.message : "Gagal menambahkan indikator ke Kamus Parameter.";
    return { success: false, error: msg };
  }
}

export async function createBatchMasterParametersFromImportAction(input: {
  departmentId: number;
  items: Array<{
    name: string;
    categoryName?: string;
    unit?: string;
    description?: string;
    inputType?: string;
    bands?: Array<{
      score: number;
      label: string;
      operator: string;
      minValue?: number | null;
      maxValue?: number | null;
    }>;
  }>;
}): Promise<{
  success: boolean;
  createdItems: Array<{
    id: number;
    code: string | null;
    name: string;
    departmentId: number | null;
    unit: string | null;
    categoryName: string | null;
  }>;
  error?: string;
}> {
  try {
    if (!input.departmentId) {
      return { success: false, createdItems: [], error: "Departemen wajib dipilih." };
    }
    if (!input.items || input.items.length === 0) {
      return { success: false, createdItems: [], error: "Tidak ada indikator untuk ditambahkan." };
    }

    const createdItems: Array<{
      id: number;
      code: string | null;
      name: string;
      departmentId: number | null;
      unit: string | null;
      categoryName: string | null;
    }> = [];

    for (const it of input.items) {
      const name = it.name.trim();
      if (!name) continue;

      const existing = await db
        .select()
        .from(masterParameters)
        .where(
          and(
            ilike(masterParameters.name, name),
            eq(masterParameters.departmentId, input.departmentId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        createdItems.push({
          id: existing[0].id,
          code: existing[0].code,
          name: existing[0].name,
          departmentId: existing[0].departmentId,
          unit: existing[0].unit,
          categoryName: existing[0].categoryName,
        });
        continue;
      }

      const autoCode = await generateMasterParamCode(input.departmentId);
      const bands = it.bands && it.bands.length > 0 ? sanitizeScoringBands(it.bands) : null;

      const [created] = await db
        .insert(masterParameters)
        .values({
          code: autoCode,
          name,
          description: it.description || null,
          departmentId: input.departmentId,
          categoryName: it.categoryName || "Target Kerja",
          unit: it.unit || "%",
          inputType: (it.inputType as any) || "PERCENTAGE",
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          picRole: "HEAD_DEPT",
          defaultBands: bands as any,
          isActive: true,
        })
        .returning();

      createdItems.push({
        id: created.id,
        code: created.code,
        name: created.name,
        departmentId: created.departmentId,
        unit: created.unit,
        categoryName: created.categoryName,
      });
    }

    safeRevalidate("/setup/templates");
    safeRevalidate("/setup/templates/import");

    return {
      success: true,
      createdItems,
    };
  } catch (err: unknown) {
    console.error("Gagal menambahkan batch indikator ke kamus:", err);
    const msg = err instanceof Error ? err.message : "Gagal menambahkan indikator ke Kamus Parameter.";
    return { success: false, createdItems: [], error: msg };
  }
}

export interface DepartmentJobLevelParameter {
  id: number;
  code: string | null;
  name: string;
  unit: string;
  categoryName: string | null;
  description: string | null;
  weight: number;
  weightPct: number;
  inputType: string;
  defaultBands: Array<{
    score: number;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
  }> | null;
}

export async function getDepartmentParametersForJobLevel(
  departmentId: number,
  jobLevelId?: number | null
): Promise<{
  parameters: DepartmentJobLevelParameter[];
  totalWeightPct: number;
}> {
  if (!departmentId) {
    return { parameters: [], totalWeightPct: 0 };
  }

  const params = await db
    .select()
    .from(masterParameters)
    .where(
      and(
        eq(masterParameters.departmentId, departmentId),
        eq(masterParameters.isActive, true)
      )
    )
    .orderBy(asc(masterParameters.code), asc(masterParameters.id));

  const weightsMap = new Map<number, number>();
  if (jobLevelId) {
    const weights = await db
      .select()
      .from(jobLevelParameterWeights)
      .where(
        and(
          eq(jobLevelParameterWeights.departmentId, departmentId),
          eq(jobLevelParameterWeights.jobLevelId, jobLevelId)
        )
      );
    for (const w of weights) {
      weightsMap.set(w.masterParameterId, parseFloat(w.weight));
    }
  }

  const defaultShare = params.length > 0 ? parseFloat((1.15 / params.length).toFixed(4)) : 0;

  const result: DepartmentJobLevelParameter[] = [];
  let sumWeight = 0;

  for (const p of params) {
    const rawWeight = weightsMap.get(p.id) ?? defaultShare;
    const weightPct = Math.round(rawWeight * 100);
    sumWeight += rawWeight;

    result.push({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit || "%",
      categoryName: p.categoryName,
      description: p.description,
      weight: rawWeight,
      weightPct,
      inputType: p.inputType || "MONTHLY_ACTUAL",
      defaultBands: (p.defaultBands as any) || null,
    });
  }

  const totalWeightPct = Math.round(sumWeight * 100);
  return { parameters: result, totalWeightPct };
}

export async function saveJobLevelParameterWeights(
  departmentId: number,
  jobLevelId: number,
  weights: Array<{ masterParameterId: number; weight: number }>
) {
  for (const w of weights) {
    await db
      .insert(jobLevelParameterWeights)
      .values({
        departmentId,
        jobLevelId,
        masterParameterId: w.masterParameterId,
        weight: String(w.weight),
      })
      .onConflictDoUpdate({
        target: [
          jobLevelParameterWeights.departmentId,
          jobLevelParameterWeights.jobLevelId,
          jobLevelParameterWeights.masterParameterId,
        ],
        set: {
          weight: String(w.weight),
          updatedAt: new Date(),
        },
      });
  }
  safeRevalidate("/setup/templates");
  return { success: true };
}

export interface WizardSubParameter {
  id: number;
  code: string | null;
  name: string;
  unit: string;
  target: string;
  weight: number;
  weightPct: number;
  effectiveWeightPct: number;
  inputType: string;
  description: string | null;
  defaultBands: Array<{
    score: number;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
  }> | null;
}

export interface WizardCategoryStructure {
  order: number;
  name: string;
  categoryType: "DIRECT" | "SUB_ITEMS";
  weight: number;
  weightPct: number;
  // Metadata parameter langsung untuk Parameter Utama General (tanpa sub-parameter)
  parameterId?: number | null;
  parameterCode?: string | null;
  parameterName?: string | null;
  unit?: string | null;
  target?: string | null;
  inputType?: string;
  description?: string | null;
  defaultBands?: Array<{
    score: number;
    label: string;
    operator?: string;
    minValue?: number | null;
    maxValue?: number | null;
  }> | null;
  // Sub-parameters (hanya untuk Kategori 1: Target Kerja)
  subParameters: WizardSubParameter[];
}

export interface WizardTemplateStructureResult {
  categories: WizardCategoryStructure[];
  totalWeightPct: number;
  totalSubParams: number;
  employeeInfo?: {
    id: number;
    nik: string;
    name: string;
    jobPosition: string;
  } | null;
}

export async function getFiveMainParametersForWizard(
  departmentId: number,
  jobLevelId?: number | null,
  employeeId?: number | null
): Promise<WizardTemplateStructureResult> {
  if (!departmentId) {
    return { categories: [], totalWeightPct: 0, totalSubParams: 0, employeeInfo: null };
  }

  let employeeInfo: WizardTemplateStructureResult["employeeInfo"] = null;
  if (employeeId) {
    const [emp] = await db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        jobPosition: employees.jobPosition,
      })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (emp) {
      employeeInfo = emp;
    }
  }

  const [deptParams, generalParams] = await Promise.all([
    db
      .select()
      .from(masterParameters)
      .where(
        and(
          eq(masterParameters.departmentId, departmentId),
          eq(masterParameters.isActive, true)
        )
      )
      .orderBy(asc(masterParameters.code), asc(masterParameters.id)),
    db
      .select()
      .from(masterParameters)
      .where(
        and(
          isNull(masterParameters.departmentId),
          eq(masterParameters.isActive, true)
        )
      )
      .orderBy(asc(masterParameters.code), asc(masterParameters.id)),
  ]);

  const weightsMap = new Map<number, number>();
  if (jobLevelId) {
    const weights = await db
      .select()
      .from(jobLevelParameterWeights)
      .where(
        and(
          eq(jobLevelParameterWeights.departmentId, departmentId),
          eq(jobLevelParameterWeights.jobLevelId, jobLevelId)
        )
      );
    for (const w of weights) {
      weightsMap.set(w.masterParameterId, parseFloat(w.weight));
    }
  }

  // 1. Target Kerja (Bobot 65% atau sesuai Job Level): Memiliki sub-parameter dari Kamus Departemen
  const cat1SubParams: WizardSubParameter[] = [];
  const deptCount = deptParams.length;

  let sumRawDeptWeights = 0;
  for (const p of deptParams) {
    sumRawDeptWeights += weightsMap.get(p.id) ?? (1 / (deptCount || 1));
  }

  const targetKerjaWeight = 0.65;
  const targetKerjaWeightPct = 65;

  for (const p of deptParams) {
    const rawW = weightsMap.get(p.id) ?? (1 / (deptCount || 1));
    const internalRatio = sumRawDeptWeights > 0 ? rawW / sumRawDeptWeights : 1 / (deptCount || 1);
    const internalWeight = parseFloat(internalRatio.toFixed(4));
    const internalWeightPct = Math.round(internalRatio * 100);
    const effectivePct = parseFloat((internalRatio * targetKerjaWeightPct).toFixed(1));

    cat1SubParams.push({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit || "%",
      target: "100",
      weight: internalWeight,
      weightPct: internalWeightPct,
      effectiveWeightPct: effectivePct,
      inputType: p.inputType || "PERCENTAGE",
      description: p.description,
      defaultBands: (p.defaultBands as any) || [
        { label: ">= 98% (Sangat Baik)", score: 25, minValue: 98, maxValue: null, operator: "GTE" },
        { label: "95% - 97% (Baik)", score: 15, minValue: 95, maxValue: 97, operator: "BETWEEN" },
        { label: "< 95% (Kurang)", score: 5, minValue: null, maxValue: 95, operator: "LT" },
      ],
    });
  }

  // Fallback jika departemen belum memiliki data parameter di Kamus Parameter
  if (cat1SubParams.length === 0) {
    cat1SubParams.push({
      id: 0,
      code: "TGT-01",
      name: "Pencapaian Target Kerja Departemen",
      unit: "%",
      target: "100",
      weight: 1.0,
      weightPct: 100,
      effectiveWeightPct: targetKerjaWeightPct,
      inputType: "PERCENTAGE",
      description: "Pencapaian target operasional dan program kerja utama departemen.",
      defaultBands: [
        { label: ">= 98% (Sangat Baik)", score: 25, minValue: 98, maxValue: null, operator: "GTE" },
        { label: "95% - 97% (Baik)", score: 15, minValue: 95, maxValue: 97, operator: "BETWEEN" },
        { label: "< 95% (Kurang)", score: 5, minValue: null, maxValue: 95, operator: "LT" },
      ],
    });
  }

  // 2. Kehadiran & Disiplin: Langsung Parameter Utama General (Tanpa Sub-Parameter)
  const kdSource =
    generalParams.find((p) => p.code === "GEN-KD-01") ||
    generalParams.find(
      (p) =>
        (p.categoryName && p.categoryName.toLowerCase().includes("kehadiran")) ||
        (p.name && p.name.toLowerCase().includes("kehadiran"))
    ) || {
      id: 71,
      code: "GEN-KD-01",
      name: "Tingkat Kehadiran & Presensi (Attendant Ratio)",
      unit: "%",
      inputType: "PERCENTAGE",
      description: "Persentase tingkat kehadiran fisik dan ketepatan presensi kerja harian tanpa mangkir.",
      defaultBands: [
        { label: ">= 98% (Disiplin Sempurna)", score: 25, minValue: 98, maxValue: null, operator: "GTE" },
        { label: "95% - 97% (Disiplin Cukup)", score: 15, minValue: 95, maxValue: 97, operator: "BETWEEN" },
        { label: "< 95% (Sering Mangkir / Terlambat)", score: 5, minValue: null, maxValue: 95, operator: "LT" },
      ],
    };
  const kdWeightRaw = weightsMap.get(kdSource.id);
  const kdWeight = kdWeightRaw ? (kdWeightRaw > 1 ? kdWeightRaw / 100 : kdWeightRaw) : 0.20;
  const kdWeightPct = Math.round(kdWeight * 100);

  // 3. Keselamatan Kerja: Langsung Parameter Utama General (Tanpa Sub-Parameter)
  const k3Source =
    generalParams.find((p) => p.code === "GEN-K3-01") ||
    generalParams.find(
      (p) =>
        (p.categoryName && p.categoryName.toLowerCase().includes("keselamatan")) ||
        (p.name && p.name.toLowerCase().includes("keselamatan"))
    ) || {
      id: 73,
      code: "GEN-K3-01",
      name: "Insiden Keselamatan Kerja (Zero Accident)",
      unit: "Insiden",
      inputType: "NUMBER",
      description: "Tingkat keselamatan kerja dan ketiadaan insiden kecelakaan kerja di area operasional.",
      defaultBands: [
        { label: "0 Insiden (Zero Accident)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" },
        { label: "1 Insiden Ringan", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "> 1 Insiden", score: 5, minValue: 1, maxValue: null, operator: "GT" },
      ],
    };
  const k3WeightRaw = weightsMap.get(k3Source.id);
  const k3Weight = k3WeightRaw ? (k3WeightRaw > 1 ? k3WeightRaw / 100 : k3WeightRaw) : 0.10;
  const k3WeightPct = Math.round(k3Weight * 100);

  // 4. Kepatuhan & SP: Langsung Parameter Utama General (Tanpa Sub-Parameter)
  const spSource =
    generalParams.find((p) => p.code === "GEN-SP-01") ||
    generalParams.find(
      (p) =>
        (p.categoryName && p.categoryName.toLowerCase().includes("kepatuhan")) ||
        (p.name && p.name.toLowerCase().includes("sp"))
    ) || {
      id: 75,
      code: "GEN-SP-01",
      name: "Kepatuhan Regulasi & Surat Peringatan (SP)",
      unit: "SP",
      inputType: "NUMBER",
      description: "Tingkat kepatuhan terhadap peraturan perusahaan dan ketiadaan sanksi Surat Peringatan.",
      defaultBands: [
        { label: "Tidak Ada SP (0 SP)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" },
        { label: "Terdapat SP 1", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "Terdapat SP 2 atau lebih", score: 0, minValue: 1, maxValue: null, operator: "GT" },
      ],
    };
  const spWeightRaw = weightsMap.get(spSource.id);
  const spWeight = spWeightRaw ? (spWeightRaw > 1 ? spWeightRaw / 100 : spWeightRaw) : 0.10;
  const spWeightPct = Math.round(spWeight * 100);

  // 5. Inovasi & Improvement: Langsung Parameter Utama General (Tanpa Sub-Parameter)
  const invSource =
    generalParams.find((p) => p.code === "GEN-INV-01") ||
    generalParams.find(
      (p) =>
        (p.categoryName && p.categoryName.toLowerCase().includes("inovasi")) ||
        (p.name && p.name.toLowerCase().includes("inovasi"))
    ) || {
      id: 76,
      code: "GEN-INV-01",
      name: "Inisiatif Perbaikan & Inovasi Kerja",
      unit: "Ide",
      inputType: "NUMBER",
      description: "Inisiatif perbaikan proses, efisiensi kerja, atau inovasi yang terimplementasi.",
      defaultBands: [
        { label: ">= 2 Inisiatif Tervalidasi", score: 25, minValue: 2, maxValue: null, operator: "GTE" },
        { label: "1 Inisiatif Tervalidasi", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "Tidak Ada Inisiatif", score: 5, minValue: 0, maxValue: 0, operator: "EQ" },
      ],
    };
  const invWeightRaw = weightsMap.get(invSource.id);
  const invWeight = invWeightRaw ? (invWeightRaw > 1 ? invWeightRaw / 100 : invWeightRaw) : 0.10;
  const invWeightPct = Math.round(invWeight * 100);

  const categories: WizardCategoryStructure[] = [
    {
      order: 1,
      name: "Target Kerja",
      categoryType: "SUB_ITEMS",
      weight: targetKerjaWeight,
      weightPct: targetKerjaWeightPct,
      subParameters: cat1SubParams,
    },
    {
      order: 2,
      name: "Kehadiran & Disiplin",
      categoryType: "DIRECT",
      weight: kdWeight,
      weightPct: kdWeightPct,
      parameterId: kdSource.id,
      parameterCode: kdSource.code || "GEN-KD-01",
      parameterName: kdSource.name,
      unit: kdSource.unit || "%",
      target: "100",
      inputType: (kdSource.inputType as any) || "PERCENTAGE",
      description: kdSource.description,
      defaultBands: (kdSource.defaultBands as any) || [
        { label: ">= 98% (Disiplin Sempurna)", score: 25, minValue: 98, maxValue: null, operator: "GTE" },
        { label: "95% - 97% (Disiplin Cukup)", score: 15, minValue: 95, maxValue: 97, operator: "BETWEEN" },
        { label: "< 95% (Sering Mangkir / Terlambat)", score: 5, minValue: null, maxValue: 95, operator: "LT" },
      ],
      subParameters: [], // Tanpa sub-parameter
    },
    {
      order: 3,
      name: "Keselamatan Kerja",
      categoryType: "DIRECT",
      weight: k3Weight,
      weightPct: k3WeightPct,
      parameterId: k3Source.id,
      parameterCode: k3Source.code || "GEN-K3-01",
      parameterName: k3Source.name,
      unit: k3Source.unit || "Insiden",
      target: "0",
      inputType: (k3Source.inputType as any) || "NUMBER",
      description: k3Source.description,
      defaultBands: (k3Source.defaultBands as any) || [
        { label: "0 Insiden (Zero Accident)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" },
        { label: "1 Insiden Ringan", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "> 1 Insiden", score: 5, minValue: 1, maxValue: null, operator: "GT" },
      ],
      subParameters: [], // Tanpa sub-parameter
    },
    {
      order: 4,
      name: "Kepatuhan & SP",
      categoryType: "DIRECT",
      weight: spWeight,
      weightPct: spWeightPct,
      parameterId: spSource.id,
      parameterCode: spSource.code || "GEN-SP-01",
      parameterName: spSource.name,
      unit: spSource.unit || "SP",
      target: "0",
      inputType: (spSource.inputType as any) || "NUMBER",
      description: spSource.description,
      defaultBands: (spSource.defaultBands as any) || [
        { label: "Tidak Ada SP (0 SP)", score: 25, minValue: 0, maxValue: 0, operator: "EQ" },
        { label: "Terdapat SP 1", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "Terdapat SP 2 atau lebih", score: 0, minValue: 1, maxValue: null, operator: "GT" },
      ],
      subParameters: [], // Tanpa sub-parameter
    },
    {
      order: 5,
      name: "Inovasi & Improvement",
      categoryType: "DIRECT",
      weight: invWeight,
      weightPct: invWeightPct,
      parameterId: invSource.id,
      parameterCode: invSource.code || "GEN-INV-01",
      parameterName: invSource.name,
      unit: invSource.unit || "Ide",
      target: "1",
      inputType: (invSource.inputType as any) || "NUMBER",
      description: invSource.description,
      defaultBands: (invSource.defaultBands as any) || [
        { label: ">= 2 Inisiatif Tervalidasi", score: 25, minValue: 2, maxValue: null, operator: "GTE" },
        { label: "1 Inisiatif Tervalidasi", score: 15, minValue: 1, maxValue: 1, operator: "EQ" },
        { label: "Tidak Ada Inisiatif", score: 5, minValue: 0, maxValue: 0, operator: "EQ" },
      ],
      subParameters: [], // Tanpa sub-parameter
    },
  ];

  const totalWeightPct = categories.reduce((sum, c) => sum + c.weightPct, 0);

  return {
    categories,
    totalWeightPct: totalWeightPct || 115,
    totalSubParams: cat1SubParams.length,
    employeeInfo,
  };
}

export interface SanitizedBand {
  score: number;
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  minValue: number | null;
  maxValue: number | null;
  sortOrder?: number;
}

function parseCleanNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  const clean = str.replace(/\./g, "").replace(/,/g, ".");
  const num = Number(clean);
  return isNaN(num) ? null : num;
}

function sanitizeScoringBands(rawBands: unknown): SanitizedBand[] | null {
  if (!Array.isArray(rawBands) || rawBands.length === 0) return null;

  const validOperators = ["GT", "GTE", "LT", "LTE", "EQ", "BETWEEN", "TEXT"] as const;

  const sanitized: SanitizedBand[] = [];
  for (let idx = 0; idx < rawBands.length; idx++) {
    const b = rawBands[idx];
    if (!b || typeof b !== "object") continue;

    const op = validOperators.includes(b.operator) ? b.operator : "GTE";
    const min = parseCleanNumber(b.minValue);
    const max = parseCleanNumber(b.maxValue);
    const sc = !isNaN(Number(b.score)) ? Number(b.score) : 0;
    const label = typeof b.label === "string" && b.label.trim() ? b.label.trim() : `Kriteria ${idx + 1}`;

    sanitized.push({
      score: sc,
      label,
      operator: op,
      minValue: min,
      maxValue: max,
      sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : idx + 1,
    });
  }

  return sanitized.length > 0 ? sanitized : null;
}

// ---------- MASTER PARAMETERS (KAMUS INDIKATOR KPI) ACTIONS ----------
export async function getMasterParameters(deptId?: number | null, includeInactive = false) {
  const conditions = [];
  if (!includeInactive) {
    conditions.push(eq(masterParameters.isActive, true));
  }
  if (deptId !== undefined && deptId !== null && deptId !== 0) {
    conditions.push(or(eq(masterParameters.departmentId, deptId), isNull(masterParameters.departmentId))!);
  }

  const query = db
    .select({
      id: masterParameters.id,
      code: masterParameters.code,
      name: masterParameters.name,
      description: masterParameters.description,
      departmentId: masterParameters.departmentId,
      departmentName: departments.name,
      categoryName: masterParameters.categoryName,
      unit: masterParameters.unit,
      inputType: masterParameters.inputType,
      aggregation: masterParameters.aggregation,
      compareBasis: masterParameters.compareBasis,
      picRole: masterParameters.picRole,
      defaultBands: masterParameters.defaultBands,
      isActive: masterParameters.isActive,
      createdAt: masterParameters.createdAt,
      updatedAt: masterParameters.updatedAt,
    })
    .from(masterParameters)
    .leftJoin(departments, eq(masterParameters.departmentId, departments.id));

  return conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(asc(masterParameters.code), asc(masterParameters.name))
    : await query.orderBy(asc(masterParameters.code), asc(masterParameters.name));
}

export async function createMasterParameter(fd: FormData) {
  const name = s(fd, "name").trim();
  if (!name) throw new Error("Nama indikator parameter wajib diisi!");

  const rawDeptId = s(fd, "departmentId");
  const deptId = rawDeptId && rawDeptId !== "0" && rawDeptId !== "null" ? Number(rawDeptId) : null;
  const isGeneral = deptId === null;

  let code = s(fd, "code").trim();
  if (!code) {
    code = await generateMasterParamCode(deptId);
  }

  let defaultBands = null;
  if (fd.has("bands")) {
    try {
      const parsed = JSON.parse(s(fd, "bands"));
      defaultBands = sanitizeScoringBands(parsed);
    } catch {
      // ignore
    }
  }

  const [created] = await db
    .insert(masterParameters)
    .values({
      code,
      name,
      description: s(fd, "description") || null,
      departmentId: deptId,
      categoryName: s(fd, "categoryName") || null,
      unit: s(fd, "unit") || "%",
      inputType: (s(fd, "inputType") || "PERCENTAGE") as any,
      aggregation: (s(fd, "aggregation") || "AVERAGE") as any,
      compareBasis: (s(fd, "compareBasis") || "ACTUAL") as any,
      picRole: (s(fd, "picRole") || "HEAD_DEPT") as any,
      defaultBands: defaultBands as any,
      isActive: fd.has("isActive") ? s(fd, "isActive") === "true" || s(fd, "isActive") === "on" : true,
    })
    .returning();

  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  return created;
}

export async function updateMasterParameter(fd: FormData) {
  const id = i(fd, "id");
  const name = s(fd, "name").trim();
  if (!name) throw new Error("Nama indikator parameter wajib diisi!");

  const rawDeptId = s(fd, "departmentId");
  const deptId = rawDeptId && rawDeptId !== "0" && rawDeptId !== "null" ? Number(rawDeptId) : null;

  let defaultBands: SanitizedBand[] | null | undefined = undefined;
  if (fd.has("bands")) {
    try {
      const parsed = JSON.parse(s(fd, "bands"));
      defaultBands = sanitizeScoringBands(parsed);
    } catch {
      // ignore
    }
  }

  const data: Partial<typeof masterParameters.$inferInsert> = {
    name,
    code: s(fd, "code") || undefined,
    description: fd.has("description") ? (s(fd, "description") || null) : undefined,
    departmentId: deptId,
    categoryName: fd.has("categoryName") ? (s(fd, "categoryName") || null) : undefined,
    unit: fd.has("unit") ? (s(fd, "unit") || "%") : undefined,
    inputType: fd.has("inputType") ? (s(fd, "inputType") as any) : undefined,
    aggregation: fd.has("aggregation") ? (s(fd, "aggregation") as any) : undefined,
    compareBasis: fd.has("compareBasis") ? (s(fd, "compareBasis") as any) : undefined,
    picRole: fd.has("picRole") ? (s(fd, "picRole") as any) : undefined,
    ...(defaultBands !== undefined ? { defaultBands: defaultBands as any } : {}),
    ...(fd.has("isActive") ? { isActive: s(fd, "isActive") === "true" || s(fd, "isActive") === "on" } : {}),
    updatedAt: new Date(),
  };

  await db.update(masterParameters).set(data).where(eq(masterParameters.id, id));
  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/templates/import");
}

export async function deleteMasterParameter(fd: FormData) {
  const id = i(fd, "id");
  await db.delete(masterParameters).where(eq(masterParameters.id, id));
  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/templates/import");
}

export async function deleteMasterParametersBulk(ids: number[]) {
  if (!ids || ids.length === 0) return;
  await db.delete(masterParameters).where(inArray(masterParameters.id, ids));
  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/templates/import");
}

export async function importMasterParametersBulk(
  items: Array<{
    code?: string;
    name: string;
    description?: string;
    departmentId?: number | null;
    categoryName?: string;
    unit?: string;
    inputType?: string;
    aggregation?: string;
    compareBasis?: string;
    picRole?: string;
  }>
) {
  let createdCount = 0;
  let updatedCount = 0;

  for (const it of items) {
    const trimmedName = it.name?.trim();
    if (!trimmedName) continue;
    const targetDeptId = it.departmentId ?? null;

    const [existing] = await db
      .select()
      .from(masterParameters)
      .where(
        and(
          ilike(masterParameters.name, trimmedName),
          targetDeptId !== null
            ? eq(masterParameters.departmentId, targetDeptId)
            : isNull(masterParameters.departmentId)
        )
      );

    if (existing) {
      await db
        .update(masterParameters)
        .set({
          departmentId: targetDeptId,
          description: it.description ?? existing.description,
          categoryName: it.categoryName ?? existing.categoryName,
          unit: it.unit ?? existing.unit,
          inputType: (it.inputType as any) ?? existing.inputType,
          aggregation: (it.aggregation as any) ?? existing.aggregation,
          compareBasis: (it.compareBasis as any) ?? existing.compareBasis,
          picRole: (it.picRole as any) ?? existing.picRole,
          updatedAt: new Date(),
        })
        .where(eq(masterParameters.id, existing.id));
      updatedCount++;
    } else {
      const code = it.code?.trim() || (await generateMasterParamCode(targetDeptId));

      await db.insert(masterParameters).values({
        code,
        name: trimmedName,
        description: it.description || null,
        departmentId: targetDeptId,
        categoryName: it.categoryName || null,
        unit: it.unit || "%",
        inputType: (it.inputType as any) || "PERCENTAGE",
        aggregation: (it.aggregation as any) || "AVERAGE",
        compareBasis: (it.compareBasis as any) || "ACTUAL",
        picRole: (it.picRole as any) || "HEAD_DEPT",
        isActive: true,
      });
      createdCount++;
    }
  }

  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/templates/import");
  return { createdCount, updatedCount };
}

/**
 * Reset seluruh kamus parameter (master_parameters) dan sinkronkan ulang secara presisi
 * dari seluruh parameter yang saat ini ada pada Template KPI aktif.
 */
export async function resetAndSyncMasterParametersFromTemplatesAction() {
  const allParams = await db
    .select({
      paramId: kpiParameters.id,
      paramName: kpiParameters.name,
      description: kpiParameters.description,
      unit: kpiParameters.unit,
      target: kpiParameters.target,
      weight: kpiParameters.weight,
      measurementType: kpiParameters.measurementType,
      direction: kpiParameters.direction,
      aggregation: kpiParameters.aggregation,
      compareBasis: kpiParameters.compareBasis,
      picRole: kpiParameters.picRole,
      categoryName: kpiCategories.name,
      templateId: kpiTemplates.id,
      departmentId: kpiTemplates.departmentId,
      jobLevelId: kpiTemplates.jobLevelId,
      departmentName: departments.name,
      departmentCode: departments.code,
    })
    .from(kpiParameters)
    .innerJoin(kpiCategories, eq(kpiParameters.categoryId, kpiCategories.id))
    .innerJoin(kpiTemplates, eq(kpiCategories.templateId, kpiTemplates.id))
    .leftJoin(departments, eq(kpiTemplates.departmentId, departments.id))
    .orderBy(asc(kpiTemplates.departmentId), asc(kpiCategories.sortOrder), asc(kpiParameters.sortOrder));

  const allBands = await db
    .select()
    .from(kpiBands)
    .orderBy(asc(kpiBands.parameterId), asc(kpiBands.sortOrder), desc(kpiBands.score));

  const bandsByParam = new Map<number, SanitizedBand[]>();
  for (const b of allBands) {
    const list = bandsByParam.get(b.parameterId) || [];
    list.push({
      score: Number(b.score),
      label: b.label,
      operator: (b.operator as any) || "GTE",
      minValue: b.minValue !== null ? Number(b.minValue) : null,
      maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
      sortOrder: b.sortOrder,
    });
    bandsByParam.set(b.parameterId, list);
  }

  // Deduplikasi per (departmentId + paramName)
  const masterMap = new Map<string, {
    name: string;
    departmentId: number | null;
    departmentName: string | null;
    departmentCode: string | null;
    categoryName: string;
    description: string | null;
    unit: string;
    inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY";
    aggregation: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
    compareBasis: "ACTUAL" | "ACHIEVEMENT";
    picRole: "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
    defaultBands: SanitizedBand[];
    sourceParamIds: number[];
    jobLevelWeights: { jobLevelId: number | null; weight: string | null }[];
  }>();

  for (const r of allParams) {
    const key = `${r.departmentId || 0}_${r.paramName.trim().toLowerCase()}`;
    const item = masterMap.get(key);
    if (!item) {
      masterMap.set(key, {
        name: r.paramName.trim(),
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        departmentCode: r.departmentCode,
        categoryName: r.categoryName.trim(),
        description: r.description || `Parameter KPI ${r.paramName.trim()} untuk ${r.departmentName || "Departemen"}`,
        unit: r.unit || "%",
        inputType: r.unit === "Rp" ? "CURRENCY" : r.unit === "%" ? "PERCENTAGE" : "NUMBER",
        aggregation: (r.aggregation as any) || "AVERAGE",
        compareBasis: (r.compareBasis as any) || "ACTUAL",
        picRole: (r.picRole as any) || "HEAD_DEPT",
        defaultBands: bandsByParam.get(r.paramId) || [],
        sourceParamIds: [r.paramId],
        jobLevelWeights: [{ jobLevelId: r.jobLevelId, weight: r.weight }],
      });
    } else {
      item.sourceParamIds.push(r.paramId);
      item.jobLevelWeights.push({ jobLevelId: r.jobLevelId, weight: r.weight });
      if (item.defaultBands.length === 0 && (bandsByParam.get(r.paramId)?.length || 0) > 0) {
        item.defaultBands = bandsByParam.get(r.paramId) || [];
      }
    }
  }

  // Reset tabel master_parameters & relasi lama
  await db.update(kpiParameters).set({ masterParameterId: null });
  await db.delete(jobLevelParameterWeights);
  await db.delete(masterParameters);

  const deptPrefixCounts: Record<string, number> = {};
  let createdCount = 0;

  for (const item of masterMap.values()) {
    let prefix = "Corp";
    if (item.departmentName) {
      const lower = item.departmentName.toLowerCase();
      if (lower.includes("purchas")) prefix = "PUR";
      else if (lower.includes("logis")) prefix = "LOG";
      else if (lower.includes("train")) prefix = "TRN";
      else if (lower.includes("it") || lower.includes("inform")) prefix = "IT";
      else if (lower.includes("ga") || lower.includes("general")) prefix = "GA";
      else if (lower.includes("hr")) prefix = "HR";
      else if (item.departmentCode) prefix = item.departmentCode.toUpperCase();
      else prefix = item.departmentName.substring(0, 3).toUpperCase();
    }

    deptPrefixCounts[prefix] = (deptPrefixCounts[prefix] || 0) + 1;
    const code = `${prefix}-${String(deptPrefixCounts[prefix]).padStart(2, "0")}`;

    const [newMaster] = await db
      .insert(masterParameters)
      .values({
        code,
        name: item.name,
        description: item.description,
        departmentId: item.departmentId,
        categoryName: item.categoryName,
        unit: item.unit,
        inputType: item.inputType,
        aggregation: item.aggregation,
        compareBasis: item.compareBasis,
        picRole: item.picRole,
        defaultBands: item.defaultBands.length > 0 ? (item.defaultBands as any) : null,
        isActive: true,
      })
      .returning();

    createdCount++;

    // Tautkan kembali parameter template ke master parameter yang baru
    if (item.sourceParamIds.length > 0) {
      await db
        .update(kpiParameters)
        .set({ masterParameterId: newMaster.id })
        .where(inArray(kpiParameters.id, item.sourceParamIds));
    }

    // Tautkan job_level_parameter_weights
    if (item.departmentId) {
      const seenLevels = new Set<number>();
      for (const jlw of item.jobLevelWeights) {
        if (jlw.jobLevelId && !seenLevels.has(jlw.jobLevelId)) {
          seenLevels.add(jlw.jobLevelId);
          await db
            .insert(jobLevelParameterWeights)
            .values({
              departmentId: item.departmentId,
              jobLevelId: jlw.jobLevelId,
              masterParameterId: newMaster.id,
              weight: String(jlw.weight || 0.25),
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  safeRevalidate("/setup");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/templates/import");
  return { success: true, count: createdCount };
}

// ---------- APPRAISALS ----------
/** Generate penilaian untuk semua karyawan aktif dalam 1 periode:
 *  hitung masa kerja → eligibility → assign template (dept + job level) → assign penilai */
export async function generateAppraisals(fd: FormData) {
  const periodId = i(fd, "periodId");
  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId));
  if (!period) return;
  const emps = await db.select().from(employees).where(eq(employees.isActive, true));
  const tpls = await db.select().from(kpiTemplates).where(eq(kpiTemplates.isActive, true));
  const existing = await db.select().from(appraisals).where(eq(appraisals.periodId, periodId));
  const existingIds = new Set(existing.map((a) => a.employeeId));
  let created = 0;
  for (const e of emps) {
    if (existingIds.has(e.id)) continue;
    const tenure = tenureMonths(e.dateOfHire, period.evaluationDate);
    const eligible = tenure >= period.minTenureMonths;
    const tpl = tpls.find((t) => t.departmentId === e.departmentId && t.jobLevelId === e.jobLevelId) ?? null;
    const [a] = await db
      .insert(appraisals)
      .values({
        periodId,
        employeeId: e.id,
        templateId: tpl?.id ?? null,
        appraiserId: e.appraiserId ?? null,
        tenureMonths: tenure,
        isEligible: eligible,
        status: "DRAFT",
      })
      .returning();
    if (tpl && eligible) {
      const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, tpl.id));
      if (cats.length) {
        const params = await db
          .select()
          .from(kpiParameters)
          .where(inArray(kpiParameters.categoryId, cats.map((c) => c.id)));
        if (params.length)
          await db.insert(appraisalItems).values(params.map((p) => ({ appraisalId: a.id, parameterId: p.id })));
      }
    }
    created++;
  }
  await audit("appraisal", null, "GENERATE", { periodId, created });
  revalidateAll();
}

export async function recalculateAppraisal(appraisalId: number) {
  return recalculateAppraisalUnified(appraisalId);
}

/** Simpan semua input item dari form penilaian lalu hitung ulang skor */
export async function saveAppraisalInputs(
  _previousState: { success: boolean; error: string },
  fd: FormData
) {
  try {
    const appraisalId = i(fd, "appraisalId");
    const actor = s(fd, "actor") || "penilai";
    const items = await db.select().from(appraisalItems).where(eq(appraisalItems.appraisalId, appraisalId));
    for (const it of items) {
      const k = `item_${it.id}_`;
      const monthlyTargets: (number | null)[] = [];
      const monthlyActuals: (number | null)[] = [];
      const monthlyNotes: (string | null)[] = [];
      let hasMonthly = false;
      let hasNotes = false;
      for (let m = 0; m < 12; m++) {
        if (fd.has(`${k}mt_${m}`) || fd.has(`${k}ma_${m}`)) hasMonthly = true;
        if (fd.has(`${k}mn_${m}`)) hasNotes = true;
        monthlyTargets.push(n(fd, `${k}mt_${m}`));
        monthlyActuals.push(n(fd, `${k}ma_${m}`));
        monthlyNotes.push(s(fd, `${k}mn_${m}`) || null);
      }
      const data = {
        target: fd.has(`${k}target`) ? (n(fd, `${k}target`) !== null ? String(n(fd, `${k}target`)) : null) : it.target,
        actual: fd.has(`${k}actual`) ? (n(fd, `${k}actual`) !== null ? String(n(fd, `${k}actual`)) : null) : it.actual,
        qualitativeValue: fd.has(`${k}qual`) ? s(fd, `${k}qual`) || null : it.qualitativeValue,
        monthlyTargets: hasMonthly ? monthlyTargets : it.monthlyTargets,
        monthlyActuals: hasMonthly ? monthlyActuals : it.monthlyActuals,
        monthlyNotes: hasNotes ? monthlyNotes : it.monthlyNotes,
        updatedBy: actor,
        updatedAt: new Date(),
      };
      await db.update(appraisalItems).set(data).where(eq(appraisalItems.id, it.id));
    }
    await recalculateAppraisal(appraisalId);
    await audit("appraisal", appraisalId, "INPUT", { items: items.length }, actor);
    revalidatePath("/input-kpi", "page");
    return { success: true, error: "" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Nilai gagal disimpan. Silakan coba lagi.";
    return { success: false, error: msg };
  }
}

/** Simpan realisasi bulanan dari popup modal edit bulan beserta catatan & hitung ulang */
export async function saveMonthlyRealizationModal({
  appraisalId,
  parameterId,
  monthIndex, // 0..11
  actual,
  target,
  note,
  actor = "penilai",
}: {
  appraisalId: number;
  parameterId: number;
  monthIndex: number;
  actual: number | null;
  target?: number | null;
  note?: string | null;
  actor?: string;
}) {
  try {
    const [item] = await db
      .select()
      .from(appraisalItems)
      .where(and(eq(appraisalItems.appraisalId, appraisalId), eq(appraisalItems.parameterId, parameterId)));

    if (!item) {
      return { success: false, error: "Indikator KPI tidak ditemukan dalam database." };
    }

    const mActuals = Array.isArray(item.monthlyActuals) ? [...item.monthlyActuals] : Array(12).fill(null);
    while (mActuals.length < 12) mActuals.push(null);
    mActuals[monthIndex] = actual;

    const mTargets = Array.isArray(item.monthlyTargets) ? [...item.monthlyTargets] : Array(12).fill(null);
    while (mTargets.length < 12) mTargets.push(null);
    if (target !== undefined && target !== null) {
      mTargets[monthIndex] = target;
    }

    const mNotes = Array.isArray(item.monthlyNotes) ? [...item.monthlyNotes] : Array(12).fill(null);
    while (mNotes.length < 12) mNotes.push(null);
    if (note !== undefined) {
      mNotes[monthIndex] = note;
    }

    await db
      .update(appraisalItems)
      .set({
        monthlyActuals: mActuals,
        monthlyTargets: mTargets,
        monthlyNotes: mNotes,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(appraisalItems.id, item.id));

    await recalculateAppraisal(appraisalId);
    await audit(
      "appraisal",
      appraisalId,
      "INPUT_MONTHLY_MODAL",
      { parameterId, monthIndex: monthIndex + 1, actual, note },
      actor
    );

    revalidatePath("/input-kpi", "page");

    return { success: true, error: "" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan realisasi bulan.";
    return { success: false, error: msg };
  }
}

/** Tambah parameter baru (kategori) untuk appraisal dan opsional ke template master */
export async function addCustomParameterToAppraisal({
  appraisalId,
  name,
  weight,
}: {
  appraisalId?: number;
  name: string;
  weight: number;
  applyToMaster?: boolean;
}) {
  try {
    let templateId: number | null = null;
    if (appraisalId) {
      const [appr] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
      templateId = appr?.templateId ?? null;
    }

    let createdCategoryId: number | null = null;
    if (templateId) {
      const [cat] = await db
        .insert(kpiCategories)
        .values({
          templateId,
          name,
          weight: String(weight / 100),
          sortOrder: 99,
        })
        .returning();
      createdCategoryId = cat.id;
    }

    revalidatePath("/input-kpi", "page");

    return { success: true, categoryId: createdCategoryId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menambahkan parameter.";
    return { success: false, error: msg };
  }
}

/** Tambah indikator KPI baru untuk kategori tertentu */
export async function addCustomIndicatorToAppraisal({
  appraisalId,
  categoryId,
  name,
  description,
  target,
  unit,
  weight,
  aggregation = "AVERAGE",
  criteria,
}: {
  appraisalId?: number;
  categoryId?: number;
  name: string;
  description?: string;
  target: number;
  unit: string;
  weight: number;
  aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE";
  criteria: Array<{ label: string; operator?: string; minValue?: number | null; maxValue?: number | null; score: number }>;
  applyToMaster?: boolean;
}) {
  try {
    if (!categoryId) {
      return { success: false, error: "Kategori parameter tidak valid." };
    }

    const [param] = await db
      .insert(kpiParameters)
      .values({
        categoryId,
        name,
        description: description || null,
        weight: String(weight / 100),
        maxScore: "25",
        inputType: "NUMBER",
        aggregation,
        compareBasis: "ACTUAL",
        unit,
        sortOrder: 99,
      })
      .returning();

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      await db.insert(kpiBands).values({
        parameterId: param.id,
        label: c.label,
        operator: (c.operator as any) || "LTE",
        minValue: c.minValue !== null && c.minValue !== undefined ? String(c.minValue) : null,
        maxValue: c.maxValue !== null && c.maxValue !== undefined ? String(c.maxValue) : null,
        score: String(c.score),
        sortOrder: i + 1,
      });
    }

    if (appraisalId) {
      await db.insert(appraisalItems).values({
        appraisalId,
        parameterId: param.id,
        target: String(target),
        monthlyTargets: Array(12).fill(target),
        monthlyActuals: Array(12).fill(null),
        monthlyNotes: Array(12).fill(null),
        updatedBy: "custom_add",
      });

      await recalculateAppraisal(appraisalId);
    }

    revalidatePath("/input-kpi", "page");
    return { success: true, parameterId: param.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menambahkan indikator KPI.";
    return { success: false, error: msg };
  }
}

export async function setAppraisalStatus(fd: FormData) {
  const id = i(fd, "id");
  const status = s(fd, "status") as "DRAFT" | "SUBMITTED" | "REVIEWED" | "FINAL";
  const notes = s(fd, "notes");
  const actor = s(fd, "actor") || "admin";
  const now = new Date();
  const set: Partial<typeof appraisals.$inferInsert> = { status, updatedAt: now };
  if (notes) set.notes = notes;
  if (status === "SUBMITTED") set.submittedAt = now;
  if (status === "REVIEWED") set.reviewedAt = now;
  if (status === "FINAL") set.finalizedAt = now;
  await recalculateAppraisal(id);
  await db.update(appraisals).set(set).where(eq(appraisals.id, id));
  await audit("appraisal", id, `STATUS_${status}`, { notes }, actor);
  revalidateAll();
}

export async function reassignTemplate(fd: FormData) {
  const id = i(fd, "id");
  const templateId = i(fd, "templateId") || null;
  await db.update(appraisals).set({ templateId }).where(eq(appraisals.id, id));
  await db.delete(appraisalItems).where(eq(appraisalItems.appraisalId, id));
  if (templateId) {
    const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, templateId));
    if (cats.length) {
      const params = await db.select().from(kpiParameters).where(inArray(kpiParameters.categoryId, cats.map((c) => c.id)));
      if (params.length) await db.insert(appraisalItems).values(params.map((p) => ({ appraisalId: id, parameterId: p.id })));
    }
  }
  await audit("appraisal", id, "REASSIGN_TEMPLATE", { templateId });
  revalidateAll();
}

export async function deleteAppraisal(fd: FormData) {
  await db.delete(appraisals).where(and(eq(appraisals.id, i(fd, "id"))));
  revalidateAll();
}

export async function deleteAppraisalById(appraisalId: number) {
  await db.delete(appraisals).where(eq(appraisals.id, appraisalId));
  await audit("appraisal", appraisalId, "DELETE");
  revalidateAll();
  return { success: true };
}

export async function deleteBatchAppraisals(fd: FormData) {
  const idsStr = s(fd, "ids");
  if (!idsStr) return;
  const ids = idsStr.split(",").map((x) => Number(x)).filter((n) => !isNaN(n) && n > 0);
  if (ids.length === 0) return;
  await db.delete(appraisals).where(inArray(appraisals.id, ids));
  for (const aid of ids) {
    await audit("appraisal", aid, "BATCH_DELETE");
  }
  revalidateAll();
}

export async function deleteAppraisalsByIds(appraisalIds: number[]) {
  if (appraisalIds.length === 0) return { success: true };
  await db.delete(appraisals).where(inArray(appraisals.id, appraisalIds));
  for (const aid of appraisalIds) {
    await audit("appraisal", aid, "BATCH_DELETE");
  }
  revalidateAll();
  return { success: true };
}

export async function createSingleAppraisal(fd: FormData) {
  const employeeId = i(fd, "employeeId");
  const periodId = i(fd, "periodId");
  const templateId = i(fd, "templateId");

  if (!employeeId) throw new Error("Karyawan wajib dipilih!");
  if (!periodId) throw new Error("Periode KPI wajib dipilih!");
  if (!templateId) throw new Error("Template KPI wajib dipilih!");

  const [e] = await db.select().from(employees).where(eq(employees.id, employeeId));
  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId));
  if (!e || !period) throw new Error("Data karyawan atau periode tidak ditemukan!");

  const tenure = tenureMonths(e.dateOfHire, period.evaluationDate);
  const eligible = tenure >= period.minTenureMonths;

  // Cek apakah appraisal sudah ada
  const [existing] = await db
    .select()
    .from(appraisals)
    .where(and(eq(appraisals.employeeId, employeeId), eq(appraisals.periodId, periodId)));

  let appraisalId: number;

  if (existing) {
    await db
      .update(appraisals)
      .set({
        templateId,
        appraiserId: e.appraiserId ?? null,
        tenureMonths: tenure,
        isEligible: eligible,
        updatedAt: new Date(),
      })
      .where(eq(appraisals.id, existing.id));

    appraisalId = existing.id;
    await db.delete(appraisalItems).where(eq(appraisalItems.appraisalId, existing.id));
  } else {
    const [inserted] = await db
      .insert(appraisals)
      .values({
        periodId,
        employeeId: e.id,
        templateId,
        appraiserId: e.appraiserId ?? null,
        tenureMonths: tenure,
        isEligible: eligible,
        status: "DRAFT",
      })
      .returning();
    appraisalId = inserted.id;
  }

  // Insert appraisal items dari template
  const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, templateId));
  if (cats.length) {
    const params = await db
      .select()
      .from(kpiParameters)
      .where(inArray(kpiParameters.categoryId, cats.map((c) => c.id)));
    if (params.length) {
      const catWeightMap = new Map(cats.map((c) => [c.id, c.weight]));
      const paramIds = params.map((p) => p.id);
      const allBands = await db
        .select()
        .from(kpiBands)
        .where(inArray(kpiBands.parameterId, paramIds))
        .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id));
      const bandsMap = new Map<number, Array<{ id: number; label: string; operator: string; minValue: number | null; maxValue: number | null; score: number; sortOrder: number }>>();
      for (const b of allBands) {
        const list = bandsMap.get(b.parameterId) || [];
        list.push({
          id: b.id,
          label: b.label,
          operator: b.operator,
          minValue: b.minValue !== null ? Number(b.minValue) : null,
          maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
          score: Number(b.score),
          sortOrder: b.sortOrder,
        });
        bandsMap.set(b.parameterId, list);
      }

      await db.insert(appraisalItems).values(
        params.map((p) => ({
          appraisalId,
          parameterId: p.id,
          indicatorNameSnapshot: p.name,
          parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
          target: p.target,
          targetSnapshot: p.target,
          unitSnapshot: p.unit,
          weightSnapshot: p.weight,
          scoringRulesSnapshot: bandsMap.get(p.id) || [],
          monthlyTargets: p.target !== null && p.target !== undefined ? Array(12).fill(Number(p.target)) : null,
        }))
      );
    }
  }

  await audit("appraisal", appraisalId, "CREATE_WIZARD", { employeeId, periodId, templateId });
  revalidateAll();
  return { success: true, appraisalId };
}

export async function generateAppraisalsBatchAction(fd: FormData) {
  const periodYear = i(fd, "periodYear");
  if (!periodYear) return { success: false, error: "Tahun periode wajib diisi." };

  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.year, periodYear));
  if (!period) return { success: false, error: "Periode KPI tidak ditemukan untuk tahun tersebut." };

  // Get active templates
  const allTemplates = await db.select().from(kpiTemplates).where(eq(kpiTemplates.isActive, true));
  if (allTemplates.length === 0) {
    return { success: false, error: "Tidak ada template KPI yang aktif." };
  }

  // Get all employees
  const allEmployees = await db.select().from(employees);

  // Get existing appraisals for this period
  const existingAppraisals = await db.select().from(appraisals).where(eq(appraisals.periodId, period.id));
  const existingEmployeeIds = new Set(existingAppraisals.map((a) => a.employeeId));

  let generatedCount = 0;

  for (const emp of allEmployees) {
    if (existingEmployeeIds.has(emp.id)) continue; // Skip if already has appraisal

    // Find matching template based on department and job level
    let matchingTemplate = allTemplates.find(
      (t) => t.departmentId === emp.departmentId && t.jobLevelId === emp.jobLevelId
    );

    // Fallback to department only template if no exact match
    if (!matchingTemplate) {
      matchingTemplate = allTemplates.find((t) => t.departmentId === emp.departmentId && t.jobLevelId === null);
    }

    // Fallback to global template
    if (!matchingTemplate) {
      matchingTemplate = allTemplates.find((t) => t.departmentId === null && t.jobLevelId === null);
    }

    if (!matchingTemplate) continue; // Skip if no template found

    const tenure = tenureMonths(emp.dateOfHire, period.evaluationDate);
    const eligible = tenure >= period.minTenureMonths;

    const [inserted] = await db
      .insert(appraisals)
      .values({
        periodId: period.id,
        employeeId: emp.id,
        templateId: matchingTemplate.id,
        appraiserId: emp.appraiserId ?? null,
        tenureMonths: tenure,
        isEligible: eligible,
        status: "DRAFT",
      })
      .returning();

    // Insert appraisal items dari template
    const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, matchingTemplate.id));
    if (cats.length) {
      const params = await db
        .select()
        .from(kpiParameters)
        .where(inArray(kpiParameters.categoryId, cats.map((c) => c.id)));
      if (params.length) {
        const catWeightMap = new Map(cats.map((c) => [c.id, c.weight]));
        const paramIds = params.map((p) => p.id);
        const allBands = await db
          .select()
          .from(kpiBands)
          .where(inArray(kpiBands.parameterId, paramIds))
          .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id));
        const bandsMap = new Map<number, Array<{ id: number; label: string; operator: string; minValue: number | null; maxValue: number | null; score: number; sortOrder: number }>>();
        for (const b of allBands) {
          const list = bandsMap.get(b.parameterId) || [];
          list.push({
            id: b.id,
            label: b.label,
            operator: b.operator,
            minValue: b.minValue !== null ? Number(b.minValue) : null,
            maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
            score: Number(b.score),
            sortOrder: b.sortOrder,
          });
          bandsMap.set(b.parameterId, list);
        }

        await db.insert(appraisalItems).values(
          params.map((p) => ({
            appraisalId: inserted.id,
            parameterId: p.id,
            indicatorNameSnapshot: p.name,
            parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
            target: p.target,
            targetSnapshot: p.target,
            unitSnapshot: p.unit,
            weightSnapshot: p.weight,
            scoringRulesSnapshot: bandsMap.get(p.id) || [],
            monthlyTargets: p.target !== null && p.target !== undefined ? Array(12).fill(Number(p.target)) : null,
          }))
        );
      }
    }

    generatedCount++;
    await audit("appraisal", inserted.id, "BATCH_GENERATE", { employeeId: emp.id, templateId: matchingTemplate.id });
  }

  revalidateAll();
  return { success: true, count: generatedCount };
}

export async function assignTemplateToEmployees(fd: FormData) {
  const templateId = i(fd, "templateId");
  const periodId = i(fd, "periodId");
  const rawEmployeeIds = s(fd, "employeeIds");
  let employeeIds: number[] = [];

  if (rawEmployeeIds) {
    try {
      const parsed = JSON.parse(rawEmployeeIds);
      if (Array.isArray(parsed)) {
        employeeIds = parsed.map(Number).filter((n) => !isNaN(n));
      }
    } catch {
      employeeIds = rawEmployeeIds
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => !isNaN(n));
    }
  }

  if (employeeIds.length === 0) {
    const all = fd.getAll("employeeIds");
    employeeIds = all.map(Number).filter((n) => !isNaN(n));
  }

  if (!templateId) throw new Error("Template KPI wajib dipilih!");
  if (!periodId) throw new Error("Periode KPI wajib dipilih!");
  if (employeeIds.length === 0) throw new Error("Pilih minimal satu karyawan untuk ditugaskan!");

  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, periodId));
  if (!period) throw new Error("Periode KPI tidak ditemukan!");

  // Get template categories & parameters
  const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, templateId));
  const params = cats.length
    ? await db
        .select()
        .from(kpiParameters)
        .where(inArray(kpiParameters.categoryId, cats.map((c) => c.id)))
    : [];

  const catWeightMap = new Map(cats.map((c) => [c.id, c.weight]));

  // Pre-fetch all bands for params agar scoringRulesSnapshot tersimpan lengkap
  const paramIds = params.map((p) => p.id);
  const allBands = paramIds.length > 0
    ? await db.select().from(kpiBands).where(inArray(kpiBands.parameterId, paramIds)).orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
    : [];
  const bandsMap = new Map<number, Array<{ id: number; label: string; operator: string; minValue: number | null; maxValue: number | null; score: number; sortOrder: number }>>();
  for (const b of allBands) {
    const list = bandsMap.get(b.parameterId) || [];
    list.push({
      id: b.id,
      label: b.label,
      operator: b.operator,
      minValue: b.minValue !== null ? Number(b.minValue) : null,
      maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
      score: Number(b.score),
      sortOrder: b.sortOrder,
    });
    bandsMap.set(b.parameterId, list);
  }

  let assignedCount = 0;
  for (const empId of employeeIds) {
    const [e] = await db.select().from(employees).where(eq(employees.id, empId));
    if (!e) continue;

    const tenure = tenureMonths(e.dateOfHire, period.evaluationDate);
    const eligible = tenure >= period.minTenureMonths;

    const [existing] = await db
      .select()
      .from(appraisals)
      .where(and(eq(appraisals.employeeId, empId), eq(appraisals.periodId, periodId)));

    let appraisalId: number;

    if (existing) {
      await db
        .update(appraisals)
        .set({
          templateId,
          appraiserId: e.appraiserId ?? null,
          tenureMonths: tenure,
          isEligible: eligible,
          updatedAt: new Date(),
        })
        .where(eq(appraisals.id, existing.id));
      appraisalId = existing.id;
      await db.delete(appraisalItems).where(eq(appraisalItems.appraisalId, existing.id));
    } else {
      const [inserted] = await db
        .insert(appraisals)
        .values({
          periodId,
          employeeId: e.id,
          templateId,
          appraiserId: e.appraiserId ?? null,
          tenureMonths: tenure,
          isEligible: eligible,
          status: "DRAFT",
        })
        .returning();
      appraisalId = inserted.id;
    }

    if (params.length) {
      await db.insert(appraisalItems).values(
        params.map((p) => ({
          appraisalId,
          parameterId: p.id,
          indicatorNameSnapshot: p.name,
          parameterWeightSnapshot: catWeightMap.get(p.categoryId) ?? null,
          target: p.target,
          targetSnapshot: p.target,
          unitSnapshot: p.unit,
          weightSnapshot: p.weight,
          scoringRulesSnapshot: bandsMap.get(p.id) || [],
          monthlyTargets: p.target !== null && p.target !== undefined ? Array(12).fill(Number(p.target)) : null,
        }))
      );
    }
    assignedCount++;
  }

  await audit("template", templateId, "ASSIGN_TO_EMPLOYEES", {
    periodId,
    employeeCount: assignedCount,
    employeeIds,
  });

  revalidateAll();
}

// ---------- DEMO ----------
export async function seedDemo() {
  await seedDemoData();
  revalidateAll();
}

// ---------- ODOO SYNC & AUTH ----------
export async function syncOdooEmployeesAction(fd?: FormData) {
  const customUser = fd ? s(fd, "username") : undefined;
  const customPass = fd ? s(fd, "password") : undefined;

  const result = await syncAllFromOdoo(customUser || undefined, customPass || undefined);
  await audit("system", null, "SYNC_ODOO_EMPLOYEES", result.count);
  revalidateAll();
  try {
    revalidatePath("/setup", "page");
  } catch {}
  return result;
}

export async function resetOdooSyncedEmployeesAction() {
  const devNik = ODOO_CONFIG.devSuperadminNik;

  // 1. Delete dependent appraisal data for non-superadmin employees
  try {
    const nonAdminEmps = await db
      .select({ id: employees.id })
      .from(employees)
      .where(ne(employees.nik, devNik));
    const nonAdminEmpIds = nonAdminEmps.map((e) => e.id);

    if (nonAdminEmpIds.length > 0) {
      const nonAdminAppraisals = await db
        .select({ id: appraisals.id })
        .from(appraisals)
        .where(inArray(appraisals.employeeId, nonAdminEmpIds));
      const appIds = nonAdminAppraisals.map((a) => a.id);

      if (appIds.length > 0) {
        await db.delete(appraisalItems).where(inArray(appraisalItems.appraisalId, appIds));
      }
      await db.delete(appraisals).where(inArray(appraisals.employeeId, nonAdminEmpIds));
      await db
        .delete(kpiAssessorAssignments)
        .where(
          or(
            inArray(kpiAssessorAssignments.assessorEmployeeId, nonAdminEmpIds),
            inArray(kpiAssessorAssignments.targetEmployeeId, nonAdminEmpIds)
          )
        );
      await db.delete(users).where(ne(users.nik, devNik));
    }
  } catch (err) {
    console.warn("Cleanup dependent tables warning:", err);
  }

  // 2. Delete non-admin employees
  const deleted = await db
    .delete(employees)
    .where(ne(employees.nik, devNik))
    .returning();

  await audit("system", null, "RESET_ODOO_SYNCED_EMPLOYEES", { deletedCount: deleted.length });
  revalidateAll();
  try {
    revalidatePath("/setup/master", "page");
  } catch {}

  return { success: true, count: deleted.length };
}

// ---------- UPDATE TEMPLATE TARGETS & SYNC TO APPRAISAL ITEMS ----------
export async function updateTemplateTargetsAction(
  templateId: number,
  targets: Record<number, number | null>
) {
  for (const [paramIdStr, targetVal] of Object.entries(targets)) {
    const paramId = Number(paramIdStr);
    if (!paramId) continue;
    const targetStr = targetVal !== null && targetVal !== undefined ? String(targetVal) : null;

    // 1. Update kpiParameters
    await db
      .update(kpiParameters)
      .set({ target: targetStr })
      .where(eq(kpiParameters.id, paramId));

    // 2. Sync ke appraisalItems yang terhubung ke parameter ini
    await db
      .update(appraisalItems)
      .set({
        target: targetStr,
        targetSnapshot: targetStr,
      })
      .where(eq(appraisalItems.parameterId, paramId));
  }

  await bumpTemplate(templateId, "UPDATE_TARGETS", { targets });
  revalidateAll();
  return { success: true };
}

// ============================================================================
// CUSTOM KPI DEPARTMENT ACTIONS
// ============================================================================

export interface CustomKpiCategoryInput {
  name: string;
  weight: number;
  categoryType?: "DIRECT" | "SUB_ITEMS";
  sortOrder?: number;
  parameters: Array<{
    name: string;
    description?: string;
    weight: number;
    maxScore?: number;
    inputType?: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE";
    aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
    compareBasis?: "ACTUAL" | "ACHIEVEMENT";
    unit?: string;
    target?: number | null;
    picRole?: "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
    sortOrder?: number;
    bands?: Array<{
      label: string;
      operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
      minValue?: number | null;
      maxValue?: number | null;
      score: number;
      sortOrder?: number;
    }>;
  }>;
}

export async function createCustomKpiAction(data: {
  name: string;
  departmentId: number;
  jobLevelId: number;
  baseTemplateId: number;
  totalWeight?: number;
  categories?: CustomKpiCategoryInput[];
}) {
  if (!data.name?.trim()) throw new Error("Nama Custom KPI wajib diisi!");
  if (!data.departmentId) throw new Error("Departemen wajib dipilih!");
  if (!data.jobLevelId) throw new Error("Job Level wajib dipilih!");
  if (!data.baseTemplateId) throw new Error("Template Dasar (Master Template) wajib dipilih!");

  const [baseTpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, data.baseTemplateId));
  if (!baseTpl) throw new Error("Template Dasar tidak ditemukan!");

  // Insert custom template
  const [newTpl] = await db
    .insert(kpiTemplates)
    .values({
      name: data.name.trim(),
      departmentId: data.departmentId,
      jobLevelId: data.jobLevelId,
      baseTemplateId: data.baseTemplateId,
      isCustom: true,
      totalWeight: data.totalWeight ? String(data.totalWeight) : baseTpl.totalWeight,
      version: 1,
      isActive: true,
    })
    .returning();

  // If categories are customized
  if (data.categories && data.categories.length > 0) {
    for (let cIdx = 0; cIdx < data.categories.length; cIdx++) {
      const cat = data.categories[cIdx];
      const catWeight = cat.weight > 1 ? cat.weight / 100 : cat.weight;
      const [newCat] = await db
        .insert(kpiCategories)
        .values({
          templateId: newTpl.id,
          name: cat.name,
          weight: String(catWeight),
          categoryType: cat.categoryType || (cat.parameters.length <= 1 ? "DIRECT" : "SUB_ITEMS"),
          sortOrder: cat.sortOrder ?? cIdx,
        })
        .returning();

      for (let pIdx = 0; pIdx < cat.parameters.length; pIdx++) {
        const param = cat.parameters[pIdx];
        const paramWeight = param.weight > 1 ? param.weight / 100 : param.weight;
        const [newParam] = await db
          .insert(kpiParameters)
          .values({
            categoryId: newCat.id,
            name: param.name,
            description: param.description || null,
            weight: String(paramWeight),
            maxScore: String(param.maxScore ?? 25),
            inputType: param.inputType || "NUMBER",
            aggregation: param.aggregation || "AVERAGE",
            compareBasis: param.compareBasis || "ACTUAL",
            unit: param.unit || null,
            target: param.target !== null && param.target !== undefined ? String(param.target) : null,
            picRole: param.picRole || "HEAD_DEPT",
            isMonthly: param.inputType === "MONTHLY_ACTUAL",
            sortOrder: param.sortOrder ?? pIdx,
          })
          .returning();

        if (param.bands && param.bands.length > 0) {
          for (let bIdx = 0; bIdx < param.bands.length; bIdx++) {
            const b = param.bands[bIdx];
            await db.insert(kpiBands).values({
              parameterId: newParam.id,
              label: b.label || `Kriteria ${bIdx + 1}`,
              operator: b.operator || "GTE",
              minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
              maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
              score: String(b.score ?? 25),
              sortOrder: b.sortOrder ?? bIdx,
            });
          }
        }
      }
    }
  } else {
    // Clone all categories, parameters, and bands from baseTemplateId
    const baseCats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, data.baseTemplateId));
    for (const c of baseCats) {
      const [nc] = await db
        .insert(kpiCategories)
        .values({
          templateId: newTpl.id,
          name: c.name,
          weight: c.weight,
          categoryType: c.categoryType,
          sortOrder: c.sortOrder,
        })
        .returning();

      const baseParams = await db.select().from(kpiParameters).where(eq(kpiParameters.categoryId, c.id));
      for (const p of baseParams) {
        const [np] = await db
          .insert(kpiParameters)
          .values({
            categoryId: nc.id,
            name: p.name,
            description: p.description,
            weight: p.weight,
            maxScore: p.maxScore,
            inputType: p.inputType,
            aggregation: p.aggregation,
            compareBasis: p.compareBasis,
            unit: p.unit,
            target: p.target,
            picRole: p.picRole,
            isMonthly: p.isMonthly,
            sortOrder: p.sortOrder,
            masterParameterId: p.masterParameterId,
          })
          .returning();

        const baseBands = await db.select().from(kpiBands).where(eq(kpiBands.parameterId, p.id));
        if (baseBands.length) {
          await db.insert(kpiBands).values(
            baseBands.map((b) => ({
              parameterId: np.id,
              label: b.label,
              operator: b.operator,
              minValue: b.minValue,
              maxValue: b.maxValue,
              score: b.score,
              sortOrder: b.sortOrder,
            }))
          );
        }
      }
    }
  }

  await audit("template", newTpl.id, "CREATE_CUSTOM", { baseTemplateId: data.baseTemplateId });
  safeRevalidate("/setup/custom-kpi");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true, id: newTpl.id };
}

export async function updateCustomKpiAction(data: {
  id: number;
  name: string;
  departmentId: number;
  jobLevelId: number;
  totalWeight?: number;
  isActive?: boolean;
  categories?: CustomKpiCategoryInput[];
}) {
  const [existing] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, data.id));
  if (!existing) throw new Error("Custom KPI tidak ditemukan!");

  await db
    .update(kpiTemplates)
    .set({
      name: data.name.trim(),
      departmentId: data.departmentId,
      jobLevelId: data.jobLevelId,
      totalWeight: data.totalWeight ? String(data.totalWeight) : existing.totalWeight,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(kpiTemplates.id, data.id));

  // If categories are updated
  if (data.categories && data.categories.length > 0) {
    await db.delete(kpiCategories).where(eq(kpiCategories.templateId, data.id));

    for (let cIdx = 0; cIdx < data.categories.length; cIdx++) {
      const cat = data.categories[cIdx];
      const catWeight = cat.weight > 1 ? cat.weight / 100 : cat.weight;
      const [newCat] = await db
        .insert(kpiCategories)
        .values({
          templateId: data.id,
          name: cat.name,
          weight: String(catWeight),
          categoryType: cat.categoryType || (cat.parameters.length <= 1 ? "DIRECT" : "SUB_ITEMS"),
          sortOrder: cat.sortOrder ?? cIdx,
        })
        .returning();

      for (let pIdx = 0; pIdx < cat.parameters.length; pIdx++) {
        const param = cat.parameters[pIdx];
        const paramWeight = param.weight > 1 ? param.weight / 100 : param.weight;
        const [newParam] = await db
          .insert(kpiParameters)
          .values({
            categoryId: newCat.id,
            name: param.name,
            description: param.description || null,
            weight: String(paramWeight),
            maxScore: String(param.maxScore ?? 25),
            inputType: param.inputType || "NUMBER",
            aggregation: param.aggregation || "AVERAGE",
            compareBasis: param.compareBasis || "ACTUAL",
            unit: param.unit || null,
            target: param.target !== null && param.target !== undefined ? String(param.target) : null,
            picRole: param.picRole || "HEAD_DEPT",
            isMonthly: param.inputType === "MONTHLY_ACTUAL",
            sortOrder: param.sortOrder ?? pIdx,
          })
          .returning();

        if (param.bands && param.bands.length > 0) {
          for (let bIdx = 0; bIdx < param.bands.length; bIdx++) {
            const b = param.bands[bIdx];
            await db.insert(kpiBands).values({
              parameterId: newParam.id,
              label: b.label || `Kriteria ${bIdx + 1}`,
              operator: b.operator || "GTE",
              minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
              maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
              score: String(b.score ?? 25),
              sortOrder: b.sortOrder ?? bIdx,
            });
          }
        }
      }
    }
  }

  await audit("template", data.id, "UPDATE_CUSTOM", { name: data.name });
  safeRevalidate("/setup/custom-kpi");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true };
}

export async function toggleArchiveCustomKpiAction(id: number) {
  const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
  if (!tpl) throw new Error("Template tidak ditemukan!");
  const newStatus = !tpl.isActive;
  await db.update(kpiTemplates).set({ isActive: newStatus, updatedAt: new Date() }).where(eq(kpiTemplates.id, id));
  await audit("template", id, newStatus ? "ACTIVATE" : "ARCHIVE");
  safeRevalidate("/setup/custom-kpi");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true, isActive: newStatus };
}

export async function duplicateCustomKpiAction(id: number) {
  const [src] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
  if (!src) throw new Error("Template tidak ditemukan!");
  const [newTpl] = await db
    .insert(kpiTemplates)
    .values({
      name: `${src.name} (Copy)`,
      departmentId: src.departmentId,
      jobLevelId: src.jobLevelId,
      baseTemplateId: src.baseTemplateId || src.id,
      isCustom: true,
      totalWeight: src.totalWeight,
      version: 1,
      isActive: true,
    })
    .returning();

  const cats = await db.select().from(kpiCategories).where(eq(kpiCategories.templateId, src.id));
  for (const c of cats) {
    const [nc] = await db
      .insert(kpiCategories)
      .values({
        templateId: newTpl.id,
        name: c.name,
        weight: c.weight,
        categoryType: c.categoryType,
        sortOrder: c.sortOrder,
      })
      .returning();

    const params = await db.select().from(kpiParameters).where(eq(kpiParameters.categoryId, c.id));
    for (const p of params) {
      const [np] = await db
        .insert(kpiParameters)
        .values({
          categoryId: nc.id,
          name: p.name,
          description: p.description,
          weight: p.weight,
          maxScore: p.maxScore,
          inputType: p.inputType,
          aggregation: p.aggregation,
          compareBasis: p.compareBasis,
          unit: p.unit,
          target: p.target,
          picRole: p.picRole,
          isMonthly: p.isMonthly,
          sortOrder: p.sortOrder,
          masterParameterId: p.masterParameterId,
        })
        .returning();

      const bands = await db.select().from(kpiBands).where(eq(kpiBands.parameterId, p.id));
      if (bands.length) {
        await db.insert(kpiBands).values(
          bands.map((b) => ({
            parameterId: np.id,
            label: b.label,
            operator: b.operator,
            minValue: b.minValue,
            maxValue: b.maxValue,
            score: b.score,
            sortOrder: b.sortOrder,
          }))
        );
      }
    }
  }

  await audit("template", newTpl.id, "DUPLICATE_CUSTOM", { from: id });
  safeRevalidate("/setup/custom-kpi");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true, newId: newTpl.id };
}

export async function getTemplateAssessorsAction(templateId: number, periodId: number) {
  const cats = await db
    .select({
      id: kpiCategories.id,
      name: kpiCategories.name,
      weight: kpiCategories.weight,
      categoryType: kpiCategories.categoryType,
      sortOrder: kpiCategories.sortOrder,
    })
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, templateId))
    .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) {
    return { categories: [], assignments: [] };
  }

  const assigns = await db
    .select({
      id: kpiAssessorAssignments.id,
      periodId: kpiAssessorAssignments.periodId,
      categoryId: kpiAssessorAssignments.categoryId,
      assessorEmployeeId: kpiAssessorAssignments.assessorEmployeeId,
      assessorNik: employees.nik,
      assessorName: employees.name,
      assessorPosition: employees.jobPosition,
      scopeType: kpiAssessorAssignments.scopeType,
    })
    .from(kpiAssessorAssignments)
    .innerJoin(employees, eq(kpiAssessorAssignments.assessorEmployeeId, employees.id))
    .where(
      and(
        eq(kpiAssessorAssignments.periodId, periodId),
        inArray(kpiAssessorAssignments.categoryId, catIds),
        eq(kpiAssessorAssignments.isActive, true)
      )
    );

  return { categories: cats, assignments: assigns };
}

export async function saveTemplateAssessorsAction(params: {
  templateId: number;
  periodId: number;
  assignments: Array<{ categoryId: number; assessorEmployeeId: number | null }>;
}) {
  const { templateId, periodId, assignments } = params;

  const cats = await db
    .select({ id: kpiCategories.id })
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, templateId));
  const catIds = cats.map((c) => c.id);

  if (catIds.length > 0) {
    await db
      .update(kpiAssessorAssignments)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(kpiAssessorAssignments.periodId, periodId),
          inArray(kpiAssessorAssignments.categoryId, catIds)
        )
      );
  }

  for (const item of assignments) {
    if (!item.assessorEmployeeId) continue;
    await db.insert(kpiAssessorAssignments).values({
      periodId,
      categoryId: item.categoryId,
      assessorEmployeeId: item.assessorEmployeeId,
      scopeType: "GLOBAL",
      isActive: true,
    });
  }

  await audit("template", templateId, "UPDATE_TEMPLATE_ASSESSORS", {
    periodId,
    assignmentsCount: assignments.filter((a) => a.assessorEmployeeId).length,
  });

  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true };
}

export async function toggleArchiveTemplateAction(id: number) {
  const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
  if (!tpl) throw new Error("Template tidak ditemukan!");
  const newStatus = !tpl.isActive;
  await db
    .update(kpiTemplates)
    .set({ isActive: newStatus, updatedAt: new Date() })
    .where(eq(kpiTemplates.id, id));
  await audit("template", id, newStatus ? "ACTIVATE" : "ARCHIVE");
  safeRevalidate("/setup/templates");
  safeRevalidate("/setup/assignments");
  revalidateAll();
  return { success: true, isActive: newStatus };
}

/**
 * Sinkronkan perubahan struktur, kriteria penilaian, skor band, dan bobot dari Master Template
 * ke seluruh dokumen penilaian (appraisals) karyawan yang menggunakan template ini.
 */
export async function syncTemplateToEmployeeAppraisalsAction(templateId: number) {
  try {
    const [tpl] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, templateId));
    if (!tpl) {
      return { success: false, error: "Master Template KPI tidak ditemukan." };
    }

    // 1. Ambil kategori, parameter, dan kriteria band terbaru dari master template
    const cats = await db
      .select()
      .from(kpiCategories)
      .where(eq(kpiCategories.templateId, templateId))
      .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

    const catIds = cats.map((c) => c.id);
    const catWeightMap = new Map(cats.map((c) => [c.id, c.weight]));

    const paramsList = catIds.length
      ? await db
          .select()
          .from(kpiParameters)
          .where(inArray(kpiParameters.categoryId, catIds))
          .orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id))
      : [];

    const paramIds = paramsList.map((p) => p.id);
    const allBands = paramIds.length
      ? await db
          .select()
          .from(kpiBands)
          .where(inArray(kpiBands.parameterId, paramIds))
          .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
      : [];

    const bandsByParamMap = new Map<
      number,
      Array<{
        id: number;
        label: string;
        operator: string;
        minValue: number | null;
        maxValue: number | null;
        score: number;
        sortOrder: number;
      }>
    >();

    for (const b of allBands) {
      const list = bandsByParamMap.get(b.parameterId) || [];
      list.push({
        id: b.id,
        label: b.label,
        operator: b.operator,
        minValue: b.minValue !== null ? Number(b.minValue) : null,
        maxValue: b.maxValue !== null ? Number(b.maxValue) : null,
        score: Number(b.score),
        sortOrder: b.sortOrder,
      });
      bandsByParamMap.set(b.parameterId, list);
    }

    // 2. Ambil seluruh appraisal karyawan yang menggunakan template ini
    const linkedAppraisals = await db
      .select({
        id: appraisals.id,
        employeeId: appraisals.employeeId,
        employeeName: employees.name,
        employeeNik: employees.nik,
        status: appraisals.status,
      })
      .from(appraisals)
      .innerJoin(employees, eq(appraisals.employeeId, employees.id))
      .where(eq(appraisals.templateId, templateId));

    if (linkedAppraisals.length === 0) {
      return {
        success: false,
        error: `Belum ada penilaian karyawan yang ditugaskan ke template "${tpl.name}". Silakan lakukan penugasan karyawan terlebih dahulu pada menu Penugasan Template.`,
      };
    }

    const templateParamIdsSet = new Set(paramIds);

    // 3. Update setiap appraisal karyawan
    for (const appr of linkedAppraisals) {
      const existingItems = await db
        .select()
        .from(appraisalItems)
        .where(eq(appraisalItems.appraisalId, appr.id));

      const existingParamMap = new Map<number, (typeof existingItems)[0]>();
      for (const it of existingItems) {
        if (it.parameterId) {
          existingParamMap.set(it.parameterId, it);
        }
      }

      // Update atau Insert setiap parameter dari template
      for (const p of paramsList) {
        const bandsSnapshot = bandsByParamMap.get(p.id) || [];
        const paramWeightSnapshot = catWeightMap.get(p.categoryId) ?? null;

        if (existingParamMap.has(p.id)) {
          const ex = existingParamMap.get(p.id)!;
          const updatePayload: Record<string, any> = {
            indicatorNameSnapshot: p.name,
            indicatorDescriptionSnapshot: p.description,
            unitSnapshot: p.unit,
            weightSnapshot: p.weight,
            parameterWeightSnapshot: paramWeightSnapshot,
            targetSnapshot: p.target,
            scoringRulesSnapshot: bandsSnapshot,
            updatedAt: new Date(),
          };

          if (ex.target === null || ex.target === undefined || ex.target === "") {
            updatePayload.target = p.target;
          }

          await db
            .update(appraisalItems)
            .set(updatePayload)
            .where(eq(appraisalItems.id, ex.id));
        } else {
          await db.insert(appraisalItems).values({
            appraisalId: appr.id,
            parameterId: p.id,
            indicatorNameSnapshot: p.name,
            indicatorDescriptionSnapshot: p.description,
            parameterWeightSnapshot: paramWeightSnapshot,
            target: p.target,
            targetSnapshot: p.target,
            unitSnapshot: p.unit,
            weightSnapshot: p.weight,
            scoringRulesSnapshot: bandsSnapshot,
            monthlyTargets:
              p.target !== null && p.target !== undefined
                ? Array(12).fill(Number(p.target))
                : null,
            updatedAt: new Date(),
          });
        }
      }

      // Hapus parameter usang yang sudah dihapus dari master template HANYA jika belum memiliki nilai aktual
      for (const ex of existingItems) {
        if (ex.parameterId && !templateParamIdsSet.has(ex.parameterId)) {
          const hasActual =
            ex.actual !== null ||
            ex.annualActual !== null ||
            (ex.monthlyActuals && ex.monthlyActuals.some((v) => v !== null));

          if (!hasActual) {
            await db.delete(appraisalItems).where(eq(appraisalItems.id, ex.id));
          }
        }
      }

      // Hitung ulang seluruh skor pada appraisal karyawan menggunakan scoring rules yang baru
      await recalculateAppraisal(appr.id);
    }

    // 4. Catat Audit Trail
    await audit("template", templateId, "SYNC_TO_EMPLOYEE_APPRAISALS", {
      templateName: tpl.name,
      totalAppraisalsUpdated: linkedAppraisals.length,
      employees: linkedAppraisals.map((a) => `${a.employeeName} (${a.employeeNik})`),
    });

    safeRevalidate(`/setup/templates/${templateId}`);
    safeRevalidate("/setup/templates");
    safeRevalidate("/kpi");
    safeRevalidate("/review");
    safeRevalidate("/dashboard");
    revalidateAll();

    const empListStr = linkedAppraisals.map((a) => a.employeeName).join(", ");
    return {
      success: true,
      count: linkedAppraisals.length,
      employeeNames: linkedAppraisals.map((a) => a.employeeName),
      message: `Berhasil memperbarui skor kriteria & struktur template ke ${linkedAppraisals.length} karyawan (${empListStr}). Form penilaian karyawan kini telah menggunakan kriteria Master Template terbaru.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Terjadi kesalahan saat menyinkronkan ke karyawan.",
    };
  }
}

/**
 * Sinkronkan satu dokumen penilaian (appraisal) karyawan dengan Master Template terkait
 */
export async function syncAppraisalWithTemplateAction(appraisalId: number) {
  try {
    const [appr] = await db
      .select({
        id: appraisals.id,
        templateId: appraisals.templateId,
        employeeId: appraisals.employeeId,
      })
      .from(appraisals)
      .where(eq(appraisals.id, appraisalId));

    if (!appr || !appr.templateId) {
      return { success: false, error: "Penilaian ini belum memiliki Master Template yang terhubung." };
    }

    return await syncTemplateToEmployeeAppraisalsAction(appr.templateId);
  } catch (err: any) {
    return { success: false, error: err?.message || "Gagal menyinkronkan penilaian." };
  }
}
