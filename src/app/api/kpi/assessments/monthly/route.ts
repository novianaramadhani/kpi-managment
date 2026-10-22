import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlyAssessmentDetail,
  getMonthlyAssessmentEmployees,
  saveMonthlyAssessmentValues,
  submitMonthlyAssessment,
  reopenMonthlyAssessment,
} from "@/lib/monthly-assessment-service";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year")) || new Date().getFullYear();
    const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
    const employeeId = searchParams.get("employeeId") ? Number(searchParams.get("employeeId")) : null;
    const departmentId = searchParams.get("departmentId") ? Number(searchParams.get("departmentId")) : undefined;
    const currentUser = await getCurrentUser();

    if (employeeId) {
      const detail = await getMonthlyAssessmentDetail({ year, month, employeeId, currentUser });
      if (!detail) {
        return NextResponse.json(
          { error: `Data penilaian untuk karyawan ${employeeId} pada ${year} bulan ${month} tidak ditemukan.` },
          { status: 404 }
        );
      }
      return NextResponse.json(detail);
    } else {
      const employees = await getMonthlyAssessmentEmployees({ year, month, departmentId });
      return NextResponse.json({ year, month, employees });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal server.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized: Sesi login diperlukan untuk melakukan aksi penilaian." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, appraisalId, month, values } = body;
    const actor = `${currentUser.name} (${currentUser.nik})`;

    if (!appraisalId || !month) {
      return NextResponse.json({ error: "appraisalId dan month wajib disertakan." }, { status: 400 });
    }

    if (action === "SAVE") {
      if (!Array.isArray(values)) {
        return NextResponse.json({ error: "values harus berupa array." }, { status: 400 });
      }
      const res = await saveMonthlyAssessmentValues({
        appraisalId: Number(appraisalId),
        month: Number(month),
        values,
        actor,
      });
      return NextResponse.json(res);
    }

    if (action === "SUBMIT") {
      const res = await submitMonthlyAssessment({
        appraisalId: Number(appraisalId),
        month: Number(month),
        actor,
      });
      return NextResponse.json(res);
    }

    if (action === "REOPEN") {
      const res = await reopenMonthlyAssessment({
        appraisalId: Number(appraisalId),
        month: Number(month),
        actor,
      });
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: `Action tidak dikenal: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memproses request penilaian bulanan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
