import { getReport } from "@/lib/report";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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
