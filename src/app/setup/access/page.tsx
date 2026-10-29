import { db } from "@/db";
import { departments, employees, jobLevels, jobLevelPermissions } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import {
  saveJobLevelPermissionsAction,
  deleteJobLevelPermissionAction,
  updateJobLevelHierarchy,
  createJobLevelHierarchy,
} from "@/lib/actions";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HakAksesTableClient } from "@/components/hak-akses-table-client";
import { ApprovalTableClient } from "@/components/master-tables-client";
import { StagingApprovalRbacClient } from "@/components/staging-approval-rbac-client";
import {
  getApprovalWorkflowState,
  loadMasterResolutionContext,
} from "@/lib/approval-workflow-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AccessSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") {
    redirect("/admin");
  }

  const { tab = "hak-akses" } = await searchParams;
  const activeTab = tab;

  const [deps, lvls, emps, permissions, workflowState, masterContext] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.code)),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(employees).orderBy(asc(employees.nik)),
    db.select().from(jobLevelPermissions),
    getApprovalWorkflowState(),
    loadMasterResolutionContext(),
  ]);

  const tabs = [
    ["hak-akses", "Matriks Hak Akses"],
    ["approval", "Hirarki Penilai"],
    ["staging-approval", "Staging Approval"],
  ];

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    "hak-akses": {
      title: "Matriks Hak Akses",
      subtitle: "Pengaturan wewenang modul dan cakupan akses per Job Level.",
    },
    approval: {
      title: "Hirarki Penilai",
      subtitle: "Pengaturan relasi Job Level karyawan dengan atasan penilai.",
    },
    "staging-approval": {
      title: "Staging Approval",
      subtitle: "Pengaturan alur persetujuan penilaian KPI.",
    },
  };

  const currentInfo = tabTitles[activeTab] || tabTitles["hak-akses"];

  return (
    <div className="space-y-4">
      {/* Header Halaman (Single Back Navigation) */}
      <PageHeader
        title={currentInfo.title}
        subtitle={currentInfo.subtitle}
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs (Minimalis Tanpa Kotak Luar) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/setup/access?tab=${k}`}
            prefetch={false}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              activeTab === k
                ? "bg-sky-100/90 text-sky-950 font-semibold"
                : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-800 font-medium"
            }`}
          >
            {l}
          </Link>
        ))}
      </div>

      {/* Tab 1: Hak Akses */}
      {activeTab === "hak-akses" && (
        <HakAksesTableClient
          jobLevels={lvls}
          departments={deps}
          permissions={permissions}
          savePermissionsAction={saveJobLevelPermissionsAction}
          deletePermissionsAction={deleteJobLevelPermissionAction}
        />
      )}

      {/* Tab 2: Hirarki Penilai */}
      {activeTab === "approval" && (
        <ApprovalTableClient
          employees={emps}
          departments={deps}
          jobLevels={lvls}
          updateHierarchyAction={updateJobLevelHierarchy}
          createHierarchyAction={createJobLevelHierarchy}
        />
      )}

      {/* Tab 3: Pengaturan Staging Approval */}
      {activeTab === "staging-approval" && (
        <StagingApprovalRbacClient
          initialState={workflowState}
          masterContext={masterContext}
        />
      )}
    </div>
  );
}
