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

  const [deps, lvls, emps, permissions] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.code)),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(employees).orderBy(asc(employees.nik)),
    db.select().from(jobLevelPermissions),
  ]);

  const tabs = [
    ["hak-akses", "Matriks Hak Akses"],
    ["approval", "Hirarki Penilai"],
  ];

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    "hak-akses": {
      title: "Matriks Hak Akses & Otoritas",
      subtitle: "Kelola matriks wewenang modul, role default sistem, dan pembatasan scope jangkauan data per Job Level.",
    },
    approval: {
      title: "Hirarki Penilai Karyawan",
      subtitle: "Atur hubungan Job Level karyawan dengan atasan penilai langsung dalam proses evaluasi KPI.",
    },
  };

  const currentInfo = tabTitles[activeTab] || tabTitles["hak-akses"];

  return (
    <div className="space-y-6">
      {/* Breadcrumb Header */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link href="/admin" className="hover:text-slate-900 transition">
          WORKSPACE
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Sistem & Keamanan</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-bold">{currentInfo.title}</span>
      </nav>

      {/* Header Halaman */}
      <PageHeader
        title={currentInfo.title}
        subtitle={currentInfo.subtitle}
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/setup/access?tab=${k}`}
            prefetch={false}
            className={`rounded-xl px-3.5 py-2 text-xs transition ${
              activeTab === k
                ? "bg-slate-900 text-white font-bold shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium"
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
    </div>
  );
}
