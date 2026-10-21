"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { btnPrimary } from "./ui";

export function SeedDemoButton({ action }: { action: () => Promise<void> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSeed = async () => {
    const confirm = await Swal.fire({
      title: "Muat Data Demo?",
      text: "Sistem akan menyiapkan data awal: Departemen, Job Level, Karyawan, Template KPI, dan Periode 2025.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Muat Data Demo",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        void Swal.fire({
          title: "Memuat Data Demo...",
          html: `
            <div style="font-size: 13px; color: #475569; margin-top: 6px; text-align: center;">
              <p>Menginisialisasi struktur organisasi, karyawan, dan template KPI...</p>
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

        await action();
        router.refresh();

        await Swal.fire({
          icon: "success",
          title: "Data Demo Berhasil Dimuat!",
          text: "Sistem siap digunakan untuk alur penilaian KPI.",
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memuat data demo.";
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleSeed}
      disabled={isPending}
      className={btnPrimary}
    >
      {isPending ? "Memuat Data Demo..." : "Muat Data Demo"}
    </button>
  );
}
