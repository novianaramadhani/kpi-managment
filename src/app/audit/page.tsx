import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle="Riwayat perubahan template, penilaian, karyawan, dan konfigurasi (200 terakhir)."
        backHref="/admin"
        backLabel="Kembali ke Admin Menu"
      />
      <Card>
        <Table head={<tr><th className={th}>Waktu</th><th className={th}>Entitas</th><th className={th}>ID</th><th className={th}>Aksi</th><th className={th}>Aktor</th><th className={th}>Perubahan</th></tr>}>
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <td suppressHydrationWarning className={`${td} whitespace-nowrap text-xs`}>{l.createdAt.toLocaleString("id-ID")}</td>
              <td className={td}><Badge tone="blue">{l.entity}</Badge></td>
              <td className={td}>{l.entityId ?? "-"}</td>
              <td className={`${td} font-medium`}>{l.action}</td>
              <td className={td}>{l.actor}</td>
              <td className={`${td} max-w-[480px] truncate font-mono text-xs text-slate-500`} title={l.changes ? JSON.stringify(l.changes) : ""}>{l.changes ? JSON.stringify(l.changes) : "-"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
