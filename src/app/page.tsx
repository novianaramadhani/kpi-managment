import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { kpiPeriods } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PortalPageClient } from "@/components/portal-page-client";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const currentUser = await getCurrentUser();
  let periods: Array<{ name: string; evaluationDate: string | null; status?: string | null }> = [];

  try {
    periods = await db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year));
  } catch (err) {
    console.error("LandingPage database query error (Postgres connection):", err);
  }

  const activePeriod = periods.find((p) => p.status === "ACTIVE") ?? periods[0];

  return (
    <PortalPageClient
      currentUser={currentUser}
      activePeriod={
        activePeriod && activePeriod.evaluationDate
          ? {
              name: activePeriod.name,
              evaluationDate: activePeriod.evaluationDate,
            }
          : null
      }
    />
  );
}
