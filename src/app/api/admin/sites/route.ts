import { NextResponse } from "next/server";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
      return NextResponse.json({ error: "Forbidden: Akses khusus Admin atau HR." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") !== "false";

    let query = db.select().from(sites);
    const rows = activeOnly
      ? await query.where(eq(sites.isActive, true)).orderBy(asc(sites.code))
      : await query.orderBy(asc(sites.code));

    return NextResponse.json({ success: true, sites: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat master site.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
