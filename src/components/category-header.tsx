"use client";

import React, { useState, useTransition, useEffect } from "react";
import Swal from "sweetalert2";
import { Trash2 } from "lucide-react";
import type { KpiCategory } from "@/db/schema";
import { fmtPct } from "@/lib/scoring";

export function CategoryHeader({
  category,
  templateId,
  index,
  sumP,
  updateCategoryAction,
  deleteCategoryAction,
}: {
  category: KpiCategory;
  templateId: number;
  index: number;
  sumP: number;
  updateCategoryAction: (fd: FormData) => Promise<void>;
  deleteCategoryAction: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [weight, setWeight] = useState(String(Number(category.weight) * 100));
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  // Keep state in sync if props change
  useEffect(() => {
    setName(category.name);
    setWeight(String(Number(category.weight) * 100));
    setSortOrder(String(category.sortOrder));
  }, [category]);

  // Cek apakah ada perubahan (dirty state)
  const isDirty =
    name !== category.name ||
    weight !== String(Number(category.weight) * 100) ||
    sortOrder !== String(category.sortOrder);

  const saveChanges = (overrideName?: string, overrideWeight?: string, overrideSort?: string) => {
    const trimmedName = (overrideName ?? name).trim();
    if (!trimmedName) return;

    const currentW = overrideWeight ?? weight;
    const numWeight = Number(currentW);
    if (!currentW || isNaN(numWeight) || numWeight <= 0 || numWeight > 100) return;

    const currentS = overrideSort ?? sortOrder;
    const numSort = Number(currentS);
    if (currentS === "" || isNaN(numSort)) return;

    const fd = new FormData();
    fd.append("id", String(category.id));
    fd.append("templateId", String(templateId));
    fd.append("name", trimmedName);
    fd.append("weight", currentW);
    fd.append("sortOrder", currentS);

    startTransition(async () => {
      try {
        await updateCategoryAction(fd);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal menyimpan parameter";
        void Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: message,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveChanges();
  };

  const handleDelete = async () => {
    const confirm = await Swal.fire({
      title: "Hapus Parameter?",
      text: `Parameter "${name}" dan semua indikator di dalamnya akan dihapus.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(category.id));
    fd.append("templateId", String(templateId));

    startDeleteTransition(async () => {
      try {
        await deleteCategoryAction(fd);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal menghapus parameter";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: message,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <div className="-m-5 mb-4 flex flex-wrap items-center justify-between gap-3 bg-emerald-50/80 border-b border-emerald-200/80 px-5 py-3 text-slate-800 transition-colors">
      <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-base font-bold text-emerald-800">{index + 1}.</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (isDirty) saveChanges();
          }}
          placeholder="Nama Parameter"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-800 placeholder-slate-400 shadow-2xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
        />
        <span className="text-xs font-semibold text-slate-600">Bobot</span>
        <div className="relative flex items-center">
          <input
            name="weight"
            type="number"
            step="0.01"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => {
              if (isDirty) saveChanges();
            }}
            className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 pr-5 text-sm font-semibold text-slate-800 text-center shadow-2xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
          />
          <span className="absolute right-1.5 text-xs text-slate-400 font-bold pointer-events-none">%</span>
        </div>
        <input
          name="sortOrder"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          onBlur={() => {
            if (isDirty) saveChanges();
          }}
          className="w-12 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-800 text-center shadow-2xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
          title="Urutan Tampilan"
        />

        {/* Tombol Simpan halus (hanya muncul saat ada perubahan yang belum tersimpan) */}
        {isDirty && (
          <button
            type="submit"
            disabled={isPending || isDeleting}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition cursor-pointer"
            title="Klik untuk menyimpan perubahan parameter"
          >
            {isPending ? (
              <span>Menyimpan...</span>
            ) : (
              <>
                <span>✓</span>
                <span>Simpan</span>
              </>
            )}
          </button>
        )}
      </form>

      <div className="flex items-center gap-2.5 text-xs">
        <span
          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${
            Math.abs(sumP - 1) < 0.0001
              ? "bg-emerald-100/80 text-emerald-800 border border-emerald-300/80"
              : "bg-amber-100/80 text-amber-800 border border-amber-300/80"
          }`}
          title={
            Math.abs(sumP - 1) < 0.0001
              ? "Total bobot indikator parameter ini seimbang 100%"
              : "Total bobot indikator parameter ini belum 100%"
          }
        >
          Σ Bobot P: {fmtPct(sumP, 0)}
        </span>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending || isDeleting}
          className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer disabled:opacity-30"
          title="Hapus Parameter"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
