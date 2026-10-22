import { db } from "@/db";
import { appraisalItems, appraisals, kpiParameters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalculateAppraisal } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeApprovalLine } from "@/lib/employee-hierarchy";

export const dynamic = "force-dynamic";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const aid = Number(id);
  const [a] = await db.select().from(appraisals).where(eq(appraisals.id, aid));
  if (!a) return Response.json({ error: "not found" }, { status: 404 });

  // Cek kepemilikan data atau wewenang hierarki atasan
  const approvalLine = await getEmployeeApprovalLine(a.employeeId);
  const isAuthorized =
    currentUser.role === "ADMIN" ||
    currentUser.role === "HR" ||
    currentUser.id === a.employeeId ||
    currentUser.id === approvalLine?.appraiser?.id ||
    currentUser.id === approvalLine?.headDept?.id ||
    currentUser.id === approvalLine?.manager?.id;

  if (!isAuthorized) {
    return Response.json({ error: "Forbidden: Anda tidak memiliki akses ke data penilaian ini." }, { status: 403 });
  }

  const items = await db
    .select({ item: appraisalItems, parameter: kpiParameters })
    .from(appraisalItems)
    .innerJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .where(eq(appraisalItems.appraisalId, aid));

  return Response.json({ appraisal: a, items });
}

/** Recalculate scores (hanya diizinkan untuk Admin, HR, atau penilai terkait) */
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const aid = Number(id);
  const [a] = await db.select().from(appraisals).where(eq(appraisals.id, aid));
  if (!a) return Response.json({ error: "not found" }, { status: 404 });

  const approvalLine = await getEmployeeApprovalLine(a.employeeId);
  const isAuthorized =
    currentUser.role === "ADMIN" ||
    currentUser.role === "HR" ||
    currentUser.id === approvalLine?.appraiser?.id;

  if (!isAuthorized) {
    return Response.json({ error: "Forbidden: Anda tidak memiliki wewenang untuk menghitung ulang penilaian ini." }, { status: 403 });
  }

  await recalculateAppraisal(aid);
  const [updated] = await db.select().from(appraisals).where(eq(appraisals.id, aid));
  return Response.json({ ok: true, finalScore: updated?.finalScore ?? null });
}
