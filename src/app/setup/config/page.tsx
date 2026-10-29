import { getConfig, getSystemDate, updateConfig } from "@/lib/actions";
import { Card, PageHeader } from "@/components/ui";
import { ConfigClockForm, ConfigCompanyForm, ConfigKpiLimitForm } from "@/components/master-forms";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConfigSetupPage() {
  const systemDate = await getSystemDate();
  const maxKpiWeight = await getConfig("max_kpi_category_weight", "115");

  return (
    <div className="space-y-4">
      {/* Header Halaman (Single Back Navigation) */}
      <PageHeader
        title="Konfigurasi Sistem"
        subtitle="Pengaturan tanggal jam sistem (clock) dan identitas institusi perusahaan."
        backHref="/admin"
        backLabel="Kembali ke Workspace"
      />

      {/* Form Konfigurasi Sistem */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="System Clock (Tanggal Simulasi Admin)">
          <p className="mb-3 text-xs text-slate-600 leading-relaxed">
            Tanggal sistem dipakai untuk menghitung masa kerja dan menentukan jendela input (bulan mulai s/d cut-off). Kosongkan untuk memakai tanggal server aktual.
          </p>
          <ConfigClockForm defaultDate={systemDate} action={updateConfig} />
        </Card>

        <Card title="Identitas Perusahaan">
          <p className="mb-3 text-xs text-slate-600 leading-relaxed">
            Nama perusahaan yang akan tercetak pada laporan resmi dan export PDF evaluasi KPI.
          </p>
          <ConfigCompanyForm action={updateConfig} />
        </Card>

        <Card title="Batas Maksimal Total Bobot KPI">
          <p className="mb-3 text-xs text-slate-600 leading-relaxed">
            Target global total persentase bobot poin utama (kategori) dalam satu Form Penilaian KPI. Default sistem adalah 115%.
          </p>
          <ConfigKpiLimitForm defaultLimit={maxKpiWeight} action={updateConfig} />
        </Card>
      </div>
    </div>
  );
}
