"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import { Card, btnPrimary, btnSecondary, btnSuccess, inputCls } from "./ui";

export function AppraisalWorkflowCard({
  appraisalId,
  currentStatus,
  initialNotes = "",
  action,
}: {
  appraisalId: number;
  currentStatus: string;
  initialNotes?: string | null;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = async (
    targetStatus: "DRAFT" | "SUBMITTED" | "REVIEWED" | "FINAL",
    actionLabel: string,
    confirmText: string
  ) => {
    const confirm = await Swal.fire({
      title: `${actionLabel}?`,
      text: confirmText,
      icon: targetStatus === "FINAL" ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Ya, ${actionLabel}`,
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(appraisalId));
    fd.append("status", targetStatus);
    if (notes.trim()) {
      fd.append("notes", notes.trim());
    }

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Status Diperbarui!",
          text: `Status penilaian berhasil diubah menjadi "${targetStatus}".`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengubah status penilaian.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Mengubah Status",
          text: msg,
          confirmButtonColor: "#0284c7",
        });
      }
    });
  };

  const STAGES = [
    { key: "DRAFT", step: 1, label: "Draft" },
    { key: "SUBMITTED", step: 2, label: "Submitted" },
    { key: "REVIEWED", step: 3, label: "Reviewed" },
    { key: "FINAL", step: 4, label: "Final" },
  ];
  const stageOrder = ["DRAFT", "SUBMITTED", "REVIEWED", "FINAL"];
  const currentIndex = stageOrder.indexOf(currentStatus);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
      {/* Left: Stepper Pipeline */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
          Staging:
        </span>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {STAGES.map((s, idx) => {
            const isCurrent = currentStatus === s.key;
            const isPassed = currentIndex > idx;
            return (
              <React.Fragment key={s.key}>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all ${
                    isCurrent
                      ? "bg-sky-500 text-white font-bold shadow-xs ring-1 ring-emerald-700"
                      : isPassed
                      ? "bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/80"
                      : "bg-slate-100 text-slate-500 font-medium"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      isCurrent
                        ? "bg-white/20 text-white"
                        : isPassed
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {isPassed ? "✓" : s.step}
                  </span>
                  <span>{s.label}</span>
                </div>
                {idx < STAGES.length - 1 && (
                  <span className={`text-xs font-bold ${isPassed ? "text-emerald-600" : "text-slate-300"}`}>
                    →
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Right: Notes & Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        {currentStatus !== "FINAL" && (
          <input
            type="text"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan review (opsional)..."
            className="h-8 w-full sm:w-56 md:w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
          />
        )}

        {currentStatus === "DRAFT" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              handleStatusChange(
                "SUBMITTED",
                "Submit ke Head Dept",
                "Pastikan nilai dan data penilaian telah terisi dengan benar sebelum diajukan."
              )
            }
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-sky-500 hover:bg-[#0369a1] active:scale-95 text-white text-xs font-bold px-3.5 shadow-xs hover:shadow transition disabled:opacity-50 cursor-pointer"
          >
            <span>{isPending ? "Memproses..." : "Submit ke Head Dept ➔"}</span>
          </button>
        )}

        {currentStatus === "SUBMITTED" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleStatusChange(
                  "REVIEWED",
                  "Tandai Reviewed",
                  "Tandai bahwa penilaian ini telah diverifikasi oleh atasan penilai."
                )
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-sky-500 hover:bg-[#0369a1] active:scale-95 text-white text-xs font-bold px-3.5 shadow-xs hover:shadow transition disabled:opacity-50 cursor-pointer"
            >
              <span>{isPending ? "Memproses..." : "✓ Tandai Reviewed"}</span>
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleStatusChange(
                  "DRAFT",
                  "Kembalikan ke Draft",
                  "Penilaian akan dikembalikan ke status DRAFT agar dapat diperbaiki atau diisi ulang."
                )
              }
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-semibold px-2.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              <span>Kembalikan ke Draft</span>
            </button>
          </div>
        )}

        {currentStatus === "REVIEWED" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleStatusChange(
                  "FINAL",
                  "Finalisasi Penilaian",
                  "Hasil akhir KPI karyawan akan dikunci dan dicatat resmi pada laporan evaluasi."
                )
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold px-3.5 shadow-xs hover:shadow transition disabled:opacity-50 cursor-pointer"
            >
              <span>{isPending ? "Memproses..." : "★ Finalisasi Penilaian"}</span>
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleStatusChange(
                  "DRAFT",
                  "Kembalikan ke Draft",
                  "Penilaian akan dikembalikan ke status DRAFT."
                )
              }
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-semibold px-2.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              <span>Kembalikan ke Draft</span>
            </button>
          </div>
        )}

        {currentStatus === "FINAL" && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
              ✓ Penilaian Final
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleStatusChange(
                  "REVIEWED",
                  "Buka Kembali Penilaian",
                  "Status akan dibuka kembali ke status REVIEWED untuk keperluan penyesuaian oleh Admin."
                )
              }
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-semibold px-2.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              <span>Buka Kembali (Admin)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReviewStatusActions({
  appraisalId,
  employeeName,
  status,
  action,
}: {
  appraisalId: number;
  employeeName: string;
  status: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAction = async (
    targetStatus: "DRAFT" | "SUBMITTED" | "REVIEWED" | "FINAL",
    label: string,
    confirmTitle: string
  ) => {
    const confirm = await Swal.fire({
      title: confirmTitle,
      text: `Ubah status penilaian untuk karyawan "${employeeName}" menjadi "${targetStatus}"?`,
      icon: targetStatus === "FINAL" ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: targetStatus === "FINAL" ? "#0284c7" : "#2563eb",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Ya, ${label}`,
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(appraisalId));
    fd.append("status", targetStatus);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Berhasil Diperbarui!",
          text: `Status penilaian "${employeeName}" berhasil diubah ke ${targetStatus}.`,
          confirmButtonColor: "#0284c7",
          timer: 1600,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memperbarui status.";
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
    <div className="flex flex-wrap gap-1.5">
      {status === "SUBMITTED" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            handleAction("REVIEWED", "Review OK", "Verifikasi & Tandai Review OK?")
          }
          className={`${btnPrimary} !px-2 !py-1 !text-xs`}
        >
          {isPending ? "..." : "✓ Review OK"}
        </button>
      )}

      {status === "REVIEWED" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            handleAction("FINAL", "Finalisasi", "Finalisasi Penilaian Karyawan?")
          }
          className={`${btnSuccess} !px-2 !py-1 !text-xs`}
        >
          {isPending ? "..." : "Finalisasi"}
        </button>
      )}

      {(status === "SUBMITTED" || status === "REVIEWED") && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            handleAction("DRAFT", "Kembalikan", "Kembalikan ke Status Draft?")
          }
          className={`${btnSecondary} !px-2 !py-1 !text-xs`}
        >
          {isPending ? "..." : "Kembalikan"}
        </button>
      )}

      {status === "DRAFT" && (
        <Link
          href={`/input-kpi?id=${appraisalId}`}
          className={`${btnPrimary} !px-2 !py-1 !text-xs`}
        >
          ✎ Lengkapi input
        </Link>
      )}
    </div>
  );
}
