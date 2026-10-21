import { db } from "@/db";
import { appraisalItems, appraisals, kpiParameters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalculateAppraisal } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const aid = Number(id);
  const [a] = await db.select().from(appraisals).where(eq(appraisals.id, aid));
  if (!a) return Response.json({ error: "not found" }, { status: 404 });
  const items = await db
    .select({ item: appraisalItems, parameter: kpiParameters })
    .from(appraisalItems)
    .innerJoin(kpiParameters, eq(appraisalItems.parameterId, kpiParameters.id))
    .where(eq(appraisalItems.appraisalId, aid));
  return Response.json({ appraisal: a, items });
}

/** Recalculate scores (e.g. after template change) */
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await recalculateAppraisal(Number(id));
  const [a] = await db.select().from(appraisals).where(eq(appraisals.id, Number(id)));
  return Response.json({ ok: true, finalScore: a?.finalScore ?? null });
}
