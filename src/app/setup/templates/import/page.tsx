import { db } from "@/db";
import { departments, jobLevels, jobPositions, kpiPeriods, employees } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { getMasterParameters } from "@/lib/actions";
import { TemplateExcelImportWizard } from "@/components/template-excel-import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportTemplatePage() {
  const [deps, lvls, periods, masterParams, positions, emps] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.name)),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.year)),
    getMasterParameters(undefined, true),
    db
      .select()
      .from(jobPositions)
      .where(eq(jobPositions.isActive, true))
      .orderBy(asc(jobPositions.name)),
    db
      .select({
        id: employees.id,
        nik: employees.nik,
        name: employees.name,
        departmentId: employees.departmentId,
        jobLevelId: employees.jobLevelId,
        jobPositionId: employees.jobPositionId,
        jobPosition: employees.jobPosition,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.nik)),
  ]);

  const activePeriod =
    periods.find((p: typeof kpiPeriods.$inferSelect) => p.status === "ACTIVE") ?? periods[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Excel Master Template KPI"
        subtitle="Unggah dan konversi berkas Excel template KPI menjadi Master Template yang terstruktur dan siap digunakan kembali."
        backHref="/setup/templates"
        backLabel="Kembali ke Master Template"
      />

      <TemplateExcelImportWizard
        departments={deps}
        jobLevels={lvls}
        jobPositions={positions}
        periods={periods}
        activePeriod={activePeriod}
        masterParameters={masterParams}
        employees={emps}
      />
    </div>
  );
}
