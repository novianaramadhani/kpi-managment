"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { btnPrimary } from "./ui";

export function GenerateAppraisalsButton({
  periodId,
  periodName,
  action,
}: {
  periodId: number;
  periodName: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = async () => {
    const confirm = await Swal.fire({
      title: "Generate Penilaian KPI?",
      html: `
        <div class="text-left text-sm text-slate-600 space-y-2">
          <p>Sistem akan memproses seluruh karyawan aktif pada periode <b>${periodName}</b>:</p>
          <ul class="list-disc pl-5 space-y-1 text-xs">
            <li>Menghitung masa kerja (tenure) s/d tanggal evaluasi.</li>
            <li>Memeriksa syarat eligibilitas minimum masa kerja.</li>
            <li>Mengalokasikan template KPI berdasarkan Departemen & Job Level.</li>
            <li>Menghubungkan atasan penilai langsung (Supervisor/Superintendent).</li>
          </ul>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Generate Sekarang",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("periodId", String(periodId));

    startTransition(async () => {
      try {
        void Swal.fire({
          title: "Memproses Penilaian KPI...",
          html: `
            <div style="font-size: 13px; color: #475569; margin-top: 6px; text-align: center;">
              <p>Menghitung masa kerja eligibilitas dan memasangkan template KPI seluruh karyawan...</p>
              <div style="margin: 12px auto; padding: 6px 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #0284c7; font-size: 12px; font-weight: 600; display: inline-block;">
                Estimasi waktu: 3–5 detik
              </div>
            </div>
          `,
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        await action(fd);
        router.refresh();

        await Swal.fire({
          icon: "success",
          title: "Generate Berhasil!",
          text: `Penilaian karyawan untuk periode "${periodName}" telah berhasil dibuat / diperbarui.`,
          confirmButtonColor: "#0284c7",
          timer: 2000,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal melakukan generate penilaian.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Generate",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={isPending}
      className={btnPrimary}
    >
      {isPending ? "⟳ Memproses Penilaian..." : "⟳ Generate Penilaian (eligibility & template)"}
    </button>
  );
}
