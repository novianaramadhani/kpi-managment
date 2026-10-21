"use client";

import { useTransition } from "react";
import Swal from "sweetalert2";

export function DeleteConfirmButton({
  action,
  title,
  text,
  className,
  children,
}: {
  action: () => Promise<void>;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (result.isConfirmed) {
      startTransition(async () => {
        try {
          await action();
          await Swal.fire({
            icon: "success",
            title: "Berhasil Dihapus",
            timer: 1500,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Gagal menghapus data";
          await Swal.fire({
            icon: "error",
            title: "Gagal Menghapus",
            text: message,
            confirmButtonColor: "#f59e0b",
          });
        }
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={className}
    >
      {isPending ? "Menghapus..." : children}
    </button>
  );
}
