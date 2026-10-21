"use server";

import { db } from "@/db";
import {
  auditLogs,
  departments,
  jobLevels,
  kpiBands,
  kpiCategories,
  kpiParameters,
  kpiPeriods,
  kpiTemplates,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface BatchCombinationItem {
  departmentId: number;
  jobLevelId: number;
}

export interface GenerateTemplateBatchInput {
  sourceTemplateId: number;
  periodId: number;
  combinations: BatchCombinationItem[];
}

export interface BatchItemResult {
  departmentId: number;
  departmentName: string;
  jobLevelId: number;
  jobLevelName: string;
  templateName: string;
  status: "CREATED" | "SKIPPED" | "FAILED";
  reason?: string;
  templateId?: number;
}

export interface GenerateTemplateBatchResult {
  success: boolean;
  total: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  details: BatchItemResult[];
  message: string;
}

/**
 * Menggandakan 1 template sumber ke beberapa template sekaligus
 * berdasarkan kombinasi Departemen dan Job Level untuk periode tertentu.
 */
export async function generateTemplateBatchAction(
  input: GenerateTemplateBatchInput
): Promise<GenerateTemplateBatchResult> {
  const { sourceTemplateId, periodId, combinations } = input;

  if (!sourceTemplateId || sourceTemplateId <= 0) {
    return {
      success: false,
      total: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      message: "Template sumber wajib dipilih.",
    };
  }

  if (!periodId || periodId <= 0) {
    return {
      success: false,
      total: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      message: "Periode target wajib dipilih.",
    };
  }

  if (!Array.isArray(combinations) || combinations.length === 0) {
    return {
      success: false,
      total: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      message: "Pilih minimal 1 kombinasi Departemen dan Job Level.",
    };
  }

  // 1. Ambil data periode
  const [targetPeriod] = await db
    .select()
    .from(kpiPeriods)
    .where(eq(kpiPeriods.id, periodId))
    .limit(1);

  if (!targetPeriod) {
    return {
      success: false,
      total: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      message: "Periode yang dipilih tidak ditemukan dalam sistem.",
    };
  }

  const periodYear = targetPeriod.year || 2026;

  // 2. Ambil master Departemen dan Job Level untuk lookup nama & kode
  const [allDepts, allLevels] = await Promise.all([
    db.select().from(departments),
    db.select().from(jobLevels),
  ]);

  const deptMap = new Map(allDepts.map((d) => [d.id, d]));
  const levelMap = new Map(allLevels.map((l) => [l.id, l]));

  // 3. Ambil Template Sumber dan seluruh konfigurasinya
  const [srcTpl] = await db
    .select()
    .from(kpiTemplates)
    .where(eq(kpiTemplates.id, sourceTemplateId))
    .limit(1);

  if (!srcTpl) {
    return {
      success: false,
      total: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      message: "Template sumber tidak ditemukan.",
    };
  }

  // Ambil categories sumber
  const srcCats = await db
    .select()
    .from(kpiCategories)
    .where(eq(kpiCategories.templateId, sourceTemplateId))
    .orderBy(asc(kpiCategories.sortOrder), asc(kpiCategories.id));

  // Ambil parameters sumber
  const catIds = srcCats.map((c) => c.id);
  const srcParams =
    catIds.length > 0
      ? await db
          .select()
          .from(kpiParameters)
          .where(inArray(kpiParameters.categoryId, catIds))
          .orderBy(asc(kpiParameters.sortOrder), asc(kpiParameters.id))
      : [];

  // Ambil bands sumber
  const paramIds = srcParams.map((p) => p.id);
  const srcBands =
    paramIds.length > 0
      ? await db
          .select()
          .from(kpiBands)
          .where(inArray(kpiBands.parameterId, paramIds))
          .orderBy(asc(kpiBands.sortOrder), asc(kpiBands.id))
      : [];

  const details: BatchItemResult[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // 4. Proses setiap kombinasi yang dipilih
  for (const comb of combinations) {
    const dept = deptMap.get(comb.departmentId);
    const lvl = levelMap.get(comb.jobLevelId);
    const deptName = dept?.name || `Dept #${comb.departmentId}`;
    const levelName = lvl?.name || `Level #${comb.jobLevelId}`;
    const generatedName = `KPI ${deptName} - ${levelName} - ${periodYear}`;

    // Cek apakah template dengan Departemen + Job Level + Periode sudah ada
    const [existing] = await db
      .select({ id: kpiTemplates.id, name: kpiTemplates.name })
      .from(kpiTemplates)
      .where(
        and(
          eq(kpiTemplates.departmentId, comb.departmentId),
          eq(kpiTemplates.jobLevelId, comb.jobLevelId),
          eq(kpiTemplates.periodId, periodId)
        )
      )
      .limit(1);

    if (existing) {
      skippedCount++;
      details.push({
        departmentId: comb.departmentId,
        departmentName: deptName,
        jobLevelId: comb.jobLevelId,
        jobLevelName: levelName,
        templateName: generatedName,
        status: "SKIPPED",
        reason: `Template sudah tersedia ("${existing.name}")`,
        templateId: existing.id,
      });
      continue;
    }

    try {
      const deptPart = (dept?.code || deptName.substring(0, 3))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const lvlPart = (lvl?.code || levelName.substring(0, 3))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const generatedCode = `TPL-${deptPart || "DPT"}-${lvlPart || "LVL"}-${randSuffix}`;

      const newTplId = await db.transaction(async (tx) => {
        // Buat Template baru
        const [newTpl] = await tx
          .insert(kpiTemplates)
          .values({
            name: generatedName,
            code: generatedCode,
            departmentId: comb.departmentId,
            jobLevelId: comb.jobLevelId,
            jobPositionId: null,
            periodId: periodId,
            description: srcTpl.description || `Batch generate dari ${srcTpl.name}`,
            totalWeight: srcTpl.totalWeight,
            version: 1,
            baseTemplateId: srcTpl.id,
            isCustom: false,
            isActive: srcTpl.isActive,
          })
          .returning();

        const paramIdMap = new Map<number, number>();

        // Gandakan Categories
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

          // Gandakan Parameters dalam kategori ini
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

            // Gandakan Bands dalam parameter ini
            const bandsInParam = srcBands.filter((b) => b.parameterId === param.id);
            if (bandsInParam.length > 0) {
              await tx.insert(kpiBands).values(
                bandsInParam.map((b) => ({
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
          }
        }

        // Petakan parentParameterId jika terdapat relasi parent parameter
        for (const param of srcParams) {
          if (
            param.parentParameterId &&
            paramIdMap.has(param.parentParameterId) &&
            paramIdMap.has(param.id)
          ) {
            await tx
              .update(kpiParameters)
              .set({ parentParameterId: paramIdMap.get(param.parentParameterId) })
              .where(eq(kpiParameters.id, paramIdMap.get(param.id)!));
          }
        }

        // Catat Audit log
        await tx.insert(auditLogs).values({
          entity: "template",
          entityId: newTpl.id,
          action: "BATCH_GENERATE",
          changes: {
            sourceTemplateId: srcTpl.id,
            departmentId: comb.departmentId,
            jobLevelId: comb.jobLevelId,
            periodId: periodId,
            name: generatedName,
          },
          actor: "admin",
        });

        return newTpl.id;
      });

      createdCount++;
      details.push({
        departmentId: comb.departmentId,
        departmentName: deptName,
        jobLevelId: comb.jobLevelId,
        jobLevelName: levelName,
        templateName: generatedName,
        status: "CREATED",
        templateId: newTplId,
      });
    } catch (err: unknown) {
      failedCount++;
      const errorMsg =
        err instanceof Error ? err.message : "Terjadi kesalahan saat menggandakan template";
      details.push({
        departmentId: comb.departmentId,
        departmentName: deptName,
        jobLevelId: comb.jobLevelId,
        jobLevelName: levelName,
        templateName: generatedName,
        status: "FAILED",
        reason: errorMsg,
      });
    }
  }

  // Refresh cache Next.js
  try {
    revalidatePath("/setup");
    revalidatePath("/setup/templates");
  } catch {
    // Abaikan jika dipanggil di luar konteks router
  }

  return {
    success: true,
    total: combinations.length,
    createdCount,
    skippedCount,
    failedCount,
    details,
    message: `Batch generate selesai. Berhasil: ${createdCount}, Sudah ada: ${skippedCount}, Gagal: ${failedCount}`,
  };
}
