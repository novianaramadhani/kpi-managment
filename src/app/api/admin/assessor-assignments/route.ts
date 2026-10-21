import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAssessorAssignments,
  saveAssessorAssignments,
  deleteAssessorAssignment,
} from "@/lib/assessor-assignment-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const periodId = Number(searchParams.get("periodId"));
    const templateId = searchParams.get("templateId") ? Number(searchParams.get("templateId")) : undefined;
    const categoryId = searchParams.get("categoryId")
      ? Number(searchParams.get("categoryId"))
      : searchParams.get("parameterId")
      ? Number(searchParams.get("parameterId"))
      : undefined;
    const departmentId = searchParams.get("departmentId") ? Number(searchParams.get("departmentId")) : undefined;
    const jobLevelId = searchParams.get("jobLevelId") ? Number(searchParams.get("jobLevelId")) : undefined;
    const jobPositionId = searchParams.get("jobPositionId") ? Number(searchParams.get("jobPositionId")) : undefined;
    const roleAssessor = searchParams.get("roleAssessor") || undefined;
    const stage = searchParams.get("stage") || undefined;
    const search = searchParams.get("search") || undefined;

    if (!periodId) {
      return NextResponse.json({ error: "periodId wajib disertakan" }, { status: 400 });
    }

    const assignments = await getAssessorAssignments({
      periodId,
      templateId,
      categoryId,
      departmentId,
      jobLevelId,
      jobPositionId,
      roleAssessor,
      stage,
      search,
    });

    return NextResponse.json({ success: true, assignments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal mengambil data penugasan asesor.";
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
      periodId,
      categoryIds,
      parameterIds, // backwards compat
      assessorEmployeeIds,
      scopeType = "DEPARTMENT",
      assessorDeptId,
      targetEmployeeIds = [],
      roleAssessor = "PENILAI_1",
      stage = "MONTHLY",
      notes,
    } = body;

    const rawCats = categoryIds || parameterIds;
    if (!periodId || !rawCats || !assessorEmployeeIds) {
      return NextResponse.json(
        { error: "periodId, categoryIds, dan assessorEmployeeIds wajib diisi." },
        { status: 400 }
      );
    }

    const result = await saveAssessorAssignments({
      periodId: Number(periodId),
      categoryIds: Array.isArray(rawCats) ? rawCats.map(Number) : [Number(rawCats)],
      assessorEmployeeIds: Array.isArray(assessorEmployeeIds)
        ? assessorEmployeeIds.map(Number)
        : [Number(assessorEmployeeIds)],
      scopeType,
      assessorDeptId: assessorDeptId ? Number(assessorDeptId) : null,
      targetEmployeeIds: targetEmployeeIds.map(Number),
      roleAssessor,
      stage,
      notes,
      actorId: currentUser.id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan penugasan asesor.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "ID penugasan wajib disertakan." }, { status: 400 });
    }

    await deleteAssessorAssignment(id);
    return NextResponse.json({ success: true, message: "Penugasan berhasil dihapus." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus penugasan asesor.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
