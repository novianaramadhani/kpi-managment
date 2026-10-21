"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Target,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  AlertCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Compass,
  ArrowRight,
  Code,
} from "lucide-react";
import type { KpiDirection } from "@/db/schema";

interface Props {
  initialData?: KpiDirection[];
}

export function KpiDirectionManager({ initialData = [] }: Props) {
  const [data, setData] = useState<KpiDirection[]>(initialData);
  const [loading, setLoading] = useState<boolean>(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<KpiDirection | null>(null);
  const [formCode, setFormCode] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formFormulaHint, setFormFormulaHint] = useState<string>("");
  const [formSortOrder, setFormSortOrder] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (filterActive !== "ALL") params.append("isActive", filterActive === "ACTIVE" ? "true" : "false");

      const res = await fetch(`/api/admin/kpi-config/directions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat arah penilaian.");
      setData(json.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, filterActive]);

  useEffect(() => {
    if (initialData.length === 0) {
      fetchData();
    }
  }, [fetchData, initialData.length]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormFormulaHint("(Actual / Target) * 100%");
    setFormSortOrder(data.length + 1);
    setIsModalOpen(true);
  };

  const openEditModal = (item: KpiDirection) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormName(item.name);
    setFormDescription(item.description || "");
    setFormFormulaHint(item.formulaHint || "");
    setFormSortOrder(item.sortOrder);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      Swal.fire({ icon: "warning", title: "Validasi Gagal", text: "Kode dan Nama arah penilaian wajib diisi." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: editingItem?.id,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        description: formDescription.trim(),
        formulaHint: formFormulaHint.trim(),
        sortOrder: formSortOrder,
        isActive: true,
      };

      const res = await fetch("/api/admin/kpi-config/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal menyimpan arah penilaian.");

      Swal.fire({
        icon: "success",
        title: "Tersimpan",
        text: `Arah penilaian "${formName}" berhasil disimpan.`,
        timer: 1500,
        showConfirmButton: false,
      });

      setIsModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: KpiDirection) => {
    const result = await Swal.fire({
      title: "Nonaktifkan Arah Penilaian?",
      html: `Apakah Anda yakin ingin menonaktifkan <b>${item.name}</b> (${item.code})?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Nonaktifkan",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/kpi-config/directions?id=${item.id}`, {
        method: "DELETE",
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal menghapus.");

      Swal.fire({
        icon: "success",
        title: "Dinonaktifkan",
        text: `Arah penilaian ${item.name} telah dinonaktifkan.`,
        timer: 1500,
        showConfirmButton: false,
      });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus.";
      Swal.fire({ icon: "error", title: "Gagal", text: msg });
    }
  };

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (filterActive === "ACTIVE" && !item.isActive) return false;
      if (filterActive === "INACTIVE" && item.isActive) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    });
  }, [data, filterActive, search]);

  const getDirectionBadge = (code: string) => {
    switch (code) {
      case "HIGHER_IS_BETTER":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <TrendingUp className="h-3 w-3" />
            Makin Tinggi Makin Baik
          </span>
        );
      case "LOWER_IS_BETTER":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <TrendingDown className="h-3 w-3" />
            Makin Rendah Makin Baik
          </span>
        );
      case "EXACT_TARGET":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            <Target className="h-3 w-3" />
            Tepat Target
          </span>
        );
      case "TARGET_RANGE":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
            <SlidersHorizontal className="h-3 w-3" />
            Rentang Target
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
            <Compass className="h-3 w-3" />
            Arah Standar
          </span>
        );
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Compact Summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <strong className="font-semibold text-slate-900">{data.length}</strong>
          <span>Total KPI Direction</span>
        </span>
        <span className="text-slate-300">·</span>
        <span className="inline-flex items-center gap-1">
          <strong className="font-semibold text-slate-900">
            {data.filter((d) => d.isActive).length}
          </strong>
          <span>Aktif</span>
        </span>
        <span className="text-slate-300">·</span>
        <span className="inline-flex items-center gap-1">
          <strong className="font-semibold text-slate-900">
            {data.filter((d) => !d.isActive).length}
          </strong>
          <span>Nonaktif</span>
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari arah atau kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden transition"
            />
          </div>

          {/* Status */}
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-hidden transition"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif Saja</option>
            <option value="INACTIVE">Nonaktif Saja</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            title="Segarkan data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-slate-500" : "text-slate-500"}`} />
            <span>Segarkan</span>
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tambah KPI Direction</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mb-2" />
            <p className="text-xs font-medium text-slate-600">Memuat konfigurasi KPI direction...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500 mb-2" />
            <p className="text-xs font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => fetchData()}
              className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Compass className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-700">Tidak ada KPI direction yang ditemukan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Coba sesuaikan kata kunci pencarian atau ubah filter status.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Arah Penilaian &amp; Kode</th>
                  <th className="py-2.5 px-3">Kategori Arah</th>
                  <th className="py-2.5 px-3">Rumus Kalkulasi Acuan</th>
                  <th className="py-2.5 px-3">Penjelasan &amp; Contoh</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Arah & Kode */}
                    <td className="py-2.5 px-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 uppercase">{item.code}</div>
                      </div>
                    </td>

                    {/* Kategori Badge */}
                    <td className="py-2.5 px-3">{getDirectionBadge(item.code)}</td>

                    {/* Rumus Acuan */}
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center font-mono text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {item.formulaHint || "-"}
                      </span>
                    </td>

                    {/* Penjelasan */}
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="text-slate-600 truncate" title={item.description || ""}>
                        {item.description || "-"}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                          Nonaktif
                        </span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {item.isActive && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="rounded-md border border-rose-200 bg-rose-50 p-1 text-rose-600 hover:bg-rose-100 transition"
                            title="Nonaktifkan"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah / Edit KPI Direction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingItem ? "Edit KPI Direction" : "Tambah KPI Direction"}
                </h3>
                <p className="text-xs text-slate-500">
                  Konfigurasi arah evaluasi target indikator untuk acuan Formula Engine.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kode Arah <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="misal: HIGHER_IS_BETTER"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Arah <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="misal: Higher is Better"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rumus Kalkulasi Acuan</label>
                <input
                  type="text"
                  placeholder="misal: (Actual / Target) * 100% atau (Target / Actual) * 100%"
                  value={formFormulaHint}
                  onChange={(e) => setFormFormulaHint(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi &amp; Contoh</label>
                <textarea
                  rows={3}
                  placeholder="Penjelasan kapan arah penilaian ini digunakan dan contoh indikatornya..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs"
                >
                  {isSubmitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Simpan Konfigurasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
