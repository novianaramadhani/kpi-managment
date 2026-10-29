import { db } from "@/db";
import { departments, employees, jobLevels, jobPositions, kpiTemplates, departmentHeads } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import {
  assignAppraiser,
  createDepartment,
  updateDepartment,
  createJobLevel,
  deleteDepartment,
  batchDeleteDepartmentsAction,
  deleteEmployee,
  reactivateEmployee,
  permanentDeleteEmployee,
  deleteJobLevel,
  createJobPosition,
  updateJobPosition,
  deleteJobPosition,
  importJobPositionsBatch,
  getSystemDate,
  getConfig,
  importEmployeesBatch,
  importDepartmentsBatch,
  importJobLevelsBatch,
  saveOperatingUnitsAction,
  upsertEmployee,
  syncOdooEmployeesAction,
  resetOdooSyncedEmployeesAction,
  syncExistingEmployeesPitAction,
  createHeadDepartmentAction,
  updateHeadDepartmentAction,
  deleteHeadDepartmentAction,
  toggleHeadDepartmentStatusAction,
  importHeadDepartmentsBatch,
} from "@/lib/actions";
import {
  getDepartmentMappingsAction,
  createDepartmentMappingAction,
  updateDepartmentMappingAction,
  deleteDepartmentMappingAction,
  batchDeleteDepartmentMappingsAction,
  batchAssignStandardDepartmentAction,
  importDepartmentMappingsBatch,
  importDepartmentsWithMappingAction,
} from "@/lib/department-mapping-actions";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmployeeListTable } from "@/components/employee-list-table";
import {
  DepartmentTableClient,
  JobLevelTableClient,
  JobPositionTableClient,
  OperatingUnitTableClient,
} from "@/components/master-tables-client";
import { MasterDepartmentView } from "@/components/master-department-view";

import {
  getPitsAction,
  createPitAction,
  updatePitAction,
  deletePitAction,
  batchDeletePitsAction,
  togglePitStatusAction,
  importPitsBatch,
} from "@/lib/pit-actions";
import { getSitesAction } from "@/lib/site-actions";
import { MasterPitTableClient } from "@/components/master-pit-table-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; unit?: string; subtab?: string; dept?: string }>;
}) {
  const { tab = "karyawan", unit = "ALL", subtab = "department", dept } = await searchParams;
  if (tab === "template" || tab === "templates" || tab === "master-template") {
    redirect("/setup/templates");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN" && currentUser.role !== "HR") {
    redirect("/dashboard");
  }

  const activeTab = tab === "master" ? "departemen" : tab;

  const [deps, lvls, positions, rawEmps, tpls, systemDate, savedOUsJson, deptHeads, mappings, pitList, siteList] =
    await Promise.all([
      db.select().from(departments).orderBy(asc(departments.code)),
      db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
      db.select().from(jobPositions).orderBy(asc(jobPositions.code)),
      db.select().from(employees).orderBy(asc(employees.nik)),
      db.select().from(kpiTemplates).where(eq(kpiTemplates.isActive, true)),
      getSystemDate(),
      getConfig("master_operating_units", ""),
      db.select().from(departmentHeads).orderBy(asc(departmentHeads.id)),
      getDepartmentMappingsAction(),
      getPitsAction(),
      getSitesAction(),
    ]);

  // Sanitasi data karyawan agar kolom password tidak terkirim ke klien
  const emps = rawEmps.map(({ password: _pwd, ...rest }) => ({
    ...rest,
    password: null,
  }));

  let savedUnits: { id: string; name: string; status: string }[] | undefined = undefined;
  if (savedOUsJson) {
    try {
      savedUnits = JSON.parse(savedOUsJson);
    } catch {
      savedUnits = undefined;
    }
  }

  const tabs = [
    ["karyawan", "Karyawan"],
    ["departemen", "Departemen"],
    ["jabatan", "Job Position"],
    ["joblevel", "Job Level"],
    ["units", "Operating Units (Site)"],
    ["pit", "Master PIT"],
  ];

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    karyawan: {
      title: "Master Karyawan",
      subtitle: "Kelola NIK, nama, jabatan, unit operasional, penilai langsung, serta ekspor & impor Excel.",
    },
    departemen: {
      title: "Master Departemen",
      subtitle: "Kelola divisi & departemen perusahaan serta penunjukan Head Department per unit operasional.",
    },
    jabatan: {
      title: "Master Job Position",
      subtitle: "Kelola daftar job position organisasi yang terhubung dengan Departemen dan Job Level.",
    },
    joblevel: {
      title: "Master Job Level",
      subtitle: "Kelola struktur tingkatan golongan dan level kepangkatan organisasi.",
    },
    units: {
      title: "Master Operating Units (Sites)",
      subtitle: "Kelola pembagian unit kerja operasional: Site GAM, Site AKP, dan Head Office (HO).",
    },
    pit: {
      title: "Master PIT",
      subtitle: "Kelola sektor penambangan operasional (BCM Selatan, BCM Utara, dll.) terpisah dari Site dan Departemen.",
    },
  };

  const currentInfo = tabTitles[activeTab] || tabTitles.karyawan;

  return (
    <div className="space-y-4">
      {/* Header Halaman (Single Back Navigation) */}
      <PageHeader
        title={currentInfo.title}
        subtitle={currentInfo.subtitle}
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs (Soft Light-Blue Active State) */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/setup/master?tab=${k}`}
            prefetch={false}
            className={`rounded-lg px-3.5 py-1.5 text-xs transition ${
              activeTab === k
                ? "bg-sky-100/90 text-sky-950 font-semibold border border-sky-200/80"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
            }`}
          >
            {l}
          </Link>
        ))}
      </div>

      {/* Tab 1: Karyawan */}
      {activeTab === "karyawan" && (
        <EmployeeListTable
          employees={emps}
          departments={deps}
          jobLevels={lvls}
          jobPositions={positions}
          templates={tpls}
          systemDate={systemDate}
          initialUnit={unit}
          mappings={mappings}
          pits={pitList}
          assignAppraiserAction={assignAppraiser}
          deleteEmployeeAction={deleteEmployee}
          reactivateEmployeeAction={reactivateEmployee}
          permanentDeleteEmployeeAction={permanentDeleteEmployee}
          upsertEmployeeAction={upsertEmployee}
          importEmployeesAction={importEmployeesBatch}
          syncOdooAction={syncOdooEmployeesAction}
          resetOdooSyncAction={resetOdooSyncedEmployeesAction}
          syncExistingEmployeesPitAction={syncExistingEmployeesPitAction}
        />
      )}

      {/* Tab 2: Departemen */}
      {activeTab === "departemen" && (
        <MasterDepartmentView
          departments={deps}
          employees={emps}
          departmentHeads={deptHeads}
          mappings={mappings}
          pits={pitList}
          sites={siteList}
          operatingUnits={savedUnits}
          initialSubtab={subtab}
          initialDeptId={dept ? Number(dept) : undefined}
          createDepartmentAction={createDepartment}
          updateDepartmentAction={updateDepartment}
          deleteDepartmentAction={deleteDepartment}
          batchDeleteDepartmentAction={batchDeleteDepartmentsAction}
          importDepartmentsAction={importDepartmentsBatch}
          smartImportDepartmentAction={importDepartmentsWithMappingAction}
          createHeadDeptAction={createHeadDepartmentAction}
          updateHeadDeptAction={updateHeadDepartmentAction}
          deleteHeadDeptAction={deleteHeadDepartmentAction}
          toggleHeadDeptStatusAction={toggleHeadDepartmentStatusAction}
          importHeadDeptAction={importHeadDepartmentsBatch}
          createMappingAction={createDepartmentMappingAction}
          updateMappingAction={updateDepartmentMappingAction}
          deleteMappingAction={deleteDepartmentMappingAction}
          batchDeleteMappingAction={batchDeleteDepartmentMappingsAction}
          batchAssignMappingAction={batchAssignStandardDepartmentAction}
          importMappingAction={importDepartmentMappingsBatch}
        />
      )}

      {/* Tab 3: Jabatan (Job Position) */}
      {activeTab === "jabatan" && (
        <JobPositionTableClient
          jobPositions={positions}
          departments={deps}
          jobLevels={lvls}
          employees={emps}
          createAction={createJobPosition}
          updateAction={updateJobPosition}
          deleteAction={deleteJobPosition}
          importAction={importJobPositionsBatch}
        />
      )}

      {/* Tab 4: Job Level */}
      {activeTab === "joblevel" && (
        <JobLevelTableClient
          jobLevels={lvls}
          employees={emps}
          departments={deps}
          createAction={createJobLevel}
          deleteAction={deleteJobLevel}
          importAction={importJobLevelsBatch}
        />
      )}

      {/* Tab 5: Operating Units */}
      {activeTab === "units" && (
        <OperatingUnitTableClient
          employees={emps}
          departments={deps}
          initialUnits={savedUnits}
          saveUnitsAction={saveOperatingUnitsAction}
        />
      )}

      {/* Tab 6: Master PIT */}
      {activeTab === "pit" && (
        <MasterPitTableClient
          pits={pitList}
          sites={siteList}
          availableSites={siteList.map((s) => s.code)}
          departments={deps}
          createAction={createPitAction}
          updateAction={updatePitAction}
          deleteAction={deletePitAction}
          batchDeleteAction={batchDeletePitsAction}
          toggleStatusAction={togglePitStatusAction}
          importAction={importPitsBatch}
        />
      )}
    </div>
  );
}
