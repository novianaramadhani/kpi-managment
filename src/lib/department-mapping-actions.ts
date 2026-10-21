"use server";

import { db } from "@/db";
import {
  departmentMappings,
  departments,
  employees,
  pits,
  sites,
  auditLogs,
  type DepartmentMapping,
} from "@/db/schema";
import { and, eq, inArray, sql, asc, desc, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const s = (fd: FormData, k: string) => (fd.get(k)?.toString().trim() ?? "");
const i = (fd: FormData, k: string) => Number(s(fd, k)) || 0;

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

import {
  normalizeDeptNameSync,
  matchesSite,
  matchesDeptName,
  type DepartmentMappingWithDetails,
  type ParsedDepartmentMappingItem,
  type SmartDepartmentImportPayload,
  type SmartDepartmentImportResult,
} from "./department-mapping-utils";

/**
 * Mengambil seluruh data mapping departemen beserta detail departemen standar
 * dan jumlah karyawan aktif terkait.
 */
export async function getDepartmentMappingsAction(filters?: {
  site?: string;
  status?: string;
  pitId?: number;
  search?: string;
}): Promise<DepartmentMappingWithDetails[]> {
  const [allMappings, allDepts, allPits, allEmps] = await Promise.all([
    db.select().from(departmentMappings).orderBy(asc(departmentMappings.site), asc(departmentMappings.rawDepartmentName)),
    db.select().from(departments),
    db.select().from(pits),
    db.select({
      id: employees.id,
      departmentId: employees.departmentId,
      operatingUnit: employees.operatingUnit,
      originalDepartment: employees.originalDepartment,
      isActive: employees.isActive,
    }).from(employees),
  ]);

  const deptMap = new Map(allDepts.map((d) => [d.id, d]));
  const pitMap = new Map(allPits.map((p) => [p.id, p]));

  // Deteksi konflik antar-Site: nama asli sama tetapi target departmentId berbeda
  const nameToTargetsMap = new Map<string, Set<number | null>>();
  for (const m of allMappings) {
    if (!nameToTargetsMap.has(m.cleanRawName)) {
      nameToTargetsMap.set(m.cleanRawName, new Set());
    }
    nameToTargetsMap.get(m.cleanRawName)!.add(m.departmentId);
  }

  const results: DepartmentMappingWithDetails[] = allMappings.map((m) => {
    const dept = m.departmentId ? deptMap.get(m.departmentId) : undefined;
    let pit = m.pitId ? pitMap.get(m.pitId) : undefined;

    // Jika pitId belum terhubung di DB tetapi originalUnitDetail atau nama cocok dengan PIT di Master PIT, tarik otomatis dari database!
    if (!pit && (m.originalUnitDetail || m.rawDepartmentName)) {
      const matchKey = (m.originalUnitDetail || "").toLowerCase().trim();
      const rawLow = m.rawDepartmentName.toLowerCase().trim();
      const matched = allPits.find((p) => {
        const pName = p.name.toLowerCase().trim();
        return (
          (matchKey && (matchKey === pName || matchKey.includes(pName) || pName.includes(matchKey))) ||
          rawLow.endsWith(` ${pName}`) ||
          rawLow.endsWith(`-${pName}`) ||
          rawLow.includes(`(${pName})`) ||
          rawLow.includes(` ${pName} `) ||
          rawLow === pName
        );
      });
      if (matched) {
        pit = matched;
        // Simpan pitId ke DB secara background agar tersinkron permanen
        db.update(departmentMappings)
          .set({ pitId: matched.id, updatedAt: new Date() })
          .where(eq(departmentMappings.id, m.id))
          .catch(() => {});
      }
    }

    const targetSet = nameToTargetsMap.get(m.cleanRawName);
    // Terjadi variasi jika ada lebih dari 1 target berbeda pada nama asli yang sama
    const hasCrossSiteConflict = Boolean(targetSet && targetSet.size > 1);

    // Hitung total karyawan aktif yang terkait
    const totalEmployees = allEmps.filter((emp) => {
      if (!emp.isActive) return false;
      const matchSite = m.site === "ALL" || matchesSite(m.site, emp.operatingUnit);
      if (!matchSite) return false;

      if (emp.originalDepartment && matchesDeptName(m.cleanRawName, emp.originalDepartment)) {
        return true;
      }
      // Fallback jika originalDepartment belum terisi tetapi departmentId sesuai
      if (!emp.originalDepartment && m.departmentId && emp.departmentId === m.departmentId) {
        return true;
      }
      return false;
    }).length;

    return {
      id: m.id,
      site: m.site,
      rawDepartmentName: m.rawDepartmentName,
      cleanRawName: m.cleanRawName,
      departmentId: m.departmentId,
      pitId: pit?.id ?? m.pitId ?? null,
      originalUnitDetail: m.originalUnitDetail || pit?.name || null,
      status: m.status as "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION",
      notes: m.notes,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      standardDepartmentName: dept?.name,
      standardDepartmentCode: dept?.code,
      pitName: pit?.name,
      pitCode: pit?.code,
      totalEmployees,
      hasCrossSiteConflict,
    };
  });

  // Filter in-memory jika ada
  let filtered = results;
  if (filters?.site && filters.site !== "ALL") {
    filtered = filtered.filter((r) => r.site.toUpperCase() === filters.site!.toUpperCase());
  }
  if (filters?.status && filters.status !== "ALL") {
    filtered = filtered.filter((r) => r.status === filters.status);
  }
  if (filters?.pitId !== undefined) {
    if (filters.pitId === 0) {
      filtered = filtered.filter((r) => !r.pitId);
    } else {
      filtered = filtered.filter((r) => r.pitId === filters.pitId);
    }
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        r.rawDepartmentName.toLowerCase().includes(q) ||
        (r.standardDepartmentName || "").toLowerCase().includes(q) ||
        (r.standardDepartmentCode || "").toLowerCase().includes(q) ||
        (r.pitName || "").toLowerCase().includes(q) ||
        (r.pitCode || "").toLowerCase().includes(q) ||
        (r.originalUnitDetail || "").toLowerCase().includes(q)
    );
  }

  return filtered;
}

/**
 * Tambah aturan mapping baru
 */
export async function createDepartmentMappingAction(
  fd: FormData
): Promise<{ success: boolean; id: number; error?: string }> {
  try {
    const site = (s(fd, "site") || "ALL").toUpperCase();
    const siteIdVal = i(fd, "siteId");
    const rawDepartmentName = s(fd, "rawDepartmentName");
    const departmentIdVal = i(fd, "departmentId");
    const pitIdVal = i(fd, "pitId");
    const originalUnitDetail = s(fd, "originalUnitDetail") || null;
    const statusInput = s(fd, "status") || "MAPPED";
    const notes = s(fd, "notes") || null;

    if (!rawDepartmentName) {
      return { success: false, id: 0, error: "Nama departemen asli dari Excel wajib diisi." };
    }

    // Resolve siteId dinamis dari database
    let siteId: number | null = siteIdVal > 0 ? siteIdVal : null;
    if (!siteId && site !== "ALL") {
      const [foundSite] = await db.select().from(sites).where(eq(sites.code, site)).limit(1);
      if (foundSite) {
        siteId = foundSite.id;
      }
    }

    const cleanRawName = normalizeDeptNameSync(rawDepartmentName);

    const departmentId: number | null = departmentIdVal > 0 ? departmentIdVal : null;
    const pitId: number | null = pitIdVal > 0 ? pitIdVal : null;
    let status: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION" =
      statusInput === "UNMAPPED" || statusInput === "PENDING_VALIDATION" ? statusInput : "MAPPED";

    if (!departmentId) {
      status = "UNMAPPED";
    }

    let resolvedUnitDetail = originalUnitDetail;
    let resolvedPitId = pitId;
    if (!resolvedUnitDetail && resolvedPitId) {
      const [p] = await db.select().from(pits).where(eq(pits.id, resolvedPitId)).limit(1);
      if (p) resolvedUnitDetail = p.name;
    } else if (!resolvedPitId && resolvedUnitDetail) {
      const [p] = await db.select().from(pits).where(eq(pits.name, resolvedUnitDetail)).limit(1);
      if (p) resolvedPitId = p.id;
    }

    // Periksa apakah aturan mapping untuk (Site + cleanRawName) sudah ada di database
    const existing = await db
      .select()
      .from(departmentMappings)
      .where(and(eq(departmentMappings.site, site), eq(departmentMappings.cleanRawName, cleanRawName)));

    if (existing.length > 0) {
      // UPSERT: Perbarui aturan mapping yang sudah ada alih-alih melempar error
      const targetId = existing[0].id;
      await db
        .update(departmentMappings)
        .set({
          siteId: siteId ?? existing[0].siteId,
          site,
          rawDepartmentName,
          cleanRawName,
          departmentId,
          pitId: resolvedPitId,
          originalUnitDetail: resolvedUnitDetail,
          status,
          notes: notes || existing[0].notes,
          updatedAt: new Date(),
        })
        .where(eq(departmentMappings.id, targetId));

      await audit("department_mappings", targetId, "UPDATE", {
        siteId,
        site,
        rawDepartmentName,
        departmentId,
        pitId: resolvedPitId,
        status,
        actionType: "UPSERT_ON_CREATE",
      });

      safeRevalidate("/setup/master", "page");
      return { success: true, id: targetId };
    }

    const [inserted] = await db
      .insert(departmentMappings)
      .values({
        siteId,
        site,
        rawDepartmentName,
        cleanRawName,
        departmentId,
        pitId: resolvedPitId,
        originalUnitDetail: resolvedUnitDetail,
        status,
        notes,
      })
      .returning();

    await audit("department_mappings", inserted.id, "CREATE", {
      siteId,
      site,
      rawDepartmentName,
      departmentId,
      pitId: resolvedPitId,
      status,
    });

    safeRevalidate("/setup/master", "page");
    return { success: true, id: inserted.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan aturan mapping.";
    return { success: false, id: 0, error: errorMsg };
  }
}

/**
 * Update aturan mapping
 */
export async function updateDepartmentMappingAction(
  fd: FormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const id = i(fd, "id");
    if (!id) return { success: false, error: "ID mapping wajib ada." };

    const site = (s(fd, "site") || "ALL").toUpperCase();
    const siteIdVal = i(fd, "siteId");
    const rawDepartmentName = s(fd, "rawDepartmentName");
    const departmentIdVal = i(fd, "departmentId");
    const pitIdVal = i(fd, "pitId");
    const originalUnitDetail = s(fd, "originalUnitDetail") || null;
    const statusInput = s(fd, "status") || "MAPPED";
    const notes = s(fd, "notes") || null;

    if (!rawDepartmentName) {
      return { success: false, error: "Nama departemen asli dari Excel wajib diisi." };
    }

    // Resolve siteId dinamis dari database
    let siteId: number | null = siteIdVal > 0 ? siteIdVal : null;
    if (!siteId && site !== "ALL") {
      const [foundSite] = await db.select().from(sites).where(eq(sites.code, site)).limit(1);
      if (foundSite) {
        siteId = foundSite.id;
      }
    }

    const cleanRawName = normalizeDeptNameSync(rawDepartmentName);

    // Periksa duplikasi pada id berbeda
    const duplicate = await db
      .select()
      .from(departmentMappings)
      .where(
        and(
          ne(departmentMappings.id, id),
          eq(departmentMappings.site, site),
          eq(departmentMappings.cleanRawName, cleanRawName)
        )
      );

    if (duplicate.length > 0) {
      return {
        success: false,
        error: `Aturan mapping untuk Site "${site}" dan nama "${rawDepartmentName}" sudah digunakan data lain.`,
      };
    }

    let departmentId: number | null = departmentIdVal > 0 ? departmentIdVal : null;
    const pitId: number | null = pitIdVal > 0 ? pitIdVal : null;
    let status: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION" =
      statusInput === "UNMAPPED" || statusInput === "PENDING_VALIDATION" ? statusInput : "MAPPED";

    if (!departmentId) {
      status = "UNMAPPED";
    }

    let resolvedUnitDetail = originalUnitDetail;
    let resolvedPitId = pitId;
    if (!resolvedUnitDetail && resolvedPitId) {
      const [p] = await db.select().from(pits).where(eq(pits.id, resolvedPitId)).limit(1);
      if (p) resolvedUnitDetail = p.name;
    } else if (!resolvedPitId && resolvedUnitDetail) {
      const [p] = await db.select().from(pits).where(eq(pits.name, resolvedUnitDetail)).limit(1);
      if (p) resolvedPitId = p.id;
    }

    await db
      .update(departmentMappings)
      .set({
        siteId,
        site,
        rawDepartmentName,
        cleanRawName,
        departmentId,
        pitId: resolvedPitId,
        originalUnitDetail: resolvedUnitDetail,
        status,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(departmentMappings.id, id));

    await audit("department_mappings", id, "UPDATE", {
      siteId,
      site,
      rawDepartmentName,
      departmentId,
      pitId: resolvedPitId,
      status,
    });

    safeRevalidate("/setup/master", "page");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Terjadi kesalahan saat memperbarui aturan mapping.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Hapus single mapping
 */
export async function deleteDepartmentMappingAction(
  fd: FormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const id = i(fd, "id");
    if (!id) return { success: false, error: "ID mapping wajib diisi." };

    await db.delete(departmentMappings).where(eq(departmentMappings.id, id));
    await audit("department_mappings", id, "DELETE", null);

    safeRevalidate("/setup/master", "page");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus aturan mapping.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Hapus batch mapping
 */
export async function batchDeleteDepartmentMappingsAction(ids: number[]): Promise<{ count: number }> {
  if (!ids || ids.length === 0) return { count: 0 };

  await db.delete(departmentMappings).where(inArray(departmentMappings.id, ids));
  await audit("department_mappings", null, "BATCH_DELETE", { count: ids.length, ids });

  safeRevalidate("/setup/master", "page");
  return { count: ids.length };
}

/**
 * Set departemen standar massal untuk beberapa mapping terpilih
 */
export async function batchAssignStandardDepartmentAction(
  mappingIds: number[],
  departmentId: number,
  pitId?: number | null
): Promise<{ count: number }> {
  if (!mappingIds || mappingIds.length === 0) return { count: 0 };
  if (!departmentId) throw new Error("Departemen standar wajib dipilih.");

  const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
  if (!dept) throw new Error("Departemen standar tidak ditemukan.");

  const updatePayload: Record<string, unknown> = {
    departmentId,
    status: "MAPPED",
    updatedAt: new Date(),
  };

  if (pitId !== undefined) {
    updatePayload.pitId = pitId;
  }

  await db
    .update(departmentMappings)
    .set(updatePayload)
    .where(inArray(departmentMappings.id, mappingIds));

  await audit("department_mappings", null, "BATCH_ASSIGN", {
    count: mappingIds.length,
    departmentId,
    pitId,
    targetDeptName: dept.name,
  });

  safeRevalidate("/setup/master", "page");
  return { count: mappingIds.length };
}


/**
 * Import batch aturan mapping dari file Excel
 */
export async function importDepartmentMappingsBatch(
  items: ParsedDepartmentMappingItem[]
): Promise<{ count: number; updatedCount: number; errors: string[] }> {
  if (!items || items.length === 0) return { count: 0, updatedCount: 0, errors: [] };

  const [allDepts, allPits] = await Promise.all([
    db.select().from(departments),
    db.select().from(pits),
  ]);

  const deptCodeMap = new Map(allDepts.map((d) => [d.code.toLowerCase().trim(), d]));
  const deptNameMap = new Map(allDepts.map((d) => [d.name.toLowerCase().trim(), d]));
  const pitCodeMap = new Map(allPits.map((p) => [p.code.toLowerCase().trim(), p]));
  const pitNameMap = new Map(allPits.map((p) => [p.name.toLowerCase().trim(), p]));

  let insertedCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const rowNum = idx + 2; // Asumsi header pada baris 1
    const rawName = item.rawDepartmentName ? item.rawDepartmentName.trim() : "";
    if (!rawName) {
      errors.push(`Baris ${rowNum}: Nama departemen asli tidak boleh kosong.`);
      continue;
    }

    const site = (item.site ? item.site.trim() : "ALL").toUpperCase();
    const cleanRawName = normalizeDeptNameSync(rawName);

    // Cari referensi departemen standar jika ada
    let departmentId: number | null = null;
    let status: "MAPPED" | "UNMAPPED" | "PENDING_VALIDATION" = "UNMAPPED";

    if (item.standardDepartmentCodeOrName) {
      const search = item.standardDepartmentCodeOrName.toLowerCase().trim();
      const matched = deptCodeMap.get(search) || deptNameMap.get(search);
      if (matched) {
        departmentId = matched.id;
        status = "MAPPED";
      } else {
        errors.push(
          `Baris ${rowNum}: Departemen standar "${item.standardDepartmentCodeOrName}" tidak terdaftar di Master Departemen.`
        );
        status = "UNMAPPED";
      }
    }

    // Cari referensi PIT jika ada
    let pitId: number | null = null;
    if (item.pitCodeOrName) {
      const pitSearch = item.pitCodeOrName.toLowerCase().trim();
      const matchedPit = pitCodeMap.get(pitSearch) || pitNameMap.get(pitSearch);
      if (matchedPit) {
        pitId = matchedPit.id;
      }
    } else if (item.originalUnitDetail) {
      const unitSearch = item.originalUnitDetail.toLowerCase().trim();
      const matchedPit = pitCodeMap.get(unitSearch) || pitNameMap.get(unitSearch);
      if (matchedPit) {
        pitId = matchedPit.id;
      }
    }

    // Upsert mapping berdasarkan (site, cleanRawName)
    try {
      const [existing] = await db
        .select()
        .from(departmentMappings)
        .where(and(eq(departmentMappings.site, site), eq(departmentMappings.cleanRawName, cleanRawName)));

      if (existing) {
        await db
          .update(departmentMappings)
          .set({
            rawDepartmentName: rawName,
            departmentId: departmentId ?? existing.departmentId,
            pitId: pitId ?? existing.pitId,
            originalUnitDetail: item.originalUnitDetail || existing.originalUnitDetail,
            status: departmentId ? "MAPPED" : existing.status,
            notes: item.notes || existing.notes,
            updatedAt: new Date(),
          })
          .where(eq(departmentMappings.id, existing.id));
        updatedCount++;
      } else {
        await db.insert(departmentMappings).values({
          site,
          rawDepartmentName: rawName,
          cleanRawName,
          departmentId,
          pitId,
          originalUnitDetail: item.originalUnitDetail || null,
          status,
          notes: item.notes || null,
        });
        insertedCount++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Kesalahan database";
      errors.push(`Baris ${rowNum}: Gagal menyimpan mapping "${rawName}" (${msg}).`);
    }
  }

  safeRevalidate("/setup/master", "page");
  return { count: insertedCount, updatedCount, errors };
}

export async function getDepartmentMappingLookupMap() {
  const [allMappings, allDepts] = await Promise.all([
    db.select().from(departmentMappings),
    db.select().from(departments),
  ]);

  return { allMappings, allDepts };
}

/**
 * Server action cerdas untuk import Master Departemen dengan deteksi duplikasi
 * dan penugasan langsung ke Mapping Departemen.
 */
export async function importDepartmentsWithMappingAction(
  payload: SmartDepartmentImportPayload
): Promise<SmartDepartmentImportResult> {
  const errors: string[] = [];
  let createdDepartmentsCount = 0;
  let savedMappingsCount = 0;
  let skippedDuplicatesCount = payload.skippedCount || 0;

  try {
    // 1. Ambil seluruh departemen yang ada saat ini di database
    const existingDepts = await db.select().from(departments);
    const codeMap = new Map<string, number>(
      existingDepts.map((d) => [d.code.trim().toUpperCase(), d.id])
    );
    const nameMap = new Map<string, number>(
      existingDepts.map((d) => [normalizeDeptNameSync(d.name), d.id])
    );

    for (const d of payload.departmentsToCreate) {
      const code = (d.code || "").trim().toUpperCase();
      const name = (d.name || "").trim();

      if (!code || !name) continue;

      try {
        const [inserted] = await db
          .insert(departments)
          .values({ code, name })
          .onConflictDoUpdate({
            target: departments.code,
            set: { name },
          })
          .returning({ id: departments.id, code: departments.code });

        if (inserted) {
          codeMap.set(code, inserted.id);
          createdDepartmentsCount++;
          await audit("departments", inserted.id, "IMPORT", { code, name });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan database";
        errors.push(`Gagal menyimpan departemen "${name}" (${code}): ${msg}`);
      }
    }

    // 3. Simpan aturan ke tab Mapping Departemen (department_mappings)
    for (const m of payload.mappingsToSave) {
      const site = (m.site || "ALL").trim().toUpperCase() || "ALL";
      const rawName = (m.rawDepartmentName || "").trim();
      const cleanRawName = m.cleanRawName || normalizeDeptNameSync(rawName);

      if (!rawName) continue;

      // Cari target departmentId
      let targetDeptId: number | null = null;
      if (m.targetDepartmentId && m.targetDepartmentId > 0) {
        targetDeptId = m.targetDepartmentId;
      } else if (m.targetDepartmentCode) {
        const lookupCode = m.targetDepartmentCode.trim().toUpperCase();
        targetDeptId = codeMap.get(lookupCode) || null;
      }

      const status = m.status || (targetDeptId ? "MAPPED" : "PENDING_VALIDATION");

      try {
        const [existing] = await db
          .select()
          .from(departmentMappings)
          .where(and(eq(departmentMappings.site, site), eq(departmentMappings.cleanRawName, cleanRawName)));

        if (existing) {
          await db
            .update(departmentMappings)
            .set({
              rawDepartmentName: rawName,
              departmentId: targetDeptId ?? existing.departmentId,
              originalUnitDetail: m.originalUnitDetail ?? existing.originalUnitDetail,
              status,
              notes: m.notes || existing.notes,
              updatedAt: new Date(),
            })
            .where(eq(departmentMappings.id, existing.id));
          savedMappingsCount++;
          await audit("department_mappings", existing.id, "UPDATE_VIA_IMPORT", {
            site,
            rawName,
            targetDeptId,
            status,
          });
        } else {
          const [inserted] = await db
            .insert(departmentMappings)
            .values({
              site,
              rawDepartmentName: rawName,
              cleanRawName,
              departmentId: targetDeptId,
              originalUnitDetail: m.originalUnitDetail || null,
              status,
              notes: m.notes || "Diimpor melalui Import Master Departemen",
            })
            .returning({ id: departmentMappings.id });
          savedMappingsCount++;
          await audit("department_mappings", inserted.id, "CREATE_VIA_IMPORT", {
            site,
            rawName,
            targetDeptId,
            status,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan database";
        errors.push(`Gagal menyimpan mapping "${rawName}" (Site ${site}): ${msg}`);
      }
    }

    safeRevalidate("/setup/master", "page");
    return {
      success: errors.length === 0,
      createdDepartmentsCount,
      savedMappingsCount,
      skippedDuplicatesCount,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Kesalahan server tak terduga";
    errors.push(msg);
    return {
      success: false,
      createdDepartmentsCount,
      savedMappingsCount,
      skippedDuplicatesCount,
      errors,
    };
  }
}
