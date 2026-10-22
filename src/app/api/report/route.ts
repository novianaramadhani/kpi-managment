import { getReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized: Sesi login diperlukan." }, { status: 401 });
  }

  if (
    currentUser.role !== "ADMIN" &&
    currentUser.role !== "HR" &&
    currentUser.role !== "MANAGER" &&
    currentUser.role !== "HEAD_DEPT"
  ) {
    return Response.json({ error: "Forbidden: Anda tidak memiliki akses ke laporan rekapitulasi." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const periodId = searchParams.get("periodId");
  const r = await getReport(periodId ? Number(periodId) : undefined);
  return Response.json({
    period: r.period,
    summary: { total: r.rows.length, scored: r.scoredCount ?? 0, average: r.avg ?? 0 },
    byDepartment: r.byDept,
    byJobLevel: r.byLevel,
    distribution: r.distribution,
    employees: r.rows.map((x) => ({ ...x, finalScore: x.finalScore ? Number(x.finalScore) : null })),
  });
}
