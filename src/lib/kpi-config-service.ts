import { db } from "@/db";
import {
  kpiMeasurementTypes,
  kpiDirections,
  kpiScoringMethods,
  type KpiMeasurementType,
  type KpiDirection,
  type KpiScoringMethod,
} from "@/db/schema";
import { asc, eq, desc, ilike, or } from "drizzle-orm";

// ==========================================
// 1. MEASUREMENT TYPE SERVICES
// ==========================================

export async function getMeasurementTypes(params?: {
  search?: string;
  isActive?: boolean;
}) {
  const query = db.select().from(kpiMeasurementTypes);
  const conditions = [];

  if (params?.isActive !== undefined) {
    conditions.push(eq(kpiMeasurementTypes.isActive, params.isActive));
  }
  if (params?.search?.trim()) {
    const q = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(kpiMeasurementTypes.name, q),
        ilike(kpiMeasurementTypes.code, q),
        ilike(kpiMeasurementTypes.description, q)
      )
    );
  }

  return db
    .select()
    .from(kpiMeasurementTypes)
    .where(conditions.length > 0 ? or(...conditions) : undefined)
    .orderBy(asc(kpiMeasurementTypes.sortOrder), asc(kpiMeasurementTypes.name));
}

export async function saveMeasurementType(data: {
  id?: number;
  code: string;
  name: string;
  description?: string;
  formatPattern?: string;
  defaultUnit?: string;
  isNumeric?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const cleanCode = data.code.trim().toUpperCase().replace(/\s+/g, "_");

  if (data.id) {
    const [updated] = await db
      .update(kpiMeasurementTypes)
      .set({
        code: cleanCode,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        formatPattern: data.formatPattern?.trim() || null,
        defaultUnit: data.defaultUnit?.trim() || null,
        isNumeric: data.isNumeric ?? true,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(kpiMeasurementTypes.id, data.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(kpiMeasurementTypes)
    .values({
      code: cleanCode,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      formatPattern: data.formatPattern?.trim() || null,
      defaultUnit: data.defaultUnit?.trim() || null,
      isNumeric: data.isNumeric ?? true,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .returning();

  return inserted;
}

export async function deleteMeasurementType(id: number) {
  // Soft-delete or hard delete
  await db
    .update(kpiMeasurementTypes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(kpiMeasurementTypes.id, id));
  return { success: true };
}

// ==========================================
// 2. KPI DIRECTION SERVICES
// ==========================================

export async function getKpiDirections(params?: {
  search?: string;
  isActive?: boolean;
}) {
  const conditions = [];

  if (params?.isActive !== undefined) {
    conditions.push(eq(kpiDirections.isActive, params.isActive));
  }
  if (params?.search?.trim()) {
    const q = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(kpiDirections.name, q),
        ilike(kpiDirections.code, q),
        ilike(kpiDirections.description, q)
      )
    );
  }

  return db
    .select()
    .from(kpiDirections)
    .where(conditions.length > 0 ? or(...conditions) : undefined)
    .orderBy(asc(kpiDirections.sortOrder), asc(kpiDirections.name));
}

export async function saveKpiDirection(data: {
  id?: number;
  code: string;
  name: string;
  description?: string;
  formulaHint?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const cleanCode = data.code.trim().toUpperCase().replace(/\s+/g, "_");

  if (data.id) {
    const [updated] = await db
      .update(kpiDirections)
      .set({
        code: cleanCode,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        formulaHint: data.formulaHint?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(kpiDirections.id, data.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(kpiDirections)
    .values({
      code: cleanCode,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      formulaHint: data.formulaHint?.trim() || null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .returning();

  return inserted;
}

export async function deleteKpiDirection(id: number) {
  await db
    .update(kpiDirections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(kpiDirections.id, id));
  return { success: true };
}

// ==========================================
// 3. SCORING METHOD SERVICES
// ==========================================

export async function getKpiScoringMethods(params?: {
  search?: string;
  isActive?: boolean;
}) {
  const conditions = [];

  if (params?.isActive !== undefined) {
    conditions.push(eq(kpiScoringMethods.isActive, params.isActive));
  }
  if (params?.search?.trim()) {
    const q = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(kpiScoringMethods.name, q),
        ilike(kpiScoringMethods.code, q),
        ilike(kpiScoringMethods.description, q)
      )
    );
  }

  return db
    .select()
    .from(kpiScoringMethods)
    .where(conditions.length > 0 ? or(...conditions) : undefined)
    .orderBy(asc(kpiScoringMethods.sortOrder), asc(kpiScoringMethods.name));
}

export async function saveKpiScoringMethod(data: {
  id?: number;
  code: string;
  name: string;
  description?: string;
  requiresBands?: boolean;
  requiresFormula?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const cleanCode = data.code.trim().toUpperCase().replace(/\s+/g, "_");

  if (data.id) {
    const [updated] = await db
      .update(kpiScoringMethods)
      .set({
        code: cleanCode,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        requiresBands: data.requiresBands ?? false,
        requiresFormula: data.requiresFormula ?? false,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(kpiScoringMethods.id, data.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(kpiScoringMethods)
    .values({
      code: cleanCode,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      requiresBands: data.requiresBands ?? false,
      requiresFormula: data.requiresFormula ?? false,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .returning();

  return inserted;
}

export async function deleteKpiScoringMethod(id: number) {
  await db
    .update(kpiScoringMethods)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(kpiScoringMethods.id, id));
  return { success: true };
}
