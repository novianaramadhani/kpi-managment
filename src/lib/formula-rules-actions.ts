"use server";

import { db } from "@/db";
import { kpiCalculationRules, kpiParameters, auditLogs } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

export interface FormulaRuleItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  calculationType: "ACHIEVEMENT" | "AGGREGATION" | "SCORING" | "WEIGHTING" | "CUSTOM";
  direction: "NORMAL" | "INVERSE" | null;
  aggregationMethod: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO" | null;
  formulaConfig: {
    type: string;
    direction?: string;
    numerator?: string;
    denominator?: string;
    multiplier?: number;
    output: string;
    edgeCases?: Record<string, string>;
  } | null;
  inputSources: {
    actual?: string;
    target?: string;
    employee?: string;
    period?: string;
  } | null;
  version: number;
  effectiveDate: string;
  expiresDate: string | null;
  status: "ACTIVE" | "DEPRECATED";
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedParametersCount: number;
}

/**
 * Fetch all calculation rules with the number of linked parameters.
 */
export async function getCalculationRulesAction(): Promise<FormulaRuleItem[]> {
  const rules = await db
    .select({
      id: kpiCalculationRules.id,
      code: kpiCalculationRules.code,
      name: kpiCalculationRules.name,
      description: kpiCalculationRules.description,
      calculationType: kpiCalculationRules.calculationType,
      direction: kpiCalculationRules.direction,
      aggregationMethod: kpiCalculationRules.aggregationMethod,
      formulaConfig: kpiCalculationRules.formulaConfig,
      inputSources: kpiCalculationRules.inputSources,
      version: kpiCalculationRules.version,
      effectiveDate: kpiCalculationRules.effectiveDate,
      expiresDate: kpiCalculationRules.expiresDate,
      status: kpiCalculationRules.status,
      notes: kpiCalculationRules.notes,
      createdBy: kpiCalculationRules.createdBy,
      createdAt: kpiCalculationRules.createdAt,
      updatedAt: kpiCalculationRules.updatedAt,
      linkedParametersCount: sql<number>`count(${kpiParameters.id})::int`,
    })
    .from(kpiCalculationRules)
    .leftJoin(kpiParameters, eq(kpiCalculationRules.id, kpiParameters.calculationRuleId))
    .groupBy(kpiCalculationRules.id)
    .orderBy(asc(kpiCalculationRules.id));

  return rules as FormulaRuleItem[];
}

/**
 * Update status or description of a calculation rule.
 */
export async function updateCalculationRuleStatusAction(
  ruleId: number,
  newStatus: "ACTIVE" | "DEPRECATED",
  notes?: string
) {
  const currentUser = await requireAdmin();
  const [existing] = await db
    .select()
    .from(kpiCalculationRules)
    .where(eq(kpiCalculationRules.id, ruleId));

  if (!existing) {
    throw new Error("Formula rule tidak ditemukan");
  }

  await db
    .update(kpiCalculationRules)
    .set({
      status: newStatus,
      notes: notes !== undefined ? notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(kpiCalculationRules.id, ruleId));

  // Audit log
  await db.insert(auditLogs).values({
    entity: "kpi_calculation_rules",
    entityId: ruleId,
    action: "UPDATE_STATUS",
    actor: currentUser.name,
    changes: { from: existing.status, to: newStatus, notes },
  });

  revalidatePath("/setup/formulas");
  return { success: true };
}
