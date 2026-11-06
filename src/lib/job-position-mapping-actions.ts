"use server";

import { db } from "@/db";
import {
  jobPositions,
  jobPositionMappings,
  jobCategories,
  jobLevels,
  departments,
  employees,
  auditLogs,
  type JobPosition,
  type JobCategory,
  type JobPositionMapping,
} from "@/db/schema";
import { and, eq, ilike, inArray, sql, asc, desc, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const s = (fd: FormData, k: string) => (fd.get(k)?.toString().trim() ?? "");
const i = (fd: FormData, k: string) => Number(s(fd, k)) || 0;

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-fatal outside Next.js request context
  }
}

async function audit(
  entity: string,
  entityId: number | null,
  action: string,
  changes?: unknown,
  actor = "admin"
) {
  try {
    await db.insert(auditLogs).values({
      entity,
      entityId,
      action,
      changes: changes ?? null,
      actor,
    });
  } catch {
    // Non-fatal if audit fails
  }
}

export interface JobPositionMappingWithDetails {
  id: number | null; // mapping id, null if not yet mapped
  jobPositionId: number;
  positionCode: string | null;
  positionName: string;
  positionActive: boolean;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  jobLevelId: number | null;
  jobLevelCode: string | null;
  jobLevelName: string | null;
  jobCategoryId: number | null;
  jobCategoryCode: string | null;
  jobCategoryName: string | null;
  notes: string | null;
  isMapped: boolean; // true if both jobLevelId and jobCategoryId are filled
  isPartiallyMapped: boolean; // true if only one is filled
  employeeCount: number;
  updatedAt: Date | null;
}

/**
 * Mengambil semua kategori Job Category yang aktif / terdaftar
 */
export async function getJobCategoriesAction(): Promise<JobCategory[]> {
  return await db
    .select()
    .from(jobCategories)
    .orderBy(asc(jobCategories.sortOrder), asc(jobCategories.name));
}

/**
 * Tambah Job Category baru secara dinamis
 */
export async function createJobCategoryAction(fd: FormData): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const name = s(fd, "name");
    const code = (s(fd, "code") || name.toUpperCase().replace(/\s+/g, "_")).trim();
    const description = s(fd, "description") || null;
    const sortOrder = i(fd, "sortOrder") || 0;

    if (!name) {
      return { success: false, error: "Nama Job Category wajib diisi." };
    }

    // Check unique code
    const [existing] = await db.select().from(jobCategories).where(eq(jobCategories.code, code));
    if (existing) {
      return { success: false, error: `Kode Job Category "${code}" sudah digunakan.` };
    }

    const [created] = await db
      .insert(jobCategories)
      .values({
        code,
        name,
        description,
        sortOrder,
        isActive: true,
      })
      .returning({ id: jobCategories.id });

    await audit("job_categories", created.id, "CREATE", { code, name, description });
    safeRevalidate("/setup/master");
    return { success: true, id: created.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Ubah Job Category
 */
export async function updateJobCategoryAction(fd: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const id = i(fd, "id");
    const name = s(fd, "name");
    const code = s(fd, "code").trim();
    const description = s(fd, "description") || null;
    const isActive = fd.get("isActive") === "true";
    const sortOrder = i(fd, "sortOrder");

    if (!id || !name) {
      return { success: false, error: "ID dan Nama Job Category wajib diisi." };
    }

    // Check unique code if changed
    if (code) {
      const [duplicate] = await db
        .select()
        .from(jobCategories)
        .where(and(eq(jobCategories.code, code), sql`${jobCategories.id} != ${id}`));
      if (duplicate) {
        return { success: false, error: `Kode Job Category "${code}" sudah dipakai oleh kategori lain.` };
      }
    }

    await db
      .update(jobCategories)
      .set({
        name,
        ...(code ? { code } : {}),
        description,
        isActive,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(jobCategories.id, id));

    await audit("job_categories", id, "UPDATE", { name, code, description, isActive });
    safeRevalidate("/setup/master");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Hapus Job Category (jika belum dipakai dalam mapping)
 */
export async function deleteJobCategoryAction(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Check usage in mappings
    const [usage] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPositionMappings)
      .where(eq(jobPositionMappings.jobCategoryId, id));

    if (usage && usage.count > 0) {
      return {
        success: false,
        error: `Kategori tidak dapat dihapus karena masih digunakan pada ${usage.count} mapping Job Position. Ubah status menjadi non-aktif atau pindahkan mapping terlebih dahulu.`,
      };
    }

    await db.delete(jobCategories).where(eq(jobCategories.id, id));
    await audit("job_categories", id, "DELETE");
    safeRevalidate("/setup/master");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Mengambil seluruh data Job Position beserta detail mapping (Departemen, Job Level, Job Category)
 */
export async function getJobPositionMappingsWithDetailsAction(filters?: {
  departmentId?: number;
  jobLevelId?: number;
  jobCategoryId?: number;
  status?: "ALL" | "MAPPED" | "UNMAPPED";
  search?: string;
}): Promise<JobPositionMappingWithDetails[]> {
  const [allPositions, allDepts, allLevels, allCats, allMappings, allEmps] = await Promise.all([
    db.select().from(jobPositions).orderBy(asc(jobPositions.name)),
    db.select().from(departments),
    db.select().from(jobLevels),
    db.select().from(jobCategories),
    db.select().from(jobPositionMappings),
    db.select({
      id: employees.id,
      jobPositionId: employees.jobPositionId,
      jobPosition: employees.jobPosition,
      isActive: employees.isActive,
    }).from(employees),
  ]);

  const deptMap = new Map(allDepts.map((d) => [d.id, d]));
  const levelMap = new Map(allLevels.map((l) => [l.id, l]));
  const catMap = new Map(allCats.map((c) => [c.id, c]));
  const mappingMap = new Map(allMappings.map((m) => [m.jobPositionId, m]));

  // Active employee counts
  const empCounts = new Map<number, number>();
  for (const emp of allEmps) {
    if (emp.isActive === false) continue;
    if (emp.jobPositionId) {
      empCounts.set(emp.jobPositionId, (empCounts.get(emp.jobPositionId) || 0) + 1);
    } else if (emp.jobPosition) {
      const match = allPositions.find(
        (p) => p.name.toLowerCase().trim() === emp.jobPosition.toLowerCase().trim()
      );
      if (match) {
        empCounts.set(match.id, (empCounts.get(match.id) || 0) + 1);
      }
    }
  }

  const results: JobPositionMappingWithDetails[] = allPositions.map((pos) => {
    const dept = deptMap.get(pos.departmentId);
    const mapping = mappingMap.get(pos.id);

    // Job Level: from mapping if present, fallback to jobPosition.jobLevelId
    const effectiveJobLevelId = mapping?.jobLevelId ?? null;
    const level = effectiveJobLevelId ? levelMap.get(effectiveJobLevelId) : null;

    // Job Category: from mapping
    const effectiveJobCatId = mapping?.jobCategoryId ?? null;
    const cat = effectiveJobCatId ? catMap.get(effectiveJobCatId) : null;

    const isMapped = Boolean(effectiveJobLevelId && effectiveJobCatId);
    const isPartiallyMapped = Boolean((effectiveJobLevelId && !effectiveJobCatId) || (!effectiveJobLevelId && effectiveJobCatId));

    return {
      id: mapping?.id ?? null,
      jobPositionId: pos.id,
      positionCode: pos.code || null,
      positionName: pos.name,
      positionActive: pos.isActive,
      departmentId: pos.departmentId,
      departmentCode: dept?.code || "-",
      departmentName: dept?.name || "Tanpa Departemen",
      jobLevelId: effectiveJobLevelId,
      jobLevelCode: level?.code || null,
      jobLevelName: level?.name || null,
      jobCategoryId: effectiveJobCatId,
      jobCategoryCode: cat?.code || null,
      jobCategoryName: cat?.name || null,
      notes: mapping?.notes || null,
      isMapped,
      isPartiallyMapped,
      employeeCount: empCounts.get(pos.id) || 0,
      updatedAt: mapping?.updatedAt ?? pos.updatedAt,
    };
  });

  // Apply filters if provided
  return results.filter((item) => {
    if (filters?.departmentId && item.departmentId !== filters.departmentId) return false;
    if (filters?.jobLevelId && item.jobLevelId !== filters.jobLevelId) return false;
    if (filters?.jobCategoryId && item.jobCategoryId !== filters.jobCategoryId) return false;

    if (filters?.status === "MAPPED" && !item.isMapped) return false;
    if (filters?.status === "UNMAPPED" && item.isMapped) return false;

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      const matchPos = item.positionName.toLowerCase().includes(q) || (item.positionCode || "").toLowerCase().includes(q);
      const matchDept = item.departmentName.toLowerCase().includes(q) || item.departmentCode.toLowerCase().includes(q);
      const matchLvl = (item.jobLevelName || "").toLowerCase().includes(q);
      const matchCat = (item.jobCategoryName || "").toLowerCase().includes(q);
      if (!matchPos && !matchDept && !matchLvl && !matchCat) return false;
    }

    return true;
  });
}

/**
 * Simpan / perbarui mapping untuk suatu Job Position
 * Job Level dan Job Category dapat diatur secara terpisah
 */
export async function upsertJobPositionMappingAction(fd: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const jobPositionId = i(fd, "jobPositionId");
    const departmentIdFromForm = i(fd, "departmentId");
    const jobLevelId = fd.get("jobLevelId") ? Number(fd.get("jobLevelId")) || null : null;
    const jobCategoryId = fd.get("jobCategoryId") ? Number(fd.get("jobCategoryId")) || null : null;
    const notes = s(fd, "notes") || null;

    if (!jobPositionId) {
      return { success: false, error: "Job Position wajib dipilih." };
    }

    // Ambil data job position untuk verifikasi departemen
    const [pos] = await db.select().from(jobPositions).where(eq(jobPositions.id, jobPositionId));
    if (!pos) {
      return { success: false, error: "Job Position tidak ditemukan di database." };
    }

    const departmentId = departmentIdFromForm || pos.departmentId;

    // Cek apakah mapping sudah ada
    const [existing] = await db
      .select()
      .from(jobPositionMappings)
      .where(eq(jobPositionMappings.jobPositionId, jobPositionId));

    if (existing) {
      await db
        .update(jobPositionMappings)
        .set({
          departmentId,
          jobLevelId,
          jobCategoryId,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(jobPositionMappings.id, existing.id));

      await audit("job_position_mappings", existing.id, "UPDATE", {
        jobPositionId,
        departmentId,
        jobLevelId,
        jobCategoryId,
        notes,
      });
    } else {
      const [inserted] = await db
        .insert(jobPositionMappings)
        .values({
          jobPositionId,
          departmentId,
          jobLevelId,
          jobCategoryId,
          notes,
        })
        .returning({ id: jobPositionMappings.id });

      await audit("job_position_mappings", inserted.id, "CREATE", {
        jobPositionId,
        departmentId,
        jobLevelId,
        jobCategoryId,
        notes,
      });
    }

    // Jika jobLevelId disetel, kita juga dapat sinkronkan ke master job_positions jika valid
    if (jobLevelId) {
      await db
        .update(jobPositions)
        .set({
          jobLevelId,
          updatedAt: new Date(),
        })
        .where(eq(jobPositions.id, jobPositionId));
    }

    safeRevalidate("/setup/master");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Tambah Mapping Sekaligus Tambah Job Position Baru (Jika belum ada)
 */
export async function createPositionAndMappingAction(fd: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const departmentId = i(fd, "departmentId");
    const name = s(fd, "positionName");
    const code = s(fd, "positionCode") || null;
    const jobLevelId = fd.get("jobLevelId") ? Number(fd.get("jobLevelId")) || null : null;
    const jobCategoryId = fd.get("jobCategoryId") ? Number(fd.get("jobCategoryId")) || null : null;
    const notes = s(fd, "notes") || null;

    if (!departmentId || !name) {
      return { success: false, error: "Departemen dan Nama Job Position wajib diisi." };
    }

    // Ambil default job level (Staff) jika belum ada
    let defaultLevelId = jobLevelId;
    if (!defaultLevelId) {
      const [staffLevel] = await db.select().from(jobLevels).where(eq(jobLevels.code, "STAFF"));
      if (staffLevel) defaultLevelId = staffLevel.id;
      else {
        const [anyLvl] = await db.select().from(jobLevels).limit(1);
        defaultLevelId = anyLvl?.id ?? 1;
      }
    }

    // Cek apakah posisi dengan nama sama di departemen ini sudah ada
    const [existingPos] = await db
      .select()
      .from(jobPositions)
      .where(and(eq(jobPositions.departmentId, departmentId), ilike(jobPositions.name, name)));

    let finalPosId: number;

    if (existingPos) {
      finalPosId = existingPos.id;
    } else {
      const [created] = await db
        .insert(jobPositions)
        .values({
          name,
          code,
          departmentId,
          jobLevelId: defaultLevelId,
          isActive: true,
        })
        .returning({ id: jobPositions.id });
      finalPosId = created.id;
    }

    // Upsert mapping
    const [existingMapping] = await db
      .select()
      .from(jobPositionMappings)
      .where(eq(jobPositionMappings.jobPositionId, finalPosId));

    if (existingMapping) {
      await db
        .update(jobPositionMappings)
        .set({
          departmentId,
          jobLevelId,
          jobCategoryId,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(jobPositionMappings.id, existingMapping.id));
    } else {
      await db.insert(jobPositionMappings).values({
        jobPositionId: finalPosId,
        departmentId,
        jobLevelId,
        jobCategoryId,
        notes,
      });
    }

    safeRevalidate("/setup/master");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Hapus mapping suatu job position
 */
export async function deleteJobPositionMappingAction(jobPositionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await db.delete(jobPositionMappings).where(eq(jobPositionMappings.jobPositionId, jobPositionId));
    await audit("job_position_mappings", jobPositionId, "DELETE");
    safeRevalidate("/setup/master");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export interface ParsedJobPositionMappingRow {
  departmentCode?: string;
  departmentName?: string;
  positionCode?: string;
  positionName: string;
  jobLevelName?: string; // 'Staff' | 'Non Staff'
  jobCategoryName?: string; // e.g. 'SPV', 'Admin', 'Foreman', etc.
  notes?: string;
}

/**
 * Import Massal Excel Mapping Job Position (Departemen + Job Position -> Job Level + Job Category)
 */
export async function importJobPositionMappingsBatchAction(
  rows: ParsedJobPositionMappingRow[]
): Promise<{
  successCount: number;
  newCategoriesCount: number;
  createdPositionsCount: number;
  skippedCount: number;
  errors: string[];
}> {
  if (!rows || rows.length === 0) {
    return { successCount: 0, newCategoriesCount: 0, createdPositionsCount: 0, skippedCount: 0, errors: ["Data Excel kosong."] };
  }

  const [allDepts, allPositions, allLevels, existingCats] = await Promise.all([
    db.select().from(departments),
    db.select().from(jobPositions),
    db.select().from(jobLevels),
    db.select().from(jobCategories),
  ]);

  // Lookup maps
  const deptByCode = new Map(allDepts.map((d) => [d.code.toUpperCase().trim(), d]));
  const deptByName = new Map(allDepts.map((d) => [d.name.toLowerCase().trim(), d]));

  // Staff and Non Staff levels
  const staffLevel = allLevels.find((l) => l.code === "STAFF" || l.name.toLowerCase() === "staff");
  const nonStaffLevel = allLevels.find((l) => l.code === "NON_STAFF" || l.name.toLowerCase() === "non staff" || l.name.toLowerCase() === "non-staff");

  const catMap = new Map<string, JobCategory>();
  for (const c of existingCats) {
    catMap.set(c.code.toUpperCase().trim(), c);
    catMap.set(c.name.toLowerCase().trim(), c);
  }

  let successCount = 0;
  let newCategoriesCount = 0;
  let createdPositionsCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNum = idx + 2;

    const rawPosName = (r.positionName || "").trim();
    if (!rawPosName) {
      skippedCount++;
      continue;
    }

    // 1. Resolve Department
    let dept = null;
    if (r.departmentCode) {
      dept = deptByCode.get(r.departmentCode.toUpperCase().trim());
    }
    if (!dept && r.departmentName) {
      dept = deptByName.get(r.departmentName.toLowerCase().trim());
    }

    // 2. Resolve Job Position
    let pos = null;
    if (r.positionCode) {
      pos = allPositions.find((p) => (p.code || "").toUpperCase().trim() === r.positionCode?.toUpperCase().trim());
    }
    if (!pos) {
      if (dept) {
        pos = allPositions.find(
          (p) => p.departmentId === dept.id && p.name.toLowerCase().trim() === rawPosName.toLowerCase().trim()
        );
      } else {
        pos = allPositions.find((p) => p.name.toLowerCase().trim() === rawPosName.toLowerCase().trim());
      }
    }

    // If pos still not found but dept is found, create new job position
    if (!pos) {
      if (dept) {
        try {
          const [newPos] = await db
            .insert(jobPositions)
            .values({
              name: rawPosName,
              code: r.positionCode || null,
              departmentId: dept.id,
              jobLevelId: staffLevel?.id ?? allLevels[0].id,
              isActive: true,
            })
            .returning();
          pos = newPos;
          allPositions.push(newPos);
          createdPositionsCount++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Baris ${rowNum}: Gagal membuat Job Position "${rawPosName}": ${msg}`);
          continue;
        }
      } else {
        errors.push(`Baris ${rowNum}: Departemen tidak ditemukan untuk Job Position "${rawPosName}".`);
        continue;
      }
    }

    const effectiveDeptId = dept ? dept.id : pos.departmentId;

    // 3. Resolve Job Level (Staff vs Non Staff)
    let matchedLevelId: number | null = null;
    if (r.jobLevelName) {
      const cleanLvl = r.jobLevelName.toLowerCase().trim();
      if (cleanLvl.includes("non") && nonStaffLevel) {
        matchedLevelId = nonStaffLevel.id;
      } else if (cleanLvl.includes("staff") && staffLevel) {
        matchedLevelId = staffLevel.id;
      } else {
        // Fallback search in all job levels
        const found = allLevels.find(
          (l) => l.name.toLowerCase().trim() === cleanLvl || l.code.toLowerCase().trim() === cleanLvl
        );
        if (found) matchedLevelId = found.id;
      }
    }

    // 4. Resolve Job Category (Dinamis: Jika belum ada, otomatis buat baru)
    let matchedCatId: number | null = null;
    const rawCatName = (r.jobCategoryName || "").trim();
    if (rawCatName) {
      let foundCat = catMap.get(rawCatName.toLowerCase());
      if (!foundCat) {
        foundCat = catMap.get(rawCatName.toUpperCase());
      }

      if (foundCat) {
        matchedCatId = foundCat.id;
      } else {
        // Create new dynamic job category
        const code = rawCatName.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 30);
        try {
          const [newCat] = await db
            .insert(jobCategories)
            .values({
              code,
              name: rawCatName,
              sortOrder: existingCats.length + newCategoriesCount + 1,
              isActive: true,
            })
            .returning();
          matchedCatId = newCat.id;
          catMap.set(newCat.code.toUpperCase().trim(), newCat);
          catMap.set(newCat.name.toLowerCase().trim(), newCat);
          newCategoriesCount++;
        } catch {
          // If code duplicate, find by code
          const [existingByCode] = await db.select().from(jobCategories).where(eq(jobCategories.code, code));
          if (existingByCode) {
            matchedCatId = existingByCode.id;
          }
        }
      }
    }

    // 5. Upsert into job_position_mappings
    try {
      const [existingMapping] = await db
        .select()
        .from(jobPositionMappings)
        .where(eq(jobPositionMappings.jobPositionId, pos.id));

      if (existingMapping) {
        await db
          .update(jobPositionMappings)
          .set({
            departmentId: effectiveDeptId,
            ...(matchedLevelId !== null ? { jobLevelId: matchedLevelId } : {}),
            ...(matchedCatId !== null ? { jobCategoryId: matchedCatId } : {}),
            notes: r.notes || existingMapping.notes,
            updatedAt: new Date(),
          })
          .where(eq(jobPositionMappings.id, existingMapping.id));
      } else {
        await db.insert(jobPositionMappings).values({
          jobPositionId: pos.id,
          departmentId: effectiveDeptId,
          jobLevelId: matchedLevelId,
          jobCategoryId: matchedCatId,
          notes: r.notes || null,
        });
      }

      // Sync job level to job_positions if specified
      if (matchedLevelId) {
        await db
          .update(jobPositions)
          .set({ jobLevelId: matchedLevelId, updatedAt: new Date() })
          .where(eq(jobPositions.id, pos.id));
      }

      successCount++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Baris ${rowNum}: Gagal menyimpan mapping untuk "${pos.name}": ${msg}`);
    }
  }

  await audit("job_position_mappings", null, "IMPORT_BATCH", {
    successCount,
    createdPositionsCount,
    newCategoriesCount,
  });

  safeRevalidate("/setup/master");
  return {
    successCount,
    newCategoriesCount,
    createdPositionsCount,
    skippedCount,
    errors,
  };
}

// =========================================================================
// DETAIL KARYAWAN & DEPARTEMEN PER JOB CATEGORY
// =========================================================================

export interface CategoryEmployeeDetail {
  id: number;
  nik: string;
  name: string;
  jobPositionId: number | null;
  jobPositionName: string;
  jobLevelName: string | null;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  isActive: boolean;
}

export interface CategoryMappedPositionDetail {
  id: number;
  code: string | null;
  name: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  employeeCount: number;
}

export interface CategoryDetailsWithEmployees {
  category: JobCategory;
  positions: CategoryMappedPositionDetail[];
  employees: CategoryEmployeeDetail[];
  totalPositions: number;
  totalEmployees: number;
}

/**
 * Mengambil daftar karyawan dan departemen yang terkait dengan Job Category tertentu
 */
export async function getEmployeesByJobCategoryAction(
  categoryId: number
): Promise<{ success: boolean; data?: CategoryDetailsWithEmployees; error?: string }> {
  try {
    const [cat] = await db.select().from(jobCategories).where(eq(jobCategories.id, categoryId));
    if (!cat) {
      return { success: false, error: "Kategori tidak ditemukan." };
    }

    // 1. Ambil mapping posisi untuk kategori ini
    const mappings = await db
      .select({
        mappingId: jobPositionMappings.id,
        jobPositionId: jobPositionMappings.jobPositionId,
        departmentId: jobPositionMappings.departmentId,
        jobLevelId: jobPositionMappings.jobLevelId,
      })
      .from(jobPositionMappings)
      .where(eq(jobPositionMappings.jobCategoryId, categoryId));

    if (mappings.length === 0) {
      return {
        success: true,
        data: {
          category: cat,
          positions: [],
          employees: [],
          totalPositions: 0,
          totalEmployees: 0,
        },
      };
    }

    const posIds = mappings.map((m) => m.jobPositionId);

    // 2. Query posisi, departemen, dan data karyawan
    const [allPos, allDepts, allEmps, allLevels] = await Promise.all([
      db.select().from(jobPositions).where(inArray(jobPositions.id, posIds)),
      db.select().from(departments),
      db.select().from(employees),
      db.select().from(jobLevels),
    ]);

    const deptMap = new Map(allDepts.map((d) => [d.id, d]));
    const levelMap = new Map(allLevels.map((l) => [l.id, l]));
    const posMap = new Map(allPos.map((p) => [p.id, p]));
    const posNameMap = new Map(allPos.map((p) => [p.name.toLowerCase().trim(), p]));

    // Hitung karyawan & petakan
    const matchedEmployees: CategoryEmployeeDetail[] = [];
    const empCountPerPos = new Map<number, number>();

    for (const emp of allEmps) {
      let matchedPos: JobPosition | undefined;
      if (emp.jobPositionId && posMap.has(emp.jobPositionId)) {
        matchedPos = posMap.get(emp.jobPositionId);
      } else if (emp.jobPosition && posNameMap.has(emp.jobPosition.toLowerCase().trim())) {
        matchedPos = posNameMap.get(emp.jobPosition.toLowerCase().trim());
      }

      if (matchedPos) {
        if (emp.isActive !== false) {
          empCountPerPos.set(matchedPos.id, (empCountPerPos.get(matchedPos.id) || 0) + 1);
        }

        const empDept = deptMap.get(emp.departmentId) || deptMap.get(matchedPos.departmentId);
        const empLevel = emp.jobLevelId ? levelMap.get(emp.jobLevelId) : null;

        matchedEmployees.push({
          id: emp.id,
          nik: emp.nik,
          name: emp.name,
          jobPositionId: matchedPos.id,
          jobPositionName: matchedPos.name,
          jobLevelName: empLevel?.name || "-",
          departmentId: emp.departmentId,
          departmentCode: empDept?.code || "N/A",
          departmentName: empDept?.name || "N/A",
          isActive: emp.isActive !== false,
        });
      }
    }

    // Urutkan karyawan berdasarkan departemen lalu nama
    matchedEmployees.sort((a, b) => {
      const deptCmp = a.departmentName.localeCompare(b.departmentName);
      if (deptCmp !== 0) return deptCmp;
      return a.name.localeCompare(b.name);
    });

    const positions: CategoryMappedPositionDetail[] = allPos
      .map((pos) => {
        const dept = deptMap.get(pos.departmentId);
        return {
          id: pos.id,
          code: pos.code,
          name: pos.name,
          departmentId: pos.departmentId,
          departmentCode: dept?.code || "N/A",
          departmentName: dept?.name || "N/A",
          employeeCount: empCountPerPos.get(pos.id) || 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: {
        category: cat,
        positions,
        employees: matchedEmployees,
        totalPositions: positions.length,
        totalEmployees: matchedEmployees.filter((e) => e.isActive).length,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}


