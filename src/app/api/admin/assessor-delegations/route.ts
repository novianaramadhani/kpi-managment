import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAssessorDelegations,
  createAssessorDelegation,
  revokeAssessorDelegation,
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
    const departmentId = searchParams.get("departmentId") ? Number(searchParams.get("departmentId")) : undefined;
    const delegatorEmployeeId = searchParams.get("delegatorEmployeeId")
      ? Number(searchParams.get("delegatorEmployeeId"))
      : undefined;
    const delegateeEmployeeId = searchParams.get("delegateeEmployeeId")
      ? Number(searchParams.get("delegateeEmployeeId"))
      : undefined;
    const stage = searchParams.get("stage") || undefined;
    const status = searchParams.get("status") || undefined;

    if (!periodId) {
      return NextResponse.json({ error: "periodId wajib disertakan." }, { status: 400 });
    }

    const delegations = await getAssessorDelegations({
      periodId,
      departmentId,
      delegatorEmployeeId,
      delegateeEmployeeId,
      stage,
      status,
    });
    return NextResponse.json({ success: true, delegations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat data delegasi penilai.";
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
      delegatorEmployeeId,
      delegateeEmployeeId,
      startDate,
      endDate,
      reason,
      scopeType = "ALL",
      stage = "MONTHLY",
      departmentId,
      categoryId,
      parameterId,
    } = body;

    const delegation = await createAssessorDelegation({
      periodId: Number(periodId),
      delegatorEmployeeId: Number(delegatorEmployeeId),
      delegateeEmployeeId: Number(delegateeEmployeeId),
      startDate,
      endDate,
      reason,
      scopeType,
      stage,
      departmentId: departmentId ? Number(departmentId) : undefined,
      categoryId: categoryId ? Number(categoryId) : parameterId ? Number(parameterId) : undefined,
      actorId: currentUser.id,
    });

    return NextResponse.json({ success: true, delegation });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal membuat delegasi penilai.";
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
      return NextResponse.json({ error: "ID delegasi wajib disertakan." }, { status: 400 });
    }

    await revokeAssessorDelegation(id);
    return NextResponse.json({ success: true, message: "Delegasi berhasil dicabut/dibatalkan." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal membatalkan delegasi penilai.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
