"use server";

import { db } from "@/db";
import { pits, sites, departments, departmentMappings, kpiTemplates, auditLogs, type Pit } from "@/db/schema";
import { eq, asc, desc, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminOrHr } from "@/lib/auth-guard";

const s = (fd: FormData, k: string) => (fd.get(k)?.toString().trim() ?? "");
const b = (fd: FormData, k: string) => fd.get(k) === "true" || fd.get(k) === "on";

function safeRevalidate() {
  try {
    revalidatePath("/setup/master");
    revalidatePath("/setup/templates");
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

export interface LinkedDepartmentItem {
  id: number;
  code: string;
  name: string;
  source: "MAPPING" | "TEMPLATE";
}

export interface PitWithStats extends Pit {
  siteName?: string;
  mappedDepartmentCount: number;
  templateCount: number;
  linkedDepartments: LinkedDepartmentItem[];
}

/**
 * Mengambil seluruh data Master PIT beserta data Site relasional, statistik, dan relasi departemen
 */
export async function getPitsAction(): Promise<PitWithStats[]> {
  const [allPits, allSites, allMappings, allTemplates, allDepts] = await Promise.all([
    db.select().from(pits).orderBy(asc(pits.site), asc(pits.name)),
    db.select().from(sites),
    db
      .select({
        id: departmentMappings.id,
        pitId: departmentMappings.pitId,
        departmentId: departmentMappings.departmentId,
        rawDepartmentName: departmentMappings.rawDepartmentName,
      })
      .from(departmentMappings),
    db
      .select({
        id: kpiTemplates.id,
        pitId: kpiTemplates.pitId,
        departmentId: kpiTemplates.departmentId,
      })
      .from(kpiTemplates),
    db.select().from(departments),
  ]);

  const siteMapById = new Map<number, string>();
  const siteMapByCode = new Map<string, string>();
  for (const st of allSites) {
    siteMapById.set(st.id, st.name);
    siteMapByCode.set(st.code.toUpperCase(), st.name);
  }

  const deptMap = new Map<number, { id: number; code: string; name: string }>();
  allDepts.forEach((d) => deptMap.set(d.id, { id: d.id, code: d.code, name: d.name }));

  const mappingCountMap = new Map<number, number>();
  const pitDeptMap = new Map<number, Map<number, LinkedDepartmentItem>>();

  for (const m of allMappings) {
    if (m.pitId) {
      mappingCountMap.set(m.pitId, (mappingCountMap.get(m.pitId) || 0) + 1);

      if (!pitDeptMap.has(m.pitId)) pitDeptMap.set(m.pitId, new Map());
      if (m.departmentId && deptMap.has(m.departmentId)) {
        const d = deptMap.get(m.departmentId)!;
        pitDeptMap.get(m.pitId)!.set(d.id, {
          id: d.id,
          code: d.code,
          name: d.name,
          source: "MAPPING",
        });
      }
    }
  }

  const templateCountMap = new Map<number, number>();
  for (const t of allTemplates) {
    if (t.pitId) {
      templateCountMap.set(t.pitId, (templateCountMap.get(t.pitId) || 0) + 1);

      if (!pitDeptMap.has(t.pitId)) pitDeptMap.set(t.pitId, new Map());
      if (t.departmentId && deptMap.has(t.departmentId)) {
        const d = deptMap.get(t.departmentId)!;
        if (!pitDeptMap.get(t.pitId)!.has(d.id)) {
          pitDeptMap.get(t.pitId)!.set(d.id, {
            id: d.id,
            code: d.code,
            name: d.name,
            source: "TEMPLATE",
          });
        }
      }
    }
  }

  return allPits.map((p) => {
    const siteName =
      (p.siteId ? siteMapById.get(p.siteId) : undefined) ||
      siteMapByCode.get((p.site || "").toUpperCase()) ||
      p.site;

    const linkedDepartments = Array.from(pitDeptMap.get(p.id)?.values() || []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      ...p,
      siteName,
      mappedDepartmentCount: mappingCountMap.get(p.id) || 0,
      templateCount: templateCountMap.get(p.id) || 0,
      linkedDepartments,
    };
  });
}

/**
 * Tambah data Master PIT baru
 */
export async function createPitAction(fd: FormData): Promise<{ success: boolean; id: number }> {
  await requireAdminOrHr();
  let code = s(fd, "code").toUpperCase().replace(/\s+/g, "-");
  const name = s(fd, "name");
  const siteInput = s(fd, "site");
  const siteIdRaw = Number(fd.get("siteId")) || 0;
  const description = s(fd, "description") || null;
  const isActive = fd.has("isActive") ? b(fd, "isActive") : true;

  if (!name) {
    throw new Error("Nama PIT wajib diisi.");
  }

  // Jika kode belum diisi, buat angka unik otomatis
  if (!code) {
    const existingPits = await db.select({ id: pits.id, code: pits.code }).from(pits);
    let max = 0;
    for (const p of existingPits) {
      if (/^\d+$/.test(p.code.trim())) {
        const num = parseInt(p.code.trim(), 10);
        if (num > max) max = num;
      } else {
        const match = p.code.match(/\d+/g);
        if (match) {
          for (const m of match) {
            const num = parseInt(m, 10);
            if (num > max) max = num;
          }
        }
      }
      if (p.id > max) max = p.id;
    }
    const next = max + 1;
    let candidate = String(next).padStart(3, "0");
    const existingCodes = new Set(existingPits.map((p) => p.code.toUpperCase()));
    let n = next;
    while (existingCodes.has(candidate)) {
      n++;
      candidate = String(n).padStart(3, "0");
    }
    code = candidate;
  }

  // Cari site dari database secara dinamis
  let resolvedSiteId: number | null = null;
  let resolvedSiteCode = siteInput.toUpperCase();

  if (siteIdRaw > 0) {
    const [foundSite] = await db.select().from(sites).where(eq(sites.id, siteIdRaw)).limit(1);
    if (foundSite) {
      resolvedSiteId = foundSite.id;
      resolvedSiteCode = foundSite.code;
    }
  }

  if (!resolvedSiteId && resolvedSiteCode) {
    const [foundSite] = await db.select().from(sites).where(eq(sites.code, resolvedSiteCode)).limit(1);
    if (foundSite) {
      resolvedSiteId = foundSite.id;
      resolvedSiteCode = foundSite.code;
    }
  }

  if (!resolvedSiteId && !resolvedSiteCode) {
    throw new Error("Site keterkaitan wajib dipilih untuk Master PIT.");
  }

  // Cek duplikasi kode
  const [existing] = await db.select().from(pits).where(eq(pits.code, code)).limit(1);
  if (existing) {
    throw new Error(`Kode PIT "${code}" sudah digunakan oleh PIT "${existing.name}".`);
  }

  const [inserted] = await db
    .insert(pits)
    .values({
      code,
      name,
      siteId: resolvedSiteId,
      site: resolvedSiteCode,
      description,
      isActive,
    })
    .returning();

  // Sinkronisasi relasi departemen jika disediakan
  let selectedDeptIds: number[] = [];
  if (fd.has("departmentIds")) {
    const deptIdsRaw = s(fd, "departmentIds");
    selectedDeptIds = deptIdsRaw
      ? deptIdsRaw
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
  } else if (fd.has("departmentId")) {
    const dId = Number(fd.get("departmentId")) || 0;
    if (dId > 0) selectedDeptIds = [dId];
  }

  for (const dId of selectedDeptIds) {
      const [foundMapping] = await db
        .select()
        .from(departmentMappings)
        .where(
          sql`${departmentMappings.site} = ${resolvedSiteCode} AND ${departmentMappings.departmentId} = ${dId}`
        )
        .limit(1);

      if (foundMapping) {
        await db
          .update(departmentMappings)
          .set({ pitId: inserted.id, updatedAt: new Date() })
          .where(eq(departmentMappings.id, foundMapping.id));
      } else {
        const [dept] = await db.select().from(departments).where(eq(departments.id, dId)).limit(1);
        if (dept) {
          await db.insert(departmentMappings).values({
            siteId: resolvedSiteId,
            site: resolvedSiteCode,
            rawDepartmentName: dept.name,
            cleanRawName: dept.name.toUpperCase().trim(),
            departmentId: dept.id,
            pitId: inserted.id,
            status: "MAPPED",
          });
        }
    }
  }

  await audit("pit", inserted.id, "CREATE", { code, name, site: resolvedSiteCode, siteId: resolvedSiteId, description, isActive });
  safeRevalidate();
  return { success: true, id: inserted.id };
}

/**
 * Perbarui data Master PIT
 */
export async function updatePitAction(fd: FormData): Promise<{ success: boolean }> {
  await requireAdminOrHr();
  const id = Number(fd.get("id")) || 0;
  if (!id) throw new Error("ID PIT tidak valid.");

  const code = s(fd, "code").toUpperCase().replace(/\s+/g, "-");
  const name = s(fd, "name");
  const siteInput = s(fd, "site");
  const siteIdRaw = Number(fd.get("siteId")) || 0;
  const description = s(fd, "description") || null;
  const isActive = fd.has("isActive") ? b(fd, "isActive") : true;

  if (!code || !name) {
    throw new Error("Kode PIT dan Nama PIT wajib diisi.");
  }

  // Cari site dari database secara dinamis
  let resolvedSiteId: number | null = null;
  let resolvedSiteCode = siteInput.toUpperCase();

  if (siteIdRaw > 0) {
    const [foundSite] = await db.select().from(sites).where(eq(sites.id, siteIdRaw)).limit(1);
    if (foundSite) {
      resolvedSiteId = foundSite.id;
      resolvedSiteCode = foundSite.code;
    }
  }

  if (!resolvedSiteId && resolvedSiteCode) {
    const [foundSite] = await db.select().from(sites).where(eq(sites.code, resolvedSiteCode)).limit(1);
    if (foundSite) {
      resolvedSiteId = foundSite.id;
      resolvedSiteCode = foundSite.code;
    }
  }

  // Cek duplikasi kode pada ID berbeda
  const duplicates = await db.select().from(pits).where(eq(pits.code, code));
  const hasDup = duplicates.some((d) => d.id !== id);
  if (hasDup) {
    throw new Error(`Kode PIT "${code}" sudah digunakan oleh data PIT lain.`);
  }

  await db
    .update(pits)
    .set({
      code,
      name,
      siteId: resolvedSiteId,
      site: resolvedSiteCode,
      description,
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(pits.id, id));

  // Sinkronisasi relasi departemen jika disediakan
  if (fd.has("departmentIds") || fd.has("departmentId")) {
    let selectedDeptIds: number[] = [];
    if (fd.has("departmentIds")) {
      const deptIdsRaw = s(fd, "departmentIds");
      selectedDeptIds = deptIdsRaw
        ? deptIdsRaw
            .split(",")
            .map((x) => Number(x.trim()))
            .filter((n) => Number.isInteger(n) && n > 0)
        : [];
    } else if (fd.has("departmentId")) {
      const dId = Number(fd.get("departmentId")) || 0;
      if (dId > 0) selectedDeptIds = [dId];
    }

    const existingMappings = await db
      .select()
      .from(departmentMappings)
      .where(eq(departmentMappings.pitId, id));

    // Lepas relasi yang tidak dipilih lagi
    for (const m of existingMappings) {
      if (m.departmentId && !selectedDeptIds.includes(m.departmentId)) {
        await db
          .update(departmentMappings)
          .set({ pitId: null, updatedAt: new Date() })
          .where(eq(departmentMappings.id, m.id));
      }
    }

    // Pasang relasi baru
    for (const dId of selectedDeptIds) {
      const alreadyLinked = existingMappings.some((m) => m.departmentId === dId);
      if (!alreadyLinked) {
        const [foundMapping] = await db
          .select()
          .from(departmentMappings)
          .where(
            sql`${departmentMappings.site} = ${resolvedSiteCode} AND ${departmentMappings.departmentId} = ${dId}`
          )
          .limit(1);

        if (foundMapping) {
          await db
            .update(departmentMappings)
            .set({ pitId: id, updatedAt: new Date() })
            .where(eq(departmentMappings.id, foundMapping.id));
        } else {
          const [dept] = await db.select().from(departments).where(eq(departments.id, dId)).limit(1);
          if (dept) {
            await db.insert(departmentMappings).values({
              siteId: resolvedSiteId,
              site: resolvedSiteCode,
              rawDepartmentName: dept.name,
              cleanRawName: dept.name.toUpperCase().trim(),
              departmentId: dept.id,
              pitId: id,
              status: "MAPPED",
            });
          }
        }
      }
    }
  }

  await audit("pit", id, "UPDATE", { code, name, site: resolvedSiteCode, siteId: resolvedSiteId, description, isActive });
  safeRevalidate();
  return { success: true };
}

/**
 * Hapus data Master PIT
 */
export async function deletePitAction(fd: FormData): Promise<{ success: boolean }> {
  await requireAdminOrHr();
  const id = Number(fd.get("id")) || 0;
  if (!id) throw new Error("ID PIT tidak valid.");

  // Periksa keterkaitan
  const [usedMapping] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(departmentMappings)
    .where(eq(departmentMappings.pitId, id));

  const [usedTpl] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kpiTemplates)
    .where(eq(kpiTemplates.pitId, id));

  const mCount = Number(usedMapping?.count || 0);
  const tCount = Number(usedTpl?.count || 0);

  if (mCount > 0 || tCount > 0) {
    throw new Error(
      `PIT tidak dapat dihapus karena sedang digunakan dalam ${mCount} Mapping Departemen dan ${tCount} Template KPI. Nonaktifkan status PIT jika tidak ingin digunakan lagi.`
    );
  }

  const [target] = await db.select().from(pits).where(eq(pits.id, id)).limit(1);
  await db.delete(pits).where(eq(pits.id, id));

  await audit("pit", id, "DELETE", { code: target?.code, name: target?.name });
  safeRevalidate();
  return { success: true };
}

/**
 * Hapus batch data Master PIT
 */
export async function batchDeletePitsAction(
  ids: number[]
): Promise<{ count: number; skippedCount: number; errors: string[] }> {
  await requireAdminOrHr();
  if (!ids || ids.length === 0) return { count: 0, skippedCount: 0, errors: [] };

  let count = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  const targetPits = await db.select().from(pits).where(inArray(pits.id, ids));
  const targetMap = new Map(targetPits.map((p) => [p.id, p]));

  for (const id of ids) {
    const pitItem = targetMap.get(id);
    if (!pitItem) continue;

    // Periksa keterkaitan
    const [usedMapping] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(departmentMappings)
      .where(eq(departmentMappings.pitId, id));

    const [usedTpl] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kpiTemplates)
      .where(eq(kpiTemplates.pitId, id));

    const mCount = Number(usedMapping?.count || 0);
    const tCount = Number(usedTpl?.count || 0);

    if (mCount > 0 || tCount > 0) {
      skippedCount++;
      continue;
    }

    try {
      await db.delete(pits).where(eq(pits.id, id));
      await audit("pit", id, "BATCH_DELETE", { code: pitItem.code, name: pitItem.name });
      count++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      errors.push(`${pitItem.code}: ${msg}`);
    }
  }

  safeRevalidate();
  return { count, skippedCount, errors };
}

/**
 * Toggle status aktif PIT
 */
export async function togglePitStatusAction(id: number): Promise<{ success: boolean; newStatus: boolean }> {
  await requireAdminOrHr();
  const [target] = await db.select().from(pits).where(eq(pits.id, id)).limit(1);
  if (!target) throw new Error("PIT tidak ditemukan.");

  const newStatus = !target.isActive;
  await db.update(pits).set({ isActive: newStatus, updatedAt: new Date() }).where(eq(pits.id, id));

  await audit("pit", id, "STATUS_TOGGLE", { isActive: newStatus });
  safeRevalidate();
  return { success: true, newStatus };
}

/**
 * Batch import data Master PIT
 */
export async function importPitsBatch(
  items: {
    code: string;
    name: string;
    site?: string;
    description?: string;
    departments?: string;
    department?: string;
  }[]
): Promise<{ createdCount: number; updatedCount: number; errors: string[] }> {
  await requireAdminOrHr();
  let createdCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const code = (item.code || "").trim().toUpperCase().replace(/\s+/g, "-");
    const name = (item.name || "").trim();
    const site = (item.site || "GAM").trim().toUpperCase();
    const description = (item.description || "").trim() || null;
    const deptStr = (item.departments || item.department || "").trim();

    if (!code || !name) {
      errors.push(`Baris ${idx + 1}: Kode dan Nama PIT wajib diisi.`);
      continue;
    }

    try {
      const [foundSite] = site ? await db.select().from(sites).where(eq(sites.code, site)).limit(1) : [null];
      const resolvedSiteId = foundSite?.id ?? null;

      let targetPitId: number | null = null;
      const [existing] = await db.select().from(pits).where(eq(pits.code, code)).limit(1);
      if (existing) {
        await db
          .update(pits)
          .set({
            name,
            siteId: resolvedSiteId ?? existing.siteId,
            site: site || existing.site,
            description: description || existing.description,
            updatedAt: new Date(),
          })
          .where(eq(pits.id, existing.id));
        targetPitId = existing.id;
        updatedCount++;
      } else {
        const [inserted] = await db
          .insert(pits)
          .values({
            code,
            name,
            siteId: resolvedSiteId,
            site: site || "GAM",
            description,
            isActive: true,
          })
          .returning();
        targetPitId = inserted.id;
        createdCount++;
      }

      // Hubungkan departemen jika ada kolom departemen di file Excel
      if (deptStr && targetPitId) {
        const deptNames = deptStr.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        for (const dn of deptNames) {
          const [foundDept] = await db
            .select()
            .from(departments)
            .where(sql`lower(${departments.name}) = ${dn} OR lower(${departments.code}) = ${dn}`)
            .limit(1);

          if (foundDept) {
            const [foundMapping] = await db
              .select()
              .from(departmentMappings)
              .where(
                sql`${departmentMappings.site} = ${site} AND ${departmentMappings.departmentId} = ${foundDept.id}`
              )
              .limit(1);

            if (foundMapping) {
              await db
                .update(departmentMappings)
                .set({ pitId: targetPitId, updatedAt: new Date() })
                .where(eq(departmentMappings.id, foundMapping.id));
            } else {
              await db.insert(departmentMappings).values({
                siteId: resolvedSiteId,
                site,
                rawDepartmentName: foundDept.name,
                cleanRawName: foundDept.name.toUpperCase().trim(),
                departmentId: foundDept.id,
                pitId: targetPitId,
                status: "MAPPED",
              });
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan database";
      errors.push(`Baris ${idx + 1} (${code}): ${msg}`);
    }
  }

  await audit("pit", null, "IMPORT_BATCH", { total: items.length, createdCount, updatedCount, errorsCount: errors.length });
  safeRevalidate();
  return { createdCount, updatedCount, errors };
}
