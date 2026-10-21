import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getTemplateAssignmentDrawerData,
  saveTemplateAssignmentDrawerData,
} from "@/lib/template-assignment-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const templateId = Number(searchParams.get("templateId"));
    const periodId = searchParams.get("periodId") ? Number(searchParams.get("periodId")) : undefined;

    if (!templateId) {
      return NextResponse.json({ error: "Parameter templateId wajib disertakan." }, { status: 400 });
    }

    const data = await getTemplateAssignmentDrawerData(templateId, periodId);
    if (!data) {
      return NextResponse.json({ error: "Template atau Periode KPI tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat data penugasan template.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      templateId,
      periodId,
      assignedEmployeeIds = [],
      parameterAssessors = {},
      nikOverrides = [],
      scope = "ALL",
    } = body;

    if (!templateId || !periodId) {
      return NextResponse.json(
        { error: "templateId dan periodId wajib disertakan." },
        { status: 400 }
      );
    }

    if (scope === "EMPLOYEES" && !Array.isArray(assignedEmployeeIds)) {
      return NextResponse.json(
        { error: "array assignedEmployeeIds wajib disertakan saat menyimpan karyawan." },
        { status: 400 }
      );
    }

    const result = await saveTemplateAssignmentDrawerData({
      templateId: Number(templateId),
      periodId: Number(periodId),
      assignedEmployeeIds: Array.isArray(assignedEmployeeIds) ? assignedEmployeeIds.map(Number) : [],
      parameterAssessors,
      nikOverrides,
      scope,
      actor: currentUser.name || "admin",
      actorId: currentUser.id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan penugasan template & penilai.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
