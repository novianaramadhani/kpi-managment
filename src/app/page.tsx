import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { kpiPeriods, departments, employees } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { PortalPageClient } from "@/components/portal-page-client";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const currentUser = await getCurrentUser();
  let periods: Array<{ name: string; evaluationDate: string | null; status?: string | null }> = [];
  let depCount = 0;
  let empCount = 0;

  try {
    const [fetchedPeriods, [deptCountRow], [empCountRow]] = await Promise.all([
      db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)),
      db.select({ count: sql<number>`count(*)::int` }).from(departments),
      db.select({ count: sql<number>`count(*)::int` }).from(employees).where(eq(employees.isActive, true)),
    ]);
    periods = fetchedPeriods;
    depCount = deptCountRow?.count ?? 0;
    empCount = empCountRow?.count ?? 0;
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
      empCount={empCount}
      depCount={depCount}
    />
  );
}
