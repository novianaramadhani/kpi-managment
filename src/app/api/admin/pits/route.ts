import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pits, departmentMappings, departments } from "@/db/schema";
import { asc, eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
      return NextResponse.json({ error: "Forbidden: Akses khusus Admin atau HR." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const site = searchParams.get("site");
    const siteId = searchParams.get("siteId");
    const departmentId = searchParams.get("departmentId");

    const conditions = [eq(pits.isActive, true)];
    if (siteId && siteId !== "ALL" && !isNaN(Number(siteId))) {
      conditions.push(eq(pits.siteId, Number(siteId)));
    } else if (site && site !== "ALL") {
      conditions.push(eq(pits.site, site.toUpperCase()));
    }

    const activePits = await db
      .select({
        id: pits.id,
        code: pits.code,
        name: pits.name,
        site: pits.site,
        description: pits.description,
        isActive: pits.isActive,
      })
      .from(pits)
      .where(and(...conditions))
      .orderBy(asc(pits.site), asc(pits.name));

    // Jika departmentId disediakan, ambil juga daftar mapping PIT yang terkait dengan departemen ini
    let mappedPitIds: number[] = [];
    if (departmentId && departmentId !== "ALL") {
      const mappingsForDept = await db
        .select({ pitId: departmentMappings.pitId })
        .from(departmentMappings)
        .where(eq(departmentMappings.departmentId, Number(departmentId)));
      mappedPitIds = mappingsForDept
        .map((m) => m.pitId)
        .filter((id): id is number => id !== null && id !== undefined);
    }

    return NextResponse.json({
      success: true,
      pits: activePits,
      mappedPitIds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat Master PIT.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
