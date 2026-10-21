import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { bulkAssignTemplateToEmployees } from "@/lib/assessor-assignment-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { periodId, templateId, employeeIds } = body;

    if (!periodId || !templateId || !employeeIds || !Array.isArray(employeeIds)) {
      return NextResponse.json(
        { error: "periodId, templateId, dan array employeeIds wajib disertakan." },
        { status: 400 }
      );
    }

    const result = await bulkAssignTemplateToEmployees({
      periodId: Number(periodId),
      templateId: Number(templateId),
      employeeIds: employeeIds.map(Number),
      actorId: currentUser.id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memasang template secara massal.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
