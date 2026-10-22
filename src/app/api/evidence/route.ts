import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisals, appraisalEvidence } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const appraisalIdStr = searchParams.get("appraisalId");
    const parameterIdStr = searchParams.get("parameterId");
    const monthStr = searchParams.get("month");

    if (!appraisalIdStr && !parameterIdStr) {
      return NextResponse.json(
        { error: "Parameter appraisalId atau parameterId diperlukan." },
        { status: 400 }
      );
    }

    if (appraisalIdStr) {
      const appraisalId = Number(appraisalIdStr);
      const [appraisal] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
      if (!appraisal) {
        return NextResponse.json({ error: "Data appraisal tidak ditemukan." }, { status: 404 });
      }

      const isAuthorized =
        currentUser.role === "ADMIN" ||
        currentUser.role === "HR" ||
        appraisal.employeeId === currentUser.id ||
        appraisal.appraiserId === currentUser.id ||
        appraisal.headDeptId === currentUser.id ||
        appraisal.managerId === currentUser.id;

      if (!isAuthorized) {
        return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
      }
    } else if (currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
      return NextResponse.json({ error: "appraisalId wajib disertakan." }, { status: 400 });
    }

    const conditions = [];
    if (appraisalIdStr) {
      conditions.push(eq(appraisalEvidence.appraisalId, Number(appraisalIdStr)));
    }
    if (parameterIdStr) {
      conditions.push(eq(appraisalEvidence.parameterId, Number(parameterIdStr)));
    }
    if (monthStr) {
      conditions.push(eq(appraisalEvidence.month, Number(monthStr)));
    }

    const records = await db
      .select()
      .from(appraisalEvidence)
      .where(and(...conditions))
      .orderBy(desc(appraisalEvidence.createdAt));

    return NextResponse.json({ success: true, evidence: records });
  } catch (err: any) {
    console.error("Error listing evidence:", err);
    return NextResponse.json(
      { error: "Gagal mengambil daftar bukti." },
      { status: 500 }
    );
  }
}
