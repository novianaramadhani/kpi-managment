import { db } from "@/db";
import {
  departments,
  employees,
  jobLevels,
  jobPositions,
  jobLevelPermissions,
  auditLogs,
  appraisalApprovalLogs,
  appraisals,
  pits,
  departmentMappings,
} from "@/db/schema";
import { eq, asc, desc, or, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { upsertEmployee } from "@/lib/actions";
import { resetEmployeePasswordAction } from "@/lib/auth";
import { EmployeeDetailClient, UnifiedLogItem } from "./employee-detail-client";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empId = parseInt(id, 10);

  if (isNaN(empId)) {
    notFound();
  }

  const [emp, deps, lvls, positions, pitList, mappingsList] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, empId)).limit(1).then((res) => res[0]),
    db.select().from(departments).orderBy(asc(departments.code)),
    db.select().from(jobLevels).orderBy(asc(jobLevels.rank)),
    db.select().from(jobPositions).orderBy(asc(jobPositions.name)),
    db.select().from(pits).where(eq(pits.isActive, true)).orderBy(asc(pits.name)),
    db.select().from(departmentMappings),
  ]);

  if (!emp) {
    notFound();
  }

  const [permission, rawAuditLogs, rawApprovalLogs] = await Promise.all([
    db
      .select()
      .from(jobLevelPermissions)
      .where(eq(jobLevelPermissions.jobLevelId, emp.jobLevelId))
      .limit(1)
      .then((res) => res[0] ?? null),
    db
      .select()
      .from(auditLogs)
      .where(
        or(
          and(eq(auditLogs.entity, "employee"), eq(auditLogs.entityId, empId)),
          and(eq(auditLogs.entity, "employee_permissions"), eq(auditLogs.entityId, empId)),
          and(eq(auditLogs.entity, "auth"), eq(auditLogs.entityId, empId)),
          eq(auditLogs.actor, emp.name),
          eq(auditLogs.actor, emp.nik)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100),
    db
      .select({
        log: appraisalApprovalLogs,
        appr: appraisals,
      })
      .from(appraisalApprovalLogs)
      .innerJoin(appraisals, eq(appraisalApprovalLogs.appraisalId, appraisals.id))
      .where(
        or(
          eq(appraisals.employeeId, empId),
          eq(appraisalApprovalLogs.actorId, empId),
          eq(appraisalApprovalLogs.actorName, emp.name)
        )
      )
      .orderBy(desc(appraisalApprovalLogs.createdAt))
      .limit(100),
  ]);

  const unifiedLogs: UnifiedLogItem[] = [];

  // 1. Petakan auditLogs
  for (const log of rawAuditLogs) {
    let category: "kpi" | "auth" | "profile" = "profile";
    let title = "Aktivitas Sistem";
    let description = `${log.action} pada ${log.entity}`;
    let badgeText = log.action;
    let badgeColor = "slate";

    const changes = (log.changes || {}) as Record<string, any>;

    if (log.entity === "auth") {
      category = "auth";
      if (log.action === "LOGIN") {
        title = "Masuk ke Sistem (Login)";
        description = changes?.message || `Pengguna berhasil login (Site: ${changes?.operatingUnit || "-"})`;
        badgeText = "Login";
        badgeColor = "emerald";
      } else if (log.action === "LOGOUT") {
        title = "Keluar dari Sistem (Logout)";
        description = changes?.message || "Pengguna keluar dari sesi sistem";
        badgeText = "Logout";
        badgeColor = "slate";
      } else if (log.action === "RESET_PASSWORD") {
        title = "Reset Kata Sandi Akun";
        description = changes?.message || `Kata sandi direset ke default (NIK: ${emp.nik}) oleh Admin`;
        badgeText = "Keamanan";
        badgeColor = "rose";
      }
    } else if (log.entity === "employee_permissions") {
      category = "profile";
      title = "Pembaruan Hak Akses (RBAC)";
      description = changes?.message || "Pengaturan hak akses dan izin matriks karyawan diperbarui";
      badgeText = "Hak Akses";
      badgeColor = "indigo";
    } else if (log.entity === "employee") {
      if (log.action === "CREATE") {
        category = "profile";
        title = "Pendaftaran Karyawan Baru";
        description = `Data karyawan ${emp.name} pertama kali didaftarkan ke sistem`;
        badgeText = "Dibuat";
        badgeColor = "emerald";
      } else if (log.action === "UPDATE") {
        category = "profile";
        title = "Pembaruan Data Karyawan";
        description = changes?.role
          ? `Perubahan data profil karyawan (Role: ${changes.role}, Site: ${changes.operatingUnit || "-"})`
          : "Informasi profil dan penugasan karyawan diperbarui";
        badgeText = "Pembaruan";
        badgeColor = "blue";
      } else if (log.action === "RESET_PASSWORD") {
        category = "auth";
        title = "Reset Kata Sandi Akun";
        description = changes?.message || `Kata sandi akun direset ke default oleh Admin`;
        badgeText = "Keamanan";
        badgeColor = "rose";
      }
    } else if (log.entity.includes("appraisal") || log.entity.includes("kpi")) {
      category = "kpi";
      title = "Aktivitas Penilaian KPI";
      description = typeof changes?.message === "string" ? changes.message : `${log.action} pada ${log.entity}`;
      badgeText = "Penilaian";
      badgeColor = "amber";
    }

    unifiedLogs.push({
      id: `audit-${log.id}`,
      category,
      entity: log.entity,
      action: log.action,
      actor: log.actor || "System",
      title,
      description,
      badgeText,
      badgeColor,
      createdAt: log.createdAt,
      rawDetails: log.changes,
    });
  }

  // 2. Petakan appraisalApprovalLogs
  for (const item of rawApprovalLogs) {
    const l = item.log;
    let title = "Alur Persetujuan KPI";
    let description = `Tahap ${l.stage}: ${l.action}`;
    let badgeText = "Approval";
    let badgeColor = "blue";

    if (l.action === "SUBMIT_TO_HEAD") {
      title = "Pengajuan Penilaian KPI";
      description = `Penilaian diajukan ke Head Dept${l.notes ? ` (Catatan: "${l.notes}")` : ""}`;
      badgeText = "Diajukan";
      badgeColor = "amber";
    } else if (l.action === "VALIDATE_TO_MGR") {
      title = "Validasi Head Dept";
      description = `Penilaian divalidasi Head Dept dan diteruskan ke Manager${l.notes ? ` (Catatan: "${l.notes}")` : ""}`;
      badgeText = "Divalidasi";
      badgeColor = "blue";
    } else if (l.action === "VALIDATE_TO_HR") {
      title = "Validasi Manager";
      description = `Penilaian divalidasi Manager dan diteruskan ke HR${l.notes ? ` (Catatan: "${l.notes}")` : ""}`;
      badgeText = "Divalidasi";
      badgeColor = "indigo";
    } else if (l.action === "APPROVE_FINAL") {
      title = "Persetujuan Final HR";
      description = `Penilaian disetujui secara final oleh HR${l.notes ? ` (Catatan: "${l.notes}")` : ""}`;
      badgeText = "Disetujui";
      badgeColor = "emerald";
    } else if (l.action.includes("REJECT") || l.action.includes("REVISE")) {
      title = "Pengembalian Penilaian (Revisi)";
      description = `Penilaian dikembalikan ke tahap sebelumnya${l.notes ? ` (Alasan: "${l.notes}")` : ""}`;
      badgeText = "Revisi";
      badgeColor = "rose";
    }

    unifiedLogs.push({
      id: `approval-${l.id}`,
      category: "kpi",
      entity: "appraisal_approval_log",
      action: l.action,
      actor: l.actorName ? `${l.actorName} (${l.actorRole})` : "System",
      title,
      description,
      badgeText,
      badgeColor,
      createdAt: l.createdAt,
      rawDetails: {
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        stage: l.stage,
        notes: l.notes,
      },
    });
  }

  // Urutkan menurut waktu terbaru (descending)
  unifiedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="min-h-screen bg-slate-50/60 py-5 px-3 sm:px-6 lg:px-8">
      <EmployeeDetailClient
        employee={emp}
        departments={deps}
        jobLevels={lvls}
        jobPositions={positions}
        pits={pitList}
        mappings={mappingsList}
        permission={permission}
        auditLogs={unifiedLogs}
        upsertAction={upsertEmployee}
        resetPasswordAction={resetEmployeePasswordAction}
      />
    </div>
  );
}
