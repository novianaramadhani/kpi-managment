import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("staging", "IN_REVIEW");
  if (sp.period) params.set("period", sp.period);
  if (sp.year) params.set("year", sp.year);

  redirect(`/input-kpi?${params.toString()}`);
}
