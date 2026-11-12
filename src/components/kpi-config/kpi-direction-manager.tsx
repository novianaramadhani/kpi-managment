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

const DIRECTION_PRESETS = [
  {
    code: "HIGHER_IS_BETTER",
    name: "Higher is Better (Makin Tinggi Makin Baik)",
    formulaHint: "Realisasi / Target (Makin Tinggi Makin Bagus)",
    description: "Semakin tinggi hasil aktual melampaui target, nilainya semakin bagus. Cocok untuk omzet, volume produksi, dan efisiensi.",
  },
  {
    code: "LOWER_IS_BETTER",
    name: "Lower is Better (Makin Rendah Makin Baik)",
    formulaHint: "Target / Realisasi (Makin Kecil/Cepat Makin Bagus)",
    description: "Semakin kecil angka aktual dari target, nilainya semakin bagus. Cocok untuk hari pengiriman (lead time), kerusakan barang, dan komplain.",
  },
  {
    code: "EXACT_TARGET",
    name: "Exact Target (Tepat Target)",
    formulaHint: "Wajib Pas Target (Nol Deviasi)",
    description: "Nilai harus tepat sama persis dengan target yang ditentukan. Jika pas dapat nilai penuh 100%, jika meleset mendapat nilai 0%.",
  },
  {
    code: "TARGET_RANGE",
    name: "Target Range (Rentang Target)",
    formulaHint: "Rentang Toleransi (Antara Batas Min & Max)",
    description: "Nilai dianggap tercapai 100% jika berada di dalam rentang batas minimum dan maksimum yang ditentukan.",
  },
  {
    code: "NOT_APPLICABLE",
    name: "Not Applicable (Kualitatif / Tanpa Rumus)",
    formulaHint: "Kriteria Bertingkat (Tanpa Rumus Hitungan)",
    description: "Untuk indikator kualitatif, status teks, atau checklist di mana nilai dihitung langsung dari kriteria skor yang dipilih.",
  },
];

const FORMULA_PRESETS = [
  {
    value: "Realisasi / Target (Makin Tinggi Makin Bagus)",
    label: "Realisasi ÷ Target (Makin Tinggi Makin Bagus)",
    example: "Contoh: Omzet, Produksi (Capai 120 dari target 100 = 120%)",
  },
  {
    value: "Target / Realisasi (Makin Kecil/Cepat Makin Bagus)",
    label: "Target ÷ Realisasi (Makin Kecil / Cepat Makin Bagus)",
    example: "Contoh: Lead Time, Kerusakan (Target 3 hari, selesai 2 hari = Lebih Cepat)",
  },
  {
    value: "Wajib Pas Target (Nol Deviasi)",
    label: "Wajib Pas Target (Harus Tepat Sama)",
    example: "Contoh: Target 100%. Pas = 100%, Kurang/Lebih = 0%",
  },
  {
    value: "Rentang Toleransi (Antara Batas Min & Max)",
    label: "Rentang Toleransi (Antara Min s/d Max)",
    example: "Contoh: Suhu 20°C - 25°C, Anggaran biaya ±5%",
  },
  {
    value: "Kriteria Bertingkat (Tanpa Rumus Hitungan)",
    label: "Kriteria Bertingkat (Penilaian Langsung / Skala)",
    example: "Contoh: Kedisiplinan, Kerapian, Checklist SOP (Skor 5, 15, 25)",
  },
];

export function formatFriendlyFormula(formula: string | null | undefined): string {
  if (!formula) return "-";
  if (formula.includes("Actual / Target") || formula.includes("Realisasi / Target") || formula.includes("Realisasi ÷ Target")) {
    return "Realisasi ÷ Target (Makin Tinggi Bagus)";
  }
  if (formula.includes("Target / Actual") || formula.includes("Target / Realisasi") || formula.includes("Target ÷ Realisasi")) {
    return "Target ÷ Realisasi (Makin Cepat/Kecil Bagus)";
  }
  if (formula.includes("Actual ==") || formula.includes("Pas Target") || formula.includes("Tepat Target")) {
    return "Wajib Pas Target (Nol Deviasi)";
  }
  if (formula.includes("Min <=") || formula.includes("Rentang")) {
    return "Rentang Toleransi (Min – Max)";
  }
  if (formula.includes("Kriteria") || formula.includes("Kualitatif")) {
    return "Kriteria Bertingkat (Tanpa Rumus)";
  }
  return formula;
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
  const [isCustomFormula, setIsCustomFormula] = useState<boolean>(false);
  const [customFormulaInput, setCustomFormulaInput] = useState<string>("");

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
    setFormFormulaHint(FORMULA_PRESETS[0].value);
    setFormSortOrder(data.length + 1);
    setIsCustomFormula(false);
    setCustomFormulaInput("");
    setIsModalOpen(true);
  };

  const openEditModal = (item: KpiDirection) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormName(item.name);
    setFormDescription(item.description || "");
    const rawHint = item.formulaHint || "";
    const matchedPreset = FORMULA_PRESETS.find(
      (f) =>
        f.value === rawHint ||
        (rawHint.includes("Actual / Target") && f.value.includes("Realisasi / Target")) ||
        (rawHint.includes("Target / Actual") && f.value.includes("Target / Realisasi")) ||
        (rawHint.includes("Actual ==") && f.value.includes("Pas Target")) ||
        (rawHint.includes("Min <=") && f.value.includes("Rentang"))
    );
    if (matchedPreset) {
      setFormFormulaHint(matchedPreset.value);
      setIsCustomFormula(false);
      setCustomFormulaInput("");
    } else if (rawHint) {
      setFormFormulaHint(rawHint);
      setIsCustomFormula(true);
      setCustomFormulaInput(rawHint);
    } else {
      setFormFormulaHint(FORMULA_PRESETS[0].value);
      setIsCustomFormula(false);
      setCustomFormulaInput("");
    }
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
        return {
          icon: TrendingUp,
          theme: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
        };
      case "LOWER_IS_BETTER":
        return {
          icon: TrendingDown,
          theme: "bg-amber-50 text-amber-700 border border-amber-200/60",
        };
      case "EXACT_TARGET":
        return {
          icon: Target,
          theme: "bg-sky-50 text-sky-700 border border-sky-200/60",
        };
      case "TARGET_RANGE":
        return {
          icon: SlidersHorizontal,
          theme: "bg-purple-50 text-purple-700 border border-purple-200/60",
        };
      default:
        return {
          icon: Compass,
          theme: "bg-slate-100 text-slate-700 border border-slate-200/60",
        };
    }
  };

  const parseDirectionName = (name: string) => {
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

  return (
    <div className="space-y-3.5">
      {/* Simple Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari arah atau kode..."
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
          <span>Tambah KPI Direction</span>
        </button>
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
              Coba sesuaikan kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3.5 w-64">Arah Penilaian</th>
                  <th className="py-2.5 px-3 w-48">Rumus Acuan</th>
                  <th className="py-2.5 px-3">Penjelasan &amp; Contoh</th>
                  <th className="py-2.5 px-3.5 text-right w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((item) => {
                  const badgeInfo = getDirectionBadge(item.code);
                  const Icon = badgeInfo.icon;
                  const parsed = parseDirectionName(item.name);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Arah & Kode */}
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

                      {/* Rumus Acuan */}
                      <td className="py-2.5 px-3">
                        <span className="inline-block rounded-md bg-slate-50 px-2 py-1 font-medium text-[11px] text-slate-700 border border-slate-200/70">
                          {formatFriendlyFormula(item.formulaHint)}
                        </span>
                      </td>

                      {/* Penjelasan */}
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
              {/* Dropdown Preset Cepat */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Preset Arah Evaluasi
                </label>
                <select
                  value={DIRECTION_PRESETS.some((p) => p.code === formCode) ? formCode : formCode ? "CUSTOM" : ""}
                  onChange={(e) => {
                    const selected = e.target.value;
                    if (selected === "CUSTOM") return;
                    const found = DIRECTION_PRESETS.find((p) => p.code === selected);
                    if (found) {
                      setFormCode(found.code);
                      setFormName(found.name);
                      setFormFormulaHint(found.formulaHint);
                      setFormDescription(found.description);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                >
                  <option value="">-- Pilih dari Template Standar --</option>
                  {DIRECTION_PRESETS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom (Ketik Manual)</option>
                </select>
              </div>

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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:border-slate-900 focus:outline-hidden"
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Cara Perhitungan (Rumus Acuan)</label>
                  {!isCustomFormula ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomFormula(true);
                        setCustomFormulaInput(formFormulaHint || "");
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Tambah Rumus Custom</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomFormula(false);
                        if (!FORMULA_PRESETS.some((f) => f.value === formFormulaHint)) {
                          setFormFormulaHint(FORMULA_PRESETS[0].value);
                        }
                      }}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline transition"
                    >
                      Pilih dari Template Standar
                    </button>
                  )}
                </div>

                {!isCustomFormula ? (
                  <div className="space-y-1.5">
                    {/* Dropdown Bersih Tanpa Input Manual */}
                    <select
                      value={formFormulaHint}
                      onChange={(e) => setFormFormulaHint(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                    >
                      {FORMULA_PRESETS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    {/* Panduan cara baca */}
                    {(() => {
                      const activePreset = FORMULA_PRESETS.find((f) => f.value === formFormulaHint);
                      if (activePreset) {
                        return (
                          <div className="rounded-lg bg-sky-50 border border-sky-200/70 p-2 text-[11px] text-sky-900 flex items-start gap-1.5">
                            <span className="shrink-0 font-semibold">Cara membaca:</span>
                            <span>{activePreset.example}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Input Khusus Muncul Hanya Saat Tombol Tambah Rumus Custom Diklik */}
                    <input
                      type="text"
                      placeholder="Ketik keterangan rumus acuan custom..."
                      value={customFormulaInput}
                      onChange={(e) => {
                        setCustomFormulaInput(e.target.value);
                        setFormFormulaHint(e.target.value);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400">
                      Ketikkan keterangan petunjuk cara hitung rumus khusus yang diinginkan.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi &amp; Contoh</label>
                <textarea
                  rows={3}
                  placeholder="Penjelasan kapan arah penilaian ini digunakan dan contoh indikatornya..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
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
