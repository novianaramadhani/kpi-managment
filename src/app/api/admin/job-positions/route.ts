import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobPositions, kpiPeriods } from "@/db/schema";
import { asc, eq, desc, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId");

    const conditions = [eq(jobPositions.isActive, true)];
    if (departmentId && departmentId !== "ALL") {
      conditions.push(eq(jobPositions.departmentId, Number(departmentId)));
    }

    const [positions, periods] = await Promise.all([
      db
        .select({
          id: jobPositions.id,
          name: jobPositions.name,
          code: jobPositions.code,
          departmentId: jobPositions.departmentId,
          jobLevelId: jobPositions.jobLevelId,
          isActive: jobPositions.isActive,
        })
        .from(jobPositions)
        .where(and(...conditions))
        .orderBy(asc(jobPositions.name)),
      db
        .select({
          id: kpiPeriods.id,
          name: kpiPeriods.name,
          year: kpiPeriods.year,
          status: kpiPeriods.status,
          startDate: kpiPeriods.startDate,
          endDate: kpiPeriods.endDate,
        })
        .from(kpiPeriods)
        .orderBy(desc(kpiPeriods.year), desc(kpiPeriods.id)),
    ]);

    return NextResponse.json({ success: true, positions, periods });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat master jabatan dan periode.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
