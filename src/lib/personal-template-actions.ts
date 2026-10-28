"use server";

import { db } from "@/db";
import {
  auditLogs,
  departments,
  employees,
  jobLevels,
  jobPositions,
  kpiBands,
  kpiCategories,
  kpiParameters,
  kpiPeriods,
  kpiTemplates,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface CreatePersonalTemplateInput {
  employeeId: number;
  baseTemplateId?: number | null;
  customName?: string;
  description?: string;
  actor?: string;
}

export interface PersonalTemplateDetail {
  id: number;
  name: string;
  code: string | null;
  employeeId: number | null;
  employeeName: string | null;
  employeeNik: string | null;
  departmentId: number;
  departmentName: string;
  jobLevelId: number;
  jobLevelName: string;
  jobPositionId: number | null;
  jobPositionName: string | null;
  baseTemplateId: number | null;
  baseTemplateName: string | null;
  totalWeight: string;
  isActive: boolean;
  categoryCount: number;
  parameterCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Membuat Template Personal unik untuk seorang karyawan tertentu.
 * Jika baseTemplateId disediakan, struktur kategori/parameter/band akan dikloning.
 * Jika baseTemplateId null/tidak ada, template dibuat kosong (blank) dari nol.
 */
export async function createPersonalTemplateAction(
  input: CreatePersonalTemplateInput
): Promise<{ success: boolean; templateId?: number; error?: string }> {
  const { employeeId, baseTemplateId, customName, description, actor = "admin" } = input;

  if (!employeeId || employeeId <= 0) {
    return { success: false, error: "Karyawan wajib dipilih." };
  }

  try {
    // 1. Verifikasi Karyawan
    const [emp] = await db
      .select({
        id: employees.id,
        name: employees.name,
        nik: employees.nik,
        departmentId: employees.departmentId,
        jobLevelId: employees.jobLevelId,
        jobPositionId: employees.jobPositionId,
        jobPosition: employees.jobPosition,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!emp) {
      return { success: false, error: "Data karyawan tidak ditemukan." };
    }

    // 2. Verifikasi Template Acuan (jika dipilih)
    const validBaseTemplateId =
      baseTemplateId && Number(baseTemplateId) > 0 ? Number(baseTemplateId) : null;

    let srcTpl: typeof kpiTemplates.$inferSelect | null = null;
    let srcCats: (typeof kpiCategories.$inferSelect)[] = [];
    let srcParams: (typeof kpiParameters.$inferSelect)[] = [];
    let srcBands: (typeof kpiBands.$inferSelect)[] = [];

    if (validBaseTemplateId) {
      const [foundTpl] = await db
        .select()
        .from(kpiTemplates)
        .where(eq(kpiTemplates.id, validBaseTemplateId))
        .limit(1);

      if (!foundTpl) {
        return { success: false, error: "Template acuan tidak ditemukan." };
      }
      srcTpl = foundTpl;

      // 3. Ambil seluruh kategori, parameter, dan band milik template acuan
      srcCats = await db
        .select()
        .from(kpiCategories)
        .where(eq(kpiCategories.templateId, validBaseTemplateId))
        .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

      const catIds = srcCats.map((c) => c.id);
      srcParams =
        catIds.length > 0
          ? await db
              .select()
              .from(kpiParameters)
              .where(inArray(kpiParameters.categoryId, catIds))
              .orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id))
          : [];

      const paramIds = srcParams.map((p) => p.id);
      srcBands =
        paramIds.length > 0
          ? await db
              .select()
              .from(kpiBands)
              .where(inArray(kpiBands.parameterId, paramIds))
              .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
          : [];
    }

    // Tentukan periodId (dari template acuan jika ada, atau periode aktif/terbaru)
    let periodId: number | null = srcTpl?.periodId ?? null;
    if (!periodId) {
      const [activePeriod] = await db
        .select({ id: kpiPeriods.id })
        .from(kpiPeriods)
        .where(eq(kpiPeriods.status, "ACTIVE"))
        .limit(1);

      if (activePeriod) {
        periodId = activePeriod.id;
      } else {
        const [fallbackPeriod] = await db
          .select({ id: kpiPeriods.id })
          .from(kpiPeriods)
          .orderBy(desc(kpiPeriods.year))
          .limit(1);
        periodId = fallbackPeriod?.id ?? null;
      }
    }

    // 4. Generate Nama & Kode Template Personal
    const jobTitle = emp.jobPosition || "Karyawan";
    const templateName =
      customName?.trim() || `[Personal] ${emp.name} - ${jobTitle}`;
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const cleanNik = emp.nik.replace(/[^0-9]/g, "").slice(-4);
    const templateCode = `TPL-PRS-${cleanNik}-${randSuffix}`;

    const defaultDescription = srcTpl
      ? `Template personal khusus ${emp.name} (${emp.nik}) - dikloning dari ${srcTpl.name}`
      : `Template personal khusus ${emp.name} (${emp.nik}) - dibuat dari nol tanpa acuan`;

    // 5. Eksekusi pembuatan template transaksional
    const newTplId = await db.transaction(async (tx) => {
      const [newTpl] = await tx
        .insert(kpiTemplates)
        .values({
          name: templateName,
          code: templateCode,
          departmentId: emp.departmentId,
          jobLevelId: emp.jobLevelId,
          jobPositionId: emp.jobPositionId ?? srcTpl?.jobPositionId ?? null,
          periodId: periodId,
          employeeId: emp.id,
          baseTemplateId: srcTpl ? srcTpl.id : null,
          isCustom: true,
          isActive: true,
          description: description?.trim() || defaultDescription,
          totalWeight: srcTpl?.totalWeight || "1.1500",
          version: 1,
        })
        .returning();

      // Jika ada template acuan, lakukan cloning kategori, parameter, dan band
      if (srcTpl && srcCats.length > 0) {
        const paramIdMap = new Map<number, number>();

        for (const cat of srcCats) {
          const [newCat] = await tx
            .insert(kpiCategories)
            .values({
              templateId: newTpl.id,
              name: cat.name,
              weight: cat.weight,
              categoryType: cat.categoryType,
              sortOrder: cat.sortOrder,
            })
            .returning();

          const paramsInCat = srcParams.filter((p) => p.categoryId === cat.id);
          for (const param of paramsInCat) {
            const [newParam] = await tx
              .insert(kpiParameters)
              .values({
                categoryId: newCat.id,
                name: param.name,
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
                sortOrder: param.sortOrder,
                masterParameterId: param.masterParameterId,
                calculationRuleId: param.calculationRuleId,
                measurementType: param.measurementType,
                direction: param.direction,
                scoringMethod: param.scoringMethod,
              })
              .returning();

            paramIdMap.set(param.id, newParam.id);

            const bandsInParam = srcBands.filter((b) => b.parameterId === param.id);
            for (const band of bandsInParam) {
              await tx.insert(kpiBands).values({
                parameterId: newParam.id,
                label: band.label,
                operator: band.operator,
                minValue: band.minValue,
                maxValue: band.maxValue,
                score: band.score,
                sortOrder: band.sortOrder,
              });
            }
          }
        }
      }

      // Catat riwayat audit
      await tx.insert(auditLogs).values({
        entity: "kpi_template",
        entityId: newTpl.id,
        action: srcTpl ? "CREATE_PERSONAL_TEMPLATE" : "CREATE_PERSONAL_TEMPLATE_BLANK",
        actor,
        changes: JSON.stringify({
          employeeId: emp.id,
          employeeName: emp.name,
          employeeNik: emp.nik,
          baseTemplateId: srcTpl ? srcTpl.id : null,
          baseTemplateName: srcTpl ? srcTpl.name : null,
          clonedCategoriesCount: srcCats.length,
          clonedParametersCount: srcParams.length,
        }),
      });

      return newTpl.id;
    });

    try {
      revalidatePath("/setup/templates");
      revalidatePath("/setup/assignments");
      revalidatePath("/input-kpi");
    } catch {
      // Safe fallback outside Next.js request context
    }

    return { success: true, templateId: newTplId };
  } catch (err: unknown) {
    console.error("Error creating personal template:", err);
    const msg =
      err instanceof Error ? err.message : "Gagal membuat template personal.";
    return { success: false, error: msg };
  }
}

/**
 * Mengambil daftar seluruh template personal beserta relasi data karyawan
 */
export async function getPersonalTemplatesAction(): Promise<PersonalTemplateDetail[]> {
  const rawList = await db
    .select({
      id: kpiTemplates.id,
      name: kpiTemplates.name,
      code: kpiTemplates.code,
      employeeId: kpiTemplates.employeeId,
      employeeName: employees.name,
      employeeNik: employees.nik,
      departmentId: kpiTemplates.departmentId,
      departmentName: departments.name,
      jobLevelId: kpiTemplates.jobLevelId,
      jobLevelName: jobLevels.name,
      jobPositionId: kpiTemplates.jobPositionId,
      jobPositionName: jobPositions.name,
      baseTemplateId: kpiTemplates.baseTemplateId,
      totalWeight: kpiTemplates.totalWeight,
      isActive: kpiTemplates.isActive,
      createdAt: kpiTemplates.createdAt,
      updatedAt: kpiTemplates.updatedAt,
    })
    .from(kpiTemplates)
    .leftJoin(employees, eq(kpiTemplates.employeeId, employees.id))
    .leftJoin(departments, eq(kpiTemplates.departmentId, departments.id))
    .leftJoin(jobLevels, eq(kpiTemplates.jobLevelId, jobLevels.id))
    .leftJoin(jobPositions, eq(kpiTemplates.jobPositionId, jobPositions.id))
    .where(eq(kpiTemplates.isCustom, true))
    .orderBy(asc(employees.name), asc(kpiTemplates.name));

  // Ambil nama base templates
  const baseIds = rawList
    .map((t) => t.baseTemplateId)
    .filter((id): id is number => typeof id === "number");

  const baseMap = new Map<number, string>();
  if (baseIds.length > 0) {
    const bases = await db
      .select({ id: kpiTemplates.id, name: kpiTemplates.name })
      .from(kpiTemplates)
      .where(inArray(kpiTemplates.id, baseIds));
    for (const b of bases) baseMap.set(b.id, b.name);
  }

  // Hitung jumlah kategori dan parameter per template
  const tplIds = rawList.map((t) => t.id);
  const catCountMap = new Map<number, number>();
  const paramCountMap = new Map<number, number>();

  if (tplIds.length > 0) {
    const cats = await db
      .select({
        templateId: kpiCategories.templateId,
        catId: kpiCategories.id,
      })
      .from(kpiCategories)
      .where(inArray(kpiCategories.templateId, tplIds));

    for (const c of cats) {
      catCountMap.set(c.templateId, (catCountMap.get(c.templateId) || 0) + 1);
    }

    const cIds = cats.map((c) => c.catId);
    if (cIds.length > 0) {
      const pms = await db
        .select({
          categoryId: kpiParameters.categoryId,
        })
        .from(kpiParameters)
        .where(inArray(kpiParameters.categoryId, cIds));

      const catToTpl = new Map(cats.map((c) => [c.catId, c.templateId]));
      for (const p of pms) {
        const tId = catToTpl.get(p.categoryId);
        if (tId) {
          paramCountMap.set(tId, (paramCountMap.get(tId) || 0) + 1);
        }
      }
    }
  }

  return rawList.map((t) => ({
    ...t,
    departmentName: t.departmentName || "-",
    jobLevelName: t.jobLevelName || "-",
    baseTemplateName: t.baseTemplateId ? baseMap.get(t.baseTemplateId) || "-" : "-",
    categoryCount: catCountMap.get(t.id) || 0,
    parameterCount: paramCountMap.get(t.id) || 0,
  }));
}

/**
 * Toggle status aktif/nonaktif template personal
 */
export async function togglePersonalTemplateStatusAction(
  templateId: number,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(kpiTemplates)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(kpiTemplates.id, templateId));

    revalidatePath("/setup/templates");
    return { success: true };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Gagal mengubah status template.";
    return { success: false, error: msg };
  }
}
