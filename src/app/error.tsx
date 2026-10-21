"use client";

import React, { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("APP ROUTER ERROR:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">Terjadi Kesalahan Pemuatan Halaman</h1>
          <p className="text-xs text-slate-500 mt-1">
            Halaman mengalami kendala saat memproses data.
          </p>
        </div>

        {error?.message && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-left">
            <div className="text-[11px] font-bold text-rose-900">Pesan Error:</div>
            <pre className="text-[11px] text-rose-800 font-mono mt-1 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {error.message}
            </pre>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Muat Ulang Halaman</span>
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    </div>
  );
}
