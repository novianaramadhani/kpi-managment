import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appraisalEvidence } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
      { error: err.message || "Gagal mengambil daftar bukti." },
      { status: 500 }
    );
  }
}
