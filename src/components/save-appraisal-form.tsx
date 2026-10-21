"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import Swal from "sweetalert2";
import { saveAppraisalInputs } from "@/lib/actions";

const initialState = { success: false, error: "" };

export function SaveAppraisalForm({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState(saveAppraisalInputs, initialState);

  useEffect(() => {
    if (state.success) {
      void Swal.fire({
        icon: "success",
        title: "Berhasil",
        text: "Nilai berhasil disimpan dan skor berhasil dihitung.",
        confirmButtonColor: "#0284c7",
        confirmButtonText: "OK",
      });
    } else if (state.error) {
      void Swal.fire({
        icon: "error",
        title: "Gagal menyimpan",
        text: state.error,
        confirmButtonColor: "#0284c7",
        confirmButtonText: "Tutup",
      });
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-6">
      {children}
      {state.error && <p className="mt-3 text-sm text-rose-600">{state.error}</p>}
      {pending && <p className="mt-3 text-sm text-slate-500">Menyimpan nilai...</p>}
    </form>
  );
}
