"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  AlertCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Hash,
  Percent,
  Coins,
  Calendar,
  ToggleLeft,
  Star,
  FileText,
  HelpCircle,
} from "lucide-react";
import type { KpiMeasurementType } from "@/db/schema";

interface Props {
  initialData?: KpiMeasurementType[];
}

const MEASUREMENT_PRESETS = [
  { code: "PERCENTAGE", name: "Percentage (Persentase)", defaultUnit: "%", isNumeric: true, formatPattern: "0.0%", description: "Nilai rasio atau tingkat ketercapaian dalam format persen (%)." },
  { code: "CURRENCY", name: "Currency (Mata Uang)", defaultUnit: "IDR", isNumeric: true, formatPattern: "#,##0", description: "Nilai moneter atau biaya finansial dalam satuan rupiah." },
  { code: "DAYS", name: "Days (Hari / Durasi)", defaultUnit: "Hari", isNumeric: true, formatPattern: "#,##0", description: "Durasi waktu penyelesaian tugas dalam satuan hari kalender/kerja." },
  { code: "COUNT", name: "Count (Jumlah / Frekuensi)", defaultUnit: "Item", isNumeric: true, formatPattern: "#,##0", description: "Jumlah item fisik, transaksi, atau kuantitas kejadian diskret." },
  { code: "NUMBER", name: "Number (Angka / Kuantitatif)", defaultUnit: "Angka", isNumeric: true, formatPattern: "#,##0.00", description: "Nilai kuantitatif umum berbentuk bilangan bulat atau desimal." },
  { code: "RATIO", name: "Ratio (Perbandingan)", defaultUnit: "Rasio", isNumeric: true, formatPattern: "0.00", description: "Rasio perbandingan dua variabel (pembilang dibagi penyebut)." },
  { code: "BOOLEAN", name: "Boolean (Ya / Tidak)", defaultUnit: "Status", isNumeric: false, formatPattern: "@", description: "Nilai biner ya/tidak untuk pemenuhan syarat mutlak." },
  { code: "RATING", name: "Rating (Skala Nilai)", defaultUnit: "Skor", isNumeric: true, formatPattern: "0", description: "Penilaian berbasis tingkatan mutu atau skala likert." },
  { code: "TEXT", name: "Text (Kualitatif Deskriptif)", defaultUnit: "-", isNumeric: false, formatPattern: "@", description: "Evaluasi berbasis uraian deskriptif kualitatif." },
];

const UNIT_PRESETS = ["%", "IDR", "Hari", "Item", "Angka", "Rasio", "Status", "Skor", "Dokumen", "Orang", "-"];

export function MeasurementTypeManager({ initialData = [] }: Props) {
  const [data, setData] = useState<KpiMeasurementType[]>(initialData);
  const [loading, setLoading] = useState<boolean>(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("ALL");
  const [filterNumeric, setFilterNumeric] = useState<string>("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<KpiMeasurementType | null>(null);
  const [formCode, setFormCode] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formFormatPattern, setFormFormatPattern] = useState<string>("");
  const [formDefaultUnit, setFormDefaultUnit] = useState<string>("");
  const [formIsNumeric, setFormIsNumeric] = useState<boolean>(true);
  const [formSortOrder, setFormSortOrder] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (filterActive !== "ALL") params.append("isActive", filterActive === "ACTIVE" ? "true" : "false");

      const res = await fetch(`/api/admin/kpi-config/measurement-types?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat tipe pengukuran.");
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
    setFormFormatPattern("#,##0.00");
    setFormDefaultUnit("");
    setFormIsNumeric(true);
    setFormSortOrder(data.length + 1);
    setIsModalOpen(true);
  };

  const openEditModal = (item: KpiMeasurementType) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormName(item.name);
    setFormDescription(item.description || "");
    setFormFormatPattern(item.formatPattern || "");
    setFormDefaultUnit(item.defaultUnit || "");
    setFormIsNumeric(item.isNumeric);
    setFormSortOrder(item.sortOrder);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      Swal.fire({ icon: "warning", title: "Validasi Gagal", text: "Kode dan Nama tipe pengukuran wajib diisi." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: editingItem?.id,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        description: formDescription.trim(),
        formatPattern: formFormatPattern.trim(),
        defaultUnit: formDefaultUnit.trim(),
        isNumeric: formIsNumeric,
        sortOrder: formSortOrder,
        isActive: true,
      };

      const res = await fetch("/api/admin/kpi-config/measurement-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal menyimpan tipe pengukuran.");

      Swal.fire({
        icon: "success",
        title: "Tersimpan",
        text: `Tipe pengukuran "${formName}" berhasil disimpan.`,
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

  const handleDelete = async (item: KpiMeasurementType) => {
    const result = await Swal.fire({
      title: "Nonaktifkan Tipe Pengukuran?",
      html: `Apakah Anda yakin ingin menonaktifkan tipe <b>${item.name}</b> (${item.code})?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Nonaktifkan",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/kpi-config/measurement-types?id=${item.id}`, {
        method: "DELETE",
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal menghapus.");

      Swal.fire({
        icon: "success",
        title: "Dinonaktifkan",
        text: `Tipe pengukuran ${item.name} telah dinonaktifkan.`,
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
      if (filterNumeric === "NUMERIC" && !item.isNumeric) return false;
      if (filterNumeric === "NON_NUMERIC" && item.isNumeric) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    });
  }, [data, filterActive, filterNumeric, search]);

  const parseMeasurementName = (name: string) => {
    const match = name.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return {
        primary: match[1].trim(),
        secondary: match[2].trim(),
      };
    }
    return {
      primary: name,
      secondary: null,
    };
  };

  const getTypeIcon = (code: string) => {
    switch (code) {
      case "PERCENTAGE":
        return <Percent className="h-4 w-4 text-emerald-600" />;
      case "CURRENCY":
        return <Coins className="h-4 w-4 text-amber-600" />;
      case "DAYS":
        return <Calendar className="h-4 w-4 text-sky-600" />;
      case "BOOLEAN":
        return <ToggleLeft className="h-4 w-4 text-indigo-600" />;
      case "RATING":
        return <Star className="h-4 w-4 text-purple-600" />;
      case "TEXT":
        return <FileText className="h-4 w-4 text-slate-600" />;
      default:
        return <Hash className="h-4 w-4 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Simple Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari tipe atau kode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden transition"
          />
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Tambah Measurement Type</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mb-2" />
            <p className="text-xs font-medium text-slate-600">Memuat konfigurasi measurement type...</p>
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
            <Layers className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-700">Tidak ada tipe pengukuran yang ditemukan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Coba sesuaikan kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3.5 w-64">Tipe Pengukuran</th>
                  <th className="py-2.5 px-3 w-28">Satuan</th>
                  <th className="py-2.5 px-3">Deskripsi</th>
                  <th className="py-2.5 px-3.5 text-right w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((item) => {
                  const parsed = parseMeasurementName(item.name);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Tipe & Kode */}
                      <td className="py-2.5 px-3.5">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                            <span>{parsed.primary}</span>
                            {parsed.secondary && (
                              <span className="text-[11px] font-normal text-slate-500">
                                • {parsed.secondary}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 uppercase mt-0.5">
                            {item.code}
                          </div>
                        </div>
                      </td>

                      {/* Satuan */}
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-mono font-medium text-slate-700 border border-slate-200/70">
                          {item.defaultUnit || "-"}
                        </span>
                      </td>

                      {/* Deskripsi */}
                      <td className="py-2.5 px-3">
                        <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                          {item.description || "-"}
                        </p>
                      </td>

                      {/* Aksi */}
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(item)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {item.isActive && (
                            <button
                              onClick={() => handleDelete(item)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah / Edit Measurement Type */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingItem ? "Edit Measurement Type" : "Tambah Measurement Type"}
                </h3>
                <p className="text-xs text-slate-500">
                  Konfigurasi tipe data input Actual untuk indikator penilaian KPI.
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
              {/* Dropdown Preset Cepat */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Preset Tipe Pengukuran
                </label>
                <select
                  value={MEASUREMENT_PRESETS.some((p) => p.code === formCode) ? formCode : formCode ? "CUSTOM" : ""}
                  onChange={(e) => {
                    const selected = e.target.value;
                    if (selected === "CUSTOM") return;
                    const found = MEASUREMENT_PRESETS.find((p) => p.code === selected);
                    if (found) {
                      setFormCode(found.code);
                      setFormName(found.name);
                      setFormDefaultUnit(found.defaultUnit);
                      setFormIsNumeric(found.isNumeric);
                      setFormFormatPattern(found.formatPattern);
                      setFormDescription(found.description);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                >
                  <option value="">-- Pilih dari Template Standar --</option>
                  {MEASUREMENT_PRESETS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} ({p.defaultUnit})
                    </option>
                  ))}
                  <option value="CUSTOM">Custom (Ketik Manual)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kode Tipe <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="misal: NUMBER, CURRENCY"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Tipe <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="misal: Number (Angka)"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Format Pola Tampilan</label>
                  <input
                    type="text"
                    placeholder="misal: #,##0.00 atau 0.0%"
                    value={formFormatPattern}
                    onChange={(e) => setFormFormatPattern(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Satuan Bawaan (Default Unit)</label>
                  <div className="flex gap-1.5">
                    <select
                      value={UNIT_PRESETS.includes(formDefaultUnit) ? formDefaultUnit : "CUSTOM"}
                      onChange={(e) => {
                        if (e.target.value !== "CUSTOM") {
                          setFormDefaultUnit(e.target.value);
                        }
                      }}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden shrink-0"
                    >
                      {UNIT_PRESETS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="CUSTOM">Lainnya...</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Satuan manual"
                      value={formDefaultUnit}
                      onChange={(e) => setFormDefaultUnit(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi &amp; Penggunaan</label>
                <textarea
                  rows={2}
                  placeholder="Penjelasan fungsi tipe pengukuran ini dalam evaluasi KPI..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsNumeric}
                    onChange={(e) => setFormIsNumeric(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    Nilai Numerik (Dapat dikalkulasi otomatis)
                  </span>
                </label>
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
