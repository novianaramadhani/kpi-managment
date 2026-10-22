"use server";

import { db } from "@/db";
import { sites, pits, departmentMappings, employees } from "@/db/schema";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

export interface SiteWithStats {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  pitCount: number;
  mappingCount: number;
  employeeCount: number;
}

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function i(fd: FormData, key: string): number {
  return Number(fd.get(key) ?? 0);
}

function revalidateAll() {
  try {
    revalidatePath("/setup/master");
    revalidatePath("/setup/master?tab=units");
    revalidatePath("/setup/master?tab=pit");
    revalidatePath("/setup/master?tab=departemen");
    revalidatePath("/setup/templates");
  } catch {}
}

/**
 * Mengambil seluruh data Master Site beserta statistik penggunaannya
 */
export async function getSitesAction(): Promise<SiteWithStats[]> {
  const allSites = await db.select().from(sites).orderBy(asc(sites.code));

  // Ambil statistik per site
  const [pitCounts, mappingCounts, empCounts] = await Promise.all([
    db
      .select({
        siteId: pits.siteId,
        siteCode: pits.site,
        count: sql<number>`count(*)::int`,
      })
      .from(pits)
      .groupBy(pits.siteId, pits.site),
    db
      .select({
        siteId: departmentMappings.siteId,
        siteCode: departmentMappings.site,
        count: sql<number>`count(*)::int`,
      })
      .from(departmentMappings)
      .groupBy(departmentMappings.siteId, departmentMappings.site),
    db
      .select({
        operatingUnit: employees.operatingUnit,
        count: sql<number>`count(*)::int`,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .groupBy(employees.operatingUnit),
  ]);

  const pitMap: Record<string, number> = {};
  for (const r of pitCounts) {
    if (r.siteId) pitMap[String(r.siteId)] = (pitMap[String(r.siteId)] || 0) + Number(r.count);
    if (r.siteCode) pitMap[r.siteCode.toUpperCase()] = (pitMap[r.siteCode.toUpperCase()] || 0) + Number(r.count);
  }

  const mapMap: Record<string, number> = {};
  for (const r of mappingCounts) {
    if (r.siteId) mapMap[String(r.siteId)] = (mapMap[String(r.siteId)] || 0) + Number(r.count);
    if (r.siteCode) mapMap[r.siteCode.toUpperCase()] = (mapMap[r.siteCode.toUpperCase()] || 0) + Number(r.count);
  }

  const empMap: Record<string, number> = {};
  for (const r of empCounts) {
    if (r.operatingUnit) empMap[r.operatingUnit.toUpperCase()] = Number(r.count);
  }

  return allSites.map((site) => {
    const codeUpper = site.code.toUpperCase();
    const pCount = pitMap[String(site.id)] || pitMap[codeUpper] || 0;
    const mCount = mapMap[String(site.id)] || mapMap[codeUpper] || 0;
    const eCount = empMap[codeUpper] || 0;

    return {
      ...site,
      pitCount: pCount,
      mappingCount: mCount,
      employeeCount: eCount,
    };
  });
}

/**
 * Tambah Site Baru
 */
export async function createSiteAction(fd: FormData): Promise<{ success: boolean; id: number }> {
  await requireAdmin();
  const code = s(fd, "code").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const name = s(fd, "name");
  const description = s(fd, "description") || null;
  const isActive = s(fd, "isActive") !== "false";

  if (!code) throw new Error("Kode Site wajib diisi.");
  if (!name) throw new Error("Nama Site wajib diisi.");

  const [existing] = await db
    .select()
    .from(sites)
    .where(ilike(sites.code, code))
    .limit(1);

  if (existing) {
    throw new Error(`Kode Site "${code}" sudah digunakan oleh "${existing.name}".`);
  }

  const [row] = await db
    .insert(sites)
    .values({
      code,
      name,
      description,
      isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  revalidateAll();
  return { success: true, id: row.id };
}

/**
 * Ubah Data Site
 */
export async function updateSiteAction(fd: FormData): Promise<{ success: boolean }> {
  await requireAdmin();
  const id = i(fd, "id");
  if (!id) throw new Error("ID Site tidak valid.");

  const code = s(fd, "code").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const name = s(fd, "name");
  const description = s(fd, "description") || null;
  const isActive = s(fd, "isActive") !== "false";

  if (!code) throw new Error("Kode Site wajib diisi.");
  if (!name) throw new Error("Nama Site wajib diisi.");

  const [target] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!target) throw new Error("Site tidak ditemukan.");

  // Cek duplikasi kode dengan site lain
  const [duplicate] = await db
    .select()
    .from(sites)
    .where(and(ilike(sites.code, code), sql`${sites.id} <> ${id}`))
    .limit(1);

  if (duplicate) {
    throw new Error(`Kode Site "${code}" sudah digunakan oleh site lain.`);
  }

  await db
    .update(sites)
    .set({
      code,
      name,
      description,
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, id));

  // Jika kode site berubah, sinkronkan string site di pits & department_mappings
  if (target.code !== code) {
    await db.update(pits).set({ site: code }).where(eq(pits.siteId, id));
    await db.update(departmentMappings).set({ site: code }).where(eq(departmentMappings.siteId, id));
  }

  revalidateAll();
  return { success: true };
}

/**
 * Hapus Site
 */
export async function deleteSiteAction(fd: FormData): Promise<{ success: boolean }> {
  await requireAdmin();
  const id = i(fd, "id");
  if (!id) throw new Error("ID Site tidak valid.");

  const [target] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!target) throw new Error("Site tidak ditemukan.");

  // Proteksi integritas relasi: Cek apakah site memiliki PIT aktif
  const [linkedPits] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pits)
    .where(eq(pits.siteId, id));

  if (Number(linkedPits?.count || 0) > 0) {
    throw new Error(
      `Site "${target.name}" tidak dapat dihapus karena memiliki ${linkedPits.count} Master PIT terkait. Hapus atau pindahkan PIT terlebih dahulu.`
    );
  }

  // Cek apakah site digunakan di mapping departemen
  const [linkedMappings] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(departmentMappings)
    .where(eq(departmentMappings.siteId, id));

  if (Number(linkedMappings?.count || 0) > 0) {
    throw new Error(
      `Site "${target.name}" tidak dapat dihapus karena digunakan dalam ${linkedMappings.count} aturan Mapping Departemen.`
    );
  }

  await db.delete(sites).where(eq(sites.id, id));

  revalidateAll();
  return { success: true };
}

/**
 * Toggle Status Aktif/Nonaktif Site
 */
export async function toggleSiteStatusAction(
  id: number
): Promise<{ success: boolean; newStatus: boolean }> {
  await requireAdmin();
  const [target] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!target) throw new Error("Site tidak ditemukan.");

  const nextStatus = !target.isActive;

  await db
    .update(sites)
    .set({
      isActive: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, id));

  revalidateAll();
  return { success: true, newStatus: nextStatus };
}
