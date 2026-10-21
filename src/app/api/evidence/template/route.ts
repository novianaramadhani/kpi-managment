import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kpiParameters } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { generateEvidenceTemplate } from "@/lib/excel-evidence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parameterId = Number(searchParams.get("parameterId"));
  const employeeName = searchParams.get("employeeName") || undefined;
  const periodName = searchParams.get("periodName") || undefined;
  const deptName = searchParams.get("deptName") || undefined;

  if (!parameterId) {
    return NextResponse.json({ error: "parameterId wajib disertakan" }, { status: 400 });
  }

  const [param] = await db.select().from(kpiParameters).where(eq(kpiParameters.id, parameterId));
  if (!param) {
    return NextResponse.json({ error: "Parameter KPI tidak ditemukan" }, { status: 404 });
  }

  const wb = generateEvidenceTemplate(param, { employeeName, periodName, deptName });
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeParamName = param.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const filename = `template_bukti_${safeParamName}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
